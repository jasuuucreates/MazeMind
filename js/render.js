// Canvas drawing helpers shared by every screen.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});

  // black and white; red is kept for the hunters only
  const COLORS = {
    floor: '#0b0b0b',
    wall: '#363636',
    closed: '#707070', // small dot in every expanded cell
    frontier: '#d4d4d4', // outlined square on every frontier cell
    path: '#ffffff',
    start: '#ffffff',
    goal: '#ffffff',
    hunter: '#e5484d',
  };
  const FONT = "'Source Sans 3', 'Source Sans Pro', 'Segoe UI', sans-serif";

  // size the canvas so the grid fits in maxW x maxH, sharp on high-DPI screens; returns cell size in CSS px
  function fitCanvas(canvas, grid, maxW, maxH) {
    const cell = Math.max(4, Math.floor(Math.min(maxW / grid.width, maxH / grid.height)));
    const w = cell * grid.width;
    const h = cell * grid.height;
    const dpr = root.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return cell;
  }

  function drawGrid(ctx, grid, cell) {
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, grid.width * cell, grid.height * cell);
    ctx.fillStyle = COLORS.wall;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.cells[y * grid.width + x] === 1) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  // square marker with a letter: filled for the start, outlined for the goal
  function drawMarker(ctx, grid, cell, i, letter, filled) {
    const [cx, cy] = center(grid, cell, i);
    const s = cell * 0.8;
    ctx.save();
    if (filled) {
      ctx.fillStyle = COLORS.start;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    } else {
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.strokeStyle = COLORS.goal;
      ctx.lineWidth = Math.max(1.5, cell * 0.1);
      ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    }
    ctx.fillStyle = filled ? COLORS.floor : COLORS.goal;
    ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.55))}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy + 0.5);
    ctx.restore();
  }

  function fillCells(ctx, grid, cell, cells, color, inset = 0) {
    ctx.fillStyle = color;
    const s = cell - inset * 2;
    for (const i of cells) {
      const x = i % grid.width;
      const y = (i - x) / grid.width;
      ctx.fillRect(x * cell + inset, y * cell + inset, s, s);
    }
  }

  // search overlays drawn as marks, not washes, so they never look like walls
  function dotCells(ctx, grid, cell, cells, color, scale = 0.26) {
    const d = Math.max(2, cell * scale);
    ctx.fillStyle = color;
    for (const i of cells) {
      const x = i % grid.width;
      const y = (i - x) / grid.width;
      ctx.fillRect(x * cell + (cell - d) / 2, y * cell + (cell - d) / 2, d, d);
    }
  }

  function outlineCells(ctx, grid, cell, cells, color, scale = 0.56) {
    const d = cell * scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, cell * 0.08);
    for (const i of cells) {
      const x = i % grid.width;
      const y = (i - x) / grid.width;
      ctx.strokeRect(x * cell + (cell - d) / 2, y * cell + (cell - d) / 2, d, d);
    }
  }

  function center(grid, cell, i) {
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    return [x * cell + cell / 2, y * cell + cell / 2];
  }

  function drawPath(ctx, grid, cell, path, color = COLORS.path, width) {
    if (!path || path.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || Math.max(2, cell * 0.28);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    path.forEach((i, k) => {
      const [cx, cy] = center(grid, cell, i);
      if (k === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawDot(ctx, grid, cell, i, color, scale = 0.36, glow = 0) {
    const [cx, cy] = center(grid, cell, i);
    ctx.save();
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLabel(ctx, grid, cell, i, text, color = '#0b0e1c') {
    const [cx, cy] = center(grid, cell, i);
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.5))}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }

  MM.render = { COLORS, FONT, fitCanvas, drawGrid, fillCells, dotCells, outlineCells, drawPath, drawDot, drawLabel, drawMarker, center };
})(typeof window !== 'undefined' ? window : globalThis);
