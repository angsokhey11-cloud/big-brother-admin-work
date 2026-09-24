/* BIG BROTHER — Batch Earning Review V1
   One closed batch -> one Admin review -> incentive decision + driver allowances + settlement mode. */
(function(){
'use strict';
if(window.BBBatchEarningReviewV1)return;
window.BBBatchEarningReviewV1=true;

const SUPABASE_URL='https://sjfhlaclgmkwwofzstok.supabase.co';
const SUPABASE_KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
const SESSION_KEY='BB_SUPABASE_DEV_SESSION_V1';
let session=null,payload={reviews:[],count:0},current=null;
const $=id=>document.getElementById(id);
const clean=v=>String(v==null?'':v).trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money=v=>'$'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function date(v){const r=clean(v),m=r.match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return r||'-';const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${m[3]}-${mo[+m[2]-1]}-${m[1]}`}

function readSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}}
function saveSession(v){session=v||null;try{if(!v){localStorage.removeItem(SESSION_KEY);return}if(!v.expires_at&&v.expires_in)v.expires_at=Math.floor(Date.now()/1000)+Number(v.expires_in);localStorage.setItem(SESSION_KEY,JSON.stringify(v))}catch(_){}}
async function parse(r){const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(_){d={message:t}}if(!r.ok)throw new Error(d.message||d.error_description||d.error||('Database request failed ('+r.status+')'));return d}
async function refreshSession(){const c=readSession();if(!c?.refresh_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:c.refresh_token}),cache:'no-store'});const n=await parse(r);saveSession(n);return n}
async function ensureSession(){session=readSession();if(!session?.access_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');if(session.expires_at&&Number(session.expires_at)<Math.floor(Date.now()/1000)+45)await refreshSession();return session}
async function rpc(fn,args={}){await ensureSession();const call=()=>fetch(SUPABASE_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args||{}),cache:'no-store'});let r=await call();if(r.status===401){await refreshSession();r=await call()}return parse(r)}

function injectStyle(){
  if($('bb-batch-earning-style'))return;
  const s=document.createElement('style');s.id='bb-batch-earning-style';s.textContent=`
  .bb-ber-flow{border:1px solid #c9d8ec;background:#edf5ff;color:#245da8;border-radius:9px;padding:10px 12px;font-size:10px;font-weight:800;margin:0 0 12px;line-height:1.5}
  .bb-ber-warn{border-color:#efd49a;background:#fff7e7;color:#7a5718}.bb-ber-good{border-color:#bfe2cf;background:#edf9f3;color:#176d4b}
  .bb-ber-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.bb-ber-box{border:1px solid #dfe7f1;background:#fbfcfe;border-radius:9px;padding:9px}.bb-ber-box small{display:block;color:#718399;font-size:8px;font-weight:900;text-transform:uppercase}.bb-ber-box strong{display:block;color:#173f77;font-size:13px;margin-top:4px}.bb-ber-box div{font-size:9px;color:#718399;margin-top:3px;line-height:1.35}
  .bb-ber-preview{border:1px solid #cfe0f3;background:#f7fbff;border-radius:10px;padding:11px;margin-top:12px}.bb-ber-preview h3{margin:0 0 8px;color:#173f77;font-size:12px}.bb-ber-person{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:8px;padding:7px 0;border-bottom:1px solid #e5edf6;font-size:10px}.bb-ber-person:last-child{border-bottom:0}.bb-ber-person strong{color:#173f77}.bb-ber-money{text-align:right;font-weight:1000;color:#16855c}.bb-ber-lines{width:100%;border-collapse:collapse;min-width:0}.bb-ber-lines th,.bb-ber-lines td{padding:8px;border-bottom:1px solid #e6edf5;font-size:10px}.bb-ber-lines th{position:static;background:#f7f9fc}.bb-ber-radio{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bb-ber-choice{border:1px solid #d8e2ee;border-radius:9px;padding:9px;background:#fff;font-size:10px;font-weight:800;color:#425b75;cursor:pointer}.bb-ber-choice input{margin-right:6px}.bb-ber-expense{margin-top:9px;padding:9px;border-radius:8px;background:#f7f9fc;color:#53677d;font-size:9px;line-height:1.45}.bb-ber-hidden{display:none!important}
  @media(max-width:760px){.bb-ber-grid{grid-template-columns:1fr 1fr}.bb-ber-person{grid-template-columns:1fr 1fr}.bb-ber-person span:nth-child(2){grid-column:1/-1}.bb-ber-radio{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}

function injectUI(){
  if($('batchEarningCount'))return;
  injectStyle();
  const hero=document.querySelector('.hero p');if(hero)hero.textContent='Admin Work → Staff Request → Batch Earnings, Payment, Leave & Salary Advance approvals';
  const summary=document.querySelector('.summary');
  if(summary){const card=document.createElement('div');card.className='sum';card.innerHTML='<small>Batch Earnings</small><strong id="batchEarningCount">0</strong><div class="sub">Closed batches waiting for one earning review.</div>';summary.appendChild(card)}
  const tabs=document.querySelector('.tabs');
  if(tabs){const b=document.createElement('button');b.className='tab';b.type='button';b.id='batchEarningTab';b.innerHTML='🧾 Batch Earnings <span id="batchEarningTabCount"></span>';tabs.insertBefore(b,tabs.firstChild);b.addEventListener('click',activateTab)}
  const firstPanel=document.querySelector('.panel');
  if(firstPanel){const section=document.createElement('section');section.id='tab-batch-earning';section.className='panel';section.innerHTML='<div class="card"><div class="card-head"><strong>Pending Batch Earning Review</strong><span>One closed batch · one review · incentive + Driver 1 + Driver 2</span></div><div class="tablewrap"><table><thead><tr><th>Review</th><th>Batch</th><th>Team</th><th>Net Sales</th><th>Calculated Incentive</th><th>Assignment</th><th>Action</th></tr></thead><tbody id="batchEarningRows"></tbody></table></div></div>';firstPanel.parentNode.insertBefore(section,firstPanel)}
  const note=document.querySelector('.note');if(note)note.textContent='Batch Earning Review settles incentive eligibility and driver allowances together. Shared-pool options pre-record the original Sale Incentive and Driver Allowance expenses once; later Staff Relation claims do not create duplicate expenses.';
  injectModal();
}
function activateTab(){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));$('batchEarningTab')?.classList.add('active');$('tab-batch-earning')?.classList.add('active')}

function injectModal(){
  if($('bbBerModal'))return;
  const m=document.createElement('div');m.id='bbBerModal';m.className='modal';m.hidden=true;
  m.innerHTML=`<div class="modalbox"><div class="modalhead"><div><h2 id="bbBerTitle">Batch Earning Review</h2><p id="bbBerSub"></p></div><button id="bbBerClose" class="close" type="button">×</button></div><div class="modalbody">
    <div id="bbBerModeMessage" class="bb-ber-flow"></div>
    <div id="bbBerInfo" class="bb-ber-grid"></div>
    <div class="detail-section"><div class="detail-title">Batch Stock Items</div><div id="bbBerItems"></div></div>
    <div class="detail-section"><div class="detail-title">1. Driver Allowance</div><div class="info"><div class="field"><label id="bbBerD1Label">Driver 1 Allowance (USD)</label><input id="bbBerD1" type="number" min="0" step="0.01" value="0"></div><div class="field" id="bbBerD2Field"><label id="bbBerD2Label">Driver 2 Allowance (USD)</label><input id="bbBerD2" type="number" min="0" step="0.01" value="0"></div></div></div>
    <div class="detail-section"><div class="detail-title">2. Sales Incentive Decision</div><div class="bb-ber-radio"><label class="bb-ber-choice"><input type="radio" name="bbBerDecision" value="APPROVE">Approve calculated incentive</label><label class="bb-ber-choice"><input type="radio" name="bbBerDecision" value="REJECT">Reject incentive · Driver Allowance only</label></div><div class="field" id="bbBerRejectReasonField" style="margin-top:9px"><label>Incentive Rejection Reason</label><textarea id="bbBerRejectReason" placeholder="Required when incentive is rejected..."></textarea></div></div>
    <div class="detail-section" id="bbBerSettlementSection"><div class="detail-title">3. Settlement Option</div><div class="field"><select id="bbBerOption"><option value="DIRECT">Option 1 — Sales Incentive direct to Salesperson</option><option value="SHARE_DRIVER1">Option 2 — (Sales Incentive + Driver 1 Allowance) ÷ 2</option><option value="SHARE_ALL">Option 3 — (Sales Incentive + Driver 1 + Driver 2 Allowance) ÷ 3</option></select></div></div>
    <div id="bbBerPreview" class="bb-ber-preview"></div>
    <div class="field"><label>Admin Note</label><textarea id="bbBerNote" placeholder="Optional note..."></textarea></div>
    <div id="bbBerStatus" class="status"></div><div class="modalactions"><button id="bbBerApprove" class="btn primary" type="button">Approve Batch Earnings</button></div>
  </div></div>`;
  document.body.appendChild(m);
  $('bbBerClose').onclick=closeModal;$('bbBerApprove').onclick=approveReview;
  m.addEventListener('click',e=>{if(e.target===m)closeModal()});
  $('bbBerD1').addEventListener('input',renderPreview);$('bbBerD2').addEventListener('input',renderPreview);$('bbBerOption').addEventListener('change',renderPreview);
  document.querySelectorAll('input[name="bbBerDecision"]').forEach(x=>x.addEventListener('change',()=>{applyDecisionUI();renderPreview()}));
}

function renderRows(){
  const rows=Array.isArray(payload?.reviews)?payload.reviews:[];const body=$('batchEarningRows');if(!body)return;
  body.innerHTML=rows.length?rows.map(r=>{const c=r.calculation||{},eligible=r.incentiveMode==='SALESPERSON_ASSIGNED';return `<tr><td><strong>${esc(r.reviewNo)}</strong><br>${esc(date(r.createdAt))}</td><td><strong>${esc(r.batchId)}</strong><br>${esc(date(r.batchDate))} · ${esc(r.locationCode)}</td><td><strong>${esc(r.salesmanName||'No Salesperson')}</strong><br>🚚 ${esc(r.driver1Name)}${r.driver2StaffId?' · 🚚 '+esc(r.driver2Name):''}</td><td class="money"><strong>${money(c.netSaleUSD)}</strong><br>${Number(c.invoiceCount||0)} invoice(s)</td><td class="money"><strong>${money(c.calculatedIncentive)}</strong><br>${num(c.incentiveRatePercent).toFixed(2)}%</td><td><span class="badge ${eligible?'approved':'pending'}">${eligible?'INCENTIVE ELIGIBLE':'DRIVER CARRY'}</span></td><td><button class="review bb-ber-review" data-id="${r.reviewId}" type="button">Review</button></td></tr>`}).join(''):'<tr><td colspan="7" class="empty">No pending Batch Earning Review.</td></tr>';
  body.querySelectorAll('.bb-ber-review').forEach(b=>b.onclick=()=>openModal(Number(b.dataset.id)));
}

async function load(){
  try{
    injectUI();
    const [ber,all]=await Promise.all([rpc('bb_staff_relation_admin_batch_earning_reviews',{p_limit:200}),rpc('bb_staff_relation_admin_requests',{p_limit:1})]);
    payload=ber?.success?ber:{reviews:[],count:0};const c=Number(payload.count||0),counts=all?.counts||{};
    if($('batchEarningCount'))$('batchEarningCount').textContent=c.toLocaleString();
    if($('batchEarningTabCount'))$('batchEarningTabCount').textContent=c?'('+c+')':'';
    if($('totalPending'))$('totalPending').textContent=(c+Number(counts.paymentRequests||0)+Number(counts.leaveRequests||0)+Number(counts.specialRequests||0)).toLocaleString();
    renderRows();
  }catch(e){console.error('Batch Earning Review:',e);const body=$('batchEarningRows');if(body)body.innerHTML='<tr><td colspan="7" class="empty">'+esc(e?.message||String(e))+'</td></tr>'}
}

function decision(){return document.querySelector('input[name="bbBerDecision"]:checked')?.value||'APPROVE'}
function applyDecisionUI(){
  if(!current)return;const eligible=current.incentiveMode==='SALESPERSON_ASSIGNED';let d=decision();
  if(!eligible){const reject=document.querySelector('input[name="bbBerDecision"][value="REJECT"]');if(reject)reject.checked=true;document.querySelectorAll('input[name="bbBerDecision"]').forEach(x=>x.disabled=true);d='REJECT'}else document.querySelectorAll('input[name="bbBerDecision"]').forEach(x=>x.disabled=false);
  const rejected=d==='REJECT';$('bbBerRejectReasonField').classList.toggle('bb-ber-hidden',!rejected);$('bbBerSettlementSection').classList.toggle('bb-ber-hidden',rejected);
  if(rejected)$('bbBerOption').value='DIRECT';
}

function openModal(id){
  current=(payload.reviews||[]).find(x=>Number(x.reviewId)===Number(id));if(!current)return;const c=current.calculation||{},eligible=current.incentiveMode==='SALESPERSON_ASSIGNED';
  $('bbBerTitle').textContent='🧾 '+clean(current.reviewNo)+' · '+clean(current.batchId);
  $('bbBerSub').textContent=date(current.batchDate)+' · '+clean(current.locationName||current.locationCode)+' · Closed Batch';
  $('bbBerModeMessage').className='bb-ber-flow '+(eligible?'bb-ber-good':'bb-ber-warn');
  $('bbBerModeMessage').textContent=eligible
    ? 'Salesperson Assigned — this batch is incentive-eligible. Admin may approve the calculated incentive or reject it if the sales action did not earn incentive.'
    : 'Driver Carry / No Incentive Salesperson — the Salesman name is kept only for invoice clearing / batch responsibility. Incentive must be rejected for this batch.';
  $('bbBerInfo').innerHTML=`<div class="bb-ber-box"><small>Salesperson / Batch Owner</small><strong>${esc(current.salesmanName||'-')}</strong><div>${esc(current.salesmanStaffId||'-')} · ${eligible?'Incentive eligible':'Not incentive eligible'}</div></div><div class="bb-ber-box"><small>Driver 1</small><strong>${esc(current.driver1Name||'-')}</strong><div>${esc(current.driver1StaffId||'-')}</div></div><div class="bb-ber-box"><small>Driver 2</small><strong>${esc(current.driver2Name||'No Driver 2')}</strong><div>${esc(current.driver2StaffId||'-')}</div></div><div class="bb-ber-box"><small>Net Batch Sales</small><strong>${money(c.netSaleUSD)}</strong><div>Gross ${money(c.grossSaleUSD)} · Returns ${money(c.saleReturnUSD)}</div></div><div class="bb-ber-box"><small>Incentive Rate</small><strong>${num(c.incentiveRatePercent).toFixed(2)}%</strong><div>${Number(c.invoiceCount||0)} valid invoice(s)</div></div><div class="bb-ber-box"><small>Calculated Incentive</small><strong>${money(c.calculatedIncentive)}</strong><div>${c.calculationReady?'Ready':'Calculation needs review'}</div></div><div class="bb-ber-box"><small>Issued / Sold Qty</small><strong>${num(current.issuedQty).toLocaleString()} / ${num(current.soldQty).toLocaleString()}</strong><div>${esc(current.locationCode)}</div></div>`;
  const items=Array.isArray(current.items)?current.items:[];
  $('bbBerItems').innerHTML=items.length?`<table class="bb-ber-lines"><thead><tr><th>Product</th><th>Unit</th><th class="money">Issued</th><th class="money">Sold</th><th class="money">Back</th><th class="money">Damage</th></tr></thead><tbody>${items.map(x=>`<tr><td><strong>${esc(x.productName)}</strong><br>${esc(x.productCode)}</td><td>${esc(x.unit||'-')}</td><td class="money">${num(x.issuedQty).toLocaleString()}</td><td class="money">${num(x.soldQty).toLocaleString()}</td><td class="money">${num(x.backSaleQty).toLocaleString()}</td><td class="money">${num(x.damagedQty).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No batch item detail found.</div>';
  $('bbBerD1').value='0';$('bbBerD2').value='0';$('bbBerD1Label').textContent=(current.driver1Name||'Driver 1')+' Allowance (USD)';$('bbBerD2Label').textContent=(current.driver2Name||'Driver 2')+' Allowance (USD)';$('bbBerD2Field').classList.toggle('bb-ber-hidden',!current.driver2StaffId);
  const approve=document.querySelector('input[name="bbBerDecision"][value="APPROVE"]'),reject=document.querySelector('input[name="bbBerDecision"][value="REJECT"]');if(eligible){approve.checked=true;reject.checked=false}else{approve.checked=false;reject.checked=true}
  $('bbBerOption').value='DIRECT';Array.from($('bbBerOption').options).forEach(o=>{if(o.value==='SHARE_ALL')o.disabled=!current.driver2StaffId});$('bbBerRejectReason').value=eligible?'':'No incentive salesperson on carry batch';$('bbBerNote').value='';$('bbBerStatus').textContent='';$('bbBerStatus').className='status';
  applyDecisionUI();renderPreview();$('bbBerModal').hidden=false;
}
function closeModal(){$('bbBerModal').hidden=true;current=null}

function calcPreview(){
  if(!current)return null;const c=current.calculation||{},i=decision()==='APPROVE'?num(c.calculatedIncentive):0,d1=Math.max(0,num($('bbBerD1').value)),d2=current.driver2StaffId?Math.max(0,num($('bbBerD2').value)):0;let option=decision()==='REJECT'?'DRIVER_ALLOWANCE_ONLY':$('bbBerOption').value,sales=0,a1=0,a2=0,timing='ON_PAYMENT',pool=0;
  if(option==='DIRECT'){sales=i;a1=d1;a2=d2}
  else if(option==='DRIVER_ALLOWANCE_ONLY'){sales=0;a1=d1;a2=d2}
  else if(option==='SHARE_DRIVER1'){pool=i+d1;sales=Math.round((pool/2)*100)/100;a1=Math.round((pool-sales)*100)/100;a2=d2;timing='PRE_RECORDED'}
  else if(option==='SHARE_ALL'){pool=i+d1+d2;sales=Math.round((pool/3)*100)/100;a1=Math.round((pool/3)*100)/100;a2=Math.round((pool-sales-a1)*100)/100;timing='PRE_RECORDED'}
  return {i,d1,d2,option,sales,a1,a2,timing,total:sales+a1+a2,pool};
}
function renderPreview(){
  if(!current)return;const p=calcPreview();if(!p)return;const rejected=decision()==='REJECT',hasD2=!!current.driver2StaffId;
  const salesName=rejected?'No Sales Incentive':(current.salesmanName||'Salesperson');
  let expenseText='';
  if(p.timing==='PRE_RECORDED')expenseText=`Expense on this approval: <strong>Sale Incentive ${money(p.i)}</strong> + <strong>Driver Allowance ${money(p.d1+p.d2)}</strong>. These expenses are recorded once now as accrued expenses. Later staff claims only pay against them — no duplicate expense.`;
  else expenseText=rejected?`Rejected incentive creates <strong>$0.00 Sale Incentive expense</strong>. Driver Allowance expense is created later when the driver successfully claims payment.`:`Option 1 keeps the normal flow: Sale Incentive and Driver Allowance expenses are created when each staff payment is successfully approved.`;
  $('bbBerPreview').innerHTML=`<h3>Final Staff Earning Preview</h3><div class="bb-ber-person"><strong>${esc(salesName)}</strong><span>${rejected?'Incentive rejected':esc(current.salesmanStaffId||'')}</span><span class="bb-ber-money">${money(p.sales)}</span></div><div class="bb-ber-person"><strong>${esc(current.driver1Name||'Driver 1')}</strong><span>Driver 1</span><span class="bb-ber-money">${money(p.a1)}</span></div>${hasD2?`<div class="bb-ber-person"><strong>${esc(current.driver2Name||'Driver 2')}</strong><span>${p.option==='SHARE_DRIVER1'?'Outside pool · own allowance':'Driver 2'}</span><span class="bb-ber-money">${money(p.a2)}</span></div>`:''}<div class="bb-ber-person"><strong>Total Staff Earnings</strong><span>Original pool reconciled</span><span class="bb-ber-money">${money(p.total)}</span></div><div class="bb-ber-expense">${expenseText}</div>`;
}

async function approveReview(){
  if(!current)return;const p=calcPreview(),d=decision(),reason=clean($('bbBerRejectReason').value),note=clean($('bbBerNote').value);
  if(d==='REJECT'&&!reason){$('bbBerStatus').textContent='Enter the Incentive Rejection Reason.';$('bbBerStatus').className='status error';return}
  if(d==='APPROVE'&&current.incentiveMode!=='SALESPERSON_ASSIGNED'){$('bbBerStatus').textContent='Driver Carry batches cannot approve Sales Incentive.';$('bbBerStatus').className='status error';return}
  if(d==='APPROVE'&&p.option==='SHARE_ALL'&&!current.driver2StaffId){$('bbBerStatus').textContent='Option 3 requires Driver 2.';$('bbBerStatus').className='status error';return}
  const btn=$('bbBerApprove');btn.disabled=true;$('bbBerStatus').textContent='Approving Batch Earnings…';$('bbBerStatus').className='status';
  try{
    const res=await rpc('bb_staff_relation_admin_decide_batch_earning',{p_review_id:Number(current.reviewId),p_incentive_decision:d,p_settlement_option:d==='REJECT'?'DRIVER_ALLOWANCE_ONLY':p.option,p_driver1_allowance:p.d1,p_driver2_allowance:p.d2,p_incentive_rejection_reason:d==='REJECT'?reason:null,p_admin_note:note||null});
    if(!res?.success)throw new Error('Could not approve Batch Earnings.');
    $('bbBerStatus').textContent='Approved. Staff earnings are now Available in Staff Relation.';$('bbBerStatus').className='status success';setTimeout(()=>{closeModal();load()},650);
  }catch(e){$('bbBerStatus').textContent=e?.message||String(e);$('bbBerStatus').className='status error'}finally{btn.disabled=false}
}

function boot(){
  injectUI();
  load();

  const refresh=$('refreshBtn');
  if(refresh&&!refresh.dataset.bbBer){
    refresh.dataset.bbBer='1';
    refresh.addEventListener('click',()=>setTimeout(load,350));
  }

  const desktop=
    new URLSearchParams(location.search).get('desktop')==='1';

  if(desktop&&!window.__bbBatchEarningDesktopRefresh){
    window.__bbBatchEarningDesktopRefresh=true;
    let busy=false;

    async function refreshDesktop(){
      if(busy||document.visibilityState==='hidden')return;
      busy=true;
      try{
        await load();
      }finally{
        busy=false;
      }
    }

    window.addEventListener(
      'focus',
      ()=>setTimeout(refreshDesktop,140)
    );

    document.addEventListener(
      'visibilitychange',
      ()=>{
        if(document.visibilityState==='visible'){
          setTimeout(refreshDesktop,140);
        }
      }
    );

    setInterval(refreshDesktop,10000);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,30));else setTimeout(boot,30);
})();
