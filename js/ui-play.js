// Play screen: keyboard control, the game loop, drawing, and the live "hunter brain" panel.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const $ = (id) => document.getElementById(id);

  const LEVELS = [
    { name: '1 - Warm-up', cols: 12, rows: 8, hunters: 1, braid: 0.5 },
    { name: '2 - Two hunters', cols: 14, rows: 9, hunters: 2, braid: 0.45 },
    { name: '3 - The labyrinth', cols: 17, rows: 11, hunters: 3, braid: 0.4 },
    { name: '4 - Hunting party', cols: 19, rows: 12, hunters: 4, braid: 0.5 },
  ];
  const DIR_OF = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const BUFFER_MS = 300; // a turn pressed slightly before a junction is remembered this long
  const REPEAT_MS = 125;

  const state = {
    game: null,
    level: null,
    levelName: '',
    cell: 20,
    background: null,
    paused: false,
    last: 0,
    keys: [], // held directions, most recent last
    buffer: null, // { dir, until }: last pressed direction, tried first
    holdTimer: 0,
    lastMove: -1e9,
    vis: {}, // sliding positions of the player and hunters
    panelTimer: 0,
    raf: 0,
  };

  function newGame(level, name) {
    const cfg = LEVELS[Number($('play-level').value)];
    state.level = level || MM.game.createLevel({ cols: cfg.cols, rows: cfg.rows, hunters: cfg.hunters, braidChance: cfg.braid, seed: (Math.random() * 1e9) >>> 0 });
    state.levelName = name || cfg.name;
    state.game = new MM.game.Game(state.level, { algorithm: $('play-algo').value, speed: Number($('play-diff').value), seed: (Math.random() * 1e9) >>> 0 });
    state.paused = false;
    state.newBest = null;
    state.heard = 0; // how many game events already played a sound
    state.vis = {};
    state.buffer = null;
    resize();
  }

  // the game moves in whole cells; on screen each sprite slides from its old cell to the new one
  function gridPoint(v, now) {
    const t = Math.min(1, Math.max(0, (now - v.start) / v.dur));
    return [v.fx + (v.tx - v.fx) * t, v.fy + (v.ty - v.fy) * t];
  }

  function glide(key, idx, dur, now) {
    const w = state.game.grid.width;
    const gx = (idx % w) + 0.5;
    const gy = Math.floor(idx / w) + 0.5;
    let v = state.vis[key];
    if (!v) v = state.vis[key] = { idx, fx: gx, fy: gy, tx: gx, ty: gy, start: now, dur };
    if (v.idx !== idx) {
      const [cx, cy] = gridPoint(v, now);
      const slide = Math.abs(cx - gx) + Math.abs(cy - gy) <= 1.6; // a respawn is a big jump: snap instead
      Object.assign(v, { idx, fx: slide ? cx : gx, fy: slide ? cy : gy, tx: gx, ty: gy, start: now, dur });
    }
    const [x, y] = gridPoint(v, now);
    return [x * state.cell, y * state.cell];
  }

  // newest direction first; if that way is a wall, keep going the way of an older held key
  function tryMove(now) {
    const g = state.game;
    const order = [];
    if (state.buffer && state.buffer.until > now) order.push(state.buffer.dir);
    for (let k = state.keys.length - 1; k >= 0; k--) order.push(state.keys[k]);
    for (const dir of order) {
      if (g.movePlayer(...VEC[dir])) {
        if (state.buffer && state.buffer.dir === dir) state.buffer = null;
        state.lastMove = now;
        return true;
      }
    }
    return false;
  }

  function resize() {
    if (!state.game) return;
    const stage = $('play-stage');
    const maxW = Math.max(300, stage.clientWidth - 28);
    const top = stage.getBoundingClientRect().top + root.scrollY;
    const maxH = Math.max(280, Math.min(720, root.innerHeight - top - 64));
    state.cell = MM.render.fitCanvas($('play-canvas'), state.game.grid, maxW, maxH);
    // the walls never change during a level, so draw them once into an off-screen canvas
    const bg = document.createElement('canvas');
    const dpr = root.devicePixelRatio || 1;
    bg.width = $('play-canvas').width;
    bg.height = $('play-canvas').height;
    const bctx = bg.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    MM.render.drawGrid(bctx, state.game.grid, state.cell);
    state.background = bg;
  }

  const C = MM.render.COLORS;
  const font = (weight, size) => `${weight} ${size}px ${MM.render.FONT}`;

  // gem: outlined diamond that gently rises and falls
  function drawGem(ctx, cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#5c5c5c';
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.75, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.75, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // hunter: a red sentinel with one eye that looks where it is about to step
  function drawHunter(ctx, g, cell, h, k, cx, cy) {
    const s = cell * 0.78;
    ctx.save();
    ctx.fillStyle = C.hunter;
    ctx.globalAlpha = h.mode === 'REST' ? 0.55 : 1;
    ctx.beginPath();
    ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.22);
    ctx.fill();
    ctx.globalAlpha = 1;
    const next = h.path.length > 1 ? h.path[1] : h.pos;
    const [ox, oy] = MM.render.center(g.grid, cell, h.pos);
    const [nx, ny] = MM.render.center(g.grid, cell, next);
    const dx = Math.sign(nx - ox);
    const dy = Math.sign(ny - oy);
    const ex = cx + dx * s * 0.14;
    const ey = cy + dy * s * 0.14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0b0b';
    ctx.beginPath();
    ctx.arc(ex + dx * s * 0.07, ey + dy * s * 0.07, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // number tag so each sprite matches its row in the brain panel
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, Math.max(9, Math.floor(cell * 0.42)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(h.mode === 'REST' ? 'z' : String(k + 1), cx + s * 0.5, cy - s * 0.5);
    ctx.restore();
  }

  // dashed planned route, starting from where the sprite is drawn right now
  function drawRoute(ctx, cell, from, path) {
    const g = state.game;
    ctx.save();
    ctx.strokeStyle = 'rgba(229, 72, 77, 0.75)';
    ctx.lineWidth = Math.max(1.5, cell * 0.1);
    ctx.setLineDash([cell * 0.28, cell * 0.24]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    for (const i of path) ctx.lineTo(...MM.render.center(g.grid, cell, i));
    ctx.stroke();
    ctx.restore();
  }

  function draw(t) {
    const g = state.game;
    const cell = state.cell;
    const canvas = $('play-canvas');
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(state.background, 0, 0);
    ctx.restore();

    const sprites = g.hunters.map((h) => glide('h' + h.id, h.pos, g.stepTime(h), t));
    if ($('play-thinking').checked) {
      g.hunters.forEach((h, k) => {
        if (!h.search) return;
        MM.render.fillCells(ctx, g.grid, cell, h.search.closed, 'rgba(229, 72, 77, 0.10)', 0);
        drawRoute(ctx, cell, sprites[k], h.path);
        if (h.mode === 'AMBUSH') {
          const [tx, ty] = MM.render.center(g.grid, cell, h.target);
          ctx.strokeStyle = C.hunter;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(tx - cell * 0.42, ty - cell * 0.42, cell * 0.84, cell * 0.84);
          ctx.setLineDash([]);
        }
      });
    }

    // exit: dashed grey square while locked, solid white once every gem is collected
    const open = g.gems.size === 0;
    const [ex, ey] = MM.render.center(g.grid, cell, g.exit);
    const es = cell * 0.78;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, cell * 0.1);
    if (open) {
      ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.12 * Math.sin(t / 260)})`;
      ctx.fillRect(ex - es / 2, ey - es / 2, es, es);
      ctx.strokeStyle = '#ffffff';
    } else {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#6b6b6b';
    }
    ctx.strokeRect(ex - es / 2, ey - es / 2, es, es);
    ctx.restore();
    if (!open) MM.render.drawLabel(ctx, g.grid, cell, g.exit, String(g.gems.size), '#8c8c8c');

    for (const gem of g.gems) {
      const [gx, gy] = MM.render.center(g.grid, cell, gem);
      drawGem(ctx, gx, gy + Math.sin(t / 300 + gem) * cell * 0.06, cell * 0.3);
    }

    const [px, py] = glide('player', g.player.pos, REPEAT_MS, t);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.34, 0, Math.PI * 2);
    ctx.fill();
    g.hunters.forEach((h, k) => drawHunter(ctx, g, cell, h, k, sprites[k][0], sprites[k][1]));

    const lastCaught = [...g.events].reverse().find((e) => e.type === 'caught');
    if (lastCaught && g.elapsed - lastCaught.at < 500) {
      ctx.fillStyle = `rgba(229, 72, 77, ${0.28 * (1 - (g.elapsed - lastCaught.at) / 500)})`;
      ctx.fillRect(0, 0, g.grid.width * cell, g.grid.height * cell);
    }
    if (g.status !== 'playing' || state.paused || g.grace > 0) banner(ctx, g, cell);
  }

  function banner(ctx, g, cell) {
    const w = g.grid.width * cell;
    const h = g.grid.height * cell;
    let title;
    let sub;
    if (g.status === 'won') {
      title = 'You escaped';
      sub = `${state.newBest ? 'New best! ' : ''}Score ${g.score}. N for the next level, R to replay this maze.`;
    } else if (g.status === 'lost') {
      title = 'Caught';
      sub = 'Out of lives. R to try this maze again.';
    } else if (state.paused) {
      title = 'Paused';
      sub = 'P to continue.';
    } else {
      title = 'Caught';
      sub = `${g.lives} ${g.lives === 1 ? 'life' : 'lives'} left. Back to the start.`;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 10, 0.86)';
    ctx.fillRect(0, h / 2 - 54, w, 108);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h / 2 - 54, w, 1);
    ctx.fillRect(0, h / 2 + 53, w, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = g.status === 'won' || state.paused ? '#ffffff' : C.hunter;
    ctx.font = font(700, 34);
    ctx.fillText(title, w / 2, h / 2 - 2);
    ctx.fillStyle = '#a1a1a1';
    ctx.font = font(400, 16);
    ctx.fillText(sub, w / 2, h / 2 + 28);
    ctx.restore();
  }

  // the score bar and the brain panel are built once per game and then only their numbers change,
  // so nothing flickers and the bars can slide
  function buildPanels() {
    $('play-hud').innerHTML = ['Level', 'Lives', 'Gems', 'Time', 'Score'].map((k) => `<div><b data-hud="${k}"></b><span data-hud-label="${k}">${k}</span></div>`).join('');
    const meter = (key, label, dim) => `<div class="meter"><span>${label}</span><div class="track${dim ? ' dim' : ''}"><i data-k="${key}"></i></div><em data-v="${key}"></em></div>`;
    $('play-brain').innerHTML = state.game.hunters
      .map((h, k) => `<div class="hunter" data-h="${k}">
          <div class="hrow"><span class="tag">${k + 1}</span><b>Hunter ${k + 1}</b><span class="mode" data-mode></span></div>
          ${meter('energy', 'energy')}
          ${meter('aggr', 'aggression')}
          <div class="fz">
            <div><small data-dist></small>${meter('NEAR', 'near', 1)}${meter('MEDIUM', 'medium', 1)}${meter('FAR', 'far', 1)}</div>
            <div><small data-en></small>${meter('LOW', 'low', 1)}${meter('E_MEDIUM', 'medium', 1)}${meter('HIGH', 'high', 1)}</div>
          </div>
          <div class="rule" data-rule></div>
          <div class="hint" data-route></div>
        </div>`)
      .join('');
    state.panelGame = state.game;
  }

  // best score per level and difficulty, kept in this browser only
  const BEST_KEY = 'mazemind-best';
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function bestKey() {
    return `${state.levelName} | ${$('play-diff').selectedOptions[0].text}`;
  }

  // returns true when this win beats the saved best
  function recordBest(g) {
    const all = loadBest();
    const old = all[bestKey()];
    if (old && old.score >= g.score) return false;
    all[bestKey()] = { score: g.score, time: Math.round(g.elapsed / 1000) };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch (e) {
      // storage blocked (private window): the best score just isn't remembered
    }
    return true;
  }

  // sound on/off, remembered between visits
  function setMuted(muted) {
    MM.sound.muted = muted;
    $('play-mute').textContent = muted ? 'Sound off' : 'Sound on';
    $('play-mute').setAttribute('aria-pressed', String(muted));
    try {
      localStorage.setItem('mazemind-muted', muted ? '1' : '0');
    } catch (e) {
      // storage blocked: the setting lasts until the page is closed
    }
  }

  function hud() {
    const g = state.game;
    if (state.panelGame !== g) buildPanels();
    const secs = Math.floor(g.elapsed / 1000);
    const values = {
      Level: state.levelName,
      Lives: String(Math.max(0, g.lives)),
      Gems: `${g.totalGems - g.gems.size} / ${g.totalGems}`,
      Time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      Score: String(g.score),
    };
    const best = loadBest()[bestKey()];
    const scoreLabel = best ? `Score, best ${best.score} in ${best.time}s` : 'Score';
    const labelEl = document.querySelector('[data-hud-label="Score"]');
    if (labelEl && labelEl.textContent !== scoreLabel) labelEl.textContent = scoreLabel;
    for (const [k, v] of Object.entries(values)) {
      const el = document.querySelector(`[data-hud="${k}"]`);
      if (el.textContent !== v) el.textContent = v;
    }
    $('play-pause').textContent = state.paused ? 'Resume' : 'Pause';
  }

  function brainPanel() {
    const g = state.game;
    const meta = MM.search.ALGORITHMS[g.algorithm];
    g.hunters.forEach((h, k) => {
      const box = document.querySelector(`[data-h="${k}"]`);
      if (!box) return;
      const f = h.fuzzy;
      const set = (key, v, text) => {
        box.querySelector(`[data-k="${key}"]`).style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
        box.querySelector(`[data-v="${key}"]`).textContent = text;
      };
      const mode = box.querySelector('[data-mode]');
      mode.textContent = h.mode;
      mode.className = 'mode ' + h.mode;
      set('energy', h.energy / 100, Math.round(h.energy));
      set('aggr', f.aggression / 100, f.aggression.toFixed(0));
      for (const l of ['NEAR', 'MEDIUM', 'FAR']) set(l, f.degrees.distance[l], f.degrees.distance[l].toFixed(2));
      set('LOW', f.degrees.energy.LOW, f.degrees.energy.LOW.toFixed(2));
      set('E_MEDIUM', f.degrees.energy.MEDIUM, f.degrees.energy.MEDIUM.toFixed(2));
      set('HIGH', f.degrees.energy.HIGH, f.degrees.energy.HIGH.toFixed(2));
      box.querySelector('[data-dist]').textContent = `distance ${h.distance} steps`;
      box.querySelector('[data-en]').textContent = `energy ${Math.round(h.energy)}`;
      const top = f.rules.reduce((a, b) => (b.strength > a.strength ? b : a));
      box.querySelector('[data-rule]').innerHTML = `IF distance is <b>${top.if.distance}</b> AND energy is <b>${top.if.energy}</b> THEN <b>${top.then}</b> &nbsp;${top.strength.toFixed(2)}`;
      box.querySelector('[data-route]').textContent = `${meta.label} route: ${h.path.length - 1} steps, ${h.search.expanded} cells expanded`;
    });
  }

  // spoken by screen readers: only real events, never the ticking clock
  function announce(g, ev) {
    let text = '';
    if (ev.type === 'gem') text = g.gems.size ? `Gem collected. ${g.gems.size} left.` : 'Last gem collected. The exit is open.';
    else if (ev.type === 'caught') text = g.lives > 0 ? `Caught. ${g.lives} ${g.lives === 1 ? 'life' : 'lives'} left.` : 'Caught. Out of lives. Press R to try again.';
    else if (ev.type === 'won') text = `You escaped. Score ${g.score}.`;
    if (text) $('play-announce').textContent = text;
  }

  function loop(t) {
    const dt = Math.min(100, t - (state.last || t));
    state.last = t;
    const g = state.game;
    // the game only runs while its tab is on screen and the shortcuts list is closed
    const visible = MM.current === 'play' && !document.getElementById('help').open;
    if (g && visible && !state.paused && g.status === 'playing') {
      const wantsMove = state.keys.length || (state.buffer && state.buffer.until > t);
      if (wantsMove) {
        state.holdTimer += dt;
        if (state.holdTimer >= REPEAT_MS) {
          // keep the rhythm exact while moving; if blocked, be ready to go the moment a way opens
          state.holdTimer = tryMove(t) ? state.holdTimer - REPEAT_MS : REPEAT_MS;
        }
      }
      g.update(dt);
    }
    // play a sound for every game event that happened since the last frame
    if (g) {
      while (state.heard < g.events.length) {
        const ev = g.events[state.heard++];
        if (MM.sound[ev.type]) MM.sound[ev.type]();
        announce(g, ev);
      }
    }
    // a win can also happen on a key press between frames, so check it outside the running branch
    if (g && g.status === 'won' && state.newBest === null) state.newBest = recordBest(g);
    if (g && visible) {
      draw(t);
      state.panelTimer += dt;
      if (state.panelTimer > 150) {
        state.panelTimer = 0;
        hud();
        brainPanel();
      }
    }
    state.raf = requestAnimationFrame(loop);
  }

  function onKey(ev) {
    if (MM.current !== 'play' || !state.game || document.getElementById('help').open) return;
    const k = ev.key;
    const dir = DIR_OF[k];
    if (dir) {
      ev.preventDefault();
      if (ev.repeat) return;
      MM.sound.unlock();
      const now = performance.now();
      const wasIdle = state.keys.length === 0;
      state.keys = state.keys.filter((d) => d !== dir).concat(dir);
      state.buffer = { dir, until: now + BUFFER_MS };
      if (state.paused || state.game.status !== 'playing') return;
      if (wasIdle && now - state.lastMove >= REPEAT_MS) {
        // first press moves at once so the controls feel instant
        state.holdTimer = tryMove(now) ? 0 : REPEAT_MS;
      } else if (wasIdle) {
        // quick taps never move faster than holding the key would
        state.holdTimer = now - state.lastMove;
      }
      // a new direction while already moving is picked up on the next step (buffered turn)
    } else if (k === 'p' || k === 'P') state.paused = !state.paused;
    else if (k === 'm' || k === 'M') setMuted(!MM.sound.muted);
    else if (k === 'r' || k === 'R') newGame(state.level, state.levelName); // same maze again
    else if ((k === 'n' || k === 'N') && state.game.status === 'won') {
      const sel = $('play-level');
      sel.value = String(Math.min(LEVELS.length - 1, Number(sel.value) + 1));
      newGame();
    }
  }

  // touch screens (and the mouse): drag on the maze to steer, keep holding to keep walking
  function bindSwipe() {
    const c = $('play-canvas');
    let origin = null;
    c.addEventListener('pointerdown', (ev) => {
      origin = { x: ev.clientX, y: ev.clientY };
      c.setPointerCapture(ev.pointerId);
      MM.sound.unlock();
    });
    c.addEventListener('pointermove', (ev) => {
      if (!origin || !state.game) return;
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (state.keys[state.keys.length - 1] !== dir) {
        const wasIdle = state.keys.length === 0;
        state.keys = [dir];
        state.buffer = { dir, until: performance.now() + BUFFER_MS };
        if (wasIdle) state.holdTimer = REPEAT_MS; // start moving on the next frame
      }
      origin = { x: ev.clientX, y: ev.clientY }; // a new drag direction turns again
    });
    const end = () => {
      origin = null;
      state.keys = [];
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  const play = {
    started: false,
    state, // exposed for debugging in the browser console
    init() {
      $('play-level').innerHTML = LEVELS.map((l, i) => `<option value="${i}">${l.name}</option>`).join('');
      $('play-level').value = '1';
      // blur controls after use so the arrow keys move the player instead of changing a dropdown
      $('play-level').addEventListener('change', (ev) => {
        ev.target.blur();
        newGame();
      });
      $('play-new').addEventListener('click', (ev) => {
        ev.target.blur();
        newGame();
      });
      $('play-pause').addEventListener('click', (ev) => {
        ev.target.blur();
        state.paused = !state.paused;
      });
      let savedMute = false;
      try {
        savedMute = localStorage.getItem('mazemind-muted') === '1';
      } catch (e) {
        savedMute = false;
      }
      setMuted(savedMute);
      $('play-mute').addEventListener('click', (ev) => {
        ev.target.blur();
        setMuted(!MM.sound.muted);
      });
      $('play-diff').addEventListener('change', (ev) => {
        ev.target.blur();
        if (state.game) state.game.speed = Number($('play-diff').value);
      });
      $('play-algo').addEventListener('change', (ev) => {
        ev.target.blur();
        if (state.game) state.game.algorithm = $('play-algo').value;
      });
      root.addEventListener('keydown', onKey);
      bindSwipe();
      root.addEventListener('keyup', (ev) => {
        const dir = DIR_OF[ev.key];
        if (dir) state.keys = state.keys.filter((d) => d !== dir);
      });
      // releasing keys while the window is in the background must not leave the player walking
      root.addEventListener('blur', () => {
        state.keys = [];
        // switching to another window pauses the game instead of leaving you to the hunters
        if (state.game && state.game.status === 'playing' && MM.current === 'play') state.paused = true;
      });
      root.addEventListener('resize', () => play.started && resize());
      newGame();
      state.raf = requestAnimationFrame(loop);
    },
    show() {
      if (!this.started) {
        this.started = true;
        this.init();
      } else resize();
    },
    // used by the Maze Evolution screen to play an evolved maze
    loadLevel(level, name) {
      if (!this.started) {
        this.started = true;
        this.init();
      }
      newGame(level, name);
    },
  };

  MM.play = play;
})(window);
