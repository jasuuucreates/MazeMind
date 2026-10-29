// Maze generation with the recursive backtracker (a depth-first search that carves passages),
// plus "braiding", which knocks out some dead ends so the player has loops to escape through.
// Rooms sit at odd coordinates; the cell between two rooms is the wall (or passage) joining them.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});
  if (typeof require === 'function' && !MM.Grid) require('./grid.js');

  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  function roomIndex(grid, c, r) {
    return grid.index(2 * c + 1, 2 * r + 1);
  }

  function generateMaze(cols, rows, rng = Math.random) {
    const grid = new MM.Grid(2 * cols + 1, 2 * rows + 1, 1);
    const visited = new Uint8Array(cols * rows);
    const stack = [[0, 0]];
    visited[0] = 1;
    grid.setWall(1, 1, false);
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const options = DIRS.filter(([dc, dr]) => {
        const nc = c + dc;
        const nr = r + dr;
        return nc >= 0 && nr >= 0 && nc < cols && nr < rows && !visited[nr * cols + nc];
      });
      if (!options.length) {
        stack.pop(); // dead end: backtrack
        continue;
      }
      const [dc, dr] = options[Math.floor(rng() * options.length)];
      const nc = c + dc;
      const nr = r + dr;
      grid.setWall(2 * c + 1 + dc, 2 * r + 1 + dr, false); // the passage between the two rooms
      grid.setWall(2 * nc + 1, 2 * nr + 1, false);
      visited[nr * cols + nc] = 1;
      stack.push([nc, nr]);
    }
    return grid;
  }

  function countDeadEnds(grid) {
    let n = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0 && grid.neighbors(i).length === 1) n++;
    }
    return n;
  }

  // each dead-end room gets, with probability `chance`, an extra opening to a neighbouring room
  function braid(grid, chance, rng = Math.random) {
    const deadEnds = [];
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0 && grid.neighbors(i).length === 1) deadEnds.push(i);
    }
    let opened = 0;
    for (const i of deadEnds) {
      if (grid.neighbors(i).length !== 1) continue; // already fixed by an earlier opening
      if (rng() >= chance) continue;
      const { x, y } = grid.xy(i);
      const walls = DIRS.filter(([dx, dy]) => grid.isWall(x + dx, y + dy) && grid.inBounds(x + 2 * dx, y + 2 * dy) && x + 2 * dx > 0 && y + 2 * dy > 0 && x + 2 * dx < grid.width - 1 && y + 2 * dy < grid.height - 1);
      if (!walls.length) continue;
      // prefer joining two dead ends: one opening fixes both
      const joinDead = walls.filter(([dx, dy]) => grid.neighbors(grid.index(x + 2 * dx, y + 2 * dy)).length === 1);
      const pool = joinDead.length ? joinDead : walls;
      const [dx, dy] = pool[Math.floor(rng() * pool.length)];
      grid.setWall(x + dx, y + dy, false);
      opened++;
    }
    return opened;
  }

  const api = { generateMaze, braid, countDeadEnds, roomIndex };
  MM.mazegen = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
