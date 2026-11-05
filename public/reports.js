import {scheduleMinutes,scheduleBreaks} from './schedule-engine.js';
import {schedule,mins,today} from './domain.js';
import {receipts} from './operations.js';
const reportRound=n=>Math.round((n+Number.EPSILON)*1000)/1000;
export function reportDates(from,to){
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00Z'))&&new Date(d+'T12:00Z').toISOString().slice(0,10)===d;
 if(!valid(from)||!valid(to)||from>to)throw Error('Проверьте даты периода');
 const count=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;if(count>366)throw Error('Выберите период не более 366 дней');
 return Array.from({length:count},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
}
export function workloadReport(s,f){
 const dates=reportDates(f.from,f.to),employees=s.employees.filter(e=>!f.employeeId||e.id===f.employeeId);
 return employees.map(e=>{let work=0,occupied=0,days=0,planned=0;const detail=dates.map(date=>{
 const g=schedule(s,e.id,date);let capacity=0,used=0;const visits=s.appointments.filter(a=>a.employeeId===e.id&&a.date===date&&a.status!=='cancelled');
 // Minute occupancy is a union, clipped to working time and excluding the break.
 if(!g.off)for(let m=mins(g.start);m<scheduleMinutes(g.end);m++){if(scheduleBreaks(g).some(br=>m>=scheduleMinutes(br.start)&&m<scheduleMinutes(br.end)))continue;capacity++;if(visits.some(a=>m>=a.start&&m<a.start+a.duration))used++;}
 const booked=visits.reduce((n,a)=>n+a.duration,0);work+=capacity;occupied+=used;planned+=booked;if(capacity)days++;
 return {date,workHours:reportRound(capacity/60),occupiedHours:reportRound(used/60),load:capacity?reportRound(used/capacity*100):null};
 });return {employeeId:e.id,name:e.name,days,workHours:reportRound(work/60),occupiedHours:reportRound(occupied/60),idleHours:reportRound((work-occupied)/60),load:work?reportRound(occupied/work*100):null,bookedHours:reportRound(planned/60),future:s.appointments.filter(a=>a.employeeId===e.id&&a.date>f.to&&!['cancelled','refunded'].includes(a.status)).length,detail};});
}
export function retentionReport(s,f){
 reportDates(f.from,f.to);const since=new Date(Date.parse(f.from)-60*86400000).toISOString().slice(0,10);
 const visits=s.appointments.filter(a=>a.status==='paid'&&a.clientId&&(!f.serviceId||a.serviceId===f.serviceId));
 const make=(name,rows)=>{const during=rows.filter(a=>a.date>=f.from&&a.date<=f.to),ids=new Set(during.map(a=>a.clientId)),cohort=new Set(rows.filter(a=>a.date>=since&&a.date<f.from).map(a=>a.clientId));const existing=[...ids].filter(id=>rows.some(a=>a.clientId===id&&a.date<f.from)).length;const returned=[...cohort].filter(id=>ids.has(id)).length;return {name,total:ids.size,new:ids.size-existing,existing,cohort:cohort.size,returned,percent:cohort.size?reportRound(returned/cohort.size*100):null};};
 return [...s.employees.filter(e=>!f.employeeId||e.id===f.employeeId).map(e=>make(e.name,visits.filter(a=>a.employeeId===e.id))),make('Всего уникальных клиентов',visits.filter(a=>!f.employeeId||a.employeeId===f.employeeId))];
}
export function dailyPaymentsReport(s,f){
 return reportDates(f.from,f.to).map(date=>{let cash=0,card=0,transfer=0,other=0,refund=0,count=0;
 for(const a of receipts(s).filter(a=>['paid','refunded'].includes(a.status))){if((a.paidDate||a.date)===date){count++;for(const p of a.payments||[{kind:a.method==='cash'?'cash':'card',amount:a.amount}]){if(p.kind==='cash')cash+=p.amount;else if(p.kind==='card')card+=p.amount;else if(p.kind==='transfer')transfer+=p.amount;else other+=p.amount;}}if(a.status==='refunded'&&a.refundDate===date)refund+=a.amount;}
 const movements=s.cash.filter(c=>c.date===date),inflow=movements.filter(c=>c.amount>0).reduce((n,c)=>n+c.amount,0),outflow=-movements.filter(c=>c.amount<0).reduce((n,c)=>n+c.amount,0);
 return {date,count,cash:reportRound(cash),card:reportRound(card),transfer:reportRound(transfer),other:reportRound(other),refund:reportRound(refund),net:reportRound(cash+card+transfer+other-refund),cashIn:reportRound(inflow),cashOut:reportRound(outflow),cashDelta:reportRound(inflow-outflow)};
 });
}
export function goodsReport(s,kind,f){
 const dates=reportDates(f.from,f.to),products=s.products.filter(p=>(!f.category||p.category===f.category)&&(!f.search||(p.name+' '+p.sku+' '+p.brand).toLowerCase().includes(f.search.toLowerCase())));
 const atWarehouse=m=>!f.warehouseId||m.warehouseId===f.warehouseId;
 const paidRows=receipts(s).filter(a=>['paid','refunded'].includes(a.status));
 return products.map(p=>{
 const moves=s.movements.filter(m=>m.productId===p.id&&atWarehouse(m));
 const before=moves.filter(m=>m.date<f.from).reduce((n,m)=>n+m.qty,0),within=moves.filter(m=>m.date>=f.from&&m.date<=f.to),incoming=within.filter(m=>m.qty>0).reduce((n,m)=>n+m.qty,0),outgoing=-within.filter(m=>m.qty<0).reduce((n,m)=>n+m.qty,0),end=before+incoming-outgoing;
 const current=moves.reduce((n,m)=>n+m.qty,0),currentCost=s.purchases.filter(l=>l.productId===p.id).reduce((n,l)=>n+Object.entries(l.locations||{}).filter(([w])=>!f.warehouseId||w===f.warehouseId).reduce((q,[,v])=>q+v,0)*l.cost,0);
 let sales=0,revenue=0,cost=0,returned=0;for(const a of paidRows)for(const l of (a.lines||[]).filter(l=>l.kind==='product'&&l.itemId===p.id)){const allocations=l.allocations||[],share=f.warehouseId?allocations.filter(x=>x.warehouseId===f.warehouseId).reduce((n,x)=>n+x.qty,0)/l.qty:1;if((a.paidDate||a.date)>=f.from&&(a.paidDate||a.date)<=f.to){sales+=l.qty*share;revenue+=(a.price?l.qty*l.price/a.price*a.amount:0)*share;cost+=(l.cost||0)*share;}if(a.status==='refunded'&&a.refundDate>=f.from&&a.refundDate<=f.to)returned+=l.qty*share;}
 const consumed=-within.filter(m=>m.qty<0&&m.reason.startsWith('Услуга:')).reduce((n,m)=>n+m.qty,0),writtenOff=-within.filter(m=>m.qty<0&&m.reason.startsWith('Списание:')).reduce((n,m)=>n+m.qty,0);
 let balance=before,total=0;for(const date of dates){balance+=within.filter(m=>m.date===date).reduce((n,m)=>n+m.qty,0);total+=balance;}const average=total/dates.length,usage=Math.max(0,sales-returned)+consumed+writtenOff;
 return {id:p.id,name:p.name,category:p.category,unit:p.unit,before:reportRound(before),incoming:reportRound(incoming),outgoing:reportRound(outgoing),end:reportRound(end),current:reportRound(current),currentCost:reportRound(currentCost),threshold:p.threshold||0,toOrder:reportRound(Math.max(0,(p.threshold||0)-current)),sales:reportRound(sales),returned:reportRound(returned),revenue:reportRound(revenue),cost:reportRound(cost),consumed:reportRound(consumed),writtenOff:reportRound(writtenOff),average:reportRound(average),turnover:average>0?reportRound(usage/average):null,days:usage>0&&average>0?reportRound(average/usage*dates.length):null};
 }).filter(r=>!['consumption','writeoffs','goods-sales'].includes(kind)||(kind==='consumption'?r.consumed:kind==='writeoffs'?r.writtenOff:r.sales+r.returned)>0);
}
