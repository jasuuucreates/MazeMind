// Genetic algorithm that evolves mazes.
// Chromosome: one bit per possible passage between two neighbouring rooms (1 = open, 0 = wall).
// Fitness uses A* to measure the escape route, plus the number of dead ends and of escape loops.
// Each generation: evaluate -> keep the elite -> tournament selection -> uniform crossover -> bit-flip mutation.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});
  if (typeof require === 'function') {
    if (!MM.Grid) require('./grid.js');
    if (!MM.search) require('./search.js');
    if (!MM.mazegen) require('./mazegen.js');
  }

  const DEFAULT_WEIGHTS = { path: 1, deadEnds: 0.6, loops: 0.6 };

  function genomeLength(cols, rows) {
    return (cols - 1) * rows + cols * (rows - 1);
  }

  // grid cell of gene k: first all horizontal passages row by row, then all vertical ones
  function passageCell(k, cols, rows) {
    const h = (cols - 1) * rows;
    if (k < h) {
      const r = Math.floor(k / (cols - 1));
      const c = k % (cols - 1);
      return [2 * c + 2, 2 * r + 1];
    }
    const v = k - h;
    const r = Math.floor(v / cols);
    const c = v % cols;
    return [2 * c + 1, 2 * r + 2];
  }

  function decode(genome, cols, rows) {
    const grid = new MM.Grid(2 * cols + 1, 2 * rows + 1, 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid.setWall(2 * c + 1, 2 * r + 1, false);
    for (let k = 0; k < genome.length; k++) {
      if (genome[k]) {
        const [x, y] = passageCell(k, cols, rows);
        grid.setWall(x, y, false);
      }
    }
    return grid;
  }

  function encode(grid, cols, rows) {
    const genome = new Uint8Array(genomeLength(cols, rows));
    for (let k = 0; k < genome.length; k++) {
      const [x, y] = passageCell(k, cols, rows);
      genome[k] = grid.isWall(x, y) ? 0 : 1;
    }
    return genome;
  }

  function evaluate(genome, cols, rows, weights = DEFAULT_WEIGHTS) {
    const grid = decode(genome, cols, rows);
    const rooms = cols * rows;
    const start = grid.index(1, 1);
    const exit = grid.index(2 * cols - 1, 2 * rows - 1);

    // flood fill from the start: which rooms can be reached at all?
    const seen = new Uint8Array(grid.cells.length);
    const stack = [start];
    seen[start] = 1;
    let reachable = 0;
    let deadEnds = 0;
    let passages = 0;
    while (stack.length) {
      const cell = stack.pop();
      const { x, y } = grid.xy(cell);
      const ns = grid.neighbors(cell);
      if (x % 2 === 1 && y % 2 === 1) {
        reachable++;
        if (ns.length === 1) deadEnds++;
      } else passages++;
      for (const n of ns) {
        if (!seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const loops = passages - reachable + 1; // independent cycles of the room graph
    const reach = reachable / rooms;

    const route = MM.search.astar(grid, start, exit);
    if (!route.found) {
      return { fitness: 0.25 * reach, solvable: false, pathLength: 0, deadEnds, loops, reachable, rooms };
    }

    const target = Math.max(2, Math.round(rooms * 0.08)); // a few loops give the player escape routes
    const pathScore = Math.min(1, route.cost / rooms);
    const deadScore = Math.min(1, deadEnds / (rooms * 0.25));
    const loopScore = loops <= target ? loops / target : Math.max(0, 1 - (loops - target) / target);
    const total = weights.path + weights.deadEnds + weights.loops || 1;
    const quality = (weights.path * pathScore + weights.deadEnds * deadScore + weights.loops * loopScore) / total;
    return { fitness: 0.25 + reach * reach * quality, solvable: true, pathLength: route.cost, deadEnds, loops, reachable, rooms, route: route.path };
  }

  function mutate(genome, rate, rng) {
    for (let i = 0; i < genome.length; i++) if (rng() < rate) genome[i] ^= 1;
    return genome;
  }

  function crossover(a, b, rng) {
    const child = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) child[i] = rng() < 0.5 ? a[i] : b[i];
    return child;
  }

  class GeneticAlgorithm {
    constructor({ cols = 14, rows = 9, populationSize = 60, mutationRate = 0.02, crossoverRate = 0.9, elitism = 2, tournamentSize = 3, weights = DEFAULT_WEIGHTS, seed = 1, seedWithMazes = true } = {}) {
      Object.assign(this, { cols, rows, populationSize, mutationRate, crossoverRate, elitism, tournamentSize, weights });
      this.rng = MM.makeRng(seed);
      this.generation = 0;
      this.history = [];
      const n = genomeLength(cols, rows);
      this.population = [];
      for (let i = 0; i < populationSize; i++) {
        if (seedWithMazes && i % 2 === 0) {
          // half the first generation are ordinary generated mazes, the other half random wiring
          const g = MM.mazegen.generateMaze(cols, rows, this.rng);
          MM.mazegen.braid(g, this.rng() * 0.3, this.rng);
          this.population.push(encode(g, cols, rows));
        } else {
          this.population.push(Uint8Array.from({ length: n }, () => (this.rng() < 0.55 ? 1 : 0)));
        }
      }
      this.scored = null;
    }

    score() {
      this.scored = this.population
        .map((genome) => ({ genome, stats: evaluate(genome, this.cols, this.rows, this.weights) }))
        .sort((a, b) => b.stats.fitness - a.stats.fitness);
      return this.scored;
    }

    tournament() {
      let best = null;
      for (let k = 0; k < this.tournamentSize; k++) {
        const pick = this.scored[Math.floor(this.rng() * this.scored.length)];
        if (!best || pick.stats.fitness > best.stats.fitness) best = pick;
      }
      return best.genome;
    }

    step() {
      const scored = this.score();
      const fits = scored.map((s) => s.stats.fitness);
      const record = {
        generation: this.generation,
        best: fits[0],
        average: fits.reduce((a, b) => a + b, 0) / fits.length,
        worst: fits[fits.length - 1],
        solvable: scored.filter((s) => s.stats.solvable).length,
        bestStats: scored[0].stats,
      };
      this.history.push(record);
      const next = scored.slice(0, this.elitism).map((s) => s.genome.slice());
      while (next.length < this.populationSize) {
        const a = this.tournament();
        const child = this.rng() < this.crossoverRate ? crossover(a, this.tournament(), this.rng) : a.slice();
        next.push(mutate(child, this.mutationRate, this.rng));
      }
      this.population = next;
      this.generation++;
      return record;
    }

    run(generations) {
      for (let i = 0; i < generations; i++) this.step();
      return this.history;
    }

    // best maze found so far (the elite of the last scored generation)
    best() {
      if (!this.scored) this.score();
      const top = this.scored[0];
      return { genome: top.genome, stats: top.stats, grid: decode(top.genome, this.cols, this.rows) };
    }
  }

  const api = { genomeLength, decode, encode, evaluate, mutate, crossover, GeneticAlgorithm, DEFAULT_WEIGHTS };
  MM.genetic = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
