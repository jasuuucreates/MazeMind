// Game rules: player, gems, exit, lives, and the hunters' thinking.
// Every time a hunter takes a step it:
//   1. measures how far the player really is (A* distance, its "sensor"),
//   2. asks the fuzzy controller how aggressive to be (distance + energy -> aggression),
//   3. turns aggression into a mode (CHASE / AMBUSH / PATROL / REST) and picks a target,
//   4. plans a route to the target with the selected search algorithm and takes one step.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});
  if (typeof require === 'function') {
    if (!MM.Grid) require('./grid.js');
    if (!MM.search) require('./search.js');
    if (!MM.mazegen) require('./mazegen.js');
    if (!MM.fuzzy) require('./fuzzy.js');
  }

  const STEP_MS = { CHASE: 220, AMBUSH: 250, PATROL: 320, REST: 320 }; // time per hunter step
  const ENERGY_COST = { CHASE: 2.4, AMBUSH: 1.3, PATROL: -0.6, REST: -7 }; // negative = recovers
  const HUNTER_COLORS = ['#f87171', '#fb923c', '#e879f9', '#38bdf8'];
  const GRACE_MS = 1500; // hunters freeze for a moment after catching the player
  const SENSOR_MAX = 40;

  // shortest-path distance from `from` to every open cell (-1 = unreachable)
  function distances(grid, from) {
    const dist = new Int32Array(grid.cells.length).fill(-1);
    const queue = [from];
    dist[from] = 0;
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      for (const n of grid.neighbors(c)) {
        if (dist[n] < 0) {
          dist[n] = dist[c] + 1;
          queue.push(n);
        }
      }
    }
    return dist;
  }

  const manhattan = (grid, a, b) => {
    const p = grid.xy(a);
    const q = grid.xy(b);
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  };

  // pick `count` cells from `candidates`, each as far as possible from the ones already taken
  function spreadPick(grid, candidates, count, taken, rng) {
    const picked = [];
    const pool = candidates.slice();
    while (picked.length < count && pool.length) {
      let best = -1;
      let bestScore = -1;
      pool.forEach((c, k) => {
        const others = taken.concat(picked);
        const score = others.length ? Math.min(...others.map((o) => manhattan(grid, c, o))) : 0;
        const jitter = rng() * 0.5; // breaks ties randomly
        if (score + jitter > bestScore) {
          bestScore = score + jitter;
          best = k;
        }
      });
      picked.push(pool[best]);
      pool.splice(best, 1);
    }
    return picked;
  }

  // put the exit, three gems and the hunters into a maze; rooms = cells at odd x and odd y
  function placeObjects(grid, start, { hunters = 2, rng = Math.random, gems = 3, exit: fixedExit } = {}) {
    const dist = distances(grid, start);
    const rooms = [];
    for (let i = 0; i < grid.cells.length; i++) {
      const { x, y } = grid.xy(i);
      if (grid.cells[i] === 0 && dist[i] > 0 && x % 2 === 1 && y % 2 === 1) rooms.push(i);
    }
    const maxD = Math.max(...rooms.map((r) => dist[r]));
    const exit = fixedExit !== undefined ? fixedExit : rooms.reduce((a, b) => (dist[b] > dist[a] ? b : a));
    const deadEnd = (i) => grid.neighbors(i).length === 1;
    const far = (f) => rooms.filter((r) => r !== exit && dist[r] >= f * maxD);
    let gemPool = far(0.3).filter(deadEnd);
    if (gemPool.length < gems) gemPool = far(0.3);
    const gemCells = spreadPick(grid, gemPool, gems, [start, exit], rng);
    const hunterPool = far(0.5).filter((r) => !gemCells.includes(r));
    const hunterSpawns = spreadPick(grid, hunterPool, hunters, [start], rng);
    return { grid, start, exit, gems: gemCells, hunterSpawns };
  }

  function createLevel({ cols = 14, rows = 9, hunters = 2, seed = 1, braidChance = 0.45 } = {}) {
    const rng = MM.makeRng(seed);
    const grid = MM.mazegen.generateMaze(cols, rows, rng);
    MM.mazegen.braid(grid, braidChance, rng);
    return placeObjects(grid, MM.mazegen.roomIndex(grid, 0, 0), { hunters, rng });
  }

  class Game {
    constructor(level, { lives = 3, algorithm = 'astar', seed = 1 } = {}) {
      this.grid = level.grid;
      this.start = level.start;
      this.exit = level.exit;
      this.gems = new Set(level.gems);
      this.totalGems = level.gems.length;
      this.player = { pos: level.start, dir: { x: 0, y: 0 } };
      this.lives = lives;
      this.status = 'playing';
      this.algorithm = algorithm;
      this.rng = MM.makeRng(seed);
      this.elapsed = 0;
      this.grace = 0;
      this.events = [];
      this.patrolPoints = [];
      for (let i = 0; i < this.grid.cells.length; i++) if (this.grid.cells[i] === 0) this.patrolPoints.push(i);
      this.hunters = level.hunterSpawns.map((spawn, id) => ({
        id,
        spawn,
        pos: spawn,
        energy: 100,
        mode: 'PATROL',
        path: [spawn],
        target: spawn,
        waypoint: -1,
        timer: 0,
        color: HUNTER_COLORS[id % HUNTER_COLORS.length],
        distance: Infinity,
        fuzzy: null,
        search: null,
      }));
      this.hunters.forEach((h) => this.think(h));
    }

    get score() {
      const gems = (this.totalGems - this.gems.size) * 100;
      const bonus = this.status === 'won' ? Math.max(100, 1000 - Math.floor(this.elapsed / 100)) : 0;
      return gems + bonus;
    }

    movePlayer(dx, dy) {
      if (this.status !== 'playing') return false;
      const { x, y } = this.grid.xy(this.player.pos);
      if (this.grid.isWall(x + dx, y + dy)) return false;
      this.player.pos = this.grid.index(x + dx, y + dy);
      this.player.dir = { x: dx, y: dy };
      if (this.gems.delete(this.player.pos)) this.events.push({ type: 'gem', at: this.elapsed });
      if (this.player.pos === this.exit && this.gems.size === 0) {
        this.status = 'won';
        this.events.push({ type: 'won', at: this.elapsed });
      }
      this.checkCaught();
      return true;
    }

    // a few cells ahead of the player in the direction they are moving
    ambushTarget(h) {
      const { x, y } = this.grid.xy(this.player.pos);
      const { x: dx, y: dy } = this.player.dir;
      if (!dx && !dy) return this.player.pos;
      let cx = x;
      let cy = y;
      for (let k = 0; k < 4 && !this.grid.isWall(cx + dx, cy + dy); k++) {
        cx += dx;
        cy += dy;
      }
      const t = this.grid.index(cx, cy);
      return t === h.pos ? this.player.pos : t;
    }

    patrolTarget(h) {
      if (h.waypoint < 0 || h.waypoint === h.pos) {
        h.waypoint = this.patrolPoints[Math.floor(this.rng() * this.patrolPoints.length)];
      }
      return h.waypoint;
    }

    think(h) {
      const sensor = MM.search.astar(this.grid, h.pos, this.player.pos);
      h.distance = sensor.found ? sensor.cost : SENSOR_MAX;
      const out = MM.fuzzy.hunterBrain().evaluate({ distance: Math.min(h.distance, SENSOR_MAX), energy: h.energy });
      h.fuzzy = { aggression: out.crisp, degrees: out.degrees, rules: out.rules };
      h.mode = MM.fuzzy.decideMode(out.crisp, h.energy);
      if (h.mode === 'CHASE') h.target = this.player.pos;
      else if (h.mode === 'AMBUSH') h.target = this.ambushTarget(h);
      else if (h.mode === 'PATROL') h.target = this.patrolTarget(h);
      else h.target = h.pos;
      const plan = MM.search.run(this.algorithm, this.grid, h.pos, h.target);
      h.path = plan.found ? plan.path : [h.pos];
      h.search = { algorithm: plan.algorithm, expanded: plan.expanded, cost: plan.cost, closed: plan.trace.map((t) => t.node) };
    }

    stepHunter(h) {
      this.think(h);
      if (h.mode !== 'REST' && h.path.length > 1) h.pos = h.path[1];
      h.energy = Math.min(100, Math.max(0, h.energy - ENERGY_COST[h.mode]));
    }

    checkCaught() {
      if (this.status !== 'playing' || !this.hunters.some((h) => h.pos === this.player.pos)) return false;
      this.lives -= 1;
      this.events.push({ type: 'caught', at: this.elapsed });
      if (this.lives <= 0) {
        this.status = 'lost';
        return true;
      }
      this.player.pos = this.start;
      this.player.dir = { x: 0, y: 0 };
      this.hunters.forEach((h) => {
        h.pos = h.spawn;
        h.timer = 0;
        h.waypoint = -1;
        this.think(h);
      });
      this.grace = GRACE_MS;
      return true;
    }

    update(dt) {
      if (this.status !== 'playing') return;
      this.elapsed += dt;
      let remaining = dt;
      while (remaining > 0 && this.status === 'playing') {
        const slice = Math.min(remaining, 40);
        remaining -= slice;
        if (this.grace > 0) {
          this.grace -= slice;
          continue;
        }
        for (const h of this.hunters) {
          h.timer += slice;
          if (h.timer >= STEP_MS[h.mode]) {
            h.timer -= STEP_MS[h.mode];
            this.stepHunter(h);
            if (this.checkCaught()) break;
          }
        }
      }
    }
  }

  const api = { Game, createLevel, placeObjects, distances, STEP_MS, ENERGY_COST };
  MM.game = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
