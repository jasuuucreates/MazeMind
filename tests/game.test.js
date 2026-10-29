const test = require('node:test');
const assert = require('node:assert');
const { Grid } = require('../js/grid.js');
const { Game, createLevel } = require('../js/game.js');

// small hand-made level: P = player start, E = exit, * = gem, H = hunter spawn
function level(lines) {
  const { grid, marks } = Grid.fromStrings(lines);
  const gems = [];
  const hunterSpawns = [];
  lines.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      if (ch === '*') gems.push(grid.index(x, y));
      if (ch === 'H') hunterSpawns.push(grid.index(x, y));
    })
  );
  return { grid, start: marks.P, exit: marks.E, gems, hunterSpawns };
}

const CORRIDOR = ['#########', '#P.*...E#', '#########'];

test('createLevel places start, exit, three gems and hunters on open cells', () => {
  const lv = createLevel({ cols: 12, rows: 8, hunters: 2, seed: 4 });
  const open = (i) => lv.grid.cells[i] === 0;
  assert.ok(open(lv.start) && open(lv.exit));
  assert.strictEqual(lv.gems.length, 3);
  assert.strictEqual(new Set([lv.start, lv.exit, ...lv.gems]).size, 5);
  lv.gems.forEach((g) => assert.ok(open(g)));
  assert.strictEqual(lv.hunterSpawns.length, 2);
  lv.hunterSpawns.forEach((h) => assert.ok(open(h) && h !== lv.start));
});

test('createLevel is repeatable with the same seed', () => {
  const a = createLevel({ cols: 10, rows: 7, hunters: 2, seed: 11 });
  const b = createLevel({ cols: 10, rows: 7, hunters: 2, seed: 11 });
  assert.deepStrictEqual([a.start, a.exit, a.gems, a.hunterSpawns], [b.start, b.exit, b.gems, b.hunterSpawns]);
});

test('placeObjects keeps an exit that is given to it', () => {
  const { generateMaze, roomIndex } = require('../js/mazegen.js');
  const { makeRng } = require('../js/grid.js');
  const { placeObjects } = require('../js/game.js');
  const grid = generateMaze(8, 6, makeRng(2));
  const exit = roomIndex(grid, 1, 0); // right next to the start, never the farthest room
  const lv = placeObjects(grid, roomIndex(grid, 0, 0), { hunters: 1, rng: makeRng(2), exit });
  assert.strictEqual(lv.exit, exit);
  assert.ok(!lv.gems.includes(exit));
});

test('the player cannot walk into a wall', () => {
  const game = new Game(level(CORRIDOR));
  const before = game.player.pos;
  assert.strictEqual(game.movePlayer(0, -1), false);
  assert.strictEqual(game.player.pos, before);
});

test('walking over a gem collects it', () => {
  const game = new Game(level(CORRIDOR));
  game.movePlayer(1, 0);
  game.movePlayer(1, 0);
  assert.strictEqual(game.gems.size, 0);
});

test('the exit only opens once every gem is collected', () => {
  const lv = level(['#########', '#P.E...*#', '#########']);
  const game = new Game(lv);
  game.movePlayer(1, 0);
  game.movePlayer(1, 0);
  assert.strictEqual(game.status, 'playing'); // on the exit but the gem is still out there
  for (let k = 0; k < 4; k++) game.movePlayer(1, 0);
  for (let k = 0; k < 4; k++) game.movePlayer(-1, 0);
  assert.strictEqual(game.status, 'won');
});

test('a hunter next to the player with full energy chases straight at the player', () => {
  const game = new Game(level(['#########', '#P...H.E#', '#########']));
  const h = game.hunters[0];
  game.think(h);
  assert.strictEqual(h.mode, 'CHASE');
  assert.strictEqual(h.path[h.path.length - 1], game.player.pos);
});

test('a far away exhausted hunter rests and does not move', () => {
  const row = '#P' + '.'.repeat(36) + 'H#';
  const game = new Game(level(['#'.repeat(row.length), row.replace('P', 'P').replace(/\.(?=H)/, 'E'), '#'.repeat(row.length)]));
  const h = game.hunters[0];
  h.energy = 5;
  const pos = h.pos;
  game.think(h);
  assert.strictEqual(h.mode, 'REST');
  game.update(1000);
  assert.strictEqual(h.pos, pos);
});

