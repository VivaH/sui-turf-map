// ── MODULE: wallet.js ── Vendetta World Map v4.00 ──────────────────────────

// ── WALLET / RECALL MODAL ─────────────────────────────────────────────────────
// Known fixed shared objects from move_gangster_free transaction
const GAME_PKG     = '0x54a96d233f754afe62ad0e8b600b977d3f819be8b8c125391d135c3a4419332e';
const GAME_CONFIG  = '0xa32707eecb49cded77c0e9b8041a7a24fe930bd76407802115d290bba70a3a4e';
const TURF_REG     = '0x6e6910507846c5480fa5e7a271f7049dbe986178766982962329c176884b5777';
const ITEM_REG     = '0xe1cc20e7cb37aa5fa76a77322750e30a86c946e40cc9b139a393b5ea357a8586';
const GANG_CONFIG  = '0xc9c4e112571d9ef34fd229972a9080747a76771bb7be4170920f8664e588cd90';
const SCORE_REG    = '0x972b37a34632c49bbc734cc29b621270a33b74c378def52a32354ff1db43e693';
const CLOCK        = '0x0000000000000000000000000000000000000000000000000000000000000006';
const MAX_CALLS_PER_TX = 900;

let walletApi = null; // connected wallet

function openWalletModal(){
  const sel=garrisonRows.filter(r=>r.selected&&!r.tile.isHQ);
  if(!sel.length) return;

  // Find HQ tile object ID for this player
  const hqTile=tiles.find(t=>t.pid===garrisonPid&&t.isHQ&&t.oid);
  const units=sel.reduce((s,r)=>s+r.tile.gE+r.tile.gB+r.tile.gH,0);
  const txCount=Math.ceil(units/MAX_CALLS_PER_TX);

  document.getElementById('wallet-recall-summary').textContent=
    `${sel.length} turfs · ${units} units · ${txCount} transaction${txCount>1?'s':''}${!hqTile?' · ⚠ HQ object ID not found in data':''}`;

  // Pre-fill profile ID if known
  const p=players.find(pl=>pl.pid===garrisonPid);
  if(p) document.getElementById('wallet-profile').value=p.pid;

  // Try to restore saved DVD from localStorage
  const saved=localStorage.getItem('vendetta_dvd_id');
  if(saved) document.getElementById('wallet-dvd').value=saved;

  walletStatus('','');
  document.getElementById('wallet-execute-btn').style.display='none';
  document.getElementById('wallet-progress').textContent='';
  document.getElementById('wallet-modal').classList.add('open');
}

function closeWalletModal(){
  document.getElementById('wallet-modal').classList.remove('open');
}

function walletStatus(msg, color){
  const el=document.getElementById('wallet-status');
  el.textContent=msg;
  el.style.color=color||'#888';
}

async function connectWallet(){
  walletStatus('Looking for wallet...','#888');
  walletApi=null;

  // Re-fire app-ready so Slush registers if it wasn't ready at page load
  try{
    const reg=window.getWallets?.();
    if(reg) window.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:{register:reg.register}}));
  }catch(e){}
  await new Promise(r=>setTimeout(r,500));

  try{
    const reg=window.getWallets?.();
    if(reg){
      const list=typeof reg.get==='function'?reg.get():(reg.wallets||[]);
      if(list.length>0) return connectStandardWallet(list[0]);
    }
  }catch(e){}

  // Scan window for wallet objects as last resort
  for(const key of Object.keys(window)){
    try{
      const w=window[key];
      if(w&&typeof w==='object'&&w.features&&
        (w.features['sui:signAndExecuteTransaction']||
         w.features['sui:signAndExecuteTransactionBlock']||
         w.features['standard:connect'])){
        return connectStandardWallet(w);
      }
    }catch(e){}
  }

  walletStatus('❌ Slush not detected. Please refresh the page and try again.','var(--v-red)');
}

