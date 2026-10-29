// Grid of cells (0 = open, 1 = wall), a binary-heap priority queue and a seeded random generator.
// Works as a normal <script> in the browser (everything goes on window.MazeMind) and with require() in Node for the tests.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});

  class Grid {
    constructor(width, height, fill = 0) {
      this.width = width;
      this.height = height;
      this.cells = new Uint8Array(width * height).fill(fill);
    }

    index(x, y) {
      return y * this.width + x;
    }

    xy(i) {
      return { x: i % this.width, y: Math.floor(i / this.width) };
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    isWall(x, y) {
      return !this.inBounds(x, y) || this.cells[this.index(x, y)] === 1;
    }

    setWall(x, y, wall = true) {
      if (this.inBounds(x, y)) this.cells[this.index(x, y)] = wall ? 1 : 0;
    }

    // open cells next to cell i: up, right, down, left
    neighbors(i) {
      const x = i % this.width;
      const y = (i - x) / this.width;
      const out = [];
      if (!this.isWall(x, y - 1)) out.push(i - this.width);
      if (!this.isWall(x + 1, y)) out.push(i + 1);
      if (!this.isWall(x, y + 1)) out.push(i + this.width);
      if (!this.isWall(x - 1, y)) out.push(i - 1);
      return out;
    }

    clone() {
      const g = new Grid(this.width, this.height);
      g.cells.set(this.cells);
      return g;
    }

    // '#' is a wall, anything else is open; letters are remembered as marks (e.g. S and G)
    static fromStrings(lines) {
      const grid = new Grid(lines[0].length, lines.length);
      const marks = {};
      lines.forEach((line, y) => {
        [...line].forEach((ch, x) => {
          if (ch === '#') grid.setWall(x, y);
          else if (ch !== '.' && ch !== ' ') marks[ch] = grid.index(x, y);
        });
      });
      return { grid, marks };
    }
  }

  // min-heap; the counter keeps equal priorities in insertion order (FIFO)
  class PriorityQueue {
    constructor() {
      this.heap = [];
      this.counter = 0;
    }

    get size() {
      return this.heap.length;
    }

    push(item, priority) {
      this.heap.push({ item, priority, order: this.counter++ });
      this._up(this.heap.length - 1);
    }

    pop() {
      const top = this.heap[0];
      const last = this.heap.pop();
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this._down(0);
      }
      return top ? top.item : undefined;
    }

    _less(a, b) {
      const x = this.heap[a];
      const y = this.heap[b];
      return x.priority < y.priority || (x.priority === y.priority && x.order < y.order);
    }

    _up(i) {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this._less(i, p)) break;
        [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
        i = p;
      }
    }

    _down(i) {
      const n = this.heap.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this._less(l, m)) m = l;
        if (r < n && this._less(r, m)) m = r;
        if (m === i) break;
        [this.heap[i], this.heap[m]] = [this.heap[m], this.heap[i]];
        i = m;
      }
    }
  }

  // mulberry32: small, fast, good enough for a game; same seed = same sequence
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  MM.Grid = Grid;
  MM.PriorityQueue = PriorityQueue;
  MM.makeRng = makeRng;
  if (typeof module === 'object' && module.exports) module.exports = { Grid, PriorityQueue, makeRng };
})(typeof window !== 'undefined' ? window : globalThis);
