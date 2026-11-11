import assert from 'node:assert/strict';
import {initVideos} from '../src/video.js';
class Video extends EventTarget{
 constructor(){super();this.paused=true;this.attrs={};this.dataset={mobile:'/video/sayyes-film-mobile.mp4',desktop:'/video/sayyes-film.mp4'};this.loads=0;}
 set src(value){this.attrs.src=value;}getAttribute(name){return this.attrs[name];}
 load(){this.loads++;}play(){this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();}pause(){const change=!this.paused;this.paused=true;if(change)this.dispatchEvent(new Event('pause'));}
}
for(const mode of ['normal','reduced','save-data','slow']){
 const hero=new Video(),other=new Video(),toggle=new EventTarget(),observers=[];
 const parts={'.video-toggle-icon':{},'[data-video-label]':{}};toggle.attrs={};toggle.setAttribute=(k,v)=>toggle.attrs[k]=v;toggle.querySelector=s=>parts[s];
 const reduced=new EventTarget();reduced.matches=mode==='reduced';
 globalThis.matchMedia=q=>q.includes('reduced-motion')?reduced:{matches:true};
 const connection=new EventTarget();connection.saveData=mode==='save-data';connection.effectiveType=mode==='slow'?'2g':'4g';
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{connection}});
 globalThis.document=new EventTarget();document.hidden=false;document.querySelector=s=>s==='#hero-film'?hero:toggle;document.querySelectorAll=()=>[other];globalThis.window=new EventTarget();
 globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}};
 initVideos(x=>x);observers[0].callback([{isIntersecting:true}]);
 assert.equal(hero.loads,mode==='normal'?1:0);
 if(mode!=='normal'){toggle.dispatchEvent(new Event('click'));assert(!hero.paused,'Explicit play must work without forced autoplay');}
 assert.equal(hero.getAttribute('src'),hero.dataset.mobile);
 toggle.dispatchEvent(new Event('click'));assert(hero.paused,'Pause control');observers[0].callback([{isIntersecting:true}]);assert(hero.paused,'User pause persists');
 toggle.dispatchEvent(new Event('click'));assert(!hero.paused);
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert(hero.paused,'Background playback pauses');
 document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));other.play();assert(hero.paused,'Secondary film pauses hero');
 console.log('PASS:',mode,'autoplay gate, explicit play, pause persistence, visibility and single playback');
}
