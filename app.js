// ------- base url helper (works on /<repo>/ subpath) -------
const BASE = new URL('./', window.location.href);
const urlOf = p => new URL(p, BASE).toString();

// ------- PWA SW registration -------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(urlOf('sw.js'), { scope: urlOf('./') }).catch(console.error);
}

// ------- palette -------
const COLORS = ['#000000','#7f7f7f','#ffffff','#e6194B','#f58231','#ffe119',
                '#bfef45','#3cb44b','#42d4f4','#4363d8','#911eb4','#f032e6',
                '#a52a2a','#fabebe','#ffd8b1','#dcbeff','#9A6324','#800000'];

const paletteEl = document.getElementById('palette');
let currentColor = COLORS[3];
function renderPalette(){
  paletteEl.innerHTML = '';
  COLORS.forEach(c=>{
    const b = document.createElement('button');
    b.className = 'swatch' + (c===currentColor?' active':'');
    b.style.background = c;
    b.addEventListener('click', ()=>{ currentColor=c; renderPalette(); });
    paletteEl.appendChild(b);
  });
}
renderPalette();

// ------- pages (SVGs to colour) -------
const PAGES = [
  urlOf('art/colouring_page_1.svg'),
  urlOf('art/colouring_page_2.svg'),
  urlOf('art/colouring_page_3.svg'),
];

let page = 0;
const svgHost = document.getElementById('svgHost');
const svgWrap = document.getElementById('svgWrap');
const draw = document.getElementById('draw');  // canvas overlay
const pageLbl = document.getElementById('pageLbl');

let vbW = 1024, vbH = 1024;   // default viewBox size
let ctx = draw.getContext('2d');

// ------- tools -------
const toolButtons = document.querySelectorAll('.tool');
let tool = 'fill'; // 'fill' | 'brush' | 'spray'
function setTool(t){
  tool = t;
  toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool===t));
}
toolButtons.forEach(b => b.addEventListener('click', ()=> setTool(b.dataset.tool)));
setTool('fill');

const sizeInput = document.getElementById('size');
const opacityInput = document.getElementById('opacity');
function brushSize(){ return parseInt(sizeInput.value, 10); }
function brushAlpha(){ return parseFloat(opacityInput.value); }

// ------- load page -------
async function loadPage(i){
  page = (i + PAGES.length) % PAGES.length;
  pageLbl.textContent = `Page ${page+1} / ${PAGES.length}`;

  const res = await fetch(PAGES[page], { cache: 'no-store' });
  const text = await res.text();
  svgHost.innerHTML = text;

  const svg = svgHost.querySelector('svg');
  if (!svg) throw new Error('No <svg> found');

  // ensure viewBox exists and record its size
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
  if (vb.length === 4 && vb.every(n=>!isNaN(n))) {
    vbW = vb[2]; vbH = vb[3];
  } else {
    const w = parseFloat(svg.getAttribute('width')) || 1024;
    const h = parseFloat(svg.getAttribute('height')) || 1024;
    vbW = w; vbH = h;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('width'); svg.removeAttribute('height');
  }

  // prepare drawing canvas pixels to match viewBox
  draw.width = vbW;
  draw.height = vbH;
  ctx.clearRect(0,0,draw.width,draw.height);

  // enable fill on .paint regions
  svg.querySelectorAll('.paint').forEach(p=>{
    if (!p.hasAttribute('fill')) p.setAttribute('fill','transparent');
    p.style.pointerEvents = 'auto';
    p.addEventListener('click', (e)=>{
      if (tool !== 'fill') return;
      p.setAttribute('fill', currentColor);
      e.stopPropagation();
    });
  });
}
document.getElementById('prev').onclick = ()=> loadPage(page-1);
document.getElementById('next').onclick = ()=> loadPage(page+1);

// ------- utilities: map pointer to canvas coords -------
function canvasPoint(evt){
  const box = draw.getBoundingClientRect();
  const x = (evt.clientX - box.left) * (draw.width / box.width);
  const y = (evt.clientY - box.top)  * (draw.height / box.height);
  return {x,y};
}

// ------- brush & spray drawing on canvas overlay -------
let drawing = false;
let lastPt = null;

function startDraw(e){
  if (tool === 'fill') return; // fill handled by SVG click
  drawing = true;
  lastPt = canvasPoint(e);
  if (tool === 'brush') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = currentColor;
    ctx.globalAlpha = brushAlpha();
    ctx.lineWidth = brushSize();
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
  } else if (tool === 'spray') {
    sprayTick(e);
  }
  e.preventDefault();
}
function moveDraw(e){
  if (!drawing) return;
  const pt = canvasPoint(e);
  if (tool === 'brush') {
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  } else if (tool === 'spray') {
    sprayTick(e);
  }
  lastPt = pt;
  e.preventDefault();
}
function endDraw(){
  if (!drawing) return;
  drawing = false;
  if (tool === 'brush') ctx.closePath();
}

function sprayTick(e){
  const pt = canvasPoint(e);
  const r = brushSize();
  const density = Math.ceil(r * 1.5);
  ctx.fillStyle = currentColor;
  ctx.globalAlpha = brushAlpha();
  for (let i=0;i<density;i++){
    const a = Math.random()*Math.PI*2;
    const d = Math.random()*r;
    const x = pt.x + Math.cos(a)*d;
    const y = pt.y + Math.sin(a)*d;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

// pointer events
draw.addEventListener('pointerdown', startDraw);
draw.addEventListener('pointermove', moveDraw);
window.addEventListener('pointerup', endDraw);
draw.addEventListener('pointerleave', endDraw);

// ------- buttons: clear/export -------
document.getElementById('clear').onclick = ()=>{
  // clear fills
  const svg = svgHost.querySelector('svg');
  if (svg) svg.querySelectorAll('.paint').forEach(p=>p.setAttribute('fill','transparent'));
  // clear drawing
  ctx.clearRect(0,0,draw.width,draw.height);
};

document.getElementById('export').onclick = ()=>{
  const svg = svgHost.querySelector('svg');
  if (!svg) return;
  const ser = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const svgBlob = new Blob([ser], {type:'image/svg+xml'});
  img.onload = ()=>{
    const canvas = document.createElement('canvas');
    canvas.width = vbW; canvas.height = vbH;
    const c2 = canvas.getContext('2d');
    // draw SVG
    c2.drawImage(img, 0, 0, vbW, vbH);
    // draw overlay strokes
    c2.drawImage(draw, 0, 0);
    canvas.toBlob(b=>{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'colouring.png';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };
  img.src = URL.createObjectURL(svgBlob);
};

// ------- go -------
loadPage(0);
