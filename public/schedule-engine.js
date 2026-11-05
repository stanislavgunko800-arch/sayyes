// Schedule values are validated independently of the UI and shared by the API and preview.
export const scheduleMinutes=t=>{if(t==='24:00')return 1440;if(!/^\d{2}:\d{2}$/.test(t||''))throw Error('Время должно быть в формате ЧЧ:ММ');const [h,m]=t.split(':').map(Number);if(h>23||m>59)throw Error('Неверное время');return h*60+m;};
export const scheduleBreaks=g=>Array.isArray(g.breaks)?g.breaks:g.breakStart&&g.breakEnd?[{start:g.breakStart,end:g.breakEnd}]:[];
export const defaultAbsenceTypes=()=>[{id:'off',name:'Нерабочий день',color:'#e6e8e5'},{id:'sick',name:'Больничный',color:'#dceafb'},{id:'vacation',name:'Отпуск',color:'#e9dff8'},{id:'unpaid',name:'Выходной за свой счёт',color:'#f9e9d4'},{id:'absent',name:'Прогул',color:'#fadede'},{id:'paid-off',name:'Оплачиваемый выходной',color:'#f7efb7'}].map(t=>({...t,system:true}));
export function normalizeSchedule(s,b){
 if(!s.employees.some(e=>e.id===b.employeeId))throw Error('Сотрудник не найден');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||new Date(b.date+'T12:00Z').toISOString().slice(0,10)!==b.date)throw Error('Неверная дата');
 const typeId=b.typeId||(b.off?'off':'work'),off=typeId!=='work';if(off&&!s.absenceTypes.some(t=>t.id===typeId))throw Error('Тип отсутствия не найден');
 const g={employeeId:b.employeeId,date:b.date,typeId,off,start:b.start||'10:00',end:b.end||'20:00',breaks:[]};
 if(!off){if(scheduleMinutes(g.end)<=scheduleMinutes(g.start))throw Error('Конец рабочего дня должен быть позже начала');
 const breaks=b.breaks??(b.breakStart||b.breakEnd?[{start:b.breakStart,end:b.breakEnd}]:[]);if(!Array.isArray(breaks)||breaks.length>20)throw Error('Не более 20 перерывов');
 g.breaks=breaks.map(x=>({start:x.start,end:x.end})).sort((a,b)=>scheduleMinutes(a.start)-scheduleMinutes(b.start));
 let previous=scheduleMinutes(g.start);for(const br of g.breaks){const start=scheduleMinutes(br.start),end=scheduleMinutes(br.end);if(start<previous||end<=start||end>scheduleMinutes(g.end))throw Error('Перерывы должны быть внутри рабочего дня и не пересекаться');previous=end;}
 }
 g.breakStart=g.breaks[0]?.start||'';g.breakEnd=g.breaks[0]?.end||'';return g;
}
export function scheduleConflicts(s,g){return s.appointments.filter(a=>a.employeeId===g.employeeId&&a.date===g.date&&!['cancelled','refunded'].includes(a.status)&&(g.off||a.start<scheduleMinutes(g.start)||a.start+a.duration>scheduleMinutes(g.end)||scheduleBreaks(g).some(br=>a.start<scheduleMinutes(br.end)&&a.start+a.duration>scheduleMinutes(br.start))));}
export function applyScheduleEntries(s,entries,allowConflicts=false){
 const normalized=[...new Map(entries.map(b=>{const g=normalizeSchedule(s,b);return [g.employeeId+'|'+g.date,g];})).values()];const conflicts=normalized.flatMap(g=>scheduleConflicts(s,g));
 if(conflicts.length&&!allowConflicts)throw Error('График конфликтует с записями ('+conflicts.length+'). Перенесите записи или подтвердите сохранение графика без их отмены.');
 const keys=new Set(normalized.map(g=>g.employeeId+'|'+g.date));s.schedules=s.schedules.filter(g=>!keys.has(g.employeeId+'|'+g.date)).concat(normalized);return normalized;
}
export function expandScheduleSelection(s,b){
 if(!Array.isArray(b.cells)||!b.cells.length||b.cells.length>3660)throw Error('Выберите от 1 до 3660 ячеек');
 const mode=b.mode||'range';if(!['range','weekdays','cycle'].includes(mode))throw Error('Неверный шаблон');
 const count=Number(b.interval||1),unit=b.unit||'days',days=count*(unit==='weeks'?7:1);if(!['days','weeks'].includes(unit)||!Number.isInteger(days)||days<1||days>366)throw Error('Интервал от 1 до 366 дней');
 const on=Number(b.onDays||2),off=Number(b.offDays||2);if(!Number.isInteger(on)||!Number.isInteger(off)||on<1||off<1||on>31||off>31)throw Error('Цикл: от 1 до 31 рабочего и выходного дня');
 const weekdays=b.weekdays||[];if(mode==='weekdays'&&(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)))throw Error('Выберите дни недели');
 const entries=new Map();for(const c of b.cells){normalizeSchedule(s,{...c,off:true});const e=s.employees.find(e=>e.id===c.employeeId);if(e.fired||e.archived)throw Error('График уволенного или архивного сотрудника недоступен для изменения');
 for(let i=0;i<days;i++){const date=new Date(Date.parse(c.date)+i*86400000).toISOString().slice(0,10),weekday=new Date(date+'T12:00Z').getUTCDay();const work=mode==='range'||mode==='weekdays'&&weekdays.includes(weekday)||mode==='cycle'&&i%(on+off)<on;
 const row={...b,employeeId:c.employeeId,date,typeId:work?(b.typeId||'work'):'off'};entries.set(c.employeeId+'|'+date,row);}}
 if(entries.size>3660)throw Error('Не более 3660 дней сотрудников за одно сохранение');return [...entries.values()];
}
