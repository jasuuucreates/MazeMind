// Maze Evolution screen: run the genetic algorithm live, chart the fitness, preview the best maze, play it.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const $ = (id) => document.getElementById(id);

  const SIZES = { small: [10, 7], medium: [14, 9], large: [17, 11] };
  const state = { ga: null, running: false, raf: 0, cell: 12 };

  // typed numbers are clamped: an empty or silly value must not crash or run forever
  function readNumber(id, fallback, min, max) {
    const input = $(id);
    const v = Math.round(Number(input.value));
    const ok = Number.isFinite(v) && input.value.trim() !== '' ? Math.min(max, Math.max(min, v)) : fallback;
    if (String(ok) !== input.value) input.value = ok;
    return ok;
  }

  function settings() {
    const [cols, rows] = SIZES[$('evo-size').value];
    return {
      cols,
      rows,
      populationSize: readNumber('evo-pop', 60, 10, 200),
      generations: readNumber('evo-gens', 150, 10, 1000),
      mutationRate: Number($('evo-mut').value) / 100,
      weights: { path: Number($('evo-w-path').value), deadEnds: Number($('evo-w-dead').value), loops: Number($('evo-w-loops').value) },
    };
  }

  function reset() {
    stop();
    const s = settings();
    state.ga = new MM.genetic.GeneticAlgorithm({ ...s, seed: (Math.random() * 1e9) >>> 0 });
    state.ga.step(); // score generation 0 so there is something to show
    drawAll();
  }

  function stop() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    $('evo-run').textContent = 'Evolve';
  }

  function tick() {
    if (!state.running) return;
    const limit = settings().generations;
    for (let k = 0; k < 2 && state.ga.generation < limit; k++) state.ga.step();
    drawAll();
    if (state.ga.generation >= limit) stop();
    else state.raf = requestAnimationFrame(tick);
  }

  function toggle() {
    if (state.running) return stop();
    if (!state.ga || state.ga.generation >= settings().generations) reset();
    state.ga.mutationRate = settings().mutationRate;
    state.ga.weights = settings().weights;
    state.running = true;
    $('evo-run').textContent = 'Stop';
    state.raf = requestAnimationFrame(tick);
  }

  function drawMaze() {
    const best = state.ga.best();
    const canvas = $('evo-maze');
    const stage = $('evo-maze-stage');
    state.cell = MM.render.fitCanvas(canvas, best.grid, Math.max(260, stage.clientWidth - 28), 420);
    const ctx = canvas.getContext('2d');
    MM.render.drawGrid(ctx, best.grid, state.cell);
    if (best.stats.route) MM.render.drawPath(ctx, best.grid, state.cell, best.stats.route, '#ffffff', Math.max(2, state.cell * 0.22));
    const start = best.grid.index(1, 1);
    const exit = best.grid.index(best.grid.width - 2, best.grid.height - 2);
    MM.render.drawMarker(ctx, best.grid, state.cell, start, 'S', true);
    MM.render.drawMarker(ctx, best.grid, state.cell, exit, 'E', false);
  }

  function drawChart() {
    const canvas = $('evo-chart');
    const w = Math.max(260, $('evo-chart-stage').clientWidth - 28);
    const h = 220;
    const dpr = root.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const hist = state.ga.history;
    const pad = { l: 40, r: 12, t: 12, b: 26 };
    const maxGen = Math.max(settings().generations, hist.length);
    const values = hist.flatMap((r) => [r.best, r.average]);
    const lo = Math.max(0, Math.floor(Math.min(...values) * 10) / 10);
    const hi = Math.ceil(Math.max(...values) * 10) / 10 || 1;
    const X = (g) => pad.l + (g / Math.max(1, maxGen - 1)) * (w - pad.l - pad.r);
    const Y = (v) => h - pad.b - ((v - lo) / Math.max(0.0001, hi - lo)) * (h - pad.t - pad.b);
    ctx.strokeStyle = '#262626';
    ctx.fillStyle = '#6b6b6b';
    ctx.font = `12px ${MM.render.FONT}`;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(v));
      ctx.lineTo(w - pad.r, Y(v));
      ctx.stroke();
      ctx.fillText(v.toFixed(2), 4, Y(v) + 4);
    }
    ctx.fillText('generation', w / 2 - 25, h - 6);
    const line = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      hist.forEach((r, i) => (i ? ctx.lineTo(X(i), Y(r[key])) : ctx.moveTo(X(i), Y(r[key]))));
      ctx.stroke();
    };
    line('average', '#6b6b6b');
    line('best', '#ffffff');
  }

  function drawStats() {
    const last = state.ga.history[state.ga.history.length - 1];
    const s = last.bestStats;
    const items = [
      [last.generation, 'generation'],
      [last.best.toFixed(3), 'best fitness'],
      [last.average.toFixed(3), 'average fitness'],
      [`${last.solvable}/${state.ga.populationSize}`, 'solvable mazes'],
      [s.solvable ? s.pathLength : '-', 'A* escape route'],
      [s.deadEnds, 'dead ends'],
      [s.loops, 'escape loops'],
      [`${s.reachable}/${s.rooms}`, 'rooms reachable'],
    ];
    $('evo-stats').innerHTML = items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    $('evo-play').disabled = !s.solvable;
  }

  function drawAll() {
    drawMaze();
    drawChart();
    drawStats();
  }

  function playBest() {
    const best = state.ga.best();
    if (!best.stats.solvable) return;
    const grid = best.grid;
    const level = MM.game.placeObjects(grid, grid.index(1, 1), {
      hunters: 2,
      rng: MM.makeRng((Math.random() * 1e9) >>> 0),
      exit: grid.index(grid.width - 2, grid.height - 2),
    });
    location.hash = '#play';
    MM.play.loadLevel(level, `Evolved (gen ${state.ga.history.length - 1})`);
  }

  const evolve = {
    started: false,
    init() {
      $('evo-run').addEventListener('click', toggle);
      $('evo-reset').addEventListener('click', reset);
      $('evo-play').addEventListener('click', playBest);
      $('evo-size').addEventListener('change', reset);
      $('evo-pop').addEventListener('change', reset);
      for (const id of ['evo-w-path', 'evo-w-dead', 'evo-w-loops', 'evo-mut']) {
        $(id).addEventListener('input', () => {
          $(id + '-v').textContent = $(id).value + (id === 'evo-mut' ? '%' : '');
        });
      }
      root.addEventListener('resize', () => evolve.started && state.ga && drawAll());
      reset();
    },
    show() {
      if (!this.started) {
        this.started = true;
        this.init();
      } else drawAll();
    },
  };

  MM.evolve = evolve;
})(window);
