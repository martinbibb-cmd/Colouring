// Basic install prompt for PWA
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  installBtn.hidden = true;
  await deferredPrompt.prompt();
  deferredPrompt = null;
});

// Register SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// Canvas, palette & tools
const svgHost = document.getElementById('svgHost');
const paintCanvas = document.getElementById('paintCanvas');
const paintCtx = paintCanvas?.getContext('2d');
const canvasShell = document.querySelector('.canvas-shell');

const COLORS = [
  '#1c1b2f', '#2a2b45', '#383b5b', '#464b71',
  '#545c87', '#626d9d', '#707eb3', '#7f8fca',
  '#8da1e0', '#9cb2f7', '#b6c6ff', '#d0daff'
];

const paletteEl = document.getElementById('palette');
const toolPanel = document.getElementById('toolPanel');
let current = COLORS[Math.floor(COLORS.length / 2)];

const TOOL_DEFS = [
  { id: 'fill', label: 'Fill', icon: '🪣' },
  { id: 'pen', label: 'Pen', icon: '🖊️', size: 2 },
  { id: 'brush', label: 'Brush', icon: '🖌️', size: 7 },
  { id: 'spray', label: 'Spray', icon: '💨', size: 24, density: 32 }
];
const TOOL_LOOKUP = Object.fromEntries(TOOL_DEFS.map(tool => [tool.id, tool]));
let activeTool = 'brush';
let drawing = false;
let lastPoint = null;
let hasPainting = false;
let resizeFrame = 0;

function renderPalette() {
  if (!paletteEl) return;
  paletteEl.innerHTML = '';
  COLORS.forEach((colour) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'swatch' + (colour === current ? ' active' : '');
    sw.style.background = colour;
    sw.dataset.colour = colour;
    sw.setAttribute('aria-label', `Colour ${colour}`);
    sw.setAttribute('aria-pressed', colour === current ? 'true' : 'false');
    sw.addEventListener('click', () => {
      current = colour;
      renderPalette();
      const active = paletteEl.querySelector(`[data-colour="${colour}"]`);
      active?.focus();
    });
    paletteEl.appendChild(sw);
  });
}

function renderTools() {
  if (!toolPanel) return;
  toolPanel.innerHTML = '';
  TOOL_DEFS.forEach((tool) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = activeTool === tool.id ? 'active' : '';
    button.setAttribute('aria-pressed', activeTool === tool.id ? 'true' : 'false');
    button.setAttribute('data-tool', tool.id);
    button.addEventListener('click', () => selectTool(tool.id));

    const icon = document.createElement('span');
    icon.className = 'tool-icon';
    icon.textContent = tool.icon;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'tool-label';
    label.textContent = tool.label;

    button.appendChild(icon);
    button.appendChild(label);
    toolPanel.appendChild(button);
  });
}

function selectTool(toolId) {
  if (!TOOL_LOOKUP[toolId]) return;
  const previousFocus = document.activeElement;
  const hadToolFocus = previousFocus instanceof HTMLElement && previousFocus.getAttribute('data-tool');
  activeTool = toolId;
  drawing = false;
  lastPoint = null;
  renderTools();
  if (hadToolFocus && toolPanel) {
    const replacement = toolPanel.querySelector(`[data-tool="${toolId}"]`);
    replacement?.focus();
  }
  updateCanvasInteraction();
  updatePaintTargetCursors();
}

function updateCanvasInteraction() {
  if (!paintCanvas) return;
  const isFill = activeTool === 'fill';
  paintCanvas.classList.toggle('inactive', isFill);
}

function updatePaintTargetCursors() {
  if (!svgHost) return;
  const svg = svgHost.querySelector('svg');
  if (!svg) return;
  const cursor = activeTool === 'fill' ? 'pointer' : 'default';
  svg.querySelectorAll('.paint').forEach((node) => {
    node.style.cursor = cursor;
  });
}

