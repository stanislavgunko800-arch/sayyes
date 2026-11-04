import {extendState, extendedMutation, receipts, payoutTotals} from './operations.js';
export const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'});
export const mins=t=>{if(!/^\d{2}:\d{2}$/.test(t))throw Error('Неверное время');const [h,m]=t.split(':').map(Number);if(h>23||m>59)throw Error('Неверное время');return h*60+m;};
export const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const num=(v,min=0,max=1e9)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Проверьте числовые значения');return n;};
const required=v=>{const s=String(v??'').trim();if(!s)throw Error('Заполните обязательные поля');return s;};
const validDate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw Error('Неверная дата');return d;};
export function initial(){return upgrade({employees:['Анна','Мария','Елена','Нино','София','Тамара','Екатерина'].map((name,i)=>({id:String(i+1),name,role:i<3?'Стилист':i<5?'Нейл-мастер':'Бровист'})),services:[{id:'1',name:'Стрижка и укладка',price:80,duration:60},{id:'2',name:'Окрашивание',price:180,duration:120},{id:'3',name:'Маникюр с покрытием',price:65,duration:90},{id:'4',name:'Оформление бровей',price:40,duration:30}]});}
export function upgrade(s){for(const k of ['employees','services','clients','appointments','schedules','shifts','cash','advances','expenses','products','purchases','movements','suppliers','warehouses','workplaces','promotions','audit','categories','units','productTypes'])s[k]??=[];
 s.settings={name:'SayYes',address:'',phone:'',email:'',slug:'sayyes',online:true,slotStep:30,leadHours:0,loyaltyPercent:0,reviewGoogle:'',reviewOther:'',...s.settings};
 if(!s.warehouses.length)s.warehouses.push({id:'main',name:'Основной склад'});
 for(const e of s.employees){e.commission??=0;e.active??=true;}
 for(const c of s.clients){c.tags??='';c.source??='Салон';c.note??='';c.blocked??=false;}
 for(const v of s.services){v.category??='Общее';v.active??=true;v.materials??=[];v.employeeIds??=[];v.baseCost??=0;}
 for(const [key,values] of [['categories',s.services.map(v=>v.category)],['units',['шт','мл','г',...s.products.map(p=>p.unit)]],['productTypes',['Материалы',...s.products.map(p=>p.category)]]])for(const name of new Set(values.filter(Boolean)))if(!s[key].some(x=>x.name===name))s[key].push({id:uid(),name});
 for(const p of s.products){p.brand??='';p.lossFactor??=1;}
 for(const a of s.appointments)if(a.status==='paid'){a.amount??=a.price;a.paidDate??=a.date;}
 for(const p of s.purchases)p.locations??={[p.warehouseId]:p.remaining};
 extendState(s);return s;
}
export function schedule(s,employeeId,date){return s.schedules.find(x=>x.employeeId===employeeId&&x.date===date)||{employeeId,date,start:'10:00',end:'20:00',off:false,breakStart:'',breakEnd:''};}
export function slots(s,employeeId,serviceId,date,publicMode=false,holdToken=''){const service=s.services.find(x=>x.id===serviceId&&x.active),e=s.employees.find(x=>x.id===employeeId&&x.active);if(!service||!e||service.employeeIds.length&&!service.employeeIds.includes(employeeId))return [];
 const g=schedule(s,employeeId,date);if(g.off||publicMode&&!s.settings.online)return [];const result=[];
 for(let t=mins(g.start);t+service.duration<=mins(g.end);t+=Number(s.settings.slotStep)){
 if(g.breakStart&&g.breakEnd&&t<mins(g.breakEnd)&&t+service.duration>mins(g.breakStart))continue;
 if((s.holds||[]).some(h=>h.token!==holdToken&&h.expiresAt>Date.now()&&h.employeeId===employeeId&&h.date===date&&t<h.start+h.duration&&t+service.duration>h.start))continue;
 if(s.appointments.some(a=>a.employeeId===employeeId&&a.date===date&&a.status!=='cancelled'&&t<a.start+a.duration&&t+service.duration>a.start))continue;
 if(publicMode&&new Date(`${date}T${time(t)}:00+04:00`).getTime()<Date.now()+s.settings.leadHours*3600000)continue;
 result.push(time(t));}return result;}
