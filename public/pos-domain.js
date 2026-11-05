export const posRound=n=>Math.round((n+Number.EPSILON)*100)/100;
export const posLineKey=l=>l.id||l.itemId+'|'+(l.modifierId||'');
export function posClock(now=new Date()){return {date:now.toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'}),time:now.toLocaleTimeString('en-GB',{timeZone:'Asia/Tbilisi',hour12:false}).slice(0,5)};}
export function posExtend(s){s.posPromotions??=[];s.posCertificates??=[];for(const o of s.barOrders){o.history??=[];o.tickets??=[];o.guests??=1;o.orderType??='dinein';o.scheduledDate??=o.date;o.fulfillmentStatus??='new';for(const [i,l]of o.lines.entries()){l.id??=o.id+':'+i;l.sentQty??=0;l.course??=1;l.note??='';}}if(!s.paymentMethods.some(m=>m.id==='certificate'))s.paymentMethods.push({id:'certificate',name:'Сертификат',kind:'certificate',fee:0,active:true});}
export function posLog(o,action,b={},detail=''){o.history??=[];o.history.push({at:new Date().toISOString(),action,detail,actorId:b._actor?.id||'',actorName:b._actor?.name||'Пользователь'});}
export function posPromotionDiscount(rule,o,now=new Date()){
 const {date,time}=posClock(now);if(!rule?.active||rule.start&&date<rule.start||rule.end&&date>rule.end||time<(rule.timeFrom||'00:00')||time>=(rule.timeTo||'24:00'))return 0;
 const lines=o.lines.filter(l=>!l.noDiscount&&(!rule.productId||l.itemId===rule.productId)&&(!rule.category||l.category===rule.category));const qty=lines.reduce((n,l)=>n+l.qty,0),amount=lines.reduce((n,l)=>n+l.qty*l.price,0);if(qty<(rule.minQty||1)||amount<(rule.minTotal||0))return 0;
 if(rule.kind==='bogo'){let free=Math.floor(qty/2),discount=0;for(const l of [...lines].sort((a,b)=>a.price-b.price)){const count=Math.min(Math.floor(l.qty),free);discount+=count*l.price;free-=count;}return posRound(discount);}
 return posRound(amount*(rule.percent||0)/100);
}
export function posQuote(s,o,now=new Date()){
 const gross=posRound(o.lines.reduce((n,l)=>n+l.price*l.qty,0)),eligible=posRound(o.lines.filter(l=>!l.noDiscount).reduce((n,l)=>n+l.price*l.qty,0));
 const rule=s.posPromotions?.find(p=>p.id===o.posPromotionId),promotionDiscount=Math.min(eligible,posPromotionDiscount(rule,o,now));
 const client=s.clients.find(c=>c.id===o.clientId),percent=Math.max(Number(o.discountPercent)||0,Number(client?.discountPercent)||0),clientDiscount=posRound((eligible-promotionDiscount)*percent/100),discount=posRound(promotionDiscount+clientDiscount),subtotal=posRound(gross-discount),serviceAmount=posRound(subtotal*(Number(o.servicePercent)||0)/100);
 return {gross,discount,promotionDiscount,clientDiscount,discountPercent:percent,serviceAmount,subtotal,total:posRound(subtotal+serviceAmount)};
}
export function posNormalizeOrder(s,b,existing,uid){
 const number=(v,min,max)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Проверьте параметры заказа');return n;},date=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T12:00Z').toISOString().slice(0,10)!==d)throw Error('Неверная дата заказа');return d;};
 const orderType=b.orderType||existing?.orderType||'dinein';if(!['dinein','takeaway','delivery'].includes(orderType))throw Error('Выберите тип заказа');const guests=number(b.guests??existing?.guests??1,1,100);if(!Number.isInteger(guests))throw Error('Число гостей должно быть целым');
 const servicePercent=number(b.servicePercent??existing?.servicePercent??0,0,100),discountPercent=number(b.discountPercent??existing?.discountPercent??0,0,100),scheduledDate=date(b.scheduledDate||existing?.scheduledDate||posClock().date),scheduledTime=b.scheduledTime??existing?.scheduledTime??'';
 if(scheduledTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime))throw Error('Неверное время заказа');
 const posPromotionId=b.posPromotionId??existing?.posPromotionId??'';if(posPromotionId&&!s.posPromotions.some(p=>p.id===posPromotionId))throw Error('Акция не найдена');
 const employee=s.employees.find(e=>e.id===b.employeeId);if(b.employeeId&&(!employee||employee.fired||employee.archived))throw Error('Выберите действующего сотрудника');
 return {orderType,guests,servicePercent,discountPercent,scheduledDate,scheduledTime,posPromotionId,deliveryName:String(b.deliveryName??existing?.deliveryName??'').slice(0,150),deliveryPhone:String(b.deliveryPhone??existing?.deliveryPhone??'').slice(0,50),deliveryAddress:String(b.deliveryAddress??existing?.deliveryAddress??'').slice(0,500)};
}
export function posMutation(s,action,b,{uid}){
 const number=(v,min=0,max=1e9)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Проверьте количество или сумму');return n;};
 const current=()=>{const o=s.barOrders.find(o=>o.id===b.id);if(!o||o.version!==Number(b.version))throw Error('Заказ изменён. Откройте его заново');return o;};
 const open=()=>{const o=current();if(!['open','ready'].includes(o.status))throw Error('Заказ уже закрыт');return o;};
 const touch=(o,event,detail)=>{o.version++;o.updatedAt=new Date().toISOString();posLog(o,event,b,detail);if(['open','ready'].includes(o.status))o.amount=posQuote(s,o).total;};
 if(action==='pos-split'){
  const o=open();if(!Array.isArray(b.lines)||!b.lines.length)throw Error('Выберите позиции для второго чека');const selected=new Map();for(const x of b.lines){if(selected.has(x.id))throw Error('Позиция повторяется');const line=o.lines.find(l=>posLineKey(l)===x.id);if(!line)throw Error('Позиция не найдена');selected.set(x.id,number(x.qty,.001,line.qty));}
  const moved=[],remaining=[];for(const l of o.lines){const qty=selected.get(posLineKey(l))||0,sent=Math.min(qty,l.sentQty||0);if(qty)moved.push({...structuredClone(l),qty,sentQty:sent});if(l.qty-qty>.0000001)remaining.push({...l,qty:l.qty-qty,sentQty:Math.max(0,(l.sentQty||0)-sent)});}if(!remaining.length)throw Error('В исходном чеке должна остаться хотя бы одна позиция');
  const next={...structuredClone(o),id:uid(),number:s.barOrders.length+1,lines:moved,version:1,history:[],tickets:[],splitFrom:o.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'open'};delete next.saleId;next.amount=posQuote(s,next).total;o.lines=remaining;s.barOrders.push(next);touch(o,'split','Выделен заказ № '+next.number);posLog(next,'split-created',b,'Из заказа № '+o.number);
 }else if(action==='pos-kitchen-send'){
  const o=open(),pending=o.lines.filter(l=>l.qty>(l.sentQty||0));if(!pending.length)throw Error('Новых позиций для кухни нет');const groups=new Map();for(const l of pending){const key=(l.workshopId||'')+'|'+(l.course||1);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({lineId:posLineKey(l),name:l.name,qty:l.qty-(l.sentQty||0),note:l.note||'',course:l.course||1,workshopId:l.workshopId||''});}
  for(const lines of groups.values())o.tickets.push({id:uid(),at:new Date().toISOString(),status:'sent',note:String(b.note||'').slice(0,1000),workshopId:lines[0].workshopId,course:lines[0].course,lines});for(const l of pending)l.sentQty=l.qty;o.fulfillmentStatus='preparing';touch(o,'kitchen-sent','Новые позиции отправлены: '+pending.length);
 }else if(action==='pos-kitchen-ready'){
  const o=current(),ticket=o.tickets.find(t=>t.id===b.ticketId);if(!ticket||ticket.status==='ready')throw Error('Задание уже закрыто или не найдено');ticket.status='ready';ticket.readyAt=new Date().toISOString();if(o.tickets.every(t=>t.status==='ready')&&!['onway','delivered'].includes(o.fulfillmentStatus))o.fulfillmentStatus='ready';touch(o,'kitchen-ready','Подача '+ticket.course+' готова');
 }else if(action==='pos-clear'){
  const o=open();if(o.lines.some(l=>l.sentQty>0))throw Error('Есть отправленные блюда. Используйте закрытие без оплаты, чтобы учесть расход ингредиентов.');o.lines=[];o.posPromotionId='';touch(o,'cleared','Заказ очищен');
 }else if(action==='pos-fulfillment'){
  const o=current();if(['cancelled','written-off','refunded'].includes(o.status))throw Error('Заказ закрыт');if(!['new','preparing','ready','onway','delivered'].includes(b.status))throw Error('Неверный статус');if(['onway','delivered'].includes(b.status)&&o.orderType!=='delivery')throw Error('Это не доставка');o.fulfillmentStatus=b.status;touch(o,'fulfillment','Статус: '+b.status);
 }else if(action==='pos-print'){
  const o=current();touch(o,b.kind==='precheck'?'precheck':'receipt-print','Документ подготовлен для печати браузером');
 }else if(action==='pos-promotion'){
  const name=String(b.name||'').trim();if(!name)throw Error('Укажите название');if(!['bogo','percent'].includes(b.kind))throw Error('Выберите тип акции');if(b.productId&&!s.products.some(p=>p.id===b.productId))throw Error('Товар не найден');const dateValid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T12:00Z').toISOString().slice(0,10)===d;if(b.start&&!dateValid(b.start)||b.end&&!dateValid(b.end)||b.start&&b.end&&b.start>b.end)throw Error('Проверьте даты');const timeValid=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)||t==='24:00';const timeFrom=b.timeFrom||'00:00',timeTo=b.timeTo||'24:00';if(!timeValid(timeFrom)||!timeValid(timeTo)||timeFrom>=timeTo)throw Error('Проверьте время акции');const entry={id:b.id||uid(),name,kind:b.kind,productId:b.productId||'',category:String(b.category||''),start:b.start||'',end:b.end||'',timeFrom,timeTo,percent:number(b.percent||0,0,100),minQty:number(b.minQty||2,1,10000),minTotal:number(b.minTotal||0),active:b.active===true};if(b.id){const old=s.posPromotions.find(p=>p.id===b.id);if(!old)throw Error('Акция не найдена');Object.assign(old,entry);}else s.posPromotions.push(entry);
 }else if(action==='pos-client-discount'){
  const c=s.clients.find(c=>c.id===b.clientId);if(!c)throw Error('Клиент не найден');c.discountPercent=number(b.discountPercent,0,100);c.cardNumber=String(b.cardNumber||'').slice(0,100);
 }else if(action==='pos-certificate'){
  const code=String(b.code||'').trim();if(code.length<6||code.length>100||s.posCertificates.some(c=>c.code===code))throw Error('Укажите уникальный код от 6 до 100 символов');const amount=number(b.amount,.01);if(b.expires&&(!/^\d{4}-\d{2}-\d{2}$/.test(b.expires)||new Date(b.expires+'T12:00Z').toISOString().slice(0,10)!==b.expires))throw Error('Неверная дата');s.posCertificates.push({id:uid(),code,balance:amount,initialAmount:amount,expires:b.expires||'',history:[],createdAt:new Date().toISOString(),source:'opening-balance'});
 }else return false;return true;
}
