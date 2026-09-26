/* BIG BROTHER — Staff Request Actual Cash Settlement V1
   Final cash payouts must record the physical USD/KHR paid.
   Batch Earning / Driver Allowance approvals are earnings approvals, not payouts. */
(function(){
'use strict';

const $=id=>document.getElementById(id);
const clean=v=>String(v==null?'':v).trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};

let selected=null;
let requestRow=null;
let balanceLoading=false;

function pageConfig(){
  const source=[...document.scripts].map(s=>s.textContent||'').join('\n');
  const url=(source.match(/const SUPABASE_URL='([^']+)'/)||[])[1]||'';
  const key=(source.match(/const SUPABASE_KEY='([^']+)'/)||[])[1]||'';
  if(!url||!key)throw new Error('Staff Request database configuration was not found.');
  return {url,key};
}

function readSession(){
  try{return JSON.parse(localStorage.getItem('BB_SUPABASE_DEV_SESSION_V1')||'null')}catch(_){return null}
}
function saveSession(v){
  try{
    if(!v){localStorage.removeItem('BB_SUPABASE_DEV_SESSION_V1');return}
    if(!v.expires_at&&v.expires_in)v.expires_at=Math.floor(Date.now()/1000)+Number(v.expires_in);
    localStorage.setItem('BB_SUPABASE_DEV_SESSION_V1',JSON.stringify(v));
  }catch(_){}
}
async function parse(r){
  const t=await r.text();let b={};
  try{b=t?JSON.parse(t):{}}catch(_){b={message:t}}
  if(!r.ok)throw new Error(b.message||b.error_description||b.error||('Supabase request failed ('+r.status+')'));
  return b;
}
async function ensureSession(){
  const cfg=pageConfig();
  let s=readSession();
  if(!s?.access_token)throw new Error('Please sign in to BIG BROTHER Dashboard first.');
  const now=Math.floor(Date.now()/1000);
  if(s.expires_at&&Number(s.expires_at)<now+45){
    if(!s.refresh_token)throw new Error('BIG BROTHER session expired.');
    const r=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',
      headers:{apikey:cfg.key,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:s.refresh_token}),
      cache:'no-store'
    });
    s=await parse(r);saveSession(s);
  }
  return s;
}
async function rpc(name,args={}){
  const cfg=pageConfig();
  let s=await ensureSession();
  async function call(){
    return fetch(cfg.url+'/rest/v1/rpc/'+name,{
      method:'POST',
      headers:{
        apikey:cfg.key,
        Authorization:'Bearer '+s.access_token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(args),
      cache:'no-store'
    });
  }
  let r=await call();
  if(r.status===401){
    s=await ensureSession();
    r=await call();
  }
  return parse(r);
}

function injectStyles(){
  if($('bbActualCashStyle'))return;
  const s=document.createElement('style');
  s.id='bbActualCashStyle';
  s.textContent=[
    '#bbActualCashBox{margin:2px 0 12px;border:1px solid #cbdced;background:#f5f9fe;border-radius:12px;padding:12px}',
    '#bbActualCashBox[hidden]{display:none}',
    '#bbActualCashBox .bb-ac-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px;color:#173f77;font-size:11px;font-weight:900}',
    '#bbActualCashBox .bb-ac-balance{color:#6f8195;font-size:9px;font-weight:800;text-align:right}',
    '#bbActualCashBox .bb-ac-help{margin-top:-2px;color:#6f8195;font-size:9px;line-height:1.45}',
    '#bbActualCashBox .bb-ac-check{margin-top:9px;border:1px solid #c9e7d5;background:#eef9f3;color:#176c4a;border-radius:9px;padding:9px 11px;font-size:10px;font-weight:900}',
    '#bbActualCashBox .bb-ac-check.bad{border-color:#efc5c0;background:#fff2f1;color:#b42318}',
    '@media(max-width:900px){#bbActualCashBox .grid2{grid-template-columns:1fr!important}}'
  ].join('');
  document.head.appendChild(s);
}

function ensureBox(){
  injectStyles();
  let box=$('bbActualCashBox');
  if(box)return box;
  const fields=$('paymentFields');
  if(!fields)return null;
  box=document.createElement('div');
  box.id='bbActualCashBox';
  box.hidden=true;
  box.innerHTML=
    '<div class="bb-ac-head"><span>💵 Real Actual Cash Paid</span><span id="bbActualCashBalance" class="bb-ac-balance">Daily Cash balance loading…</span></div>'+
    '<div class="grid2">'+
      '<div class="field"><label>Actual Cash USD</label><input id="bbActualCashUSD" type="number" min="0" step="0.01" inputmode="decimal" value="0"></div>'+
      '<div class="field"><label>Actual Cash KHR</label><input id="bbActualCashKHR" type="number" min="0" step="100" inputmode="numeric" value="0"></div>'+
    '</div>'+
    '<div class="bb-ac-help">Enter what was physically paid. Use USD only, KHR only, or both. KHR uses the Exchange Rate above. Daily Cash is deducted from the exact currency actually paid.</div>'+
    '<div id="bbActualCashCheck" class="bb-ac-check bad">Enter the real cash payout.</div>';
  fields.appendChild(box);

  $('bbActualCashUSD').addEventListener('input',refreshCheck);
  $('bbActualCashKHR').addEventListener('input',refreshCheck);
  $('exchangeRate')?.addEventListener('input',refreshCheck);
  $('approvedAmount')?.addEventListener('input',refreshCheck);
  $('paymentMethod')?.addEventListener('change',()=>showForMethod(true));

  const rateLabel=$('exchangeRate')?.closest('.field')?.querySelector('label');
  if(rateLabel)rateLabel.textContent='Exchange Rate (KHR per USD)';
  return box;
}

function target(){
  if(!requestRow)return {currency:'USD',amount:0};
  const currency=clean(requestRow.currency||'USD').toUpperCase();
  const amount=selected?.kind==='special'
    ? num($('approvedAmount')?.value)
    : num(requestRow.requestedAmount);
  return {currency,amount};
}
function cash(){
  return {
    usd:Math.max(0,num($('bbActualCashUSD')?.value)),
    khr:Math.max(0,num($('bbActualCashKHR')?.value)),
    rate:Math.max(0,num($('exchangeRate')?.value))
  };
}
function fmt(v,c){
  return c==='KHR'
    ? '៛'+Math.round(num(v)).toLocaleString('en-US')
    : '$'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function refreshCheck(){
  const box=$('bbActualCashCheck');
  if(!box||$('bbActualCashBox')?.hidden)return;
  const t=target(),a=cash();
  if(a.usd<=0&&a.khr<=0){
    box.textContent='Enter the real cash payout.';
    box.classList.add('bad');
    return;
  }
  if((a.khr>0||(t.currency==='KHR'&&a.usd>0))&&a.rate<=0){
    box.textContent='Enter the KHR per USD exchange rate.';
    box.classList.add('bad');
    return;
  }
  const equivalent=t.currency==='KHR'
    ? a.khr+(a.usd*a.rate)
    : a.usd+(a.khr>0?a.khr/a.rate:0);
  const diff=equivalent-t.amount;
  const tolerance=t.currency==='KHR'?100:0.03;
  const ok=Math.abs(diff)<=tolerance;
  box.classList.toggle('bad',!ok);
  box.textContent=
    'Required '+fmt(t.amount,t.currency)+
    ' · Actual equivalent '+fmt(equivalent,t.currency)+
    ' · Difference '+fmt(diff,t.currency)+
    (ok?' · MATCH':' · DOES NOT MATCH');
}
async function loadBalances(){
  if(balanceLoading)return;
  balanceLoading=true;
  const label=$('bbActualCashBalance');
  if(label)label.textContent='Daily Cash balance loading…';
  try{
    const b=await rpc('bb_staff_relation_admin_cash_balances');
    if(label)label.textContent='Available: $'+num(b.usdBalance).toFixed(2)+' · ៛'+Math.round(num(b.khrBalance)).toLocaleString('en-US');
  }catch(_){
    if(label)label.textContent='Daily Cash balance unavailable';
  }finally{
    balanceLoading=false;
  }
}
function showForMethod(reset=false){
  const box=ensureBox();
  if(!box)return;
  const isCash=clean($('paymentMethod')?.value).toLowerCase()==='cash';
  box.hidden=!isCash;
  if(!isCash)return;
  const t=target();
  if(reset){
    $('bbActualCashUSD').value=t.currency==='USD'?t.amount.toFixed(2):'0';
    $('bbActualCashKHR').value=t.currency==='KHR'?String(Math.round(t.amount)):'0';
  }
  refreshCheck();
  loadBalances();
}
function validate(){
  const t=target(),a=cash();
  if(a.usd<=0&&a.khr<=0)throw new Error('Enter the real actual cash paid in USD and/or KHR.');
  if((a.khr>0||(t.currency==='KHR'&&a.usd>0))&&a.rate<=0)throw new Error('Exchange Rate is required when converting USD and KHR cash.');
  const equivalent=t.currency==='KHR'
    ? a.khr+(a.usd*a.rate)
    : a.usd+(a.khr>0?a.khr/a.rate:0);
  const tolerance=t.currency==='KHR'?100:0.03;
  if(Math.abs(equivalent-t.amount)>tolerance){
    throw new Error('Actual cash does not match the approved payment amount.');
  }
  return a;
}

async function loadRequest(kind,id){
  const d=await rpc('bb_staff_relation_admin_requests',{p_limit:200});
  const list=kind==='special'?(d.specialRequests||[]):(d.paymentRequests||[]);
  return list.find(r=>Number(kind==='special'?r.advanceRequestId:r.requestId)===Number(id))||null;
}

document.addEventListener('click',event=>{
  const review=event.target.closest?.('.review[data-kind][data-id]');
  if(!review)return;
  const kind=clean(review.dataset.kind);
  if(kind!=='special'&&kind!=='payment')return;
  selected={kind,id:Number(review.dataset.id)};
  requestRow=null;
  setTimeout(async()=>{
    try{
      requestRow=await loadRequest(selected.kind,selected.id);
      ensureBox();
      showForMethod(true);
    }catch(error){
      console.warn('BIG BROTHER actual cash request context:',error);
    }
  },30);
},true);

document.addEventListener('click',async event=>{
  const btn=event.target.closest?.('#approveBtn');
  if(!btn||!selected||!requestRow)return;
  if(clean($('paymentMethod')?.value).toLowerCase()!=='cash')return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const status=$('modalStatus');
  const oldText=btn.textContent;
  btn.disabled=true;
  btn.textContent='Approving...';
  if(status){status.textContent='';status.classList.remove('error')}

  try{
    const a=validate();
    const method='Cash';
    const ref=clean($('referenceNo')?.value)||null;
    const note=clean($('adminNote')?.value)||null;
    let result;

    if(selected.kind==='special'){
      const approved=num($('approvedAmount')?.value);
      if(approved<=0)throw new Error('Approved Amount must be greater than zero.');
      result=await rpc('bb_staff_relation_admin_decide_salary_advance_v2',{
        p_advance_request_id:selected.id,
        p_action:'APPROVE',
        p_approved_amount:approved,
        p_payment_method:method,
        p_exchange_rate:a.rate||1,
        p_actual_cash_usd:a.usd,
        p_actual_cash_khr:a.khr,
        p_reference_no:ref,
        p_admin_note:note
      });
    }else{
      result=await rpc('bb_staff_relation_admin_decide_payment_v2',{
        p_request_id:selected.id,
        p_action:'APPROVE',
        p_payment_method:method,
        p_exchange_rate:a.rate||1,
        p_actual_cash_usd:a.usd,
        p_actual_cash_khr:a.khr,
        p_reference_no:ref,
        p_admin_note:note
      });
    }

    if(status){
      status.textContent=
        (result.requestNo||'Request')+' '+(result.status||'APPROVED')+
        ' · Cash paid $'+num(result.actualCashUSD).toFixed(2)+
        ' + ៛'+Math.round(num(result.actualCashKHR)).toLocaleString('en-US');
      status.classList.remove('error');
    }
    await loadBalances();
    setTimeout(()=>{
      const modal=$('modal');
      if(modal)modal.hidden=true;
      selected=null;requestRow=null;
      $('refreshBtn')?.click();
    },700);
  }catch(error){
    if(status){
      status.textContent=error?.message||String(error);
      status.classList.add('error');
    }
  }finally{
    btn.disabled=false;
    btn.textContent=oldText;
  }
},true);

function boot(){
  ensureBox();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.BB_STAFF_ACTUAL_CASH_BUILD='20260926-v1';
})();