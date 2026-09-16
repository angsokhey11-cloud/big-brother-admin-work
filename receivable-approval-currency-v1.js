/* BIG BROTHER — Pending Receivable Approval Currency Calculator V1.1
   Shared by PC + Mobile Admin Work.
   Uses an adjustable payment-day exchange rate entered by Admin.
   Never uses the invoice's old rate for cash conversion.
   Injects the payment-day rate into bb_ar_clear_request.
   Supabase remains authoritative. */
(function(){
  'use strict';
  if(window.BBReceivableApprovalCurrencyV1)return;
  window.BBReceivableApprovalCurrencyV1={installed:true};

  const clean=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const byId=id=>document.getElementById(id);
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
  function rateEl(){return byId('bbApprovalFxInput')}
  function rate(){return num(rateEl()?.value)}

  function showError(message){
    const el=errorEl();if(!el)return;
    el.textContent=message||'';
    el.classList.toggle('show',!!message);
  }

  function rememberRequest(data){
    if(!data?.request)return;
    currentRequest=data.request;
    ensureBox();
    if(rateEl())rateEl().value='';
    setTimeout(updateCalculator,0);
  }

  function requestTotal(){
    return (Array.isArray(currentRequest?.allocations)?currentRequest.allocations:[])
      .reduce((s,a)=>s+num(a?.requestedAmount),0);
  }

  function calculation(){
    if(!currentRequest)return null;
    const currency=clean(currentRequest.currency||'USD').toUpperCase();
    const total=requestTotal();
    const usd=num(cashUsdEl()?.value),khr=num(cashKhrEl()?.value),fx=rate();
    let equivalent=0,needsRate=false;
    if(currency==='USD'){
      needsRate=khr>0;
      equivalent=usd+(khr>0&&fx>0?khr/fx:0);
    }else{
      needsRate=usd>0;
      equivalent=khr+(usd>0&&fx>0?usd*fx:0);
    }
    const tolerance=currency==='KHR'?1:0.05;
    const match=total>0&&(!needsRate||fx>0)&&Math.abs(equivalent-total)<=tolerance;
    return {currency,total,usd,khr,rate:fx,equivalent,needsRate,tolerance,match};
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
    box.innerHTML=`
      <div style="font-weight:900;color:#146c43;margin-bottom:7px">Payment-Day Exchange Rate</div>
      <label for="bbApprovalFxInput" style="display:block;font-weight:800;margin-bottom:4px">1 USD = KHR</label>
      <input id="bbApprovalFxInput" type="number" min="0" step="1" inputmode="decimal" placeholder="Enter today's rate, e.g. 4050" style="width:100%;box-sizing:border-box;margin-bottom:7px">
      <div style="font-size:10px;color:#5b7164;margin-bottom:5px">Use the rate for the day this payment is actually received. Old invoice exchange rates are not used.</div>
      <div id="bbApprovalFxResult" style="font-weight:800">Enter physical cash to calculate.</div>`;
    if(grid.classList?.contains('reviewGrid')){
      const reject=byId('rejectReason')?.closest('.field');
      if(reject)grid.insertBefore(box,reject);else grid.appendChild(box);
    }else grid.appendChild(box);
  }

  function updateCalculator(){
    ensureBox();
    const box=byId('bbApprovalFxCalc');if(!box)return;
    box.style.display=clean(methodEl()?.value)==='Cash'?'block':'none';
    if(box.style.display==='none')return;
    const resultEl=byId('bbApprovalFxResult');
    const c=calculation();
    if(!c){resultEl.textContent='Open a request to calculate.';return;}
    if(c.usd<=0&&c.khr<=0){resultEl.textContent='Enter physical cash received in USD and/or KHR.';resultEl.style.color='#315b45';return;}
    if(c.needsRate&&c.rate<=0){resultEl.textContent='Enter today’s Exchange Rate for cross-currency cash.';resultEl.style.color='#b42318';return;}
    resultEl.textContent='Cash Equivalent: '+money(c.equivalent,c.currency)+' · Request Total: '+money(c.total,c.currency)+(c.match?' · ✓ MATCH':' · Not matched');
    resultEl.style.color=c.match?'#08783e':'#b42318';
  }

  function validate(){
    if(clean(methodEl()?.value)!=='Cash')return true;
    const c=calculation();if(!c)return true;
    if(c.usd<=0&&c.khr<=0){showError('Enter the physical cash received in USD and/or KHR.');return false;}
    if(c.needsRate&&c.rate<=0){showError('Enter today’s Payment Exchange Rate for cross-currency cash.');return false;}
    if(!c.match){
      showError('Physical cash equals '+money(c.equivalent,c.currency)+', but the request total is '+money(c.total,c.currency)+'. Adjust the cash or today’s exchange rate until it matches.');
      return false;
    }
    return true;
  }

  function installFetchHook(){
    if(window.fetch.__bbApprovalPaymentRate)return;
    const rawFetch=window.fetch.bind(window);
    const wrapped=async function(input,init){
      const url=typeof input==='string'?input:String(input?.url||'');
      let nextInit=init;
      try{
        if(url.includes('/rest/v1/rpc/bb_ar_clear_request')&&init?.body){
          const body=JSON.parse(String(init.body));
          if(body?.p_payload&&typeof body.p_payload==='object'){
            body.p_payload.exchangeRate=rate();
            nextInit={...init,body:JSON.stringify(body)};
          }
        }
      }catch(error){console.warn('BIG BROTHER approval rate injector:',error)}
      const response=await rawFetch(input,nextInit);
      try{
        if(response.ok&&url.includes('/rest/v1/rpc/bb_ar_request_detail')){
          const data=await response.clone().json();
          rememberRequest(data);
        }
      }catch(error){console.warn('BIG BROTHER approval FX observer:',error)}
      return response;
    };
    wrapped.__bbApprovalPaymentRate=true;
    window.fetch=wrapped;
  }

  function installUi(){
    ensureBox();
    installFetchHook();
    [cashUsdEl(),cashKhrEl(),rateEl()].filter(Boolean).forEach(el=>{
      if(el.dataset.bbFxInput)return;el.dataset.bbFxInput='1';el.addEventListener('input',updateCalculator);
    });
    const method=methodEl();
    if(method&&!method.dataset.bbFxMethod){method.dataset.bbFxMethod='1';method.addEventListener('change',updateCalculator)}
    const btn=clearBtn();
    if(btn&&!btn.dataset.bbFxGuard){
      btn.dataset.bbFxGuard='1';
      btn.addEventListener('click',event=>{if(!validate()){event.preventDefault();event.stopImmediatePropagation()}},true);
    }
    updateCalculator();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(installUi,0),{once:true});
  else setTimeout(installUi,0);
  let tries=0;const timer=setInterval(()=>{tries++;installUi();if(tries>=80)clearInterval(timer)},150);
})();
