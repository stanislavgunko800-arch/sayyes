import {randomBytes,randomUUID,createHash,timingSafeEqual,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {permissionKeys,roleNames,rolePermissions,normalizeAccess,hasPermission} from '../public/access-policy.js';
import {scopedEmployees,forbidden} from './authorization.js';
const scrypt=promisify(scryptCallback),digest=x=>createHash('sha256').update(String(x)).digest('hex');
const error=(message,status=400)=>Object.assign(Error(message),{status});
const same=(a,b)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
export function initSecurity(s){s.security??={accounts:[],sessions:[],history:[]};return s.security;}
export const rootPrincipal=()=>({id:'root',name:'Владелец',login:'admin',root:true,role:'owner',permissions:rolePermissions('owner'),scope:{mode:'all',employeeIds:[],positionIds:[],historyDays:null}});
const eligible=(s,a)=>{const e=s.employees.find(e=>e.id===a.employeeId);return a.enabled&&e&&!e.fired&&!e.archived;};
const publicAccount=(s,a)=>({id:a.id,employeeId:a.employeeId,login:a.login,role:a.role,permissions:a.permissions,scope:a.scope,enabled:a.enabled,status:!eligible(s,a)?'disabled':a.password?'active':a.invite&&a.invite.expires>Date.now()?'invited':'pending',lastLoginAt:a.lastLoginAt||'',inviteExpires:a.invite?.expires||null});
const principal=(s,a)=>({...publicAccount(s,a),name:s.employees.find(e=>e.id===a.employeeId)?.name||a.login,root:false});
const log=(s,p,action,id,before,after)=>initSecurity(s).history.unshift({id:randomUUID(),at:new Date().toISOString(),actorId:p.id,actorName:p.name,action,accountId:id,before:before||null,after:after||null});
const revoke=(s,id)=>{s.security.sessions=s.security.sessions.filter(x=>x.accountId!==id);};
function loginKey(value){const text=String(value||'').trim().toLowerCase();if(!text||text.length>150||text==='admin')throw error('Укажите уникальный email или телефон сотрудника');if(text.includes('@')){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))throw error('Проверьте email');return text;}const digits=text.replace(/[\s()+-]/g,'');if(!/^\d{7,15}$/.test(digits))throw error('Телефон: от 7 до 15 цифр с кодом страны');return '+'+digits;}
function lookupLogin(value){try{return String(value).trim().toLowerCase()==='admin'?'admin':loginKey(value);}catch{return '';}}
async function passwordHash(value){if(typeof value!=='string'||value.length<12||value.length>256)throw error('Пароль должен содержать от 12 до 256 символов');const salt=randomBytes(16).toString('hex'),hash=(await scrypt(value,salt,64)).toString('hex');return {salt,hash};}
async function passwordMatches(value,password){if(typeof value!=='string'||value.length>256||!password)return false;const hash=(await scrypt(value,password.salt,64)).toString('hex');return same(hash,password.hash);}
export function authenticate(s,req,adminPassword){
 const sec=initSecurity(s),cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sayyes_session=')),token=cookie?.slice(15);
 if(cookie){const session=sec.sessions.find(x=>x.hash===digest(token)&&x.expires>Date.now());if(!session)return null;if(session.accountId==='root')return adminPassword&&session.rootFingerprint===digest(adminPassword)?rootPrincipal():null;const a=sec.accounts.find(a=>a.id===session.accountId);return a&&eligible(s,a)?principal(s,a):null;}
 const header=req.headers.authorization||'';if(header.startsWith('Basic ')){const raw=Buffer.from(header.slice(6),'base64').toString(),colon=raw.indexOf(':');return raw.slice(0,colon)==='admin'&&adminPassword&&same(raw.slice(colon+1),adminPassword)?rootPrincipal():null;}
 if(!adminPassword&&!sec.accounts.length)return {...rootPrincipal(),development:true};return null;
}
function sessionToken(s,accountId,adminPassword){const token=randomBytes(32).toString('base64url'),sec=initSecurity(s);sec.sessions=sec.sessions.filter(x=>x.expires>Date.now());sec.sessions.push({hash:digest(token),accountId,expires:Date.now()+12*3600000,...(accountId==='root'?{rootFingerprint:digest(adminPassword)}:{})});return token;}
export async function login(s,b,adminPassword){
 const key=lookupLogin(b.login);if(key==='admin'){if(!adminPassword||!same(b.password||'',adminPassword))throw error('Неверный логин или пароль',401);return {token:sessionToken(s,'root',adminPassword),user:rootPrincipal()};}
 const a=initSecurity(s).accounts.find(x=>x.login===key);if(!a||!eligible(s,a)||!await passwordMatches(b.password,a.password))throw error('Неверный логин или пароль',401);
 a.lastLoginAt=new Date().toISOString();log(s,principal(s,a),'login',a.id);return {token:sessionToken(s,a.id,adminPassword),user:principal(s,a)};
}
export function logout(s,req){const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sayyes_session='));if(cookie)initSecurity(s).sessions=initSecurity(s).sessions.filter(x=>x.hash!==digest(cookie.slice(15)));}
export async function acceptInvite(s,b,adminPassword){
 const sec=initSecurity(s),a=sec.accounts.find(a=>a.invite?.hash===digest(b.token)&&a.invite.expires>Date.now());if(!a||!eligible(s,a))throw error('Приглашение недействительно или истекло',400);
 const password=await passwordHash(b.password);a.password=password;delete a.invite;revoke(s,a.id);a.lastLoginAt=new Date().toISOString();log(s,principal(s,a),'invite-accepted',a.id);return {token:sessionToken(s,a.id,adminPassword),user:principal(s,a)};
}
export function inviteInfo(s,token){const a=initSecurity(s).accounts.find(a=>a.invite?.hash===digest(token)&&a.invite.expires>Date.now());if(!a||!eligible(s,a))throw error('Приглашение недействительно или истекло');return {name:s.employees.find(e=>e.id===a.employeeId)?.name,login:a.login,role:roleNames[a.role]};}
function mayGrant(s,p,config,employeeId){
 if(!hasPermission(p,'access.manage'))throw forbidden();if(p.root)return;
 if(!scopedEmployees(s,p).has(employeeId))throw forbidden();
 // Delegation cannot exceed the delegator's own effective rights or scope.
 if(permissionKeys.some(k=>config.permissions[k]&&!hasPermission(p,k)))throw error('Нельзя выдать права, которых нет у вашей учётной записи',403);
 const own=scopedEmployees(s,p),target=scopedEmployees(s,{...config,employeeId});if([...target].some(id=>!own.has(id)))throw error('Область доступа шире вашей',403);
 if(p.scope.historyDays&&(!config.scope.historyDays||config.scope.historyDays>p.scope.historyDays))throw forbidden();
}
export function accessView(s,p){if(!hasPermission(p,'access.manage'))throw forbidden();const ids=scopedEmployees(s,p),accounts=initSecurity(s).accounts.filter(a=>p.root||ids.has(a.employeeId));const keys=new Set(accounts.map(a=>a.id));return {accounts:accounts.map(a=>publicAccount(s,a)),employees:s.employees.filter(e=>p.root||ids.has(e.id)).map(({id,name,fired,archived})=>({id,name,fired,archived})),history:s.security.history.filter(h=>keys.has(h.accountId)),canProvision:!p.development};}
export async function accessMutation(s,p,action,b,adminPassword){
 if(!adminPassword||adminPassword.length<12)throw error('Сначала задайте ADMIN_PASSWORD длиной от 12 символов на сервере');
 if(!hasPermission(p,'access.manage'))throw forbidden();const sec=initSecurity(s);
 const account=id=>{const a=sec.accounts.find(a=>a.id===id);if(!a||!scopedEmployees(s,p).has(a.employeeId))throw forbidden();if(!p.root&&a.id===p.id)throw error('Свои права меняет другой владелец',403);if(!p.root)mayGrant(s,p,a,a.employeeId);return a;};
 const employee=id=>{const e=s.employees.find(e=>e.id===id);if(!e||!scopedEmployees(s,p).has(id))throw forbidden();return e;};
 if(action==='save'){
  const e=employee(b.employeeId);if((e.fired||e.archived)&&b.enabled)throw error('Сначала восстановите сотрудника');
  const previous=b.id?account(b.id):null;if(previous&&previous.employeeId!==e.id)throw error('Для смены сотрудника используйте перенос доступа');
  if(!previous&&sec.accounts.some(a=>a.employeeId===e.id))throw error('У сотрудника уже есть учётная запись');
  const config=normalizeAccess(b);for(const id of config.scope.employeeIds)if(!s.employees.some(e=>e.id===id))throw error('Сотрудник области доступа не найден');for(const id of config.scope.positionIds)if(!s.positions.some(p=>p.id===id))throw error('Должность области доступа не найдена');
  mayGrant(s,p,config,e.id);const key=loginKey(b.login);if(sec.accounts.some(a=>a.id!==previous?.id&&a.login===key))throw error('Этот email или телефон уже используется');
  const before=previous?publicAccount(s,previous):null,a=previous||{id:randomUUID(),employeeId:e.id};if(previous&&a.login!==key){delete a.password;delete a.invite;revoke(s,a.id);}Object.assign(a,config,{login:key,enabled:b.enabled===true});if(!a.enabled){delete a.invite;revoke(s,a.id);}if(!previous)sec.accounts.push(a);log(s,p,'rights-saved',a.id,before,publicAccount(s,a));return {account:publicAccount(s,a)};
 }
 const a=account(b.id),before=publicAccount(s,a);
 if(action==='copy'){
  const source=account(b.sourceId);const config=normalizeAccess(source);mayGrant(s,p,config,a.employeeId);Object.assign(a,config);log(s,p,'rights-copied',a.id,before,publicAccount(s,a));return {account:publicAccount(s,a)};
 }
 if(action==='invite'){
  const e=employee(a.employeeId);if(e.fired||e.archived)throw error('Сначала восстановите сотрудника');const token=randomBytes(32).toString('base64url');a.invite={hash:digest(token),expires:Date.now()+72*3600000};a.enabled=true;delete a.password;revoke(s,a.id);log(s,p,'invite-issued',a.id,before,publicAccount(s,a));return {token,expires:a.invite.expires};
 }
 if(action==='revoke-invite'){delete a.invite;log(s,p,'invite-revoked',a.id,before,publicAccount(s,a));return {ok:true};}
 if(action==='disable'){a.enabled=false;delete a.invite;revoke(s,a.id);log(s,p,'access-disabled',a.id,before,publicAccount(s,a));return {ok:true};}
 if(action==='transfer'){
  const e=employee(b.targetEmployeeId);if(e.id===a.employeeId||e.fired||e.archived||sec.accounts.some(x=>x.employeeId===e.id))throw error('Выберите действующего сотрудника без учётной записи');
  mayGrant(s,p,a,e.id);const oldId=a.employeeId;const key=loginKey(b.login);if(sec.accounts.some(x=>x.id!==a.id&&x.login===key))throw error('Этот email или телефон уже используется');
  if(b.archiveSource){if(s.appointments.some(v=>v.employeeId===oldId&&v.date>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tbilisi'})&&['booked','pending'].includes(v.status)))throw error('Сначала перенесите будущие записи исходного сотрудника');const old=employee(oldId);old.archived=true;old.active=false;}
  a.employeeId=e.id;a.login=key;delete a.password;delete a.invite;revoke(s,a.id);log(s,p,'access-transferred',a.id,before,publicAccount(s,a));return {account:publicAccount(s,a)};
 }
 throw error('Неизвестное действие доступа');
}
export async function changePassword(s,p,b,adminPassword){if(p.root)throw error('Пароль основного владельца меняется через ADMIN_PASSWORD на сервере');const a=initSecurity(s).accounts.find(a=>a.id===p.id);if(!a||!await passwordMatches(b.currentPassword,a.password))throw error('Текущий пароль неверен',403);a.password=await passwordHash(b.password);revoke(s,a.id);log(s,p,'password-changed',a.id);return {token:sessionToken(s,a.id,adminPassword)};}
export function revokeEmployment(s,p){for(const a of initSecurity(s).accounts){const e=s.employees.find(e=>e.id===a.employeeId);if((!e||e.fired||e.archived)&&a.enabled){const before=publicAccount(s,a);a.enabled=false;delete a.invite;revoke(s,a.id);log(s,p,'employment-disabled',a.id,before,publicAccount(s,a));}}}
