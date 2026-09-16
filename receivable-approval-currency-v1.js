/* BIG BROTHER — Pending Receivable Approval Currency Calculator V1
   Shared by PC + Mobile Admin Work.
   Uses the invoice exchange rate already stored in Supabase.
   Server validation remains authoritative. */
(function(){
  'use strict';
  if(window.BBReceivableApprovalCurrencyV1)return;
  window.BBReceivableApprovalCurrencyV1={installed:true};

  const SESSION_KEY='BB_SUPABASE_DEV_SESSION_V1';
  const clean=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const byId=id=>document.getElementById(id);
  const invoiceCache=new Map();
  let currentRequest=null;

  function money(v,c){
    return String(c||'USD').toUpperCase()==='KHR'
      ? '៛'+Math.round(num(v)).toLocaleString('en-US')
      : '$'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function methodEl(){return byId('reviewPaymentMethod')||byId('reviewMethod')}
  function errorEl(){return byId('reviewError')}
  function cashUsdEl(){return byId('reviewCashUSD')}
  function cashKhrEl(){return byId('reviewCashKHR')}
  function clearBtn(){return byId('clearBtn')}

  function showError(message){
    const el=errorEl();
    if(!el)return;
    el.textContent=message||'';
    el.classList.toggle('show',!!message);
  }

  function rememberList(data){
    (Array.isArray(data?.receivables)?data.receivables:[]).forEach(row=>{
      const no=clean(row?.invoiceNo);if(no)invoiceCache.set(no,row);
    });
  }

  function rememberRequest(data){
    if(data?.request){currentRequest=data.request;setTimeout(updateCalculator,0)}
  }

  function requestRate(){
    const allocations=Array.isArray(currentRequest?.allocations)?currentRequest.allocations:[];
    const rates=allocations.map(a=>num(a?.exchangeRate||invoiceCache.get(clean(a?.invoiceNo))?.exchangeRate)).filter(r=>r>0);
    if(!rates.length)return {rate:0,consistent:false};
    const min=Math.min(...rates),max=Math.max(...rates);
    return {rate:max,consistent:Math.abs(max-min)<=0.000001};
  }

  function requestTotal(){
    return (Array.isArray(currentRequest?.allocations)?currentRequest.allocations:[])
      .reduce((s,a)=>s+num(a?.requestedAmount),0);
  }

  function calculation(){
    if(!currentRequest)return null;
    const currency=clean(currentRequest.currency||'USD').toUpperCase();
    const total=requestTotal();
    const usd=num(cashUsdEl()?.value),khr=num(cashKhrEl()?.value);
    const r=requestRate();
    let equivalent=0,needsRate=false;
    if(currency==='USD'){
      needsRate=khr>0;
      equivalent=usd+(khr>0&&r.rate>0?khr/r.rate:0);
    }else{
      needsRate=usd>0;
      equivalent=khr+(usd>0&&r.rate>0?usd*r.rate:0);
    }
    const tolerance=currency==='KHR'?1:0.05;
    const validRate=!needsRate||(r.rate>0&&r.consistent);
    const match=total>0&&validRate&&Math.abs(equivalent-total)<=tolerance;
    return {currency,total,usd,khr,rate:r.rate,consistent:r.consistent,equivalent,needsRate,tolerance,match};
  }

  function ensureBox(){
    if(byId('bbApprovalFxCalc'))return;
    const usd=cashUsdEl(),khr=cashKhrEl();
    if(!usd||!khr)return;
    const grid=usd.closest('.reviewGrid,.ar-decision-grid')||usd.parentElement?.parentElement;
    if(!grid)return;
    const box=document.createElement('div');
    box.id='bbApprovalFxCalc';
    box.className='field full';
    box.style.cssText='grid-column:1/-1;margin:0;padding:9px 10px;border:1px solid #b9d8c5;background:#f8fffa;border-radius:9px;font-size:11px;line-height:1.45;color:#315b45';
    box.innerHTML='<div style="font-weight:900;color:#146c43;margin-bottom:4px">Exchange Rate Calculation</div><div id="bbApprovalFxRate">Rate: —</div><div id="bbApprovalFxResult" style="margin-top:3px;font-weight:800">Enter physical cash to calculate.</div>';
    if(grid.classList?.contains('reviewGrid')){
      const reject=byId('rejectReason')?.closest('.field');
      if(reject)grid.insertBefore(box,reject);else grid.appendChild(box);
    }else{
      grid.appendChild(box);
    }
  }

  function updateCalculator(){
    ensureBox();
    const box=byId('bbApprovalFxCalc');
    if(!box)return;
    box.style.display=clean(methodEl()?.value)==='Cash'?'block':'none';
    if(box.style.display==='none')return;
    const rateEl=byId('bbApprovalFxRate'),resultEl=byId('bbApprovalFxResult');
    const c=calculation();
    if(!c){rateEl.textContent='Rate: —';resultEl.textContent='Open a request to calculate.';return;}
    if(c.rate>0&&c.consistent)rateEl.textContent='Request Rate: 1 USD = '+c.rate.toLocaleString('en-US')+' KHR';
    else if(c.rate>0&&!c.consistent)rateEl.textContent='Request Rate: invoices use different exchange rates';
    else rateEl.textContent='Request Rate: not available';
    if(c.usd<=0&&c.khr<=0){resultEl.textContent='Enter physical cash received in USD and/or KHR.';resultEl.style.color='#315b45';return;}
    if(c.needsRate&&(!c.rate||!c.consistent)){
      resultEl.textContent='Cross-currency cash cannot clear this request until all invoices have one valid exchange rate.';
      resultEl.style.color='#b42318';return;
    }
    resultEl.textContent='Cash Equivalent: '+money(c.equivalent,c.currency)+' · Request Total: '+money(c.total,c.currency)+(c.match?' · ✓ MATCH':' · Not matched');
    resultEl.style.color=c.match?'#08783e':'#b42318';
  }

  function validate(){
    if(clean(methodEl()?.value)!=='Cash')return true;
    const c=calculation();
    if(!c)return true;
    if(c.usd<=0&&c.khr<=0){showError('Enter the physical cash received in USD and/or KHR.');return false;}
    if(c.needsRate&&(!c.rate||!c.consistent)){
      showError('Cross-currency cash requires one valid Exchange Rate for all invoices in this request.');return false;
    }
    if(!c.match){
      showError('Physical cash equals '+money(c.equivalent,c.currency)+', but the request total is '+money(c.total,c.currency)+'. Adjust USD/KHR cash until the calculation matches.');
      return false;
    }
    return true;
  }

  function installUi(){
    ensureBox();
    [cashUsdEl(),cashKhrEl()].filter(Boolean).forEach(el=>{
      if(el.dataset.bbFxInput)return;el.dataset.bbFxInput='1';el.addEventListener('input',updateCalculator);
    });
    const method=methodEl();
    if(method&&!method.dataset.bbFxMethod){method.dataset.bbFxMethod='1';method.addEventListener('change',updateCalculator)}
    const btn=clearBtn();
    if(btn&&!btn.dataset.bbFxGuard){
      btn.dataset.bbFxGuard='1';
      btn.addEventListener('click',event=>{
        if(!validate()){
          event.preventDefault();event.stopImmediatePropagation();
        }
      },true);
    }
    updateCalculator();
  }

  /* Observe Supabase A/R list + request detail so we use the exact invoice exchange rate. */
  const rawFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const response=await rawFetch(input,init);
    try{
      const url=typeof input==='string'?input:String(input?.url||'');
      if(response.ok&&url.includes('/rest/v1/rpc/')){
        const fn=url.split('/rest/v1/rpc/')[1].split(/[?#]/)[0];
        if(fn==='bb_ar_list'||fn==='bb_ar_list_all'||fn==='bb_ar_request_detail'){
          const data=await response.clone().json();
          if(fn==='bb_ar_request_detail')rememberRequest(data);else rememberList(data);
        }
      }
    }catch(error){console.warn('BIG BROTHER approval FX observer:',error)}
    return response;
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(installUi,0),{once:true});
  else setTimeout(installUi,0);
  let tries=0;const timer=setInterval(()=>{tries++;installUi();if(tries>=80)clearInterval(timer)},150);
})();
