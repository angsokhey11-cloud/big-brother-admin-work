(function(){
'use strict';
const api=window.BBAdminWorkAdapter;
if(!api)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=(amount,currency)=>Number(amount||0).toLocaleString('en-US',{minimumFractionDigits:currency==='USD'?2:0,maximumFractionDigits:currency==='USD'?2:0});
let detail=null,loading=false;
const style=document.createElement('style');
style.textContent=`
#bbOutletModal[hidden]{display:none!important}
#bbOutletModal{position:fixed;inset:0;z-index:10005;display:grid;place-items:center;background:rgba(9,30,54,.66);padding:12px}
#bbOutletModal .bb-outlet-dialog{width:min(790px,98vw);max-height:94vh;overflow:auto;border-radius:16px;background:#fff;padding:19px;box-shadow:0 16px 56px #0003}
#bbOutletModal h2{margin:0 0 5px;font-size:21px;color:#174979}
#bbOutletModal .bb-muted{color:#63758c;font-size:13px;line-height:1.55}
#bbOutletModal .bb-totals{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;padding:12px;margin:12px 0;border:1px solid #d8e5f1;border-radius:10px;background:#f4f8fd}
#bbOutletModal .bb-totals strong{font-size:16px}
#bbOutletModal .bb-outlet-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,170px);gap:12px;align-items:center;padding:12px 2px;border-bottom:1px solid #e1eaf2}
#bbOutletModal .bb-outlet-row small{display:block;margin-top:4px;font-size:11px;color:#687d96}
#bbOutletModal .bb-outlet-row input{min-width:0;width:100%;height:43px}
#bbOutletModal .bb-outlet-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:16px}
#bbOutletModal .bb-outlet-actions button{padding:11px 16px;border-radius:8px}
#bbOutletModal .bb-error{color:#b42318;font-weight:700}
@media(max-width:480px){#bbOutletModal .bb-outlet-dialog{padding:13px}#bbOutletModal .bb-outlet-row{grid-template-columns:minmax(0,1fr) 120px;gap:6px}#bbOutletModal h2{font-size:18px}}
`;
document.head.appendChild(style);
const overlay=document.createElement('div');
overlay.id='bbOutletModal';overlay.hidden=true;
overlay.innerHTML='<section class="bb-outlet-dialog" role="dialog" aria-modal="true" aria-labelledby="bbOutletTitle">'+
 '<h2 id="bbOutletTitle">Allocate One Bank Receipt to Outlets</h2>'+
 '<div class="bb-muted" id="bbOutletSubtitle">Loading verified receipt…</div>'+
 '<div class="bb-totals"><span>Actual bank receipt<br><strong id="bbOutletActual">—</strong></span>'+
 '<span>Allocated total<br><strong id="bbOutletTotal">—</strong></span><span>Difference<br><strong id="bbOutletDifference">—</strong></span></div>'+
 '<div class="bb-muted">Choose amounts in the <b>actual received bank currency</b>. Zero means this outlet gets no share. Each linked outlet receives its own balance, while the bank receipt and reference remain unique.</div>'+
 '<div id="bbOutletRows"></div><p id="bbOutletMessage" role="status"></p>'+
 '<div class="bb-outlet-actions"><a href="customer-bank-directory.html" target="_blank" rel="noopener" style="align-self:center;margin-right:auto">Manage linked payer outlets</a>'+
 '<button type="button" class="secondary" id="bbOutletCancel">Close</button><button type="button" id="bbOutletSave">Save Approved Shares</button></div></section>';
document.body.appendChild(overlay);
const $=id=>document.getElementById(id);
function close(){if(loading)return;overlay.hidden=true;detail=null}
$('bbOutletCancel').onclick=close;
overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
function units(v,cur){
 const s=String(v??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(s)||(cur==='KHR'&&s.includes('.')))return null;
 const n=Number(s),factor=cur==='KHR'?1:100;
 return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*factor))?Math.round(n*factor):null;
}
function amounts(){
 if(!detail)return null;
 const shares=[];
 let sum=0;
 for(const input of overlay.querySelectorAll('input[data-customer-id]')){
   const value=units(input.value,detail.currency);
   if(value===null)return null;
   sum+=value;
   if(value>0)shares.push({customerId:input.dataset.customerId,amount:value/(detail.currency==='KHR'?1:100)});
 }
 return {shares,sum};
}
function refreshTotal(){
 if(!detail)return;
 const v=amounts(),factor=detail.currency==='KHR'?1:100,actual=units(detail.amount,detail.currency);
 $('bbOutletActual').textContent=detail.currency+' '+money(detail.amount,detail.currency);
 $('bbOutletTotal').textContent=v?detail.currency+' '+money(v.sum/factor,detail.currency):'Invalid amount';
 const gap=v&&actual!==null?actual-v.sum:null;
 $('bbOutletDifference').textContent=gap===null?'Check inputs':detail.currency+' '+money(gap/factor,detail.currency);
 $('bbOutletDifference').className=gap===0?'':'bb-error';
 $('bbOutletSave').disabled=loading||!detail.canAllocate||!v||gap!==0||v.shares.length<2;
}
function render(){
 if(!detail)return;
 const existing=new Map((detail.allocations||[]).map(x=>[String(x.customerId),Number(x.amount)]));
 $('bbOutletSubtitle').textContent='Reference: '+detail.transactionId+' · Payer: '+(detail.payerName||'Unknown')+
  ' · Received: '+(detail.receivedDate||'—')+(detail.isSplit?' · Previously allocated':'');
 $('bbOutletRows').innerHTML=(detail.eligible||[]).map(c=>{
   const cid=String(c.customerId||'');
   const initial=existing.size?existing.get(cid)||0:(cid===detail.anchorCustomerId?Number(detail.amount):0);
   const value=detail.currency==='KHR'?String(Math.round(initial)):Number(initial).toFixed(2);
   return '<label class="bb-outlet-row"><span><strong>'+esc(c.name||cid)+'</strong>'+
      '<small>'+esc(cid)+(c.location?' · '+esc(c.location):'')+
      (cid===detail.anchorCustomerId?' · Initial receipt outlet':'')+'</small></span>'+
      '<input data-customer-id="'+esc(cid)+'" type="number" min="0" step="'+(detail.currency==='KHR'?'1':'0.01')+
      '" value="'+esc(value)+'"'+(!detail.canAllocate?' disabled':'')+' aria-label="Amount for '+esc(c.name||cid)+'"></label>'
 }).join('');
 $('bbOutletMessage').textContent=!detail.canAllocate
   ?'This bank receipt has already been used or cancelled; outlet allocations are locked.'
   :(detail.eligible||[]).length<2
     ?'No additional linked outlet found. Add the SAME payer name to the other outlet in Customer Bank Directory, then reopen.'
     :'Shares must equal the exact bank receipt. Only approved customer outlets can spend their own share.';
 $('bbOutletMessage').className=detail.canAllocate?'bb-muted':'bb-error';
 refreshTotal();
}
overlay.addEventListener('input',e=>{if(e.target.matches('input[data-customer-id]'))refreshTotal()});
async function open(transactionId){
 if(loading)return;
 overlay.hidden=false;
 $('bbOutletMessage').textContent='Loading payer and linked outlets…';
 $('bbOutletMessage').className='bb-muted';
 $('bbOutletRows').innerHTML='';
 $('bbOutletSave').disabled=true;
 detail=null;
 try{
  const result=await api.rpc('bb_bank_outlet_share_info_v1',{p_transaction_id:transactionId});
  if(!result?.success||result.transactionId!==transactionId)throw Error('Bank receipt details mismatch');
  detail=result;render();
 }catch(e){
  $('bbOutletMessage').className='bb-error';
  $('bbOutletMessage').textContent=e?.message||String(e);
 }
}
$('bbOutletSave').onclick=async()=>{
 if(!detail||loading)return;
 const choice=amounts(),need=units(detail.amount,detail.currency);
 if(!choice||choice.sum!==need||choice.shares.length<2)return refreshTotal();
 const message='Confirm ONE real bank receipt '+detail.transactionId+' for '+detail.currency+' '+money(detail.amount,detail.currency)+
  '\n\n'+choice.shares.map(x=>{
    const c=(detail.eligible||[]).find(c=>String(c.customerId)===x.customerId);
    return (c?.name||x.customerId)+' — '+detail.currency+' '+money(x.amount,detail.currency);
  }).join('\n')+'\n\nNo duplicate bank transaction will be created.';
 const confirmChoice=window.bbConfirm?await window.bbConfirm(message,{title:'Approve Outlet Allocation',okText:'Approve Shares',cancelText:'Cancel'}):confirm(message);
 if(!confirmChoice)return;
 loading=true;$('bbOutletSave').disabled=true;$('bbOutletCancel').disabled=true;
 $('bbOutletMessage').textContent='Saving approved outlet shares…';
 try{
  const result=await api.rpc('bb_bank_outlet_share_save_v1',{p_transaction_id:detail.transactionId,p_shares:choice.shares});
  if(!result?.success)throw Error('Server did not confirm bank allocation');
  const id=detail.transactionId;
  loading=false;$('bbOutletCancel').disabled=false;overlay.hidden=true;detail=null;
  window.dispatchEvent(new CustomEvent('bb:bank-outlets-updated',{detail:{transactionId:id}}));
 }catch(e){
  loading=false;$('bbOutletCancel').disabled=false;
  $('bbOutletMessage').className='bb-error';
  $('bbOutletMessage').textContent=e?.message||String(e);
  refreshTotal();
 }
};

