/* Quick Refuel Wholesale - Offline Functional B2B Distribution App
   Browser local version. Production version should use PostgreSQL + role based backend. */
(function(){
'use strict';

const STORAGE_KEY = 'quick_refuel_b2b_distribution_v1';
const UI_KEY = 'quick_refuel_b2b_ui_v1';
const CURRENCY = 'SAR';


// Role and permission configuration. The Owner account remains protected;
// new staff users can be created only as Admin, Manager or Salesman.
const MANAGER_PERMISSION_OPTIONS = [
  ['purchase','Purchase'], ['warehouse_sales','Warehouse Sales'], ['sales','Branch Sales'],
  ['stock','Stock & Inventory'], ['stock_transfer','Stock Transfer'], ['payments','Customer Collection'],
  ['expenses','Expenses'], ['returns','Return & Damage Request'], ['return_approve','Return / Damage Approval'],
  ['settlement_report','Settlement Report View'], ['customers','Customers'], ['products','Products'], ['vendors','Vendors']
];
const DEFAULT_MANAGER_PERMISSIONS = ['sales','stock','payments','expenses','returns','customers'];
function normalizeRole(role){
  if(role==='Owner/Admin'||role==='Owner') return 'Owner';
  if(role==='Accountant') return 'Manager';
  return ['Admin','Manager','Salesman'].includes(role)?role:'Salesman';
}
function roleLabel(role){const r=normalizeRole(typeof role==='object'?role?.role:role);return r==='Owner'?'Owner':r;}
function fullAccessUser(user=currentUser()){const r=normalizeRole(user?.role);return r==='Owner'||r==='Admin';}
function managerPermissionSet(user=currentUser()){const arr=Array.isArray(user?.permissions)?user.permissions:(normalizeRole(user?.role)==='Manager'?DEFAULT_MANAGER_PERMISSIONS:[]);return new Set(arr);}
function managerPermissionLabel(permission){return MANAGER_PERMISSION_OPTIONS.find(x=>x[0]===permission)?.[1]||permission;}
function userInitials(user=currentUser()){return String(user?.name||'U').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U';}

function uid(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`; }
function isoToday(){ const d=new Date(); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
function nowStamp(){ return new Date().toISOString(); }
function parseDate(v){ return v ? new Date(`${v}T12:00:00`) : null; }
function dateLabel(v){ if(!v) return '—'; const d=parseDate(v); return d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):v; }
function dateTimeLabel(v){ if(!v)return '—'; const d=new Date(v); return d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function money(v){ const n=Number(v||0); const curr=(typeof state!=='undefined'&&state?.meta?.currency)||CURRENCY; return `${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${curr}`; }
function num(v){ return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:3}); }
function esc(s){ return String(s??'').replace(/[&<>'"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[m])); }
function sum(arr, fn=x=>x){ return arr.reduce((a,x)=>a+(Number(fn(x))||0),0); }
function inRange(date, from, to){ if(!date) return false; return (!from || date>=from) && (!to || date<=to); }
// Date, settlement and legacy purchase helpers used throughout the app.
function addDays(date, days){ const d=parseDate(date); if(!d) return ''; d.setDate(d.getDate()+Number(days||0)); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
function previousDate(date){ return addDays(date,-1); }
function purchaseBranchId(purchase){ return purchase?.branchId || purchase?.stockLocationId || 'warehouse'; }
function settlementForDate(branchId,date){
  if(!branchId||!date) return null;
  return state.settlements.find(s=>s.branchId===branchId && s.status==='Locked' && inRange(date,s.from,s.to)) || null;
}
function byDateDesc(a,b){ return String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')); }

const defaultState = () => ({
  meta:{
    companyName:'Quick Refuel Wholesale', companyNameArabic:'', mainBranchName:'Warehouse',
    address:'', phone:'', email:'', crNumber:'', vatNumber:'', vatEnabled:false, vatRate:15,
    currency:'SAR', createdAt:nowStamp(), lastSavedAt:''
  },
  branches:[{id:'warehouse',name:'Warehouse',code:'WH',address:'Central Warehouse',phone:'',status:'Active',notes:'Main Branch / Central Warehouse',isWarehouse:true,assignedSalesmanId:'',assignedManagerId:'',assignedAccountantId:''}],
  users:[{id:'owner_admin',name:'Owner Admin',role:'Owner',branchId:'warehouse',active:true,email:'owner@quickrefuel.local',permissions:[]}],
  categories:[], products:[], vendors:[], customers:[],
  purchases:[], purchaseReturns:[], sales:[], salesReturns:[],
  transfers:[], stockReturns:[], damageReturns:[],
  customerPayments:[], paymentReturns:[], vendorPayments:[], expenses:[],
  settlements:[],
  stockMovements:[], moneyTransactions:[], activity:[], settings:{lowStockDefault:10}
});

function normalizeState(saved){
  const base=defaultState();
  if(!saved || !saved.meta) return base;
  const s=saved;
  s.meta=Object.assign({},base.meta,s.meta||{});
  s.settings=Object.assign({},base.settings,s.settings||{});
  ['branches','users','categories','products','vendors','customers','purchases','purchaseReturns','sales','salesReturns','transfers','stockReturns','damageReturns','customerPayments','paymentReturns','vendorPayments','expenses','settlements','stockMovements','moneyTransactions','activity'].forEach(k=>{if(!Array.isArray(s[k]))s[k]=[];});
  s.users.forEach(u=>{u.role=normalizeRole(u.role);if(!Array.isArray(u.permissions))u.permissions=u.role==='Manager'?DEFAULT_MANAGER_PERMISSIONS.slice():[];if(!u.branchId)u.branchId='warehouse';});
  s.branches.forEach(b=>{if(b.assignedManagerId===undefined)b.assignedManagerId=b.assignedAccountantId||'';});
  s.sales.forEach(x=>{if(x.dueAmount===undefined||x.dueAmount===null)x.dueAmount=Math.max(0,Number(x.total||0)-Number(x.paidAmount||0));});
  s.purchases.forEach(x=>{if(!x.branchId)x.branchId='warehouse';});
  s.settlements.forEach(x=>{if(!x.status)x.status='Locked'; if(!x.version)x.version=1;});
  return s;
}
function loadState(){
  try{ return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch(e){ return defaultState(); }
}
function loadUI(){
  try{ return Object.assign({page:'dashboard',roleId:'owner_admin',filters:{},loggedIn:true}, JSON.parse(localStorage.getItem(UI_KEY))||{}); }
  catch(e){ return {page:'dashboard',roleId:'owner_admin',filters:{},loggedIn:true}; }
}
let state=loadState();
let ui=loadUI();
function save(){ state.meta.lastSavedAt=nowStamp(); localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); localStorage.setItem(UI_KEY,JSON.stringify(ui)); }
function isOwner(){return normalizeRole(currentUser()?.role)==='Owner';}
function isSettlementAdmin(){return fullAccessUser();}
function companyName(){return state.meta.companyName||'Wholesale Distribution';}
function companyInitials(){return companyName().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'CO';}
function companyDetailsLine(){return [state.meta.address,state.meta.phone,state.meta.email].filter(Boolean).join(' · ');}
function invoiceCompanyBlock(){return `<div class="invoice-company"><div class="invoice-company-mark">${esc(companyInitials())}</div><div><div class="invoice-company-name">${esc(companyName())}</div>${state.meta.companyNameArabic?`<div class="invoice-company-sub">${esc(state.meta.companyNameArabic)}</div>`:''}${companyDetailsLine()?`<div class="invoice-company-sub">${esc(companyDetailsLine())}</div>`:''}${state.meta.crNumber?`<div class="invoice-company-sub">CR: ${esc(state.meta.crNumber)}</div>`:''}${state.meta.vatEnabled&&state.meta.vatNumber?`<div class="invoice-company-sub">VAT No.: ${esc(state.meta.vatNumber)}</div>`:''}</div></div>`;}
function log(action, description, ref='', branchId=''){
  const u=currentUser();
  state.activity.unshift({id:uid('log'),date:nowStamp(),userId:u.id,userName:u.name,userRole:u.role,branchId,action,description,reference:ref});
}
function currentUser(){ return state.users.find(x=>x.id===ui.roleId) || state.users[0]; }
function getBranch(id){ return state.branches.find(x=>x.id===id); }
function getProduct(id){ return state.products.find(x=>x.id===id); }
function getVendor(id){ return state.vendors.find(x=>x.id===id); }
function getCustomer(id){ return state.customers.find(x=>x.id===id); }
function getUser(id){ return state.users.find(x=>x.id===id); }
function branchName(id){ return getBranch(id)?.name || '—'; }
function productName(id){ return getProduct(id)?.name || '—'; }
function vendorName(id){ return getVendor(id)?.name || '—'; }
function customerName(id){ const c=getCustomer(id); return c ? (c.shopName?`${c.name} — ${c.shopName}`:c.name) : '—'; }
function can(action){
  const user=currentUser();const role=normalizeRole(user.role);
  if(role==='Owner'||role==='Admin') return true;
  if(role==='Manager'){
    if(action==='dashboard')return true;
    const map={purchase:'purchase',sales:'sales',stock:'stock',payments:'payments',expenses:'expenses',transfers:'stock_transfer',returns:'returns',reports:'settlement_report',approvals:'return_approve',customers:'customers',products:'products',vendors:'vendors'};
    return Boolean(map[action]&&managerPermissionSet(user).has(map[action]));
  }
  return ['dashboard','sales','stock','customers','returns'].includes(action);
}
function allowedBranchId(id){return normalizeRole(currentUser()?.role)==='Salesman'?currentUser().branchId===id:true;}
function isSalesman(){return normalizeRole(currentUser()?.role)==='Salesman';}
function canApproveRequests(){return fullAccessUser()||(normalizeRole(currentUser()?.role)==='Manager'&&managerPermissionSet().has('return_approve'));}
function assertOperationalDateOpen(branchId,date,operation='transaction'){
  const locked=settlementForDate(branchId,date);
  if(locked) throw new Error(`${operation} cannot be saved. ${branchName(branchId)} is locked for settlement ${locked.settlementNo||locked.id} (${dateLabel(locked.from)} to ${dateLabel(locked.to)}).`);
}
function assertTransferDatesOpen(sourceBranchId,destinationBranchId,date){
  assertOperationalDateOpen(sourceBranchId,date,'Stock transfer');
  assertOperationalDateOpen(destinationBranchId,date,'Stock transfer');
}
function settlementStatusBadge(status){
  const label=status==='Locked'?'Locked':status==='Draft'?'Draft Preview':status==='Returned'?'Returned / Reopened':status==='Cancelled'?'Cancelled':status||'—';
  return statusBadge(label);
}
function settlementHistoryForUser(){
  const u=currentUser();
  return state.settlements.filter(x=>u.role==='Salesman'?x.branchId===u.branchId:true).sort((a,b)=>String(b.lockedAt||b.createdAt||'').localeCompare(String(a.lockedAt||a.createdAt||'')));
}
function activeBranches(includeWarehouse=true){ return state.branches.filter(b=>b.status==='Active' && (includeWarehouse||!b.isWarehouse)); }
function activeSubBranches(){ return activeBranches(false); }
function activeProducts(){ return state.products.filter(p=>p.status==='Active'); }
function activeVendors(){return state.vendors.filter(v=>v.status!=='Inactive');}
function activeCustomers(branchId=''){return state.customers.filter(c=>c.status!=='Inactive' && (!branchId||c.branchId===branchId));}

// Inventory helpers
function stockMoves(branchId, productId){ return state.stockMovements.filter(m=>m.branchId===branchId&&m.productId===productId&&m.status!=='Reversed'); }
function stockPosition(branchId, productId){
  const ms=stockMoves(branchId, productId);
  const qty=sum(ms,m=>m.qty);
  const value=sum(ms,m=>Number(m.qty)*Number(m.unitCost||0));
  return {qty, value, avg: qty>0? value/qty : 0};
}
function allStockRows(branchId=''){
  const rows=[];
  const branches=branchId?[getBranch(branchId)]:state.branches;
  branches.filter(Boolean).forEach(b=>state.products.forEach(p=>{
    const pos=stockPosition(b.id,p.id);
    if(pos.qty!==0 || branchId){ rows.push({branchId:b.id,productId:p.id,qty:pos.qty,value:pos.value,avg:pos.avg}); }
  }));
  return rows;
}
function recordStock({date,branchId,productId,qty,unitCost,type,refId,note=''}){
  state.stockMovements.push({id:uid('sm'),date,branchId,productId,qty:Number(qty),unitCost:Number(unitCost||0),type,refId,note,status:'Active',createdAt:nowStamp()});
}
function reverseStockByRef(refId){ state.stockMovements.forEach(m=>{if(m.refId===refId&&m.status==='Active')m.status='Reversed';}); }
function ensureStock(branchId, productId, qty){ return stockPosition(branchId,productId).qty + 1e-9 >= Number(qty); }

// Financial helpers
function addMoney({date,ledger,direction,amount,kind,branchId='warehouse',refId='',description='',method='',customerId='',vendorId=''}){
  state.moneyTransactions.push({id:uid('mt'),date,ledger,direction,amount:Number(amount),kind,branchId,refId,description,method,customerId,vendorId,status:'Active',createdAt:nowStamp()});
}
function reverseMoneyByRef(refId){ state.moneyTransactions.forEach(m=>{if(m.refId===refId&&m.status==='Active')m.status='Reversed';}); }
function ledgerBalance(ledger){ return sum(state.moneyTransactions.filter(t=>t.ledger===ledger&&t.status==='Active'),t=>t.direction==='In'?t.amount:-t.amount); }
function branchLedgerBalanceAt(ledger,branchId,toDate){
  return sum(state.moneyTransactions.filter(t=>t.ledger===ledger&&t.branchId===branchId&&t.status==='Active'&&(!toDate||t.date<=toDate)),t=>t.direction==='In'?t.amount:-t.amount);
}
function stockPositionAt(branchId,productId,toDate){
  const ms=state.stockMovements.filter(m=>m.branchId===branchId&&m.productId===productId&&m.status!=='Reversed'&&(!toDate||m.date<=toDate));
  const qty=sum(ms,m=>m.qty); const value=sum(ms,m=>Number(m.qty)*Number(m.unitCost||0));
  return {qty,value,avg:qty>0?value/qty:0};
}
function customerDueAt(customerId,toDate){
  const c=getCustomer(customerId); if(!c)return 0;
  const sales=sum(state.sales.filter(x=>x.customerId===customerId&&x.status==='Active'&&(!toDate||x.date<=toDate)),x=>Number(x.dueAmount??Math.max(0,Number(x.total||0)-Number(x.paidAmount||0))));
  const payments=sum(state.customerPayments.filter(x=>x.customerId===customerId&&x.status==='Active'&&(!toDate||x.date<=toDate)),x=>x.amount);
  const returns=sum(state.salesReturns.filter(x=>x.customerId===customerId&&x.status==='Approved'&&(!toDate||x.date<=toDate)),salesReturnDueEffect);
  const paymentReturns=sum(state.paymentReturns.filter(x=>x.customerId===customerId&&x.status==='Approved'&&(!toDate||x.date<=toDate)),x=>x.amount);
  return Math.max(0,Number(c.openingDue||0)+sales-payments-returns+paymentReturns);
}
function vendorDue(vendorId){
  const v=getVendor(vendorId); if(!v) return 0;
  const buys=sum(state.purchases.filter(x=>x.vendorId===vendorId&&x.status==='Active'),x=>x.total);
  const returns=sum(state.purchaseReturns.filter(x=>x.vendorId===vendorId&&x.status==='Approved'),x=>x.total);
  const pays=sum(state.vendorPayments.filter(x=>x.vendorId===vendorId&&x.status==='Active'),x=>x.amount);
  return Number(v.openingBalance||0)+buys-returns-pays;
}
function salesReturnDueEffect(r){
  if(r && r.dueAdjustment!==undefined && r.dueAdjustment!==null) return Number(r.dueAdjustment||0);
  const s=state.sales.find(x=>x.id===r?.saleId);
  return Math.min(Number(r?.total||0),Number(s?.dueAmount??Math.max(0,Number(s?.total||0)-Number(s?.paidAmount||0))));
}
function customerDue(customerId){
  const c=getCustomer(customerId); if(!c) return 0;
  // Only credit/due sales enter the customer account. Cash and bank sales never create customer due.
  const creditSales=sum(state.sales.filter(x=>x.customerId===customerId&&x.status==='Active'),x=>Number(x.dueAmount??Math.max(0,Number(x.total||0)-Number(x.paidAmount||0))));
  const payments=sum(state.customerPayments.filter(x=>x.customerId===customerId&&x.status==='Active'),x=>x.amount);
  const salesReturnDue=sum(state.salesReturns.filter(x=>x.customerId===customerId&&x.status==='Approved'),salesReturnDueEffect);
  const paymentReturn=sum(state.paymentReturns.filter(x=>x.customerId===customerId&&x.status==='Approved'),x=>x.amount);
  return Math.max(0, Number(c.openingDue||0) + creditSales - payments - salesReturnDue + paymentReturn);
}
function isReservedReturn(status){return status==='Pending'||status==='Approved';}
function returnedQtyForInvoiceLine(collection, referenceField, referenceId, lineIndex, productId){
  return sum(state[collection].filter(r=>r[referenceField]===referenceId&&isReservedReturn(r.status)),r=>sum((r.lines||[]).filter(l=>{
    if(l.sourceLineIndex!==undefined&&l.sourceLineIndex!==null) return Number(l.sourceLineIndex)===Number(lineIndex);
    return l.productId===productId; // Compatibility with older local records.
  }),l=>l.qty));
}
function salesReturnLineAvailable(sale,lineIndex){
  const line=sale?.lines?.[lineIndex]; if(!line)return 0;
  return Math.max(0,Number(line.qty||0)-returnedQtyForInvoiceLine('salesReturns','saleId',sale.id,lineIndex,line.productId));
}
function purchaseReturnLineAvailable(purchase,lineIndex){
  const line=purchase?.lines?.[lineIndex]; if(!line)return 0;
  const invoiceAvailable=Math.max(0,Number(line.qty||0)-returnedQtyForInvoiceLine('purchaseReturns','purchaseId',purchase.id,lineIndex,line.productId));
  const warehouseAvailable=Math.max(0,stockPosition('warehouse',line.productId).qty);
  return Math.min(invoiceAvailable,warehouseAvailable);
}
function paymentReturnAvailable(paymentId){
  const p=state.customerPayments.find(x=>x.id===paymentId); if(!p)return 0;
  const alreadyReturned=sum(state.paymentReturns.filter(r=>r.paymentId===paymentId&&isReservedReturn(r.status)),r=>r.amount);
  return Math.max(0,Number(p.amount||0)-alreadyReturned);
}
function requestedQtyByProduct(lines){
  const map={};(lines||[]).forEach(l=>{map[l.productId]=(map[l.productId]||0)+Number(l.qty||0);});return map;
}
function pendingBranchReturnQty(branchId,productId){
  return sum([...state.stockReturns,...state.damageReturns].filter(r=>r.branchId===branchId&&r.productId===productId&&r.status==='Pending'),r=>r.qty);
}
function availableBranchReturnQty(branchId,productId){
  return Math.max(0,Number(stockPosition(branchId,productId).qty||0)-pendingBranchReturnQty(branchId,productId));
}
function branchReturnProductOptions(branchId,selected=''){
  return activeProducts().map(p=>{const available=availableBranchReturnQty(branchId,p.id);return `<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)} (${num(available)} available)</option>`;}).join('');
}
function saleCost(sale){return sum(sale.lines||[],l=>Number(l.qty)*Number(l.cost||0));}
function purchaseTotal(p){ return sum(p.lines||[],l=>Number(l.qty)*Number(l.unitPrice)); }
function statusBadge(status){
  const s=String(status||'').toLowerCase();
  const cls=s.includes('approved')||s.includes('active')||s.includes('paid')?'badge-green':s.includes('pending')||s.includes('partial')?'badge-amber':s.includes('rejected')||s.includes('cancel')||s.includes('damage')?'badge-red':s.includes('return')?'badge-purple':'badge-blue';
  return `<span class="badge ${cls}">${esc(status||'—')}</span>`;
}
function ref(prefix,n){return `${prefix}-${String(n).padStart(5,'0')}`;}
function nextRef(prefix, arr){return ref(prefix,(arr?.length||0)+1);}
function toast(msg,type='success'){ const r=document.getElementById('toast-root'); const n=document.createElement('div'); n.className=`toast ${type}`;n.textContent=msg;r.appendChild(n);setTimeout(()=>n.remove(),3500); }
function openModal(html){ document.getElementById('modal-root').innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal ${html.includes('modal-large')?'large':''}" onclick="event.stopPropagation()">${html.replace('modal-large','')}</div></div>`; }
function closeModal(){document.getElementById('modal-root').innerHTML='';}
function defaultFilters(key){return ui.filters[key]||{};}
function setFilter(key,obj){ ui.filters[key]=Object.assign({},ui.filters[key]||{},obj); save(); }

// App frame
const navGroups=[
 {title:'',items:[['dashboard','⌂','Dashboard']]},
 {title:'OPERATIONS',items:[['purchase','◫','Purchase'],['sales','▤','Sales'],['stock','▥','Stock & Inventory'],['payments','◈','Payments'],['expenses','▣','Expenses'],['transfers','⇄','Transfers'],['returns','↩','Returns & Damage']]},
 {title:'MANAGEMENT & REPORT',items:[['reports','◔','Settlement Report'],['approvals','✓','Approve'],['products','▦','Products'],['customers','♙','Customers'],['vendors','◫','Vendors']]},
 {title:'CONTROL',items:[['branches','⌘','Branches'],['users','◉','Users & Roles'],['logs','◷','Activity'],['settings','⚙','Administration']]}
];
const salesmanNavGroups=[
 {title:'',items:[['dashboard','⌂','Dashboard']]},
 {title:'BRANCH WORKSPACE',items:[['sales','▤','Sales'],['stock','▥','Stock'],['customers','♙','Customer'],['returns','↩','Return & Damage']]}
];
function visibleNav(){const source=normalizeRole(currentUser().role)==='Salesman'?salesmanNavGroups:navGroups;return source.map(g=>({title:g.title,items:g.items.filter(i=>can(i[0]))})).filter(g=>g.items.length);}
function render(){
 document.title=`${companyName()} — B2B Distribution`;
 if(ui.loggedIn===false){document.getElementById('app').innerHTML=renderLocalLogin();return;}
 const user=currentUser(),groups=visibleNav();if(!can(ui.page))ui.page='dashboard';
 const role=roleLabel(user.role),branch=branchName(user.branchId);
 document.getElementById('app').innerHTML=`<div class="app-shell"><aside class="sidebar" id="sidebar"><div class="brand"><div class="brand-mark">${esc(companyInitials())}</div><div><h1>${esc(companyName())}</h1><small>Wholesale Distribution</small></div></div><nav class="sidebar-nav">${groups.map(g=>`${g.title?`<div class="nav-section">${g.title}</div>`:''}${g.items.map(([id,ic,label])=>`<button class="nav-item ${ui.page===id?'active':''}" data-nav="${id}"><span class="nav-icon">${ic}</span><span>${label}</span>${id==='approvals'&&countPendingApprovals()?`<b class="nav-count">${countPendingApprovals()}</b>`:''}</button>`).join('')}`).join('')}</nav><div class="sidebar-footer"><div class="sidebar-user"><span class="sidebar-avatar">${esc(userInitials(user))}</span><div><strong>${esc(user.name)}</strong><span>${esc(role)}${normalizeRole(user.role)==='Salesman'?` · ${esc(branch)}`:''}</span></div></div><button class="logout-btn" data-action="logout">⇥ <span>Log out</span></button></div></aside><main class="main"><header class="topbar"><div class="topbar-title"><button class="btn btn-secondary btn-sm mobile-menu" data-action="toggle-sidebar">☰</button><div><div class="page-title">${pageMeta(ui.page).title}</div><div class="top-subtitle">${pageMeta(ui.page).sub}</div></div></div><div class="top-actions"><div class="search-stub">⌕ <span>Search anything...</span><kbd>Ctrl + K</kbd></div><button class="top-icon" title="Notifications">♧<sup>${countPendingApprovals()||''}</sup></button><div class="logged-user"><span class="logged-user-avatar">${esc(userInitials(user))}</span><div><b>${esc(user.name)}</b><small>${esc(role)}</small></div><span class="chevron">⌄</span></div></div></header><section class="content">${renderPage(ui.page)}</section></main></div>`;
}
function renderLocalLogin(){
  const users=state.users.filter(u=>u.active!==false);
  return `<div class="login-screen"><div class="login-card"><div class="login-brand"><div class="brand-mark">${esc(companyInitials())}</div><div><h1>${esc(companyName())}</h1><p>Wholesale Distribution</p></div></div><h2>Local Access</h2><p class="muted">Password login will be added after all business updates are completed. For now, choose the local user account to open the app on this laptop.</p><form data-form="temporary-login"><div class="field"><label>User</label><select name="userId">${users.map(u=>`<option value="${u.id}">${esc(u.name)} · ${esc(roleLabel(u.role))}</option>`).join('')}</select></div><button class="btn btn-primary login-submit">Log in</button></form><div class="login-note">Data is stored automatically in this laptop browser. Keep regular backups from Administration.</div></div></div>`;
}
function pageMeta(p){return {
 dashboard:{title:'Dashboard',sub:'Real-time overview of your wholesale business'},branches:{title:'Branches',sub:'Create, assign, and manage distribution branches'},users:{title:'Users & Roles',sub:'Admin, Manager and Salesman access control'},products:{title:'Products',sub:'Categories, products, stock levels, and pricing'},vendors:{title:'Vendors',sub:'Supplier profiles, purchases, and due'},customers:{title:'Customers',sub:'Customer profiles, sales, and due ledger'},purchase:{title:'Purchase',sub:'Warehouse and branch purchase invoices'},sales:{title:'Sales',sub:'Sales invoices and branch sales activity'},stock:{title:'Stock & Inventory',sub:'Live warehouse and branch stock position'},payments:{title:'Payments',sub:'Customer collection and due control'},expenses:{title:'Expenses',sub:'Warehouse and branch expense control'},transfers:{title:'Transfers',sub:'Warehouse and branch stock movement'},returns:{title:'Return & Damage',sub:'Sales return, stock return and damage requests'},reports:{title:'Settlement Report',sub:'Generate, lock, reopen, and view branch settlement periods'},approvals:{title:'Approve',sub:'Approve or reject returns and transfer requests'},logs:{title:'Activity',sub:'Full audit trail of business actions'},settings:{title:'Administration',sub:'Company profile, VAT option, backup and local storage'}
}[p]||{title:'Wholesale Distribution',sub:''};}
function renderPage(p){switch(p){case 'dashboard':return renderDashboard();case 'branches':return renderBranches();case 'users':return renderUsers();case 'products':return renderProducts();case 'vendors':return renderVendors();case 'customers':return renderCustomers();case 'purchase':return renderPurchase();case 'sales':return renderSales();case 'stock':return renderStock();case 'payments':return renderPayments();case 'expenses':return renderExpenses();case 'transfers':return renderTransfers();case 'returns':return renderReturns();case 'reports':return renderReports();case 'approvals':return renderApprovals();case 'logs':return renderLogs();case 'settings':return renderSettings();default:return '';}}

// Shared view helpers
function branchOptions(selected='', includeAll=false, includeWarehouse=true){
  const list=activeBranches(includeWarehouse);
  return `${includeAll?`<option value="">All Branches</option>`:''}${list.map(b=>`<option value="${b.id}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('')}`;
}
function productOptions(selected=''){return `<option value="">Select product</option>${activeProducts().map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)} (${esc(p.sku)})</option>`).join('')}`;}
function vendorOptions(selected=''){return `<option value="">Select vendor</option>${activeVendors().map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>${esc(v.name)}</option>`).join('')}`;}
function customerOptions(selected='',branchId=''){return `<option value="">Select customer</option>${activeCustomers(branchId).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(customerName(c.id))}</option>`).join('')}`;}
function kpi(label,value,tone='tone-blue',hint=''){return `<div class="kpi ${tone}"><div class="label">${esc(label)}</div><div class="value">${value}</div>${hint?`<div class="hint">${esc(hint)}</div>`:''}</div>`;}
function section(title,sub,body,action=''){return `<section class="card"><div class="card-head"><div><h3 class="section-title">${title}</h3>${sub?`<p class="section-sub">${sub}</p>`:''}</div>${action}</div>${body}</section>`;}
function noData(title,desc,action=''){return `<div class="empty"><div class="empty-icon">◌</div><h3>${esc(title)}</h3><p>${esc(desc)}</p>${action}</div>`;}
function unique(arr){return [...new Set(arr)];}
function selectDateRangeToolbar(key, extra=''){
  const f=defaultFilters(key); const today=isoToday();
  return `<div class="card toolbar">
    <div class="field"><label>From Date</label><input type="date" value="${f.from||today}" data-filter-key="${key}" data-filter-name="from"></div>
    <div class="field"><label>To Date</label><input type="date" value="${f.to||today}" data-filter-key="${key}" data-filter-name="to"></div>
    ${extra}
    <button class="btn btn-secondary" data-action="filter-today" data-filter-key="${key}">Today</button>
    <button class="btn btn-secondary" data-action="filter-week" data-filter-key="${key}">This Week</button>
    <button class="btn btn-secondary" data-action="filter-month" data-filter-key="${key}">This Month</button>
  </div>`;
}
function currentRange(key){ const f=defaultFilters(key); const t=isoToday(); return {from:f.from||t,to:f.to||t}; }
function branchFilterHtml(key){ const f=defaultFilters(key); return `<div class="field"><label>Branch</label><select data-filter-key="${key}" data-filter-name="branchId">${branchOptions(f.branchId||'',true,true)}</select></div>`; }
function countPendingApprovals(){ return state.transfers.filter(x=>x.status==='Pending').length+state.salesReturns.filter(x=>x.status==='Pending').length+state.stockReturns.filter(x=>x.status==='Pending').length+state.damageReturns.filter(x=>x.status==='Pending').length+state.paymentReturns.filter(x=>x.status==='Pending').length+state.purchaseReturns.filter(x=>x.status==='Pending').length; }
function startOfWeek(){const d=new Date();d.setDate(d.getDate()-d.getDay()+1);return d.toISOString().slice(0,10)}
function startOfMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;}

// Dashboard
function dashboardData(branchId='',from='',to=''){
  const sales=state.sales.filter(s=>s.status==='Active'&&(!branchId||s.branchId===branchId)&&inRange(s.date,from,to));
  const purchases=state.purchases.filter(p=>p.status==='Active'&&(!branchId||branchId==='warehouse')&&inRange(p.date,from,to));
  const expenses=state.expenses.filter(e=>e.status==='Active'&&(!branchId||e.branchId===branchId)&&inRange(e.date,from,to));
  const salesTotal=sum(sales,s=>s.total), purchaseTotal=sum(purchases,p=>p.total), expTotal=sum(expenses,e=>e.amount), gross=salesTotal-sum(sales,s=>saleCost(s)), net=gross-expTotal;
  return {sales,purchases,expenses,salesTotal,purchaseTotal,expTotal,gross,net};
}
function premiumKpi(icon,label,value,tone='blue',hint=''){
 return `<div class="dashboard-kpi tone-${tone}"><div class="dashboard-kpi-icon">${icon}</div><div class="dashboard-kpi-main"><div class="dashboard-kpi-label">${esc(label)}</div><div class="dashboard-kpi-value">${value}</div>${hint?`<div class="dashboard-kpi-hint">${esc(hint)}</div>`:''}</div><div class="sparkline"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>`;
}
function miniKpi(icon,label,value,tone='blue',hint=''){
 return `<div class="mini-kpi tone-${tone}"><div class="mini-kpi-icon">${icon}</div><div><div class="mini-kpi-label">${esc(label)}</div><div class="mini-kpi-value">${value}</div>${hint?`<div class="mini-kpi-hint">${esc(hint)}</div>`:''}</div></div>`;
}
function renderDashboard(){
 const key='dashboard',f=defaultFilters(key),range=currentRange(key),branchId=f.branchId||'',user=currentUser();
 const branchUser=normalizeRole(user.role)==='Salesman',effectiveBranch=branchUser?user.branchId:branchId,d=dashboardData(effectiveBranch,range.from,range.to);
 if(branchUser)return renderBranchDashboard(d,effectiveBranch,range);
 const custDue=sum(state.customers,c=>customerDue(c.id)),vendDue=sum(state.vendors,v=>vendorDue(v.id));
 const warehouseValue=sum(allStockRows('warehouse'),r=>r.value),branchValue=sum(allStockRows().filter(r=>r.branchId!=='warehouse'),r=>r.value);
 const low=allStockRows().filter(r=>r.qty<=Number(getProduct(r.productId)?.lowStock||state.settings.lowStockDefault)).length;
 const bankBalance=ledgerBalance('bank'),cashBalance=ledgerBalance('cash'),dailyTrend=trendData(range.from,range.to,effectiveBranch);
 return `<div class="dashboard-hero"><div><h2>Main Business Overview</h2><p>Live performance across warehouse and all branch operations.</p></div><div class="dashboard-hero-actions"><button class="btn btn-primary" data-action="open-sale">＋ New Sale</button><button class="btn btn-outline" data-action="open-purchase">＋ Purchase</button></div></div>
 ${selectDateRangeToolbar(key,branchFilterHtml(key))}
 <div class="dashboard-kpi-grid">${premiumKpi('▤','Total Sales',money(d.salesTotal),'green','Selected period')}${premiumKpi('◫','Total Purchase',money(d.purchaseTotal),'blue','Warehouse & branches')}${premiumKpi('▥','Gross Profit',money(d.gross),'purple','Sales less stock cost')}${premiumKpi('♙','Customer Due',money(custDue),'orange','All customer ledgers')}${premiumKpi('◈','Stock Value',money(warehouseValue+branchValue),'teal','Warehouse + branches')}</div>
 <div class="mini-kpi-grid">${miniKpi('◫','Vendor Due',money(vendDue),'pink','All vendors')}${miniKpi('▣','Total Expenses',money(d.expTotal),'amber','Selected period')}${miniKpi('▤','Cash in Hand',money(cashBalance),'green','All locations')}${miniKpi('▥','Bank Balance',money(bankBalance),'blue','All accounts')}${miniKpi('◈','Low Stock Items',num(low),'purple','Products')}${miniKpi('✓','Pending Approvals',num(countPendingApprovals()),'red','Transfers / returns')}</div>
 <div class="dashboard-columns"><section class="card dashboard-chart-card"><div class="card-head"><div><h3 class="section-title">Sales Overview</h3><p class="section-sub">Sales performance for selected dates</p></div><span class="badge badge-blue">${dateLabel(range.from)} – ${dateLabel(range.to)}</span></div>${renderBarChart(dailyTrend)}</section>${section('Top Selling Products','Most sold items in this period',renderTopProducts(d.sales),'<button class="link-btn" data-nav="products">View All</button>')}${section('Recent Transactions','Latest sales, purchase, collection, transfer and expenses',renderRecentTransactions(),'<button class="link-btn" data-nav="logs">View All</button>')}</div>
 <div class="dashboard-columns lower">${section('Branch-wise Business','Sales, customer due and expense overview',renderBranchMetrics(activeSubBranches().map(b=>({b,sales:sum(state.sales.filter(s=>s.status==='Active'&&s.branchId===b.id&&inRange(s.date,range.from,range.to)),s=>s.total),due:sum(state.customers.filter(c=>c.branchId===b.id),c=>customerDue(c.id)),expense:sum(state.expenses.filter(e=>e.status==='Active'&&e.branchId===b.id&&inRange(e.date,range.from,range.to)),e=>e.amount)}))), '')}${section('Settlement & Approval Status','Branch work awaiting review',renderRecentApprovals(),'<button class="link-btn" data-nav="approvals">Open Approvals</button>')}</div>
 <div class="system-status-strip"><div><span class="status-icon">▦</span><small>Company</small><b>${esc(companyName())}</b></div><div><span class="status-icon">◔</span><small>Financial Year</small><b>${new Date().getFullYear()}</b></div><div><span class="status-icon">✓</span><small>VAT Status</small><b>${state.meta.vatEnabled?'Enabled':'Not Enabled'}</b></div><div><span class="status-icon">◉</span><small>Data Status</small><b>Local Storage</b></div><div><span class="status-icon">⇩</span><small>Last Saved</small><b>${state.meta.lastSavedAt?dateTimeLabel(state.meta.lastSavedAt):'No changes yet'}</b></div><button class="btn btn-primary btn-sm" data-action="backup">⇩ Backup Now</button></div>`;
}
function renderBranchDashboard(d,branchId,range){
 const b=getBranch(branchId),custDue=sum(state.customers.filter(c=>c.branchId===branchId),c=>customerDue(c.id)),stockValue=sum(allStockRows(branchId),r=>r.value),today=isoToday();
 const todaySales=sum(state.sales.filter(s=>s.branchId===branchId&&s.status==='Active'&&s.date===today),s=>s.total),todayCollection=sum(state.customerPayments.filter(p=>p.branchId===branchId&&p.status==='Active'&&p.date===today),p=>p.amount)+sum(state.sales.filter(s=>s.branchId===branchId&&s.status==='Active'&&s.date===today),s=>s.paidAmount),todayExp=sum(state.expenses.filter(e=>e.branchId===branchId&&e.status==='Active'&&e.date===today),e=>e.amount),low=allStockRows(branchId).filter(r=>r.qty<=Number(getProduct(r.productId)?.lowStock||0)).length,latest=settlementHistoryForUser().find(x=>x.status==='Locked');
 return `<div class="dashboard-hero branch-hero"><div><span class="branch-pill">${esc(b?.name||'Assigned Branch')}</span><h2>Branch Dashboard</h2><p>Sales, stock, customer due and recent settlement for your branch.</p></div><button class="btn btn-primary" data-action="open-sale">＋ New Sale</button></div><div class="branch-kpi-grid">${premiumKpi('▤','Today Sales',money(todaySales),'blue','Today')}${premiumKpi('◈','Customer Collection',money(todayCollection),'green','Today')}${premiumKpi('♙','Customer Due',money(custDue),'orange','Your branch')}${premiumKpi('▥','Stock Value',money(stockValue),'teal','Available stock')}${premiumKpi('▣','Today Expenses',money(todayExp),'amber','Added by branch')}${premiumKpi('◉','Low Stock',num(low),'red','Replenish soon')}</div><div class="dashboard-columns branch-columns">${section('Recent Branch Sales','Latest invoices from your branch',renderRecentSales(branchId),'<button class="link-btn" data-nav="sales">Open Sales</button>')}${section('Low Stock Products','Current stock requiring attention',renderLowStock(branchId),'<button class="link-btn" data-nav="stock">View Stock</button>')}${section('Latest Locked Settlement','View-only settlement confirmed by Main Branch',latest?`<div class="card-pad"><div class="settlement-quick"><strong>${esc(latest.settlementNo||'Settlement')}</strong><span>${dateLabel(latest.from)} – ${dateLabel(latest.to)}</span><b>${money(settlementSnapshot(latest).summary?.closingCash||0)}</b><button class="btn btn-outline btn-sm" data-action="view-settlement" data-id="${latest.id}">View Settlement</button></div></div>`:noData('No locked settlement yet','Main Branch has not locked a settlement for your branch.'))}</div>`;
}
function renderRecentTransactions(){
 const rows=[];state.sales.filter(x=>x.status==='Active').forEach(x=>rows.push({date:x.date,type:'Sales Invoice',ref:x.invoiceNo,amount:x.total,tone:'green'}));state.purchases.filter(x=>x.status==='Active').forEach(x=>rows.push({date:x.date,type:'Purchase Invoice',ref:x.invoiceNo,amount:x.total,tone:'red'}));state.customerPayments.filter(x=>x.status==='Active').forEach(x=>rows.push({date:x.date,type:'Customer Collection',ref:x.paymentNo,amount:x.amount,tone:'green'}));state.expenses.filter(x=>x.status==='Active').forEach(x=>rows.push({date:x.date,type:'Expense',ref:x.description,amount:x.amount,tone:'red'}));state.transfers.forEach(x=>rows.push({date:x.date,type:'Stock Transfer',ref:x.transferNo,amount:0,tone:'blue'}));
 const list=rows.sort(byDateDesc).slice(0,6);return list.length?`<div class="transaction-list">${list.map(x=>`<div class="transaction-row"><span class="transaction-icon ${x.tone}">${x.type==='Sales Invoice'?'▤':x.type==='Purchase Invoice'?'◫':x.type==='Customer Collection'?'◈':x.type==='Stock Transfer'?'⇄':'▣'}</span><div><b>${esc(x.type)}</b><small>${esc(x.ref||'—')} · ${dateLabel(x.date)}</small></div><strong class="${x.tone}">${x.amount?money(x.amount):'—'}</strong></div>`).join('')}</div>`:noData('No transactions yet','Transactions will appear after business entries are created.');
}
function trendData(from,to,branchId=''){
  const start=parseDate(from)||parseDate(isoToday()), end=parseDate(to)||parseDate(isoToday()); const days=Math.min(12,Math.max(1,Math.round((end-start)/86400000)+1)); const out=[]; for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);const key=d.toISOString().slice(0,10);out.push({date:key,value:sum(state.sales.filter(s=>s.status==='Active'&&(!branchId||s.branchId===branchId)&&s.date===key),s=>s.total)});} return out;
}
function renderBarChart(data){ if(!data.length) return noData('No sales yet','Create a sales invoice to see the sales trend.'); const max=Math.max(...data.map(x=>x.value),1); return `<div class="chart">${data.map(x=>`<div class="bar" style="height:${Math.max(4,Math.round(x.value/max*185))}px" title="${dateLabel(x.date)}: ${money(x.value)}"><span>${x.date.slice(8)}</span></div>`).join('')}</div>`; }
function renderBranchMetrics(rows){ if(!rows.length)return noData('No sub branches yet','Create a branch to see performance.','<button class="btn btn-primary" data-action="open-branch">＋ Create Branch</button>'); return `<div class="table-wrap"><table class="table"><thead><tr><th>Branch</th><th class="num">Sales</th><th class="num">Customer Due</th><th class="num">Expenses</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="bold">${esc(r.b.name)}</td><td class="num">${money(r.sales)}</td><td class="num">${money(r.due)}</td><td class="num">${money(r.expense)}</td></tr>`).join('')}</tbody></table></div>`; }
function renderTopProducts(sales){ const map={}; sales.forEach(s=>(s.lines||[]).forEach(l=>{const k=l.productId;map[k]=map[k]||{qty:0,amount:0};map[k].qty+=Number(l.qty);map[k].amount+=Number(l.total);})); const rows=Object.entries(map).sort((a,b)=>b[1].qty-a[1].qty).slice(0,5); return rows.length?`<div class="card-pad">${rows.map(([id,x],i)=>`<div class="list-row"><div><div class="list-title">${i+1}. ${esc(productName(id))}</div><div class="list-meta">${num(x.qty)} units sold</div></div><strong>${money(x.amount)}</strong></div>`).join('')}</div>`:noData('No product sales','Sales will appear here after invoices are created.');}
function renderTopDueCustomers(){ const rows=state.customers.map(c=>({c,due:customerDue(c.id)})).filter(x=>x.due>0).sort((a,b)=>b.due-a.due).slice(0,5); return rows.length?`<div class="card-pad">${rows.map(x=>`<div class="list-row"><div><div class="list-title">${esc(customerName(x.c.id))}</div><div class="list-meta">${esc(branchName(x.c.branchId))}</div></div><strong>${money(x.due)}</strong></div>`).join('')}</div>`:noData('No outstanding customer due','Customer due balances will appear here.');}
function renderRecentApprovals(){ const rows=getApprovalRows().sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt))).slice(0,5); return rows.length?`<div class="card-pad">${rows.map(x=>`<div class="list-row"><div><div class="list-title">${esc(x.type)}</div><div class="list-meta">${esc(branchName(x.branchId))} · ${dateLabel(x.date)}</div></div>${statusBadge(x.status)}</div>`).join('')}</div>`:noData('No approval activity','Pending or completed return requests will show here.');}
function renderRecentSales(branchId=''){ const rows=state.sales.filter(s=>s.status==='Active'&&(!branchId||s.branchId===branchId)).sort(byDateDesc).slice(0,6); return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total</th></tr></thead><tbody>${rows.map(s=>`<tr><td class="bold">${esc(s.invoiceNo)}</td><td>${dateLabel(s.date)}</td><td>${esc(customerName(s.customerId))}</td><td class="num">${money(s.total)}</td></tr>`).join('')}</tbody></table></div>`:noData('No sales invoices','Create sales invoice from the Sales menu.');}
function renderRecentTransfers(){ const rows=state.transfers.sort(byDateDesc).slice(0,6); return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Transfer</th><th>Date</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>${rows.map(t=>`<tr><td class="bold">${esc(t.transferNo)}</td><td>${dateLabel(t.date)}</td><td>${esc(branchName(t.sourceBranchId))}</td><td>${esc(branchName(t.destinationBranchId))}</td><td>${statusBadge(t.status)}</td></tr>`).join('')}</tbody></table></div>`:noData('No stock transfers','Warehouse transfers will appear here.');}
function renderLowStock(branchId=''){const rows=allStockRows(branchId).filter(r=>r.qty<=Number(getProduct(r.productId)?.lowStock||0));return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th class="num">Available</th><th class="num">Limit</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="bold">${esc(productName(r.productId))}</td><td class="num">${num(r.qty)}</td><td class="num">${num(getProduct(r.productId)?.lowStock||0)}</td></tr>`).join('')}</tbody></table></div>`:noData('Stock is healthy','No low stock products for this branch.');}

