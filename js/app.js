// Tab switching between the screens; each screen sets itself up the first time it is shown.
(function (root) {
  'use strict';
  const MM = root.MazeMind;
  const VIEWS = ['play', 'lab', 'evolve', 'about'];

  function show(name) {
    if (!VIEWS.includes(name)) name = 'play';
    VIEWS.forEach((v) => {
      document.getElementById('view-' + v).classList.toggle('active', v === name);
      document.querySelector(`nav.tabs a[href="#${v}"]`).classList.toggle('active', v === name);
    });
    const screen = MM[name];
    if (screen && typeof screen.show === 'function') screen.show();
    MM.current = name;
  }

  // '?' opens the shortcuts list on every screen (Esc closes it, the browser handles that)
  function openHelp() {
    const dlg = document.getElementById('help');
    if (!dlg.open) dlg.showModal();
  }
  root.addEventListener('keydown', (ev) => {
    if (ev.key === '?' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) openHelp();
  });
  root.addEventListener('DOMContentLoaded', () => document.getElementById('help-open').addEventListener('click', openHelp));

  root.addEventListener('hashchange', () => show(location.hash.slice(1)));
  root.addEventListener('DOMContentLoaded', () => show(location.hash.slice(1)));
})(window);
