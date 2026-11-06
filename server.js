import {seedSayYesStaff} from './public/staff-seed.js';
import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {initial,upgrade,mutate} from './public/domain.js';
import {authenticate,login,logout,acceptInvite,inviteInfo,accessView,accessMutation,changePassword,revokeEmployment} from './lib/security.js';
import {authorizeMutation,projectState} from './lib/authorization.js';
const root=path.dirname(fileURLToPath(import.meta.url)),dir=process.env.DATA_DIR||path.join(root,'data');
await mkdir(dir,{recursive:true});const file=path.join(dir,'salon.json');let state;
try{state=upgrade(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;state=initial();await writeFile(file,JSON.stringify(state),{mode:0o600});}
if(seedSayYesStaff(state)){state=upgrade(state);await writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file+'.tmp',file);}
const adminPassword=process.env.ADMIN_PASSWORD||'';
if(process.env.NODE_ENV==='production'&&adminPassword.length<12)throw Error('Для production задайте ADMIN_PASSWORD длиной от 12 символов');
const publicApi=new Set(['/api/public-state','/api/manage-booking','/api/public-book','/api/hold-slot','/api/cancel-booking','/api/auth/session','/api/auth/login','/api/auth/logout','/api/auth/invite','/api/auth/accept']);
let queue=Promise.resolve();const failures=new Map();
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const cookie=(res,token)=>res.setHeader('Set-Cookie','sayyes_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+(token?'43200':'0')+(process.env.NODE_ENV==='production'?'; Secure':''));
const save=async next=>{await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await rename(file+'.tmp',file);state=next;};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 try{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 let user=authenticate(state,req,adminPassword);
 if(url.startsWith('/api/')&&!publicApi.has(url)&&!user)return send(res,401,{error:'Войдите в SayYes'});
 if(req.method==='POST'){
  if(!(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'Требуется JSON'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Недопустимый источник запроса'});
  if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,{error:'Недопустимый источник запроса'});
 }
 if(url==='/api/auth/session'&&req.method==='GET')return send(res,200,{user:user||null});
 if(url==='/api/auth/invite'&&req.method==='GET')return send(res,200,inviteInfo(state,req.headers['x-invite-token']));
 if(url==='/api/access'&&req.method==='GET')return send(res,200,accessView(state,user));
 if(url==='/api/public-state'&&req.method==='GET'){
 const visible={};for(const key of ['employees','services','schedules','workplaces'])visible[key]=structuredClone(state[key]);
 visible.schedules=visible.schedules.map(({employeeId,date,start,end,off,breakStart,breakEnd,breaks})=>({employeeId,date,start,end,off,breakStart,breakEnd,breaks}));
 visible.employees=visible.employees.filter(e=>e.active&&!e.fired&&!e.archived&&e.onlineEnabled!==false).map(({id,name,lastName,role,photo,serviceIds})=>({id,name,lastName,role,photo,serviceIds,active:true}));
 visible.services=visible.services.filter(v=>v.active).map(({id,name,price,priceFrom,duration,employeeIds,category})=>({id,name,price,priceFrom,duration,employeeIds,category,active:true,materials:[],baseCost:0}));
 visible.bookingLinks=state.bookingLinks.filter(l=>l.active).map(({id,serviceId,employeeId})=>({id,serviceId,employeeId}));
 visible.settings=Object.fromEntries(['name','address','phone','description','online','slotStep','leadHours','requireConfirmation','holdMinutes','allowClientCancel'].map(k=>[k,state.settings[k]]));
 visible.appointments=state.appointments.filter(a=>!['cancelled','refunded'].includes(a.status)).map(a=>({employeeId:a.employeeId,workplaceId:a.workplaceId,date:a.date,start:a.start,duration:a.duration,status:'booked'}));
 visible.holds=state.holds.filter(h=>h.expiresAt>Date.now()&&h.token!==req.headers['x-booking-hold']).map(({token,...h})=>h);return send(res,200,visible);
 }
 if(url==='/api/manage-booking'&&req.method==='GET'){
  const token=req.headers['x-booking-token'];if(!/^[a-f0-9-]{36}$/.test(token||''))return send(res,404,{error:'Ссылка недействительна'});
  const a=state.appointments.find(a=>a.manageToken===token);if(!a)return send(res,404,{error:'Запись не найдена'});return send(res,200,{service:a.service,date:a.date,time:a.time,status:a.status,allowCancel:state.settings.allowClientCancel});
 }
 if(url==='/api/state'&&req.method==='GET')return send(res,200,{...projectState(state,user),sessionUser:user,...(user.root||user.permissions?.['access.manage']?{accessAccounts:accessView(state,user).accounts}:{})});
 if(url.startsWith('/api/')&&req.method==='POST'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>(['/api/import-client-batch','/api/schedule-grid'].includes(url)?1000000:50000))return send(res,413,{error:'Слишком большой запрос'});}
  const b=JSON.parse(body);const authAttempt=['/api/auth/login','/api/auth/accept'].includes(url),ip=req.socket.remoteAddress;
  if(authAttempt){const entry=failures.get(ip);if(entry&&entry.until>Date.now()&&entry.count>=30)return send(res,429,{error:'Слишком много попыток. Повторите через 15 минут.'});}
  let result={ok:true},sessionToken=null;
  const task=queue.then(async()=>{
   const next=structuredClone(state);user=authenticate(next,req,adminPassword);
   if(!publicApi.has(url)&&!user)throw Object.assign(Error('Сессия завершена. Войдите снова'),{status:401});
   if(url==='/api/auth/login'){const r=await login(next,b,adminPassword);result={user:r.user};sessionToken=r.token;}
   else if(url==='/api/auth/accept'){const r=await acceptInvite(next,b,adminPassword);result={user:r.user};sessionToken=r.token;}
   else if(url==='/api/auth/logout'){logout(next,req);sessionToken='';}
   else if(url==='/api/auth/password'){const r=await changePassword(next,user,b,adminPassword);sessionToken=r.token;}
   else if(url==='/api/access/action'){result=await accessMutation(next,user,b.action,b,adminPassword);}
   else{
    let action=url.slice(5);
    if(action==='public-book'){
     if(!/^[a-f0-9-]{36}$/.test(b.manageToken||'')||!/^[a-f0-9-]{36}$/.test(b.holdToken||''))throw Error('Выберите свободное время заново');action='appointments';b.publicMode=true;
    }else if(!['hold-slot','cancel-booking'].includes(action)){authorizeMutation(next,user,action,b);}
    b._actor=user?{id:user.id,name:user.name}:null;mutate(next,action,b);
    if(!publicApi.has(url)){if(next.audit[0]){next.audit[0].actorId=user.id;next.audit[0].actorName=user.name;}revokeEmployment(next,user);}
   }
   await save(next);
  });queue=task.catch(()=>{});
  try{await task;}catch(e){if(authAttempt){const old=failures.get(ip);failures.set(ip,{count:old&&old.until>Date.now()?old.count+1:1,until:old&&old.until>Date.now()?old.until:Date.now()+900000});if(failures.size>10000)for(const [key,value]of failures)if(value.until<Date.now())failures.delete(key);}throw e;}
  if(sessionToken!==null)cookie(res,sessionToken);return send(res,200,result);
 }
 if(url.startsWith('/api/'))return send(res,404,{error:'Метод не найден'});
 const assets={'/service-seed.js':'service-seed.js','/menu-seed.js':'menu-seed.js','/pos-domain.js':'pos-domain.js','/bar-domain.js':'bar-domain.js','/schedule-engine.js':'schedule-engine.js','/access-policy.js':'access-policy.js','/reports.js':'reports.js','/logo.png':'logo.png','/operations.js':'operations.js','/domain.js':'domain.js','/app.js':'app.js','/style.css':'style.css'};const staffAsset=/^\/staff\/(araik|julia|sofia|alexander|anneta|violetta|anka|sasha|mariam|alla)\.jpg$/.test(url);const asset=staffAsset?url.slice(1):/^\/menu\/(curd-ring|cookie|date-candies|syrniki|pancakes|mac-cheese|pumpkin-soup)\.jpg$/.test(url)?url.slice(1):assets[url]||'index.html';
 res.writeHead(200,{'Content-Type':asset.endsWith('.jpg')?'image/jpeg':asset.endsWith('.png')?'image/png':asset.endsWith('.js')?'text/javascript':asset.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'public',asset)));
 }catch(e){send(res,e.status||400,{error:e.message});}
}).listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log('SayYes listening on port '+(process.env.PORT||3000)));
