import {animate} from 'motion/mini';
import {initScrollScenes} from './scroll-scenes.js';
import {initVideos} from './video.js';

const content=window.SAYYES_CONTENT;
const ui=window.SAYYES_UI;
const t=key=>ui[key]||key;
try{localStorage.setItem('sayyes-language',document.documentElement.lang);}catch{}
document.querySelectorAll('[data-language]').forEach(link=>link.addEventListener('click',()=>{link.href='/'+link.dataset.language+'/'+location.search+location.hash;}));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const effects=new Map();
function motion(el,frames,options={}) {
 if(!el||reduced.matches||!el.animate)return;
 effects.get(el)?.cancel();
 try{
  const control=animate(el,frames,{duration:.55,ease:[.2,.65,.3,1],...options});
  effects.set(el,control);
  control.then(()=>{if(effects.get(el)===control){control.cancel();effects.delete(el);}});
 }catch{effects.delete(el);}
}
function clearMotion(){for(const control of effects.values())control.cancel();effects.clear();document.querySelectorAll('.pending').forEach(el=>el.classList.remove('pending'));}
reduced.addEventListener('change',clearMotion);
window.addEventListener('pagehide',clearMotion);

initVideos(t);

// GSAP owns entrance and scroll animations; native controls remain independent.
initScrollScenes();
let scheduled=false;
const progress=document.querySelector('.scroll-progress'),header=document.querySelector('.site-header');
function updateScroll(){const range=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${range?scrollY/range:0})`;header.classList.toggle('scrolled',scrollY>20);scheduled=false;}
window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateScroll);}},{passive:true});
updateScroll();
const sectionObserver=new IntersectionObserver(entries=>{
 for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('.site-header nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));}
},{rootMargin:'-15% 0px -65% 0px'});
document.querySelectorAll('main section[id]').forEach(el=>sectionObserver.observe(el));

const menuToggle=document.querySelector('.menu-toggle'),mobileMenu=document.querySelector('#mobile-menu');
function closeMenu(){mobileMenu.hidden=true;document.body.classList.remove('menu-open');menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-label',t('Открыть меню'));}
menuToggle.addEventListener('click',()=>{
 const open=menuToggle.getAttribute('aria-expanded')==='true';
 if(open){closeMenu();return;}
 mobileMenu.hidden=false;document.body.classList.add('menu-open');menuToggle.setAttribute('aria-expanded','true');menuToggle.setAttribute('aria-label',t('Закрыть меню'));motion(mobileMenu,{opacity:[0,1],transform:['translateY(-8px)','translateY(0)']},{duration:.25});
});
mobileMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
mobileMenu.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const links=[...mobileMenu.querySelectorAll('a')];if(e.shiftKey&&document.activeElement===links[0]){e.preventDefault();menuToggle.focus();}else if(!e.shiftKey&&document.activeElement===links.at(-1)){e.preventDefault();menuToggle.focus();}});
window.addEventListener('resize',()=>{if(innerWidth>1250)closeMenu();});

const ticker=document.querySelector('.ticker'),tickerPause=document.querySelector('.ticker-pause');
tickerPause.addEventListener('click',()=>{const paused=ticker.classList.toggle('paused');tickerPause.setAttribute('aria-pressed',String(paused));tickerPause.setAttribute('aria-label',paused?t('Запустить бегущую строку'):t('Приостановить бегущую строку'));tickerPause.textContent=paused?'▷':'Ⅱ';});

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const menuPanel=document.querySelector('#menu-panel'),menuTabs=[...document.querySelectorAll('[data-menu]')];
function setMenu(id){
 const group=content.menu.find(g=>g.id===id);if(!group)return;
 for(const tab of menuTabs){const selected=tab.dataset.menu===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
 menuPanel.setAttribute('aria-labelledby','tab-'+id);
 menuPanel.innerHTML=group.sections.map(section=>`<section class="menu-category"><h3>${escape(section.title)}</h3><div class="menu-items">${section.items.map(item=>`<article class="menu-item">${group.showImages&&item.image?`<img src="${escape(item.image)}" alt="${escape(item.name)}" loading="lazy" decoding="async">`:''}<div class="menu-item-copy"><div class="menu-item-title"><h4>${escape(item.name)}</h4><strong>${escape(item.price)}</strong></div><p>${escape(item.description)}</p></div></article>`).join('')}</div></section>`).join('');
 motion(menuPanel,{opacity:[.35,1]},{duration:.28});
 document.dispatchEvent(new Event('sayyes:layout'));
 updateScroll();
}
menuTabs.forEach((tab,index)=>{
 tab.addEventListener('click',()=>setMenu(tab.dataset.menu));
 tab.addEventListener('keydown',e=>{let target;if(e.key==='ArrowRight')target=(index+1)%menuTabs.length;else if(e.key==='ArrowLeft')target=(index-1+menuTabs.length)%menuTabs.length;else if(e.key==='Home')target=0;else if(e.key==='End')target=menuTabs.length-1;else return;e.preventDefault();menuTabs[target].focus();setMenu(menuTabs[target].dataset.menu);});
});

const dialog=document.querySelector('#detail-dialog'),dialogContent=document.querySelector('#dialog-content');
let galleryIndex=null;
function showDialog(){if(!dialog.open)dialog.showModal();document.body.classList.add('modal-open');motion(dialog,{opacity:[0,1],transform:['translateY(16px)','translateY(0)']},{duration:.3});}
function showGallery(index){
 galleryIndex=(index+content.gallery.length)%content.gallery.length;const item=content.gallery[galleryIndex];
 dialogContent.innerHTML=`<img class="detail-photo" src="${escape(item.image)}" alt="${escape(item.title)}"><div class="detail-photo-caption"><h2 id="detail-title">${escape(item.title)}</h2><p>${escape(item.text)}</p><div class="gallery-controls"><button class="gallery-prev" aria-label="${escape(t('Предыдущее фото'))}">←</button><span>${galleryIndex+1} / ${content.gallery.length}</span><button class="gallery-next" aria-label="${escape(t('Следующее фото'))}">→</button></div></div>`;
 dialogContent.querySelector('.gallery-prev').onclick=()=>showGallery(galleryIndex-1);
 dialogContent.querySelector('.gallery-next').onclick=()=>showGallery(galleryIndex+1);
 showDialog();
}
document.querySelectorAll('[data-gallery]').forEach(button=>button.addEventListener('click',()=>showGallery(Number(button.dataset.gallery))));
document.querySelectorAll('[data-service]').forEach(button=>button.addEventListener('click',()=>{
 galleryIndex=null;const item=content.services[Number(button.dataset.service)];
 dialogContent.innerHTML=`<div class="detail-layout"><img src="${escape(item.image)}" alt="${escape(item.title)}"><div class="detail-copy"><span class="eyebrow">${escape(t('BEAUTY / SAY YES'))}</span><h2 id="detail-title">${escape(item.title)}</h2><p>${escape(item.text)}</p><p>${escape(t('Консультация бесплатно.'))}</p><a class="button" href="https://dikidi.ru/887914" target="_blank" rel="noopener noreferrer"><span>${escape(t('Выбрать время'))}</span><span aria-hidden="true">↗</span></a></div></div>`;
 showDialog();
}));
dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open');galleryIndex=null;effects.get(dialog)?.cancel();effects.delete(dialog);});
dialog.addEventListener('click',e=>{const rect=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom))dialog.close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!mobileMenu.hidden){closeMenu();menuToggle.focus();}if(dialog.open&&galleryIndex!==null){if(e.key==='ArrowRight'){e.preventDefault();showGallery(galleryIndex+1);}if(e.key==='ArrowLeft'){e.preventDefault();showGallery(galleryIndex-1);}}});