async function connectStandardWallet(w){
  try{
    const features=w.features||{};
    const connectFn=features['standard:connect'];
    const result=connectFn?await connectFn.connect():null;
    const accounts=result?.accounts?.length?result.accounts:(w.accounts||[]);
    const addr=accounts[0]?.address||'';
    walletApi={key:'standard', w, accounts};
    walletStatus(`✓ Connected: ${addr?addr.slice(0,12)+'...':w.name||'wallet'}`,'var(--v-green)');
    document.getElementById('wallet-execute-btn').style.display='block';
  }catch(err){
    walletStatus(`❌ Connect failed: ${err.message}`,'var(--v-red)');
  }
}

async function executeRecall(){
  const dvdId=document.getElementById('wallet-dvd').value.trim();
  const profileId=document.getElementById('wallet-profile').value.trim();
  if(!dvdId){
    walletStatus('❌ Please fill in your DVD NFT Object ID','var(--v-red)'); return;
  }
  if(!profileId){
    walletStatus('❌ Please fill in your Player Profile Object ID','var(--v-red)'); return;
  }
  if(!walletApi){
    walletStatus('❌ Connect wallet first','var(--v-red)'); return;
  }

  const hqTile=tiles.find(t=>t.pid===garrisonPid&&t.isHQ&&t.oid);
  if(!hqTile){
    walletStatus('❌ HQ object ID not found in data. Re-run data fetch first.','var(--v-red)'); return;
  }

  // Save DVD ID for next time
  localStorage.setItem('vendetta_dvd_id', dvdId);

  // Build list of individual move calls: {fromOid, type, count}
  const sel=garrisonRows.filter(r=>r.selected&&!r.tile.isHQ&&r.tile.oid);
  const calls=[];
  for(const row of sel){
    const t=row.tile;
    if(t.gE>0) calls.push({fromOid:t.oid, type:'enforcer',  count:t.gE});
    if(t.gB>0) calls.push({fromOid:t.oid, type:'bouncer',   count:t.gB});
    if(t.gH>0) calls.push({fromOid:t.oid, type:'henchman',  count:t.gH});
  }

  // Split into batches of MAX_CALLS_PER_TX individual unit moves
  // Each call moves `count` units at once (count is a u64 parameter)
  // So actually each call in calls[] is ONE Move call, not count calls
  // Based on the transaction: each call moves N units of one type from one turf
  const totalCalls=calls.length;
  if(!totalCalls){
    walletStatus('❌ No valid calls to submit — check garrison selection','var(--v-red)'); return;
  }
  const batches=[];
  for(let i=0;i<calls.length;i+=MAX_CALLS_PER_TX){
    batches.push(calls.slice(i,i+MAX_CALLS_PER_TX));
  }

  const prog=document.getElementById('wallet-progress');
  let done=0;

  for(let b=0;b<batches.length;b++){
    prog.textContent=`Building transaction ${b+1}/${batches.length}...`;
    prog.style.color='#888';

    // Build TransactionBlock using @mysten/sui.js if available, else fallback
    let txResult;
    try{
      txResult = await buildAndSignTx(batches[b], dvdId, profileId, hqTile.oid);
      done+=batches[b].length;
      prog.textContent=`✓ Tx ${b+1}/${batches.length} done · ${done}/${totalCalls} calls submitted`;
      prog.style.color='var(--v-green)';
    }catch(err){
      const msg=err?.message||err?.msg||(typeof err==='string'?err:JSON.stringify(err))||'Unknown error';
      console.error('Recall tx failed:',msg);
      prog.textContent=`❌ Tx ${b+1} failed: ${msg}`;
      prog.style.color='var(--v-red)';
      break;
    }
  }
}

async function loadSuiSdk(){
  if(window.__suiSdk) return;
  // Try local cached SDK first — eliminates esm.sh dependency
  // To enable: download sui-sdk.js (see README) and commit to repo root
  const localSources=[
    ['./sui-sdk-tx.js','./sui-sdk-client.js'], // local cache
  ];
  const remoteSources=[
    ['https://esm.sh/@mysten/sui@1.21.2/transactions','https://esm.sh/@mysten/sui@1.21.2/client'],
  ];
  for(const [txSrc,clientSrc] of [...localSources,...remoteSources]){
    try{
      const [txMod,clientMod]=await Promise.all([import(txSrc),import(clientSrc)]);
      if(!txMod?.Transaction) continue;
      window.__suiSdk={Transaction:txMod.Transaction,SuiClient:clientMod.SuiClient,getFullnodeUrl:clientMod.getFullnodeUrl};
      return;
    }catch(e){ /* try next source */ }
  }
  throw new Error('Failed to load SUI SDK from all sources. Check your connection.');
}

