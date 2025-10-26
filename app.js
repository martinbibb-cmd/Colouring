const BASE = new URL('./', window.location.href);
const urlOf = (p) => new URL(p, BASE).toString();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(urlOf('sw.js'), { scope: urlOf('./') }).catch(console.error);
}

const host = document.getElementById('canvasHost');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let drawing = false;
let tool = 'brush';
let colour = '#3aa3ff';
let brushSize = 18;
let alpha = 1;
let lastPoint = null;
let rafToken = null;
let resizePending = false;
const history = [];
const MAX_HISTORY = 30;

const DPR = () => window.devicePixelRatio || 1;

function snapshot() {
  try {
    history.push(canvas.toDataURL('image/png'));
    if (history.length > MAX_HISTORY) history.shift();
  } catch (err) {
    console.warn('Snapshot failed', err);
  }
}

function restore(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      resolve();
    };
    img.src = url;
  });
}

function setCanvasSize(wCSS, hCSS) {
  const dpr = DPR();
  const w = Math.max(1, Math.floor(wCSS * dpr));
  const h = Math.max(1, Math.floor(hCSS * dpr));
  if (canvas.width === w && canvas.height === h) return;

  const off = document.createElement('canvas');
  off.width = canvas.width;
  off.height = canvas.height;
  const octx = off.getContext('2d');
  octx.drawImage(canvas, 0, 0);

  canvas.width = w;
  canvas.height = h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, wCSS, hCSS);
  if (off.width && off.height) {
    ctx.drawImage(off, 0, 0, off.width / dpr, off.height / dpr);
  }
}

function resizeNow() {
  const rect = host.getBoundingClientRect();
  setCanvasSize(rect.width, rect.height);
}

const resizeObserver = new ResizeObserver(() => {
  if (drawing) {
    resizePending = true;
    return;
  }
  resizeNow();
});
resizeObserver.observe(host);
resizeNow();

const toolButtons = document.querySelectorAll('.tool[data-tool]');
toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    toolButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    tool = btn.dataset.tool;
  });
});

const sizeEl = document.getElementById('size');
const sizeOut = document.getElementById('sizeOut');
sizeEl.addEventListener('input', () => {
  brushSize = Number(sizeEl.value);
  sizeOut.textContent = brushSize;
});

const alphaEl = document.getElementById('alpha');
const alphaOut = document.getElementById('alphaOut');
alphaEl.addEventListener('input', () => {
  alpha = Number(alphaEl.value);
  alphaOut.textContent = alpha.toFixed(2);
});

const picker = document.getElementById('picker');
picker.addEventListener('input', () => {
  colour = picker.value;
});

const palette = [
  '#000000',
  '#ffffff',
  '#ff4757',
  '#ffa502',
  '#fffa65',
  '#2ed573',
  '#1e90ff',
  '#3742fa',
  '#a55eea',
  '#70a1ff',
  '#2f3542',
  '#ced6e0',
];

const swatches = document.getElementById('swatches');
palette.forEach((c) => {
  const swatch = document.createElement('button');
  swatch.className = 'swatch';
  swatch.style.background = c;
  swatch.addEventListener('click', () => {
    colour = c;
    picker.value = c;
  });
  swatches.appendChild(swatch);
});

function getPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

function drawStroke(from, to) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;

  if (tool === 'brush') {
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  } else if (tool === 'spray') {
    const density = Math.max(10, Math.floor(brushSize * 1.5));
    for (let i = 0; i < density; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (brushSize / 2);
      const x = to.x + Math.cos(angle) * radius;
      const y = to.y + Math.sin(angle) * radius;
      ctx.fillRect(x, y, 1, 1);
    }
  } else if (tool === 'fill') {
    ctx.globalCompositeOperation = 'source-over';
    const rect = host.getBoundingClientRect();
    ctx.fillRect(0, 0, rect.width, rect.height);
  }
  ctx.restore();
}

function pointerDown(evt) {
  evt.preventDefault();
  const pos = getPos(evt);
  snapshot();

  if (tool === 'fill') {
    drawStroke(pos, pos);
    if (resizePending) {
      resizePending = false;
      resizeNow();
    }
    return;
  }

  drawing = true;
  lastPoint = pos;
  drawStroke(pos, pos);
}

function pointerMove(evt) {
  if (!drawing) return;
  evt.preventDefault();
  const pos = getPos(evt);
  if (rafToken) cancelAnimationFrame(rafToken);
  rafToken = requestAnimationFrame(() => {
    drawStroke(lastPoint, pos);
    lastPoint = pos;
  });
}

function pointerUp(evt) {
  if (!drawing) return;
  evt.preventDefault();
  drawing = false;
  lastPoint = null;
  if (resizePending) {
    resizePending = false;
    resizeNow();
  }
}

canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
window.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointerleave', pointerUp);

canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');

undoBtn.addEventListener('click', async () => {
  if (!history.length) return;
  const last = history.pop();
  await restore(last);
});

clearBtn.addEventListener('click', () => {
  snapshot();
  const rect = host.getBoundingClientRect();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(DPR(), DPR());
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.restore();
});

downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'colouring.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

(function seedBackground() {
  const rect = host.getBoundingClientRect();
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.restore();
})();
