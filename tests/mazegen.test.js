const test = require('node:test');
const assert = require('node:assert');
const { makeRng } = require('../js/grid.js');
const { generateMaze, braid, countDeadEnds, roomIndex } = require('../js/mazegen.js');

// number of open cells reachable from cell `from`
function flood(grid, from) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    for (const n of grid.neighbors(stack.pop())) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size;
}

const openCount = (grid) => grid.cells.reduce((s, c) => s + (c === 0 ? 1 : 0), 0);

test('grid size is 2 * rooms + 1 in each direction', () => {
  const g = generateMaze(10, 7, makeRng(1));
  assert.strictEqual(g.width, 21);
  assert.strictEqual(g.height, 15);
});

test('a generated maze is perfect: every room reachable, no loops', () => {
  const cols = 12;
  const rows = 8;
  const g = generateMaze(cols, rows, makeRng(7));
  const rooms = cols * rows;
  // a tree on n rooms has n - 1 passages, so open cells = rooms + (rooms - 1)
  assert.strictEqual(openCount(g), rooms + rooms - 1);
  assert.strictEqual(flood(g, roomIndex(g, 0, 0)), openCount(g));
});

test('the same seed gives the same maze', () => {
  const a = generateMaze(9, 9, makeRng(99));
  const b = generateMaze(9, 9, makeRng(99));
  assert.deepStrictEqual(Array.from(a.cells), Array.from(b.cells));
});

test('braid with chance 1 removes every dead end', () => {
  const g = generateMaze(12, 8, makeRng(3));
  assert.ok(countDeadEnds(g) > 0);
  braid(g, 1, makeRng(3));
  assert.strictEqual(countDeadEnds(g), 0);
});

test('braid with chance 0 leaves the maze alone', () => {
  const g = generateMaze(12, 8, makeRng(5));
  const before = Array.from(g.cells);
  braid(g, 0, makeRng(5));
  assert.deepStrictEqual(Array.from(g.cells), before);
});
