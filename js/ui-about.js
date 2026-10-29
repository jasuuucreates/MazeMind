// "How it works" screen: membership-function charts drawn from the real fuzzy variables,
// a live rule table, and sliders to try the hunter's fuzzy controller by hand.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const $ = (id) => document.getElementById(id);
  // the three sets of a variable are told apart by line style, not colour
  const SET_STYLES = [
    { color: '#ffffff', dash: [] },
    { color: '#8c8c8c', dash: [] },
    { color: '#ffffff', dash: [5, 4] },
  ];

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
    ctx.strokeStyle = '#262626';
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(0));
    ctx.lineTo(w - pad.r, Y(0));
    ctx.stroke();
    ctx.fillStyle = '#6b6b6b';
    ctx.font = `12px ${MM.render.FONT}`;
    ctx.fillText(`${variable.min}`, pad.l, h - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${variable.max} ${unit}`, w - pad.r, h - 6);
    ctx.textAlign = 'left';
    if (curve) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(X(variable.min), Y(0));
      curve.forEach((m, k) => ctx.lineTo(X(variable.min + (k * (variable.max - variable.min)) / (curve.length - 1)), Y(m)));
      ctx.lineTo(X(variable.max), Y(0));
      ctx.fill();
    }
    Object.keys(variable.sets).forEach((label, k) => {
      ctx.strokeStyle = SET_STYLES[k].color;
      ctx.setLineDash(SET_STYLES[k].dash);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let s = 0; s <= 200; s++) {
        const v = variable.min + (s / 200) * (variable.max - variable.min);
        const y = Y(variable.membership(label, v));
        if (s) ctx.lineTo(X(v), y);
        else ctx.moveTo(X(v), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = SET_STYLES[k].color;
      ctx.font = `700 11px ${MM.render.FONT}`;
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
    if (marker !== undefined) line(marker, '#a1a1a1');
    if (crisp !== undefined) line(crisp, '#e5484d');
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
      td.style.background = `rgba(255, 255, 255, ${0.03 + r.strength * 0.32})`;
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
