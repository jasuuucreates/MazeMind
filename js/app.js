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

  root.addEventListener('hashchange', () => show(location.hash.slice(1)));
  root.addEventListener('DOMContentLoaded', () => show(location.hash.slice(1)));
})(window);