async function buildAndSignTx(calls, dvdId, profileId, hqOid){
  await loadSuiSdk();
  const {Transaction, SuiClient, getFullnodeUrl}=window.__suiSdk||{};
  if(!Transaction) throw new Error('SUI SDK not loaded. Check CDN connection.');

  const tx=new Transaction();
  for(const c of calls){
    tx.moveCall({
      target:`${GAME_PKG}::game::move_gangster_free`,
      arguments:[
        tx.object(GAME_CONFIG),
        tx.object(dvdId),
        tx.object(profileId),
        tx.object(TURF_REG),
        tx.object(ITEM_REG),
        tx.object(GANG_CONFIG),
        tx.object(c.fromOid),
        tx.object(hqOid),
        tx.object(SCORE_REG),
        tx.pure.string(c.type),
        tx.pure.u64(BigInt(c.count)),
        tx.object(CLOCK),
      ],
    });
  }

  const rawAccount=walletApi.accounts?.[0]||walletApi.w.accounts?.[0];
  const address=rawAccount?.address;
  if(!address) throw new Error('No account address found. Reconnect wallet.');

  // Build bytes — sidesteps class identity mismatch
  const suiClient=new SuiClient({url:getFullnodeUrl('mainnet')});
  tx.setSenderIfNotSet(address);
  let txBytes;
  try{
    txBytes=await tx.build({client:suiClient});
  }catch(buildErr){
    throw new Error('Transaction build failed: '+(buildErr?.message??String(buildErr)));
  }

  // Dry-run to catch errors before committing gas
  try{
    const dryRun=await suiClient.dryRunTransactionBlock({transactionBlock:btoa(String.fromCharCode(...txBytes))});
    const effects=dryRun?.effects;
    if(effects?.status?.status==='failure'){
      throw new Error('Dry-run failed: '+(effects.status.error||'unknown error'));
    }
  }catch(dryErr){
    if(dryErr.message.startsWith('Dry-run failed:')) throw dryErr;
    console.warn('Dry-run skipped (non-fatal):',dryErr.message);
  }

  const features=walletApi.w.features||{};

  // Strategy A — sui:signTransaction (v2) + manual execute via RPC
  const signOnlyFeat=features['sui:signTransaction'];
  if(signOnlyFeat?.signTransaction){
    try{
      const {bytes,signature}=await signOnlyFeat.signTransaction({
        transaction:tx,
        account:rawAccount,
        chain:'sui:mainnet',
      });
      const result=await suiClient.executeTransactionBlock({
        transactionBlock:bytes,
        signature,
        options:{showEffects:true,showErrors:true},
      });
      console.log('✅ Executed via sui:signTransaction, digest:',result.digest);
      return result;
    }catch(err){
      console.warn('sui:signTransaction failed:',err?.message??err,'— trying fallback');
    }
  }

  // Strategy B — sui:signAndExecuteTransaction (v2)
  const signExecFeat=features['sui:signAndExecuteTransaction'];
  if(signExecFeat?.signAndExecuteTransaction){
    const allAccounts=walletApi.w.accounts||[];
    const matchedAccount=allAccounts.find(a=>a.address===address)||rawAccount;
    try{
      const result=await signExecFeat.signAndExecuteTransaction({
        transaction:tx,
        account:matchedAccount,
        chain:'sui:mainnet',
      });
      console.log('✅ Executed via sui:signAndExecuteTransaction');
      return result;
    }catch(err){
      const msg=err?.message||(typeof err==='string'?err:null)||'Wallet rejected (no reason given)';
      throw new Error(msg);
    }
  }

  throw new Error('No supported signing feature found on wallet. Available: '+Object.keys(features).join(', '));
}

document.getElementById('wallet-modal').addEventListener('click',e=>{
  if(e.target===document.getElementById('wallet-modal')) closeWalletModal();
});
