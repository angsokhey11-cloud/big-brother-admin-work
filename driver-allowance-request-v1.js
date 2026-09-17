/* BIG BROTHER — Driver Allowance Request V1
   Stock Out -> Pending Admin Allowance -> Approved Staff Relation earning.
   This extension only augments the Admin Work Staff Request page. */
(function(){
'use strict';
if(window.BBDriverAllowanceRequestV1)return;
window.BBDriverAllowanceRequestV1=true;

const SUPABASE_URL='https://sjfhlaclgmkwwofzstok.supabase.co';
const SUPABASE_KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
const SESSION_KEY='BB_SUPABASE_DEV_SESSION_V1';
let session=null,payload={requests:[],count:0},current=null;
const $=id=>document.getElementById(id);
const clean=v=>String(v==null?'':v).trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function money(v,c='USD'){return clean(c).toUpperCase()==='KHR'?'៛'+num(v).toLocaleString('en-US',{maximumFractionDigits:0}):'$'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function date(v){const r=clean(v),m=r.match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return r||'-';const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${m[3]}-${mo[+m[2]-1]}-${m[1]}`}

function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}}
function saveSession(v){session=v||null;try{if(!v){localStorage.removeItem(SESSION_KEY);return}if(!v.expires_at&&v.expires_in)v.expires_at=Math.floor(Date.now()/1000)+Number(v.expires_in);localStorage.setItem(SESSION_KEY,JSON.stringify(v))}catch(_){}}
async function parse(r){const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(_){d={message:t}}if(!r.ok)throw new Error(d.message||d.error_description||d.error||('Database request failed ('+r.status+')'));return d}
async function refreshSession(){const c=readSession();if(!c?.refresh_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:c.refresh_token}),cache:'no-store'});const n=await parse(r);saveSession(n);return n}
async function ensureSession(){session=readSession();if(!session?.access_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');if(session.expires_at&&Number(session.expires_at)<Math.floor(Date.now()/1000)+45)await refreshSession();return session}
async function rpc(fn,args={}){await ensureSession();const call=()=>fetch(SUPABASE_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args||{}),cache:'no-store'});let r=await call();if(r.status===401){await refreshSession();r=await call()}return parse(r)}

function injectStyle(){
  if($('bb-driver-allowance-style'))return;
  const s=document.createElement('style');s.id='bb-driver-allowance-style';s.textContent=`
    .bb-driver-lines{width:100%;border-collapse:collapse;min-width:0}.bb-driver-lines th,.bb-driver-lines td{padding:8px;border-bottom:1px solid #e6edf5;font-size:10px}.bb-driver-lines th{position:static;background:#f7f9fc}.bb-driver-amount{font-size:18px!important;font-weight:900!important;color:#173f77!important}.bb-driver-help{margin-top:5px;color:#6f8195;font-size:9px;line-height:1.4}.bb-driver-flow{border:1px solid #c9d8ec;background:#edf5ff;color:#245da8;border-radius:9px;padding:9px 11px;font-size:10px;font-weight:800;margin:0 0 12px}
  `;document.head.appendChild(s);
}

function injectUI(){
  if($('driverAllowanceCount'))return;
  injectStyle();
  const hero=document.querySelector('.hero p');if(hero)hero.textContent='Admin Work → Staff Request → Driver Allowance, Payment, Leave & Salary Advance approvals';
  const summary=document.querySelector('.summary');
  if(summary){const card=document.createElement('div');card.className='sum';card.innerHTML='<small>Driver Allowance</small><strong id="driverAllowanceCount">0</strong><div class="sub">Batch Stock Out jobs waiting for amount approval.</div>';summary.appendChild(card)}
  const tabs=document.querySelector('.tabs');
  if(tabs){const b=document.createElement('button');b.className='tab';b.type='button';b.id='driverAllowanceTab';b.innerHTML='🚚 Driver Allowance <span id="driverAllowanceTabCount"></span>';tabs.insertBefore(b,tabs.firstChild);b.addEventListener('click',()=>activateDriverTab())}
  const firstPanel=document.querySelector('.panel');
  if(firstPanel){const section=document.createElement('section');section.id='tab-driver-allowance';section.className='panel';section.innerHTML='<div class="card"><div class="card-head"><strong>Pending Driver Allowance</strong><span>Created automatically from Batch Stock Out · Admin sets the amount</span></div><div class="tablewrap"><table><thead><tr><th>Request</th><th>Batch</th><th>Driver</th><th>Location</th><th class="money">Issued Qty</th><th>Status</th><th>Action</th></tr></thead><tbody id="driverAllowanceRows"></tbody></table></div></div>';firstPanel.parentNode.insertBefore(section,firstPanel)}
  const note=document.querySelector('.note');if(note)note.textContent='Driver Allowance approval creates an AVAILABLE earning in Staff Relation; it does not mark cash as paid. Staff Payment approval remains the step that creates the PAID Staff Expense.';
  injectModal();
}

function activateDriverTab(){
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  $('driverAllowanceTab')?.classList.add('active');$('tab-driver-allowance')?.classList.add('active');
}

function injectModal(){
  if($('bbDriverAllowanceModal'))return;
  const m=document.createElement('div');m.id='bbDriverAllowanceModal';m.className='modal';m.hidden=true;
  m.innerHTML=`<div class="modalbox"><div class="modalhead"><div><h2 id="bbDaTitle">Review Driver Allowance</h2><p id="bbDaSub">Batch Stock Out → Admin sets allowance → Staff Relation</p></div><button id="bbDaClose" class="close" type="button">×</button></div><div class="modalbody"><div class="bb-driver-flow">This approval confirms the driver's allowance amount only. It will become an Available earning in Staff Relation and can be paid later through the normal Staff Payment flow.</div><div id="bbDaInfo" class="info"></div><div class="detail-section"><div class="detail-title">Batch Stock Out Items</div><div id="bbDaItems"></div></div><div class="field"><label>Allowance Amount (USD)</label><input id="bbDaAmount" class="bb-driver-amount" type="number" min="0" step="0.01" placeholder="Enter allowance amount"><div class="bb-driver-help">No fixed rate is used. Enter the amount you want to approve for this driver and this batch.</div></div><div class="field"><label>Admin Note</label><textarea id="bbDaNote" placeholder="Optional note..."></textarea></div><div id="bbDaStatus" class="status"></div><div class="modalactions"><button id="bbDaReject" class="btn danger" type="button">Reject</button><button id="bbDaApprove" class="btn primary" type="button">Approve Allowance</button></div></div></div>`;
  document.body.appendChild(m);
  $('bbDaClose').onclick=closeModal;$('bbDaReject').onclick=()=>decide('REJECT');$('bbDaApprove').onclick=()=>decide('APPROVE');
  m.addEventListener('click',e=>{if(e.target===m)closeModal()});
}

function renderRows(){
  const rows=Array.isArray(payload?.requests)?payload.requests:[];
  const body=$('driverAllowanceRows');if(!body)return;
  body.innerHTML=rows.length?rows.map(r=>`<tr><td><strong>${esc(r.requestNo)}</strong><br>${esc(date(r.createdAt))}</td><td><strong>${esc(r.batchId)}</strong><br>${esc(date(r.batchDate))} · ${esc(r.batchStatus||'-')}</td><td><strong>${esc(r.driverName)}</strong><br>${esc(r.driverStaffId)} · ${esc(r.driverRole==='DRIVER_2'?'Driver 2':'Driver 1')}</td><td><strong>${esc(r.locationName||r.locationCode)}</strong><br>${esc(r.locationCode)}</td><td class="money"><strong>${num(r.issuedQty).toLocaleString()}</strong></td><td><span class="badge pending">PENDING</span></td><td><button class="review bb-da-review" data-id="${r.allowanceRequestId}" type="button">Review</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">No pending Driver Allowance request.</td></tr>';
  body.querySelectorAll('.bb-da-review').forEach(b=>b.onclick=()=>openModal(Number(b.dataset.id)));
}

async function load(){
  try{
    injectUI();
    const [da,all]=await Promise.all([
      rpc('bb_staff_relation_admin_driver_allowance_requests',{p_limit:200}),
      rpc('bb_staff_relation_admin_requests',{p_limit:1})
    ]);
    payload=da?.success?da:{requests:[],count:0};
    const c=Number(payload.count||0), counts=all?.counts||{};
    if($('driverAllowanceCount'))$('driverAllowanceCount').textContent=c.toLocaleString();
    if($('driverAllowanceTabCount'))$('driverAllowanceTabCount').textContent=c?'('+c+')':'';
    if($('totalPending'))$('totalPending').textContent=(c+Number(counts.paymentRequests||0)+Number(counts.leaveRequests||0)+Number(counts.specialRequests||0)).toLocaleString();
    renderRows();
  }catch(e){console.error('Driver Allowance:',e);const body=$('driverAllowanceRows');if(body)body.innerHTML='<tr><td colspan="7" class="empty">'+esc(e?.message||String(e))+'</td></tr>'}
}

function openModal(id){
  current=(payload.requests||[]).find(x=>Number(x.allowanceRequestId)===Number(id));if(!current)return;
  $('bbDaTitle').textContent='🚚 '+clean(current.requestNo)+' · '+clean(current.driverName);
  $('bbDaSub').textContent=clean(current.batchId)+' · '+date(current.batchDate)+' · '+clean(current.locationName||current.locationCode);
  $('bbDaInfo').innerHTML=`<div class="ibox"><small>Driver</small><strong>${esc(current.driverName)}</strong><div>${esc(current.driverStaffId)} · ${esc(current.driverRole==='DRIVER_2'?'Driver 2':'Driver 1')}</div></div><div class="ibox"><small>Batch</small><strong>${esc(current.batchId)}</strong><div>${esc(current.batchStatus||'-')} · ${esc(date(current.batchDate))}</div></div><div class="ibox"><small>Issued Qty</small><strong>${num(current.issuedQty).toLocaleString()}</strong><div>${esc(current.locationName||current.locationCode)}</div></div>`;
  const items=Array.isArray(current.items)?current.items:[];
  $('bbDaItems').innerHTML=items.length?`<table class="bb-driver-lines"><thead><tr><th>Product</th><th>Unit</th><th class="money">Issued</th><th class="money">Sold</th><th class="money">Pending</th></tr></thead><tbody>${items.map(x=>`<tr><td><strong>${esc(x.productName)}</strong><br>${esc(x.productCode)}</td><td>${esc(x.unit||'-')}</td><td class="money">${num(x.issuedQty).toLocaleString()}</td><td class="money">${num(x.soldQty).toLocaleString()}</td><td class="money">${num(x.pendingQty).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No batch item detail found.</div>';
  $('bbDaAmount').value='';$('bbDaNote').value='';$('bbDaStatus').textContent='';$('bbDaStatus').className='status';
  $('bbDriverAllowanceModal').hidden=false;setTimeout(()=>$('bbDaAmount')?.focus(),50);
}
function closeModal(){$('bbDriverAllowanceModal').hidden=true;current=null}
async function decide(action){
  if(!current)return;
  const amount=num($('bbDaAmount').value), note=clean($('bbDaNote').value);
  if(action==='APPROVE'&&amount<=0){$('bbDaStatus').textContent='Enter an Allowance Amount greater than zero.';$('bbDaStatus').className='status error';return}
  const a=$('bbDaApprove'),r=$('bbDaReject');a.disabled=true;r.disabled=true;$('bbDaStatus').textContent=action==='APPROVE'?'Approving allowance…':'Rejecting request…';$('bbDaStatus').className='status';
  try{
    const res=await rpc('bb_staff_relation_admin_decide_driver_allowance',{p_allowance_request_id:Number(current.allowanceRequestId),p_action:action,p_approved_amount:action==='APPROVE'?amount:null,p_admin_note:note||null});
    if(!res?.success)throw new Error('Could not save Driver Allowance decision.');
    $('bbDaStatus').textContent=action==='APPROVE'?`Approved ${money(res.approvedAmount,res.currency)}. It is now Available in Staff Relation.`:'Driver Allowance request rejected.';
    setTimeout(()=>{closeModal();load()},550);
  }catch(e){$('bbDaStatus').textContent=e?.message||String(e);$('bbDaStatus').className='status error'}
  finally{a.disabled=false;r.disabled=false}
}

function boot(){injectUI();load();const refresh=$('refreshBtn');if(refresh&&!refresh.dataset.bbDa){refresh.dataset.bbDa='1';refresh.addEventListener('click',()=>setTimeout(load,350))}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,30));else setTimeout(boot,30);
})();
