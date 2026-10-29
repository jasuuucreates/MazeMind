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
  const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };
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
    held: null,
    holdTimer: 0,
    panelTimer: 0,
    raf: 0,
  };

  function newGame(level, name) {
    const cfg = LEVELS[Number($('play-level').value)];
    state.level = level || MM.game.createLevel({ cols: cfg.cols, rows: cfg.rows, hunters: cfg.hunters, braidChance: cfg.braid, seed: (Math.random() * 1e9) >>> 0 });
    state.levelName = name || cfg.name;
    state.game = new MM.game.Game(state.level, { algorithm: $('play-algo').value, seed: (Math.random() * 1e9) >>> 0 });
    state.paused = false;
    resize();
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

  function drawHunter(ctx, g, cell, h, t) {
    const [cx, cy] = MM.render.center(g.grid, cell, h.pos);
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
    const [nx, ny] = MM.render.center(g.grid, cell, next);
    const lx = Math.sign(nx - cx) * r * 0.15;
    const ly = Math.sign(ny - cy) * r * 0.15;
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
    if (h.mode === 'REST') MM.render.drawLabel(ctx, g.grid, cell, h.pos, 'z', '#e2e8f0');
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

    if ($('play-thinking').checked) {
      for (const h of g.hunters) {
        if (!h.search) continue;
        MM.render.fillCells(ctx, g.grid, cell, h.search.closed, h.color + '22', 0);
        ctx.save();
        ctx.setLineDash([cell * 0.3, cell * 0.25]);
        MM.render.drawPath(ctx, g.grid, cell, h.path, h.color, Math.max(2, cell * 0.12));
        ctx.restore();
        if (h.mode === 'AMBUSH') {
          const [tx, ty] = MM.render.center(g.grid, cell, h.target);
          ctx.strokeStyle = h.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(tx - cell * 0.4, ty - cell * 0.4, cell * 0.8, cell * 0.8);
        }
      }
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

    MM.render.drawDot(ctx, g.grid, cell, g.player.pos, '#facc15', 0.36, 14);
    g.hunters.forEach((h) => drawHunter(ctx, g, cell, h, t));

    const lastCaught = [...g.events].reverse().find((e) => e.type === 'caught');
    if (lastCaught && g.elapsed - lastCaught.at < 700) {
      ctx.fillStyle = `rgba(248,113,113,${0.35 * (1 - (g.elapsed - lastCaught.at) / 700)})`;
      ctx.fillRect(0, 0, g.grid.width * cell, g.grid.height * cell);
    }
    if (g.status !== 'playing' || state.paused) banner(ctx, g, cell);
  }

  function banner(ctx, g, cell) {
    const w = g.grid.width * cell;
    const h = g.grid.height * cell;
    const title = state.paused && g.status === 'playing' ? 'Paused' : g.status === 'won' ? 'You escaped!' : 'Caught!';
    const sub = state.paused && g.status === 'playing' ? 'Press P to continue' : g.status === 'won' ? `Score ${g.score} - press N for the next level or R to replay` : 'Out of lives - press R to try again';
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
    if (g && !state.paused && g.status === 'playing') {
      if (state.held) {
        state.holdTimer += dt;
        if (state.holdTimer >= REPEAT_MS) {
          state.holdTimer = 0;
          g.movePlayer(...KEYS[state.held]);
        }
      }
      g.update(dt);
    }
    if (g) {
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
    if (KEYS[k]) {
      ev.preventDefault();
      if (ev.repeat) return;
      state.held = k;
      state.holdTimer = 0;
      if (!state.paused) state.game.movePlayer(...KEYS[k]);
    } else if (k === 'p' || k === 'P') state.paused = !state.paused;
    else if (k === 'r' || k === 'R') newGame(state.levelName.startsWith('Evolved') ? state.level : null, state.levelName.startsWith('Evolved') ? state.levelName : null);
    else if ((k === 'n' || k === 'N') && state.game.status === 'won') {
      const sel = $('play-level');
      sel.value = String(Math.min(LEVELS.length - 1, Number(sel.value) + 1));
      newGame();
    }
  }

  const play = {
    started: false,
    init() {
      $('play-level').innerHTML = LEVELS.map((l, i) => `<option value="${i}">${l.name}</option>`).join('');
      $('play-level').value = '1';
      $('play-level').addEventListener('change', () => newGame());
      $('play-new').addEventListener('click', () => newGame());
      $('play-pause').addEventListener('click', () => (state.paused = !state.paused));
      $('play-algo').addEventListener('change', () => state.game && (state.game.algorithm = $('play-algo').value));
      root.addEventListener('keydown', onKey);
      root.addEventListener('keyup', (ev) => ev.key === state.held && (state.held = null));
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
