// ── MODULE: route.js ── Vendetta World Map v4.00 ──────────────────────────
// ── A* PATHFINDING ────────────────────────────────────────────────────────────
class MinHeap{
  constructor(){this.h=[];}
  push(i){this.h.push(i);this._up(this.h.length-1);}
  pop(){const t=this.h[0],l=this.h.pop();if(this.h.length>0){this.h[0]=l;this._down(0);}return t;}
  _up(i){while(i>0){const p=(i-1)>>1;if(this.h[p][0]<=this.h[i][0])break;[this.h[p],this.h[i]]=[this.h[i],this.h[p]];i=p;}}
  _down(i){const n=this.h.length;while(true){let m=i,l=2*i+1,r=2*i+2;if(l<n&&this.h[l][0]<this.h[m][0])m=l;if(r<n&&this.h[r][0]<this.h[m][0])m=r;if(m===i)break;[this.h[m],this.h[i]]=[this.h[i],this.h[m]];i=m;}}
  get size(){return this.h.length;}
}

function findRoute(pidA,pidB){
  const tilesA=tiles.filter(t=>t.pid===pidA);
  const tilesB=tiles.filter(t=>t.pid===pidB);
  if(!tilesA.length||!tilesB.length) return null;
  let bx0=Infinity,bx1=-Infinity,by0=Infinity,by1=-Infinity;
  for(const t of tilesB){if(t.x<bx0)bx0=t.x;if(t.x>bx1)bx1=t.x;if(t.y<by0)by0=t.y;if(t.y>by1)by1=t.y;}
  function h(x,y){return Math.max(Math.max(0,bx0-x,x-bx1),Math.max(0,by0-y,y-by1));}
  const cxB=(bx0+bx1)/2,cyB=(by0+by1)/2;
  let st=tilesA[0],bd=Infinity;
  for(const t of tilesA){const d=Math.max(Math.abs(t.x-cxB),Math.abs(t.y-cyB));if(d<bd){bd=d;st=t;}}
  const targetSet=new Set(tilesB.map(t=>`${t.x},${t.y}`));
  const gScore=new Map(),cameFrom=new Map(),heap=new MinHeap();
  const sk=`${st.x},${st.y}`;
  gScore.set(sk,0);heap.push([h(st.x,st.y),st.x,st.y]);
  const bx0e=Math.min(minX,bx0)-5,bx1e=Math.max(maxX,bx1)+5;
  const by0e=Math.min(minY,by0)-5,by1e=Math.max(maxY,by1)+5;
  let iter=0;
  while(heap.size>0&&iter++<200000){
    const [f,x,y]=heap.pop();
    const key=`${x},${y}`;
    const g=gScore.get(key);
    if(g===undefined||f>g+h(x,y)+0.001) continue;
    if(targetSet.has(key)){
      const path=[];let cur=key;
      while(cur){
        const [cx,cy]=cur.split(',').map(Number);
        const tidx=tileMap.get(cur);
        let type='empty';
        if(targetSet.has(cur)) type='target';
        else if(tidx!==undefined) type=tiles[tidx].pid===pidA?'own':'conquer';
        path.unshift({x:cx,y:cy,type});
        cur=cameFrom.get(cur);
      }
      return path;
    }
    for(const [dx,dy] of DIRS8){
      const nx=x+dx,ny=y+dy;
      if(nx<bx0e||nx>bx1e||ny<by0e||ny>by1e) continue;
      const nkey=`${nx},${ny}`;
      const ng=g+1;
      if(gScore.has(nkey)&&gScore.get(nkey)<=ng) continue;
      gScore.set(nkey,ng);cameFrom.set(nkey,key);
      heap.push([ng+h(nx,ny),nx,ny]);
    }
  }
  return null;
}

