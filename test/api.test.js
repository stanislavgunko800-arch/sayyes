import {initial} from '../public/domain.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
test('booking, overlap protection, payment, cancellation and persistence',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sayyes-test-'));
 const fixture=initial();fixture.staffImports=['sayyes-staff-2026-11-06'];await writeFile(dir+'/salon.json',JSON.stringify(fixture));
 let child;
 const start=async()=>{child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3199',DATA_DIR:dir},stdio:['ignore','pipe','inherit']});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server exited before startup')})]);};
 const stop=async()=>{const done=once(child,'exit');child.kill();await done;};
 const call=async(url,body)=>{const r=await fetch('http://127.0.0.1:3199/api/'+url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,data:await r.json()};};
 try{
 await start();let s=(await call('state')).data;assert.equal(s.employees.length,7);
 const b={name:'Тест',phone:'+995000000000',serviceId:'1',employeeId:'1',date:'2026-11-04',time:'10:00'};
 assert.equal((await call('appointments',b)).status,200);
 assert.equal((await call('appointments',{...b,time:'10:30'})).status,400);
 assert.equal((await call('appointments',{...b,time:'19:30'})).status,400);
 assert.equal((await call('appointments',{...b,time:'11:00'})).status,200);
 s=(await call('state')).data;assert.equal(s.clients.length,1);assert.equal(s.appointments.length,2);
 assert.equal((await call('shift-open',{opening:100})).status,200);
 assert.equal((await call('status',{id:s.appointments[0].id,status:'paid',method:'cash'})).status,200);
 assert.equal((await call('status',{id:s.appointments[1].id,status:'cancelled'})).status,200);
 assert.equal((await call('appointments',{...b,time:'11:00'})).status,200);
 assert.equal((await call('employees',{name:'Новый мастер',role:'Стилист'})).status,200);
 assert.equal((await call('services',{name:'Уход',price:-1,duration:30})).status,400);
 await stop();await start();s=(await call('state')).data;assert.equal(s.employees.length,8);assert.equal(s.appointments[0].status,'paid');assert.equal(s.appointments.length,3);
 const page=await fetch('http://127.0.0.1:3199/book');assert.match(await page.text(),/SayYes/);
 }finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
