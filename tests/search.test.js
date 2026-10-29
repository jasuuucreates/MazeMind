const test = require('node:test');
const assert = require('node:assert');
const { Grid } = require('../js/grid.js');
const search = require('../js/search.js');

const MAZE = [
  '###########',
  '#S....#...#',
  '#.###.#.#.#',
  '#.#.....#.#',
  '#.#.###.#.#',
  '#.......#G#',
  '###########',
];

// a path must start at start, end at goal, and only step between open neighbouring cells
function assertValidPath(grid, path, start, goal) {
  assert.strictEqual(path[0], start);
  assert.strictEqual(path[path.length - 1], goal);
  for (let i = 1; i < path.length; i++) {
    assert.ok(grid.neighbors(path[i - 1]).includes(path[i]), `step ${i} is not a legal move`);
  }
}

test('bfs finds the shortest path on an empty grid', () => {
  const grid = new Grid(8, 6);
  const r = search.bfs(grid, grid.index(0, 0), grid.index(7, 5));
  assert.ok(r.found);
  assert.strictEqual(r.cost, 12); // 7 + 5 moves
  assertValidPath(grid, r.path, grid.index(0, 0), grid.index(7, 5));
});

test('a* finds a path as short as bfs through a maze', () => {
  const { grid, marks } = Grid.fromStrings(MAZE);
  const b = search.bfs(grid, marks.S, marks.G);
  const a = search.astar(grid, marks.S, marks.G);
  assert.ok(a.found);
  assert.strictEqual(a.cost, b.cost);
  assertValidPath(grid, a.path, marks.S, marks.G);
});

test('a* expands fewer cells than bfs on an open grid', () => {
  const grid = new Grid(30, 30);
  const s = grid.index(2, 2);
  const g = grid.index(27, 25);
  assert.ok(search.astar(grid, s, g).expanded < search.bfs(grid, s, g).expanded);
});

test('dfs finds a legal path even if it is not the shortest', () => {
  const { grid, marks } = Grid.fromStrings(MAZE);
  const r = search.dfs(grid, marks.S, marks.G);
  assert.ok(r.found);
  assert.ok(r.cost >= search.bfs(grid, marks.S, marks.G).cost);
  assertValidPath(grid, r.path, marks.S, marks.G);
});

test('greedy best-first finds a legal path and expands few cells on an open grid', () => {
  const grid = new Grid(30, 30);
  const s = grid.index(1, 1);
  const g = grid.index(28, 28);
  const r = search.greedy(grid, s, g);
  assert.ok(r.found);
  assertValidPath(grid, r.path, s, g);
  assert.ok(r.expanded < search.bfs(grid, s, g).expanded);
});

test('a goal behind walls is reported as not found by every algorithm', () => {
  const { grid, marks } = Grid.fromStrings([
    '#######',
    '#S.#..#',
    '#..#.G#',
    '#######',
  ]);
  for (const name of ['bfs', 'dfs', 'greedy', 'astar']) {
    const r = search[name](grid, marks.S, marks.G);
    assert.strictEqual(r.found, false, name);
    assert.deepStrictEqual(r.path, [], name);
  }
});

test('start equal to goal gives a zero-cost path', () => {
  const grid = new Grid(4, 4);
  const r = search.astar(grid, 5, 5);
  assert.ok(r.found);
  assert.strictEqual(r.cost, 0);
  assert.deepStrictEqual(r.path, [5]);
});

test('a* without a heuristic (dijkstra) still finds the shortest path', () => {
  const { grid, marks } = Grid.fromStrings(MAZE);
  const r = search.astar(grid, marks.S, marks.G, { heuristic: 'none' });
  assert.strictEqual(r.cost, search.bfs(grid, marks.S, marks.G).cost);
});

test('trace records one entry per expanded cell for the animation', () => {
  const { grid, marks } = Grid.fromStrings(MAZE);
  const r = search.astar(grid, marks.S, marks.G);
  assert.strictEqual(r.trace.length, r.expanded);
  assert.strictEqual(r.trace[0].node, marks.S);
});

test('run() picks the algorithm by name', () => {
  const { grid, marks } = Grid.fromStrings(MAZE);
  assert.strictEqual(search.run('bfs', grid, marks.S, marks.G).algorithm, 'bfs');
  assert.strictEqual(search.run('astar', grid, marks.S, marks.G).algorithm, 'astar');
});

// properties checked on a batch of random mazes with loops (braided), not just one hand-made grid
const { makeRng } = require('../js/grid.js');
const { generateMaze, braid, roomIndex } = require('../js/mazegen.js');

function randomMazes(count) {
  const out = [];
  for (let seed = 1; seed <= count; seed++) {
    const rng = makeRng(seed);
    const grid = generateMaze(14, 9, rng);
    braid(grid, 0.5, rng);
    out.push({ grid, s: roomIndex(grid, 0, 0), g: roomIndex(grid, 13, 8) });
  }
  return out;
}

test('a* with the euclidean heuristic is still optimal (it never overestimates either)', () => {
  for (const { grid, s, g } of randomMazes(10)) {
    assert.strictEqual(search.astar(grid, s, g, { heuristic: 'euclidean' }).cost, search.bfs(grid, s, g).cost);
  }
});

test('greedy best-first is never shorter than bfs and is sometimes longer', () => {
  let longer = 0;
  for (const { grid, s, g } of randomMazes(10)) {
    const greedy = search.greedy(grid, s, g).cost;
    const shortest = search.bfs(grid, s, g).cost;
    assert.ok(greedy >= shortest);
    if (greedy > shortest) longer++;
  }
  assert.ok(longer > 0, 'greedy found the shortest path on every maze');
});

test('greedy without a heuristic expands cells in breadth-first order', () => {
  for (const { grid, s, g } of randomMazes(5)) {
    const greedy = search.greedy(grid, s, g, { heuristic: 'none' });
    const bfs = search.bfs(grid, s, g);
    assert.deepStrictEqual(greedy.trace.map((t) => t.node), bfs.trace.map((t) => t.node));
  }
});
