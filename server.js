import {createHash,timingSafeEqual} from 'node:crypto';
import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.DATA_DIR || path.join(root, 'data');
await mkdir(dir, {recursive:true});
const file = path.join(dir,'salon.json');
import {initial,upgrade,mutate} from './public/domain.js';
let state;
try {state=upgrade(JSON.parse(await readFile(file,'utf8')));} catch(e) {if(e.code!=='ENOENT')throw e;state=initial();await writeFile(file,JSON.stringify(state));}
const adminPassword=process.env.ADMIN_PASSWORD||'';
if(process.env.NODE_ENV==='production'&&adminPassword.length<12)throw Error('Для production задайте ADMIN_PASSWORD длиной от 12 символов');
const authorized=req=>{if(!adminPassword)return true;const header=req.headers.authorization||'';if(!header.startsWith('Basic '))return false;const raw=Buffer.from(header.slice(6),'base64').toString(),split=raw.indexOf(':');if(raw.slice(0,split)!=='admin')return false;return timingSafeEqual(createHash('sha256').update(raw.slice(split+1)).digest(),createHash('sha256').update(adminPassword).digest());};
const publicApi=new Set(['/api/public-state','/api/manage-booking','/api/public-book','/api/hold-slot','/api/cancel-booking']);
let queue=Promise.resolve();
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 try{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(url.startsWith('/api/')&&!publicApi.has(url)&&!authorized(req)){res.setHeader('WWW-Authenticate','Basic realm="SayYes"');return send(res,401,{error:'Требуется вход администратора'});}
 if(req.method==='POST'){
  if(!(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'Требуется JSON'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Недопустимый источник запроса'});
 }
 if(url==='/api/public-state'&&req.method==='GET'){
 const visible={};for(const key of ['employees','services','schedules','workplaces'])visible[key]=structuredClone(state[key]);
 visible.employees=visible.employees.filter(e=>e.active).map(({id,name,role})=>({id,name,role,active:true}));
 visible.services=visible.services.filter(v=>v.active).map(({id,name,price,duration,employeeIds,category})=>({id,name,price,duration,employeeIds,category,active:true,materials:[],baseCost:0}));
 visible.settings=Object.fromEntries(['name','address','phone','description','online','slotStep','leadHours','requireConfirmation','holdMinutes','allowClientCancel'].map(k=>[k,state.settings[k]]));
 visible.appointments=state.appointments.filter(a=>!['cancelled','refunded'].includes(a.status)).map(a=>({employeeId:a.employeeId,workplaceId:a.workplaceId,date:a.date,start:a.start,duration:a.duration,status:'booked'}));
 visible.holds=state.holds.filter(h=>h.expiresAt>Date.now()&&h.token!==req.headers['x-booking-hold']).map(({token,...h})=>h);return send(res,200,visible);
 }
 if(url==='/api/manage-booking'&&req.method==='GET'){
  const token=req.headers['x-booking-token'];if(!/^[a-f0-9-]{36}$/.test(token||''))return send(res,404,{error:'Ссылка недействительна'});
  const a=state.appointments.find(a=>a.manageToken===token);if(!a)return send(res,404,{error:'Запись не найдена'});return send(res,200,{service:a.service,date:a.date,time:a.time,status:a.status,allowCancel:state.settings.allowClientCancel});
 }
 if(url==='/api/state'&&req.method==='GET')return send(res,200,state);
 if(url.startsWith('/api/')&&req.method==='POST'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>(url==='/api/import-client-batch'?1000000:20000))return send(res,413,{error:'Слишком большой запрос'});}
  const b=JSON.parse(body);let action=url.slice(5);
  if(action==='public-book'){
   if(!/^[a-f0-9-]{36}$/.test(b.manageToken||'')||!/^[a-f0-9-]{36}$/.test(b.holdToken||''))throw Error('Выберите свободное время заново');
   action='appointments';b.publicMode=true;
  }

  const task=queue.then(async()=>{const previous=structuredClone(state);try{const next=structuredClone(state);mutate(next,action,b);await writeFile(file+'.tmp',JSON.stringify(next));await rename(file+'.tmp',file);state=next;}catch(e){state=previous;throw e;}});queue=task.catch(()=>{});await task;return send(res,200,{ok:true});
 }
 const asset=url==='/logo.png'?'logo.png':url==='/operations.js'?'operations.js':url==='/domain.js'?'domain.js':url==='/app.js'?'app.js':url==='/style.css'?'style.css':'index.html';
 res.writeHead(200,{'Content-Type':asset.endsWith('.png')?'image/png':asset.endsWith('.js')?'text/javascript':asset.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'public',asset)));
 }catch(e){send(res,400,{error:e.message});}
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('SayYes listening on port '+(process.env.PORT||3000)));
