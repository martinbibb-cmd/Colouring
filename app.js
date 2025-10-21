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

// Palette
const COLORS = [
  '#000000','#7f7f7f','#ffffff',
  '#e6194B','#f58231','#ffe119',
  '#bfef45','#3cb44b','#42d4f4',
  '#4363d8','#911eb4','#f032e6',
  '#a52a2a','#fabebe','#ffd8b1',
  '#dcbeff','#9A6324','#800000'
];

const paletteEl = document.getElementById('palette');
let current = COLORS[3];

function renderPalette() {
  paletteEl.innerHTML = '';
  COLORS.forEach(c => {
    const sw = document.createElement('button');
    sw.className = 'swatch' + (c === current ? ' active' : '');
    sw.style.background = c;
    sw.ariaLabel = `Colour ${c}`;
    sw.addEventListener('click', () => {
      current = c;
      renderPalette();
    });
    paletteEl.appendChild(sw);
  });
}
renderPalette();

// SVG host
const svgHost = document.getElementById('svgHost');

// Load sample
document.getElementById('loadSample').addEventListener('click', async () => {
  const res = await fetch('./art/dinosaur.svg');
  const text = await res.text();
  loadSVG(text);
});

// Load user SVG
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  loadSVG(text);
});

// Clear
document.getElementById('clear').addEventListener('click', () => {
  const svg = svgHost.querySelector('svg');
  if (!svg) return;
  svg.querySelectorAll('.paint').forEach(p => p.setAttribute('fill', 'transparent'));
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

  svg.querySelectorAll('.paint').forEach(p => {
    // Defaults: see-through until coloured
    if (!p.hasAttribute('fill')) p.setAttribute('fill', 'transparent');
    p.style.pointerEvents = 'auto';
    p.addEventListener('click', () => {
      p.setAttribute('fill', current);
    });
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
    URL.revokeObjectURL(url);

    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'colouring.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  img.src = url;
}