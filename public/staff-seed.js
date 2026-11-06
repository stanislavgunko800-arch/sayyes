export const sayYesStaff=[
  {
    "slug": "irina",
    "name": "Ирина",
    "role": "Основатель студии Say Yes",
    "photo": ""
  },
  {
    "slug": "araik",
    "name": "Араик",
    "role": "Топ-барбер",
    "photo": "/staff/araik.jpg"
  },
  {
    "slug": "julia",
    "name": "Юлия",
    "role": "Топ-эксперт",
    "photo": "/staff/julia.jpg"
  },
  {
    "slug": "sofia",
    "name": "София",
    "role": "Старший мастер ногтевого сервиса",
    "photo": "/staff/sofia.jpg"
  },
  {
    "slug": "alexander",
    "name": "Александр",
    "role": "Топ-колорист",
    "photo": "/staff/alexander.jpg"
  },
  {
    "slug": "anneta",
    "name": "Аннета",
    "role": "Топ-барбер",
    "photo": "/staff/anneta.jpg"
  },
  {
    "slug": "violetta",
    "name": "Виолетта",
    "role": "Бровист",
    "photo": "/staff/violetta.jpg"
  },
  {
    "slug": "fedor",
    "name": "Федор",
    "role": "Барбер и топ-стилист",
    "photo": ""
  },
  {
    "slug": "anka",
    "name": "Анка",
    "role": "Визажист",
    "photo": "/staff/anka.jpg"
  },
  {
    "slug": "sasha",
    "name": "Саша",
    "role": "Младший мастер по маникюру",
    "photo": "/staff/sasha.jpg"
  },
  {
    "slug": "mariam",
    "name": "Мариам",
    "role": "Топ-стилист",
    "photo": "/staff/mariam.jpg"
  },
  {
    "slug": "alla",
    "name": "Алла",
    "role": "Топ-стилист",
    "photo": "/staff/alla.jpg"
  }
];
export function seedSayYesStaff(s){
 if(s.staffImports?.includes('sayyes-staff-2026-11-06'))return false;
 const normalize=n=>String(n||'').trim().toLowerCase().replaceAll('ё','е'),keep=new Set();
 for(const row of sayYesStaff){let e=s.employees.find(e=>e.id==='sayyes-staff-'+row.slug)||s.employees.find(e=>normalize(e.name)===normalize(row.name)&&!keep.has(e.id));if(!e){e={id:'sayyes-staff-'+row.slug,commission:0,phone:'',email:'',description:'',positionId:'',serviceIds:null};s.employees.push(e);}Object.assign(e,{name:row.name,role:row.role,photo:row.photo,active:true,onlineEnabled:true,fired:false,archived:false});keep.add(e.id);}
 const removed=[];for(const e of s.employees)if(!keep.has(e.id)){e.active=false;e.onlineEnabled=false;e.archived=true;e.rosterArchiveReason='Нет в актуальном списке от 06.11.2026';removed.push(e.id);}
 // Preserve employee IDs in appointments, schedules and financial records; revoke archived staff access.
 const disabled=new Set();for(const a of s.security?.accounts||[])if(removed.includes(a.employeeId)){a.enabled=false;delete a.invite;disabled.add(a.id);}if(s.security?.sessions)s.security.sessions=s.security.sessions.filter(x=>!disabled.has(x.accountId));
 s.employees.sort((a,b)=>{const rank=e=>sayYesStaff.findIndex(r=>normalize(r.name)===normalize(e.name));return (keep.has(a.id)?rank(a):1000)-(keep.has(b.id)?rank(b):1000);});
 s.staffImports??=[];s.staffImports.push('sayyes-staff-2026-11-06');return true;
}
