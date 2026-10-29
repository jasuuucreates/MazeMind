// Path-finding on the grid: BFS, DFS, greedy best-first and A*.
// Every move costs 1. Each function returns the path plus a trace of the cells it expanded,
// which the Search Lab replays as an animation.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});
  if (typeof require === 'function' && !MM.PriorityQueue) require('./grid.js');

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const HEURISTICS = {
    manhattan: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
    euclidean: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    none: () => 0,
  };

  const ALGORITHMS = {
    bfs: { label: 'BFS', full: 'Breadth-first search', optimal: true, informed: false },
    dfs: { label: 'DFS', full: 'Depth-first search', optimal: false, informed: false },
    greedy: { label: 'Greedy', full: 'Greedy best-first search', optimal: false, informed: true },
    astar: { label: 'A*', full: 'A* search', optimal: true, informed: true },
  };

  function heuristicFor(grid, goal, name) {
    const h = HEURISTICS[name] || HEURISTICS.manhattan;
    const gx = goal % grid.width;
    const gy = Math.floor(goal / grid.width);
    return (i) => h(i % grid.width, Math.floor(i / grid.width), gx, gy);
  }

  function buildPath(cameFrom, start, goal) {
    const path = [goal];
    let cur = goal;
    while (cur !== start) {
      cur = cameFrom[cur];
      path.push(cur);
    }
    return path.reverse();
  }

  function result(algorithm, found, cameFrom, start, goal, trace, maxFrontier, t0) {
    const path = found ? buildPath(cameFrom, start, goal) : [];
    return {
      algorithm,
      found,
      path,
      cost: found ? path.length - 1 : Infinity,
      expanded: trace.length,
      trace,
      maxFrontier,
      timeMs: now() - t0,
    };
  }

  // queue: always expands the shallowest cell first, so the first time we reach the goal is the shortest way
  function bfs(grid, start, goal) {
    const t0 = now();
    const cameFrom = new Int32Array(grid.cells.length).fill(-1);
    const seen = new Uint8Array(grid.cells.length);
    const queue = [start];
    let head = 0;
    let maxFrontier = 1;
    const trace = [];
    seen[start] = 1;
    while (head < queue.length) {
      const node = queue[head++];
      const pushed = [];
      trace.push({ node, pushed });
      if (node === goal) return result('bfs', true, cameFrom, start, goal, trace, maxFrontier, t0);
      for (const n of grid.neighbors(node)) {
        if (seen[n]) continue;
        seen[n] = 1;
        cameFrom[n] = node;
        queue.push(n);
        pushed.push(n);
      }
      maxFrontier = Math.max(maxFrontier, queue.length - head);
    }
    return result('bfs', false, cameFrom, start, goal, trace, maxFrontier, t0);
  }

  // stack: keeps going down one corridor until it hits a dead end, then backtracks
  function dfs(grid, start, goal) {
    const t0 = now();
    const cameFrom = new Int32Array(grid.cells.length).fill(-1);
    const done = new Uint8Array(grid.cells.length);
    const stack = [[start, start]];
    let maxFrontier = 1;
    const trace = [];
    while (stack.length) {
      const [node, parent] = stack.pop();
      if (done[node]) continue;
      done[node] = 1;
      cameFrom[node] = parent;
      const pushed = [];
      trace.push({ node, pushed });
      if (node === goal) return result('dfs', true, cameFrom, start, goal, trace, maxFrontier, t0);
      const ns = grid.neighbors(node);
      for (let k = ns.length - 1; k >= 0; k--) {
        if (!done[ns[k]]) {
          stack.push([ns[k], node]);
          pushed.push(ns[k]);
        }
      }
      maxFrontier = Math.max(maxFrontier, stack.length);
    }
    return result('dfs', false, cameFrom, start, goal, trace, maxFrontier, t0);
  }

  // priority = h(n) only: rushes towards the goal, fast but can take a long way round
  function greedy(grid, start, goal, options = {}) {
    const t0 = now();
    const h = heuristicFor(grid, goal, options.heuristic);
    const cameFrom = new Int32Array(grid.cells.length).fill(-1);
    const seen = new Uint8Array(grid.cells.length);
    const open = new MM.PriorityQueue();
    open.push(start, h(start));
    seen[start] = 1;
    let maxFrontier = 1;
    const trace = [];
    while (open.size) {
      const node = open.pop();
      const pushed = [];
      trace.push({ node, pushed });
      if (node === goal) return result('greedy', true, cameFrom, start, goal, trace, maxFrontier, t0);
      for (const n of grid.neighbors(node)) {
        if (seen[n]) continue;
        seen[n] = 1;
        cameFrom[n] = node;
        open.push(n, h(n));
        pushed.push(n);
      }
      maxFrontier = Math.max(maxFrontier, open.size);
    }
    return result('greedy', false, cameFrom, start, goal, trace, maxFrontier, t0);
  }

  // priority f(n) = g(n) + h(n): cost so far plus estimated cost left.
  // With an admissible heuristic (Manhattan never overestimates on a 4-way grid) the path is optimal.
  function astar(grid, start, goal, options = {}) {
    const t0 = now();
    const h = heuristicFor(grid, goal, options.heuristic);
    const size = grid.cells.length;
    const g = new Float64Array(size).fill(Infinity);
    const cameFrom = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const open = new MM.PriorityQueue();
    g[start] = 0;
    // the tiny h term breaks ties between equal f in favour of cells nearer the goal
    open.push(start, h(start) + h(start) * 1e-4);
    let maxFrontier = 1;
    const trace = [];
    while (open.size) {
      const node = open.pop();
      if (closed[node]) continue; // an older, worse copy of a cell we already expanded
      closed[node] = 1;
      const pushed = [];
      trace.push({ node, pushed, g: g[node], f: g[node] + h(node) });
      if (node === goal) return result('astar', true, cameFrom, start, goal, trace, maxFrontier, t0);
      for (const n of grid.neighbors(node)) {
        if (closed[n]) continue;
        const tentative = g[node] + 1;
        if (tentative < g[n]) {
          g[n] = tentative;
          cameFrom[n] = node;
          const hn = h(n);
          open.push(n, tentative + hn + hn * 1e-4);
          pushed.push(n);
        }
      }
      maxFrontier = Math.max(maxFrontier, open.size);
    }
    return result('astar', false, cameFrom, start, goal, trace, maxFrontier, t0);
  }

  const FUNCS = { bfs, dfs, greedy, astar };

  function run(name, grid, start, goal, options) {
    const fn = FUNCS[name];
    if (!fn) throw new Error('unknown algorithm: ' + name);
    return fn(grid, start, goal, options);
  }

  const api = { bfs, dfs, greedy, astar, run, HEURISTICS, ALGORITHMS };
  MM.search = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
