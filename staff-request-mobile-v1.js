/* BIG BROTHER Staff Request Mobile V1.
   Dedicated mobile presentation over existing secure Staff Request and Batch
   Earnings RPC workflows. No new accounting writes or background polling. */
(function(){
'use strict';
if(window.BBStaffRequestMobileV1)return;
window.BBStaffRequestMobileV1=true;
const $=id=>document.getElementById(id);
const svg=(name)=>{
 const icons={
  batch:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  advance:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15.5 9c-.7-1-2-1.5-3.5-1.5-4.5 0-4.5 4.2 0 4.2s4.5 4.3 0 4.3c-1.5 0-2.8-.5-3.5-1.5"/>',
  payment:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M7 15h4"/>',
  leave:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3"/>'
 };
 return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(icons[name]||icons.batch)+'</svg>';
};
let lastFocus='',pendingTarget=null;
function findNotificationTarget(){
 try{
  const p=new URLSearchParams(location.search);
  const q=p.get('bb_entity');
  if(q&&/^[\w./:-]{1,120}$/.test(q))return q;
  const saved=JSON.parse(sessionStorage.getItem('BB_NOTIFICATION_TARGET_V2')||'null');
  if(saved&&saved.route==='admin-staff-request'&&
     /^[\w./:-]{1,120}$/.test(String(saved.entityId||'')))return saved.entityId;
 }catch(_){}
 return '';
}
function activeTab(){
 return document.querySelector('.tabs .tab.active');
}
function syncTabs(){
 const selected=activeTab();
 document.querySelectorAll('.bb-mr-shortcut').forEach(b=>{
  const match=selected&&(b.dataset.targetTab===selected.id||b.dataset.targetTab===selected.dataset.tab);
  b.classList.toggle('selected',!!match);
 });
}
/* Preserve the full source text for search but render just the primary value
   per cell. Original review buttons and all secure action handlers stay intact. */
function firstLine(cell){
 if(!cell)return '';
 let out='';
 for(const node of cell.childNodes){
  if(node.nodeType===1&&node.tagName==='BR')break;
  out+=node.textContent||'';
 }
 return out.trim()||String(cell.textContent||'').trim();
}
function compactRows(tbody){
 if(!tbody)return;
 const types={
  specialRows:{label:'Staff',value:'Amount',columns:[0,1,6]},
  paymentRows:{label:'Staff',value:'Amount',columns:[0,1,4]},
  leaveRows:{label:'Staff',value:'Days',columns:[0,1,4]},
  batchEarningRows:{label:'Batch',value:'Incentive',columns:[0,1,4]}
 };
 const cfg=types[tbody.id];
 if(!cfg)return;
 const wrap=tbody.closest('.tablewrap');
 if(wrap&&!wrap.querySelector('.bb-mr-list-header')){
  const header=document.createElement('div');
  header.className='bb-mr-list-header';
  header.innerHTML='<span>Request</span><span>'+cfg.label+'</span><span>'+cfg.value+'</span><span>Action</span>';
  wrap.insertBefore(header,wrap.firstChild);
 }
 tbody.querySelectorAll('tr').forEach(row=>{
  if(row.dataset.bbMrCompact==='1')return;
  row.dataset.bbMrSearchText=row.textContent||'';
  const cells=Array.from(row.children);
  if(row.querySelector('td.empty')){row.dataset.bbMrCompact='1';return}
  for(const i of cfg.columns){
   if(cells[i])cells[i].textContent=firstLine(cells[i]);
  }
  row.dataset.bbMrCompact='1';
 });
}

function applyFilter(){
 const input=$('bbMrSearch'),q=String(input?.value||'').trim().toLowerCase();
 const panel=document.querySelector('.panel.active');
 let shown=0;
 if(panel){
  panel.querySelectorAll('tbody tr').forEach(row=>{
   const isEmpty=!!row.querySelector('td.empty');
   const ok=isEmpty||!q||String(row.dataset.bbMrSearchText||row.textContent).toLowerCase().includes(q);
   row.classList.toggle('bb-mr-hidden-row',!ok);
   if(ok&&!isEmpty)shown++;
  });
 }
 const label=$('bbMrShown');
 if(label)label.textContent=shown+' shown';
}
function focusDeepLink(){
 if(!pendingTarget)return;
 let rows=[...document.querySelectorAll('.panel tbody tr')];
 const key=String(pendingTarget).trim().toLowerCase();
 const match=rows.find(row=>{
  const button=row.querySelector('button[data-id]');
  const id=String(button?.dataset.id||'').toLowerCase();
  const text=String(row.dataset.bbMrSearchText||row.textContent||'').toLowerCase();
  return id===key || text.includes(key);
 });
 if(!match)return;
 const section=match.closest('.panel');
 if(section&&!section.classList.contains('active')){
  const name=section.id.replace(/^tab-/,'');
  const tab=[...document.querySelectorAll('.tabs .tab')].find(b=>b.dataset.tab===name ||
    (name==='batch-earning'&&b.id==='batchEarningTab'));
  tab?.click();
 }
 const b=match.querySelector('button.review[data-id]');
 const filter=$('bbMrSearch');if(filter)filter.value='';
 applyFilter();
 match.classList.add('bb-mr-focused');
 match.scrollIntoView({block:'center',behavior:'smooth'});
 // Open the existing, permission-checked review modal; never approve automatically.
 if(b)b.click();
 pendingTarget=null;
 try{
  const saved=JSON.parse(sessionStorage.getItem('BB_NOTIFICATION_TARGET_V2')||'null');
  if(saved?.route==='admin-staff-request')
    sessionStorage.removeItem('BB_NOTIFICATION_TARGET_V2');
 }catch(_){}
}
function attachRows(){
 document.querySelectorAll('.tablewrap tbody').forEach(t=>{
  if(t.dataset.bbMrObserved)return;
  t.dataset.bbMrObserved='1';
  t.addEventListener('click',e=>{
    if(e.target.closest('button,a,input,textarea,select'))return;
    const row=e.target.closest('tr');
    const btn=row?.querySelector('button.review');
    if(btn)btn.click();
  });
  compactRows(t);
  new MutationObserver(()=>{
    compactRows(t);applyFilter();focusDeepLink();
  }).observe(t,{childList:true,subtree:false});
 });
}
function init(){
 const main=$('main');
 if(!main||document.querySelector('.bb-mr-shortcuts'))return;
 const hero=document.querySelector('.hero');
 if(hero){
  const h=hero.querySelector('h1');if(h)h.textContent='BIG BROTHER — Staff Request';
  const sub=hero.querySelector('p');if(sub)sub.textContent='Admin Work · Staff Request approvals';
  const pill=hero.querySelector('.pill');if(pill)pill.textContent='Admin Approval';
 }
 const shortcuts=document.createElement('div');
 shortcuts.className='bb-mr-shortcuts';
 shortcuts.setAttribute('aria-label','Approval categories');
 const definitions=[
  ['batchEarningTab','Batch Earnings','batch'],
  ['special','Salary Advance','advance'],
  ['payment','Payment Request','payment'],
  ['leave','Leave Request','leave']
 ];
 for(const [tabId,name,ico] of definitions){
  const b=document.createElement('button');b.type='button';
  b.className='bb-mr-shortcut';b.dataset.targetTab=tabId;
  b.innerHTML='<span class="bb-mr-shortcut-icon">'+svg(ico)+'</span><strong>'+name+'</strong>';
  b.onclick=()=>{
   const tab=tabId==='batchEarningTab'?$(tabId):
     document.querySelector('.tabs .tab[data-tab="'+tabId+'"]');
   if(tab){
    tab.click();
    document.querySelector('.tabs')?.scrollIntoView({block:'start',behavior:'smooth'});
   }
  };
  shortcuts.appendChild(b);
 }
 main.insertBefore(shortcuts,main.firstChild);
 const title=document.createElement('div');title.className='bb-mr-section-label';
 title.textContent='Approval Overview';
 main.insertBefore(title,shortcuts);
 const tabs=document.querySelector('.tabs');
 if(tabs){
  const filter=document.createElement('div');
  filter.className='bb-mr-filterbar';
  filter.innerHTML='<input type="search" id="bbMrSearch" placeholder="Search staff, request, batch..." autocomplete="off" aria-label="Search approvals"><span class="bb-mr-count" id="bbMrShown"></span>';
  tabs.insertAdjacentElement('afterend',filter);
  $('bbMrSearch').addEventListener('input',applyFilter);
  tabs.addEventListener('click',e=>{
   if(e.target.closest('.tab'))setTimeout(()=>{syncTabs();applyFilter()},0);
  });
 }
 pendingTarget=findNotificationTarget();
 attachRows();applyFilter();syncTabs();
 const mainObserver=new MutationObserver(()=>{attachRows();focusDeepLink()});
 mainObserver.observe(main,{childList:true,subtree:true});
 // Once the Batch review inserts its button, show it as a normal category.
 const refresh=$('refreshBtn');
 if(refresh)refresh.addEventListener('click',()=>{setTimeout(()=>{applyFilter();focusDeepLink()},300)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();