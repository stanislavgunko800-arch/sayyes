import {uid,today,stock,cashBalance,payroll,slots,mins} from './domain.js';
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const value = (n, min=0, max=1e9) => { n=Number(n); if(!Number.isFinite(n)||n<min||n>max)throw Error('Проверьте числовые значения');return n; };
const textValue = v => { const t=String(v??'').trim();if(!t)throw Error('Заполните обязательные поля');return t; };
const dateValue = d => { if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T12:00Z').toISOString().slice(0,10)!==d)throw Error('Неверная дата');return d; };
const get = (s,k,id) => { const v=s[k].find(x=>x.id===id);if(!v)throw Error('Запись не найдена: '+k);return v; };
export function extendState(s){
 for(const k of ['sales','purchaseDocuments','payouts','workplaceShifts','bonusLedger','inventories','messageTemplates','outbox','schedulePatterns','expenseTemplates','supplierOrders','zones','holds'])s[k]??=[];
 s.paymentMethods??=[{id:'cash',name:'Наличные',kind:'cash',fee:0,active:true},{id:'card',name:'Терминал',kind:'card',fee:0,active:true},{id:'transfer',name:'Перевод',kind:'transfer',fee:0,active:true}];
 s.terminals??=[];
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
 if(action==='hold-slot'){
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
  if(key==='paymentMethods'){if(!['cash','card','transfer'].includes(b.kind))throw Error('Неизвестный тип оплаты');v.kind=b.kind;}
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
  Object.assign(a,{employeeId:b.employeeId,serviceId:service.id,service:service.name,price:service.price,duration:service.duration,date:b.date,time:b.time,start,workplaceId:b.workplaceId||'',note:String(b.note||'')});notification(s,'moved',a);
 }else if(action==='appointment-confirm'){
  const a=get(s,'appointments',b.id);if(a.status!=='pending')throw Error('Запись не ожидает подтверждения');a.status='booked';notification(s,'confirmed',a);
 }else if(action==='payout'){
  get(s,'employees',b.employeeId);dateValue(b.from);dateValue(b.to);if(b.from>b.to)throw Error('Проверьте период');const due=Math.min(payroll(s,b.employeeId,b.from,b.to).due,payroll(s,b.employeeId,'0000-01-01','9999-12-31').due);
  const amount=value(b.amount,0.01);if(amount>due+1e-8)throw Error('Сумма превышает остаток зарплаты за период');moneyOut(s,amount,'Зарплата',b.method);s.payouts.push({id,date,employeeId:b.employeeId,amount,from:b.from,to:b.to,method:b.method});
 }else if(action==='sale'){
  const appointment=b.appointmentId?get(s,'appointments',b.appointmentId):null;
  if(appointment&&appointment.status!=='booked')throw Error('Сначала подтвердите запись; оплаченный визит нельзя оплатить повторно');
  const clientId=appointment?.clientId||b.clientId||'';if(clientId)get(s,'clients',clientId);
  const employeeId=appointment?.employeeId||b.employeeId;const employee=get(s,'employees',employeeId);
  const input=appointment?[{kind:'service',itemId:appointment.serviceId,qty:1,price:appointment.price},...(b.lines||[])]:b.lines;
  if(!Array.isArray(input)||!input.length||input.length>100)throw Error('Добавьте позиции чека');
  const sh=s.shifts.find(x=>!x.closedAt);if(!sh)throw Error('Откройте кассовую смену');
  const lines=[];let gross=0,materialCost=0,baseCost=0;
  for(const item of input){if(!['service','product'].includes(item.kind))throw Error('Неверный тип позиции');const p=get(s,item.kind==='service'?'services':'products',item.itemId);if(p.active===false)throw Error('Позиция выключена');const qty=value(item.qty,0.001);if(item.kind==='service'&&!Number.isInteger(qty))throw Error('Количество услуг должно быть целым');
   const price=appointment&&lines.length===0?appointment.price:p.price,warehouseId=b.warehouseId||'main',allocations=[];let cost=0;
   if(item.kind==='product'){const used=consume(s,p.id,warehouseId,qty,'Продажа',id);cost=used.cost;allocations.push(...used.allocations);}
   else {for(const m of p.materials){const used=consume(s,m.productId,p.warehouseId||'main',qty*m.qty,'Услуга: '+p.name,id);cost+=used.cost*(get(s,'products',m.productId).lossFactor||1);allocations.push(...used.allocations);}baseCost+=qty*p.baseCost;}
   materialCost+=cost;gross+=qty*price;lines.push({kind:item.kind,itemId:p.id,name:p.name,qty,price,cost,allocations});
  }
  gross=round(gross);let discount=value(b.discount||0);if(b.discountMode!=='amount'){value(discount,0,100);discount=round(gross*discount/100);}if(!b.promotionId&&appointment?.promotionId)b.promotionId=appointment.promotionId;if(b.promotionId){const promo=get(s,'promotions',b.promotionId);if(!promo.active||date<promo.start||date>promo.end)throw Error('Акция не действует');discount=round(gross*promo.discount/100);}if(discount>gross)throw Error('Скидка больше суммы чека');
  const afterDiscount=round(gross-discount),bonusUsed=value(b.bonusUsed||0);if(bonusUsed&&!clientId)throw Error('Выберите клиента для бонусов');
  if(bonusUsed&&(!s.settings.loyaltyActive||bonusUsed>round(afterDiscount*s.settings.bonusMaxPercent/100)))throw Error('Превышен лимит оплаты бонусами');
  if(bonusUsed){const c=get(s,'clients',clientId),ids=s.settings.familyBonus&&c.familyId?s.clients.filter(x=>x.familyId===c.familyId).map(x=>x.id):[clientId];let left=bonusUsed;
   for(const owner of ids){const available=Math.max(0,bonusBalance(s,owner)),use=Math.min(left,available);if(use){
    // Debits inherit the source credit expiry, so expiration cannot create a negative balance.
    let needed=use;const credits=s.bonusLedger.filter(e=>e.clientId===owner&&e.amount>0&&(!e.expires||e.expires>=date)).sort((a,b)=>(a.expires||'9999').localeCompare(b.expires||'9999'));
    for(const credit of credits){const used=-s.bonusLedger.filter(e=>e.creditId===credit.id).reduce((n,e)=>n+e.amount,0),take=Math.min(needed,Math.max(0,credit.amount-used));if(take){s.bonusLedger.push({id:uid(),clientId:owner,creditId:credit.id,saleId:id,date,expires:credit.expires,amount:-take,reason:'Оплата бонусами'});needed-=take;}if(needed<1e-8)break;}left-=use;
   }if(left<1e-8)break;}if(left>1e-8)throw Error('Недостаточно бонусов');
  }
  const amount=round(afterDiscount-bonusUsed);if(!Array.isArray(b.payments))throw Error('Укажите оплаты');let total=0,fee=0,cash=0;const payments=[];
  for(const payment of b.payments){const method=get(s,'paymentMethods',payment.methodId);if(!method.active)throw Error('Способ оплаты выключен');const part=value(payment.amount,0.01);let rate=method.fee,terminal=null;if(payment.terminalId){terminal=get(s,'terminals',payment.terminalId);if(!terminal.active||terminal.methodId!==method.id)throw Error('Терминал не соответствует способу оплаты');rate=terminal.fee;}
   total+=part;fee+=round(part*rate/100);if(method.kind==='cash')cash+=part;payments.push({methodId:method.id,method:method.name,kind:method.kind,amount:part,fee:round(part*rate/100),terminalId:terminal?.id||''});
  }
  if(Math.abs(round(total)-amount)>0.001)throw Error('Сумма оплат должна равняться итогу чека: '+amount+' ₾');
  let earned=0;if(clientId&&s.settings.loyaltyActive){for(const line of lines){const family=line.kind==='service'?get(s,'services',line.itemId).family:'';const percent=line.kind==='product'?s.settings.productBonusPercent:(s.settings.familyBonusRates[family]??s.settings.loyaltyPercent);earned+=gross?line.qty*line.price/gross*amount*percent/100:0;}earned=round(earned);if(earned){let expires='';if(s.settings.bonusExpiryMonths){const d=new Date(date+'T12:00Z');d.setUTCMonth(d.getUTCMonth()+s.settings.bonusExpiryMonths);expires=d.toISOString().slice(0,10);}s.bonusLedger.push({id:uid(),clientId,saleId:id,date,expires,amount:earned,reason:'Начисление по чеку'});}}
  const sale={id,status:'paid',date,paidDate:date,time:'',clientId,name:clientId?get(s,'clients',clientId).name:'Без клиента',employeeId,service:lines.map(l=>l.name).join(', '),price:gross,amount,discount,bonusUsed,bonusEarned:earned,materialCost:round(materialCost),baseCost:round(baseCost),commissionAmount:round(amount*employee.commission/100),fee:round(fee),lines,payments,method:payments.map(p=>p.method).join(' + '),shiftId:sh.id,appointmentId:appointment?.id||'',workplaceId:appointment?.workplaceId||b.workplaceId||'',promotionId:b.promotionId||''};
  s.sales.push(sale);if(cash)s.cash.push({id:uid(),shiftId:sh.id,date,amount:round(cash),reason:'Чек '+id,saleId:id});if(appointment)Object.assign(appointment,{...sale,id:appointment.id,date:appointment.date,time:appointment.time,saleId:id});
 }else if(action==='refund'){
  const sale=get(s,'sales',b.id);if(sale.status!=='paid')throw Error('Чек уже возвращён');textValue(b.reason);
  if(s.bonusLedger.some(e=>e.creditId&&s.bonusLedger.some(c=>c.id===e.creditId&&c.saleId===sale.id)))throw Error('Начисленные баллы уже использованы; сначала верните связанный чек');
  const cash=sale.payments.filter(p=>p.kind==='cash').reduce((n,p)=>n+p.amount,0);if(cash)moneyOut(s,cash,'Возврат чека '+sale.id,'cash');
  // Goods return to their original lots; consumed service materials stay consumed.
  for(const line of sale.lines.filter(l=>l.kind==='product'))for(const a of line.allocations){const lot=get(s,'purchases',a.lotId);lot.locations[a.warehouseId]=(lot.locations[a.warehouseId]||0)+a.qty;lot.remaining+=a.qty;s.movements.push({id:uid(),date,productId:lot.productId,warehouseId:a.warehouseId,qty:a.qty,reason:'Возврат',documentId:sale.id});}
  s.bonusLedger=s.bonusLedger.filter(e=>e.saleId!==sale.id);sale.status='refunded';sale.refundDate=date;sale.refundReason=b.reason;if(sale.appointmentId)get(s,'appointments',sale.appointmentId).status='refunded';
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
