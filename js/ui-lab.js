// Search Lab: draw walls, drag start/goal, watch BFS / DFS / Greedy / A* explore, compare them in a table.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const $ = (id) => document.getElementById(id);

  const EXPLAIN = {
    bfs: '<b>Queue (first in, first out).</b> Expands cells in rings of equal distance from the start. Complete and optimal when every step costs the same, but it spreads in every direction, so it expands many cells.',
    dfs: '<b>Stack (last in, first out).</b> Follows one corridor as deep as it can, then backtracks. Needs little memory, but the path it returns is usually <i>not</i> the shortest.',
    greedy: '<b>Priority queue ordered by h(n)</b>, the estimated distance left. Races towards the goal and is very fast in open space, but it can be lured into dead ends and its path is not guaranteed to be shortest.',
    astar: '<b>Priority queue ordered by f(n) = g(n) + h(n)</b>: steps taken so far plus estimated steps left. Because the Manhattan distance never overestimates on a 4-way grid, A* always returns the shortest path while expanding far fewer cells than BFS.',
  };

  const COLS = 25;
  const ROWS = 15;
  const state = {
    grid: null,
    start: 0,
    goal: 0,
    cell: 16,
    anim: null,
    drag: null,
    shownResult: null,
  };

  function newMaze() {
    const rng = MM.makeRng((Math.random() * 1e9) >>> 0);
    state.grid = MM.mazegen.generateMaze(COLS, ROWS, rng);
    MM.mazegen.braid(state.grid, 0.35, rng);
    state.start = MM.mazegen.roomIndex(state.grid, 0, 0);
    state.goal = MM.mazegen.roomIndex(state.grid, COLS - 1, ROWS - 1);
    reset();
  }

  function openField() {
    const g = new MM.Grid(2 * COLS + 1, 2 * ROWS + 1);
    for (let i = 0; i < g.cells.length; i++) g.cells[i] = Math.random() < 0.27 ? 1 : 0;
    g.cells[state.start] = 0;
    g.cells[state.goal] = 0;
    state.grid = g;
    reset();
  }

  function clearWalls() {
    state.grid.cells.fill(0);
    reset();
  }

  function reset() {
    stop();
    state.shownResult = null;
    setStats(null);
    draw();
  }

  function stop() {
    if (state.anim) cancelAnimationFrame(state.anim.raf);
    state.anim = null;
    $('lab-run').textContent = 'Run';
  }

  function resize() {
    const stage = $('lab-stage');
    const maxW = Math.max(300, stage.clientWidth - 28);
    const maxH = Math.max(260, Math.min(640, root.innerHeight - 230));
    state.cell = MM.render.fitCanvas($('lab-canvas'), state.grid, maxW, maxH);
    draw();
  }

  // draws the maze plus whatever part of a search is currently visible
  function draw(overlay) {
    const { grid, cell } = state;
    const ctx = $('lab-canvas').getContext('2d');
    MM.render.drawGrid(ctx, grid, cell);
    if (overlay) {
      MM.render.fillCells(ctx, grid, cell, overlay.closed, MM.render.COLORS.closed, 0);
      MM.render.fillCells(ctx, grid, cell, overlay.frontier, MM.render.COLORS.frontier, Math.max(1, cell * 0.2));
      if (overlay.path) MM.render.drawPath(ctx, grid, cell, overlay.path);
    }
    MM.render.drawDot(ctx, grid, cell, state.start, MM.render.COLORS.start, 0.42, 10);
    MM.render.drawLabel(ctx, grid, cell, state.start, 'S');
    MM.render.drawDot(ctx, grid, cell, state.goal, MM.render.COLORS.goal, 0.42, 10);
    MM.render.drawLabel(ctx, grid, cell, state.goal, 'G');
  }

  // replays a finished search: `upto` trace steps of closed + frontier cells
  function overlayAt(res, upto) {
    const closed = [];
    const isClosed = new Uint8Array(state.grid.cells.length);
    const inFrontier = new Uint8Array(state.grid.cells.length);
    for (let k = 0; k < upto; k++) {
      const step = res.trace[k];
      isClosed[step.node] = 1;
      inFrontier[step.node] = 0;
      closed.push(step.node);
      for (const p of step.pushed) if (!isClosed[p]) inFrontier[p] = 1;
    }
    const frontier = [];
    for (let i = 0; i < inFrontier.length; i++) if (inFrontier[i]) frontier.push(i);
    const done = upto >= res.trace.length;
    return { closed, frontier, path: done ? res.path : null, done };
  }

  function currentSearch(algo) {
    return MM.search.run(algo || $('lab-algo').value, state.grid, state.start, state.goal, { heuristic: $('lab-heuristic').value });
  }

  function run() {
    if (state.anim) {
      stop();
      return;
    }
    const res = currentSearch();
    let step = 0;
    state.anim = { raf: 0 };
    $('lab-run').textContent = 'Stop';
    const tick = () => {
      const speed = Number($('lab-speed').value);
      step = Math.min(res.trace.length, step + speed);
      const ov = overlayAt(res, step);
      draw(ov);
      setStats(res, step, ov.frontier.length);
      if (step < res.trace.length) state.anim.raf = requestAnimationFrame(tick);
      else {
        state.shownResult = res;
        stop();
      }
    };
    state.anim.raf = requestAnimationFrame(tick);
  }

  function setStats(res, step, frontier) {
    const box = $('lab-stats');
    if (!res) {
      box.innerHTML = '<p class="muted" style="grid-column: span 2; margin: 0">Press <b>Run</b> to watch the search.</p>';
      return;
    }
    const done = step >= res.trace.length;
    const items = [
      [step, 'cells expanded'],
      [frontier, 'in the frontier'],
      [done ? (res.found ? res.cost : 'none') : '...', 'path length'],
      [done ? res.timeMs.toFixed(2) + ' ms' : '...', 'search time'],
    ];
    box.innerHTML = items.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  function compareAll() {
    stop();
    const results = ['bfs', 'dfs', 'greedy', 'astar'].map((a) => currentSearch(a));
    const shortest = results[0].found ? results[0].cost : Infinity;
    const optimal = results.filter((r) => r.found && r.cost === shortest);
    const best = optimal.reduce((m, r) => (!m || r.expanded < m.expanded ? r : m), null);
    $('lab-results').innerHTML = results
      .map((r) => {
        const meta = MM.search.ALGORITHMS[r.algorithm];
        const isOpt = r.found && r.cost === shortest;
        return `<tr class="${r === best ? 'best' : ''}">
          <td><b>${meta.label}</b></td>
          <td>${r.found ? r.cost : 'no path'}</td>
          <td>${r.expanded}</td>
          <td>${r.maxFrontier}</td>
          <td>${r.timeMs.toFixed(2)}</td>
          <td>${r.found ? (isOpt ? 'yes' : 'no') : '-'}</td>
        </tr>`;
      })
      .join('');
    $('lab-compare-note').textContent = best
      ? `${MM.search.ALGORITHMS[best.algorithm].label} found a shortest path while expanding the fewest cells.`
      : 'The goal cannot be reached: every algorithm explores the start region and stops.';
    const chosen = results.find((r) => r.algorithm === $('lab-algo').value);
    state.shownResult = chosen;
    const ov = overlayAt(chosen, chosen.trace.length);
    draw(ov);
    setStats(chosen, chosen.trace.length, ov.frontier.length);
  }

  function cellAt(ev) {
    const rect = $('lab-canvas').getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left) / state.cell);
    const y = Math.floor((ev.clientY - rect.top) / state.cell);
    return state.grid.inBounds(x, y) ? state.grid.index(x, y) : -1;
  }

  function applyDrag(i) {
    if (i < 0) return;
    const g = state.grid;
    if (state.drag === 'start' && i !== state.goal) {
      state.start = i;
      g.cells[i] = 0;
    } else if (state.drag === 'goal' && i !== state.start) {
      state.goal = i;
      g.cells[i] = 0;
    } else if ((state.drag === 'wall' || state.drag === 'erase') && i !== state.start && i !== state.goal) {
      g.cells[i] = state.drag === 'wall' ? 1 : 0;
    }
    draw();
  }

  function bindCanvas() {
    const c = $('lab-canvas');
    c.addEventListener('pointerdown', (ev) => {
      const i = cellAt(ev);
      if (i < 0) return;
      stop();
      state.shownResult = null;
      setStats(null);
      if (i === state.start) state.drag = 'start';
      else if (i === state.goal) state.drag = 'goal';
      else state.drag = state.grid.cells[i] === 1 ? 'erase' : 'wall';
      c.setPointerCapture(ev.pointerId);
      applyDrag(i);
    });
    c.addEventListener('pointermove', (ev) => {
      if (state.drag) applyDrag(cellAt(ev));
    });
    const end = () => (state.drag = null);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  function updateExplain() {
    const a = $('lab-algo').value;
    $('lab-explain').innerHTML = EXPLAIN[a];
    $('lab-heuristic').disabled = a === 'bfs' || a === 'dfs';
  }

  const lab = {
    started: false,
    init() {
      newMaze();
      bindCanvas();
      $('lab-run').addEventListener('click', run);
      $('lab-compare').addEventListener('click', compareAll);
      $('lab-new').addEventListener('click', newMaze);
      $('lab-field').addEventListener('click', openField);
      $('lab-clear').addEventListener('click', clearWalls);
      $('lab-algo').addEventListener('change', () => {
        updateExplain();
        reset();
      });
      $('lab-heuristic').addEventListener('change', reset);
      root.addEventListener('resize', () => lab.started && resize());
      updateExplain();
      setStats(null);
    },
    show() {
      if (!this.started) {
        this.started = true;
        this.init();
      }
      resize();
    },
  };

  MM.lab = lab;
})(window);
