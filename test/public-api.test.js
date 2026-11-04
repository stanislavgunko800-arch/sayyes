import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
test('protected admin API and public booking expose no client or financial data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sayyes-public-')),port=3297,password='test-only-password-123';
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_PASSWORD:password,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
 const stopped=once(child,'exit');let log='';child.stderr.on('data',b=>log+=b);
 try{
  await Promise.race([new Promise(resolve=>child.stdout.on('data',b=>{if(String(b).includes('listening'))resolve();})),stopped.then(()=>{throw Error('Server exited: '+log);}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),5000);t.unref();})]);
  const base='http://127.0.0.1:'+port,auth='Basic '+Buffer.from('admin:'+password).toString('base64');
  assert.equal((await fetch(base+'/api/state')).status,401);
  assert.equal((await fetch(base+'/api/state',{headers:{Authorization:auth}})).status,200);
  const visible=await (await fetch(base+'/api/public-state')).json();assert(!('clients'in visible));assert(!('sales'in visible));assert(!('commission'in visible.employees[0]));
  const post=(path,b,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b)});
  const holdToken=crypto.randomUUID(),manageToken=crypto.randomUUID(),booking={employeeId:'1',serviceId:'1',date:'2027-12-10',time:'10:00'};
  assert.equal((await post('/api/hold-slot',{...booking,token:holdToken})).status,200);
  assert.equal((await post('/api/public-book',{...booking,holdToken,manageToken,name:'Secret Client',phone:'555'})).status,200);
  const after=await (await fetch(base+'/api/public-state')).json();const serialized=JSON.stringify(after);assert(!serialized.includes('Secret Client'));assert(!serialized.includes('555'));assert(!serialized.includes(manageToken));assert.equal(after.appointments.length,1);
  const managed=await (await fetch(base+'/api/manage-booking',{headers:{'X-Booking-Token':manageToken}})).json();assert.equal(managed.service,'Стрижка и укладка');assert(!('clientId'in managed));
  assert.equal((await post('/api/cancel-booking',{token:manageToken})).status,200);
  assert.equal((await post('/api/shift-open',{opening:0})).status,401);
  assert.equal((await post('/api/shift-open',{opening:0},{Authorization:auth,Origin:'https://other.invalid'})).status,403);
 }finally{child.kill();await stopped;await rm(dir,{recursive:true,force:true});}
});
