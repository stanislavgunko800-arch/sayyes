import {today} from '../public/domain.js';
import {hasPermission,actionPermissions} from '../public/access-policy.js';
export const forbidden=()=>Object.assign(Error('Недостаточно прав для этого действия'),{status:403});
export function scopedEmployees(s,p){if(p.root||p.scope?.mode==='all'||!p.scope)return new Set(s.employees.map(e=>e.id));if(p.scope.mode==='self')return new Set([p.employeeId]);return new Set(s.employees.filter(e=>p.scope.employeeIds.includes(e.id)||p.scope.positionIds.includes(e.positionId)).map(e=>e.id));}
export function cutoff(p){return !p.root&&p.scope?.historyDays?new Date(Date.parse(today())-(p.scope.historyDays-1)*86400000).toISOString().slice(0,10):'0000-01-01';}
export function visibleVisit(s,p,a){return scopedEmployees(s,p).has(a.employeeId)&&a.date>=cutoff(p);}
export function authorizeMutation(s,p,action,b){
 const required=actionPermissions(action,b);if(!required||!required.every(k=>hasPermission(p,k)))throw forbidden();
 if(p.root)return;
 const ids=scopedEmployees(s,p),dateLimit=cutoff(p),checkEmployee=id=>{if(id&&!ids.has(id))throw forbidden();},checkDate=date=>{if(date&&date<dateLimit)throw forbidden();};
 if(b.entries)for(const c of b.entries){checkEmployee(c.employeeId);checkDate(c.date);}
 if(b.cells)for(const c of b.cells){checkEmployee(c.employeeId);checkDate(c.date);}if(b.sourceEmployeeId)checkEmployee(b.sourceEmployeeId);
 if(b.employeeId)checkEmployee(b.employeeId);if(b.employeeIds)for(const id of b.employeeIds)checkEmployee(id);
 for(const key of ['date','from','to','scheduledDate'])checkDate(b[key]);
 const visitId=['status','appointment-edit','appointment-confirm'].includes(action)?b.id:b.appointmentId;
 if(visitId){const a=s.appointments.find(a=>a.id===visitId);if(!a||!visibleVisit(s,p,a))throw forbidden();}
 const orderId=['bar-order','bar-order-status','pos-split','pos-kitchen-send','pos-kitchen-ready','pos-clear','pos-fulfillment','pos-print'].includes(action)?b.id:b.orderId;
 if(orderId){const o=s.barOrders.find(o=>o.id===orderId);if(o){checkEmployee(o.employeeId);checkDate(o.date);}}
 if(action==='refund'){const a=s.sales.find(a=>a.id===b.id);if(!a)throw forbidden();checkEmployee(a.employeeId);checkDate(a.paidDate||a.date);}
 if(['employees','staff-status','staff-order'].includes(action)&&b.id)checkEmployee(b.id);
 if((p.scope?.mode!=='all'||p.scope?.historyDays)&&['import-clients','import-client-batch'].includes(action))throw forbidden();
 if(action==='employees'){
  if(!b.id&&(p.scope?.mode!=='all'||p.scope?.historyDays))throw forbidden();
  if(!hasPermission(p,'clients.contacts')){const old=s.employees.find(e=>e.id===b.id);for(const k of ['phone','email','description'])b[k]=old?.[k]||'';}
  if(!hasPermission(p,'payroll.write')){const old=s.employees.find(e=>e.id===b.id);if('commission'in b&&Number(b.commission)!==(old?.commission||0))throw forbidden();b.commission=old?.commission||0;}
 }
 // Editing shared catalogues is global; only accounts with unrestricted staff scope may do it.
 if(p.scope?.mode!=='all'&&['pos-promotion','pos-certificate','pos-client-discount','bar-account','bar-transaction','bar-finance-category','absence-type','schedule-template','position','staff-order','settings','extended-settings','workplaces','zone','booking-link','promotions','message-template'].includes(action))throw forbidden();
 if(['clients','appointments'].includes(action)&&b.clientId){const c=s.clients.find(c=>c.id===b.clientId);if(c&&!s.appointments.some(a=>a.clientId===c.id&&visibleVisit(s,p,a))&&(p.scope?.mode!=='all'||p.scope?.historyDays))throw forbidden();}
 if(action==='clients'&&b.id&&(p.scope?.mode!=='all'||p.scope?.historyDays)&&!s.appointments.some(a=>a.clientId===b.id&&visibleVisit(s,p,a)))throw forbidden();
 if(action==='sale'&&b.clientId&&(p.scope?.mode!=='all'||p.scope?.historyDays)&&!s.appointments.some(a=>a.clientId===b.clientId&&visibleVisit(s,p,a)))throw forbidden();
 // No client-supplied public-mode flags are accepted by private actions.
 delete b.publicMode;delete b.manageToken;delete b.holdToken;
}
export function projectState(s,p){
 if(p.root){const data=structuredClone(s);delete data.security;return data;}
 const allowed='employees services clients appointments schedules shifts cash advances expenses products purchases movements suppliers warehouses workplaces promotions audit categories units productTypes settings sales purchaseDocuments payouts workplaceShifts bonusLedger inventories messageTemplates outbox schedulePatterns expenseTemplates supplierOrders zones holds barOrders importBatches bookingLinks positions staffTemplates paymentMethods terminals absenceTypes barCategories barWorkshops barPacks barProductions barAccounts barTransactions barFinanceCategories posPromotions posCertificates'.split(' ');
 const data=Object.fromEntries(allowed.filter(k=>k in s).map(k=>[k,structuredClone(s[k])]));
 const can=k=>hasPermission(p,k),ids=scopedEmployees(s,p),since=cutoff(p);
 const visits=s.appointments.filter(a=>ids.has(a.employeeId)&&a.date>=since),clientIds=new Set(visits.map(a=>a.clientId));
 const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>k in o).map(k=>[k,structuredClone(o[k])]));
 data.employees=s.employees.filter(e=>ids.has(e.id)).map(e=>can('staff.read')?pick(e,['id','name','photo','role','positionId','active','onlineEnabled','serviceIds','fired','archived','notifications',...(can('clients.contacts')?['phone','email','description']:[]),...(can('payroll.read')?['commission']:[])]):pick(e,['id','name','photo','role','active','serviceIds','onlineEnabled']));
 data.appointments=can('bookings.read')||can('finance.read')||can('payroll.read')?visits.filter(a=>can('bookings.read')||['paid','refunded'].includes(a.status)).map(a=>{
  const keys=['id','employeeId','serviceId','service','date','time','start','duration','status','workplaceId','createdAt','source','saleId'];
  if(can('clients.read')||can('bookings.read'))keys.push('name','clientId');
  if(can('clients.contacts'))keys.push('note');
  if(can('bookings.read'))keys.push('price');
  if(can('finance.read'))keys.push('price','amount','paidDate','method','payments','lines','fee','discount','bonusUsed','materialCost','baseCost','promotionId','shiftId','department','orderId');
  if(can('payroll.read'))keys.push('commissionAmount','paidDate');
  const row=pick(a,keys);if(row.lines&&!can('stock.read'))row.lines=row.lines.map(l=>pick(l,['kind','itemId','name','qty','price']));return row;
 }):[];
 data.clients=can('clients.read')?s.clients.filter(c=>p.scope.mode==='all'&&!p.scope.historyDays||clientIds.has(c.id)).map(c=>pick(c,['id','name','blocked','source','tags','discountPercent',...(can('clients.contacts')?['phone','email','note','cardNumber']:[])])):[];
 data.schedules=can('schedule.read')?s.schedules.filter(g=>ids.has(g.employeeId)&&g.date>=since):[];
 data.holds=can('bookings.read')?s.holds.filter(h=>ids.has(h.employeeId)&&h.date>=since).map(h=>pick(h,['employeeId','serviceId','date','time','start','duration','expiresAt'])):[];
 data.services=s.services.map(v=>pick(v,['id','name','price','duration','active','category','employeeIds',...(can('services.read')?['family','returnDays']:[]),...(can('stock.read')?['materials','warehouseId']:[]),...(can('finance.read')?['baseCost']:[])]));
 data.sales=can('finance.read')||can('payroll.read')?s.sales.filter(a=>ids.has(a.employeeId)&&(a.paidDate||a.date)>=since).map(a=>{
  const row=can('finance.read')?structuredClone(a):pick(a,['id','employeeId','status','date','paidDate','commissionAmount']);
  if(!can('payroll.read'))delete row.commissionAmount;
  if(!can('clients.read')){delete row.clientId;row.name='Клиент скрыт';}
  if(row.lines&&!can('stock.read'))row.lines=row.lines.map(l=>pick(l,['kind','itemId','name','qty','price']));
  return row;
 }):[];
 data.barOrders=can('finance.read')||can('finance.payment')?s.barOrders.filter(o=>ids.has(o.employeeId)&&o.date>=since).map(o=>{const row=structuredClone(o);if(!can('clients.read'))delete row.clientId;if(!can('clients.contacts')){delete row.note;delete row.deliveryName;delete row.deliveryPhone;delete row.deliveryAddress;row.history=[];row.tickets=[];row.lines=row.lines.map(l=>{delete l.note;return l;});}return row;}):[];
 const gates={stock:['barCategories','barWorkshops','barPacks','barProductions','products','purchases','movements','warehouses','suppliers','productTypes','units','purchaseDocuments','inventories','supplierOrders'],payroll:['advances','payouts'],finance:['barAccounts','barTransactions','barFinanceCategories','shifts','cash','expenses','paymentMethods','terminals'],settings:['promotions','messageTemplates','outbox','bookingLinks','bonusLedger'],staff:['positions'],schedule:['schedulePatterns','staffTemplates','workplaceShifts']};
 for(const [group,keys]of Object.entries(gates))for(const key of keys){if(!can(group+'.read'))data[key]=[];else if(Array.isArray(data[key]))data[key]=data[key].filter(r=>(!r.employeeId||ids.has(r.employeeId))&&(!r.date||r.date>=since));}
 if(!can('audit.read'))data.audit=[];
 else data.audit=data.audit.filter(a=>a.at.slice(0,10)>=since).map(a=>pick(a,['id','at','action','actorId','actorName']));
 // Access restrictions on staff/history also exclude global aggregates and stock histories.
 if(p.scope.mode!=='all'||p.scope.historyDays){for(const k of ['barAccounts','barTransactions','barProductions','cash','shifts','expenses','purchases','movements','purchaseDocuments','inventories','supplierOrders','outbox','audit','bonusLedger'])data[k]=[];}
 if(!can('services.read'))data.categories=[];
 if(!can('settings.read'))data.settings=pick(s.settings,['name','address','phone','description','online','slotStep','leadHours','holdMinutes','requireConfirmation','allowClientCancel','lateCancelHours']);
 if(!can('services.write'))data.expenseTemplates=[];
 if(!can('clients.read'))data.bonusLedger=[];
 data.posPromotions=can('finance.read')||can('settings.read')?data.posPromotions:[];data.posCertificates=can('finance.settings')&&p.scope.mode==='all'&&!p.scope.historyDays?data.posCertificates:[];
 data.importBatches=[];return data;
}
