/* BIG BROTHER — Receivable Request Approval Google Sheets Backup V1
   Watches successful bb_ar_clear_request RPC calls. Supabase remains authoritative. */
(function(){
  'use strict';

  const ENDPOINT='https://script.google.com/macros/s/AKfycbxnlB1T6sbqdItYfyXa6wYquXN6URbJhvWJOkE_cM57wsSWK0_uFEsK_DuWr_caQVgd/exec';
  const QUEUE_KEY='BB_AR_APPROVAL_BACKUP_QUEUE_V1';
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

  function readQueue(){try{const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(q)?q:[]}catch(_){return[]}}
  function writeQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-MAX_QUEUE)))}catch(_){}}
  function qkey(p){return clean(p?.backupKey)||clean(p?.supabasePaymentId)||[clean(p?.invoiceNo),clean(p?.paymentDate),num(p?.paymentAmountUSD).toFixed(2),clean(p?.transactionId)].join('|')}
  function enqueue(p){const k=qkey(p);if(!k)return;const q=readQueue();if(!q.some(x=>qkey(x)===k))q.push(p);writeQueue(q)}

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
  }

  function parseBody(init){
    try{return init?.body?JSON.parse(String(init.body)):{} }catch(_){return{}}
  }

  async function backupClearedRequest(payload,result){
    const requestId=clean(payload?.requestId);
    const request=requestCache.get(requestId)||{};
    const allocations=Array.isArray(request?.allocations)?request.allocations:[];
    const paymentId=clean(result?.paymentId);
    const paymentDate=clean(result?.paymentDate||request?.paymentDate||new Date().toISOString().slice(0,10));

    for(const a of allocations){
      const invoiceNo=clean(a?.invoiceNo);
      const amount=num(a?.requestedAmount);
      if(!invoiceNo||amount<=0)continue;
      const invoice=invoiceCache.get(invoiceNo)||{};
      const currency=clean(a?.currency||request?.currency||invoice?.currency||'USD').toUpperCase();
      const rate=num(invoice?.exchangeRate);
      const amountUSD=currency==='KHR'&&rate>0?amount/rate:amount;
      const rowKey=paymentId?'AR-REQUEST:'+paymentId+':'+invoiceNo:'AR-REQUEST:'+requestId+':'+invoiceNo;
      await sendOrQueue({
        backupType:'RECEIVABLE_PAYMENT',
        invoiceNo,
        customerName:clean(request?.customer||invoice?.customer),
        paymentAmountUSD:amountUSD,
        paymentDate,
        paymentMethod:clean(payload?.paymentMethod||result?.paymentMethod),
        transactionId:clean(payload?.transactionId||result?.transactionId),
        salesman:clean(request?.salesmanName||invoice?.salesmanName||invoice?.salesperson),
        location:clean(invoice?.locationCode),
        note:clean(request?.note),
        supabasePaymentId:paymentId?paymentId+':'+invoiceNo:'',
        supabaseInvoiceId:clean(invoice?.invoiceId),
        createdBy:userEmail(),
        paymentCurrency:currency,
        originalPaymentAmount:amount,
        exchangeRate:rate,
        backupKey:rowKey
      });
    }
  }

  const rawFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const isRpc=url.includes('/rest/v1/rpc/');
    const fn=isRpc?url.split('/rest/v1/rpc/')[1].split(/[?#]/)[0]:'';
    const body=parseBody(init);
    const response=await rawFetch(input,init);

    if(!isRpc||!response.ok)return response;

    try{
      const clone=response.clone();
      const data=await clone.json();
      if(fn==='bb_ar_list')rememberList(data);
      else if(fn==='bb_ar_request_detail')rememberRequest(data);
      else if(fn==='bb_ar_clear_request'&&data?.success){
        backupClearedRequest(body?.p_payload||{},data).catch(e=>console.warn('BIG BROTHER cleared-request backup:',e));
      }
    }catch(e){console.warn('BIG BROTHER approval backup observer:',e)}

    return response;
  };

  retryQueue().catch(()=>{});
  window.BBReceivableApprovalBackupV1={retry:retryQueue,endpoint:ENDPOINT};
})();
