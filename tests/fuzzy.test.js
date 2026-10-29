const test = require('node:test');
const assert = require('node:assert');
const fuzzy = require('../js/fuzzy.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('triangle membership peaks at b and falls to 0 at a and c', () => {
  close(fuzzy.trimf(5, 0, 5, 10), 1);
  close(fuzzy.trimf(2.5, 0, 5, 10), 0.5);
  close(fuzzy.trimf(0, 0, 5, 10), 0);
  close(fuzzy.trimf(11, 0, 5, 10), 0);
});

test('trapezoid membership is flat between b and c', () => {
  close(fuzzy.trapmf(5, 0, 2, 8, 10), 1);
  close(fuzzy.trapmf(1, 0, 2, 8, 10), 0.5);
  close(fuzzy.trapmf(9, 0, 2, 8, 10), 0.5);
  close(fuzzy.trapmf(0, 0, 0, 3, 8), 1); // left shoulder
  close(fuzzy.trapmf(40, 14, 20, 40, 40), 1); // right shoulder
});

test('a distance of 2 steps is fully NEAR', () => {
  const d = fuzzy.hunterBrain().inputs.distance.fuzzify(2);
  close(d.NEAR, 1);
  close(d.MEDIUM, 0);
  close(d.FAR, 0);
});

test('rule strength is the minimum of its input memberships (fuzzy AND)', () => {
  const out = fuzzy.hunterBrain().evaluate({ distance: 6.5, energy: 100 });
  const nearHigh = out.rules.find((r) => r.if.distance === 'NEAR' && r.if.energy === 'HIGH');
  const medHigh = out.rules.find((r) => r.if.distance === 'MEDIUM' && r.if.energy === 'HIGH');
  close(nearHigh.strength, 0.3);
  close(medHigh.strength, 0.25);
});

test('a hunter close to the player with full energy becomes aggressive and chases', () => {
  const out = fuzzy.hunterBrain().evaluate({ distance: 2, energy: 100 });
  assert.ok(out.crisp >= 62, `aggression ${out.crisp}`);
  assert.strictEqual(fuzzy.decideMode(out.crisp, 100), 'CHASE');
});

test('a far away, exhausted hunter calms down and rests', () => {
  const out = fuzzy.hunterBrain().evaluate({ distance: 30, energy: 5 });
  assert.ok(out.crisp < 38, `aggression ${out.crisp}`);
  assert.strictEqual(fuzzy.decideMode(out.crisp, 5), 'REST');
});

test('medium distance and medium energy gives an alert hunter that ambushes', () => {
  const out = fuzzy.hunterBrain().evaluate({ distance: 11, energy: 50 });
  assert.ok(out.crisp >= 38 && out.crisp < 62, `aggression ${out.crisp}`);
  assert.strictEqual(fuzzy.decideMode(out.crisp, 50), 'AMBUSH');
});

test('a calm hunter with energy left patrols instead of resting', () => {
  assert.strictEqual(fuzzy.decideMode(20, 60), 'PATROL');
});

test('the crisp output always stays inside 0..100', () => {
  const brain = fuzzy.hunterBrain();
  for (let d = 0; d <= 50; d += 2.5) {
    for (let e = 0; e <= 100; e += 10) {
      const { crisp } = brain.evaluate({ distance: d, energy: e });
      assert.ok(crisp >= 0 && crisp <= 100, `d=${d} e=${e} -> ${crisp}`);
    }
  }
});
