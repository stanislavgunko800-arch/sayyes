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
let queue=Promise.resolve();
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 try{
 if(url==='/api/state'&&req.method==='GET')return send(res,200,state);
 if(url.startsWith('/api/')&&req.method==='POST'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)return send(res,413,{error:'Слишком большой запрос'});}
  const b=JSON.parse(body);
  const task=queue.then(async()=>{const previous=structuredClone(state);try{const next=structuredClone(state);mutate(next,url.slice(5),b);await writeFile(file+'.tmp',JSON.stringify(next));await rename(file+'.tmp',file);state=next;}catch(e){state=previous;throw e;}});queue=task.catch(()=>{});await task;return send(res,200,{ok:true});
 }
 const asset=url==='/domain.js'?'domain.js':url==='/app.js'?'app.js':url==='/style.css'?'style.css':'index.html';
 res.writeHead(200,{'Content-Type':asset.endsWith('.js')?'text/javascript':asset.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'public',asset)));
 }catch(e){send(res,400,{error:e.message});}
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('SayYes listening on port '+(process.env.PORT||3000)));
