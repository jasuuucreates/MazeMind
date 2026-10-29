// Canvas drawing helpers shared by every screen.
(function (root) {
  'use strict';
  const MM = (root.MazeMind = root.MazeMind || {});

  const COLORS = {
    floor: '#0e1226',
    wall: '#3a4270',
    wallTop: '#4d5791',
    closed: 'rgba(192, 132, 252, 0.42)',
    frontier: 'rgba(251, 191, 36, 0.6)',
    path: '#2dd4bf',
    start: '#4ade80',
    goal: '#f87171',
  };

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
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.cells[y * grid.width + x] !== 1) continue;
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(x * cell, y * cell, cell, Math.max(1, cell * 0.18));
      }
    }
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
    ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }

  MM.render = { COLORS, fitCanvas, drawGrid, fillCells, drawPath, drawDot, drawLabel, center };
})(typeof window !== 'undefined' ? window : globalThis);
