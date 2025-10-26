const BASE = new URL('./', window.location.href);
const urlOf = (p) => new URL(p, BASE).toString();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(urlOf('sw.js'), { scope: urlOf('./') }).catch(console.error);
}

const host = document.getElementById('canvasHost');
const whiteCanvas = document.getElementById('whiteLayer');
const paintCanvas = document.getElementById('paintLayer');
const lineArtEl = document.getElementById('lineArt');
const ctx = paintCanvas.getContext('2d', { willReadFrequently: true });
const whiteCtx = whiteCanvas.getContext('2d');

let drawing = false;
let tool = 'paintbrush';
let colour = '#3aa3ff';
let brushSize = 18;
let alpha = 1;
let lastPoint = null;
let lastStampPoint = null;
let rafToken = null;
let resizePending = false;
let currentArtSrc = '';
const history = [];
const MAX_HISTORY = 30;

const lineArtImage = new Image();
lineArtImage.crossOrigin = 'anonymous';
lineArtImage.addEventListener('load', () => {
  lineArtEl.src = lineArtImage.src;
  if (lineArtImage.naturalWidth && lineArtImage.naturalHeight) {
    host.style.aspectRatio = `${lineArtImage.naturalWidth} / ${lineArtImage.naturalHeight}`;
  }
  resizeNow();
});

const DPR = () => window.devicePixelRatio || 1;

function snapshot() {
  try {
    history.push(paintCanvas.toDataURL('image/png'));
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
      ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      resolve();
    };
    img.src = url;
  });
}

function clearPaint() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  ctx.restore();
}

function setCanvasSize(wCSS, hCSS) {
  if (!wCSS || !hCSS) return;
  const dpr = DPR();
  const w = Math.max(1, Math.round(wCSS * dpr));
  const h = Math.max(1, Math.round(hCSS * dpr));
  if (paintCanvas.width === w && paintCanvas.height === h) return;

  const off = document.createElement('canvas');
  off.width = paintCanvas.width;
  off.height = paintCanvas.height;
  if (off.width && off.height) {
    off.getContext('2d').drawImage(paintCanvas, 0, 0);
  }

  paintCanvas.width = w;
  paintCanvas.height = h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  if (off.width && off.height) {
    ctx.drawImage(off, 0, 0, off.width / dpr, off.height / dpr);
  }

  whiteCanvas.width = w;
  whiteCanvas.height = h;
  whiteCtx.setTransform(1, 0, 0, 1, 0, 0);
  whiteCtx.scale(dpr, dpr);
  whiteCtx.fillStyle = '#ffffff';
  whiteCtx.fillRect(0, 0, wCSS, hCSS);

  lineArtEl.style.width = `${wCSS}px`;
  lineArtEl.style.height = `${hCSS}px`;
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

const STAMPS = [
  {
    id: 'circle',
    icon: '●',
    draw(ctxDraw, size) {
      ctxDraw.beginPath();
      ctxDraw.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctxDraw.fill();
    },
  },
  {
    id: 'star',
    icon: '★',
    draw(ctxDraw, size) {
      const outer = size / 2;
      const inner = outer * 0.5;
      ctxDraw.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const x = Math.cos(angle) * outer;
        const y = Math.sin(angle) * outer;
        if (i === 0) {
          ctxDraw.moveTo(x, y);
        } else {
          ctxDraw.lineTo(x, y);
        }
        const angle2 = angle + Math.PI / 5;
        ctxDraw.lineTo(Math.cos(angle2) * inner, Math.sin(angle2) * inner);
      }
      ctxDraw.closePath();
      ctxDraw.fill();
    },
  },
  {
    id: 'heart',
    icon: '❤',
    draw(ctxDraw, size) {
      const r = size / 2;
      ctxDraw.beginPath();
      ctxDraw.moveTo(0, r * 0.6);
      ctxDraw.bezierCurveTo(r, -r * 0.2, r, -r, 0, -r * 0.3);
      ctxDraw.bezierCurveTo(-r, -r, -r, -r * 0.2, 0, r * 0.6);
      ctxDraw.closePath();
      ctxDraw.fill();
    },
  },
  {
    id: 'flower',
    icon: '✿',
    draw(ctxDraw, size) {
      const petal = size / 3;
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI * 2 * i) / 6;
        const x = Math.cos(angle) * petal;
        const y = Math.sin(angle) * petal;
        ctxDraw.beginPath();
        ctxDraw.arc(x, y, petal / 1.5, 0, Math.PI * 2);
        ctxDraw.fill();
      }
      ctxDraw.beginPath();
      ctxDraw.arc(0, 0, petal / 1.2, 0, Math.PI * 2);
      ctxDraw.fill();
    },
  },
  {
    id: 'diamond',
    icon: '◆',
    draw(ctxDraw, size) {
      const r = size / 2;
      ctxDraw.beginPath();
      ctxDraw.moveTo(0, -r);
      ctxDraw.lineTo(r, 0);
      ctxDraw.lineTo(0, r);
      ctxDraw.lineTo(-r, 0);
      ctxDraw.closePath();
      ctxDraw.fill();
    },
  },
];

