// "How it works" screen: membership-function charts drawn from the real fuzzy variables,
// a live rule table, and sliders to try the hunter's fuzzy controller by hand.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const $ = (id) => document.getElementById(id);
  const SET_COLORS = ['#38bdf8', '#fbbf24', '#f87171'];

  function setupCanvas(canvas, w, h) {
    const dpr = root.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // plots every set of a fuzzy variable; optional marker at x and optional filled output curve
  function plotVariable(canvas, variable, unit, marker, curve, crisp) {
    const w = Math.max(240, canvas.parentElement.clientWidth);
    const h = 150;
    const ctx = setupCanvas(canvas, w, h);
    const pad = { l: 8, r: 8, t: 22, b: 22 };
    const X = (v) => pad.l + ((v - variable.min) / (variable.max - variable.min)) * (w - pad.l - pad.r);
    const Y = (m) => h - pad.b - m * (h - pad.t - pad.b);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#2a3256';
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(0));
    ctx.lineTo(w - pad.r, Y(0));
    ctx.stroke();
    ctx.fillStyle = '#9aa3c7';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`${variable.min}`, pad.l, h - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${variable.max} ${unit}`, w - pad.r, h - 6);
    ctx.textAlign = 'left';
    if (curve) {
      ctx.fillStyle = 'rgba(45, 212, 191, 0.28)';
      ctx.beginPath();
      ctx.moveTo(X(variable.min), Y(0));
      curve.forEach((m, k) => ctx.lineTo(X(variable.min + (k * (variable.max - variable.min)) / (curve.length - 1)), Y(m)));
      ctx.lineTo(X(variable.max), Y(0));
      ctx.fill();
    }
    Object.keys(variable.sets).forEach((label, k) => {
      ctx.strokeStyle = SET_COLORS[k];
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let s = 0; s <= 200; s++) {
        const v = variable.min + (s / 200) * (variable.max - variable.min);
        const y = Y(variable.membership(label, v));
        if (s) ctx.lineTo(X(v), y);
        else ctx.moveTo(X(v), y);
      }
      ctx.stroke();
      ctx.fillStyle = SET_COLORS[k];
      ctx.font = '700 11px system-ui, sans-serif';
      const [, ...p] = variable.sets[label];
      const peak = (p[1] + p[p.length - 2]) / 2;
      ctx.textAlign = 'center';
      ctx.fillText(label, Math.min(w - 40, Math.max(30, X(peak))), pad.t - 8);
      ctx.textAlign = 'left';
    });
    const line = (v, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X(v), pad.t - 4);
      ctx.lineTo(X(v), Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (marker !== undefined) line(marker, '#e6e9f5');
    if (crisp !== undefined) line(crisp, '#2dd4bf');
  }

  function update() {
    const brain = MM.fuzzy.hunterBrain();
    const distance = Number($('fz-d').value);
    const energy = Number($('fz-e').value);
    const out = brain.evaluate({ distance, energy });
    const mode = MM.fuzzy.decideMode(out.crisp, energy);
    $('fz-d-v').textContent = distance + ' steps';
    $('fz-e-v').textContent = energy;
    plotVariable($('fz-dist'), brain.inputs.distance, 'steps', distance);
    plotVariable($('fz-energy'), brain.inputs.energy, '', energy);
    plotVariable($('fz-aggr'), brain.output, '', undefined, out.curve, out.crisp);
    $('fz-out').innerHTML = `Aggression (centroid) = <b>${out.crisp.toFixed(1)}</b> &rarr; mode <b>${mode}</b>`;
    // rule table: rows = distance, columns = energy, shade = firing strength
    const cells = document.querySelectorAll('#fz-rules td[data-d]');
    cells.forEach((td) => {
      const r = out.rules.find((x) => x.if.distance === td.dataset.d && x.if.energy === td.dataset.e);
      td.style.background = `rgba(45, 212, 191, ${0.08 + r.strength * 0.6})`;
      td.innerHTML = `${r.then}<br><small>${r.strength.toFixed(2)}</small>`;
    });
  }

  const about = {
    started: false,
    init() {
      $('fz-d').addEventListener('input', update);
      $('fz-e').addEventListener('input', update);
      root.addEventListener('resize', () => about.started && MM.current === 'about' && update());
    },
    show() {
      if (!this.started) {
        this.started = true;
        this.init();
      }
      update();
    },
  };

  MM.about = about;
})(window);
