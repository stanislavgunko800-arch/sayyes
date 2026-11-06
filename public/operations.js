import {posExtend,posLog,posQuote,posNormalizeOrder,posMutation,posClock} from './pos-domain.js';
import {barExtend,barMutation,barKind,barComponents,barSaleTransactions} from './bar-domain.js';
import {expandScheduleSelection,applyScheduleEntries,normalizeSchedule,scheduleBreaks} from './schedule-engine.js';
import {uid,today,stock,cashBalance,payroll,slots,mins,mutate} from './domain.js';
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const value = (n, min=0, max=1e9) => { n=Number(n); if(!Number.isFinite(n)||n<min||n>max)throw Error('Проверьте числовые значения');return n; };
const textValue = v => { const t=String(v??'').trim();if(!t)throw Error('Заполните обязательные поля');return t; };
const dateValue = d => { if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T12:00Z').toISOString().slice(0,10)!==d)throw Error('Неверная дата');return d; };
const get = (s,k,id) => { const v=s[k].find(x=>x.id===id);if(!v)throw Error('Запись не найдена: '+k);return v; };
export function extendState(s){
 barExtend(s);
 for(const k of ['sales','purchaseDocuments','payouts','workplaceShifts','bonusLedger','inventories','messageTemplates','outbox','schedulePatterns','expenseTemplates','supplierOrders','zones','holds','barOrders','importBatches','bookingLinks','positions','staffTemplates'])s[k]??=[];
 s.paymentMethods??=[{id:'cash',name:'Наличные',kind:'cash',fee:0,active:true},{id:'card',name:'Терминал',kind:'card',fee:0,active:true},{id:'transfer',name:'Перевод',kind:'transfer',fee:0,active:true}];
 s.terminals??=[];posExtend(s);
 s.settings={holdMinutes:10,requireConfirmation:false,allowClientCancel:true,lateCancelHours:24,loyaltyActive:true,productBonusPercent:0,bonusMaxPercent:30,bonusExpiryMonths:0,familyBonus:false,familyBonusRates:{},...s.settings};
 // Preserve earned balances from earlier versions without creating them twice.
 for(const a of s.appointments)if(a.status==='paid'&&!a.saleId&&a.bonusEarned>0&&!s.bonusLedger.some(e=>e.legacyId===a.id||e.saleId===a.saleId&&a.saleId))s.bonusLedger.push({id:uid(),legacyId:a.id,clientId:a.clientId,amount:a.bonusEarned,date:a.paidDate||a.date,expires:'',reason:'Начисление по прежнему чеку'});
}
export function receipts(s){return [...s.appointments.filter(a=>!a.saleId),...s.sales];}
export function payoutTotals(s,id,from,to){return (s.payouts||[]).filter(p=>p.employeeId===id&&p.date>=from&&p.date<=to).reduce((n,p)=>n+p.amount,0);}
export function bonusBalance(s,clientId,date=today()) {return round(s.bonusLedger.filter(e=>e.clientId===clientId&&(!e.expires||e.expires>=date)).reduce((n,e)=>n+e.amount,0));}
function consume(s,productId,warehouseId,qty,reason,documentId){
 get(s,'products',productId);get(s,'warehouses',warehouseId);qty=value(qty,0.000001);
 if(stock(s,productId,warehouseId)+1e-8<qty)throw Error('Недостаточно товара: '+get(s,'products',productId).name);
 let left=qty,cost=0;const allocations=[];
 for(const lot of s.purchases.filter(p=>p.productId===productId&&(p.locations[warehouseId]||0)>0).sort((a,b)=>a.date.localeCompare(b.date))){
  const used=Math.min(lot.locations[warehouseId],left);lot.locations[warehouseId]-=used;lot.remaining-=used;left-=used;cost+=used*lot.cost;allocations.push({lotId:lot.id,warehouseId,qty:used});if(left<1e-8)break;
 }
 if(left>1e-8)throw Error('Остатки партий не совпадают с журналом');
 s.movements.push({id:uid(),date:today(),productId,warehouseId,qty:-qty,reason,documentId});return {cost,allocations};
}
function receive(s,b,documentId){
 get(s,'products',b.productId);get(s,'warehouses',b.warehouseId);
 const qty=value(b.qty,0.000001),cost=value(b.cost),date=dateValue(b.date),expires=b.expires?dateValue(b.expires):'';
 const lot={id:uid(),documentId,productId:b.productId,warehouseId:b.warehouseId,supplierId:b.supplierId||'',date,expires,qty,remaining:qty,cost,locations:{[b.warehouseId]:qty}};
 s.purchases.push(lot);s.movements.push({id:uid(),documentId,date,productId:b.productId,warehouseId:b.warehouseId,qty,reason:'Закупка'});return lot;
}
function moneyOut(s,amount,reason,method){
 if(method==='cash'){const sh=s.shifts.find(x=>!x.closedAt);if(!sh)throw Error('Откройте кассовую смену');if(cashBalance(s,sh)+1e-8<amount)throw Error('Недостаточно наличных');s.cash.push({id:uid(),shiftId:sh.id,date:today(),amount:-amount,reason});}
 else if(method!=='transfer')throw Error('Выберите наличные или перевод');
}
function notification(s,event,a){const template=s.messageTemplates.find(t=>t.event===event&&t.active);if(!template)return;const vars={client:a.name,service:a.service,date:a.date,time:a.time,salon:s.settings.name};const body=template.body.replace(/\{(\w+)\}/g,(all,k)=>vars[k]??all);s.outbox.push({id:uid(),date:today(),event,appointmentId:a.id,body,status:'Не отправлено — канал не подключён'});}
export function extendedMutation(s,action,b){
 const date=today(),id=uid();
 if(posMutation(s,action,b,{uid}))return true;
 if(barMutation(s,action,b,{uid,today,consume,receive}))return true;
 if(action==='schedule-grid'){
  if(!Array.isArray(b.entries)||!b.entries.length||b.entries.length>3660)throw Error('Выберите от 1 до 3660 дней сотрудников');
  for(const row of b.entries){const e=get(s,'employees',row.employeeId);if(e.fired||e.archived)throw Error('Сотрудник уволен или в архиве');}
  applyScheduleEntries(s,b.entries,b.allowConflicts===true);
 }else if(action==='schedule-selection'){
  applyScheduleEntries(s,expandScheduleSelection(s,b),b.allowConflicts===true);
 }else if(action==='schedule-copy'){
  const source=get(s,'employees',b.sourceEmployeeId);dateValue(b.from);dateValue(b.to);const days=(Date.parse(b.to)-Date.parse(b.from))/86400000+1;
  if(days<1||days>366||!Array.isArray(b.employeeIds)||!b.employeeIds.length||days*b.employeeIds.length>3660)throw Error('Выберите сотрудников и период до 366 дней');
  const entries=[];for(const key of new Set(b.employeeIds)){const e=get(s,'employees',key);if(e.fired||e.archived||key===source.id)throw Error('Выберите другого действующего сотрудника');for(let i=0;i<days;i++){const date=new Date(Date.parse(b.from)+i*86400000).toISOString().slice(0,10),g=s.schedules.find(g=>g.employeeId===source.id&&g.date===date)||{start:'10:00',end:'20:00',off:false};entries.push({...g,employeeId:key,date,breaks:b.includeBreaks===true?scheduleBreaks(g):[],breakStart:'',breakEnd:''});}}
  applyScheduleEntries(s,entries,b.allowConflicts===true);
 }else if(action==='schedule-template'){
  const config={mode:b.mode||'range',interval:Number(b.interval||1),unit:b.unit||'days',onDays:Number(b.onDays||2),offDays:Number(b.offDays||2),weekdays:b.weekdays||[],start:b.start,end:b.end,breaks:b.breaks||[],typeId:b.typeId||'work'};
  if(!s.employees.length)throw Error('Сначала добавьте сотрудника');const entries=expandScheduleSelection(s,{...config,cells:[{employeeId:s.employees.find(e=>!e.fired&&!e.archived)?.id,date}]});for(const row of entries)normalizeSchedule(s,row);
  const entry={...config,id:b.id||id,name:textValue(b.name)};if(s.staffTemplates.some(t=>t.id!==entry.id&&t.name.toLowerCase()===entry.name.toLowerCase()))throw Error('Шаблон с таким именем уже существует');if(b.id)Object.assign(get(s,'staffTemplates',b.id),entry);else s.staffTemplates.push(entry);
 }else if(action==='absence-type'){
  const entry={id:b.id||id,name:textValue(b.name),color:String(b.color||'#e6e8e5'),system:false};if(!/^#[0-9a-f]{6}$/i.test(entry.color))throw Error('Выберите цвет');if(s.absenceTypes.some(t=>t.id!==entry.id&&t.name.toLowerCase()===entry.name.toLowerCase()))throw Error('Такой тип уже существует');if(b.id){const old=get(s,'absenceTypes',b.id);if(old.system)throw Error('Системный тип нельзя изменить');Object.assign(old,entry);}else s.absenceTypes.push(entry);
 }else if(action==='position'){
  const name=textValue(b.name);if(s.positions.some(p=>p.id!==b.id&&p.name.toLowerCase()===name.toLowerCase()))throw Error('Такая должность уже существует');const entry={id:b.id||id,name,description:String(b.description||'')};if(b.id)Object.assign(get(s,'positions',b.id),entry);else s.positions.push(entry);
 }else if(action==='staff-order'){
  const index=s.employees.findIndex(e=>e.id===b.id),step=Number(b.direction);if(index<0||![-1,1].includes(step))throw Error('Проверьте порядок');const target=index+step;if(target>=0&&target<s.employees.length)[s.employees[index],s.employees[target]]=[s.employees[target],s.employees[index]];
 }else if(action==='staff-status'){
  const e=get(s,'employees',b.id);if(!['fire','archive','restore'].includes(b.status))throw Error('Неверный статус');
  if(b.status!=='restore'&&s.appointments.some(a=>a.employeeId===e.id&&a.date>=date&&['pending','booked'].includes(a.status)))throw Error('Сначала перенесите или отмените будущие записи сотрудника');
  if(b.status==='restore'){e.fired=false;e.archived=false;e.active=true;e.restoredAt=new Date().toISOString();}else {e.active=false;e[b.status==='fire'?'fired':'archived']=true;e.statusChangedAt=new Date().toISOString();}
 }else if(action==='staff-schedule'){
  if(!Array.isArray(b.employeeIds)||!b.employeeIds.length||b.employeeIds.length>100)throw Error('Выберите сотрудников');dateValue(b.from);dateValue(b.to);const count=Math.round((Date.parse(b.to)-Date.parse(b.from))/86400000)+1;if(count<1||count>366)throw Error('Период от 1 до 366 дней');
  const mode=b.mode||'range';if(!['range','weekdays','cycle','off'].includes(mode))throw Error('Неверный шаблон');const on=value(b.onDays||2,1,31),off=value(b.offDays||2,1,31);if(!Number.isInteger(on)||!Number.isInteger(off))throw Error('Дни должны быть целыми');
  if(mode==='weekdays'&&(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.some(d=>!Number.isInteger(Number(d))||d<0||d>6)))throw Error('Выберите дни недели');
  for(const key of new Set(b.employeeIds)){const e=get(s,'employees',key);if(e.fired||e.archived)throw Error('Сотрудник уволен или в архиве');for(let i=0;i<count;i++){const date=new Date(Date.parse(b.from)+i*86400000).toISOString().slice(0,10),weekday=new Date(date+'T12:00Z').getUTCDay();mutate(s,'schedule',{employeeId:key,date,start:b.start||'10:00',end:b.end||'20:00',breakStart:b.breakStart||'',breakEnd:b.breakEnd||'',off:mode==='off'||mode==='weekdays'&&!b.weekdays.map(Number).includes(weekday)||mode==='cycle'&&i%(on+off)>=on});}}
  if(b.saveAs)s.staffTemplates.push({id,name:textValue(b.saveAs),mode,start:b.start,end:b.end,breakStart:b.breakStart||'',breakEnd:b.breakEnd||'',onDays:on,offDays:off,weekdays:b.weekdays||[]});
 }else if(action==='booking-link'){
  if(b.serviceId)get(s,'services',b.serviceId);if(b.employeeId)get(s,'employees',b.employeeId);
  const entry={id:b.id||id,name:textValue(b.name),serviceId:b.serviceId||'',employeeId:b.employeeId||'',source:String(b.source||'Онлайн'),active:b.active!==false};
  if(b.id)Object.assign(get(s,'bookingLinks',b.id),entry);else s.bookingLinks.push(entry);
 }else if(action==='bar-order'){
  const orderId=textValue(b.id),existing=s.barOrders.find(o=>o.id===orderId);
  if(existing&&(!['open','ready'].includes(existing.status)||existing.version!==Number(b.version)))throw Error('Заказ изменён или закрыт. Откройте его заново');
  if(!existing&&Number(b.version||0)!==0)throw Error('Заказ не найден');
  if(!Array.isArray(b.lines)||b.lines.length>100)throw Error('Не более 100 позиций в заказе');
  const lines=b.lines.map(l=>{const p=get(s,'products',l.itemId);if(p.active===false||!['product','dish'].includes(barKind(p)))throw Error('Позиция недоступна в меню');const modifierId=l.modifierId||'',mod=modifierId?(p.modifiers||[]).find(m=>m.id===modifierId):null;if(modifierId&&!mod)throw Error('Модификатор не найден');const prior=existing?.lines.find(old=>l.id?old.id===l.id:old.itemId===p.id&&(old.modifierId||'')===modifierId);if(prior&&l.qty<(prior.sentQty||0))throw Error('Нельзя уменьшить количество отправленных блюд. Закройте заказ без оплаты с причиной.');if(prior&&(prior.itemId!==p.id||(prior.modifierId||'')!==modifierId))throw Error('Нельзя заменить позицию заказа');const course=value(l.course||1,1,20);if(!Number.isInteger(course))throw Error('Курс подачи должен быть целым');return {id:prior?.id||uid(),sentQty:prior?.sentQty||0,course,note:String(l.note||'').slice(0,1000),workshopId:prior?.workshopId??p.workshopId??'',kind:'product',itemId:p.id,modifierId,name:p.name+(mod?' · '+mod.name:''),qty:value(l.qty,.001,100000),price:prior?.price??(p.price+(mod?.price||0)),recipe:prior?.recipe??barComponents(p,modifierId),prepared:prior?.prepared??(barKind(p)==='dish'),category:p.category,noDiscount:p.noDiscount===true};});
  if(existing?.lines.some(l=>l.sentQty>0&&!lines.some(n=>n.id===l.id)))throw Error('Нельзя удалить отправленное блюдо');if(new Set(lines.map(l=>l.id)).size!==lines.length)throw Error('Позиция повторяется');
  if(b.clientId)get(s,'clients',b.clientId);if(b.employeeId)get(s,'employees',b.employeeId);get(s,'warehouses',b.warehouseId);
  if(b.workplaceId)get(s,'workplaces',b.workplaceId);
  const extras=posNormalizeOrder(s,b,existing,uid);const splitRoot=o=>{const seen=new Set();while(o?.splitFrom&&!seen.has(o.id)){seen.add(o.id);const parent=s.barOrders.find(p=>p.id===o.splitFrom);if(!parent)break;o=parent;}return o?.id;};if(b.workplaceId&&s.barOrders.some(o=>o.id!==orderId&&o.workplaceId===b.workplaceId&&['open','ready'].includes(o.status)&&!(existing&&splitRoot(o)===splitRoot(existing))))throw Error('Стол уже занят. Откройте существующий заказ');
  const entry={...extras,history:existing?.history||[],tickets:existing?.tickets||[],fulfillmentStatus:existing?.fulfillmentStatus||'new',id:orderId,number:existing?.number||s.barOrders.length+1,date:existing?.date||date,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),version:(existing?.version||0)+1,status:existing?.status||'open',lines,clientId:b.clientId||'',employeeId:b.employeeId||'',operatorId:b._actor?.id||existing?.operatorId||'',operatorName:b._actor?.name||existing?.operatorName||'Администратор',warehouseId:b.warehouseId,workplaceId:b.workplaceId||'',note:String(b.note||'').slice(0,2000),amount:round(lines.reduce((n,l)=>n+l.qty*l.price,0))};
  entry.amount=posQuote(s,entry).total;posLog(entry,existing?'edited':'created',b,'Состав: '+lines.map(l=>l.name+' × '+l.qty).join(', ')+'; стол: '+(entry.workplaceId?get(s,'workplaces',entry.workplaceId).name:'без стола')+'; гостей: '+entry.guests+'; сотрудник: '+entry.operatorName+'; обслуживание: '+entry.servicePercent+'%');if(existing)Object.assign(existing,entry);else s.barOrders.push(entry);
 }else if(action==='bar-order-status'){
  const o=get(s,'barOrders',b.id);if(!['open','ready'].includes(o.status)||o.version!==Number(b.version))throw Error('Заказ изменён или закрыт');
  if(!['open','ready','cancelled'].includes(b.status))throw Error('Неверный статус заказа');if(b.status==='cancelled'&&o.lines.some(l=>l.sentQty>0))throw Error('Блюда отправлены. Используйте закрытие без оплаты');o.status=b.status;o.version++;o.updatedAt=new Date().toISOString();posLog(o,b.status,b,String(b.reason||''));if(b.status==='cancelled'){o.cancelReason=textValue(b.reason);o.closedAt=new Date().toISOString();}
 }else if(action==='import-client-batch'){
  if(!Array.isArray(b.clients)||!b.clients.length||b.clients.length>200)throw Error('От 1 до 200 строк за один импорт');
  const batch={id,date,source:String(b.source||'CSV').slice(0,100),fileName:String(b.fileName||'').slice(0,200),added:0,skipped:0};
  const normalize=p=>String(p||'').replace(/[^0-9]/g,'');
  for(const row of b.clients){const name=textValue(row.name),phone=normalize(row.phone);if(!/^\d{7,15}$/.test(phone))throw Error('Некорректный телефон: '+name);if(s.clients.some(c=>normalize(c.phone)===phone)){batch.skipped++;continue;}
   s.clients.push({id:uid(),name,phone:'+'+phone,email:String(row.email||''),note:String(row.note||''),tags:'',source:batch.source,blocked:false,importBatchId:id});batch.added++;
  }s.importBatches.push(batch);
 }else if(action==='hold-slot'){
  if(!/^[a-f0-9-]{36}$/.test(b.token||''))throw Error('Неверный код брони');dateValue(b.date);
  s.holds=s.holds.filter(h=>h.expiresAt>Date.now());
  if(!slots(s,b.employeeId,b.serviceId,b.date,true,b.token).includes(b.time))throw Error('Это время уже занято');
  const service=get(s,'services',b.serviceId);s.holds=s.holds.filter(h=>h.token!==b.token);s.holds.push({token:b.token,employeeId:b.employeeId,serviceId:b.serviceId,date:b.date,time:b.time,start:mins(b.time),duration:service.duration,expiresAt:Date.now()+s.settings.holdMinutes*60000});
 }else if(action==='cancel-booking'){
  if(!/^[a-f0-9-]{36}$/.test(b.token||''))throw Error('Ссылка недействительна');const a=s.appointments.find(a=>a.manageToken===b.token);if(!a)throw Error('Запись не найдена');if(!s.settings.allowClientCancel)throw Error('Для отмены свяжитесь с салоном');if(!['pending','booked'].includes(a.status))throw Error('Запись уже закрыта');
  a.status='cancelled';a.cancelledAt=new Date().toISOString();a.lateCancellation=new Date(a.date+'T'+a.time+':00+04:00').getTime()-Date.now()<s.settings.lateCancelHours*3600000;notification(s,'cancelled',a);
 }else if(action==='schedule-pattern'){
  get(s,'employees',b.employeeId);const weekdays=(b.weekdays||[]).map(Number);if(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Выберите дни недели');
  const start=mins(b.start),end=mins(b.end);if(end<=start)throw Error('Проверьте рабочие часы');dateValue(b.from);dateValue(b.to);if(b.to<b.from||(new Date(b.to)-new Date(b.from))/86400000>366)throw Error('Период до 366 дней');
  if(!!b.breakStart!==!!b.breakEnd||b.breakStart&&(mins(b.breakStart)<start||mins(b.breakEnd)>end||mins(b.breakEnd)<=mins(b.breakStart)))throw Error('Проверьте перерыв');
  for(let d=new Date(b.from+'T12:00Z');d.toISOString().slice(0,10)<=b.to;d.setUTCDate(d.getUTCDate()+1)){
   if(!weekdays.includes(d.getUTCDay()))continue;const date=d.toISOString().slice(0,10),g={employeeId:b.employeeId,date,start:b.start,end:b.end,off:!!b.off,breakStart:b.breakStart||'',breakEnd:b.breakEnd||''};
   if(s.appointments.some(a=>a.employeeId===b.employeeId&&a.date===date&&!['cancelled','refunded'].includes(a.status)&&(g.off||a.start<start||a.start+a.duration>end||g.breakStart&&a.start<mins(g.breakEnd)&&a.start+a.duration>mins(g.breakStart))))throw Error('График конфликтует с визитом: '+date);
   s.schedules=s.schedules.filter(x=>x.employeeId!==b.employeeId||x.date!==date);s.schedules.push(g);
  }s.schedulePatterns.push({id,...b});
 }else if(action==='expense-template'){
  if(!Array.isArray(b.lines)||!b.lines.length)throw Error('Добавьте расходы');const lines=b.lines.map(l=>({name:textValue(l.name),amount:value(l.amount)})),entry={id:b.id||id,name:textValue(b.name),lines,total:round(lines.reduce((n,l)=>n+l.amount,0)),isDefault:!!b.isDefault};
  if(entry.isDefault)for(const t of s.expenseTemplates)t.isDefault=false;if(b.id)Object.assign(get(s,'expenseTemplates',b.id),entry);else s.expenseTemplates.push(entry);
 }else if(action==='apply-expense-template'){
  const template=get(s,'expenseTemplates',b.templateId);if(!Array.isArray(b.serviceIds)||!b.serviceIds.length)throw Error('Выберите услуги');for(const key of b.serviceIds){const service=get(s,'services',key);service.baseCost=template.total;service.expenseTemplateId=template.id;}
 }else if(action==='supplier-order'){
  get(s,'suppliers',b.supplierId);if(!Array.isArray(b.lines)||!b.lines.length)throw Error('Добавьте товары');const lines=b.lines.map(l=>({productId:get(s,'products',l.productId).id,qty:value(l.qty,.001)}));s.supplierOrders.push({id,date,supplierId:b.supplierId,note:String(b.note||''),lines,status:'Черновик — не отправлен'});
 }else if(action==='archive-product'){
  get(s,'products',b.id).active=!b.archived;
 }else if(action==='zone'){
  const entry={id:b.id||id,name:textValue(b.name)};if(b.id)Object.assign(get(s,'zones',b.id),entry);else s.zones.push(entry);
 }else if(action==='payment-method'||action==='terminal'){
  const key=action==='terminal'?'terminals':'paymentMethods',v={id:b.id||id,name:textValue(b.name),fee:value(b.fee,0,100),active:b.active!==false};
  if(key==='paymentMethods'){if(!['cash','card','transfer','certificate','other'].includes(b.kind))throw Error('Неизвестный тип оплаты');v.kind=b.kind;}
  else {v.bank=String(b.bank||'');v.methodId=get(s,'paymentMethods',b.methodId).id;}
  if(b.id)Object.assign(get(s,key,b.id),v);else s[key].push(v);
 }else if(action==='purchase-document'){
  if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)throw Error('Добавьте от 1 до 100 позиций');
  if(b.supplierId)get(s,'suppliers',b.supplierId);get(s,'warehouses',b.warehouseId);dateValue(b.date);
  const doc={id,date:b.date,supplierId:b.supplierId||'',warehouseId:b.warehouseId,number:String(b.number||''),note:String(b.note||''),lines:[],amount:0};
  for(const l of b.lines){const packs=value(l.packs,0.001),units=value(l.units,0.001),qty=packs*units,price=value(l.cost),cost=l.priceMode==='pack'?price/units:price;const lot=receive(s,{...l,qty,cost,date:b.date,warehouseId:b.warehouseId,supplierId:b.supplierId},id);doc.lines.push({...l,lotId:lot.id,qty,cost});doc.amount+=qty*cost;}
  doc.amount=round(doc.amount);s.purchaseDocuments.push(doc);
 }else if(action==='writeoff'){
  consume(s,b.productId,b.warehouseId,value(b.qty,0.001),'Списание: '+textValue(b.reason),id);
 }else if(action==='inventory-count'){
  const warehouseId=get(s,'warehouses',b.warehouseId).id,productId=get(s,'products',b.productId).id,actual=value(b.actual),expected=stock(s,productId,warehouseId),difference=actual-expected,reason=textValue(b.reason);
  if(difference<0)consume(s,productId,warehouseId,-difference,'Инвентаризация: '+reason,id);
  if(difference>0)receive(s,{productId,warehouseId,qty:difference,cost:value(b.cost),date},id);
  s.inventories.push({id,date,warehouseId,productId,actual,expected,difference,reason});
 }else if(action==='workplace-shift'){
  const workplaceId=get(s,'workplaces',b.workplaceId).id,employeeId=get(s,'employees',b.employeeId).id,start=dateValue(b.date),count=b.week?7:1;
  for(let i=0;i<count;i++){const d=new Date(start+'T12:00Z');d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);if(s.workplaceShifts.some(x=>x.date===date&&x.employeeId===employeeId&&x.workplaceId!==workplaceId))throw Error('Мастер уже назначен на другое место: '+date);s.workplaceShifts=s.workplaceShifts.filter(x=>x.date!==date||x.workplaceId!==workplaceId);s.workplaceShifts.push({id:uid(),date,workplaceId,employeeId});}
 }else if(action==='appointment-edit'){
  const a=get(s,'appointments',b.id);if(!['pending','booked'].includes(a.status))throw Error('Закрытый визит нельзя перенести');
  const copy={...s,appointments:s.appointments.filter(x=>x.id!==a.id)};dateValue(b.date);
  if(!slots(copy,b.employeeId,b.serviceId,b.date).includes(b.time))throw Error('Время недоступно');
  const service=get(s,'services',b.serviceId),start=mins(b.time);
  if(b.workplaceId){get(s,'workplaces',b.workplaceId);if(copy.appointments.some(x=>x.workplaceId===b.workplaceId&&x.date===b.date&&x.status!=='cancelled'&&start<x.start+x.duration&&start+service.duration>x.start))throw Error('Рабочее место занято');}
  Object.assign(a,{employeeId:b.employeeId,serviceId:service.id,service:service.name,price:a.serviceId===service.id?a.price:service.price,duration:service.duration,date:b.date,time:b.time,start,workplaceId:b.workplaceId||'',note:String(b.note||'')});notification(s,'moved',a);
 }else if(action==='appointment-confirm'){
  const a=get(s,'appointments',b.id);if(a.status!=='pending')throw Error('Запись не ожидает подтверждения');a.status='booked';notification(s,'confirmed',a);
 }else if(action==='payout'){
  get(s,'employees',b.employeeId);dateValue(b.from);dateValue(b.to);if(b.from>b.to)throw Error('Проверьте период');const due=Math.min(payroll(s,b.employeeId,b.from,b.to).due,payroll(s,b.employeeId,'0000-01-01','9999-12-31').due);
  const amount=value(b.amount,0.01);if(amount>due+1e-8)throw Error('Сумма превышает остаток зарплаты за период');moneyOut(s,amount,'Зарплата',b.method);s.payouts.push({id,date,employeeId:b.employeeId,amount,from:b.from,to:b.to,method:b.method});
 }else if(action==='sale'||action==='pos-close'){
  const closing=action==='pos-close';if(closing&&!['guest-left','house','staff-error'].includes(b.reason))throw Error('Выберите причину закрытия');
  const order=b.orderId?get(s,'barOrders',b.orderId):null;if(closing&&!order)throw Error('Выберите заказ');const quote=order?posQuote(s,order):null;
  if(order){if(!['open','ready'].includes(order.status)||order.version!==Number(b.orderVersion))throw Error('Заказ уже изменён или оплачен');b={...b,lines:order.lines,clientId:order.clientId,employeeId:order.employeeId,warehouseId:order.warehouseId,workplaceId:order.workplaceId,appointmentId:'',discountMode:'amount',discount:closing?quote.gross:quote.discount,promotionId:'',bonusUsed:0,payments:closing?[]:b.payments};}
  const appointment=b.appointmentId?get(s,'appointments',b.appointmentId):null;
  if(appointment&&appointment.status!=='booked')throw Error('Сначала подтвердите запись; оплаченный визит нельзя оплатить повторно');
  const clientId=appointment?.clientId||b.clientId||'';if(clientId)get(s,'clients',clientId);
  const employeeId=appointment?.employeeId||b.employeeId;const employee=order?{commission:0}:get(s,'employees',employeeId);
  const input=appointment?[{kind:'service',itemId:appointment.serviceId,qty:1,price:appointment.price},...(b.lines||[])]:b.lines;
  if(!Array.isArray(input)||!input.length||input.length>100)throw Error('Добавьте позиции чека');
  const sh=s.shifts.find(x=>!x.closedAt);if(!sh)throw Error('Откройте кассовую смену');
  const lines=[];let gross=0,materialCost=0,baseCost=0;
  for(const item of input){if(!['service','product'].includes(item.kind))throw Error('Неверный тип позиции');const p=get(s,item.kind==='service'?'services':'products',item.itemId);if(p.active===false)throw Error('Позиция выключена');const qty=value(item.qty,0.001);if(item.kind==='service'&&!Number.isInteger(qty))throw Error('Количество услуг должно быть целым');
   const price=appointment&&lines.length===0?appointment.price:order?item.price:p.price,warehouseId=b.warehouseId||'main',allocations=[];let cost=0;
   if(item.kind==='product'){const prepared=order?item.prepared:barKind(p)==='dish',recipe=order?item.recipe||[]:barComponents(p);if(!prepared){const used=consume(s,p.id,warehouseId,qty,'Продажа',id);cost+=used.cost;allocations.push(...used.allocations);}for(const r of recipe){const used=consume(s,r.productId,warehouseId,qty*r.qty,'Продажа: '+p.name,id);cost+=used.cost;allocations.push(...used.allocations.map(a=>({...a,returnable:false})));}}
   else {for(const m of p.materials){const used=consume(s,m.productId,p.warehouseId||'main',qty*m.qty,'Услуга: '+p.name,id);cost+=used.cost*(get(s,'products',m.productId).lossFactor||1);allocations.push(...used.allocations);}baseCost+=qty*p.baseCost;}
   materialCost+=cost;gross+=qty*price;lines.push({kind:item.kind,itemId:p.id,name:order?item.name:p.name,qty,price,cost,allocations,category:p.category,prepared:item.kind==='product'&&(order?item.prepared:barKind(p)==='dish'),noDiscount:item.kind==='product'&&(order?item.noDiscount:p.noDiscount===true)});
  }
  gross=round(gross);const discountBase=lines.filter(l=>!l.noDiscount).reduce((n,l)=>n+l.qty*l.price,0);let discount=value(b.discount||0);if(b.discountMode!=='amount'){value(discount,0,100);discount=round(discountBase*discount/100);}if(!b.promotionId&&appointment?.promotionId)b.promotionId=appointment.promotionId;if(b.promotionId){const promo=get(s,'promotions',b.promotionId);if(!promo.active||date<promo.start||date>promo.end)throw Error('Акция не действует');discount=round(discountBase*promo.discount/100);}if(!closing&&discount>discountBase)throw Error('Скидка больше суммы позиций, участвующих в скидках');
  const serviceAmount=order&&!closing?quote.serviceAmount:0;const afterDiscount=round(gross-discount+serviceAmount),bonusUsed=value(b.bonusUsed||0);if(bonusUsed&&!clientId)throw Error('Выберите клиента для бонусов');
  if(bonusUsed&&(!s.settings.loyaltyActive||bonusUsed>round(afterDiscount*s.settings.bonusMaxPercent/100)))throw Error('Превышен лимит оплаты бонусами');
  if(bonusUsed){const c=get(s,'clients',clientId),ids=s.settings.familyBonus&&c.familyId?s.clients.filter(x=>x.familyId===c.familyId).map(x=>x.id):[clientId];let left=bonusUsed;
   for(const owner of ids){const available=Math.max(0,bonusBalance(s,owner)),use=Math.min(left,available);if(use){
    // Debits inherit the source credit expiry, so expiration cannot create a negative balance.
    let needed=use;const credits=s.bonusLedger.filter(e=>e.clientId===owner&&e.amount>0&&(!e.expires||e.expires>=date)).sort((a,b)=>(a.expires||'9999').localeCompare(b.expires||'9999'));
    for(const credit of credits){const used=-s.bonusLedger.filter(e=>e.creditId===credit.id).reduce((n,e)=>n+e.amount,0),take=Math.min(needed,Math.max(0,credit.amount-used));if(take){s.bonusLedger.push({id:uid(),clientId:owner,creditId:credit.id,saleId:id,date,expires:credit.expires,amount:-take,reason:'Оплата бонусами'});needed-=take;}if(needed<1e-8)break;}left-=use;
   }if(left<1e-8)break;}if(left>1e-8)throw Error('Недостаточно бонусов');
  }
  const amount=round(afterDiscount-bonusUsed);for(const line of lines){const net=line.qty*line.price-(line.noDiscount?0:discountBase?line.qty*line.price/discountBase*discount:0);line.netAmount=gross-discount>0?net/(gross-discount)*amount:0;}if(!Array.isArray(b.payments))throw Error('Укажите оплаты');let total=0,fee=0,cash=0;const payments=[];
  for(const payment of b.payments){const method=get(s,'paymentMethods',payment.methodId);if(!method.active)throw Error('Способ оплаты выключен');const part=value(payment.amount,0.01);let rate=method.fee,terminal=null;if(payment.terminalId){terminal=get(s,'terminals',payment.terminalId);if(!terminal.active||terminal.methodId!==method.id)throw Error('Терминал не соответствует способу оплаты');rate=terminal.fee;}
   total+=part;fee+=round(part*rate/100);if(method.kind==='cash')cash+=part;payments.push({methodId:method.id,method:method.name,kind:method.kind,amount:part,fee:round(part*rate/100),terminalId:terminal?.id||'',...(method.kind==='certificate'?{certificateId:(()=>{const c=s.posCertificates.find(c=>c.code===String(payment.certificateCode||'').trim());if(!c||c.expires&&c.expires<date||c.balance+1e-8<part)throw Error('Сертификат недействителен или недостаточно остатка');c.balance=round(c.balance-part);c.history.push({saleId:id,at:new Date().toISOString(),amount:-part});return c.id;})()}: {})});
  }
  if(Math.abs(round(total)-amount)>0.001)throw Error('Сумма оплат должна равняться итогу чека: '+amount+' ₾');
  const cashReceived=closing?0:value(b.cashReceived??cash,cash),change=round(cashReceived-cash);
  let earned=0;if(clientId&&s.settings.loyaltyActive){for(const line of lines){const family=line.kind==='service'?get(s,'services',line.itemId).family:'';const percent=line.kind==='product'?s.settings.productBonusPercent:(s.settings.familyBonusRates[family]??s.settings.loyaltyPercent);earned+=gross?line.qty*line.price/gross*amount*percent/100:0;}earned=round(earned);if(earned){let expires='';if(s.settings.bonusExpiryMonths){const d=new Date(date+'T12:00Z');d.setUTCMonth(d.getUTCMonth()+s.settings.bonusExpiryMonths);expires=d.toISOString().slice(0,10);}s.bonusLedger.push({id:uid(),clientId,saleId:id,date,expires,amount:earned,reason:'Начисление по чеку'});}}
  let commissionAmount=0;for(const line of lines){line.commissionRate=order?0:employee.commissionRates?.[line.kind+':'+line.itemId]??employee.commission;line.commissionBase=round(line.netAmount);line.commissionAmount=round(line.netAmount*line.commissionRate/100);commissionAmount+=line.commissionAmount;}commissionAmount=round(commissionAmount);
  const sale={id,soldAt:new Date().toISOString(),orderId:order?.id||'',operatorId:order?.operatorId||'',operatorName:order?.operatorName||'',cashReceived,change,serviceAmount,closeReason:closing?b.reason:'',department:order?'bar':appointment?'salon':'general',status:closing?'written-off':'paid',date,paidDate:date,time:'',clientId,name:clientId?get(s,'clients',clientId).name:'Без клиента',employeeId,service:lines.map(l=>l.name).join(', '),price:gross,amount,discount,bonusUsed,bonusEarned:earned,materialCost:round(materialCost),baseCost:round(baseCost),commissionAmount,fee:round(fee),lines,payments,method:payments.map(p=>p.method).join(' + '),shiftId:sh.id,appointmentId:appointment?.id||'',workplaceId:appointment?.workplaceId||b.workplaceId||'',promotionId:b.promotionId||''};
  if(order){order.status=closing?'written-off':'paid';order.saleId=id;order.closedAt=new Date().toISOString();order.version++;posLog(order,closing?'closed-without-payment':'paid',b,closing?b.reason:'Оплачено '+amount+' ₾');}s.sales.push(sale);if(order)barSaleTransactions(s,sale);if(cash)s.cash.push({id:uid(),shiftId:sh.id,date,amount:round(cash),reason:'Чек '+id,saleId:id});if(appointment)Object.assign(appointment,{...sale,id:appointment.id,date:appointment.date,time:appointment.time,saleId:id});
 }else if(action==='refund'){
  const sale=get(s,'sales',b.id);if(sale.status!=='paid')throw Error('Чек уже возвращён');textValue(b.reason);
  if(s.bonusLedger.some(e=>e.creditId&&s.bonusLedger.some(c=>c.id===e.creditId&&c.saleId===sale.id)))throw Error('Начисленные баллы уже использованы; сначала верните связанный чек');
  for(const payment of sale.payments.filter(p=>p.certificateId)){const c=get(s,'posCertificates',payment.certificateId);c.balance=round(c.balance+payment.amount);c.history.push({saleId:sale.id,at:new Date().toISOString(),amount:payment.amount,reason:'refund'});}
  const cash=sale.payments.filter(p=>p.kind==='cash').reduce((n,p)=>n+p.amount,0);if(cash)moneyOut(s,cash,'Возврат чека '+sale.id,'cash');
  // Goods return to their original lots; consumed service materials stay consumed.
  sale.returnedCost=0;for(const line of sale.lines){line.returnedCost=line.kind==='product'&&!line.prepared?line.allocations.filter(a=>a.returnable!==false).reduce((n,a)=>n+get(s,'purchases',a.lotId).cost*a.qty,0):0;sale.returnedCost+=line.returnedCost;}
  for(const line of sale.lines.filter(l=>l.kind==='product'&&!l.prepared))for(const a of line.allocations.filter(a=>a.returnable!==false)){const lot=get(s,'purchases',a.lotId);lot.locations[a.warehouseId]=(lot.locations[a.warehouseId]||0)+a.qty;lot.remaining+=a.qty;s.movements.push({id:uid(),date,productId:lot.productId,warehouseId:a.warehouseId,qty:a.qty,reason:'Возврат',documentId:sale.id});}
  s.bonusLedger=s.bonusLedger.filter(e=>e.saleId!==sale.id);sale.status='refunded';sale.refundDate=date;sale.refundReason=b.reason;if(sale.department==='bar')barSaleTransactions(s,sale,true);if(sale.orderId){const order=get(s,'barOrders',sale.orderId);order.status='refunded';order.version++;posLog(order,'refunded',b,b.reason);}if(sale.appointmentId)get(s,'appointments',sale.appointmentId).status='refunded';
 }else if(action==='extended-settings'){
  for(const k of ['requireConfirmation','allowClientCancel','loyaltyActive','familyBonus'])if(k in b)s.settings[k]=!!b[k];
  for(const [k,max] of [['holdMinutes',60],['lateCancelHours',720],['loyaltyPercent',100],['productBonusPercent',100],['bonusMaxPercent',100],['bonusExpiryMonths',120]])if(k in b)s.settings[k]=value(b[k],k==='holdMinutes'?1:0,max);
  if(b.familyBonusRates){const rates={};for(const [family,rate] of Object.entries(b.familyBonusRates))if(rate!=='')rates[family]=value(rate,0,100);s.settings.familyBonusRates=rates;}
  for(const k of ['description','reviewDikidi','review2gis','reviewYandex'])if(k in b)s.settings[k]=String(b[k]);
 }else if(action==='message-template'){
  if(!['confirmed','moved','cancelled','reminder'].includes(b.event))throw Error('Неизвестное событие');const body=textValue(b.body);const vars=['client','service','date','time','salon'];if([...body.matchAll(/\{(\w+)\}/g)].some(m=>!vars.includes(m[1])))throw Error('Неизвестная переменная шаблона');const entry={id:b.id||id,name:textValue(b.name),event:b.event,body,active:b.active!==false};if(b.id)Object.assign(get(s,'messageTemplates',b.id),entry);else s.messageTemplates.push(entry);
 }else return false;
 return true;
}