let activeStampId = STAMPS[0].id;

const stampPicker = document.getElementById('stampPicker');
const stampButtons = new Map();
STAMPS.forEach((stamp) => {
  const btn = document.createElement('button');
  btn.className = 'tool stamp';
  btn.type = 'button';
  btn.textContent = stamp.icon;
  if (stamp.id === activeStampId) {
    btn.classList.add('active');
  }
  btn.addEventListener('click', () => {
    activeStampId = stamp.id;
    stampButtons.forEach((b, key) => {
      if (key === stamp.id) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  });
  stampButtons.set(stamp.id, btn);
  stampPicker.appendChild(btn);
});

function getPos(evt) {
  const rect = paintCanvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

function drawStampAt(point) {
  const stamp = STAMPS.find((s) => s.id === activeStampId);
  if (!stamp) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.translate(point.x, point.y);
  stamp.draw(ctx, brushSize);
  ctx.restore();
}

function drawStampLine(from, to) {
  if (!from) {
    drawStampAt(to);
    return;
  }
  const spacing = Math.max(6, brushSize * 0.8);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return;
  const angle = Math.atan2(dy, dx);
  let covered = spacing;
  while (covered <= distance) {
    const point = {
      x: from.x + Math.cos(angle) * covered,
      y: from.y + Math.sin(angle) * covered,
    };
    drawStampAt(point);
    covered += spacing;
  }
}

function drawStroke(from, to) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;

  if (tool === 'paintbrush') {
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  } else if (tool === 'pen') {
    ctx.lineWidth = Math.max(1, brushSize * 0.4);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  } else if (tool === 'spray') {
    const density = Math.max(12, Math.floor(brushSize * 1.8));
    const radiusMax = brushSize / 2;
    for (let i = 0; i < density; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * radiusMax;
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

  if (tool === 'stamp') {
    lastStampPoint = pos;
    drawStampAt(pos);
    return;
  }

  drawStroke(pos, pos);
}

function pointerMove(evt) {
  if (!drawing) return;
  evt.preventDefault();
  const pos = getPos(evt);
  if (rafToken) cancelAnimationFrame(rafToken);
  rafToken = requestAnimationFrame(() => {
    if (tool === 'stamp') {
      drawStampLine(lastStampPoint, pos);
      lastStampPoint = pos;
    } else {
      drawStroke(lastPoint, pos);
      lastPoint = pos;
    }
  });
}

function pointerUp(evt) {
  if (!drawing) return;
  evt.preventDefault();
  drawing = false;
  if (tool === 'stamp' && lastStampPoint) {
    drawStampAt(lastStampPoint);
  }
  lastPoint = null;
  lastStampPoint = null;
  if (resizePending) {
    resizePending = false;
    resizeNow();
  }
}

paintCanvas.addEventListener('pointerdown', pointerDown);
paintCanvas.addEventListener('pointermove', pointerMove);
window.addEventListener('pointerup', pointerUp);
paintCanvas.addEventListener('pointerleave', pointerUp);

paintCanvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
paintCanvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
paintCanvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const artSelect = document.getElementById('artSelect');
const resetArtBtn = document.getElementById('resetArtBtn');

undoBtn.addEventListener('click', async () => {
  if (!history.length) return;
  const last = history.pop();
  await restore(last);
});

clearBtn.addEventListener('click', () => {
  snapshot();
  clearPaint();
});

downloadBtn.addEventListener('click', () => {
  const out = document.createElement('canvas');
  out.width = paintCanvas.width;
  out.height = paintCanvas.height;
  const octx = out.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(paintCanvas, 0, 0);
  if (lineArtImage.naturalWidth && lineArtImage.naturalHeight) {
    octx.drawImage(lineArtImage, 0, 0, out.width, out.height);
  }
  const link = document.createElement('a');
  link.download = 'colouring.png';
  link.href = out.toDataURL('image/png');
  link.click();
});

function loadArt(src, { resetPaint = true, resetHistory = true } = {}) {
  if (resetPaint) {
    clearPaint();
  }
  if (resetHistory) {
    history.length = 0;
  }
  currentArtSrc = src;
  lineArtImage.src = urlOf(src);
}

artSelect.addEventListener('change', () => {
  loadArt(artSelect.value);
});

resetArtBtn.addEventListener('click', () => {
  artSelect.value = currentArtSrc;
  loadArt(currentArtSrc);
});

loadArt(artSelect.value, { resetHistory: false });