export function stock(s,productId,warehouseId){return s.movements.filter(m=>m.productId===productId&&(!warehouseId||m.warehouseId===warehouseId)).reduce((n,m)=>n+m.qty,0);}
export function cashBalance(s,shift=s.shifts.find(x=>!x.closedAt)){return shift?shift.opening+s.cash.filter(c=>c.shiftId===shift.id).reduce((n,c)=>n+c.amount,0):0;}
export function payroll(s,employeeId,from,to){const rows=receipts(s).filter(a=>a.employeeId===employeeId&&a.status==='paid'&&(a.paidDate||a.date)>=from&&(a.paidDate||a.date)<=to);const earned=rows.reduce((n,a)=>n+(a.commissionAmount||0),0),advance=s.advances.filter(a=>a.employeeId===employeeId&&a.date>=from&&a.date<=to).reduce((n,a)=>n+a.amount,0);const paidOut=payoutTotals(s,employeeId,from,to);return {earned,advance,paidOut,due:earned-advance-paidOut};}
export function mutate(s,action,b){upgrade(s);const id=uid(),date=today(),find=(k,key)=>{const x=s[k].find(x=>x.id===key);if(!x)throw Error('Запись не найдена');return x;};
 if(extendedMutation(s,action,b)){}else if(['categories','units','productTypes'].includes(action)){const name=required(b.name);if(s[action].some(x=>x.id!==b.id&&x.name.toLowerCase()===name.toLowerCase()))throw Error('Такое название уже существует');if(b.id){const entry=find(action,b.id),old=entry.name;entry.name=name;const collection=action==='categories'?s.services:s.products,key=action==='units'?'unit':'category';for(const x of collection)if(x[key]===old)x[key]=name;}else s[action].push({id,name});
 }else if(action==='service-order'){const index=s.services.findIndex(v=>v.id===b.id),direction=Number(b.direction);if(index<0||![-1,1].includes(direction))throw Error('Неверный порядок');const target=index+direction;if(target>=0&&target<s.services.length)[s.services[index],s.services[target]]=[s.services[target],s.services[index]];
 }else if(['employees','clients','services','products','suppliers','warehouses','workplaces','promotions'].includes(action)){
 let v={id:b.id||id,name:required(b.name)};
 if(action==='employees')Object.assign(v,{role:required(b.role||'Мастер'),commission:num(b.commission??0,0,100),active:b.active!==false});
 if(action==='clients'){const phone=required(b.phone);if(s.clients.some(c=>c.id!==b.id&&c.phone===phone))throw Error('Клиент с этим телефоном уже существует');Object.assign(v,{phone,tags:String(b.tags||''),source:String(b.source||'Салон'),note:String(b.note||''),blocked:!!b.blocked,email:String(b.email||''),familyId:String(b.familyId||''),level:String(b.level||'')});}
 if(action==='services'){const duration=num(b.duration,15,480);if(!Number.isInteger(duration))throw Error('Длительность должна быть целой');Object.assign(v,{price:num(b.price),duration,category:required(b.category||'Общее'),active:b.active!==false,baseCost:num(b.baseCost??(b.id?0:s.expenseTemplates.find(t=>t.isDefault)?.total||0)),warehouseId:b.warehouseId||'main',family:String(b.family||''),returnDays:num(b.returnDays||30,1,730),employeeIds:b.employeeIds||[],materials:b.materials||[]});for(const m of v.materials){find('products',m.productId);num(m.qty,0.001);}for(const e of v.employeeIds)find('employees',e);}
 if(action==='products')Object.assign(v,{sku:String(b.sku||''),category:String(b.category||'Материалы'),unit:required(b.unit||'шт'),price:num(b.price||0),threshold:num(b.threshold||0),brand:String(b.brand||''),lossFactor:num(b.lossFactor??1,1,10),active:b.active!==false});
 if(action==='suppliers')Object.assign(v,{phone:String(b.phone||''),note:String(b.note||''),email:String(b.email||''),contact:String(b.contact||''),brands:String(b.brands||'')});
 if(action==='workplaces')Object.assign(v,{kind:String(b.kind||'Кресло'),zone:String(b.zone||'Основной зал'),status:String(b.status||'Свободно'),x:num(b.x||0,0,100),y:num(b.y||0,0,100)});
 if(action==='promotions')Object.assign(v,{discount:num(b.discount,0,100),start:validDate(b.start),end:validDate(b.end),active:b.active!==false});
 if(action==='promotions'&&v.end<v.start)throw Error('Проверьте период акции');
 if(b.id)Object.assign(find(action,b.id),v);else s[action].push(v);
 }else if(action==='schedule'){
 find('employees',b.employeeId);validDate(b.date);const g={employeeId:b.employeeId,date:b.date,start:b.start,end:b.end,off:!!b.off,breakStart:b.breakStart||'',breakEnd:b.breakEnd||''};
 if(!g.off){if(mins(g.end)<=mins(g.start))throw Error('Конец смены должен быть позже начала');if(!!g.breakStart!==!!g.breakEnd)throw Error('Укажите обе границы перерыва');if(g.breakStart&&(mins(g.breakStart)<mins(g.start)||mins(g.breakEnd)>mins(g.end)||mins(g.breakStart)>=mins(g.breakEnd)))throw Error('Перерыв должен быть внутри смены');}
 if(s.appointments.some(a=>a.employeeId===g.employeeId&&a.date===g.date&&a.status!=='cancelled'&&(g.off||a.start<mins(g.start)||a.start+a.duration>mins(g.end)||g.breakStart&&a.start<mins(g.breakEnd)&&a.start+a.duration>mins(g.breakStart))))throw Error('График конфликтует с существующими записями');
 s.schedules=s.schedules.filter(x=>x.employeeId!==g.employeeId||x.date!==g.date);s.schedules.push(g);
 }else if(action==='appointments'){
 if(b.publicMode&&b.holdToken&&!s.holds.some(h=>h.token===b.holdToken&&h.expiresAt>Date.now()&&h.employeeId===b.employeeId&&h.serviceId===b.serviceId&&h.date===b.date&&h.time===b.time))throw Error('Бронь истекла. Выберите время снова');
 const v=find('services',b.serviceId),e=find('employees',b.employeeId);validDate(b.date);required(b.name);const phone=required(b.phone);
 if(!slots(s,e.id,v.id,b.date,!!b.publicMode,b.holdToken||'').includes(b.time))throw Error('Время недоступно. Выберите свободное окно');
 let c=s.clients.find(c=>c.phone===phone);if(c?.blocked)throw Error('Онлайн-запись для этого клиента недоступна');if(!c){c={id:uid(),name:b.name,phone,tags:'',source:b.publicMode?'Онлайн':'Салон',note:'',blocked:false};s.clients.push(c);}
 if(b.workplaceId){find('workplaces',b.workplaceId);const t=mins(b.time);if(s.appointments.some(a=>a.workplaceId===b.workplaceId&&a.date===b.date&&a.status!=='cancelled'&&t<a.start+a.duration&&t+v.duration>a.start))throw Error('Рабочее место занято');}
 s.appointments.push({id,clientId:c.id,name:c.name,serviceId:v.id,service:v.name,price:v.price,duration:v.duration,employeeId:e.id,date:b.date,time:b.time,start:mins(b.time),status:b.publicMode&&s.settings.requireConfirmation?'pending':'booked',workplaceId:b.workplaceId||'',note:String(b.note||''),manageToken:b.publicMode?String(b.manageToken||''):'',promotionId:s.promotions.some(p=>p.id===b.promotionId&&p.active&&date>=p.start&&date<=p.end)?b.promotionId:''});
 s.holds=s.holds.filter(h=>h.token!==b.holdToken);
 }else if(action==='status'){
 const a=find('appointments',b.id);if(!['booked','pending'].includes(a.status))throw Error('Запись уже закрыта');if(!['paid','cancelled'].includes(b.status))throw Error('Неверный статус');
 if(b.status==='paid'){
 const shift=s.shifts.find(x=>!x.closedAt);if(!shift)throw Error('Сначала откройте кассовую смену');if(!['cash','card'].includes(b.method))throw Error('Выберите способ оплаты');
 const v=find('services',a.serviceId),e=find('employees',a.employeeId);let discount=0;if(b.promotionId){const p=find('promotions',b.promotionId);if(!p.active||date<p.start||date>p.end)throw Error('Акция не действует');discount=p.discount;}
 const amount=Math.round(a.price*(1-discount/100)*100)/100;
 let materialCost=0;for(const m of v.materials){if(stock(s,m.productId,'main')<m.qty)throw Error('Недостаточно материалов на основном складе');let remaining=m.qty;for(const lot of s.purchases.filter(p=>p.productId===m.productId&&(p.locations?.main||0)>0).sort((a,b)=>a.date.localeCompare(b.date))){const qty=Math.min(lot.locations.main,remaining);materialCost+=qty*lot.cost;lot.locations.main-=qty;lot.remaining-=qty;remaining-=qty;if(remaining<=0)break;}s.movements.push({id:uid(),productId:m.productId,warehouseId:'main',qty:-m.qty,date,reason:'Услуга: '+a.service});}
 Object.assign(a,{status:'paid',amount,discount,method:b.method,shiftId:shift.id,paidDate:date,commissionAmount:Math.round(amount*e.commission)/100,materialCost,baseCost:v.baseCost,promotionId:b.promotionId||'',bonusEarned:Math.round(amount*s.settings.loyaltyPercent)/100});
 if(b.method==='cash')s.cash.push({id:uid(),shiftId:shift.id,date,amount,reason:'Оплата: '+a.service});
 }else {a.status='cancelled';a.cancelledAt=new Date().toISOString();a.lateCancellation=new Date(a.date+'T'+a.time+':00+04:00').getTime()-Date.now()<s.settings.lateCancelHours*3600000;}
 }else if(action==='shift-open'){if(s.shifts.some(x=>!x.closedAt))throw Error('Смена уже открыта');s.shifts.push({id,date,opening:num(b.opening),openedAt:new Date().toISOString()});
 }else if(action==='shift-close'){const shift=s.shifts.find(x=>!x.closedAt);if(!shift)throw Error('Нет открытой смены');shift.expected=cashBalance(s,shift);shift.actual=num(b.actual);shift.difference=shift.actual-shift.expected;shift.closedAt=new Date().toISOString();
 }else if(action==='cash'){const shift=s.shifts.find(x=>!x.closedAt);if(!shift)throw Error('Откройте смену');const amount=num(b.amount,0.01)*(b.kind==='out'?-1:1);if(cashBalance(s,shift)+amount<0)throw Error('Недостаточно наличных');s.cash.push({id,shiftId:shift.id,date,amount,reason:required(b.reason)});
 }else if(action==='advances'){find('employees',b.employeeId);s.advances.push({id,employeeId:b.employeeId,date:validDate(b.date),amount:num(b.amount,0.01),note:String(b.note||'')});
 }else if(action==='expenses'){s.expenses.push({id,date:validDate(b.date),amount:num(b.amount,0.01),name:required(b.name)});
 }else if(action==='purchase'){find('products',b.productId);find('warehouses',b.warehouseId);if(b.supplierId)find('suppliers',b.supplierId);const qty=num(b.qty,0.001),cost=num(b.cost);s.purchases.push({id,productId:b.productId,warehouseId:b.warehouseId,supplierId:b.supplierId||'',date:validDate(b.date),qty,remaining:qty,locations:{[b.warehouseId]:qty},cost});s.movements.push({id:uid(),date:b.date,productId:b.productId,warehouseId:b.warehouseId,qty,reason:'Закупка'});
 }else if(action==='transfer'){find('products',b.productId);find('warehouses',b.from);find('warehouses',b.to);const qty=num(b.qty,0.001);if(b.from===b.to||stock(s,b.productId,b.from)<qty)throw Error('Проверьте склады и остаток');let remaining=qty;for(const lot of s.purchases.filter(p=>p.productId===b.productId&&(p.locations?.[b.from]||0)>0).sort((a,b)=>a.date.localeCompare(b.date))){const moved=Math.min(lot.locations[b.from],remaining);lot.locations[b.from]-=moved;lot.locations[b.to]=(lot.locations[b.to]||0)+moved;remaining-=moved;if(remaining<=0)break;}for(const [warehouseId,sign] of [[b.from,-1],[b.to,1]])s.movements.push({id:uid(),date,productId:b.productId,warehouseId,qty:qty*sign,reason:'Перемещение'});
 }else if(action==='settings'){
 const next={...s.settings};for(const k of ['name','address','phone','email','slug','reviewGoogle','reviewOther'])if(k in b)next[k]=String(b[k]);if(!/^[a-z0-9-]+$/.test(next.slug))throw Error('Адрес: латинские буквы, цифры, дефис');for(const k of ['reviewGoogle','reviewOther'])if(next[k]&&!/^https:\/\//.test(next[k]))throw Error('Ссылка должна начинаться с https://');if('online'in b)next.online=!!b.online;if('slotStep'in b){next.slotStep=num(b.slotStep,15,60);if(![15,30,60].includes(next.slotStep))throw Error('Шаг: 15, 30 или 60 минут');}if('leadHours'in b)next.leadHours=num(b.leadHours,0,168);if('loyaltyPercent'in b)next.loyaltyPercent=num(b.loyaltyPercent,0,100);s.settings=next;
 }else if(action==='import-clients'){if(!Array.isArray(b.clients)||b.clients.length>1000)throw Error('Не более 1000 клиентов');for(const c of b.clients){required(c.name);required(c.phone);if(!s.clients.some(x=>x.phone===c.phone))s.clients.push({id:uid(),name:c.name,phone:c.phone,tags:String(c.tags||''),source:'Импорт',note:'',blocked:false});}
 }else throw Error('Неизвестная операция');
 s.audit.unshift({id:uid(),at:new Date().toISOString(),action,subject:String(b.name||b.id||b.employeeId||'')});s.audit=s.audit.slice(0,1000);return s;
}