// ── ROUTE MODE ────────────────────────────────────────────────────────────────
function toggleRouteMode(){
  routeMode=!routeMode;
  const btn=document.getElementById('route-btn');
  const ind=document.getElementById('route-indicator');
  const mw=document.getElementById('map-wrap');
  const pl=document.getElementById('player-list');
  if(routeMode){btn.classList.add('active');ind.style.display='';mw.classList.add('route-mode');pl.classList.add('route-mode-active');updateRouteIndicator();}
  else{btn.classList.remove('active');ind.style.display='none';mw.classList.remove('route-mode');pl.classList.remove('route-mode-active');clearRoute();}
}

function updateRouteIndicator(){
  const ind=document.getElementById('route-indicator');
  if(!routeMode){ind.style.display='none';return;}
  if(!routePidA) ind.textContent='Click turf or player → select A (start)';
  else if(!routePidB) ind.textContent='Select B (destination) — A selected';
  else ind.textContent='Route shown below';
}

function selectRoutePlayer(pid){
  if(!routeMode) return;
  if(!routePidA||routePidA===pid){routePidA=pid;routePidB=null;routePath=null;}
  else{routePidB=pid;computeAndShowRoute();}
  updateRouteIndicator();renderPlayerList();drawMap();
}

function computeAndShowRoute(){
  if(!routePidA||!routePidB) return;
  setTimeout(()=>{
    routePath=findRoute(routePidA,routePidB);
    routePathMap=routePath?new Map(routePath.map(s=>[`${s.x},${s.y}`,s.type])):null;
    showRoutePanel();drawMap();
    if(routePath) zoomToRoute();
  },50);
}

function showRoutePanel(){
  document.getElementById('route-panel').style.display='block';
  const pA=players.find(p=>p.pid===routePidA)||{};
  const pB=players.find(p=>p.pid===routePidB)||{};
  document.getElementById('rp-name-a').textContent=pA.name||'[unknown]';
  document.getElementById('rp-name-b').textContent=pB.name||'[unknown]';
  document.getElementById('rp-dot-a').style.background=pA.color||'#1D9E75';
  document.getElementById('rp-dot-b').style.background=pB.color||'#E24B4A';
  const noPath=document.getElementById('route-no-path');
  const stats=document.getElementById('route-stats');
  if(!routePath){noPath.style.display='block';stats.style.display='none';return;}
  noPath.style.display='none';stats.style.display='block';
  document.getElementById('rs-total').textContent=routePath.length;
  document.getElementById('rs-own').textContent=routePath.filter(s=>s.type==='own').length;
  document.getElementById('rs-empty').textContent=routePath.filter(s=>s.type==='empty').length;
  document.getElementById('rs-conquer').textContent=routePath.filter(s=>s.type==='conquer').length;
}

function clearRoute(){
  routePidA=null;routePidB=null;routePath=null;routePathMap=null;
  document.getElementById('route-panel').style.display='none';
  document.getElementById('route-stats').style.display='none';
  document.getElementById('route-no-path').style.display='none';
  document.getElementById('rp-name-a').textContent='—';
  document.getElementById('rp-name-b').textContent='—';
  updateRouteIndicator();renderPlayerList();drawMap();
}

function zoomToRoute(){
  if(!routePath||!routePath.length) return;
  let rx0=Infinity,rx1=-Infinity,ry0=Infinity,ry1=-Infinity;
  for(const s of routePath){if(s.x<rx0)rx0=s.x;if(s.x>rx1)rx1=s.x;if(s.y<ry0)ry0=s.y;if(s.y>ry1)ry1=s.y;}
  const cv=document.getElementById('map');
  zoom=Math.max(0.5,Math.min(20,Math.min(cv.width/((rx1-rx0+10)*CELL),cv.height/((ry1-ry0+10)*CELL))));
  panX=cv.width/2-((rx0+rx1)/2-minX)*CELL*zoom;
  panY=cv.height/2-(maxY-(ry0+ry1)/2)*CELL*zoom;
  drawMap();drawMinimap();
}