function pointerPosition(event) {
  if (!paintCanvas) return { x: 0, y: 0 };
  const rect = paintCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function drawLine(from, to) {
  if (!paintCtx) return;
  const tool = TOOL_LOOKUP[activeTool];
  if (!tool?.size) return;
  paintCtx.strokeStyle = current;
  paintCtx.lineCap = 'round';
  paintCtx.lineJoin = 'round';
  paintCtx.lineWidth = tool.size;
  paintCtx.beginPath();
  paintCtx.moveTo(from.x, from.y);
  paintCtx.lineTo(to.x, to.y);
  paintCtx.stroke();
  hasPainting = true;
}

function sprayAt(point) {
  if (!paintCtx) return;
  const tool = TOOL_LOOKUP[activeTool];
  if (!tool) return;
  const radius = (tool.size || 24) / 2;
  const density = tool.density || 32;
  paintCtx.save();
  paintCtx.fillStyle = current;
  paintCtx.globalAlpha = 0.55;
  for (let i = 0; i < density; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const x = point.x + Math.cos(angle) * distance;
    const y = point.y + Math.sin(angle) * distance;
    const dotRadius = Math.random() * (tool.size / 10) + 0.6;
    paintCtx.beginPath();
    paintCtx.arc(x, y, dotRadius, 0, Math.PI * 2);
    paintCtx.fill();
  }
  paintCtx.restore();
  hasPainting = true;
}

function sprayLine(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 6));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t
    };
    sprayAt(point);
  }
}

function handlePointerDown(event) {
  if (!paintCanvas || !paintCtx) return;
  if (activeTool === 'fill') return;
  event.preventDefault();
  drawing = true;
  lastPoint = pointerPosition(event);
  if (paintCanvas.setPointerCapture) {
    paintCanvas.setPointerCapture(event.pointerId);
  }
  if (activeTool === 'spray') {
    sprayAt(lastPoint);
  } else {
    drawLine(lastPoint, lastPoint);
  }
}

function handlePointerMove(event) {
  if (!drawing) return;
  event.preventDefault();
  const point = pointerPosition(event);
  if (activeTool === 'spray') {
    sprayLine(lastPoint, point);
  } else {
    drawLine(lastPoint, point);
  }
  lastPoint = point;
}

function stopDrawing(event) {
  if (!drawing) return;
  if (event?.pointerId != null && paintCanvas?.releasePointerCapture) {
    if (paintCanvas.hasPointerCapture?.(event.pointerId)) {
      paintCanvas.releasePointerCapture(event.pointerId);
    }
  }
  drawing = false;
  lastPoint = null;
}

function clearPainting() {
  if (!paintCanvas || !paintCtx) return;
  paintCtx.save();
  paintCtx.setTransform(1, 0, 0, 1, 0, 0);
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  paintCtx.restore();
  hasPainting = false;
}

function resizeCanvas() {
  if (!paintCanvas || !paintCtx || !canvasShell) return;
  const rect = canvasShell.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  const snapshot = hasPainting ? paintCanvas.toDataURL('image/png') : null;
  paintCanvas.width = rect.width * dpr;
  paintCanvas.height = rect.height * dpr;
  paintCanvas.style.width = `${rect.width}px`;
  paintCanvas.style.height = `${rect.height}px`;
  paintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (snapshot) {
    const img = new Image();
    img.onload = () => {
      paintCtx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = snapshot;
  } else {
    clearPainting();
  }
}

renderPalette();
renderTools();
updateCanvasInteraction();
requestAnimationFrame(resizeCanvas);

if (paintCanvas) {
  paintCanvas.addEventListener('pointerdown', handlePointerDown);
  paintCanvas.addEventListener('pointermove', handlePointerMove);
  paintCanvas.addEventListener('pointerup', stopDrawing);
  paintCanvas.addEventListener('pointercancel', stopDrawing);
  paintCanvas.addEventListener('pointerleave', stopDrawing);
  paintCanvas.addEventListener('lostpointercapture', () => {
    drawing = false;
    lastPoint = null;
  });
}

window.addEventListener('resize', () => {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    resizeCanvas();
  });
});

const SAMPLE_ART = [
  { file: './art/dinosaur.svg', title: 'Dinosaur' },
  { file: './art/dogs-coloring-drawing.svg', title: 'Dogs' },
  { file: './art/dogs-bird-coloring.svg', title: 'Dogs & Bird' },
  { file: './art/girl-unicorn.svg', title: 'Girl & Unicorn' }
];

async function fetchAndLoadSVG(path) {
  const res = await fetch(path);
  const text = await res.text();
  loadSVG(text);
}

// Load sample
document.getElementById('loadSample').addEventListener('click', () => {
  fetchAndLoadSVG(SAMPLE_ART[0].file);
});

