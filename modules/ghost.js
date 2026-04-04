// ── MODULE: ghost.js ── Vendetta World Map v4.00 ──────────────────────────

let ghostMode = false;
let ghostTiles = []; // [{x,y,pid,name,dist}] closest ghost turfs
let _ghostRaf = 0;   // dedicated rAF handle for ghost pulse animation

function toggleGhostMode(){
  ghostMode = !ghostMode;
  const btn = document.getElementById('ghost-dd-btn');
  btn.classList.toggle('ghost-active', ghostMode);
  if(ghostMode){ computeGhostTiles(); _startGhostLoop(); }
  else{ ghostTiles = []; _stopGhostLoop(); }
  drawMap();
}

function _startGhostLoop(){
  if(_ghostRaf) return;
  function loop(){
    if(!ghostMode || !ghostTiles.length){ _ghostRaf=0; return; }
    drawMap();
    _ghostRaf = requestAnimationFrame(loop);
  }
  _ghostRaf = requestAnimationFrame(loop);
}
function _stopGhostLoop(){
  if(_ghostRaf){ cancelAnimationFrame(_ghostRaf); _ghostRaf=0; }
}

function computeGhostTiles(){
  ghostTiles = [];
  if(!selectedPid) return;

  // Ghost players = exactly 1 tile, not my own profile
  const ghostPids = new Set(
    players.filter(p => p.tiles === 1 && !MY_IDS.has(p.pid)).map(p => p.pid)
  );
  if(!ghostPids.size) return;

  // My tiles for distance calculation
  const myTiles = tiles.filter(t => t.pid === selectedPid);
  if(!myTiles.length) return;

  const pidName = Object.fromEntries(players.map(p=>[p.pid, p.name||'[unknown]']));

  const ghosts = tiles.filter(t => ghostPids.has(t.pid));
  const scored = ghosts.map(g => {
    // Chebyshev distance to nearest own tile
    let minDist = Infinity;
    for(const m of myTiles){
      const d = Math.max(Math.abs(g.x - m.x), Math.abs(g.y - m.y));
      if(d < minDist) minDist = d;
    }
    // Garrison cost: total defenders (0 = undefended = best target)
    const garrison = (g.gH||0) + (g.gB||0) + (g.gE||0);
    // Combined score: lower = better target
    // Normalize: distance matters most, garrison is tiebreaker
    // garrison weight: each defender ~= 2 extra tiles of distance
    const score = minDist + garrison * 2;
    return {x:g.x, y:g.y, pid:g.pid, name:pidName[g.pid]||'', dist:minDist, garrison, score};
  });

  // Sort by combined score (distance + garrison cost), keep top 20
  scored.sort((a,b) => a.score - b.score);
  ghostTiles = scored.slice(0, 20);
}

function drawGhostTiles(ctx){
  if(!ghostMode || !ghostTiles.length) return;
  const cs = CELL * zoom;
  const now = performance.now();
  ghostTiles.forEach((g, i) => {
    const sx = (g.x - minX) * cs + panX;
    const sy = (maxY - g.y) * cs + panY;
    if(sx < -cs || sx > ctx.canvas.width + cs) return;
    if(sy < -cs || sy > ctx.canvas.height + cs) return;

    const speed = i < 5 ? 1800 : 2800;
    const pulse = 0.5 + 0.5 * Math.sin(now / speed * Math.PI * 2);
    const baseAlpha = i < 5 ? 0.9 : i < 10 ? 0.65 : 0.4;
    const alpha = baseAlpha * (0.6 + 0.4 * pulse);
    const bw = Math.max(1.5, cs * 0.14);

    // Color: green = no garrison, yellow = some, red = heavy
    const gar = g.garrison || 0;
    const r = gar === 0 ? 111 : gar < 5 ? 255 : 255;
    const gr = gar === 0 ? 255 : gar < 5 ? 220 : 80;
    const b  = gar === 0 ? 169 : gar < 5 ? 50  : 50;

    ctx.fillStyle = `rgba(${r},${gr},${b},${alpha * 0.18})`;
    ctx.fillRect(sx, sy, cs, cs);
    ctx.strokeStyle = `rgba(${r},${gr},${b},${alpha})`;
    ctx.lineWidth = bw;
    ctx.strokeRect(sx + bw/2, sy + bw/2, cs - bw, cs - bw);

    if(cs >= 14){
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if(i < 5){
        // Show rank number
        ctx.fillStyle = `rgba(${r},${gr},${b},${alpha})`;
        ctx.font = `bold ${Math.min(10, cs*0.45)}px monospace`;
        ctx.fillText(i+1, sx + cs/2, sy + cs/2);
      } else if(gar > 0 && cs >= 18){
        // Show garrison count for non-top-5
        ctx.fillStyle = `rgba(${r},${gr},${b},${alpha * 0.8})`;
        ctx.font = `${Math.min(8, cs*0.35)}px monospace`;
        ctx.fillText(gar, sx + cs/2, sy + cs/2);
      }
    }
  });
}
