// ── MODULE: ui-helpers.js ── Vendetta World Map v4.00 ──────────────────────────

// ── COORDINATE RULER ─────────────────────────────────────────────────────────
function updateRuler(){
  if(!tiles.length) return;
  const cv=_mapCv||document.getElementById('map');
  const W=cv.width, H=cv.height;
  const cs=CELL*zoom;

  // Skip if view hasn't changed (innerHTML assignment forces layout)
  const _sig=`${W}|${H}|${cs.toFixed(1)}|${panX|0}|${panY|0}`;
  if(_sig===updateRuler._last) return;
  updateRuler._last=_sig;

  // Decide tick spacing based on zoom
  const minPx=40; // minimum pixels between ticks
  const candidates=[1,2,5,10,20,50,100,200];
  let step=candidates.find(s=>s*cs>=minPx)||200;

  // X ruler
  const rx=document.getElementById('ruler-x');
  const wx0=Math.ceil((0-panX)/cs+minX);
  const wx1=Math.floor((W-panX)/cs+minX);
  const xStart=Math.ceil((Math.floor((0-panX)/cs)+minX)/step)*step;
  let xHtml='';
  for(let wx=xStart;wx<=(Math.floor((W-panX)/cs)+minX);wx+=step){
    const sx=(wx-minX)*cs+panX;
    if(sx<0||sx>W) continue;
    xHtml+=`<span class="ruler-tick" style="left:${sx}px">${wx}</span>`;
  }
  rx.innerHTML=xHtml;

  // Y ruler
  const ry=document.getElementById('ruler-y');
  const yStart=Math.ceil((Math.floor(maxY-(H-panY)/cs))/step)*step;
  const yEnd=Math.floor(maxY-(-panY)/cs);
  let yHtml='';
  for(let wy=yStart;wy<=yEnd;wy+=step){
    const sy=(maxY-wy)*cs+panY;
    if(sy<0||sy>H) continue;
    yHtml+=`<span class="ruler-tick" style="top:${sy}px">${wy}</span>`;
  }
  ry.innerHTML=yHtml;
}
function _openToolbarDD(btnId, ddId){
  // Close all other dropdowns first
  ['intel-dropdown','more-dropdown'].forEach(id=>{
    if(id!==ddId) document.getElementById(id).classList.remove('open');
  });
  const btn = document.getElementById(btnId);
  const dd  = document.getElementById(ddId);
  if(dd.classList.contains('open')){ dd.classList.remove('open'); return; }
  const r = btn.getBoundingClientRect();
  dd.style.top  = (r.bottom + 2) + 'px';
  // On mobile: align right edge of dropdown to right edge of button
  if(window.innerWidth <= 768){
    dd.style.left  = '';
    dd.style.right = (window.innerWidth - r.right) + 'px';
  } else {
    dd.style.right = '';
    dd.style.left  = r.left + 'px';
  }
  dd.classList.add('open');
}
function toggleIntelMenu(){ _openToolbarDD('intel-btn','intel-dropdown'); }
function closeIntelMenu(){ document.getElementById('intel-dropdown').classList.remove('open'); }
function toggleMoreMenu(){ _openToolbarDD('more-btn','more-dropdown'); }
function closeMoreMenu(){ document.getElementById('more-dropdown').classList.remove('open'); }

// ── COMPACT MODE ──────────────────────────────────────────────────────────────
function toggleCompact(btn){
  compactMode=!compactMode;
  document.getElementById('player-list').classList.toggle('compact',compactMode);
  document.getElementById('right-panel').classList.toggle('compact',compactMode);
  btn.classList.toggle('on',compactMode);
  btn.dataset.tip=compactMode?'Normal view':'Compact view';
  // Shorten filter labels in compact mode to save space
  const fBtn=document.querySelector('.fb[onclick*="friends"]');
  const eBtn=document.querySelector('.fb[onclick*="enemies"]');
  if(fBtn) fBtn.textContent = compactMode ? '♥' : '♥ Friends';
  if(eBtn) eBtn.textContent = compactMode ? '✕' : '✕ Enemies';
  // Resize canvas after transition completes
  setTimeout(()=>{ resizeCanvas(); drawMap(); drawMinimap(); }, 220);
}

// ── TOP 10 MODE ───────────────────────────────────────────────────────────────
function toggleTop10(){
  top10Mode=!top10Mode;
  const btn=document.getElementById('top10-btn');
  btn.classList.toggle('top10-active',top10Mode);
  if(top10Mode){
    top10Pids=new Set(players.slice(0,10).map(p=>p.pid));
    MY_IDS.forEach(id=>top10Pids.add(id));
  }
  drawMap();
}
