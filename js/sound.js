// Small sound effects made with the Web Audio API (oscillators, no sound files).
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});
  let ctx = null;

  // browsers only allow audio after the user has pressed a key or clicked, so start it lazily
  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, length, type = 'square', volume = 0.06, slideTo) {
    const a = audio();
    if (!a || sound.muted) return;
    const t = a.currentTime + start;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  const sound = {
    muted: false,
    unlock: audio,
    gem() {
      tone(660, 0, 0.09, 'square', 0.05, 990);
    },
    caught() {
      tone(180, 0, 0.35, 'sawtooth', 0.07, 70);
    },
    won() {
      [523, 659, 784, 1047].forEach((f, k) => tone(f, k * 0.11, 0.16, 'triangle', 0.08));
    },
  };

  MM.sound = sound;
})(typeof window !== 'undefined' ? window : globalThis);
