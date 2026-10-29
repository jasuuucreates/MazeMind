// Mamdani fuzzy inference system that decides how aggressive a hunter is.
// Inputs: distance to the player (A* steps) and the hunter's energy. Output: aggression 0..100.
// Steps: fuzzify inputs -> evaluate rules (AND = min) -> clip outputs (implication = min)
//        -> combine (aggregation = max) -> centroid defuzzification.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});

  function trimf(x, a, b, c) {
    if (x === b) return 1;
    if (x <= a || x >= c) return 0;
    return x < b ? (x - a) / (b - a) : (c - x) / (c - b);
  }

  function trapmf(x, a, b, c, d) {
    if (x >= b && x <= c) return 1;
    if (x <= a || x >= d) return 0;
    return x < b ? (x - a) / (b - a) : (d - x) / (d - c);
  }

  class FuzzyVariable {
    // sets: { LABEL: [type, ...params] } where type is 'tri' or 'trap'
    constructor(name, min, max, sets) {
      this.name = name;
      this.min = min;
      this.max = max;
      this.sets = sets;
    }

    membership(label, x) {
      const [type, ...p] = this.sets[label];
      const v = Math.min(this.max, Math.max(this.min, x));
      return type === 'tri' ? trimf(v, ...p) : trapmf(v, ...p);
    }

    fuzzify(x) {
      const out = {};
      for (const label of Object.keys(this.sets)) out[label] = this.membership(label, x);
      return out;
    }
  }

  class FuzzySystem {
    constructor({ inputs, output, rules, resolution = 0.5 }) {
      this.inputs = inputs;
      this.output = output;
      this.rules = rules;
      this.resolution = resolution;
    }

    evaluate(values) {
      const degrees = {};
      for (const [name, variable] of Object.entries(this.inputs)) degrees[name] = variable.fuzzify(values[name]);

      // rule strength = min of the input memberships named in the rule
      const rules = this.rules.map((rule) => {
        let strength = 1;
        for (const [name, label] of Object.entries(rule.if)) strength = Math.min(strength, degrees[name][label]);
        return { if: rule.if, then: rule.then, strength };
      });

      // clip each output set at its rule strength and take the max over all rules
      const { min, max } = this.output;
      const steps = Math.round((max - min) / this.resolution);
      const curve = new Float32Array(steps + 1);
      let area = 0;
      let moment = 0;
      for (let k = 0; k <= steps; k++) {
        const y = min + k * this.resolution;
        let mu = 0;
        for (const r of rules) {
          if (r.strength > 0) mu = Math.max(mu, Math.min(r.strength, this.output.membership(r.then, y)));
        }
        curve[k] = mu;
        area += mu;
        moment += mu * y;
      }
      const crisp = area > 0 ? moment / area : (min + max) / 2; // centre of gravity
      return { crisp, degrees, rules, curve };
    }
  }

  const DISTANCE = new FuzzyVariable('distance', 0, 40, {
    NEAR: ['trap', 0, 0, 3, 8],
    MEDIUM: ['tri', 5, 11, 17],
    FAR: ['trap', 14, 20, 40, 40],
  });
  const ENERGY = new FuzzyVariable('energy', 0, 100, {
    LOW: ['trap', 0, 0, 20, 40],
    MEDIUM: ['tri', 25, 50, 75],
    HIGH: ['trap', 60, 80, 100, 100],
  });
  const AGGRESSION = new FuzzyVariable('aggression', 0, 100, {
    CALM: ['trap', 0, 0, 15, 40],
    ALERT: ['tri', 30, 50, 70],
    AGGRESSIVE: ['trap', 60, 85, 100, 100],
  });

  // 3 x 3 rule base: rows = distance, columns = energy
  const RULES = [
    { if: { distance: 'NEAR', energy: 'HIGH' }, then: 'AGGRESSIVE' },
    { if: { distance: 'NEAR', energy: 'MEDIUM' }, then: 'AGGRESSIVE' },
    { if: { distance: 'NEAR', energy: 'LOW' }, then: 'ALERT' },
    { if: { distance: 'MEDIUM', energy: 'HIGH' }, then: 'AGGRESSIVE' },
    { if: { distance: 'MEDIUM', energy: 'MEDIUM' }, then: 'ALERT' },
    { if: { distance: 'MEDIUM', energy: 'LOW' }, then: 'CALM' },
    { if: { distance: 'FAR', energy: 'HIGH' }, then: 'ALERT' },
    { if: { distance: 'FAR', energy: 'MEDIUM' }, then: 'CALM' },
    { if: { distance: 'FAR', energy: 'LOW' }, then: 'CALM' },
  ];

  let brain = null;
  function hunterBrain() {
    if (!brain) brain = new FuzzySystem({ inputs: { distance: DISTANCE, energy: ENERGY }, output: AGGRESSION, rules: RULES });
    return brain;
  }

  // crisp aggression -> what the hunter actually does
  function decideMode(aggression, energy) {
    if (aggression >= 62) return 'CHASE';
    if (aggression >= 38) return 'AMBUSH';
    return energy < 35 ? 'REST' : 'PATROL';
  }

  const api = { trimf, trapmf, FuzzyVariable, FuzzySystem, hunterBrain, decideMode, RULES };
  MM.fuzzy = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
