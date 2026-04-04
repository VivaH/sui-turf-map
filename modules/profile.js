// ── MODULE: profile.js ── Vendetta World Map v4.00 ──────────────────────────

// ── PROFILE MODAL ─────────────────────────────────────────────────────────────
const PROFILE_WALLET_KEY = 'vwm_wallet_address';

function loadProfileWallet(){ return localStorage.getItem(PROFILE_WALLET_KEY)||''; }
function saveProfileWallet(){
  const val = document.getElementById('profile-wallet-input').value.trim();
  const st  = document.getElementById('profile-wallet-status');
  if(!val){ localStorage.removeItem(PROFILE_WALLET_KEY); st.textContent='Wallet cleared.'; st.style.color='#888'; return; }
  if(!val.startsWith('0x')||val.length<20){ st.textContent='Invalid address.'; st.style.color='#ff6b6b'; return; }
  localStorage.setItem(PROFILE_WALLET_KEY, val);
  st.textContent='Saved: '+val.slice(0,8)+'…'+val.slice(-4);
  st.style.color='#6fffa9';
  document.getElementById('profile-wallet-input').style.borderColor='#1D9E75';
}

function openProfileModal(){
  renderProfileCurrent();
  document.getElementById('profile-search').value='';
  document.getElementById('profile-results').style.display='none';
  document.getElementById('profile-results').innerHTML='';
  // Restore saved wallet
  const saved = loadProfileWallet();
  document.getElementById('profile-wallet-input').value = saved;
  const st = document.getElementById('profile-wallet-status');
  if(saved){ st.textContent='Saved: '+saved.slice(0,8)+'…'+saved.slice(-4); st.style.color='#888'; }
  else { st.textContent=''; }
  document.getElementById('profile-modal').classList.add('open');
}
function closeProfileModal(){
  document.getElementById('profile-modal').classList.remove('open');
}
document.getElementById('profile-modal').addEventListener('click',e=>{
  if(e.target===document.getElementById('profile-modal')) closeProfileModal();
});

function renderProfileCurrent(){
  const profiles = loadMyProfiles();
  const el = document.getElementById('profile-current');
  const pids = Object.keys(profiles);
  if(!pids.length){
    el.innerHTML='<div id="profile-empty">No profiles set — search for your name above.</div>';
    return;
  }
  el.innerHTML = pids.map(pid=>{
    const name = profiles[pid] || pid.slice(0,16)+'...';
    return `<div class="profile-entry">
      <span class="profile-entry-name">${esc(name)}</span>
      <span class="profile-entry-pid">${pid.slice(0,20)}...</span>
      <button class="profile-entry-remove" onclick="removeProfile('${pid}')">✕</button>
    </div>`;
  }).join('');
}

function addProfile(pid, name){
  const profiles = loadMyProfiles();
  profiles[pid] = name;
  saveMyProfiles(profiles);
  MY_IDS = new Set(Object.keys(profiles));
  // Reapply isMe flag on tiles and players
  for(const t of tiles) t.isMe = MY_IDS.has(t.pid);
  renderProfileCurrent();
  filterPlayers();
  drawMap(); drawMinimap();
}

function removeProfile(pid){
  const profiles = loadMyProfiles();
  delete profiles[pid];
  saveMyProfiles(profiles);
  MY_IDS = new Set(Object.keys(profiles));
  for(const t of tiles) t.isMe = MY_IDS.has(t.pid);
  renderProfileCurrent();
  filterPlayers();
  drawMap(); drawMinimap();
}

function onProfileSearch(val){
  const resultsEl = document.getElementById('profile-results');
  val = val.trim();
  if(!val){ resultsEl.style.display='none'; resultsEl.innerHTML=''; return; }

  // Direct PID paste
  if(val.startsWith('0x') && val.length >= 20){
    const match = players.find(p=>p.pid===val);
    const name = match ? match.name : '';
    resultsEl.style.display='block';
    resultsEl.innerHTML=`<div class="profile-result-row" onclick="addProfile('${val}','${esc(name||val.slice(0,12))}');document.getElementById('profile-search').value='';document.getElementById('profile-results').style.display='none'">
      <span class="profile-result-name">${esc(name||'[unknown]')}</span>
      <span class="profile-result-pid" style="font-size:9px;color:#888">${val.slice(0,20)}...</span>
    </div>`;
    return;
  }

  // Name search
  const q = val.toLowerCase();
  const matches = players.filter(p=>p.name&&p.name.toLowerCase().includes(q)).slice(0,8);
  if(!matches.length){ resultsEl.style.display='block'; resultsEl.innerHTML='<div style="padding:6px 10px;font-size:11px;color:#888;font-family:var(--font-mono)">No players found</div>'; return; }
  resultsEl.style.display='block';
  resultsEl.innerHTML = matches.map(p=>`<div class="profile-result-row" onclick="addProfile('${p.pid}','${esc(p.name)}');document.getElementById('profile-search').value='';document.getElementById('profile-results').style.display='none';renderProfileCurrent()">
    <span class="pr-name">${esc(p.name)}</span>
    <span class="pr-tiles">${p.tiles} turfs</span>
  </div>`).join('');
}
