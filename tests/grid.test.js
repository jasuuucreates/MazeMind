const test = require('node:test');
const assert = require('node:assert');
const { Grid, PriorityQueue, makeRng } = require('../js/grid.js');

test('fromStrings reads walls and marked cells', () => {
  const { grid, marks } = Grid.fromStrings([
    '#####',
    '#S.G#',
    '#####',
  ]);
  assert.strictEqual(grid.width, 5);
  assert.strictEqual(grid.height, 3);
  assert.ok(grid.isWall(0, 0));
  assert.ok(!grid.isWall(2, 1));
  assert.strictEqual(marks.S, grid.index(1, 1));
  assert.strictEqual(marks.G, grid.index(3, 1));
});

test('cells outside the grid count as walls', () => {
  const grid = new Grid(3, 3);
  assert.ok(grid.isWall(-1, 0));
  assert.ok(grid.isWall(3, 1));
  assert.ok(!grid.isWall(1, 1));
});

test('neighbors skips walls and the edge of the grid', () => {
  const { grid, marks } = Grid.fromStrings([
    '.#.',
    'S..',
    '.#.',
  ]);
  const n = grid.neighbors(marks.S).sort((a, b) => a - b);
  assert.deepStrictEqual(n, [grid.index(0, 0), grid.index(1, 1), grid.index(0, 2)].sort((a, b) => a - b));
});

test('priority queue pops the lowest priority first', () => {
  const pq = new PriorityQueue();
  pq.push('c', 5);
  pq.push('a', 1);
  pq.push('b', 3);
  assert.deepStrictEqual([pq.pop(), pq.pop(), pq.pop()], ['a', 'b', 'c']);
  assert.strictEqual(pq.size, 0);
});

test('priority queue keeps insertion order for equal priorities', () => {
  const pq = new PriorityQueue();
  ['first', 'second', 'third'].forEach((x) => pq.push(x, 2));
  assert.deepStrictEqual([pq.pop(), pq.pop(), pq.pop()], ['first', 'second', 'third']);
});

test('seeded random numbers repeat for the same seed', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const xs = [a(), a(), a()];
  assert.deepStrictEqual(xs, [b(), b(), b()]);
  xs.forEach((x) => assert.ok(x >= 0 && x < 1));
});
