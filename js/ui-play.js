// Play screen: keyboard control, the game loop, drawing, and the live "hunter brain" panel.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const $ = (id) => document.getElementById(id);

  const LEVELS = [
    { name: '1 - Warm-up', cols: 12, rows: 8, hunters: 1, braid: 0.5 },
    { name: '2 - Two hunters', cols: 14, rows: 9, hunters: 2, braid: 0.45 },
    { name: '3 - The labyrinth', cols: 17, rows: 11, hunters: 3, braid: 0.4 },
  ];
  const DIR_OF = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const BUFFER_MS = 300; // a turn pressed slightly before a junction is remembered this long
  const MODE_COLORS = { CHASE: '#f87171', AMBUSH: '#fbbf24', PATROL: '#38bdf8', REST: '#94a3b8' };
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
    state.game = new MM.game.Game(state.level, { algorithm: $('play-algo').value, seed: (Math.random() * 1e9) >>> 0 });
    state.paused = false;
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

  function drawDiamond(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.8, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.8, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHunter(ctx, g, cell, h, t, cx, cy) {
    const r = cell * 0.4;
    ctx.save();
    ctx.shadowColor = h.color;
    ctx.shadowBlur = h.mode === 'CHASE' ? 16 + 6 * Math.sin(t / 120) : 6;
    ctx.fillStyle = h.color;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r * 0.85);
    for (let k = 3; k >= 0; k--) ctx.lineTo(cx - r + (2 * r * k) / 3, cy + r * (k % 2 ? 0.55 : 0.85));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // eyes look at the next cell on the hunter's route
    const next = h.path.length > 1 ? h.path[1] : h.pos;
    const [ox, oy] = MM.render.center(g.grid, cell, h.pos);
    const [nx, ny] = MM.render.center(g.grid, cell, next);
    const lx = Math.sign(nx - ox) * r * 0.15;
    const ly = Math.sign(ny - oy) * r * 0.15;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + side * r * 0.38, cy - r * 0.2, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0e1c';
      ctx.beginPath();
      ctx.arc(cx + side * r * 0.38 + lx, cy - r * 0.2 + ly, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    if (h.mode === 'REST') {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.45))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('z', cx + r * 0.9, cy - r * 0.9);
    }
  }

  // dashed planned route, starting from where the sprite is drawn right now
  function drawRoute(ctx, cell, from, path, color) {
    const g = state.game;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, cell * 0.12);
    ctx.setLineDash([cell * 0.3, cell * 0.25]);
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

    const sprites = g.hunters.map((h) => glide('h' + h.id, h.pos, MM.game.STEP_MS[h.mode], t));
    if ($('play-thinking').checked) {
      g.hunters.forEach((h, k) => {
        if (!h.search) return;
        MM.render.fillCells(ctx, g.grid, cell, h.search.closed, h.color + '22', 0);
        drawRoute(ctx, cell, sprites[k], h.path, h.color);
        if (h.mode === 'AMBUSH') {
          const [tx, ty] = MM.render.center(g.grid, cell, h.target);
          ctx.strokeStyle = h.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(tx - cell * 0.4, ty - cell * 0.4, cell * 0.8, cell * 0.8);
        }
      });
    }

    // exit: locked (grey) until every gem is collected, then a pulsing green portal
    const open = g.gems.size === 0;
    const [ex, ey] = MM.render.center(g.grid, cell, g.exit);
    ctx.save();
    ctx.lineWidth = Math.max(2, cell * 0.12);
    ctx.strokeStyle = open ? '#4ade80' : '#64748b';
    ctx.shadowColor = open ? '#4ade80' : 'transparent';
    ctx.shadowBlur = open ? 14 + 6 * Math.sin(t / 200) : 0;
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!open) MM.render.drawLabel(ctx, g.grid, cell, g.exit, String(g.gems.size), '#94a3b8');

    for (const gem of g.gems) {
      const [gx, gy] = MM.render.center(g.grid, cell, gem);
      drawDiamond(ctx, gx, gy + Math.sin(t / 250 + gem) * cell * 0.05, cell * 0.32, '#22d3ee');
    }

    const [px, py] = glide('player', g.player.pos, REPEAT_MS, t);
    ctx.save();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    g.hunters.forEach((h, k) => drawHunter(ctx, g, cell, h, t, sprites[k][0], sprites[k][1]));

    const lastCaught = [...g.events].reverse().find((e) => e.type === 'caught');
    if (lastCaught && g.elapsed - lastCaught.at < 700) {
      ctx.fillStyle = `rgba(248,113,113,${0.35 * (1 - (g.elapsed - lastCaught.at) / 700)})`;
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
      title = 'You escaped!';
      sub = `Score ${g.score} - press N for the next level or R to replay this maze`;
    } else if (g.status === 'lost') {
      title = 'Caught!';
      sub = 'Out of lives - press R to try this maze again';
    } else if (state.paused) {
      title = 'Paused';
      sub = 'Press P to continue';
    } else {
      title = 'Caught!';
      sub = `${g.lives} ${g.lives === 1 ? 'life' : 'lives'} left - back to the start`;
    }
    ctx.fillStyle = 'rgba(8, 10, 22, 0.72)';
    ctx.fillRect(0, h / 2 - 60, w, 120);
    ctx.textAlign = 'center';
    ctx.fillStyle = g.status === 'won' ? '#4ade80' : g.status === 'lost' ? '#f87171' : '#e6e9f5';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText(title, w / 2, h / 2 - 6);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText(sub, w / 2, h / 2 + 28);
  }

  function hud() {
    const g = state.game;
    const secs = Math.floor(g.elapsed / 1000);
    const items = [
      ['Level', state.levelName],
      ['Lives', '♥ '.repeat(Math.max(0, g.lives)).trim() || '0'],
      ['Gems', `${g.totalGems - g.gems.size} / ${g.totalGems}`],
      ['Time', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
      ['Score', g.score],
    ];
    $('play-hud').innerHTML = items.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('play-pause').textContent = state.paused ? 'Resume' : 'Pause';
  }

  const bar = (v, color) => `<div class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${color}"></i></div>`;

  function brainPanel() {
    const g = state.game;
    const meta = MM.search.ALGORITHMS[g.algorithm];
    $('play-brain').innerHTML = g.hunters
      .map((h, k) => {
        const f = h.fuzzy;
        const fired = f.rules.filter((r) => r.strength > 0).sort((a, b) => b.strength - a.strength).slice(0, 2);
        const deg = (name, labels) =>
          labels.map((l) => `<div class="mf"><span>${l.toLowerCase()}</span>${bar(f.degrees[name][l], '#818cf8')}<em>${f.degrees[name][l].toFixed(2)}</em></div>`).join('');
        return `<div class="hunter">
          <div class="hrow"><span class="dot" style="background:${h.color}"></span><b>Hunter ${k + 1}</b>
            <span class="pill" style="background:${MODE_COLORS[h.mode]};color:#0b0e1c">${h.mode}</span></div>
          <div class="mf"><span>energy</span>${bar(h.energy / 100, '#4ade80')}<em>${Math.round(h.energy)}</em></div>
          <div class="mf"><span>aggression</span>${bar(f.aggression / 100, MODE_COLORS[h.mode])}<em>${f.aggression.toFixed(0)}</em></div>
          <div class="fz">
            <div><small>distance = ${h.distance} steps</small>${deg('distance', ['NEAR', 'MEDIUM', 'FAR'])}</div>
            <div><small>energy = ${Math.round(h.energy)}</small>${deg('energy', ['LOW', 'MEDIUM', 'HIGH'])}</div>
          </div>
          <div class="rules">${fired.map((r) => `IF distance is <b>${r.if.distance}</b> AND energy is <b>${r.if.energy}</b> THEN <b>${r.then}</b> <em>(${r.strength.toFixed(2)})</em>`).join('<br>')}</div>
          <div class="hint">${meta.label} route: ${h.path.length - 1} steps, ${h.search.expanded} cells expanded</div>
        </div>`;
      })
      .join('');
  }

  function loop(t) {
    const dt = Math.min(100, t - (state.last || t));
    state.last = t;
    const g = state.game;
    const visible = MM.current === 'play';
    // the game only runs while its tab is on screen
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
    if (MM.current !== 'play' || !state.game) return;
    const k = ev.key;
    const dir = DIR_OF[k];
    if (dir) {
      ev.preventDefault();
      if (ev.repeat) return;
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
    else if (k === 'r' || k === 'R') newGame(state.level, state.levelName); // same maze again
    else if ((k === 'n' || k === 'N') && state.game.status === 'won') {
      const sel = $('play-level');
      sel.value = String(Math.min(LEVELS.length - 1, Number(sel.value) + 1));
      newGame();
    }
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
      $('play-algo').addEventListener('change', (ev) => {
        ev.target.blur();
        if (state.game) state.game.algorithm = $('play-algo').value;
      });
      root.addEventListener('keydown', onKey);
      root.addEventListener('keyup', (ev) => {
        const dir = DIR_OF[ev.key];
        if (dir) state.keys = state.keys.filter((d) => d !== dir);
      });
      // releasing keys while the window is in the background must not leave the player walking
      root.addEventListener('blur', () => (state.keys = []));
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
