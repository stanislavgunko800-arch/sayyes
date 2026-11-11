// Respect reduced motion, data-saving preferences and background tabs.
// The hero has no source until playback is allowed or explicitly requested.
export function initVideos(t) {
 const hero=document.querySelector('#hero-film');
 const toggle=document.querySelector('.video-toggle');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const connection=navigator.connection;
 const others=[...document.querySelectorAll('.service-film')];
 let visible=true,userPaused=false,explicit=false;
 function attach(){
  if(hero.getAttribute('src'))return;
  hero.muted=true;hero.defaultMuted=true;
  hero.src=matchMedia('(max-width: 600px)').matches?hero.dataset.mobile:hero.dataset.desktop;
  hero.load();
 }
 function updateControl(){
  const playing=!hero.paused;
  toggle.setAttribute('aria-pressed',String(playing));
  toggle.setAttribute('aria-label',t(playing?'Приостановить видео':'Воспроизвести видео'));
  toggle.querySelector('.video-toggle-icon').textContent=playing?'Ⅱ':'▷';
  toggle.querySelector('[data-video-label]').textContent=t(playing?'Пауза':'Смотреть видео');
 }
 function permitted(){return !reduced.matches&&!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType);}
 function sync(){
  const busy=others.some(video=>!video.paused);
  if(document.hidden||!visible||busy||userPaused||(!explicit&&!permitted())){hero.pause();return;}
  attach();hero.play().catch(updateControl);
 }
 toggle.addEventListener('click',()=>{
  if(!hero.paused){userPaused=true;explicit=false;hero.pause();}
  else{userPaused=false;explicit=true;others.forEach(video=>video.pause());sync();}
 });
 hero.addEventListener('play',updateControl);hero.addEventListener('pause',updateControl);hero.addEventListener('error',updateControl);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.1});observer.observe(hero);
 for(const video of others){
  video.addEventListener('play',()=>{hero.pause();others.forEach(other=>{if(other!==video)other.pause();});});
  const viewport=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)video.pause();},{threshold:.05});viewport.observe(video);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)others.forEach(video=>video.pause());sync();});
 reduced.addEventListener('change',()=>{explicit=false;sync();});
 connection?.addEventListener?.('change',sync);
 window.addEventListener('pagehide',()=>{hero.pause();others.forEach(video=>video.pause());});
 updateControl();
}