test('being caught costs a life and sends the player back to the start', () => {
  const lv = level(['#######', '#P.H.E#', '#######']);
  const game = new Game(lv, { lives: 3 });
  game.movePlayer(1, 0); // step next to the hunter
  game.update(2000); // the hunter steps onto the player
  assert.strictEqual(game.lives, 2);
  assert.strictEqual(game.player.pos, lv.start);
});

test('losing the last life ends the game', () => {
  const game = new Game(level(['#######', '#P.H.E#', '#######']), { lives: 1 });
  game.movePlayer(1, 0);
  game.update(2000);
  assert.strictEqual(game.status, 'lost');
});

test('a hunter never steps onto a cell another hunter is standing on', () => {
  // two hunters in one corridor, both chasing the player on the left
  const lv = level(['###########', '#P......E.#', '#.##.####.#', '#.....H.H.#', '###########']);
  const game = new Game(lv);
  game.hunters[0].energy = 5; // the front hunter is tired and rests in the corridor
  for (let t = 0; t < 4000 && game.status === 'playing'; t += 40) {
    game.update(40);
    const [a, b] = game.hunters;
    assert.notStrictEqual(a.pos, b.pos, `hunters overlapped at t=${t}`);
  }
});

test('a hunter stuck behind another hunter for 3 steps steps aside', () => {
  // hunter b wants to reach the player on the left but hunter a stands in the corridor
  const lv = level(['#############', '#P...HH....E#', '#############']);
  const game = new Game(lv);
  const b = game.hunters[1];
  const start = b.pos;
  for (let k = 0; k < 3; k++) game.stepHunter(b);
  assert.notStrictEqual(b.pos, start, 'the blocked hunter never moved');
  assert.notStrictEqual(b.pos, game.hunters[0].pos, 'it walked onto the other hunter');
});

test('a patrol waypoint that cannot be reached is swapped for a reachable one', () => {
  // the room at the far right is sealed off
  const lv = level(['#########', '#P..H#.E#', '#########']);
  lv.exit = lv.grid.index(3, 1);
  const game = new Game(lv);
  const h = game.hunters[0];
  h.energy = 60;
  h.waypoint = lv.grid.index(6, 1);
  game.player.pos = lv.grid.index(1, 1);
  game.patrolTarget(h);
  game.think(h);
  if (h.mode === 'PATROL') assert.notStrictEqual(h.waypoint, lv.grid.index(6, 1));
  assert.ok(game.patrolPoints.every((i) => i !== lv.grid.index(6, 1)));
});

test('after being caught everyone freezes for a moment, including the player', () => {
  const lv = level(['#######', '#P.H.E#', '#######']);
  const game = new Game(lv, { lives: 3 });
  game.movePlayer(1, 0);
  game.update(300); // caught
  assert.strictEqual(game.lives, 2);
  assert.ok(game.grace > 0);
  assert.strictEqual(game.movePlayer(1, 0), false);
  game.update(1520); // the pause runs out, the hunter has not stepped again yet
  assert.ok(game.grace <= 0);
  assert.strictEqual(game.movePlayer(1, 0), true);
});

test('a faster difficulty makes hunters take more steps in the same time', () => {
  const corridor = ['#'.repeat(40), '#P' + '.'.repeat(30) + 'H.....E#', '#'.repeat(40)];
  const walked = (speed) => {
    const game = new Game(level(corridor), { speed });
    const start = game.hunters[0].pos;
    game.update(1000);
    return Math.abs(game.hunters[0].pos - start);
  };
  assert.ok(walked(2) >= 2 * walked(1) - 1, `normal ${walked(1)}, fast ${walked(2)}`);
  assert.ok(walked(0.5) < walked(1));
});

test('hunters plan with whichever search algorithm is selected', () => {
  const game = new Game(level(['#########', '#P...H.E#', '#########']), { algorithm: 'bfs' });
  const h = game.hunters[0];
  game.think(h);
  assert.strictEqual(h.search.algorithm, 'bfs');
});

test('an ambushing hunter aims ahead of the player, not at the player', () => {
  const lv = level(['###########', '#P.......E#', '#.#######.#', '#.........#', '###########']);
  lv.hunterSpawns = [lv.grid.index(9, 3)];
  const game = new Game(lv);
  game.movePlayer(1, 0);
  game.movePlayer(1, 0); // moving right
  const h = game.hunters[0];
  assert.strictEqual(game.ambushTarget(h), lv.grid.index(7, 1));
});