// Bank History enhancement. Keep the original bank receipt as ONE row and ONE total.
let shareLookup=new Map(),outletFeatureReady=false;
function outletLabel(tid,baseCurrency){
 const items=shareLookup.get(tid)||[];
 if(!items.length)return '';
 return '<div class="bb-shared-receipt-summary" style="font-size:11px;color:#26609c;line-height:1.55;margin-top:6px">'+
  '<b>'+items.length+' outlets · one bank receipt</b>'+
  items.map(x=>'<div>'+esc(x.customerName||x.customerId)+' · '+esc(baseCurrency+' '+money(x.amount,baseCurrency))+
    ' <span style="color:#70849a">(Remaining '+esc(baseCurrency+' '+money(x.remaining,baseCurrency))+')</span></div>').join('')+
  '</div>';
}
function enhanceBankRows(){
 const tbody=document.getElementById('rows');
 if(!tbody)return;
 tbody.querySelectorAll(':scope > tr').forEach(tr=>{
  const cells=tr.cells;
  if(cells.length!==11)return;
  const tid=String(cells[3]?.textContent||'').trim();
  const status=String(cells[7]?.textContent||'').trim();
  const items=shareLookup.get(tid)||[];
  if(!tid)return;
  if(items.length&&!cells[2].querySelector('.bb-shared-receipt-summary')){
    const div=document.createElement('div');
    div.innerHTML=outletLabel(tid,items[0].currency||String(cells[4]?.textContent||'USD').split(' ')[0]);
    while(div.firstChild)cells[2].appendChild(div.firstChild);
  }
  if(outletFeatureReady&&(status==='AVAILABLE'||items.length)&&!cells[10].querySelector('.bb-allocate-trigger')){
   const btn=document.createElement('button');
   btn.type='button';
   btn.className='bb-allocate-trigger';
   btn.style.marginRight='5px';
   btn.textContent=items.length?'View / Edit Outlets':'Allocate Outlets';
   btn.onclick=()=>open(tid);
   cells[10].prepend(btn);
  }
 });
}
function enhanceSummary(){
 const table=document.querySelector('#summarySheet table');
 if(!table)return;
 table.querySelectorAll('tbody > tr').forEach(tr=>{
  const cells=tr.cells;
  if(cells.length<4||cells[2].querySelector('.bb-shared-receipt-summary'))return;
  const tid=String(cells[3].textContent||'').trim();
  const items=shareLookup.get(tid)||[];
  if(!items.length)return;
  const wrap=document.createElement('div');
  wrap.innerHTML=outletLabel(tid,items[0].currency||'USD');
  while(wrap.firstChild)cells[2].appendChild(wrap.firstChild);
 });
}
async function loadSplitDetails(){
 try{
  const rows=await api.rpc('bb_bank_outlet_share_list_v1');
  if(Array.isArray(rows)){
   const next=new Map();
   for(const x of rows){
    const tid=String(x.transactionId||'');
    if(!tid)continue;
    if(!next.has(tid))next.set(tid,[]);
    next.get(tid).push(x);
   }
   shareLookup=next;
   outletFeatureReady=true;
  }
 }catch(e){
  outletFeatureReady=false;
  console.warn('Shared bank outlet details unavailable (install Local Brain SQL upgrade first):',e?.message||e);
 }
 enhanceBankRows();enhanceSummary();
}
const tableBody=document.getElementById('rows');
if(tableBody)new MutationObserver(()=>{enhanceBankRows()}).observe(tableBody,{childList:true});
const summarySheet=document.getElementById('summarySheet');
if(summarySheet)new MutationObserver(()=>{enhanceSummary()}).observe(summarySheet,{childList:true});
window.addEventListener('bb:bank-outlets-updated',()=>{
 loadSplitDetails().then(()=>{
  const refresh=document.getElementById('refresh');
  if(refresh)refresh.click();
  setTimeout(enhanceBankRows,250);
 });
});
loadSplitDetails();
const deepLinkTransaction=new URLSearchParams(location.search).get('transaction')||'';
if(/^[A-Z0-9_/-]{4,160}$/i.test(deepLinkTransaction)){
 // An A/R batch can open the exact bank receipt, but allocation still requires
 // explicit admin review and approval. Never auto-save amounts from a URL.
 void open(deepLinkTransaction.toUpperCase());
}
window.BBBankOutletSplit={open,sharesFor:transactionId=>(shareLookup.get(String(transactionId))||[]).slice()};
})();