// Load user SVG
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  loadSVG(text);
});

// Thumbnail picker
const choosePictureBtn = document.getElementById('choosePicture');
const thumbnailOverlay = document.getElementById('thumbnailOverlay');
const thumbnailGrid = document.getElementById('thumbnailGrid');
const closeThumbnailBtn = document.getElementById('closeThumbnail');

if (choosePictureBtn && thumbnailOverlay && thumbnailGrid && closeThumbnailBtn) {
  renderThumbnailGrid();

  const hideThumbnailOverlay = () => {
    thumbnailOverlay.hidden = true;
    choosePictureBtn.focus();
  };

  const showThumbnailOverlay = () => {
    thumbnailOverlay.hidden = false;
    const firstButton = thumbnailGrid.querySelector('button');
    firstButton?.focus();
  };

  choosePictureBtn.addEventListener('click', () => {
    showThumbnailOverlay();
  });

  closeThumbnailBtn.addEventListener('click', () => {
    hideThumbnailOverlay();
  });

  thumbnailOverlay.addEventListener('click', (event) => {
    if (event.target === thumbnailOverlay) {
      hideThumbnailOverlay();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!thumbnailOverlay.hidden && event.key === 'Escape') {
      hideThumbnailOverlay();
    }
  });
}

// Clear
document.getElementById('clear').addEventListener('click', () => {
  const svg = svgHost.querySelector('svg');
  if (svg) {
    svg.querySelectorAll('.paint').forEach(p => p.setAttribute('fill', 'transparent'));
  }
  clearPainting();
});

// Export
document.getElementById('export').addEventListener('click', () => {
  const svg = svgHost.querySelector('svg');
  if (!svg) return;
  exportSVGasPNG(svg);
});

// Inject SVG and wire events
function loadSVG(svgText) {
  // Ensure fills are present & clickable; require regions to have class="paint"
  svgHost.innerHTML = svgText;
  const svg = svgHost.querySelector('svg');
  if (!svg) return;

  // Make sure viewBox exists (better scaling); if missing, try to infer from width/height
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width')) || 1024;
    const h = parseFloat(svg.getAttribute('height')) || 1024;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }
  const viewBox = svg.getAttribute('viewBox') || '0 0 1024 1024';
  const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
  if (canvasShell && Number.isFinite(vbWidth) && Number.isFinite(vbHeight) && vbWidth > 0 && vbHeight > 0) {
    canvasShell.style.aspectRatio = `${vbWidth} / ${vbHeight}`;
  }

  svg.querySelectorAll('.paint').forEach(p => {
    // Defaults: see-through until coloured
    if (!p.hasAttribute('fill')) p.setAttribute('fill', 'transparent');
    p.style.pointerEvents = 'auto';
    p.addEventListener('click', () => {
      if (activeTool !== 'fill') return;
      p.setAttribute('fill', current);
    });
  });
  clearPainting();
  updatePaintTargetCursors();
  requestAnimationFrame(resizeCanvas);
}

function renderThumbnailGrid() {
  thumbnailGrid.innerHTML = '';
  SAMPLE_ART.forEach(({ file, title }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'listitem');
    button.addEventListener('click', () => {
      fetchAndLoadSVG(file);
      thumbnailOverlay.hidden = true;
      choosePictureBtn.focus();
    });

    const img = document.createElement('img');
    img.src = file;
    img.alt = `${title} thumbnail`;

    const caption = document.createElement('span');
    caption.textContent = title;

    button.appendChild(img);
    button.appendChild(caption);

    thumbnailGrid.appendChild(button);
  });
}

// Export helper: render SVG to Canvas, then download
function exportSVGasPNG(svg) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const vb = (svg.getAttribute('viewBox') || '0 0 1024 1024').split(' ').map(Number);
    const w = vb[2], h = vb[3];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const finalize = () => {
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'colouring.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    };

    const mergePainting = () => {
      if (!hasPainting || !paintCanvas) {
        finalize();
        return;
      }
      const paintingUrl = paintCanvas.toDataURL('image/png');
      const paintingImg = new Image();
      paintingImg.onload = () => {
        ctx.drawImage(paintingImg, 0, 0, w, h);
        finalize();
      };
      paintingImg.onerror = finalize;
      paintingImg.src = paintingUrl;
    };

    mergePainting();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