// Branches
function renderBranches(){
  const user=currentUser();
  const rows=isSalesman()?state.branches.filter(b=>b.id===user.branchId):state.branches;
  return `<div class="page-heading"><div><h2>Branch Management</h2><p>Warehouse is the central main branch. Create unlimited sub branches and assign users.</p></div>${can('branches')&&user.role!=='Salesman'?`<button class="btn btn-primary" data-action="open-branch">＋ Create Branch</button>`:''}</div>
  ${section('All Branches','Edit, activate/deactivate, and assign salesmen or managers.',`<div class="table-wrap"><table class="table"><thead><tr><th>Branch</th><th>Code</th><th>Address</th><th>Salesman</th><th>Manager</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>${rows.map(b=>`<tr><td class="bold">${esc(b.name)}${b.isWarehouse?' <span class="badge badge-blue">Main</span>':''}</td><td>${esc(b.code||'—')}</td><td>${esc(b.address||'—')}</td><td>${esc(getUser(b.assignedSalesmanId)?.name||'Not assigned')}</td><td>${esc(getUser(b.assignedManagerId||b.assignedAccountantId)?.name||'Not assigned')}</td><td>${statusBadge(b.status)}</td><td class="right">${!b.isWarehouse&&user.role!=='Salesman'?`<button class="btn btn-outline btn-sm" data-action="edit-branch" data-id="${b.id}">Edit</button> <button class="btn ${b.status==='Active'?'btn-warning':'btn-success'} btn-sm" data-action="toggle-branch" data-id="${b.id}">${b.status==='Active'?'Deactivate':'Activate'}</button>`:'<span class="muted">Protected</span>'}</td></tr>`).join('')}</tbody></table></div>`)}`;
}
function branchModal(id=''){
 const b=id?getBranch(id):null; const salesmen=state.users.filter(u=>normalizeRole(u.role)==='Salesman'&&u.active!==false); const managers=state.users.filter(u=>normalizeRole(u.role)==='Manager'&&u.active!==false);
 openModal(`<div class="modal-head"><div><h3>${b?'Edit Branch':'Create Branch'}</h3><p>Create a sub branch and assign users. Warehouse is fixed as the main branch.</p></div><button class="modal-close" data-close-modal>×</button></div>
 <form data-form="branch" data-id="${b?.id||''}"><div class="modal-body"><div class="form-grid">
 <div class="field"><label>Branch Name *</label><input name="name" required value="${esc(b?.name||'')}"></div>
 <div class="field"><label>Branch Code *</label><input name="code" required value="${esc(b?.code||'')}"></div>
 <div class="field form-full"><label>Address</label><input name="address" value="${esc(b?.address||'')}"></div>
 <div class="field"><label>Phone</label><input name="phone" value="${esc(b?.phone||'')}"></div>
 <div class="field"><label>Status</label><select name="status"><option ${b?.status!=='Inactive'?'selected':''}>Active</option><option ${b?.status==='Inactive'?'selected':''}>Inactive</option></select></div>
 <div class="field"><label>Assigned Salesman</label><select name="assignedSalesmanId"><option value="">Not assigned</option>${salesmen.map(u=>`<option value="${u.id}" ${b?.assignedSalesmanId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
 <div class="field"><label>Assigned Manager</label><select name="assignedManagerId"><option value="">Not assigned</option>${managers.map(u=>`<option value="${u.id}" ${(b?.assignedManagerId||b?.assignedAccountantId)===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
 <div class="field form-full"><label>Notes</label><textarea name="notes">${esc(b?.notes||'')}</textarea></div>
 </div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">${b?'Save Changes':'Create Branch'}</button></div></form>`);
}

// Users
function renderUsers(){
 const rows=state.users;
 return `<div class="page-heading"><div><h2>Users & Roles</h2><p>Create Admin, Manager and Salesman accounts. Manager permissions are selected one by one.</p></div><button class="btn btn-primary" data-action="open-user">＋ Create User</button></div><div class="role-guide-grid"><div class="role-guide owner"><b>Owner / Admin</b><span>Full access to every menu, report, approval and administration control.</span></div><div class="role-guide manager"><b>Manager</b><span>Only the operational permissions selected while creating the user.</span></div><div class="role-guide salesman"><b>Salesman</b><span>Automatically opens only the assigned branch dashboard and workspace.</span></div></div>${section('System Users','Owner is the protected main account. New users are Admin, Manager or Salesman.',`<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Role</th><th>Assigned Branch</th><th>Permissions</th><th>Email</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>${rows.map(u=>`<tr><td class="bold">${esc(u.name)}${normalizeRole(u.role)==='Owner'?' <span class="badge badge-purple">Protected</span>':''}</td><td>${statusBadge(roleLabel(u.role))}</td><td>${esc(normalizeRole(u.role)==='Salesman'?branchName(u.branchId):(u.branchId&&u.branchId!=='warehouse'?branchName(u.branchId):'—'))}</td><td>${normalizeRole(u.role)==='Manager'?`<span class="permission-text">${esc((u.permissions||DEFAULT_MANAGER_PERMISSIONS).map(managerPermissionLabel).join(', ')||'No permissions')}</span>`:normalizeRole(u.role)==='Salesman'?'Branch workspace only':'Full access'}</td><td>${esc(u.email||'—')}</td><td>${statusBadge(u.active===false?'Inactive':'Active')}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="edit-user" data-id="${u.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`)}`;
}
function managerPermissionCheckboxes(selected=[]){const chosen=new Set(selected||[]);return MANAGER_PERMISSION_OPTIONS.map(([id,label])=>`<label class="permission-check"><input type="checkbox" name="managerPermission" value="${id}" ${chosen.has(id)?'checked':''}><span>${esc(label)}</span></label>`).join('');}
function userModal(id=''){
 const u=id?getUser(id):null,role=normalizeRole(u?.role||'Salesman'),isProtected=Boolean(u&&normalizeRole(u.role)==='Owner'),selectedPermissions=Array.isArray(u?.permissions)?u.permissions:(role==='Manager'?DEFAULT_MANAGER_PERMISSIONS:[]);
 openModal(`<div class="modal-head"><div><h3>${u?'Edit User':'Create User'}</h3><p>${isProtected?'The Owner account is protected. You may update contact details only.':'Select the correct role and access before saving.'}</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="user" data-id="${u?.id||''}"><div class="modal-body"><div class="form-grid"><div class="field"><label>Full Name *</label><input name="name" required value="${esc(u?.name||'')}"></div><div class="field"><label>Email</label><input type="email" name="email" value="${esc(u?.email||'')}"></div><div class="field"><label>Role *</label>${isProtected?`<input value="Owner" disabled><input type="hidden" name="role" value="Owner">`:`<select name="role" data-action="role-change"><option value="Admin" ${role==='Admin'?'selected':''}>Admin</option><option value="Manager" ${role==='Manager'?'selected':''}>Manager</option><option value="Salesman" ${role==='Salesman'?'selected':''}>Salesman</option></select>`}<span class="field-help">Admin has all Owner account options.</span></div><div class="field"><label>Assigned Branch ${role==='Salesman'?'*':''}</label><select name="branchId">${branchOptions(u?.branchId||'warehouse',false,true)}</select><span class="field-help">Salesman logs in directly to this branch.</span></div><div class="field"><label>Status</label><select name="active"><option value="true" ${u?.active!==false?'selected':''}>Active</option><option value="false" ${u?.active===false?'selected':''}>Inactive</option></select></div></div><div class="manager-permissions ${role==='Manager'?'show':''}" data-manager-permissions><div class="permission-heading"><div><h4>Manager Permissions</h4><p>Select only the operational work this Manager is allowed to perform.</p></div><span class="badge badge-amber">Manager Only</span></div><div class="permission-grid">${managerPermissionCheckboxes(selectedPermissions)}</div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">${u?'Save Changes':'Create User'}</button></div></form>`);
}

// Products/categories
function renderProducts(){
 const cats=state.categories; const rows=state.products;
 return `<div class="page-heading"><div><h2>Products & Categories</h2><p>Use weighted average purchase cost for stock valuation and profit calculations.</p></div><div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="open-category">＋ Category</button><button class="btn btn-primary" data-action="open-product">＋ Product</button></div></div>
 <div class="grid grid-3">${kpi('Active Products',num(rows.filter(p=>p.status==='Active').length),'tone-blue')}${kpi('Categories',num(cats.filter(c=>c.status==='Active').length),'tone-teal')}${kpi('Total Stock Value',money(sum(allStockRows(),r=>r.value)),'tone-purple')}</div>
 <div class="grid grid-3" style="margin-top:16px"><section class="card" style="grid-column:span 1"><div class="card-head"><div><h3 class="section-title">Categories</h3><p class="section-sub">Product grouping</p></div></div><div class="card-pad">${cats.length?cats.map(c=>`<div class="list-row"><div><div class="list-title">${esc(c.name)}</div><div class="list-meta">${state.products.filter(p=>p.categoryId===c.id).length} products</div></div><div><button class="btn btn-outline btn-sm" data-action="edit-category" data-id="${c.id}">Edit</button></div></div>`).join(''):noData('No categories','Create your first category before adding products.','<button class="btn btn-primary" data-action="open-category">＋ Category</button>')}</div></section><section class="card" style="grid-column:span 2"><div class="card-head"><div><h3 class="section-title">Product List</h3><p class="section-sub">Products can be used in purchase, stock transfer, and sales.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Unit</th><th class="num">Purchase Price</th><th class="num">Selling Price</th><th class="num">Total Stock</th><th class="num">Stock Value</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>${rows.length?rows.map(p=>{const stk=sum(allStockRows().filter(r=>r.productId===p.id),r=>r.qty),val=sum(allStockRows().filter(r=>r.productId===p.id),r=>r.value);return `<tr><td class="bold">${esc(p.name)}</td><td>${esc(p.sku)}</td><td>${esc(state.categories.find(c=>c.id===p.categoryId)?.name||'—')}</td><td>${esc(p.unit)}</td><td class="num">${money(p.defaultPurchasePrice)}</td><td class="num">${money(p.defaultSellingPrice)}</td><td class="num">${num(stk)}</td><td class="num">${money(val)}</td><td>${statusBadge(p.status)}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="edit-product" data-id="${p.id}">Edit</button></td></tr>`}).join(''):`<tr><td colspan="10">${noData('No products','Create category and then create product.','<button class="btn btn-primary" data-action="open-product">＋ Product</button>')}</td></tr>`}</tbody></table></div></section></div>`;
}
function categoryModal(id=''){
 const c=id?state.categories.find(x=>x.id===id):null;
 openModal(`<div class="modal-head"><div><h3>${c?'Edit Category':'Create Category'}</h3><p>Categories organize products for reporting and stock.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="category" data-id="${c?.id||''}"><div class="modal-body"><div class="form-grid"><div class="field"><label>Category Name *</label><input name="name" required value="${esc(c?.name||'')}"></div><div class="field"><label>Status</label><select name="status"><option ${c?.status!=='Inactive'?'selected':''}>Active</option><option ${c?.status==='Inactive'?'selected':''}>Inactive</option></select></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Save Category</button></div></form>`);
}
function productModal(id=''){
 const p=id?getProduct(id):null;
 openModal(`<div class="modal-head"><div><h3>${p?'Edit Product':'Create Product'}</h3><p>Set default prices and low-stock warning. Actual purchase cost is preserved in every purchase invoice.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="product" data-id="${p?.id||''}"><div class="modal-body"><div class="form-grid"><div class="field"><label>Product Name *</label><input name="name" required value="${esc(p?.name||'')}"></div><div class="field"><label>Product Code / SKU *</label><input name="sku" required value="${esc(p?.sku||'')}"></div><div class="field"><label>Category *</label><select name="categoryId" required><option value="">Select category</option>${state.categories.filter(c=>c.status==='Active').map(c=>`<option value="${c.id}" ${p?.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Unit *</label><input name="unit" required placeholder="pcs, carton, kg" value="${esc(p?.unit||'pcs')}"></div><div class="field"><label>Default Purchase Price</label><input type="number" min="0" step="0.01" name="defaultPurchasePrice" value="${p?.defaultPurchasePrice||0}"></div><div class="field"><label>Default Selling Price</label><input type="number" min="0" step="0.01" name="defaultSellingPrice" value="${p?.defaultSellingPrice||0}"></div><div class="field"><label>Low Stock Alert Quantity</label><input type="number" min="0" step="0.001" name="lowStock" value="${p?.lowStock??state.settings.lowStockDefault}"></div><div class="field"><label>Status</label><select name="status"><option ${p?.status!=='Inactive'?'selected':''}>Active</option><option ${p?.status==='Inactive'?'selected':''}>Inactive</option></select></div><div class="field form-full"><label>Notes</label><textarea name="notes">${esc(p?.notes||'')}</textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">${p?'Save Changes':'Create Product'}</button></div></form>`);
}

// Vendors
function renderVendors(){
 const f=defaultFilters('vendors'); const rows=state.vendors.filter(v=>!f.vendorId||v.id===f.vendorId);
 return `<div class="page-heading"><div><h2>Vendors</h2><p>Manage suppliers, purchase history, vendor payments, and outstanding due.</p></div><button class="btn btn-primary" data-action="open-vendor">＋ Create Vendor</button></div>
 <div class="grid grid-4">${kpi('Total Vendors',num(state.vendors.length),'tone-blue')}${kpi('Total Purchase Amount',money(sum(state.purchases.filter(p=>p.status==='Active'),p=>p.total)),'tone-teal')}${kpi('Total Vendor Paid',money(sum(state.vendorPayments.filter(p=>p.status==='Active'),p=>p.amount)),'tone-green')}${kpi('Total Vendor Due',money(sum(state.vendors,v=>vendorDue(v.id))),'tone-orange')}</div>
 <div style="margin-top:16px">${section('Vendor List','Click Ledger to view purchase, payment and due activity.',`<div class="table-wrap"><table class="table"><thead><tr><th>Vendor</th><th>Contact</th><th>Phone</th><th class="num">Purchase</th><th class="num">Paid</th><th class="num">Due</th><th class="right">Actions</th></tr></thead><tbody>${rows.length?rows.map(v=>{const purchase=sum(state.purchases.filter(p=>p.vendorId===v.id&&p.status==='Active'),p=>p.total),paid=sum(state.vendorPayments.filter(p=>p.vendorId===v.id&&p.status==='Active'),p=>p.amount);return `<tr><td class="bold">${esc(v.name)}</td><td>${esc(v.contactPerson||'—')}</td><td>${esc(v.phone||'—')}</td><td class="num">${money(purchase)}</td><td class="num">${money(paid)}</td><td class="num bold">${money(vendorDue(v.id))}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="vendor-ledger" data-id="${v.id}">Ledger</button> <button class="btn btn-primary btn-sm" data-action="open-vendor-payment" data-id="${v.id}">Pay</button> <button class="btn btn-outline btn-sm" data-action="edit-vendor" data-id="${v.id}">Edit</button></td></tr>`}).join(''):`<tr><td colspan="7">${noData('No vendors','Create a vendor before creating a purchase invoice.','<button class="btn btn-primary" data-action="open-vendor">＋ Create Vendor</button>')}</td></tr>`}</tbody></table></div>`)}</div>`;
}
function vendorModal(id=''){
 const v=id?getVendor(id):null;
 openModal(`<div class="modal-head"><div><h3>${v?'Edit Vendor':'Create Vendor'}</h3><p>Create supplier profile for purchase invoices and vendor ledger.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="vendor" data-id="${v?.id||''}"><div class="modal-body"><div class="form-grid"><div class="field"><label>Vendor Name *</label><input name="name" required value="${esc(v?.name||'')}"></div><div class="field"><label>Phone</label><input name="phone" value="${esc(v?.phone||'')}"></div><div class="field"><label>Contact Person</label><input name="contactPerson" value="${esc(v?.contactPerson||'')}"></div><div class="field"><label>Opening Balance</label><input type="number" step="0.01" min="0" name="openingBalance" value="${v?.openingBalance||0}"></div><div class="field form-full"><label>Address</label><input name="address" value="${esc(v?.address||'')}"></div><div class="field form-full"><label>Notes</label><textarea name="notes">${esc(v?.notes||'')}</textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">${v?'Save Changes':'Create Vendor'}</button></div></form>`);
}
function vendorLedgerModal(id){ const v=getVendor(id); const p=state.purchases.filter(x=>x.vendorId===id&&x.status==='Active').map(x=>({date:x.date,type:'Purchase',amount:x.total,ref:x.invoiceNo,method:''})); const pay=state.vendorPayments.filter(x=>x.vendorId===id&&x.status==='Active').map(x=>({date:x.date,type:'Payment',amount:-x.amount,ref:x.paymentNo,method:x.method})); const ret=state.purchaseReturns.filter(x=>x.vendorId===id&&x.status==='Approved').map(x=>({date:x.date,type:'Purchase Return',amount:-x.total,ref:x.returnNo,method:''})); const rows=[...p,...pay,...ret].sort(byDateDesc); openModal(`<div class="modal-head"><div><h3>Vendor Ledger — ${esc(v?.name||'')}</h3><p>Current Vendor Due: <strong>${money(vendorDue(id))}</strong></p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${dateLabel(r.date)}</td><td>${statusBadge(r.type)}</td><td>${esc(r.ref)}</td><td>${esc(r.method||'—')}</td><td class="num ${r.amount<0?'':'bold'}">${r.amount<0?'- ':''}${money(Math.abs(r.amount))}</td></tr>`).join('')||'<tr><td colspan="5" class="center muted">No ledger records yet.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" data-action="print-modal">Print</button></div>`); }

// Customers
function renderCustomers(){
 const user=currentUser();
 const f=defaultFilters('customers');
 // Customer lists are location-wise. Owner/Admin starts at Main Warehouse; branch users are fixed to their own branch.
 const isSalesman=normalizeRole(user?.role)==='Salesman';
 const isOwnerOrAdmin=normalizeRole(user?.role)==='Owner'||normalizeRole(user?.role)==='Admin';
 const defaultLocation=isSalesman?user.branchId:(isOwnerOrAdmin?'warehouse':(user.branchId||'warehouse'));
 const selectedLocation=isSalesman?user.branchId:(f.branchId||defaultLocation);
 let rows=state.customers.filter(c=>c.branchId===selectedLocation&&(!f.q||customerName(c.id).toLowerCase().includes(f.q.toLowerCase())));
 const locationControl=isSalesman
   ? `<div class="field"><label>Location</label><input value="${esc(branchName(user.branchId))}" disabled></div>`
   : isOwnerOrAdmin
     ? `<div class="field"><label>Location</label><select data-filter-key="customers" data-filter-name="branchId">${branchOptions(selectedLocation,false,true)}</select></div>`
     : `<div class="field"><label>Location</label><input value="${esc(branchName(selectedLocation))}" disabled></div>`;
 return `<div class="page-heading"><div><h2>Customers</h2><p>Customers, sales, collections and due are kept separately by Warehouse or Branch.</p></div><button class="btn btn-primary" data-action="open-customer">＋ Create Customer</button></div>
 <div class="card toolbar">${locationControl}<div class="field"><label>Search Customer / Shop</label><input value="${esc(f.q||'')}" placeholder="Customer name or shop" data-filter-key="customers" data-filter-name="q"></div></div>
 <div class="grid grid-4" style="margin-top:16px">${kpi('Total Customers',num(rows.length),'tone-blue')}${kpi('Total Sales',money(sum(state.sales.filter(s=>s.status==='Active'),s=>s.total)),'tone-teal')}${kpi('Credit Collections',money(sum(state.customerPayments.filter(p=>p.status==='Active'),p=>p.amount)),'tone-green')}${kpi('Total Customer Due',money(sum(rows,c=>customerDue(c.id))),'tone-purple')}</div>
 <div style="margin-top:16px">${section('Customer List','Customer ledger preserves invoices, collections, returns and outstanding due.',`<div class="table-wrap"><table class="table"><thead><tr><th>Customer / Shop</th><th>Branch</th><th>Phone</th><th class="num">Credit Limit</th><th class="num">Due</th><th class="right">Actions</th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td><div class="bold">${esc(c.name)}</div><div class="muted">${esc(c.shopName||'—')}</div></td><td>${esc(branchName(c.branchId))}</td><td>${esc(c.phone||'—')}</td><td class="num">${money(c.creditLimit||0)}</td><td class="num bold">${money(customerDue(c.id))}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="customer-ledger" data-id="${c.id}">Ledger</button> <button class="btn btn-primary btn-sm" data-action="open-customer-payment" data-id="${c.id}">Collect</button> <button class="btn btn-outline btn-sm" data-action="edit-customer" data-id="${c.id}">Edit</button></td></tr>`).join(''):`<tr><td colspan="6">${noData('No customers','Create customers before issuing sales invoices.','<button class="btn btn-primary" data-action="open-customer">＋ Create Customer</button>')}</td></tr>`}</tbody></table></div>`)}</div>`;
}
function customerModal(id=''){
 const c=id?getCustomer(id):null; const user=currentUser(); const role=normalizeRole(user?.role); const isSalesman=role==='Salesman'; const isOwnerOrAdmin=role==='Owner'||role==='Admin';
 const defaultBranch=isSalesman?user.branchId:(c?.branchId||(isOwnerOrAdmin?'warehouse':(user.branchId||'warehouse')));
 const locationField=isSalesman
   ? `<div class="field"><label>Location *</label><input value="${esc(branchName(defaultBranch))}" disabled><input type="hidden" name="branchId" value="${esc(defaultBranch)}"></div>`
   : isOwnerOrAdmin
     ? `<div class="field"><label>Location *</label><select name="branchId" required>${branchOptions(defaultBranch,false,true)}</select></div>`
     : `<div class="field"><label>Location *</label><input value="${esc(branchName(defaultBranch))}" disabled><input type="hidden" name="branchId" value="${esc(defaultBranch)}"></div>`;
 openModal(`<div class="modal-head"><div><h3>${c?'Edit Customer':'Create Customer'}</h3><p>Choose Main Warehouse or a branch. This customer will remain visible only in that location.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="customer" data-id="${c?.id||''}"><div class="modal-body"><div class="form-grid"><div class="field"><label>Customer Name *</label><input name="name" required value="${esc(c?.name||'')}"></div><div class="field"><label>Shop Name</label><input name="shopName" value="${esc(c?.shopName||'')}"></div><div class="field"><label>Phone</label><input name="phone" value="${esc(c?.phone||'')}"></div>${locationField}<div class="field"><label>Credit Limit</label><input type="number" min="0" step="0.01" name="creditLimit" value="${c?.creditLimit||0}"></div><div class="field"><label>Opening Due</label><input type="number" min="0" step="0.01" name="openingDue" value="${c?.openingDue||0}"></div><div class="field form-full"><label>Address</label><input name="address" value="${esc(c?.address||'')}"></div><div class="field form-full"><label>Notes</label><textarea name="notes">${esc(c?.notes||'')}</textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">${c?'Save Changes':'Create Customer'}</button></div></form>`);
}
function customerLedgerModal(id){
 const c=getCustomer(id);
 // Cash/Bank sales are deliberately excluded from the customer account.
 const sales=state.sales.filter(s=>s.customerId===id&&s.status==='Active'&&Number(s.dueAmount??Math.max(0,Number(s.total||0)-Number(s.paidAmount||0)))>0).map(s=>({date:s.date,type:'Credit Sale',amount:Number(s.dueAmount??Math.max(0,Number(s.total||0)-Number(s.paidAmount||0))),ref:s.invoiceNo}));
 const pays=state.customerPayments.filter(p=>p.customerId===id&&p.status==='Active').map(p=>({date:p.date,type:'Customer Payment',amount:-p.amount,ref:p.paymentNo}));
 const salesRet=state.salesReturns.filter(r=>r.customerId===id&&r.status==='Approved'&&salesReturnDueEffect(r)>0).map(r=>({date:r.date,type:'Sales Return',amount:-salesReturnDueEffect(r),ref:r.returnNo}));
 const payRet=state.paymentReturns.filter(r=>r.customerId===id&&r.status==='Approved').map(r=>({date:r.date,type:'Payment Return',amount:r.amount,ref:r.returnNo}));
 const rows=[...sales,...pays,...salesRet,...payRet].sort(byDateDesc);
 openModal(`<div class="modal-head"><div><h3>Customer Ledger — ${esc(customerName(id))}</h3><p>Only due/credit sales appear here. Current Customer Due: <strong>${money(customerDue(id))}</strong></p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="num">Debit / Due</th><th class="num">Credit / Payment</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${dateLabel(r.date)}</td><td>${statusBadge(r.type)}</td><td>${esc(r.ref)}</td><td class="num">${r.amount>0?money(r.amount):'—'}</td><td class="num">${r.amount<0?money(Math.abs(r.amount)):'—'}</td></tr>`).join('')||'<tr><td colspan="5" class="center muted">No credit/due ledger records.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" data-action="print-modal">Print Statement</button></div>`);
}

// Purchase Module
function renderPurchase(){
 const f=defaultFilters('purchase'); const range=currentRange('purchase'); const rows=state.purchases.filter(p=>p.status==='Active'&&inRange(p.date,range.from,range.to)&&(!f.vendorId||p.vendorId===f.vendorId)).sort(byDateDesc);
 return `<div class="page-heading"><div><h2>Purchase</h2><p>Purchase stock into the selected warehouse or branch. Vendor due updates automatically.</p></div><div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="open-purchase-return">↩ Purchase Return</button><button class="btn btn-primary" data-action="open-purchase">＋ Purchase Invoice</button></div></div>
 ${selectDateRangeToolbar('purchase',`<div class="field"><label>Vendor</label><select data-filter-key="purchase" data-filter-name="vendorId"><option value="">All Vendors</option>${activeVendors().map(v=>`<option value="${v.id}" ${f.vendorId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div>`)}
 <div class="grid grid-4" style="margin-top:16px">${kpi('Purchase Amount',money(sum(rows,p=>p.total)),'tone-teal')}${kpi('Paid at Purchase',money(sum(rows,p=>p.paidAmount)),'tone-green')}${kpi('Purchase Due',money(sum(rows,p=>p.total-p.paidAmount)),'tone-orange')}${kpi('Purchase Returns',money(sum(state.purchaseReturns.filter(r=>r.status==='Approved'&&inRange(r.date,range.from,range.to)),r=>r.total)),'tone-purple')}</div>
 <div style="margin-top:16px">${section('Purchase Invoice List','Selected location stock and vendor ledger update immediately after saving.',`<div class="table-wrap"><table class="table"><thead><tr><th>Invoice No</th><th>Date</th><th>Stock Location</th><th>Vendor</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th>Method</th><th class="right">Action</th></tr></thead><tbody>${rows.length?rows.map(p=>`<tr><td class="bold">${esc(p.invoiceNo)}</td><td>${dateLabel(p.date)}</td><td>${esc(branchName(purchaseBranchId(p)))}</td><td>${esc(vendorName(p.vendorId))}</td><td class="num">${money(p.total)}</td><td class="num">${money(p.paidAmount)}</td><td class="num">${money(p.total-p.paidAmount)}</td><td>${esc(p.paymentMethod||'Due')}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="view-purchase" data-id="${p.id}">View</button> <button class="btn btn-warning btn-sm" data-action="purchase-return-from" data-id="${p.id}">Return</button></td></tr>`).join(''):`<tr><td colspan="9">${noData('No purchase invoices','Create a Purchase Invoice to add stock to Warehouse or a branch.','<button class="btn btn-primary" data-action="open-purchase">＋ Purchase Invoice</button>')}</td></tr>`}</tbody></table></div>`)}</div>
 <div style="margin-top:16px">${section('Purchase Return History','Purchase returns need approval before Warehouse stock and vendor ledger adjust.',renderPurchaseReturnList(),'')}</div>`;
}
function purchaseLineHtml(productId='',qty='',price=''){return `<tr class="purchase-line"><td><select class="pl-product" required>${productOptions(productId)}</select></td><td><input class="pl-qty" type="number" min="0.001" step="0.001" required value="${qty}" placeholder="Qty"></td><td><input class="pl-price" type="number" min="0" step="0.01" required value="${price}" placeholder="Unit price"></td><td class="num line-total">${money((Number(qty)||0)*(Number(price)||0))}</td><td><button type="button" class="btn btn-danger btn-sm" data-action="remove-line">×</button></td></tr>`;}
function purchaseModal(){
 if(!state.products.length||!state.vendors.length){toast('Create at least one Vendor and Product before purchase.','warning');return;}
 const user=currentUser(); const branches=user.role==='Salesman'?[getBranch(user.branchId)]:activeBranches(true); const defaultBranch=user.role==='Salesman'?user.branchId:'warehouse';
 openModal(`<div class="modal-head"><div><h3>Create Purchase Invoice</h3><p>Select the Warehouse or a Branch. Stock and vendor due will update after saving.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="purchase"><div class="modal-body"><div class="form-grid-3"><div class="field"><label>Purchase Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Stock Location *</label><select name="branchId" ${user.role==='Salesman'?'disabled':''}>${branches.map(x=>`<option value="${x.id}" ${x.id===defaultBranch?'selected':''}>${esc(x.name)}</option>`).join('')}</select>${user.role==='Salesman'?`<input type="hidden" name="branchId" value="${defaultBranch}">`:''}</div><div class="field"><label>Vendor *</label><select name="vendorId" required>${vendorOptions()}</select></div><div class="field"><label>Invoice Number</label><input name="invoiceNo" value="${nextRef('PI',state.purchases)}"></div></div><div style="margin-top:18px" class="line-editor"><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit Purchase Price</th><th class="num">Line Total</th><th></th></tr></thead><tbody id="purchase-lines">${purchaseLineHtml()}</tbody></table></div><button type="button" class="btn btn-outline btn-sm add-line" data-action="add-purchase-line">＋ Add Product Line</button><div class="grid grid-2" style="margin-top:18px"><div class="field"><label>Paid Amount</label><input type="number" min="0" step="0.01" name="paidAmount" value="0"></div><div class="field"><label>Payment Method</label><select name="paymentMethod"><option>Due</option><option>Cash</option><option>Bank</option></select></div><div class="field form-full"><label>Notes</label><textarea name="notes"></textarea></div></div><div class="summary-panel" style="margin-top:14px"><div class="summary-row"><span>Purchase Total</span><strong id="purchase-total">${money(0)}</strong></div><div class="summary-row total"><span>Vendor Due from this Invoice</span><strong id="purchase-due">${money(0)}</strong></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Save Purchase Invoice</button></div></form>`);
}
function purchaseReturnModal(purchaseId=''){
 const invs=state.purchases.filter(p=>p.status==='Active'&&(p.lines||[]).some((_,i)=>purchaseReturnLineAvailable(p,i)>0));
 if(!invs.length){toast('No purchase invoice has quantity available for return.','warning');return;}
 const target=invs.find(x=>x.id===purchaseId)||invs[0];
 const lineRows=(target.lines||[]).map((l,i)=>{
   const already=returnedQtyForInvoiceLine('purchaseReturns','purchaseId',target.id,i,l.productId);
   const invoiceAvailable=Math.max(0,Number(l.qty||0)-already);
   const purchaseLocation=purchaseBranchId(target);
   const warehouseQty=Math.max(0,stockPosition(purchaseLocation,l.productId).qty);
   const allowed=Math.min(invoiceAvailable,warehouseQty);
   return `<tr class="purchase-return-line"><td>${esc(productName(l.productId))}<input type="hidden" class="pr-product" value="${l.productId}"><input type="hidden" class="pr-line-index" value="${i}"></td><td class="num">${num(l.qty)}</td><td class="num">${num(already)}</td><td class="num">${num(warehouseQty)}</td><td class="num bold">${num(allowed)}</td><td><input type="number" class="pr-qty" min="0" max="${allowed}" step="0.001" value="0" ${allowed<=0?'disabled':''}></td><td><input class="pr-reason" placeholder="Return reason" ${allowed<=0?'disabled':''}></td></tr>`;
 }).join('');
 openModal(`<div class="modal-head"><div><h3>Purchase Return Request</h3><p>Only invoice quantity still available and current stock at the purchase location can be returned.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="purchase-return"><div class="modal-body"><div class="form-grid"><div class="field"><label>Purchase Invoice *</label><select name="purchaseId" data-action="reload-purchase-return">${invs.map(x=>`<option value="${x.id}" ${x.id===target.id?'selected':''}>${esc(x.invoiceNo)} · ${dateLabel(x.date)} · ${esc(vendorName(x.vendorId))}</option>`).join('')}</select></div><div class="field"><label>Return Date *</label><input type="date" name="date" value="${isoToday()}" required></div></div><div class="line-editor" style="margin-top:16px"><table><thead><tr><th>Product</th><th class="num">Original Qty</th><th class="num">Already Requested / Returned</th><th class="num">Current Stock</th><th class="num">Available Return Qty</th><th>Return Qty</th><th>Reason</th></tr></thead><tbody>${lineRows}</tbody></table></div><div class="field" style="margin-top:16px"><label>Notes</label><textarea name="notes"></textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Submit Return Request</button></div></form>`);
}
function renderPurchaseReturnList(){ const rows=state.purchaseReturns.sort(byDateDesc); return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Return No</th><th>Date</th><th>Vendor</th><th class="num">Amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="bold">${esc(r.returnNo)}</td><td>${dateLabel(r.date)}</td><td>${esc(vendorName(r.vendorId))}</td><td class="num">${money(r.total)}</td><td>${statusBadge(r.status)}</td><td>${esc(r.notes||'—')}</td></tr>`).join('')}</tbody></table></div>`:noData('No purchase return requests','Purchase returns will appear here.');}

// Sales Module
function renderSales(){
 const f=defaultFilters('sales'); const range=currentRange('sales'); const user=currentUser(); const branchId=user.role==='Salesman'?user.branchId:(f.branchId||''); const rows=state.sales.filter(s=>s.status==='Active'&&(!branchId||s.branchId===branchId)&&inRange(s.date,range.from,range.to)).sort(byDateDesc);
 return `<div class="page-heading"><div><h2>Sales</h2><p>Create sales invoice from branch stock. Cash, Due, Partial Payment and Bank payment are supported.</p></div><div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="open-sales-return">↩ Sales Return</button><button class="btn btn-primary" data-action="open-sale">＋ Sales Invoice</button></div></div>
 ${selectDateRangeToolbar('sales',user.role==='Salesman'?`<div class="field"><label>Branch</label><input disabled value="${esc(branchName(branchId))}"></div>`:branchFilterHtml('sales'))}
 <div class="grid grid-4" style="margin-top:16px">${kpi('Sales Amount',money(sum(rows,s=>s.total)),'tone-blue')}${kpi('Paid Amount',money(sum(rows,s=>s.paidAmount)),'tone-green')}${kpi('Invoice Due',money(sum(rows,s=>Number(s.dueAmount??Math.max(0,Number(s.total||0)-Number(s.paidAmount||0))))),'tone-purple')}${kpi('Cost of Sold Products',money(sum(rows,s=>saleCost(s))),'tone-orange')}</div>
 <div style="margin-top:16px">${section('Sales Invoice List','Confirmed invoices reduce selling branch stock and update customer due.',`<div class="table-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Date</th><th>Branch</th><th>Salesman</th><th>Customer</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th>Method</th><th class="right">Action</th></tr></thead><tbody>${rows.length?rows.map(s=>`<tr><td class="bold">${esc(s.invoiceNo)}</td><td>${dateLabel(s.date)}</td><td>${esc(branchName(s.branchId))}</td><td>${esc(getUser(s.salesmanId)?.name||'—')}</td><td>${esc(customerName(s.customerId))}</td><td class="num">${money(s.total)}</td><td class="num">${money(s.paidAmount)}</td><td class="num">${money(Number(s.dueAmount??Math.max(0,Number(s.total||0)-Number(s.paidAmount||0))))}</td><td>${esc(s.paymentMethod)}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="view-sale" data-id="${s.id}">View</button> <button class="btn btn-warning btn-sm" data-action="sales-return-from" data-id="${s.id}">Return</button></td></tr>`).join(''):`<tr><td colspan="10">${noData('No sales invoices','Transfer stock to a branch, create a customer, then create sales invoice.','<button class="btn btn-primary" data-action="open-sale">＋ Sales Invoice</button>')}</td></tr>`}</tbody></table></div>`)}</div>
 <div style="margin-top:16px">${section('Sales Return History','Returns are sent to Approval Center before stock and customer due change.',renderSalesReturnList(),'')}</div>`;
}
function salesLineHtml(branchId='',productId='',qty='',price='',disc='0'){
 const prodList=activeProducts().filter(p=>!branchId||stockPosition(branchId,p.id).qty>0||p.id===productId);
 return `<tr class="sales-line"><td><select class="sl-product" required><option value="">Select product</option>${prodList.map(p=>`<option value="${p.id}" ${p.id===productId?'selected':''} data-price="${p.defaultSellingPrice}">${esc(p.name)} (${num(stockPosition(branchId,p.id).qty)} available)</option>`).join('')}</select></td><td><input class="sl-qty" type="number" min="0.001" step="0.001" required value="${qty}" placeholder="Qty"></td><td><input class="sl-price" type="number" min="0" step="0.01" required value="${price}" placeholder="Unit price"></td><td><input class="sl-disc" type="number" min="0" step="0.01" value="${disc}" placeholder="Discount"></td><td class="num sl-total">${money((Number(qty)||0)*(Number(price)||0)-(Number(disc)||0))}</td><td><button type="button" class="btn btn-danger btn-sm" data-action="remove-line">×</button></td></tr>`;
}
function saleModal(){
 const user=currentUser(); const branches=user.role==='Salesman'?[getBranch(user.branchId)]:activeSubBranches();
 if(!branches.length||!state.products.length){toast('Create sub branch, products, transfer stock and customers before sales.','warning');return;}
 const branchId=user.role==='Salesman'?user.branchId:branches[0].id; const customers=activeCustomers(branchId);
 openModal(`<div class="modal-head"><div><h3>Create Sales Invoice</h3><p>Stock will reduce from selected branch. Only Due/Partial balance enters customer account; Cash/Bank sales do not create customer due.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="sale"><div class="modal-body"><div class="form-grid-3"><div class="field"><label>Invoice Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Branch *</label><select name="branchId" data-action="sale-branch-change" ${user.role==='Salesman'?'disabled':''}>${branches.map(b=>`<option value="${b.id}" ${b.id===branchId?'selected':''}>${esc(b.name)}</option>`).join('')}</select>${user.role==='Salesman'?`<input type="hidden" name="branchId" value="${branchId}">`:''}</div><div class="field"><label>Customer *</label><select name="customerId" id="sale-customer" required>${customerOptions('',branchId)}</select></div><div class="field"><label>Invoice Number</label><input name="invoiceNo" value="${nextRef('SI',state.sales)}"></div><div class="field"><label>Payment Type *</label><select name="paymentType" data-action="sale-payment-type"><option>Cash</option><option>Due</option><option>Partial Payment</option><option>Bank</option></select></div><div class="field"><label>Payment Method</label><select name="paymentMethod"><option>Cash</option><option>Bank</option></select></div></div><div class="line-editor" style="margin-top:16px"><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit Price</th><th>Discount</th><th class="num">Line Total</th><th></th></tr></thead><tbody id="sales-lines">${salesLineHtml(branchId)}</tbody></table></div><button type="button" class="btn btn-outline btn-sm add-line" data-action="add-sales-line">＋ Add Product Line</button><div class="grid grid-2" style="margin-top:16px"><div class="field"><label>Paid Amount</label><input type="number" min="0" step="0.01" name="paidAmount" value="0"></div><div class="field"><label>Notes</label><input name="notes"></div></div><div class="summary-panel" style="margin-top:14px"><div class="summary-row"><span>Invoice Total</span><strong id="sales-total">${money(0)}</strong></div><div class="summary-row total"><span>Customer Due from Invoice</span><strong id="sales-due">${money(0)}</strong></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Save Sales Invoice</button></div></form>`);
}
function salesReturnModal(saleId=''){
 const available=state.sales.filter(s=>s.status==='Active'&&(s.lines||[]).some((_,i)=>salesReturnLineAvailable(s,i)>0));
 if(!available.length){toast('No sales invoice has quantity available for return.','warning');return;}
 const sale=available.find(x=>x.id===saleId)||available[0];
 const rows=(sale.lines||[]).map((l,i)=>{
   const reserved=returnedQtyForInvoiceLine('salesReturns','saleId',sale.id,i,l.productId);
   const availableQty=salesReturnLineAvailable(sale,i);
   return `<tr class="sales-return-line"><td>${esc(productName(l.productId))}<input type="hidden" class="sr-product" value="${l.productId}"><input type="hidden" class="sr-price" value="${l.unitPrice}"><input type="hidden" class="sr-cost" value="${l.cost}"><input type="hidden" class="sr-line-index" value="${i}"></td><td class="num">${num(l.qty)}</td><td class="num">${num(reserved)}</td><td class="num bold">${num(availableQty)}</td><td><input type="number" class="sr-qty" min="0" max="${availableQty}" step="0.001" value="0" ${availableQty<=0?'disabled':''}></td><td><input class="sr-reason" placeholder="Return reason" ${availableQty<=0?'disabled':''}></td></tr>`;
 }).join('');
 openModal(`<div class="modal-head"><div><h3>Sales Return Request</h3><p>Available Return Qty prevents over-return. On approval, due is reduced first; any paid/cash portion is recorded as a refund.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="sales-return"><div class="modal-body"><div class="form-grid-3"><div class="field"><label>Sales Invoice *</label><select name="saleId" data-action="reload-sales-return">${available.map(x=>`<option value="${x.id}" ${x.id===sale.id?'selected':''}>${esc(x.invoiceNo)} · ${dateLabel(x.date)} · ${esc(customerName(x.customerId))}</option>`).join('')}</select></div><div class="field"><label>Return Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Refund Method (paid portion)</label><select name="refundMethod"><option>Cash</option><option>Bank</option></select></div></div><div class="line-editor" style="margin-top:16px"><table><thead><tr><th>Product</th><th class="num">Original Qty</th><th class="num">Already Requested / Returned</th><th class="num">Available Return Qty</th><th>Return Qty</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div><div class="field" style="margin-top:16px"><label>Overall Notes</label><textarea name="notes"></textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Submit Sales Return</button></div></form>`);
}
function renderSalesReturnList(){const rows=state.salesReturns.sort(byDateDesc);return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Return No</th><th>Date</th><th>Invoice</th><th>Customer</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="bold">${esc(r.returnNo)}</td><td>${dateLabel(r.date)}</td><td>${esc(r.invoiceNo)}</td><td>${esc(customerName(r.customerId))}</td><td class="num">${money(r.total)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>`:noData('No sales return requests','Sales returns will be submitted here and approved from Approval Center.');}

// Stock & Inventory
function renderStock(){
 const f=defaultFilters('stock'); const selected=f.branchId||'warehouse'; const rows=allStockRows(selected).filter(r=>r.qty!==0||selected).sort((a,b)=>productName(a.productId).localeCompare(productName(b.productId))); const user=currentUser(); const showBranch=user.role==='Salesman'?user.branchId:selected;
 const allRows=allStockRows(showBranch).filter(r=>r.qty!==0||showBranch);
 return `<div class="page-heading"><div><h2>Stock & Inventory</h2><p>Weighted-average inventory valuation. Every approved movement is saved in stock history.</p></div>${user.role!=='Salesman'?`<div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="open-stock-return">↩ Stock Return</button><button class="btn btn-secondary" data-action="open-damage-return">⚠ Damage Return</button><button class="btn btn-primary" data-action="open-transfer">＋ Stock Transfer</button></div>`:`<div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="open-stock-return">↩ Stock Return</button><button class="btn btn-warning" data-action="open-damage-return">⚠ Damage Return</button></div>`}</div>
 <div class="card toolbar">${user.role==='Salesman'?`<div class="field"><label>Branch</label><input disabled value="${esc(branchName(showBranch))}"></div>`:branchFilterHtml('stock')}<button class="btn btn-secondary" data-action="stock-view-all">All Branch Stock</button></div>
 <div class="grid grid-4" style="margin-top:16px">${kpi('Available Products',num(allRows.filter(r=>r.qty>0).length),'tone-blue')}${kpi('Total Quantity',num(sum(allRows,r=>r.qty)),'tone-teal')}${kpi('Stock Value',money(sum(allRows,r=>r.value)),'tone-purple')}${kpi('Low Stock',num(allRows.filter(r=>r.qty<=Number(getProduct(r.productId)?.lowStock||0)).length),'tone-red')}</div>
 <div style="margin-top:16px">${section(`${f.all?'All Branch Stock':branchName(showBranch)+' Stock'}`,'Available inventory and weighted average cost.',renderStockTable(f.all?allStockRows():allRows),'<button class="btn btn-outline btn-sm" data-action="export-stock">Export CSV</button>')}</div>
 <div class="grid grid-2" style="margin-top:16px">${section('Stock Transfer History','Warehouse transfer is instant. Branch-to-Branch transfer requires approval.',renderTransferHistory(),'')}${section('Return & Damage Requests','Approved Stock Return increases Warehouse. Damage Return does not.',renderReturnHistory(),'')}</div>`;
}
function renderStockTable(rows){ if(!rows.length) return noData('No stock available','Purchase into Warehouse, then transfer stock to branches.'); return `<div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Branch / Location</th><th class="num">Available Quantity</th><th class="num">Average Cost</th><th class="num">Stock Value</th><th>Status</th></tr></thead><tbody>${rows.map(r=>{const p=getProduct(r.productId);const low=r.qty<=Number(p?.lowStock||0);return `<tr><td class="bold">${esc(p?.name||'—')}</td><td>${esc(p?.sku||'—')}</td><td>${esc(state.categories.find(c=>c.id===p?.categoryId)?.name||'—')}</td><td>${esc(branchName(r.branchId))}</td><td class="num">${num(r.qty)} ${esc(p?.unit||'')}</td><td class="num">${money(r.avg)}</td><td class="num">${money(r.value)}</td><td>${statusBadge(r.qty<=0?'Out of Stock':low?'Low Stock':'In Stock')}</td></tr>`}).join('')}</tbody></table></div>`;}
function transferLineHtml(sourceId,productId='',qty=''){const ps=activeProducts().filter(p=>stockPosition(sourceId,p.id).qty>0||p.id===productId);return `<tr class="transfer-line"><td><select class="tl-product">${productOptions(productId)}</select></td><td class="available-cell">${productId?num(stockPosition(sourceId,productId).qty):'—'}</td><td><input class="tl-qty" type="number" min="0.001" step="0.001" value="${qty}" required></td><td><button type="button" class="btn btn-danger btn-sm" data-action="remove-line">×</button></td></tr>`;}
function transferModal(){
 const user=currentUser(); const sourceOptions=user.role==='Salesman'?[getBranch(user.branchId)]:activeBranches(true); const source=sourceOptions[0]; if(!state.products.length||!source){toast('Create products and branches before transferring stock.','warning');return;}
 openModal(`<div class="modal-head"><div><h3>Stock Transfer</h3><p>Warehouse to branch is instant. Sub branch to sub branch needs approval.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="transfer"><div class="modal-body"><div class="form-grid-3"><div class="field"><label>Transfer Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Source Branch *</label><select name="sourceBranchId" data-action="transfer-source-change" ${user.role==='Salesman'?'disabled':''}>${sourceOptions.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>${user.role==='Salesman'?`<input type="hidden" name="sourceBranchId" value="${source.id}">`:''}</div><div class="field"><label>Destination Branch *</label><select name="destinationBranchId" required>${activeSubBranches().filter(b=>b.id!==source.id).map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div></div><div class="line-editor" style="margin-top:16px"><table><thead><tr><th>Product</th><th>Available Qty</th><th>Transfer Qty</th><th></th></tr></thead><tbody id="transfer-lines">${transferLineHtml(source.id)}</tbody></table></div><button type="button" class="btn btn-outline btn-sm add-line" data-action="add-transfer-line">＋ Add Product</button><div class="field" style="margin-top:16px"><label>Notes / Reason</label><textarea name="notes"></textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Create Transfer</button></div></form>`);
}
function stockReturnModal(selectedBranchId=''){
 const user=currentUser(); const branches=user.role==='Salesman'?[getBranch(user.branchId)]:activeSubBranches(); const b=branches.find(x=>x.id===selectedBranchId)||branches[0]; if(!b){toast('Create a sub branch first.','warning');return;}
 const firstProduct=activeProducts()[0]; if(!firstProduct){toast('Create product first.','warning');return;} const available=availableBranchReturnQty(b.id,firstProduct.id);
 openModal(`<div class="modal-head"><div><h3>Stock Return to Warehouse</h3><p>Available branch stock is shown before submitting. Pending stock/damage returns are reserved automatically.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="stock-return"><div class="modal-body"><div class="form-grid"><div class="field"><label>Return Date</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Source Branch</label><select name="branchId" data-action="stock-return-branch" ${user.role==='Salesman'?'disabled':''}>${branches.map(x=>`<option value="${x.id}" ${x.id===b.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>${user.role==='Salesman'?`<input type="hidden" name="branchId" value="${b.id}">`:''}</div><div class="field"><label>Product</label><select name="productId" data-action="stock-return-product-change" required>${branchReturnProductOptions(b.id,firstProduct.id)}</select></div><div class="field"><label>Available Stock</label><input id="branch-return-available" disabled value="${num(available)} ${esc(firstProduct.unit||'')}"></div><div class="field"><label>Quantity</label><input type="number" name="qty" id="branch-return-qty" min="0.001" max="${available}" step="0.001" required></div><div class="field form-full"><label>Reason</label><textarea name="reason" required></textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Submit Stock Return</button></div></form>`);
}
function damageReturnModal(selectedBranchId=''){
 const user=currentUser(); const branches=user.role==='Salesman'?[getBranch(user.branchId)]:activeSubBranches(); const b=branches.find(x=>x.id===selectedBranchId)||branches[0]; if(!b){toast('Create a sub branch first.','warning');return;}
 const firstProduct=activeProducts()[0]; if(!firstProduct){toast('Create product first.','warning');return;} const available=availableBranchReturnQty(b.id,firstProduct.id);
 openModal(`<div class="modal-head"><div><h3>Damage Return Request</h3><p>Available branch stock is shown before submitting. Pending stock/damage requests are reserved automatically.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="damage-return"><div class="modal-body"><div class="form-grid"><div class="field"><label>Date</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Branch</label><select name="branchId" data-action="damage-return-branch" ${user.role==='Salesman'?'disabled':''}>${branches.map(x=>`<option value="${x.id}" ${x.id===b.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>${user.role==='Salesman'?`<input type="hidden" name="branchId" value="${b.id}">`:''}</div><div class="field"><label>Product</label><select name="productId" data-action="damage-return-product-change" required>${branchReturnProductOptions(b.id,firstProduct.id)}</select></div><div class="field"><label>Available Stock</label><input id="branch-return-available" disabled value="${num(available)} ${esc(firstProduct.unit||'')}"></div><div class="field"><label>Damage Quantity</label><input type="number" name="qty" id="branch-return-qty" min="0.001" max="${available}" step="0.001" required></div><div class="field form-full"><label>Damage Reason</label><textarea name="reason" required></textarea></div><div class="field form-full"><label>Photo Reference / Attachment Note (optional)</label><input name="attachment" placeholder="e.g. damage-photo-001.jpg"></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-warning">Submit Damage Request</button></div></form>`);
}
function renderTransferHistory(){ const rows=state.transfers.sort(byDateDesc).slice(0,10);return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>No</th><th>Date</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>${rows.map(t=>`<tr><td class="bold">${esc(t.transferNo)}</td><td>${dateLabel(t.date)}</td><td>${esc(branchName(t.sourceBranchId))}</td><td>${esc(branchName(t.destinationBranchId))}</td><td>${statusBadge(t.status)}</td></tr>`).join('')}</tbody></table></div>`:noData('No transfers','Stock movements will appear here.');}
function renderReturnHistory(){const rows=[...state.stockReturns.map(x=>({...x,type:'Stock Return'})),...state.damageReturns.map(x=>({...x,type:'Damage Return'}))].sort(byDateDesc).slice(0,10);return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Type</th><th>Date</th><th>Branch</th><th>Product</th><th class="num">Qty</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${statusBadge(r.type)}</td><td>${dateLabel(r.date)}</td><td>${esc(branchName(r.branchId))}</td><td>${esc(productName(r.productId))}</td><td class="num">${num(r.qty)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>`:noData('No return requests','Stock return and damage return requests will appear here.');}

// Payments
function renderPayments(){
 const f=defaultFilters('payments'); const range=currentRange('payments'); const user=currentUser(); const branchId=user.role==='Salesman'?user.branchId:(f.branchId||''); const pays=state.customerPayments.filter(p=>p.status==='Active'&&(!branchId||p.branchId===branchId)&&inRange(p.date,range.from,range.to)).sort(byDateDesc); const returnRows=state.paymentReturns.filter(p=>(!branchId||p.branchId===branchId)&&inRange(p.date,range.from,range.to)).sort(byDateDesc);
 return `<div class="page-heading"><div><h2>Payments</h2><p>Customer collection reduces due. Payment return increases customer due again after approval.</p></div><div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="open-payment-return">↩ Payment Return</button><button class="btn btn-primary" data-action="open-customer-payment">＋ Credit Payment</button></div></div>
 ${selectDateRangeToolbar('payments',user.role==='Salesman'?`<div class="field"><label>Branch</label><input disabled value="${esc(branchName(branchId))}"></div>`:branchFilterHtml('payments'))}
 <div class="grid grid-4" style="margin-top:16px">${kpi('Customer Collection',money(sum(pays,p=>p.amount)),'tone-green')}${kpi('Cash Collection',money(sum(pays.filter(p=>p.method==='Cash'),p=>p.amount)),'tone-blue')}${kpi('Bank Collection',money(sum(pays.filter(p=>p.method==='Bank'),p=>p.amount)),'tone-teal')}${kpi('Payment Returns',money(sum(returnRows.filter(p=>p.status==='Approved'),p=>p.amount)),'tone-red')}</div>
 <div style="margin-top:16px">${section('Customer Payment List','Payment reduces selected customer due and creates a ledger entry.',`<div class="table-wrap"><table class="table"><thead><tr><th>Payment No</th><th>Date</th><th>Customer</th><th>Branch</th><th>Method</th><th class="num">Amount</th><th class="right">Actions</th></tr></thead><tbody>${pays.length?pays.map(p=>`<tr><td class="bold">${esc(p.paymentNo)}</td><td>${dateLabel(p.date)}</td><td>${esc(customerName(p.customerId))}</td><td>${esc(branchName(p.branchId))}</td><td>${esc(p.method)}</td><td class="num">${money(p.amount)}</td><td class="right"><button class="btn btn-warning btn-sm" data-action="payment-return-from" data-id="${p.id}">Return</button></td></tr>`).join(''):`<tr><td colspan="7">${noData('No collection payment','Customer credit payments will appear here.','<button class="btn btn-primary" data-action="open-customer-payment">＋ Credit Payment</button>')}</td></tr>`}</tbody></table></div>`)}</div>
 <div style="margin-top:16px">${section('Payment Return History','Approved payment return adds amount back to customer due.',renderPaymentReturnHistory(),'')}</div>`;
}
function customerPaymentModal(id=''){
 const customer=id?getCustomer(id):null; const user=currentUser(); const branch=user.role==='Salesman'?user.branchId:(customer?.branchId||''); const customers=customer?[customer]:activeCustomers(branch);
 if(!customers.length){toast('Create customer first.','warning');return;}
 openModal(`<div class="modal-head"><div><h3>Customer Credit Payment</h3><p>Customer payment reduces due and is saved in ledger and cash/bank flow.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="customer-payment"><div class="modal-body"><div class="form-grid"><div class="field"><label>Payment Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Branch *</label><select name="branchId" data-action="payment-branch-change" ${user.role==='Salesman'?'disabled':''}>${user.role==='Salesman'?`<option value="${branch}">${esc(branchName(branch))}</option>`:branchOptions(branch,false,false)}</select>${user.role==='Salesman'?`<input type="hidden" name="branchId" value="${branch}">`:''}</div><div class="field"><label>Customer *</label><select name="customerId" data-action="payment-customer-change">${customers.map(c=>`<option value="${c.id}">${esc(customerName(c.id))} · Due ${money(customerDue(c.id))}</option>`).join('')}</select></div><div class="field"><label>Payment Amount *</label><input type="number" name="amount" min="0.01" step="0.01" required></div><div class="field"><label>Payment Method</label><select name="method"><option>Cash</option><option>Bank</option></select></div><div class="field"><label>Receipt Number</label><input name="paymentNo" value="${nextRef('CP',state.customerPayments)}"></div><div class="field form-full"><label>Notes</label><textarea name="notes"></textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Save Customer Payment</button></div></form>`);
}
function paymentReturnModal(paymentId=''){
 const avail=state.customerPayments.filter(p=>p.status==='Active'&&paymentReturnAvailable(p.id)>0);
 if(!avail.length){toast('No customer payment amount is available for return.','warning');return;}
 const p=avail.find(x=>x.id===paymentId)||avail[0]; const allowed=paymentReturnAvailable(p.id);
 openModal(`<div class="modal-head"><div><h3>Payment Return Request</h3><p>Only the unreturned portion of the original payment can be returned.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="payment-return"><div class="modal-body"><div class="form-grid"><div class="field"><label>Original Payment *</label><select name="paymentId" data-action="reload-payment-return">${avail.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.paymentNo)} · ${esc(customerName(x.customerId))} · Available ${money(paymentReturnAvailable(x.id))}</option>`).join('')}</select></div><div class="field"><label>Return Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Available Return Amount</label><input disabled value="${money(allowed)}"></div><div class="field"><label>Return Amount *</label><input name="amount" type="number" min="0.01" max="${allowed}" step="0.01" value="${allowed}" required></div><div class="field"><label>Original Method</label><input disabled value="${esc(p.method)}"></div><div class="field form-full"><label>Return Reason *</label><textarea name="reason" required></textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Submit Payment Return</button></div></form>`);
}
function renderPaymentReturnHistory(){const rows=state.paymentReturns.sort(byDateDesc);return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Return No</th><th>Date</th><th>Customer</th><th class="num">Amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="bold">${esc(r.returnNo)}</td><td>${dateLabel(r.date)}</td><td>${esc(customerName(r.customerId))}</td><td class="num">${money(r.amount)}</td><td>${statusBadge(r.status)}</td><td>${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div>`:noData('No payment returns','Payment return requests will show here.');}

// Expenses
function renderExpenses(){
 const f=defaultFilters('expenses'); const range=currentRange('expenses'); const user=currentUser(); const branchId=user.role==='Salesman'?user.branchId:(f.branchId||''); const rows=state.expenses.filter(e=>e.status==='Active'&&(!branchId||e.branchId===branchId)&&inRange(e.date,range.from,range.to)).sort(byDateDesc);
 const branchMap={};rows.forEach(e=>{branchMap[e.branchId]=branchMap[e.branchId]||{amount:0,count:0,last:e.date};branchMap[e.branchId].amount+=e.amount;branchMap[e.branchId].count++;if(e.date>branchMap[e.branchId].last)branchMap[e.branchId].last=e.date;});
 return `<div class="page-heading"><div><h2>Expenses</h2><p>Warehouse and branch expenses with cash/bank effect and branch → date → details drilldown.</p></div><button class="btn btn-primary" data-action="open-expense">＋ Add Expense</button></div>
 ${selectDateRangeToolbar('expenses',user.role==='Salesman'?`<div class="field"><label>Branch</label><input disabled value="${esc(branchName(branchId))}"></div>`:branchFilterHtml('expenses'))}
 <div class="grid grid-4" style="margin-top:16px">${kpi('Total Expenses',money(sum(rows,e=>e.amount)),'tone-orange')}${kpi('Cash Expenses',money(sum(rows.filter(e=>e.paymentMethod==='Cash'),e=>e.amount)),'tone-red')}${kpi('Bank Expenses',money(sum(rows.filter(e=>e.paymentMethod==='Bank'),e=>e.amount)),'tone-blue')}${kpi('Expense Entries',num(rows.length),'tone-purple')}</div>
 <div style="margin-top:16px">${section('All Branch Expense Summary','Click View to see date-wise summary for the branch.',`<div class="table-wrap"><table class="table"><thead><tr><th>Branch Name</th><th class="num">Total Expense Amount</th><th class="num">Expense Entries</th><th>Last Expense Date</th><th class="right">View Details</th></tr></thead><tbody>${Object.keys(branchMap).length?Object.entries(branchMap).map(([id,x])=>`<tr><td class="bold">${esc(branchName(id))}</td><td class="num">${money(x.amount)}</td><td class="num">${x.count}</td><td>${dateLabel(x.last)}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="expense-branch-details" data-id="${id}">View</button></td></tr>`).join(''):`<tr><td colspan="5">${noData('No expenses','Add an expense to see branch expense summary.','<button class="btn btn-primary" data-action="open-expense">＋ Add Expense</button>')}</td></tr>`}</tbody></table></div>`)}</div>
 <div style="margin-top:16px">${section('Expense History','Current filtered expense records.',renderExpenseDetailTable(rows),'')}</div>`;
}
function expenseModal(){
 const user=currentUser(); const branches=user.role==='Salesman'?[getBranch(user.branchId)]:activeBranches(true); const b=branches[0];
 openModal(`<div class="modal-head"><div><h3>Add Expense</h3><p>Cash expense reduces company cash; Bank expense reduces bank balance. Expenses are auditable and cannot be deleted.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="expense"><div class="modal-body"><div class="form-grid"><div class="field"><label>Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Branch *</label><select name="branchId" ${user.role==='Salesman'?'disabled':''}>${branches.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>${user.role==='Salesman'?`<input type="hidden" name="branchId" value="${b.id}">`:''}</div><div class="field"><label>Expense Category *</label><select name="category"><option>Salary</option><option>Rent</option><option>Transport</option><option>Fuel</option><option>Vehicle Expense</option><option>Maintenance</option><option>Electricity</option><option>Internet</option><option>Office Expense</option><option>Miscellaneous</option></select></div><div class="field"><label>Payment Method *</label><select name="paymentMethod"><option>Cash</option><option>Bank</option><option>Others</option></select></div><div class="field form-full"><label>Expense Name / Description *</label><input name="description" required placeholder="e.g. delivery vehicle repair"></div><div class="field"><label>Amount *</label><input type="number" min="0.01" step="0.01" name="amount" required></div><div class="field"><label>Receipt / Attachment Note</label><input name="attachment" placeholder="optional receipt file name"></div><div class="field form-full"><label>Notes</label><textarea name="notes"></textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Save Expense</button></div></form>`);
}
function renderExpenseDetailTable(rows){return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Branch</th><th>Category</th><th>Description</th><th>Method</th><th class="num">Amount</th><th>Created By</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${dateLabel(e.date)}</td><td>${esc(branchName(e.branchId))}</td><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td>${esc(e.paymentMethod)}</td><td class="num">${money(e.amount)}</td><td>${esc(getUser(e.createdBy)?.name||'—')}</td></tr>`).join('')}</tbody></table></div>`:noData('No expense entries','Expense records will show here.');}
function expenseBranchModal(branchId){ const dates=unique(state.expenses.filter(e=>e.branchId===branchId&&e.status==='Active').map(e=>e.date)).sort().reverse(); openModal(`<div class="modal-head"><div><h3>Expense Summary — ${esc(branchName(branchId))}</h3><p>Click a date to see all expense details for that branch.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body">${dates.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th class="num">Total Expense</th><th class="num">Entries</th><th class="right">Action</th></tr></thead><tbody>${dates.map(d=>{const rs=state.expenses.filter(e=>e.branchId===branchId&&e.status==='Active'&&e.date===d);return `<tr><td>${dateLabel(d)}</td><td class="num">${money(sum(rs,e=>e.amount))}</td><td class="num">${rs.length}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="expense-date-details" data-branch="${branchId}" data-date="${d}">View Details</button></td></tr>`}).join('')}</tbody></table></div>`:noData('No expense records','No expense records for this branch.')}</div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button></div>`); }
function expenseDateModal(branchId,date){ const rows=state.expenses.filter(e=>e.branchId===branchId&&e.status==='Active'&&e.date===date); openModal(`<div class="modal-head"><div><h3>Expense Details — ${esc(branchName(branchId))}</h3><p>${dateLabel(date)} · Total ${money(sum(rows,e=>e.amount))}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body">${renderExpenseDetailTable(rows)}</div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" data-action="print-modal">Print</button></div>`); }

// Transfers and Returns workspaces
function renderTransfers(){
 const user=currentUser(),branchUser=normalizeRole(user.role)==='Salesman',rows=state.transfers.filter(t=>!branchUser||t.sourceBranchId===user.branchId||t.destinationBranchId===user.branchId).sort(byDateDesc);
 return `<div class="page-heading"><div><h2>Transfers</h2><p>Track every warehouse-to-branch and branch-to-branch stock movement.</p></div>${can('transfers')?`<button class="btn btn-primary" data-action="open-transfer">＋ New Stock Transfer</button>`:''}</div><div class="grid grid-3">${kpi('Pending Transfers',num(rows.filter(x=>x.status==='Pending').length),'tone-amber')}${kpi('Approved Transfers',num(rows.filter(x=>x.status==='Approved').length),'tone-green')}${kpi('Transfers This Month',num(rows.filter(x=>x.date>=startOfMonth()).length),'tone-blue')}</div><div style="margin-top:16px">${section('Transfer History','Sent, pending and approved stock movements.',rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Transfer No.</th><th>Date</th><th>From</th><th>To</th><th>Items</th><th>Status</th></tr></thead><tbody>${rows.map(t=>`<tr><td class="bold">${esc(t.transferNo)}</td><td>${dateLabel(t.date)}</td><td>${esc(branchName(t.sourceBranchId))}</td><td>${esc(branchName(t.destinationBranchId))}</td><td>${num(sum(t.lines||[],l=>l.qty))} units</td><td>${statusBadge(t.status)}</td></tr>`).join('')}</tbody></table></div>`:noData('No transfers yet','Create a transfer when stock leaves the warehouse or moves between branches.'))}</div>`;
}
function returnRowsForUser(){const u=currentUser();let rows=[...state.salesReturns.map(x=>({...x,type:'Sales Return'})),...state.stockReturns.map(x=>({...x,type:'Stock Return'})),...state.damageReturns.map(x=>({...x,type:'Damage Return'}))];if(normalizeRole(u.role)==='Salesman')rows=rows.filter(x=>x.branchId===u.branchId);return rows.sort(byDateDesc);}
function renderReturns(){
 const rows=returnRowsForUser();return `<div class="page-heading"><div><h2>Return & Damage</h2><p>Available stock and original invoice quantities are checked before a request can be submitted.</p></div><div class="page-actions">${can('returns')?`<button class="btn btn-secondary" data-action="open-stock-return">↩ Stock Return</button><button class="btn btn-warning" data-action="open-damage-return">⚠ Damage Return</button>`:''}</div></div><div class="grid grid-3">${kpi('Pending Requests',num(rows.filter(x=>x.status==='Pending').length),'tone-amber')}${kpi('Approved Returns',num(rows.filter(x=>x.status==='Approved').length),'tone-green')}${kpi('Damage Requests',num(rows.filter(x=>x.type==='Damage Return').length),'tone-red')}</div><div style="margin-top:16px">${section('Return & Damage History','Main Branch approval is required before stock and due adjustments are posted.',rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Type</th><th>Reference</th><th>Date</th><th>Branch</th><th>Product / Details</th><th class="num">Qty / Amount</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${statusBadge(r.type)}</td><td class="bold">${esc(r.returnNo||'—')}</td><td>${dateLabel(r.date)}</td><td>${esc(branchName(r.branchId))}</td><td>${esc(r.productId?productName(r.productId):(r.lines||[]).map(l=>productName(l.productId)).join(', ')||'—')}</td><td class="num">${r.qty?num(r.qty):money(r.total||0)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>`:noData('No return or damage requests','Return and damage records will appear here.'))}</div>`;
}

// Settlement Report
function settlementAvailableBranches(){ return activeSubBranches(); }
function expectedSettlementStart(branchId){
  const locked=state.settlements.filter(x=>x.branchId===branchId&&x.status==='Locked').sort((a,b)=>String(a.to).localeCompare(String(b.to)));
  return locked.length?addDays(locked[locked.length-1].to,1):'';
}
function settlementSnapshot(settlement){ return settlement?.snapshot || computeSettlement(settlement.branchId,settlement.from,settlement.to); }
function computeSettlement(branchId,from,to){
  const prev=previousDate(from);
  const sales=state.sales.filter(x=>x.status==='Active'&&x.branchId===branchId&&inRange(x.date,from,to));
  const collections=state.customerPayments.filter(x=>x.status==='Active'&&x.branchId===branchId&&inRange(x.date,from,to));
  const expenses=state.expenses.filter(x=>x.status==='Active'&&x.branchId===branchId&&inRange(x.date,from,to));
  const salesReturns=state.salesReturns.filter(x=>x.status==='Approved'&&x.branchId===branchId&&inRange(x.date,from,to));
  const stockReturns=state.stockReturns.filter(x=>x.status==='Approved'&&x.branchId===branchId&&inRange(x.date,from,to));
  const damageReturns=state.damageReturns.filter(x=>x.status==='Approved'&&x.branchId===branchId&&inRange(x.date,from,to));
  const transfers=state.transfers.filter(x=>x.status==='Approved'&&x.destinationBranchId===branchId&&inRange(x.date,from,to));
  const purchases=state.purchases.filter(x=>x.status==='Active'&&purchaseBranchId(x)===branchId&&inRange(x.date,from,to));
  const customerIds=unique([...sales.map(x=>x.customerId),...collections.map(x=>x.customerId),...salesReturns.map(x=>x.customerId)]).filter(Boolean);
  const customerRows=customerIds.map(customerId=>{
    const c=getCustomer(customerId); const ss=sales.filter(x=>x.customerId===customerId); const cc=collections.filter(x=>x.customerId===customerId); const rr=salesReturns.filter(x=>x.customerId===customerId);
    return {customerId,name:customerName(customerId),shopName:c?.shopName||'',openingDue:customerDueAt(customerId,prev),sales:sum(ss,x=>x.total),cashSales:sum(ss.filter(x=>x.paymentMethod==='Cash'),x=>x.paidAmount),bankSales:sum(ss.filter(x=>x.paymentMethod==='Bank'),x=>x.paidAmount),dueSales:sum(ss,x=>Number(x.dueAmount||0)),collection:sum(cc,x=>x.amount),cashCollection:sum(cc.filter(x=>x.method==='Cash'),x=>x.amount),bankCollection:sum(cc.filter(x=>x.method==='Bank'),x=>x.amount),returns:sum(rr,x=>x.total),returnDueReduction:sum(rr,salesReturnDueEffect),closingDue:customerDueAt(customerId,to)};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const productIds=unique([...state.products.map(x=>x.id),...sales.flatMap(x=>(x.lines||[]).map(l=>l.productId)),...transfers.flatMap(x=>(x.lines||[]).map(l=>l.productId)),...purchases.flatMap(x=>(x.lines||[]).map(l=>l.productId)),...salesReturns.flatMap(x=>(x.lines||[]).map(l=>l.productId)),...stockReturns.map(x=>x.productId),...damageReturns.map(x=>x.productId)]).filter(Boolean);
  const stockRows=productIds.map(productId=>{
    const opening=stockPositionAt(branchId,productId,prev); const closing=stockPositionAt(branchId,productId,to);
    const transferQty=sum(transfers.flatMap(x=>(x.lines||[]).filter(l=>l.productId===productId)),l=>l.qty);
    const purchaseQty=sum(purchases.flatMap(x=>(x.lines||[]).filter(l=>l.productId===productId)),l=>l.qty);
    const soldQty=sum(sales.flatMap(x=>(x.lines||[]).filter(l=>l.productId===productId)),l=>l.qty);
    const salesReturnQty=sum(salesReturns.flatMap(x=>(x.lines||[]).filter(l=>l.productId===productId)),l=>l.qty);
    const stockReturnQty=sum(stockReturns.filter(x=>x.productId===productId),x=>x.qty);
    const damageQty=sum(damageReturns.filter(x=>x.productId===productId),x=>x.qty);
    return {productId,name:productName(productId),unit:getProduct(productId)?.unit||'',openingQty:opening.qty,mainTransferQty:transferQty,branchPurchaseQty:purchaseQty,soldQty,salesReturnQty,stockReturnQty,damageQty,closingQty:closing.qty,closingValue:closing.value};
  }).filter(r=>Math.abs(r.openingQty)+Math.abs(r.mainTransferQty)+Math.abs(r.branchPurchaseQty)+Math.abs(r.soldQty)+Math.abs(r.salesReturnQty)+Math.abs(r.stockReturnQty)+Math.abs(r.damageQty)+Math.abs(r.closingQty)>0.000001);
  const cashTx=state.moneyTransactions.filter(x=>x.status==='Active'&&x.ledger==='cash'&&x.branchId===branchId&&inRange(x.date,from,to));
  const cashSales=sum(sales.filter(x=>x.paymentMethod==='Cash'),x=>x.paidAmount);
  const bankSales=sum(sales.filter(x=>x.paymentMethod==='Bank'),x=>x.paidAmount);
  const dueSales=sum(sales,x=>Number(x.dueAmount||0));
  const cashCollection=sum(collections.filter(x=>x.method==='Cash'),x=>x.amount);
  const bankCollection=sum(collections.filter(x=>x.method==='Bank'),x=>x.amount);
  const cashExpenses=sum(expenses.filter(x=>x.paymentMethod==='Cash'),x=>x.amount);
  const bankExpenses=sum(expenses.filter(x=>x.paymentMethod==='Bank'),x=>x.amount);
  const cashPurchasePayment=sum(purchases.filter(x=>x.paymentMethod==='Cash'),x=>x.paidAmount);
  const salesRefundCash=sum(salesReturns.filter(x=>x.refundMethod!=='Bank'),x=>x.refundAmount||0);
  const cashIn=sum(cashTx.filter(x=>x.direction==='In'),x=>x.amount); const cashOut=sum(cashTx.filter(x=>x.direction==='Out'),x=>x.amount);
  const knownIn=cashSales+cashCollection; const knownOut=cashExpenses+cashPurchasePayment+salesRefundCash;
  const summary={
    totalSales:sum(sales,x=>x.total),cashSales,bankSales,dueSales,initialReceipt:sum(sales,x=>x.paidAmount),
    customerCollection:sum(collections,x=>x.amount),cashCollection,bankCollection,
    salesReturn:sum(salesReturns,x=>x.total),netSales:sum(sales,x=>x.total)-sum(salesReturns,x=>x.total),
    totalExpenses:sum(expenses,x=>x.amount),cashExpenses,bankExpenses,
    mainTransferQty:sum(transfers.flatMap(x=>x.lines||[]),l=>l.qty),mainTransferValue:sum(state.stockMovements.filter(m=>m.status==='Active'&&m.branchId===branchId&&m.type==='Transfer In'&&inRange(m.date,from,to)),m=>m.qty*m.unitCost),
    branchPurchaseAmount:sum(purchases,x=>x.total),branchPurchaseQty:sum(purchases.flatMap(x=>x.lines||[]),l=>l.qty),
    openingCash:branchLedgerBalanceAt('cash',branchId,prev),cashIn,cashOut,otherCashIn:Math.max(0,cashIn-knownIn),otherCashOut:Math.max(0,cashOut-knownOut),closingCash:branchLedgerBalanceAt('cash',branchId,to),
    openingStockValue:sum(stockRows,x=>stockPositionAt(branchId,x.productId,prev).value),closingStockValue:sum(stockRows,x=>x.closingValue),
    totalCustomerDue:sum(customerRows,x=>x.closingDue),transactionCount:sales.length+collections.length+expenses.length+transfers.length+purchases.length
  };
  return {branchId,branchName:branchName(branchId),from,to,generatedAt:nowStamp(),summary,customerRows,expenseRows:expenses.map(e=>({date:e.date,category:e.category,description:e.description,method:e.paymentMethod,amount:e.amount,createdBy:getUser(e.createdBy)?.name||'—'})).sort(byDateDesc),transferRows:transfers.map(t=>({transferNo:t.transferNo,date:t.date,source:branchName(t.sourceBranchId),qty:sum(t.lines||[],l=>l.qty),value:sum(state.stockMovements.filter(m=>m.status==='Active'&&m.refId===t.id&&m.branchId===branchId),m=>m.qty*m.unitCost)})).sort(byDateDesc),purchaseRows:purchases.map(p=>({invoiceNo:p.invoiceNo,date:p.date,vendor:vendorName(p.vendorId),amount:p.total,paid:p.paidAmount,due:p.total-p.paidAmount,method:p.paymentMethod})).sort(byDateDesc),stockRows};
}
function settlementListHtml(rows){
  return rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Settlement No.</th><th>Branch</th><th>Period</th><th>Status</th><th class="num">Sales</th><th class="num">Closing Cash</th><th>Locked / Created</th><th class="right">Action</th></tr></thead><tbody>${rows.map(x=>{const d=settlementSnapshot(x),s=d.summary||{}; const canReopen=isSettlementAdmin()&&x.status==='Locked'; return `<tr><td class="bold">${esc(x.settlementNo||x.id)}</td><td>${esc(branchName(x.branchId))}</td><td>${dateLabel(x.from)} – ${dateLabel(x.to)}</td><td>${settlementStatusBadge(x.status)}</td><td class="num">${money(s.totalSales)}</td><td class="num">${money(s.closingCash)}</td><td>${x.lockedAt?dateTimeLabel(x.lockedAt):dateTimeLabel(x.createdAt)}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="view-settlement" data-id="${x.id}">View</button>${x.status==='Draft'&&isSettlementAdmin()?` <button class="btn btn-primary btn-sm" data-action="view-settlement" data-id="${x.id}">Preview</button>`:''}${canReopen?` <button class="btn btn-warning btn-sm" data-action="reopen-settlement" data-id="${x.id}">Reopen</button>`:''}</td></tr>`;}).join('')}</tbody></table></div>`:noData('No settlement report yet','Choose a branch and date range to generate the first settlement preview.',isSettlementAdmin()?'<button class="btn btn-primary" data-action="open-settlement">＋ Generate Settlement</button>':'');
}
function renderReports(){
  const user=currentUser(); const rows=settlementHistoryForUser();
  if(user.role==='Salesman') return `<div class="page-heading"><div><h2>Settlement History</h2><p>Confirmed settlement reports for your assigned branch are read-only.</p></div></div><div class="grid grid-4">${kpi('Locked Settlements',num(rows.filter(x=>x.status==='Locked').length),'tone-blue')}${kpi('Branch',esc(branchName(user.branchId)),'tone-teal')}${kpi('Latest Closing Cash',money((rows.find(x=>x.status==='Locked')?settlementSnapshot(rows.find(x=>x.status==='Locked')).summary.closingCash:0)),'tone-green')}${kpi('Latest Sales',money((rows.find(x=>x.status==='Locked')?settlementSnapshot(rows.find(x=>x.status==='Locked')).summary.totalSales:0)),'tone-purple')}</div><div style="margin-top:16px">${section('Your Branch Settlement Reports','Open a locked report to view sales, customer collection, expenses, stock and cash details.',settlementListHtml(rows.filter(x=>x.status==='Locked'||x.status==='Returned')),'')}</div>`;
  const draftCount=rows.filter(x=>x.status==='Draft').length, lockedCount=rows.filter(x=>x.status==='Locked').length;
  return `<div class="page-heading"><div><h2>Settlement Report</h2><p>Generate a branch period preview, check every transaction, then confirm and lock the period.</p></div><div style="display:flex;gap:10px"><button class="btn btn-secondary" data-action="export-settlement-register">⇩ Export Register</button>${isSettlementAdmin()?'<button class="btn btn-primary" data-action="open-settlement">＋ Generate Settlement</button>':''}</div></div>
  <div class="grid grid-4">${kpi('Locked Settlements',num(lockedCount),'tone-blue','Periods are closed')}${kpi('Draft Previews',num(draftCount),'tone-amber','Review before lock')}${kpi('Active Branches',num(activeSubBranches().length),'tone-teal')}${kpi('Total Closing Cash',money(sum(rows.filter(x=>x.status==='Locked'),x=>settlementSnapshot(x).summary.closingCash)),'tone-green','All locked reports')}</div>
  <div style="margin-top:16px">${section('Settlement Register','Locked reports close the branch date range. Returned reports remain as audit history.',settlementListHtml(rows),'')}</div>`;
}
function settlementModal(){
  if(!isSettlementAdmin()) throw new Error('Only Owner/Admin can generate settlement reports.');
  const branches=settlementAvailableBranches(); if(!branches.length){toast('Create at least one active sub branch first.','warning');return;}
  const b=branches[0], from=expectedSettlementStart(b.id)||isoToday();
  openModal(`<div class="modal-head"><div><h3>Generate Branch Settlement</h3><p>Choose one branch and a date range. The report will open as a Draft Preview before it is locked.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="settlement-create"><div class="modal-body"><div class="form-grid"><div class="field"><label>Branch *</label><select name="branchId" data-action="settlement-branch-change">${branches.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><span class="field-help">Each branch has its own settlement sequence.</span></div><div class="field"><label>Expected Next Start</label><input id="settlement-next-start" disabled value="${from?dateLabel(from):'First settlement'}"></div><div class="field"><label>From Date *</label><input type="date" name="from" value="${from}" required></div><div class="field"><label>To Date *</label><input type="date" name="to" value="${isoToday()}" required></div><div class="field form-full"><label>Internal Note</label><textarea name="notes" placeholder="Optional note for this settlement period"></textarea></div></div><div class="notification" style="margin-top:16px">After you review the preview, only Owner/Admin can press <strong>Confirm & Lock</strong>. A locked period blocks new sales, collections, cash sales, expenses, branch purchases, transfers, returns and damage entries for that branch/date range.</div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Generate Draft Preview</button></div></form>`);
}
function createSettlement(data){
  if(!isSettlementAdmin())throw new Error('Only Owner/Admin can generate a settlement.');
  if(!data.branchId||data.branchId==='warehouse')throw new Error('Select a sub branch.');
  if(!data.from||!data.to||data.from>data.to)throw new Error('Enter a valid settlement date range.');
  const blocked=state.settlements.find(x=>x.branchId===data.branchId&&['Draft','Locked'].includes(x.status)&&!(data.to<x.from||data.from>x.to));
  if(blocked)throw new Error(`This period overlaps ${blocked.settlementNo||'an existing settlement'} (${dateLabel(blocked.from)} to ${dateLabel(blocked.to)}).`);
  const prior=state.settlements.filter(x=>x.branchId===data.branchId&&x.status==='Locked').sort((a,b)=>String(a.to).localeCompare(String(b.to))).pop();
  if(prior){const expected=addDays(prior.to,1); if(data.from!==expected)throw new Error(`The next settlement for ${branchName(data.branchId)} must start on ${dateLabel(expected)} after ${prior.settlementNo} closes.`);}
  const version=state.settlements.filter(x=>x.branchId===data.branchId&&x.from===data.from&&x.to===data.to).length+1;
  const settlement={id:uid('set'),settlementNo:nextRef('SET',state.settlements),branchId:data.branchId,from:data.from,to:data.to,version,status:'Draft',notes:data.notes||'',createdBy:currentUser().id,createdAt:nowStamp()};
  state.settlements.push(settlement); log('Settlement Draft Created',`${settlement.settlementNo} generated for ${branchName(settlement.branchId)} · ${dateLabel(settlement.from)} to ${dateLabel(settlement.to)}`,settlement.settlementNo,settlement.branchId); save(); settlementPreviewModal(settlement.id); toast('Settlement draft preview created. Review every section before locking.');
}
function settlementPreviewModal(id){
  const settlement=state.settlements.find(x=>x.id===id); if(!settlement)return;
  const snap=settlementSnapshot(settlement),s=snap.summary||{}; const locked=settlement.status==='Locked'; const canLock=isSettlementAdmin()&&settlement.status==='Draft';
  const customerTable=snap.customerRows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th class="num">Opening Due</th><th class="num">Total Sales</th><th class="num">Due Sales</th><th class="num">Collection</th><th class="num">Sales Return</th><th class="num">Closing Due</th></tr></thead><tbody>${snap.customerRows.map(r=>`<tr><td class="bold">${esc(r.name)}${r.shopName?`<div class="muted">${esc(r.shopName)}</div>`:''}</td><td class="num">${money(r.openingDue)}</td><td class="num">${money(r.sales)}</td><td class="num">${money(r.dueSales)}</td><td class="num">${money(r.collection)}</td><td class="num">${money(r.returns)}</td><td class="num bold">${money(r.closingDue)}</td></tr>`).join('')}<tr class="settlement-total-row"><td>Grand Total</td><td class="num">${money(sum(snap.customerRows,r=>r.openingDue))}</td><td class="num">${money(sum(snap.customerRows,r=>r.sales))}</td><td class="num">${money(sum(snap.customerRows,r=>r.dueSales))}</td><td class="num">${money(sum(snap.customerRows,r=>r.collection))}</td><td class="num">${money(sum(snap.customerRows,r=>r.returns))}</td><td class="num">${money(sum(snap.customerRows,r=>r.closingDue))}</td></tr></tbody></table></div>`:noData('No customer activity','No customer sales, returns or collections in this period.');
  const stockTable=snap.stockRows.length?`<div class="table-wrap"><table class="table compact-table"><thead><tr><th>Product</th><th class="num">Opening</th><th class="num">Main Transfer</th><th class="num">Branch Purchase</th><th class="num">Sold</th><th class="num">Sales Return</th><th class="num">Stock Return</th><th class="num">Damage</th><th class="num">Closing</th><th class="num">Closing Value</th></tr></thead><tbody>${snap.stockRows.map(r=>`<tr><td class="bold">${esc(r.name)}<div class="muted">${esc(r.unit)}</div></td><td class="num">${num(r.openingQty)}</td><td class="num">${num(r.mainTransferQty)}</td><td class="num">${num(r.branchPurchaseQty)}</td><td class="num">${num(r.soldQty)}</td><td class="num">${num(r.salesReturnQty)}</td><td class="num">${num(r.stockReturnQty)}</td><td class="num">${num(r.damageQty)}</td><td class="num bold">${num(r.closingQty)}</td><td class="num">${money(r.closingValue)}</td></tr>`).join('')}</tbody></table></div>`:noData('No stock movement','No stock opening, received, purchase, sale, return or damage movement in this period.');
  const expenseTable=snap.expenseRows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Expense Name</th><th>Category</th><th>Method</th><th>Added By</th><th class="num">Amount</th></tr></thead><tbody>${snap.expenseRows.map(r=>`<tr><td>${dateLabel(r.date)}</td><td class="bold">${esc(r.description)}</td><td>${esc(r.category)}</td><td>${esc(r.method)}</td><td>${esc(r.createdBy)}</td><td class="num">${money(r.amount)}</td></tr>`).join('')}</tbody></table></div>`:noData('No expenses','No expense entry in this period.');
  const transferTable=snap.transferRows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Transfer No.</th><th>Date</th><th>From</th><th class="num">Quantity</th><th class="num">Value</th></tr></thead><tbody>${snap.transferRows.map(r=>`<tr><td class="bold">${esc(r.transferNo)}</td><td>${dateLabel(r.date)}</td><td>${esc(r.source)}</td><td class="num">${num(r.qty)}</td><td class="num">${money(r.value)}</td></tr>`).join('')}</tbody></table></div>`:noData('No main-branch transfer','No approved stock transfer received by this branch in this period.');
  const purchaseTable=snap.purchaseRows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Date</th><th>Vendor</th><th>Method</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th></tr></thead><tbody>${snap.purchaseRows.map(r=>`<tr><td class="bold">${esc(r.invoiceNo)}</td><td>${dateLabel(r.date)}</td><td>${esc(r.vendor)}</td><td>${esc(r.method)}</td><td class="num">${money(r.amount)}</td><td class="num">${money(r.paid)}</td><td class="num">${money(r.due)}</td></tr>`).join('')}</tbody></table></div>`:noData('No branch purchase','No purchase was recorded directly into this branch in this period.');
  openModal(`<div class="modal-large"><div class="modal-head"><div><div class="settlement-title-row"><h3>${esc(settlement.settlementNo)} · ${esc(snap.branchName)}</h3>${settlementStatusBadge(settlement.status)}</div><p>${dateLabel(settlement.from)} to ${dateLabel(settlement.to)} · Version ${settlement.version||1}${locked?` · Locked by ${esc(getUser(settlement.lockedBy)?.name||'—')}`:' · Draft preview only'}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body"><div class="grid grid-5">${kpi('Total Sales',money(s.totalSales),'tone-blue')}${kpi('Customer Collection',money(s.customerCollection),'tone-teal')}${kpi('Total Expenses',money(s.totalExpenses),'tone-orange')}${kpi('Closing Cash',money(s.closingCash),'tone-purple')}${kpi('Closing Stock Value',money(s.closingStockValue),'tone-green')}</div><div class="settlement-summary-grid" style="margin-top:18px"><section class="card"><div class="card-head"><div><h3 class="section-title">Sales Summary</h3><p class="section-sub">Sales and customer receipts in the selected period</p></div></div><div class="card-pad"><div class="summary-panel"><div class="summary-row"><span>Total Sales</span><strong>${money(s.totalSales)}</strong></div><div class="summary-row"><span>Cash Sales</span><strong>${money(s.cashSales)}</strong></div><div class="summary-row"><span>Bank Sales</span><strong>${money(s.bankSales)}</strong></div><div class="summary-row"><span>Due Sales</span><strong>${money(s.dueSales)}</strong></div><div class="summary-row"><span>Customer Collection</span><strong>${money(s.customerCollection)}</strong></div><div class="summary-row"><span>Sales Return</span><strong>− ${money(s.salesReturn)}</strong></div><div class="summary-row total"><span>Net Sales</span><strong>${money(s.netSales)}</strong></div></div></div></section><section class="card"><div class="card-head"><div><h3 class="section-title">Cash Settlement</h3><p class="section-sub">Cash ledger for this branch and period</p></div></div><div class="card-pad"><div class="summary-panel"><div class="summary-row"><span>Opening Cash</span><strong>${money(s.openingCash)}</strong></div><div class="summary-row"><span>Cash Sales</span><strong>${money(s.cashSales)}</strong></div><div class="summary-row"><span>Cash Collection</span><strong>${money(s.cashCollection)}</strong></div><div class="summary-row"><span>Other Cash In</span><strong>${money(s.otherCashIn)}</strong></div><div class="summary-row total"><span>Total Cash In</span><strong>${money(s.cashIn)}</strong></div><div class="summary-row"><span>Cash Expenses</span><strong>− ${money(s.cashExpenses)}</strong></div><div class="summary-row"><span>Cash Purchase Payment</span><strong>− ${money(s.cashPurchasePayment)}</strong></div><div class="summary-row"><span>Sales Return Refund</span><strong>− ${money(s.salesRefundCash)}</strong></div><div class="summary-row"><span>Other Cash Out</span><strong>− ${money(s.otherCashOut)}</strong></div><div class="summary-row total"><span>Closing Cash in Hand</span><strong>${money(s.closingCash)}</strong></div></div></div></section></div><div style="margin-top:18px">${section('Customer-wise Sales & Collection',`${snap.customerRows.length} active customer(s) in this period`,customerTable,'')}</div><div class="settlement-summary-grid" style="margin-top:18px"><section class="card"><div class="card-head"><div><h3 class="section-title">Main Branch Stock Transfer</h3><p class="section-sub">Approved stock received by this branch</p></div></div><div class="card-pad"><div class="summary-panel"><div class="summary-row"><span>Total Received Quantity</span><strong>${num(s.mainTransferQty)}</strong></div><div class="summary-row total"><span>Total Transfer Value</span><strong>${money(s.mainTransferValue)}</strong></div></div></div>${transferTable}</section><section class="card"><div class="card-head"><div><h3 class="section-title">Branch Purchase</h3><p class="section-sub">Purchase stock directly received by this branch</p></div></div><div class="card-pad"><div class="summary-panel"><div class="summary-row"><span>Total Purchase Quantity</span><strong>${num(s.branchPurchaseQty)}</strong></div><div class="summary-row total"><span>Total Purchase Amount</span><strong>${money(s.branchPurchaseAmount)}</strong></div></div></div>${purchaseTable}</section></div><div style="margin-top:18px">${section('Expenses',`${snap.expenseRows.length} expense entry/entries · Total ${money(s.totalExpenses)}`,expenseTable,'')}</div><div style="margin-top:18px">${section('Stock Summary','Opening + transfer + purchase − sales + returns − damage = closing stock',stockTable,'')}</div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-outline" data-action="print-modal">Print / Save PDF</button>${canLock?`<button class="btn btn-success" data-action="confirm-settlement" data-id="${settlement.id}">✓ Confirm & Lock Settlement</button>`:''}${settlement.status==='Draft'&&isSettlementAdmin()?`<button class="btn btn-danger" data-action="cancel-settlement" data-id="${settlement.id}">Cancel Draft</button>`:''}</div></div>`);
}
function confirmSettlement(id){
  if(!isSettlementAdmin())throw new Error('Only Owner/Admin can confirm and lock a settlement.');
  const settlement=state.settlements.find(x=>x.id===id); if(!settlement||settlement.status!=='Draft')throw new Error('Only a Draft Settlement can be locked.');
  settlement.snapshot=computeSettlement(settlement.branchId,settlement.from,settlement.to); settlement.status='Locked'; settlement.lockedBy=currentUser().id; settlement.lockedAt=nowStamp();
  log('Settlement Locked',`${settlement.settlementNo} locked for ${branchName(settlement.branchId)} · ${dateLabel(settlement.from)} to ${dateLabel(settlement.to)}`,settlement.settlementNo,settlement.branchId); save(); render(); closeModal(); toast('Settlement locked. This branch period is now read-only.');
}
function cancelSettlementDraft(id){
  if(!isSettlementAdmin())throw new Error('Only Owner/Admin can cancel a settlement draft.');
  const settlement=state.settlements.find(x=>x.id===id); if(!settlement||settlement.status!=='Draft')throw new Error('Only a Draft Settlement can be cancelled.');
  settlement.status='Cancelled'; settlement.cancelledAt=nowStamp(); settlement.cancelledBy=currentUser().id; log('Settlement Draft Cancelled',`${settlement.settlementNo} cancelled`,settlement.settlementNo,settlement.branchId);save();render();closeModal();toast('Settlement draft cancelled.');
}
function reopenSettlementModal(id){
  if(!isSettlementAdmin())throw new Error('Only Owner/Admin can reopen a settlement.');
  const settlement=state.settlements.find(x=>x.id===id); if(!settlement||settlement.status!=='Locked')throw new Error('Only a locked settlement can be reopened.');
  openModal(`<div class="modal-head"><div><h3>Reopen Locked Settlement</h3><p>${esc(settlement.settlementNo)} · ${esc(branchName(settlement.branchId))} · ${dateLabel(settlement.from)} to ${dateLabel(settlement.to)}</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="settlement-reopen" data-id="${settlement.id}"><div class="modal-body"><div class="notification">Reopening removes the date lock. The original locked snapshot will remain in settlement history as an audit record, and a corrected settlement can be generated after edits.</div><div class="field" style="margin-top:16px"><label>Reason for Reopen *</label><textarea name="reason" required placeholder="Explain what needs to be corrected"></textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-warning">Reopen Settlement</button></div></form>`);
}
function reopenSettlement(id,reason){
  if(!isSettlementAdmin())throw new Error('Only Owner/Admin can reopen a settlement.');
  const settlement=state.settlements.find(x=>x.id===id); if(!settlement||settlement.status!=='Locked')throw new Error('Only a locked settlement can be reopened.');
  settlement.status='Returned'; settlement.reopenedBy=currentUser().id; settlement.reopenedAt=nowStamp(); settlement.reopenReason=reason; log('Settlement Reopened',`${settlement.settlementNo} reopened: ${reason}`,settlement.settlementNo,settlement.branchId);save();render();closeModal();toast('Settlement reopened. This period can now be corrected.');
}
function exportSettlementRegister(){
  const rows=settlementHistoryForUser().map(x=>{const s=settlementSnapshot(x).summary||{};return {SettlementNo:x.settlementNo,Branch:branchName(x.branchId),From:x.from,To:x.to,Version:x.version||1,Status:x.status,TotalSales:s.totalSales,CustomerCollection:s.customerCollection,Expenses:s.totalExpenses,ClosingCash:s.closingCash,ClosingStockValue:s.closingStockValue,LockedAt:x.lockedAt||'',ReopenReason:x.reopenReason||''};});
  exportRows('settlement_register.csv',rows);
}
// Legacy export helpers retained for CSV compatibility.
function reportCustomerSales(sales){ const map={}; sales.forEach(s=>{const c=getCustomer(s.customerId);if(!c)return;const k=c.id;map[k]=map[k]||{c,sales:0,paid:0,due:0,salesmanId:s.salesmanId};map[k].sales+=Number(s.total||0);map[k].paid+=Number(s.paidAmount||0);map[k].due+=Number(s.dueAmount??Math.max(0,Number(s.total||0)-Number(s.paidAmount||0)));});return Object.values(map); }

// Approvals
function getApprovalRows(){
 const rows=[];
 state.salesReturns.forEach(x=>rows.push({...x,type:'Sales Return',collection:'salesReturns',branchId:x.branchId,requestedAt:x.createdAt||x.date,reference:x.returnNo,party:customerName(x.customerId),productText:(x.lines||[]).map(l=>productName(l.productId)).join(', '),quantity:sum(x.lines||[],l=>l.qty),amount:x.total}));
 state.stockReturns.forEach(x=>rows.push({...x,type:'Stock Return',collection:'stockReturns',requestedAt:x.createdAt||x.date,reference:x.returnNo,party:'Warehouse',productText:productName(x.productId),quantity:x.qty,amount:0}));
 state.damageReturns.forEach(x=>rows.push({...x,type:'Damage Return',collection:'damageReturns',requestedAt:x.createdAt||x.date,reference:x.returnNo,party:'Damage Stock',productText:productName(x.productId),quantity:x.qty,amount:0}));
 state.paymentReturns.forEach(x=>rows.push({...x,type:'Payment Return',collection:'paymentReturns',requestedAt:x.createdAt||x.date,reference:x.returnNo,party:customerName(x.customerId),productText:'—',quantity:0,amount:x.amount}));
 state.transfers.filter(x=>x.type==='Branch-to-Branch').forEach(x=>rows.push({...x,type:'Branch Transfer',collection:'transfers',branchId:x.sourceBranchId,requestedAt:x.createdAt||x.date,reference:x.transferNo,party:branchName(x.destinationBranchId),productText:(x.lines||[]).map(l=>productName(l.productId)).join(', '),quantity:sum(x.lines||[],l=>l.qty),amount:0}));
 state.purchaseReturns.forEach(x=>rows.push({...x,type:'Purchase Return',collection:'purchaseReturns',branchId:'warehouse',requestedAt:x.createdAt||x.date,reference:x.returnNo,party:vendorName(x.vendorId),productText:(x.lines||[]).map(l=>productName(l.productId)).join(', '),quantity:sum(x.lines||[],l=>l.qty),amount:x.total}));
 return rows;
}
function renderApprovals(){
 const rows=getApprovalRows().sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt))); const f=defaultFilters('approvals'); const status=f.status||'Pending'; const view=status==='All'?rows:rows.filter(x=>x.status===status);
 return `<div class="page-heading"><div><h2>Approval Center</h2><p>Approve or reject returns and branch-to-branch transfers. Financial and stock effects happen only after approval.</p></div><span class="badge badge-amber">${countPendingApprovals()} Pending</span></div><div class="tabs"><button class="tab ${status==='Pending'?'active':''}" data-action="approval-filter" data-status="Pending">Pending</button><button class="tab ${status==='Approved'?'active':''}" data-action="approval-filter" data-status="Approved">Approved</button><button class="tab ${status==='Rejected'?'active':''}" data-action="approval-filter" data-status="Rejected">Rejected</button><button class="tab ${status==='All'?'active':''}" data-action="approval-filter" data-status="All">All</button></div>
 <div style="margin-top:16px">${section('Approval Requests','Use confirmation before stock/due/payment changes are posted.',`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Approval Type</th><th>Branch</th><th>Customer / Vendor / Destination</th><th>Reference</th><th>Product</th><th class="num">Qty</th><th class="num">Amount</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>${view.length?view.map(r=>`<tr><td>${dateLabel(r.date)}</td><td>${statusBadge(r.type)}</td><td>${esc(branchName(r.branchId))}</td><td>${esc(r.party)}</td><td class="bold">${esc(r.reference)}</td><td>${esc(r.productText)}</td><td class="num">${r.quantity?num(r.quantity):'—'}</td><td class="num">${r.amount?money(r.amount):'—'}</td><td>${statusBadge(r.status)}</td><td class="right"><button class="btn btn-outline btn-sm" data-action="view-approval" data-collection="${r.collection}" data-id="${r.id}">View</button>${r.status==='Pending'&&canApproveRequests()?` <button class="btn btn-success btn-sm" data-action="approve-request" data-collection="${r.collection}" data-id="${r.id}">Approve</button> <button class="btn btn-danger btn-sm" data-action="reject-request" data-collection="${r.collection}" data-id="${r.id}">Reject</button>`:''}</td></tr>`).join(''):`<tr><td colspan="10">${noData('No approval requests',`No ${status.toLowerCase()} requests found.`)}</td></tr>`}</tbody></table></div>`)}</div>`;
}
function approvalPreviewModal(collection,id){ const rec=state[collection].find(x=>x.id===id); if(!rec)return; let details=''; if(collection==='salesReturns'||collection==='purchaseReturns'||collection==='transfers')details=`<div class="line-editor"><table><thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">Amount / Cost</th></tr></thead><tbody>${(rec.lines||[]).map(l=>`<tr><td>${esc(productName(l.productId))}</td><td class="num">${num(l.qty)}</td><td class="num">${money(l.total||Number(l.qty)*Number(l.unitPrice||l.cost||0))}</td></tr>`).join('')}</tbody></table></div>`; else details=`<div class="summary-panel"><div class="summary-row"><span>Product</span><strong>${esc(productName(rec.productId)||'—')}</strong></div><div class="summary-row"><span>Quantity</span><strong>${num(rec.qty||0)}</strong></div><div class="summary-row"><span>Reason</span><strong>${esc(rec.reason||'—')}</strong></div></div>`;
 openModal(`<div class="modal-head"><div><h3>${esc(getApprovalRows().find(x=>x.collection===collection&&x.id===id)?.type||'Request')} Preview</h3><p>${esc(rec.returnNo||rec.transferNo||'')} · ${dateLabel(rec.date)} · ${statusBadge(rec.status)}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body">${details}<div class="field" style="margin-top:16px"><label>Notes / Reason</label><textarea disabled>${esc(rec.notes||rec.reason||'—')}</textarea></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button>${rec.status==='Pending'&&canApproveRequests()?`<button class="btn btn-danger" data-action="reject-request" data-collection="${collection}" data-id="${id}">Reject</button><button class="btn btn-success" data-action="approve-request" data-collection="${collection}" data-id="${id}">Approve</button>`:''}</div>`);
}
function confirmApprovalModal(collection,id,approve){ const rec=state[collection].find(x=>x.id===id); if(!rec)return; openModal(`<div class="modal-head"><div><h3>${approve?'Approve':'Reject'} Request</h3><p>${approve?'This will post the related stock, due or payment adjustment.':'No stock or financial adjustment will be posted.'}</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="approval" data-collection="${collection}" data-id="${id}" data-approve="${approve?'true':'false'}"><div class="modal-body"><div class="notification">${approve?'Please confirm carefully. Approved financial records remain auditable and must be reversed through a new transaction if needed.':'Please enter a rejection reason to keep audit history complete.'}</div><div class="field" style="margin-top:16px"><label>${approve?'Approval Note (optional)':'Rejection Reason *'}</label><textarea name="reason" ${approve?'':'required'}></textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn ${approve?'btn-success':'btn-danger'}">Confirm ${approve?'Approval':'Rejection'}</button></div></form>`); }

// Logs
function renderLogs(){ const f=defaultFilters('logs'); const q=(f.q||'').toLowerCase(); const rows=state.activity.filter(l=>!q||[l.userName,l.userRole,l.action,l.description,l.reference,branchName(l.branchId)].join(' ').toLowerCase().includes(q)).slice(0,250); return `<div class="page-heading"><div><h2>Activity Logs</h2><p>Every major stock, sales, payment, expense and approval action is retained here.</p></div><button class="btn btn-outline" data-action="export-logs">⇩ Export Logs</button></div><div class="card toolbar"><div class="field"><label>Search Activity</label><input data-filter-key="logs" data-filter-name="q" value="${esc(f.q||'')}" placeholder="User, action, reference, branch"></div></div><div style="margin-top:16px">${section('Audit Trail','Financial records cannot be permanently deleted; activity logs preserve original actions.',`<div class="table-wrap"><table class="table"><thead><tr><th>Date & Time</th><th>User</th><th>Role</th><th>Branch</th><th>Action</th><th>Description</th><th>Reference</th></tr></thead><tbody>${rows.length?rows.map(l=>`<tr><td>${dateTimeLabel(l.date)}</td><td>${esc(l.userName)}</td><td>${esc(l.userRole)}</td><td>${esc(branchName(l.branchId))}</td><td>${statusBadge(l.action)}</td><td>${esc(l.description)}</td><td>${esc(l.reference||'—')}</td></tr>`).join(''):`<tr><td colspan="7">${noData('No activity logs','Actions will appear as the app is used.')}</td></tr>`}</tbody></table></div>`)}</div>`; }

// Settings
function renderSettings(){
 if(!fullAccessUser())return noData('Admin access only','Company details and data management are available only for Owner and Admin accounts.');
 const m=state.meta, warehouse=getBranch('warehouse');
 return `<div class="page-heading"><div><h2>Administration</h2><p>Owner/Admin company profile, VAT option, automatic local storage and backup controls.</p></div></div>
 <div class="grid grid-2"><section class="card"><div class="card-head"><div><h3 class="section-title">Company Details</h3><p class="section-sub">Updates apply to the app title, sidebar branding and future invoice print views.</p></div><span class="badge badge-blue">Owner / Admin</span></div><form data-form="settings"><div class="card-pad"><div class="form-grid">
 <div class="field"><label>Company Name *</label><input name="companyName" required value="${esc(m.companyName)}"></div>
 <div class="field"><label>Company Name (Arabic)</label><input name="companyNameArabic" value="${esc(m.companyNameArabic||'')}"></div>
 <div class="field form-full"><label>Company Address</label><input name="address" value="${esc(m.address||'')}"></div>
 <div class="field"><label>Phone</label><input name="phone" value="${esc(m.phone||'')}"></div>
 <div class="field"><label>Email</label><input type="email" name="email" value="${esc(m.email||'')}"></div>
 <div class="field"><label>Commercial Registration No.</label><input name="crNumber" value="${esc(m.crNumber||'')}"></div>
 <div class="field"><label>Main Warehouse / Branch Name</label><input name="mainBranchName" value="${esc(warehouse?.name||m.mainBranchName||'Warehouse')}"></div>
 <div class="field"><label>Main Warehouse Address</label><input name="mainBranchAddress" value="${esc(warehouse?.address||'')}"></div>
 <div class="field"><label>Main Warehouse Phone</label><input name="mainBranchPhone" value="${esc(warehouse?.phone||'')}"></div>
 <div class="field"><label>Currency</label><input disabled value="${esc(m.currency||'SAR')}"></div>
 <div class="field"><label>Default Low Stock Limit</label><input type="number" min="0" name="lowStockDefault" value="${state.settings.lowStockDefault}"></div>
 </div><div class="settings-divider"><h4>VAT Option</h4><p>Stored as company information only. VAT does not calculate or change purchase/sales totals in this version.</p></div><div class="form-grid"><div class="field"><label>VAT Status</label><select name="vatEnabled"><option value="false" ${!m.vatEnabled?'selected':''}>VAT Not Enabled</option><option value="true" ${m.vatEnabled?'selected':''}>VAT Enabled</option></select></div><div class="field"><label>VAT Rate (%)</label><input type="number" min="0" max="100" step="0.01" name="vatRate" value="${Number(m.vatRate??15)}"></div><div class="field form-full"><label>VAT Registration Number</label><input name="vatNumber" value="${esc(m.vatNumber||'')}" placeholder="Optional; stored only"></div></div></div><div class="modal-foot"><button class="btn btn-primary">Save Company Details</button></div></form></section>
 <section class="card"><div class="card-head"><div><h3 class="section-title">Local Data Storage</h3><p class="section-sub">All business data is saved automatically in this laptop browser.</p></div></div><div class="card-pad"><div class="grid" style="gap:12px"><div class="success-box">Auto-save is active. Last saved: ${m.lastSavedAt?dateTimeLabel(m.lastSavedAt):'No changes yet'}</div><button class="btn btn-primary" data-action="backup">⇩ Download Backup JSON</button><label class="btn btn-outline" style="cursor:pointer">⇧ Restore Backup JSON<input type="file" accept="application/json" data-action="restore" style="display:none"></label><button class="btn btn-secondary" data-action="load-demo">✦ Load Demo Data</button><button class="btn btn-danger" data-action="reset-data">Reset All Local Data</button><p class="muted" style="margin:0">Open this app again in the same browser on this laptop and the saved data will return automatically. Keep a backup file before clearing browser data or changing browsers.</p></div></div></section></div>`;
}


function vendorPaymentModal(vendorId=''){
 const vs=vendorId?[getVendor(vendorId)]:activeVendors(); const v=vendorId?getVendor(vendorId):vs[0]; if(!v){toast('Create a vendor first.','warning');return;}
 openModal(`<div class="modal-head"><div><h3>Vendor Payment</h3><p>Payment reduces Vendor Due and updates Cash/Bank outflow.</p></div><button class="modal-close" data-close-modal>×</button></div><form data-form="vendor-payment"><div class="modal-body"><div class="form-grid"><div class="field"><label>Vendor *</label><select name="vendorId" data-action="vendor-payment-change">${activeVendors().map(x=>`<option value="${x.id}" ${x.id===v.id?'selected':''}>${esc(x.name)} · Due ${money(vendorDue(x.id))}</option>`).join('')}</select></div><div class="field"><label>Payment Date *</label><input type="date" name="date" value="${isoToday()}" required></div><div class="field"><label>Payment Amount *</label><input type="number" name="amount" min="0.01" max="${vendorDue(v.id)}" step="0.01" required></div><div class="field"><label>Payment Method *</label><select name="method"><option>Cash</option><option>Bank Transfer</option><option>Aramco Payment</option><option>Others</option></select></div><div class="field"><label>Payment Number</label><input name="paymentNo" value="${nextRef('VP',state.vendorPayments)}"></div><div class="field"><label>Current Vendor Due</label><input disabled value="${money(vendorDue(v.id))}"></div><div class="field form-full"><label>Remark / Notes</label><textarea name="notes"></textarea></div></div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary">Save Vendor Payment</button></div></form>`);
}
function viewPurchaseModal(id){const p=state.purchases.find(x=>x.id===id);if(!p)return;openModal(`<div class="modal-head"><div><h3>Purchase Invoice — ${esc(p.invoiceNo)}</h3><p>${dateLabel(p.date)} · ${esc(vendorName(p.vendorId))}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body">${invoiceCompanyBlock()}${renderInvoiceLines(p.lines,'Unit Cost')}<div class="summary-panel" style="margin-top:16px"><div class="summary-row"><span>Invoice Total</span><strong>${money(p.total)}</strong></div><div class="summary-row"><span>Paid Amount</span><strong>${money(p.paidAmount)}</strong></div><div class="summary-row total"><span>Vendor Due from Invoice</span><strong>${money(p.total-p.paidAmount)}</strong></div></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" data-action="print-modal">Print</button></div>`);}
function viewSaleModal(id){const s=state.sales.find(x=>x.id===id);if(!s)return;const invoiceDue=Number(s.dueAmount??Math.max(0,Number(s.total||0)-Number(s.paidAmount||0)));openModal(`<div class="modal-head"><div><h3>Sales Invoice — ${esc(s.invoiceNo)}</h3><p>${dateLabel(s.date)} · ${esc(branchName(s.branchId))} · ${esc(customerName(s.customerId))}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body">${invoiceCompanyBlock()}${renderInvoiceLines(s.lines,'Unit Price')}<div class="summary-panel" style="margin-top:16px"><div class="summary-row"><span>Invoice Total</span><strong>${money(s.total)}</strong></div><div class="summary-row"><span>Paid Amount</span><strong>${money(s.paidAmount)}</strong></div><div class="summary-row total"><span>Customer Due from Invoice</span><strong>${money(invoiceDue)}</strong></div></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" data-action="print-modal">Print</button></div>`);}
function renderInvoiceLines(lines, priceLabel){return `<div class="line-editor"><table><thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">${priceLabel}</th><th class="num">Discount</th><th class="num">Line Total</th></tr></thead><tbody>${(lines||[]).map(l=>`<tr><td class="bold">${esc(productName(l.productId))}</td><td class="num">${num(l.qty)}</td><td class="num">${money(l.unitPrice)}</td><td class="num">${money(l.discount||0)}</td><td class="num">${money(l.total||Number(l.qty)*Number(l.unitPrice)-Number(l.discount||0))}</td></tr>`).join('')}</tbody></table></div>`;}

// Data write operations
function createBranch(data,id=''){
 if(id){const b=getBranch(id);Object.assign(b,data);log('Branch Edited',`Updated branch ${b.name}`,b.id,b.id);}
 else{const b={id:uid('br'),...data,isWarehouse:false};state.branches.push(b);log('Branch Created',`Created branch ${b.name}`,b.id,b.id);}
 save();render();closeModal();toast('Branch saved successfully.');
}
function syncUserBranchAssignment(user){if(normalizeRole(user?.role)!=='Salesman')return;state.branches.forEach(b=>{if(b.assignedSalesmanId===user.id&&b.id!==user.branchId)b.assignedSalesmanId='';});const branch=getBranch(user.branchId);if(branch)branch.assignedSalesmanId=user.id;}
function createUser(data,id=''){
 const payload=Object.assign({},data,{role:normalizeRole(data.role),permissions:Array.isArray(data.permissions)?data.permissions:[]});if(payload.role==='Salesman'&&(!payload.branchId||payload.branchId==='warehouse'))throw new Error('Assign a sub branch to the Salesman account.');
 if(id){const u=getUser(id);if(normalizeRole(u.role)==='Owner')payload.role='Owner';Object.assign(u,payload);syncUserBranchAssignment(u);log('User Edited',`Updated user ${u.name}`,u.id,u.branchId);}else{if(payload.role==='Owner')throw new Error('New user role must be Admin, Manager or Salesman.');const u={id:uid('usr'),...payload};state.users.push(u);syncUserBranchAssignment(u);log('User Created',`Created ${roleLabel(u.role)} user ${u.name}`,u.id,u.branchId);}save();render();closeModal();toast('User saved successfully.');
}
function createCategory(data,id=''){
 if(id){Object.assign(state.categories.find(x=>x.id===id),data);log('Category Edited',`Updated category ${data.name}`,id);}
 else{const c={id:uid('cat'),...data};state.categories.push(c);log('Category Created',`Created category ${c.name}`,c.id);}
 save();render();closeModal();toast('Category saved successfully.');
}
function createProduct(data,id=''){
 if(id){Object.assign(getProduct(id),data);log('Product Edited',`Updated product ${data.name}`,id);}
 else{const p={id:uid('prd'),...data};state.products.push(p);log('Product Created',`Created product ${p.name}`,p.id);}
 save();render();closeModal();toast('Product saved successfully.');
}
function createVendor(data,id=''){
 if(id){Object.assign(getVendor(id),data);log('Vendor Edited',`Updated vendor ${data.name}`,id);}
 else{const v={id:uid('ven'),...data,status:'Active'};state.vendors.push(v);log('Vendor Created',`Created vendor ${v.name}`,v.id);}
 save();render();closeModal();toast('Vendor saved successfully.');
}
function createCustomer(data,id=''){
 const u=currentUser(); const role=normalizeRole(u?.role);
 if(role==='Salesman' && data.branchId!==u.branchId) throw new Error('Salesman can create or edit customers only for the assigned branch.');
 if((role==='Manager') && u.branchId && data.branchId!==u.branchId) throw new Error('Manager can create or edit customers only for the assigned branch.');
 if(!getBranch(data.branchId)) throw new Error('Select a valid customer location.');
 if(id){const existing=getCustomer(id); if(!existing)throw new Error('Customer not found.'); if(role==='Salesman'&&existing.branchId!==u.branchId)throw new Error('You cannot edit a customer from another branch.'); Object.assign(existing,data);log('Customer Edited',`Updated customer ${data.name}`,id,data.branchId);}
 else{const c={id:uid('cus'),...data,status:'Active'};state.customers.push(c);log('Customer Created',`Created customer ${c.name}`,c.id,c.branchId);}
 save();render();closeModal();toast('Customer saved successfully.');
}
function createPurchase(data){
 const branchId=data.branchId||'warehouse'; assertOperationalDateOpen(branchId,data.date,'Purchase');
 const total=sum(data.lines,l=>l.total); if(data.paidAmount>total+1e-6){throw new Error('Paid Amount cannot be greater than Purchase Total.');}
 const p={id:uid('pur'),invoiceNo:data.invoiceNo||nextRef('PI',state.purchases),date:data.date,branchId,vendorId:data.vendorId,lines:data.lines,total,paidAmount:data.paidAmount,paymentMethod:data.paymentMethod,notes:data.notes,status:'Active',createdBy:currentUser().id,createdAt:nowStamp()};state.purchases.push(p);
 data.lines.forEach(l=>recordStock({date:p.date,branchId:p.branchId,productId:l.productId,qty:l.qty,unitCost:l.unitPrice,type:'Purchase',refId:p.id,note:p.invoiceNo}));
 if(p.paidAmount>0&&p.paymentMethod!=='Due'){ const ledger=p.paymentMethod==='Bank'?'bank':'cash'; addMoney({date:p.date,ledger,direction:'Out',amount:p.paidAmount,kind:'Purchase Payment',branchId:p.branchId,refId:p.id,description:`Initial payment for ${p.invoiceNo}`,method:p.paymentMethod,vendorId:p.vendorId}); state.vendorPayments.push({id:uid('vp'),paymentNo:`${p.invoiceNo}-PAY`,date:p.date,vendorId:p.vendorId,amount:p.paidAmount,method:p.paymentMethod,notes:'Initial payment in purchase invoice',status:'Active',refPurchaseId:p.id,createdBy:currentUser().id}); }
 log('Purchase Invoice Created',`Created ${p.invoiceNo} for ${vendorName(p.vendorId)} — ${money(p.total)}`,p.invoiceNo,p.branchId);save();render();closeModal();toast('Purchase invoice saved. Stock and vendor due updated.');
}
function createSale(data){
 assertOperationalDateOpen(data.branchId,data.date,'Sales');
 const total=sum(data.lines,l=>l.total); if(data.paidAmount>total+1e-6) throw new Error('Paid Amount cannot be greater than Invoice Total.');
 const customer=getCustomer(data.customerId); if(!customer)throw new Error('Select a customer.');if(customer.branchId!==data.branchId)throw new Error('Customer must belong to the selected branch.');
 const dueAmount=Math.max(0,total-Number(data.paidAmount||0));
 if(Number(customer.creditLimit||0)>0 && customerDue(customer.id)+dueAmount>Number(customer.creditLimit||0)+1e-6)throw new Error(`Credit limit exceeded. Current due: ${money(customerDue(customer.id))}`);
 data.lines.forEach(l=>{if(!ensureStock(data.branchId,l.productId,l.qty))throw new Error(`${productName(l.productId)} does not have enough branch stock.`);l.cost=stockPosition(data.branchId,l.productId).avg;});
 const sale={id:uid('sale'),invoiceNo:data.invoiceNo||nextRef('SI',state.sales),date:data.date,branchId:data.branchId,salesmanId:currentUser().id,customerId:data.customerId,lines:data.lines,discount:sum(data.lines,l=>l.discount),total,paidAmount:Number(data.paidAmount||0),dueAmount,paymentType:data.paymentType,paymentMethod:data.paymentMethod,notes:data.notes,status:'Active',createdAt:nowStamp()};state.sales.push(sale);
 data.lines.forEach(l=>recordStock({date:sale.date,branchId:sale.branchId,productId:l.productId,qty:-l.qty,unitCost:l.cost,type:'Sales',refId:sale.id,note:sale.invoiceNo}));
 if(sale.paidAmount>0){const ledger=sale.paymentMethod==='Bank'?'bank':'cash';addMoney({date:sale.date,ledger,direction:'In',amount:sale.paidAmount,kind:'Sale Receipt',branchId:sale.branchId,refId:sale.id,description:`Payment for ${sale.invoiceNo}`,method:sale.paymentMethod,customerId:sale.customerId});}
 log('Sales Invoice Created',`Created ${sale.invoiceNo} for ${customerName(sale.customerId)} — ${money(sale.total)}`,sale.invoiceNo,sale.branchId);save();render();closeModal();toast('Sales invoice saved. Branch stock updated; only due amount is added to customer account.');
}
function createTransfer(data){
 assertTransferDatesOpen(data.sourceBranchId,data.destinationBranchId,data.date);
 data.lines.forEach(l=>{if(!ensureStock(data.sourceBranchId,l.productId,l.qty))throw new Error(`${productName(l.productId)} does not have sufficient stock in ${branchName(data.sourceBranchId)}.`);});
 const instant=data.sourceBranchId==='warehouse'; const t={id:uid('tr'),transferNo:nextRef('ST',state.transfers),date:data.date,sourceBranchId:data.sourceBranchId,destinationBranchId:data.destinationBranchId,lines:data.lines,notes:data.notes,type:instant?'Warehouse-to-Branch':'Branch-to-Branch',status:instant?'Approved':'Pending',createdBy:currentUser().id,createdAt:nowStamp()};state.transfers.push(t);
 if(instant)applyTransfer(t); log('Stock Transfer Created',`${t.type} ${t.transferNo} from ${branchName(t.sourceBranchId)} to ${branchName(t.destinationBranchId)}`,t.transferNo,t.sourceBranchId);save();render();closeModal();toast(instant?'Transfer completed. Warehouse and branch stock updated.':'Branch-to-Branch transfer submitted for approval.');
}
function applyTransfer(t){t.lines.forEach(l=>{const c=stockPosition(t.sourceBranchId,l.productId).avg;recordStock({date:t.date,branchId:t.sourceBranchId,productId:l.productId,qty:-l.qty,unitCost:c,type:'Transfer Out',refId:t.id,note:t.transferNo});recordStock({date:t.date,branchId:t.destinationBranchId,productId:l.productId,qty:l.qty,unitCost:c,type:'Transfer In',refId:t.id,note:t.transferNo});});t.status='Approved';t.approvedBy=currentUser().id;t.approvedAt=nowStamp();}
function createSalesReturn(data){
 const sale=state.sales.find(x=>x.id===data.saleId);if(!sale)throw new Error('Sales invoice not found.'); assertOperationalDateOpen(sale.branchId,data.date,'Sales return');
 const total=sum(data.lines,l=>l.total);if(total<=0)throw new Error('Enter at least one returned quantity.');
 data.lines.forEach(l=>{const available=salesReturnLineAvailable(sale,l.sourceLineIndex);if(l.qty>available+1e-6)throw new Error(`${productName(l.productId)} return quantity exceeds available return quantity.`);});
 const r={id:uid('sr'),returnNo:nextRef('SR',state.salesReturns),date:data.date,saleId:sale.id,invoiceNo:sale.invoiceNo,branchId:sale.branchId,customerId:sale.customerId,lines:data.lines,total,refundMethod:data.refundMethod||'Cash',dueAdjustment:0,refundAmount:0,notes:data.notes,status:'Pending',createdBy:currentUser().id,createdAt:nowStamp()};state.salesReturns.push(r);log('Sales Return Requested',`Requested ${r.returnNo} for ${sale.invoiceNo}`,r.returnNo,sale.branchId);save();render();closeModal();toast('Sales return request sent to Approval Center.');
}
function createPurchaseReturn(data){
 const purchase=state.purchases.find(x=>x.id===data.purchaseId);if(!purchase)throw new Error('Purchase invoice not found.'); const branchId=purchaseBranchId(purchase); assertOperationalDateOpen(branchId,data.date,'Purchase return');
 const total=sum(data.lines,l=>l.total);if(total<=0)throw new Error('Enter at least one return quantity.');
 data.lines.forEach(l=>{const available=purchaseReturnLineAvailable(purchase,l.sourceLineIndex);if(l.qty>available+1e-6)throw new Error(`${productName(l.productId)} return quantity exceeds available return quantity.`);});
 const byProduct=requestedQtyByProduct(data.lines);Object.entries(byProduct).forEach(([productId,qty])=>{if(!ensureStock(branchId,productId,qty))throw new Error(`${productName(productId)} does not have enough current stock for this return.`);});
 const r={id:uid('pr'),returnNo:nextRef('PR',state.purchaseReturns),date:data.date,purchaseId:purchase.id,branchId,vendorId:purchase.vendorId,lines:data.lines,total,notes:data.notes,status:'Pending',createdBy:currentUser().id,createdAt:nowStamp()};state.purchaseReturns.push(r);log('Purchase Return Requested',`Requested ${r.returnNo} for ${purchase.invoiceNo}`,r.returnNo,branchId);save();render();closeModal();toast('Purchase return request sent to Approval Center.');
}
function createStockReturn(data){assertOperationalDateOpen(data.branchId,data.date,'Stock return');const available=availableBranchReturnQty(data.branchId,data.productId);if(data.qty>available+1e-6)throw new Error(`Return quantity cannot exceed available stock of ${num(available)}.`);const r={id:uid('str'),returnNo:nextRef('STR',state.stockReturns),date:data.date,branchId:data.branchId,productId:data.productId,qty:data.qty,reason:data.reason,status:'Pending',createdBy:currentUser().id,createdAt:nowStamp()};state.stockReturns.push(r);log('Stock Return Requested',`Requested stock return ${r.returnNo}`,r.returnNo,r.branchId);save();render();closeModal();toast('Stock return request submitted for approval.');}
function createDamageReturn(data){assertOperationalDateOpen(data.branchId,data.date,'Damage entry');const available=availableBranchReturnQty(data.branchId,data.productId);if(data.qty>available+1e-6)throw new Error(`Damage quantity cannot exceed available stock of ${num(available)}.`);const r={id:uid('dr'),returnNo:nextRef('DR',state.damageReturns),date:data.date,branchId:data.branchId,productId:data.productId,qty:data.qty,reason:data.reason,attachment:data.attachment,status:'Pending',createdBy:currentUser().id,createdAt:nowStamp()};state.damageReturns.push(r);log('Damage Return Requested',`Requested damage return ${r.returnNo}`,r.returnNo,r.branchId);save();render();closeModal();toast('Damage return request submitted for approval.');}
function createCustomerPayment(data){assertOperationalDateOpen(data.branchId,data.date,'Customer collection');const due=customerDue(data.customerId);if(data.amount>due+1e-6)throw new Error(`Payment cannot exceed customer due of ${money(due)}.`);const p={id:uid('cp'),paymentNo:data.paymentNo||nextRef('CP',state.customerPayments),date:data.date,branchId:data.branchId,customerId:data.customerId,amount:data.amount,method:data.method,notes:data.notes,status:'Active',createdBy:currentUser().id,createdAt:nowStamp()};state.customerPayments.push(p);addMoney({date:p.date,ledger:p.method==='Bank'?'bank':'cash',direction:'In',amount:p.amount,kind:'Customer Collection',branchId:p.branchId,refId:p.id,description:`Collection ${p.paymentNo}`,method:p.method,customerId:p.customerId});log('Customer Payment Received',`Received ${money(p.amount)} from ${customerName(p.customerId)}`,p.paymentNo,p.branchId);save();render();closeModal();toast('Customer payment saved. Customer due reduced.');}
function createPaymentReturn(data){const p=state.customerPayments.find(x=>x.id===data.paymentId);if(!p)throw new Error('Payment not found.');assertOperationalDateOpen(p.branchId,data.date,'Payment return');const available=paymentReturnAvailable(p.id);if(data.amount>available+1e-6)throw new Error(`Return amount cannot exceed available amount of ${money(available)}.`);const r={id:uid('ptr'),returnNo:nextRef('PTR',state.paymentReturns),date:data.date,paymentId:p.id,branchId:p.branchId,customerId:p.customerId,amount:data.amount,method:p.method,reason:data.reason,status:'Pending',createdBy:currentUser().id,createdAt:nowStamp()};state.paymentReturns.push(r);log('Payment Return Requested',`Requested payment return ${r.returnNo}`,r.returnNo,r.branchId);save();render();closeModal();toast('Payment return sent to Approval Center.');}
function createVendorPayment(data){const due=vendorDue(data.vendorId);if(data.amount>due+1e-6)throw new Error(`Payment cannot exceed vendor due of ${money(due)}.`);const p={id:uid('vp'),paymentNo:data.paymentNo||nextRef('VP',state.vendorPayments),date:data.date,vendorId:data.vendorId,amount:data.amount,method:data.method,notes:data.notes,status:'Active',createdBy:currentUser().id,createdAt:nowStamp()};state.vendorPayments.push(p);if(p.method==='Cash'||p.method==='Bank Transfer'){addMoney({date:p.date,ledger:p.method==='Cash'?'cash':'bank',direction:'Out',amount:p.amount,kind:'Vendor Payment',branchId:'warehouse',refId:p.id,description:`Vendor payment ${p.paymentNo}`,method:p.method,vendorId:p.vendorId});}log('Vendor Payment Created',`Paid ${money(p.amount)} to ${vendorName(p.vendorId)}`,p.paymentNo,'warehouse');save();render();closeModal();toast('Vendor payment saved. Vendor due reduced.');}
function createExpense(data){assertOperationalDateOpen(data.branchId,data.date,'Expense');const e={id:uid('exp'),date:data.date,branchId:data.branchId,category:data.category,description:data.description,amount:data.amount,paymentMethod:data.paymentMethod,notes:data.notes,attachment:data.attachment,status:'Active',createdBy:currentUser().id,createdAt:nowStamp()};state.expenses.push(e);if(e.paymentMethod==='Cash'||e.paymentMethod==='Bank'){addMoney({date:e.date,ledger:e.paymentMethod==='Cash'?'cash':'bank',direction:'Out',amount:e.amount,kind:'Expense',branchId:e.branchId,refId:e.id,description:e.description,method:e.paymentMethod});}log('Expense Created',`${e.category}: ${e.description} — ${money(e.amount)}`,e.id,e.branchId);save();render();closeModal();toast('Expense saved and cash/bank flow updated.');}

function approveRequest(collection,id,approved,reason=''){
 const r=state[collection].find(x=>x.id===id);if(!r||r.status!=='Pending')throw new Error('Request is not pending.');
 if(approved){
   const affectedBranches=collection==='transfers'?[r.sourceBranchId,r.destinationBranchId]:[collection==='purchaseReturns'?(r.branchId||purchaseBranchId(state.purchases.find(x=>x.id===r.purchaseId))):r.branchId];
   affectedBranches.filter(Boolean).forEach(branchId=>assertOperationalDateOpen(branchId,r.date,'Approval'));
   if(collection==='salesReturns'){
     const sale=state.sales.find(s=>s.id===r.saleId);if(!sale)throw new Error('Original sales invoice was not found.');
     const originalInvoiceDue=Number(sale.dueAmount??Math.max(0,Number(sale.total||0)-Number(sale.paidAmount||0)));
     const priorInvoiceDueReduction=sum(state.salesReturns.filter(x=>x.saleId===sale.id&&x.status==='Approved'&&x.id!==r.id),salesReturnDueEffect);
     const invoiceDueAvailable=Math.max(0,originalInvoiceDue-priorInvoiceDueReduction);
     const customerDueAvailable=Math.max(0,customerDue(r.customerId));
     r.dueAdjustment=Math.min(Number(r.total||0),invoiceDueAvailable,customerDueAvailable);
     r.refundAmount=Math.max(0,Number(r.total||0)-r.dueAdjustment);
     r.lines.forEach(l=>recordStock({date:r.date,branchId:r.branchId,productId:l.productId,qty:l.qty,unitCost:l.cost,type:'Sales Return',refId:r.id,note:r.returnNo}));
     if(r.refundAmount>0){addMoney({date:r.date,ledger:r.refundMethod==='Bank'?'bank':'cash',direction:'Out',amount:r.refundAmount,kind:'Sales Return Refund',branchId:r.branchId,refId:r.id,description:`Refund for ${r.returnNo}`,method:r.refundMethod||'Cash',customerId:r.customerId});}
   } else if(collection==='purchaseReturns'){
     r.lines.forEach(l=>{const purchaseLocation=r.branchId||purchaseBranchId(state.purchases.find(x=>x.id===r.purchaseId));if(!ensureStock(purchaseLocation,l.productId,l.qty))throw new Error(`Stock is insufficient for ${productName(l.productId)} return.`);const c=stockPosition(purchaseLocation,l.productId).avg;recordStock({date:r.date,branchId:purchaseLocation,productId:l.productId,qty:-l.qty,unitCost:c,type:'Purchase Return',refId:r.id,note:r.returnNo});});
   } else if(collection==='stockReturns'){
     if(!ensureStock(r.branchId,r.productId,r.qty))throw new Error('Source branch stock is no longer sufficient.');const c=stockPosition(r.branchId,r.productId).avg;recordStock({date:r.date,branchId:r.branchId,productId:r.productId,qty:-r.qty,unitCost:c,type:'Stock Return Out',refId:r.id,note:r.returnNo});recordStock({date:r.date,branchId:'warehouse',productId:r.productId,qty:r.qty,unitCost:c,type:'Stock Return In',refId:r.id,note:r.returnNo});
   } else if(collection==='damageReturns'){
     if(!ensureStock(r.branchId,r.productId,r.qty))throw new Error('Source branch stock is no longer sufficient.');const c=stockPosition(r.branchId,r.productId).avg;recordStock({date:r.date,branchId:r.branchId,productId:r.productId,qty:-r.qty,unitCost:c,type:'Damage Return',refId:r.id,note:r.returnNo});
   } else if(collection==='paymentReturns'){
     addMoney({date:r.date,ledger:r.method==='Bank'?'bank':'cash',direction:'Out',amount:r.amount,kind:'Payment Return',branchId:r.branchId,refId:r.id,description:`Payment return ${r.returnNo}`,method:r.method,customerId:r.customerId});
   } else if(collection==='transfers'){
     applyTransfer(r);
   }
   r.status='Approved';r.approvedBy=currentUser().id;r.approvedAt=nowStamp();r.approvalNote=reason||'';log('Request Approved',`Approved ${r.returnNo||r.transferNo||r.id}`,r.returnNo||r.transferNo||r.id,r.branchId||'warehouse');
 }else{r.status='Rejected';r.rejectedBy=currentUser().id;r.rejectedAt=nowStamp();r.rejectionReason=reason;log('Request Rejected',`Rejected ${r.returnNo||r.transferNo||r.id}: ${reason}`,r.returnNo||r.transferNo||r.id,r.branchId||'warehouse');}
 save();render();closeModal();toast(approved?'Request approved and related records updated.':'Request rejected.');
}

// Calculations in modal editors
function updatePurchaseTotals(){const lines=[...document.querySelectorAll('.purchase-line')];let total=0;lines.forEach(row=>{const q=Number(row.querySelector('.pl-qty')?.value||0),p=Number(row.querySelector('.pl-price')?.value||0),v=q*p;const cell=row.querySelector('.line-total');if(cell)cell.textContent=money(v);total+=v;});const paid=Number(document.querySelector('[name="paidAmount"]')?.value||0);const t=document.getElementById('purchase-total'),d=document.getElementById('purchase-due');if(t)t.textContent=money(total);if(d)d.textContent=money(Math.max(0,total-paid));}
function updateSalesTotals(){const lines=[...document.querySelectorAll('.sales-line')];let total=0;lines.forEach(row=>{const q=Number(row.querySelector('.sl-qty')?.value||0),p=Number(row.querySelector('.sl-price')?.value||0),disc=Number(row.querySelector('.sl-disc')?.value||0),v=Math.max(0,q*p-disc);const cell=row.querySelector('.sl-total');if(cell)cell.textContent=money(v);total+=v;});const paid=Number(document.querySelector('[name="paidAmount"]')?.value||0);const t=document.getElementById('sales-total'),d=document.getElementById('sales-due');if(t)t.textContent=money(total);if(d)d.textContent=money(Math.max(0,total-paid));}
function readForm(form){const fd=new FormData(form);const o={};for(const [k,v] of fd.entries())o[k]=v;return o;}
function numberFields(o,keys){keys.forEach(k=>o[k]=Number(o[k]||0));return o;}
function download(filename,content,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportRows(filename,rows){if(!rows.length){toast('No rows to export.','warning');return;}const headers=Object.keys(rows[0]);const csv=[headers.join(','),...rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))].join('\n');download(filename,csv,'text/csv');}
function printModal(){const m=document.querySelector('#modal-root .modal');if(!m)return;const w=window.open('','_blank');w.document.write(`<html><head><title>Print</title><link rel="stylesheet" href="styles.css"></head><body style="padding:24px">${m.innerHTML}</body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),350);}
function loadDemoData(){
 if(state.products.length||state.branches.length>1){if(!confirm('Load demo data will reset current local data. Continue?'))return;}
 state=defaultState();
 const b1={id:'br_a',name:'Rayan Distribution Branch',code:'RYN',address:'Riyadh',phone:'0500000001',status:'Active',notes:'Demo branch',isWarehouse:false,assignedSalesmanId:'usr_sales'};
 const b2={id:'br_b',name:'Jeddah Wholesale Branch',code:'JED',address:'Jeddah',phone:'0500000002',status:'Active',notes:'Demo branch',isWarehouse:false,assignedSalesmanId:''}; state.branches.push(b1,b2);
 state.users.push({id:'usr_acc',name:'Amin Accountant',role:'Accountant',branchId:'warehouse',active:true,email:'amin@example.com'},{id:'usr_sales',name:'Rashed Salesman',role:'Salesman',branchId:b1.id,active:true,email:'rashed@example.com'});
 const c1={id:'cat_food',name:'Food & Grocery',status:'Active'},c2={id:'cat_house',name:'Household',status:'Active'};state.categories.push(c1,c2);
 const p1={id:'prd_rice',name:'Premium Rice 5kg',sku:'RICE-5',categoryId:c1.id,unit:'bag',defaultPurchasePrice:38,defaultSellingPrice:48,lowStock:15,status:'Active',notes:''},p2={id:'prd_oil',name:'Sunflower Oil 1L',sku:'OIL-1L',categoryId:c1.id,unit:'bottle',defaultPurchasePrice:8.5,defaultSellingPrice:11,lowStock:30,status:'Active',notes:''},p3={id:'prd_clean',name:'Floor Cleaner 1L',sku:'CLN-1L',categoryId:c2.id,unit:'bottle',defaultPurchasePrice:7,defaultSellingPrice:10,lowStock:20,status:'Active',notes:''};state.products.push(p1,p2,p3);
 const v={id:'ven_1',name:'National FMCG Supplier',phone:'0501234567',address:'Riyadh',contactPerson:'Khaled',openingBalance:0,notes:'',status:'Active'};state.vendors.push(v);
 const cu1={id:'cus_1',name:'Mohammad Ali',shopName:'Al Noor Grocery',phone:'0551234567',address:'Riyadh',branchId:b1.id,creditLimit:5000,openingDue:0,notes:'',status:'Active'},cu2={id:'cus_2',name:'Abdul Rahman',shopName:'Jeddah Mini Mart',phone:'0569999999',address:'Jeddah',branchId:b2.id,creditLimit:4000,openingDue:0,notes:'',status:'Active'};state.customers.push(cu1,cu2);
 const p={id:'pur_demo',invoiceNo:'PI-00001',date:isoToday(),vendorId:v.id,lines:[{productId:p1.id,qty:100,unitPrice:38,total:3800},{productId:p2.id,qty:300,unitPrice:8.5,total:2550},{productId:p3.id,qty:150,unitPrice:7,total:1050}],total:7400,paidAmount:2500,paymentMethod:'Bank',notes:'Demo purchase',status:'Active',createdBy:'owner_admin',createdAt:nowStamp()};state.purchases.push(p);p.lines.forEach(l=>recordStock({date:p.date,branchId:'warehouse',productId:l.productId,qty:l.qty,unitCost:l.unitPrice,type:'Purchase',refId:p.id,note:p.invoiceNo}));state.vendorPayments.push({id:'vp_demo',paymentNo:'PI-00001-PAY',date:p.date,vendorId:v.id,amount:2500,method:'Bank',notes:'Initial payment',status:'Active',refPurchaseId:p.id,createdBy:'owner_admin'});addMoney({date:p.date,ledger:'bank',direction:'Out',amount:2500,kind:'Purchase Payment',branchId:'warehouse',refId:p.id,description:'Initial purchase payment',method:'Bank',vendorId:v.id});
 const t={id:'tr_demo',transferNo:'ST-00001',date:isoToday(),sourceBranchId:'warehouse',destinationBranchId:b1.id,lines:[{productId:p1.id,qty:50},{productId:p2.id,qty:100}],notes:'Demo transfer',type:'Warehouse-to-Branch',status:'Approved',createdBy:'owner_admin',createdAt:nowStamp()};state.transfers.push(t);applyTransfer(t);
 log('Demo Data Loaded','Loaded demo warehouse, branches, products, vendor, purchase and transfer.','DEMO','warehouse');save();render();toast('Demo data loaded. You can now test the workflows.');
}

// UI Events
function handleAction(action,el){
 const id=el.dataset.id||'';
 if(['open-user','edit-user','open-branch','edit-branch','toggle-branch'].includes(action)&&!fullAccessUser()){toast('Only Owner or Admin can manage users and branches.','error');return;}
 if(['approve-request','reject-request'].includes(action)&&!canApproveRequests()){toast('You do not have approval permission.','error');return;}
 switch(action){
  case 'toggle-sidebar':document.getElementById('sidebar')?.classList.toggle('open');break;
  case 'logout':if(confirm('Log out from this local app?')){ui.loggedIn=false;save();render();}break;
  case 'open-branch':branchModal();break; case 'edit-branch':branchModal(id);break;
  case 'toggle-branch':{const b=getBranch(id);if(!b)return;b.status=b.status==='Active'?'Inactive':'Active';log('Branch Status Changed',`${b.name} is now ${b.status}`,b.id,b.id);save();render();toast(`Branch ${b.status.toLowerCase()}.`);break;}
  case 'open-user':userModal();break;case 'edit-user':userModal(id);break;
  case 'open-category':categoryModal();break;case 'edit-category':categoryModal(id);break;case 'open-product':productModal();break;case 'edit-product':productModal(id);break;
  case 'open-vendor':vendorModal();break;case 'edit-vendor':vendorModal(id);break;case 'vendor-ledger':vendorLedgerModal(id);break;case 'open-vendor-payment':vendorPaymentModal(id);break;
  case 'open-customer':customerModal();break;case 'edit-customer':customerModal(id);break;case 'customer-ledger':customerLedgerModal(id);break;case 'open-customer-payment':customerPaymentModal(id);break;
  case 'open-purchase':purchaseModal();break;case 'view-purchase':viewPurchaseModal(id);break;case 'open-purchase-return':purchaseReturnModal();break;case 'purchase-return-from':purchaseReturnModal(id);break;
  case 'open-sale':saleModal();break;case 'view-sale':viewSaleModal(id);break;case 'open-sales-return':salesReturnModal();break;case 'sales-return-from':salesReturnModal(id);break;
  case 'open-transfer':transferModal();break;case 'open-stock-return':stockReturnModal();break;case 'open-damage-return':damageReturnModal();break;
  case 'open-payment-return':paymentReturnModal();break;case 'payment-return-from':paymentReturnModal(id);break;
  case 'open-expense':expenseModal();break;case 'expense-branch-details':expenseBranchModal(id);break;case 'expense-date-details':expenseDateModal(el.dataset.branch,el.dataset.date);break;
  case 'approval-filter':setFilter('approvals',{status:el.dataset.status});render();break;case 'view-approval':approvalPreviewModal(el.dataset.collection,id);break;case 'approve-request':confirmApprovalModal(el.dataset.collection,id,true);break;case 'reject-request':confirmApprovalModal(el.dataset.collection,id,false);break;
  case 'report-type':setFilter('reports',{reportType:el.dataset.type});render();break;
  case 'open-settlement':settlementModal();break;
  case 'view-settlement':settlementPreviewModal(id);break;
  case 'confirm-settlement':if(confirm('Confirm and lock this settlement period? No further operational entry will be allowed for this branch/date range.'))confirmSettlement(id);break;
  case 'cancel-settlement':if(confirm('Cancel this settlement draft?'))cancelSettlementDraft(id);break;
  case 'reopen-settlement':reopenSettlementModal(id);break;
  case 'export-settlement-register':exportSettlementRegister();break;
  case 'filter-today':setFilter(el.dataset.filterKey,{from:isoToday(),to:isoToday()});render();break;
  case 'filter-week':setFilter(el.dataset.filterKey,{from:startOfWeek(),to:isoToday()});render();break;
  case 'filter-month':setFilter(el.dataset.filterKey,{from:startOfMonth(),to:isoToday()});render();break;
  case 'stock-view-all':setFilter('stock',{all:true,branchId:''});render();break;
  case 'add-purchase-line':{const tb=document.getElementById('purchase-lines');if(tb){tb.insertAdjacentHTML('beforeend',purchaseLineHtml());updatePurchaseTotals();}break;}
  case 'add-sales-line':{const branch=document.querySelector('[name="branchId"]')?.value||currentUser().branchId;const tb=document.getElementById('sales-lines');if(tb){tb.insertAdjacentHTML('beforeend',salesLineHtml(branch));updateSalesTotals();}break;}
  case 'add-transfer-line':{const source=document.querySelector('[name="sourceBranchId"]')?.value||'';const tb=document.getElementById('transfer-lines');if(tb)tb.insertAdjacentHTML('beforeend',transferLineHtml(source));break;}
  case 'remove-line':{const row=el.closest('tr');const body=row?.parentElement;if(body?.children.length>1){row.remove();updatePurchaseTotals();updateSalesTotals();}else toast('At least one line is required.','warning');break;}
  case 'print-modal':printModal();break;
  case 'backup':download(`quick_refuel_wholesale_backup_${isoToday()}.json`,JSON.stringify(state,null,2));toast('Backup downloaded.');break;
  case 'load-demo':loadDemoData();break;
  case 'reset-data':if(confirm('This will permanently remove all local browser data. Continue?')){state=defaultState();ui={page:'dashboard',roleId:'owner_admin',filters:{},loggedIn:true};save();render();toast('Local data reset.');}break;
  case 'export-stock':exportRows('stock_report.csv',allStockRows().map(r=>({Product:productName(r.productId),SKU:getProduct(r.productId)?.sku||'',Branch:branchName(r.branchId),AvailableQuantity:r.qty,AverageCost:r.avg,StockValue:r.value})));break;
  case 'export-report':exportCurrentReport();break;case 'export-logs':exportRows('activity_logs.csv',state.activity.map(l=>({DateTime:l.date,User:l.userName,Role:l.userRole,Branch:branchName(l.branchId),Action:l.action,Description:l.description,Reference:l.reference})));break;
 }
}
function exportCurrentReport(){const f=defaultFilters('reports'),range=currentRange('reports'),branchId=f.branchId||'',type=f.reportType||'summary';if(type==='customer-sales')exportRows('customer_sales_report.csv',reportCustomerSales(state.sales.filter(s=>s.status==='Active'&&(!branchId||s.branchId===branchId)&&inRange(s.date,range.from,range.to))).map((r,i)=>({SL:i+1,Customer:r.c.name,Shop:r.c.shopName,Phone:r.c.phone,Branch:branchName(r.c.branchId),Salesman:getUser(r.salesmanId)?.name||'',TotalSales:r.sales,PaidAmount:r.paid,DueAmount:r.due})));else if(type==='stock')exportRows('stock_report.csv',allStockRows(branchId).map(r=>({Product:productName(r.productId),Branch:branchName(r.branchId),Quantity:r.qty,AverageCost:r.avg,StockValue:r.value})));else if(type==='expense')exportRows('expense_report.csv',state.expenses.filter(e=>e.status==='Active'&&(!branchId||e.branchId===branchId)&&inRange(e.date,range.from,range.to)).map(e=>({Date:e.date,Branch:branchName(e.branchId),Category:e.category,Description:e.description,Method:e.paymentMethod,Amount:e.amount})));else exportRows('business_summary.csv',[{From:range.from,To:range.to,Branch:branchId?branchName(branchId):'All Branches',Sales:dashboardData(branchId,range.from,range.to).salesTotal,Expenses:dashboardData(branchId,range.from,range.to).expTotal,GrossProfit:dashboardData(branchId,range.from,range.to).gross,NetProfit:dashboardData(branchId,range.from,range.to).net}]);}

document.addEventListener('click',e=>{
 const close=e.target.closest('[data-close-modal]'); if(close){closeModal();return;}
 const nav=e.target.closest('[data-nav]');if(nav){ui.page=nav.dataset.nav;save();render();return;}
 const el=e.target.closest('[data-action]');if(el){e.preventDefault();handleAction(el.dataset.action,el);}
});

document.addEventListener('change',e=>{
 const el=e.target;
 
 if(el.dataset.filterKey){ const key=el.dataset.filterKey,name=el.dataset.filterName; const v=el.value; let change={[name]:v};if(key==='stock'&&name==='branchId')change.all=false;setFilter(key,change);render();return; }
 const action=el.dataset.action;
 if(action==='settlement-branch-change'){ const expected=expectedSettlementStart(el.value)||isoToday(); const out=document.getElementById('settlement-next-start'); const from=document.querySelector('[name="from"]'); if(out)out.value=dateLabel(expected); if(from)from.value=expected; return; }
 if(action==='reload-purchase-return'){purchaseReturnModal(el.value);return;}
 if(action==='reload-sales-return'){salesReturnModal(el.value);return;}
 if(action==='reload-payment-return'){paymentReturnModal(el.value);return;}
 if(action==='vendor-payment-change'){vendorPaymentModal(el.value);return;}
 if(action==='stock-return-branch'){stockReturnModal(el.value);return;}
 if(action==='damage-return-branch'){damageReturnModal(el.value);return;}
 if(action==='stock-return-product-change'||action==='damage-return-product-change'){
   const branch=document.querySelector('[name="branchId"]')?.value||currentUser().branchId; const productId=el.value; const available=availableBranchReturnQty(branch,productId); const product=getProduct(productId); const availableField=document.getElementById('branch-return-available'); const qty=document.getElementById('branch-return-qty'); if(availableField)availableField.value=`${num(available)} ${product?.unit||''}`; if(qty){qty.max=available; if(Number(qty.value)>available)qty.value=available;} return;
 }
 if(action==='sale-branch-change'){
   const branch=el.value; const customer=document.getElementById('sale-customer'); if(customer)customer.innerHTML=customerOptions('',branch); const tb=document.getElementById('sales-lines');if(tb)tb.innerHTML=salesLineHtml(branch);updateSalesTotals();return;
 }
 if(action==='transfer-source-change'){const source=el.value;const tb=document.getElementById('transfer-lines');if(tb)tb.innerHTML=transferLineHtml(source);return;}
 if(action==='payment-branch-change'){const b=el.value;const s=document.querySelector('[name="customerId"]');if(s)s.innerHTML=customerOptions('',b);return;}
 if(el.matches('.sl-product')){const opt=el.options[el.selectedIndex];const row=el.closest('tr');const inp=row?.querySelector('.sl-price');if(inp&&!inp.value)inp.value=opt?.dataset.price||getProduct(el.value)?.defaultSellingPrice||0;updateSalesTotals();return;}
 if(el.matches('.tl-product')){const row=el.closest('tr');const cell=row?.querySelector('.available-cell');if(cell)cell.textContent=num(stockPosition(document.querySelector('[name="sourceBranchId"]')?.value||'',el.value).qty);return;}
 if(el.matches('.pl-product')){const row=el.closest('tr');const input=row?.querySelector('.pl-price');if(input&&!input.value)input.value=getProduct(el.value)?.defaultPurchasePrice||0;updatePurchaseTotals();return;}
 if(el.matches('[name="paymentType"]')){const form=el.closest('form');const paid=form?.querySelector('[name="paidAmount"]');const method=form?.querySelector('[name="paymentMethod"]');if(el.value==='Due'){paid.value=0;paid.readOnly=true;}else{paid.readOnly=false;if(el.value==='Cash'||el.value==='Bank'){method.value=el.value;}}updateSalesTotals();return;}
});
document.addEventListener('input',e=>{if(e.target.closest('.purchase-line')||e.target.matches('[name="paidAmount"]')&&document.getElementById('purchase-total'))updatePurchaseTotals();if(e.target.closest('.sales-line')||e.target.matches('[name="paidAmount"]')&&document.getElementById('sales-total'))updateSalesTotals();});

document.addEventListener('change',e=>{if(e.target.matches('[data-action="role-change"]')){const box=e.target.closest('form')?.querySelector('[data-manager-permissions]');if(box)box.classList.toggle('show',e.target.value==='Manager');return;}if(e.target.matches('input[type="file"][data-action="restore"]')){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const n=JSON.parse(reader.result);if(!n.meta||!Array.isArray(n.branches))throw new Error();state=normalizeState(n);save();render();toast('Backup restored successfully.');}catch(err){toast('Invalid backup file.','error');}};reader.readAsText(file);}});

document.addEventListener('submit',e=>{
 const form=e.target;if(!form.matches('form[data-form]'))return;e.preventDefault();
 try{
  const type=form.dataset.form,data=readForm(form);
  if(type==='temporary-login'){const next=state.users.find(u=>u.id===data.userId&&u.active!==false);if(!next)throw new Error('Choose an active user.');ui.roleId=next.id;ui.loggedIn=true;save();render();toast(`Logged in as ${next.name}.`);}
  else if(type==='branch'){createBranch({name:data.name.trim(),code:data.code.trim(),address:data.address.trim(),phone:data.phone.trim(),status:data.status,assignedSalesmanId:data.assignedSalesmanId||'',assignedManagerId:data.assignedManagerId||'',assignedAccountantId:'',notes:data.notes.trim()},form.dataset.id);}
  else if(type==='user'){const permissions=[...form.querySelectorAll('input[name="managerPermission"]:checked')].map(x=>x.value);createUser({name:data.name.trim(),email:data.email.trim(),role:data.role,branchId:data.branchId,active:data.active==='true',permissions},form.dataset.id);}
  else if(type==='category'){createCategory({name:data.name.trim(),status:data.status},form.dataset.id);}
  else if(type==='product'){if(!data.categoryId)throw new Error('Select product category.');createProduct(numberFields({name:data.name.trim(),sku:data.sku.trim(),categoryId:data.categoryId,unit:data.unit.trim(),defaultPurchasePrice:data.defaultPurchasePrice,defaultSellingPrice:data.defaultSellingPrice,lowStock:data.lowStock,status:data.status,notes:data.notes.trim()},['defaultPurchasePrice','defaultSellingPrice','lowStock']),form.dataset.id);}
  else if(type==='vendor'){createVendor(numberFields({name:data.name.trim(),phone:data.phone.trim(),contactPerson:data.contactPerson.trim(),openingBalance:data.openingBalance,address:data.address.trim(),notes:data.notes.trim()},['openingBalance']),form.dataset.id);}
  else if(type==='customer'){createCustomer(numberFields({name:data.name.trim(),shopName:data.shopName.trim(),phone:data.phone.trim(),branchId:data.branchId,creditLimit:data.creditLimit,openingDue:data.openingDue,address:data.address.trim(),notes:data.notes.trim()},['creditLimit','openingDue']),form.dataset.id);}
  else if(type==='purchase'){
    const lines=[...form.querySelectorAll('.purchase-line')].map(r=>{const productId=r.querySelector('.pl-product').value,qty=Number(r.querySelector('.pl-qty').value),unitPrice=Number(r.querySelector('.pl-price').value);return {productId,qty,unitPrice,total:qty*unitPrice};}).filter(l=>l.productId&&l.qty>0);if(!lines.length)throw new Error('Add at least one purchase line.');createPurchase({date:data.date,branchId:data.branchId||'warehouse',vendorId:data.vendorId,invoiceNo:data.invoiceNo.trim(),lines,paidAmount:Number(data.paidAmount||0),paymentMethod:data.paymentMethod,notes:data.notes.trim()});
  }
  else if(type==='purchase-return'){
    const p=state.purchases.find(x=>x.id===data.purchaseId); const lines=[...form.querySelectorAll('.purchase-return-line')].map(r=>{const productId=r.querySelector('.pr-product').value,qty=Number(r.querySelector('.pr-qty').value),sourceLineIndex=Number(r.querySelector('.pr-line-index').value),src=p.lines[sourceLineIndex],reason=r.querySelector('.pr-reason').value;return {productId,qty,sourceLineIndex,unitPrice:src.unitPrice,total:qty*src.unitPrice,reason};}).filter(l=>l.qty>0);if(!lines.length)throw new Error('Enter at least one return quantity.');createPurchaseReturn({purchaseId:data.purchaseId,date:data.date,lines,notes:data.notes.trim()});
  }
  else if(type==='sale'){
    const lines=[...form.querySelectorAll('.sales-line')].map(r=>{const productId=r.querySelector('.sl-product').value,qty=Number(r.querySelector('.sl-qty').value),unitPrice=Number(r.querySelector('.sl-price').value),discount=Number(r.querySelector('.sl-disc').value||0);return {productId,qty,unitPrice,discount,total:Math.max(0,qty*unitPrice-discount)};}).filter(l=>l.productId&&l.qty>0);if(!lines.length)throw new Error('Add at least one sales line.');let paid=Number(data.paidAmount||0),total=sum(lines,l=>l.total);if(data.paymentType==='Due')paid=0;if(data.paymentType==='Cash'||data.paymentType==='Bank')paid=total;createSale({date:data.date,branchId:data.branchId,customerId:data.customerId,invoiceNo:data.invoiceNo.trim(),paymentType:data.paymentType,paymentMethod:data.paymentMethod,paidAmount:paid,lines,notes:data.notes.trim()});
  }
  else if(type==='sales-return'){
    const sale=state.sales.find(x=>x.id===data.saleId);const lines=[...form.querySelectorAll('.sales-return-line')].map(r=>{const productId=r.querySelector('.sr-product').value,qty=Number(r.querySelector('.sr-qty').value),sourceLineIndex=Number(r.querySelector('.sr-line-index').value),unitPrice=Number(r.querySelector('.sr-price').value),cost=Number(r.querySelector('.sr-cost').value),reason=r.querySelector('.sr-reason').value;return {productId,qty,sourceLineIndex,unitPrice,cost,total:qty*unitPrice,reason};}).filter(l=>l.qty>0);if(!lines.length)throw new Error('Enter at least one return quantity.');createSalesReturn({saleId:data.saleId,date:data.date,refundMethod:data.refundMethod,lines,notes:data.notes.trim()});
  }
  else if(type==='transfer'){
    if(data.sourceBranchId===data.destinationBranchId)throw new Error('Source and destination cannot be the same.');const lines=[...form.querySelectorAll('.transfer-line')].map(r=>({productId:r.querySelector('.tl-product').value,qty:Number(r.querySelector('.tl-qty').value)})).filter(l=>l.productId&&l.qty>0);if(!lines.length)throw new Error('Add at least one transfer product.');createTransfer({date:data.date,sourceBranchId:data.sourceBranchId,destinationBranchId:data.destinationBranchId,lines,notes:data.notes.trim()});
  }
  else if(type==='stock-return'){createStockReturn({date:data.date,branchId:data.branchId,productId:data.productId,qty:Number(data.qty),reason:data.reason.trim()});}
  else if(type==='damage-return'){createDamageReturn({date:data.date,branchId:data.branchId,productId:data.productId,qty:Number(data.qty),reason:data.reason.trim(),attachment:data.attachment.trim()});}
  else if(type==='customer-payment'){createCustomerPayment({date:data.date,branchId:data.branchId,customerId:data.customerId,amount:Number(data.amount),method:data.method,paymentNo:data.paymentNo.trim(),notes:data.notes.trim()});}
  else if(type==='payment-return'){createPaymentReturn({paymentId:data.paymentId,date:data.date,amount:Number(data.amount),reason:data.reason.trim()});}
  else if(type==='vendor-payment'){createVendorPayment({vendorId:data.vendorId,date:data.date,amount:Number(data.amount),method:data.method,paymentNo:data.paymentNo.trim(),notes:data.notes.trim()});}
  else if(type==='expense'){createExpense({date:data.date,branchId:data.branchId,category:data.category,description:data.description.trim(),amount:Number(data.amount),paymentMethod:data.paymentMethod,notes:data.notes.trim(),attachment:data.attachment.trim()});}
  else if(type==='approval'){approveRequest(form.dataset.collection,form.dataset.id,form.dataset.approve==='true',data.reason.trim());}
  else if(type==='settlement-create'){createSettlement({branchId:data.branchId,from:data.from,to:data.to,notes:data.notes.trim()});}
  else if(type==='settlement-reopen'){reopenSettlement(form.dataset.id,data.reason.trim());}
  else if(type==='settings'){
    if(!fullAccessUser())throw new Error('Only Owner or Admin can change company details.');
    const warehouse=getBranch('warehouse');
    state.meta.companyName=data.companyName.trim()||state.meta.companyName;
    state.meta.companyNameArabic=data.companyNameArabic.trim();
    state.meta.address=data.address.trim(); state.meta.phone=data.phone.trim(); state.meta.email=data.email.trim();
    state.meta.crNumber=data.crNumber.trim(); state.meta.vatNumber=data.vatNumber.trim();
    state.meta.vatEnabled=data.vatEnabled==='true'; state.meta.vatRate=Number(data.vatRate||0);
    state.meta.mainBranchName=data.mainBranchName.trim()||state.meta.mainBranchName;
    if(warehouse){warehouse.name=state.meta.mainBranchName;warehouse.address=data.mainBranchAddress.trim();warehouse.phone=data.mainBranchPhone.trim();}
    state.settings.lowStockDefault=Number(data.lowStockDefault||10);
    log('Company Details Updated','Updated Owner/Admin company details and VAT option','SETTINGS','warehouse');save();render();toast('Company details saved and applied across the app.');
  }
 }catch(err){toast(err.message||'Unable to save. Check required fields.','error');}
});

// Initial render
render();
})();
