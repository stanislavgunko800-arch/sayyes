// Shared permission vocabulary; the server is the authority for all checks.
export const permissionGroups = [
 ['bookings','Записи',[['read','Просматривать записи'],['create','Создавать записи'],['move','Переносить записи'],['cancel','Отменять записи'],['confirm','Подтверждать записи']]],
 ['schedule','График',[['read','Просматривать график'],['write','Изменять график']]],
 ['clients','Клиенты',[['read','Просматривать клиентов'],['contacts','Видеть телефоны, email и заметки'],['write','Изменять клиентов']]],
 ['finance','Финансы',[['read','Просматривать чеки и кассу'],['payment','Принимать оплату'],['refund','Оформлять возвраты'],['cash','Открывать/закрывать смену, вносить/изымать'],['expenses','Учитывать расходы'],['settings','Настраивать способы оплаты']]],
 ['stock','Товары и склад',[['read','Просматривать товары и остатки'],['write','Изменять товары и проводить операции']]],
 ['staff','Сотрудники',[['read','Просматривать сотрудников'],['write','Создавать, изменять, увольнять сотрудников']]],
 ['services','Услуги',[['read','Просматривать каталог'],['write','Изменять услуги и материалы']]],
 ['payroll','Зарплата',[['read','Просматривать начисления'],['write','Менять ставки, выдавать зарплату и авансы']]],
 ['settings','Настройки',[['read','Просматривать настройки'],['write','Изменять настройки и бонусную программу']]],
 ['reports','Отчёты',[['read','Просматривать отчёты по доступным данным']]],
 ['audit','Журнал действий',[['read','Просматривать историю действий']]],
 ['access','Доступ',[['manage','Управлять доступом сотрудников']]]
];
export const permissionKeys=permissionGroups.flatMap(([g,,rights])=>rights.map(([r])=>g+'.'+r));
export const roleNames={owner:'Владелец',manager:'Менеджер',administrator:'Администратор',accountant:'Бухгалтер',specialist:'Специалист',callcenter:'Колл-центр',viewer:'Только просмотр',systemmanager:'Менеджер системы'};
export function rolePermissions(role){
 if(!roleNames[role])throw Error('Неизвестная роль');
 const grants={owner:permissionKeys,manager:permissionKeys.filter(k=>!['access.manage','payroll.write','settings.write'].includes(k)),administrator:['bookings.read','bookings.create','bookings.move','bookings.cancel','bookings.confirm','schedule.read','clients.read','clients.contacts','clients.write','services.read','stock.read','finance.read','finance.payment','finance.cash'],accountant:['finance.read','finance.refund','finance.expenses','finance.settings','payroll.read','payroll.write','staff.read','services.read','stock.read','reports.read'],specialist:['bookings.read','schedule.read','clients.read','clients.contacts','services.read'],callcenter:['bookings.read','bookings.create','bookings.move','bookings.cancel','bookings.confirm','schedule.read','clients.read','clients.contacts','clients.write','services.read'],viewer:permissionKeys.filter(k=>k.endsWith('.read')||k==='clients.contacts'),systemmanager:['staff.read','staff.write','services.read','schedule.read','access.manage']};
 return Object.fromEntries(permissionKeys.map(k=>[k,grants[role].includes(k)]));
}
export function normalizeAccess(input){
 if(!roleNames[input.role])throw Error('Выберите роль');
 const permissions=Object.fromEntries(permissionKeys.map(k=>[k,input.permissions?.[k]===true]));
 for(const [group,,rights]of permissionGroups){if(rights.some(([right])=>right!=='read'&&permissions[group+'.'+right])&&rights.some(([right])=>right==='read')&&!permissions[group+'.read'])throw Error('Сначала разрешите просмотр раздела: '+group);}
 if(permissions['access.manage']&&!permissions['staff.read'])throw Error('Управление доступом требует просмотра сотрудников');
 const scope=input.scope||{};if(!['all','self','selected'].includes(scope.mode||'all'))throw Error('Неверная область доступа');
 const ids=key=>Array.isArray(scope[key])?[...new Set(scope[key].map(String))]:[];
 const historyDays=scope.historyDays===''||scope.historyDays==null?null:Number(scope.historyDays);
 if(historyDays!==null&&(!Number.isInteger(historyDays)||historyDays<1||historyDays>3650))throw Error('История: от 1 до 3650 дней');
 const result={mode:scope.mode||'all',employeeIds:ids('employeeIds'),positionIds:ids('positionIds'),historyDays};
 if(result.mode==='selected'&&!result.employeeIds.length&&!result.positionIds.length)throw Error('Выберите сотрудников или должности');
 return {role:input.role,permissions,scope:result};
}
export function hasPermission(principal,key){return principal?.root===true||principal?.permissions?.[key]===true;}
export function actionPermissions(action,b={}){
 const groups={
 'appointments':['bookings.create','clients.contacts'],'appointment-edit':['bookings.move'],'appointment-confirm':['bookings.confirm'],
 'schedule-grid':['schedule.write'],'schedule-selection':['schedule.write'],'schedule-copy':['schedule.write'],'schedule-template':['schedule.write'],'absence-type':['schedule.write'],'schedule':['schedule.write'],'schedule-pattern':['schedule.write'],'staff-schedule':['schedule.write'],'workplace-shift':['schedule.write'],
 'clients':['clients.write','clients.contacts'],'import-clients':['clients.write','clients.contacts'],'import-client-batch':['clients.write','clients.contacts'],
 'employees':['staff.write'],'position':['staff.write'],'staff-order':['staff.write'],'staff-status':['staff.write'],
 'services':['services.write'],'categories':['services.write'],'service-order':['services.write'],'expense-template':['services.write'],'apply-expense-template':['services.write'],
 'bar-item':['stock.write'],'bar-production':['stock.write'],'bar-category':['stock.write'],'bar-workshop':['stock.write'],'bar-pack':['stock.write'],'bar-account':['finance.settings'],'bar-finance-category':['finance.settings'],'bar-transaction':['finance.expenses'],'products':['stock.write'],'productTypes':['stock.write'],'units':['stock.write'],'suppliers':['stock.write'],'warehouses':['stock.write'],'purchase':['stock.write'],'transfer':['stock.write'],'purchase-document':['stock.write'],'writeoff':['stock.write'],'inventory-count':['stock.write'],'supplier-order':['stock.write'],'archive-product':['stock.write'],
 'sale':['finance.payment'],'refund':['finance.refund'],'bar-order':['finance.payment'],'bar-order-status':['finance.payment'],'shift-open':['finance.cash'],'shift-close':['finance.cash'],'cash':['finance.cash'],'expenses':['finance.expenses'],'payment-method':['finance.settings'],'terminal':['finance.settings'],
 'payout':['payroll.write'],'advances':['payroll.write'],
 'workplaces':['settings.write'],'zone':['settings.write'],'promotions':['settings.write'],'settings':['settings.write'],'extended-settings':['settings.write'],'message-template':['settings.write'],'booking-link':['settings.write']};
 if(action==='status')return b.status==='paid'?['finance.payment']:b.status==='cancelled'?['bookings.cancel']:null;
 return groups[action]||null;
}
