const test = require('node:test');
const assert = require('node:assert');
const { makeRng } = require('../js/grid.js');
const { generateMaze } = require('../js/mazegen.js');
const ga = require('../js/genetic.js');

const randomGenome = (n, rng) => Uint8Array.from({ length: n }, () => (rng() < 0.5 ? 1 : 0));

test('genome has one gene per possible passage between neighbouring rooms', () => {
  assert.strictEqual(ga.genomeLength(10, 7), 9 * 7 + 10 * 6);
});

test('decode opens rooms, keeps pillars as walls and opens a passage only where the gene is 1', () => {
  const genome = new Uint8Array(ga.genomeLength(4, 3));
  genome[0] = 1; // passage between room (0,0) and room (1,0)
  const grid = ga.decode(genome, 4, 3);
  assert.strictEqual(grid.width, 9);
  assert.strictEqual(grid.height, 7);
  assert.ok(!grid.isWall(1, 1) && !grid.isWall(3, 1)); // rooms
  assert.ok(grid.isWall(2, 2)); // pillar
  assert.ok(!grid.isWall(2, 1)); // opened by gene 0
  assert.ok(grid.isWall(1, 2)); // vertical passage stays shut
});

test('encode is the inverse of decode', () => {
  const g = randomGenome(ga.genomeLength(8, 6), makeRng(3));
  assert.deepStrictEqual(Array.from(ga.encode(ga.decode(g, 8, 6), 8, 6)), Array.from(g));
});

test('a maze with no passages is unsolvable and scores low', () => {
  const s = ga.evaluate(new Uint8Array(ga.genomeLength(6, 5)), 6, 5);
  assert.strictEqual(s.solvable, false);
  assert.ok(s.fitness < 0.25);
});

test('a perfect maze is solvable, has no loops and beats any unsolvable maze', () => {
  const genome = ga.encode(generateMaze(6, 5, makeRng(8)), 6, 5);
  const s = ga.evaluate(genome, 6, 5);
  assert.ok(s.solvable);
  assert.strictEqual(s.loops, 0);
  assert.strictEqual(s.reachable, 30);
  assert.ok(s.fitness >= 0.25);
});

test('loops are counted as passages - rooms + 1 (independent cycles)', () => {
  const n = ga.genomeLength(5, 4);
  const s = ga.evaluate(new Uint8Array(n).fill(1), 5, 4);
  assert.strictEqual(s.loops, n - 20 + 1);
});

test('mutation with rate 0 changes nothing and with rate 1 flips every gene', () => {
  const rng = makeRng(1);
  const g = randomGenome(40, rng);
  assert.deepStrictEqual(Array.from(ga.mutate(g.slice(), 0, rng)), Array.from(g));
  assert.deepStrictEqual(Array.from(ga.mutate(g.slice(), 1, rng)), Array.from(g, (b) => 1 - b));
});

test('uniform crossover takes every gene from one of the two parents', () => {
  const rng = makeRng(2);
  const a = randomGenome(60, rng);
  const b = randomGenome(60, rng);
  const child = ga.crossover(a, b, rng);
  child.forEach((gene, i) => assert.ok(gene === a[i] || gene === b[i]));
});

test('with elitism the best fitness never gets worse from one generation to the next', () => {
  const run = new ga.GeneticAlgorithm({ cols: 8, rows: 6, populationSize: 30, seed: 5 });
  const history = run.run(25);
  for (let i = 1; i < history.length; i++) assert.ok(history[i].best >= history[i - 1].best - 1e-12);
});

test('evolution improves on a random starting population', () => {
  const run = new ga.GeneticAlgorithm({ cols: 8, rows: 6, populationSize: 40, seed: 9, seedWithMazes: false });
  const history = run.run(40);
  assert.ok(history[history.length - 1].best > history[0].best);
  assert.ok(run.best().stats.solvable);
});

test('the same seed evolves the same mazes', () => {
  const a = new ga.GeneticAlgorithm({ cols: 6, rows: 5, populationSize: 20, seed: 12 }).run(10);
  const b = new ga.GeneticAlgorithm({ cols: 6, rows: 5, populationSize: 20, seed: 12 }).run(10);
  assert.deepStrictEqual(a.map((h) => h.best), b.map((h) => h.best));
});
