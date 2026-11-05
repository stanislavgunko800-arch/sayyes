import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,mutate,schedule,slots} from '../public/domain.js';
import {expandScheduleSelection,scheduleBreaks} from '../public/schedule-engine.js';
import {workloadReport} from '../public/reports.js';
import {authorizeMutation} from '../lib/authorization.js';
import {rolePermissions} from '../public/access-policy.js';
const date='2026-11-09';
test('multiple breaks and 24:00 end affect online slots and workload',()=>{
 const s=initial();mutate(s,'schedule-grid',{entries:[{employeeId:'1',date,start:'09:00',end:'24:00',breaks:[{start:'12:00',end:'13:00'},{start:'16:00',end:'17:00'}]}]});
 const available=slots(s,'1','1',date);assert.ok(available.includes('23:00'));assert.ok(!available.includes('12:00'));assert.ok(!available.includes('16:00'));assert.ok(available.includes('13:00'));assert.equal(scheduleBreaks(schedule(s,'1',date)).length,2);assert.equal(workloadReport(s,{from:date,to:date,employeeId:'1'})[0].workHours,13);
 assert.throws(()=>mutate(s,'schedule-grid',{entries:[{employeeId:'1',date,start:'09:00',end:'24:00',breaks:[{start:'12:00',end:'14:00'},{start:'13:00',end:'15:00'}]}]}),/пересекаться/);
});
test('weekly and cycle selections expand deterministically across months',()=>{
 const s=initial();const cells=[{employeeId:'1',date:'2026-11-30'},{employeeId:'2',date:'2026-11-30'}];
 let rows=expandScheduleSelection(s,{cells,mode:'cycle',onDays:2,offDays:2,interval:1,unit:'weeks'});assert.equal(rows.length,14);assert.deepEqual(rows.slice(0,7).map(r=>r.typeId),['work','work','off','off','work','work','off']);
 rows=expandScheduleSelection(s,{cells,mode:'weekdays',weekdays:[1,3,5],interval:1,unit:'weeks'});assert.deepEqual(rows.slice(0,7).map(r=>r.typeId),['work','off','work','off','work','off','off']);
 mutate(s,'schedule-grid',{entries:rows});assert.equal(schedule(s,'2','2026-12-02').off,false);assert.equal(schedule(s,'2','2026-12-01').off,true);
});
test('conflicting batch is atomic; explicit confirmation preserves client visits',()=>{
 const s=initial();mutate(s,'appointments',{employeeId:'1',serviceId:'1',name:'Тест',phone:'+995111111111',date,time:'10:00'});const visits=structuredClone(s.appointments),before=structuredClone(s.schedules);
 const entries=[{employeeId:'2',date,off:true},{employeeId:'1',date,off:true}];assert.throws(()=>mutate(s,'schedule-grid',{entries}),/конфликтует/);assert.deepEqual(s.schedules,before);
 mutate(s,'schedule-grid',{entries,allowConflicts:true});assert.deepEqual(s.appointments,visits);assert.deepEqual(slots(s,'1','1',date),[]);
});
test('custom absences, editable templates and copying with or without breaks',()=>{
 const s=initial();mutate(s,'absence-type',{name:'Обучение',color:'#abc123'});const type=s.absenceTypes.at(-1);mutate(s,'schedule-template',{name:'Учебная неделя',mode:'range',typeId:type.id,interval:1,unit:'weeks'});const template=s.staffTemplates.at(-1);mutate(s,'schedule-template',{...template,name:'Обучение команды',interval:2});assert.equal(s.staffTemplates.length,1);assert.equal(s.staffTemplates[0].interval,2);
 mutate(s,'schedule-grid',{entries:[{employeeId:'1',date,start:'09:00',end:'18:00',breaks:[{start:'12:00',end:'13:00'},{start:'15:00',end:'15:30'}]},{employeeId:'1',date:'2026-11-10',typeId:type.id}]});
 mutate(s,'schedule-copy',{sourceEmployeeId:'1',employeeIds:['2','3'],from:date,to:'2026-11-10',includeBreaks:true});assert.equal(scheduleBreaks(schedule(s,'2',date)).length,2);assert.equal(schedule(s,'3','2026-11-10').typeId,type.id);
 mutate(s,'schedule-copy',{sourceEmployeeId:'1',employeeIds:['4'],from:date,to:date,includeBreaks:false});assert.equal(scheduleBreaks(schedule(s,'4',date)).length,0);
 const before=structuredClone(s.schedules);assert.throws(()=>mutate(s,'schedule-grid',{entries:[{employeeId:'2',date,start:'08:00',end:'18:00'},{employeeId:'3',date,start:'23:00',end:'25:00'}]}));assert.deepEqual(s.schedules,before);
});
test('scoped schedule writes validate every cell, copy source and history',()=>{
 const s=initial(),p={employeeId:'1',permissions:{...rolePermissions('specialist'),'schedule.write':true},scope:{mode:'self',employeeIds:[],positionIds:[],historyDays:null}};
 assert.throws(()=>authorizeMutation(s,p,'schedule-grid',{entries:[{employeeId:'2',date}]}),{status:403});assert.throws(()=>authorizeMutation(s,p,'schedule-copy',{sourceEmployeeId:'2',employeeIds:['1'],from:date,to:date}),{status:403});assert.doesNotThrow(()=>authorizeMutation(s,p,'schedule-grid',{entries:[{employeeId:'1',date}]}));
});
