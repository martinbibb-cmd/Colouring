// Resolve URLs relative to the site root (repo folder)
const BASE = new URL('./', window.location.href);          // e.g. https://user.github.io/Colouring/
const urlOf = (p) => new URL(p, BASE).toString();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(urlOf('sw.js'), { scope: urlOf('./') }).catch(console.error);
}

// Palette
const COLORS = ['#000000','#7f7f7f','#ffffff','#e6194B','#f58231','#ffe119','#bfef45','#3cb44b','#42d4f4','#4363d8','#911eb4','#f032e6','#a52a2a','#fabebe','#ffd8b1','#dcbeff','#9A6324','#800000'];
const paletteEl = document.getElementById('palette');
let current = COLORS[3];
function renderPalette(){
  paletteEl.innerHTML='';
  COLORS.forEach(c=>{
    const b=document.createElement('button');
    b.className='swatch'+(c===current?' active':'');
    b.style.background=c;
    b.addEventListener('click',()=>{ current=c; renderPalette(); });
    paletteEl.appendChild(b);
  });
}
renderPalette();

// Pages (SVGs)
const PAGES = [
  urlOf('art/colouring_page_1.svg'),
  urlOf('art/colouring_page_2.svg'),
  urlOf('art/colouring_page_3.svg'),
];

let page = 0;
const svgHost = document.getElementById('svgHost');
const pageLbl = document.getElementById('pageLbl');

async function loadPage(i){
  page = (i + PAGES.length) % PAGES.length;
  pageLbl.textContent = `Page ${page+1} / ${PAGES.length}`;
  try{
    const res = await fetch(PAGES[page], { cache: 'no-store' });
    if(!res.ok) throw new Error(res.status+' '+res.statusText);
    const text = await res.text();
    svgHost.innerHTML = text;
    const svg = svgHost.querySelector('svg');
    if (!svg) throw new Error('No <svg> found');
    if (!svg.getAttribute('viewBox')) {
      const w = parseFloat(svg.getAttribute('width')) || 1024;
      const h = parseFloat(svg.getAttribute('height')) || 1024;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.removeAttribute('width'); svg.removeAttribute('height');
    }
    svg.querySelectorAll('.paint').forEach(p=>{
      if(!p.hasAttribute('fill')) p.setAttribute('fill','transparent');
      p.style.pointerEvents='auto';
      p.addEventListener('click', ()=> p.setAttribute('fill', current));
    });
  }catch(err){
    console.error('Load error', err);
    svgHost.innerHTML = `<p style="padding:1rem;color:#b00">Failed to load SVG: ${err}</p>`;
  }
}
document.getElementById('prev').onclick = ()=> loadPage(page-1);
document.getElementById('next').onclick = ()=> loadPage(page+1);
document.getElementById('clear').onclick = ()=>{
  const svg = svgHost.querySelector('svg'); if(!svg) return;
  svg.querySelectorAll('.paint').forEach(p=>p.setAttribute('fill','transparent'));
};
document.getElementById('export').onclick = ()=>{
  const svg = svgHost.querySelector('svg'); if(!svg) return;
  const ser = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([ser], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = ()=>{
    const vb = (svg.getAttribute('viewBox')||'0 0 1024 1024').split(' ').map(Number);
    const [,,w,h] = vb;
    const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
    URL.revokeObjectURL(url);
    canvas.toBlob((b)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='colouring.png'; a.click(); }, 'image/png');
  };
  img.src = url;
};
loadPage(0);
