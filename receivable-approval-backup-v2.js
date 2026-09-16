/* BIG BROTHER — Receivable Request Approval Google Sheets Backup V2
   Direct hook for confirmed bb_ar_clear_request results.
   Supabase remains authoritative; Google backup is fire-and-forget. */
(function(){
  'use strict';

  const ENDPOINT='https://script.google.com/macros/s/AKfycbxnlB1T6sbqdItYfyXa6wYquXN6URbJhvWJOkE_cM57wsSWK0_uFEsK_DuWr_caQVgd/exec';
  const QUEUE_KEY='BB_AR_APPROVAL_BACKUP_QUEUE_V2';
  const MAX_QUEUE=200;
  const clean=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const requestCache=new Map();
  const invoiceCache=new Map();

  function userEmail(){
    try{
      const s=JSON.parse(localStorage.getItem('BB_SUPABASE_DEV_SESSION_V1')||'null');
      return clean(s?.user?.email||'');
    }catch(_){return''}
  }

  function parsePayload(v){
    if(v&&typeof v==='object')return v;
    if(typeof v!=='string'||!v.trim())return {};
    try{return JSON.parse(v)}catch(_){return {}}
  }

  function readQueue(){try{const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(q)?q:[]}catch(_){return[]}}
  function writeQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-MAX_QUEUE)))}catch(_){}}
  function keyOf(p){return clean(p?.backupKey)||clean(p?.supabasePaymentId)||[clean(p?.invoiceNo),clean(p?.paymentDate),num(p?.paymentAmountUSD).toFixed(2),clean(p?.transactionId)].join('|')}
  function enqueue(p){const k=keyOf(p);if(!k)return;const q=readQueue();if(!q.some(x=>keyOf(x)===k))q.push(p);writeQueue(q)}

  async function send(p){
    await fetch(ENDPOINT,{method:'POST',mode:'no-cors',cache:'no-store',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(p)});
    return true;
  }
  async function sendOrQueue(p){try{await send(p);return true}catch(e){console.warn('BIG BROTHER approval backup queued:',e);enqueue(p);return false}}
  async function retryQueue(){const q=readQueue();if(!q.length)return;const left=[];for(const p of q){try{await send(p)}catch(_){left.push(p)}}writeQueue(left)}

  function rememberList(data){
    const rows=Array.isArray(data?.receivables)?data.receivables:[];
    rows.forEach(r=>{const no=clean(r?.invoiceNo);if(no)invoiceCache.set(no,r)});
  }
  function rememberRequest(data){
    const r=data?.request;
    const id=clean(r?.requestId);
    if(id)requestCache.set(id,r);
    return r||null;
  }

  async function backupRequest(request,payload,result){
    request=request||{}; payload=payload||{}; result=result||{};
    const requestId=clean(payload?.requestId||request?.requestId);
    const allocations=Array.isArray(request?.allocations)?request.allocations:[];
    if(!requestId||!allocations.length)return false;

    const paymentId=clean(result?.paymentId);
    const paymentDate=clean(result?.paymentDate||request?.paymentDate||new Date().toISOString().slice(0,10));

    for(const a of allocations){
      const invoiceNo=clean(a?.invoiceNo);
      const amount=num(a?.requestedAmount);
      if(!invoiceNo||amount<=0)continue;
      const invoice=invoiceCache.get(invoiceNo)||{};
      const currency=clean(a?.currency||request?.currency||invoice?.currency||'USD').toUpperCase();
      const rate=num(a?.exchangeRate||invoice?.exchangeRate);
      const amountUSD=currency==='KHR'&&rate>0?amount/rate:amount;
      const rowKey=paymentId?'AR-REQUEST:'+paymentId+':'+invoiceNo:'AR-REQUEST:'+requestId+':'+invoiceNo;

      sendOrQueue({
        backupType:'RECEIVABLE_PAYMENT',
        invoiceNo,
        customerName:clean(request?.customer||invoice?.customer),
        paymentAmountUSD:amountUSD,
        paymentDate,
        paymentMethod:clean(payload?.paymentMethod||result?.paymentMethod||request?.paymentMethod),
        transactionId:clean(payload?.transactionId||result?.transactionId||request?.transactionId),
        salesman:clean(request?.salesmanName||request?.requestedBy||invoice?.salesmanName||invoice?.salesperson),
        location:clean(a?.locationCode||invoice?.locationCode),
        note:clean(request?.note),
        supabasePaymentId:paymentId?paymentId+':'+invoiceNo:'',
        supabaseInvoiceId:clean(a?.invoiceId||invoice?.invoiceId),
        createdBy:userEmail(),
        paymentCurrency:currency,
        originalPaymentAmount:amount,
        exchangeRate:rate,
        backupKey:rowKey
      }).catch(()=>{});
    }
    return true;
  }

  async function handle(params={},result={}){
    const action=clean(params?.action);
    if(action==='arList'&&Array.isArray(result?.receivables))rememberList(result);
    if(action==='arRequestDetail'&&result?.request)rememberRequest(result);
    if(action==='arClearRequest'&&result?.success){
      const payload=parsePayload(params?.requestData);
      const req=requestCache.get(clean(payload?.requestId))||null;
      backupRequest(req,payload,result).catch(e=>console.warn('BIG BROTHER cleared-request backup:',e));
    }
    return result;
  }

  function wrapAdminAdapter(){
    const a=window.BBAdminWorkAdapter;
    if(!a||typeof a.apiPost!=='function'||a.apiPost.__bbApprovalBackupV2)return false;
    const raw=a.apiPost;
    const wrapped=async function(params={}){
      const result=await raw.call(a,params);
      handle(params,result).catch(e=>console.warn('BIG BROTHER Admin Work backup:',e));
      return result;
    };
    wrapped.__bbApprovalBackupV2=true;
    a.apiPost=wrapped;
    return true;
  }

  function loadCurrencyUi(){
    if(window.BBReceivableApprovalCurrencyV1)return;
    if(document.querySelector('script[data-bb-approval-currency="1"]'))return;
    const script=document.createElement('script');
    script.src='receivable-approval-currency-v1.js?v=20260916-1';
    script.async=false;
    script.dataset.bbApprovalCurrency='1';
    (document.head||document.documentElement).appendChild(script);
  }

  if(!wrapAdminAdapter()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(wrapAdminAdapter()||tries>=50)clearInterval(timer)},100);
  }

  retryQueue().catch(()=>{});
  setTimeout(loadCurrencyUi,0);
  window.BBReceivableApprovalBackupV2={backupRequest,handle,retry:retryQueue,rememberRequest,rememberList,endpoint:ENDPOINT};
})();
