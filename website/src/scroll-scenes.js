import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Each property has one owner: GSAP controls entrances/scroll scenes, while
// Motion still handles menu swaps, dialogs and game feedback in app.js.
export function initScrollScenes() {
 const media=gsap.matchMedia();
 media.add({
  motion:'(prefers-reduced-motion: no-preference)',
  desktop:'(min-width: 901px) and (hover: hover) and (pointer: fine)'
 }, context=>{
  if(!context.conditions.motion)return;
  const desktop=context.conditions.desktop;
  const hero=gsap.timeline({defaults:{ease:'power3.out'}});
  hero.from('.hero-line',{yPercent:35,opacity:0,duration:.85,stagger:.13,clearProps:'transform,opacity'})
   .from('.hero-script',{opacity:0,duration:.7,clearProps:'opacity'},.35)
   .from('.hero-bottom',{y:16,opacity:0,duration:.7,clearProps:'transform,opacity'},.5)
   .from('.hero-image',{scale:1.06,duration:1.3,clearProps:'transform'},0);

  context.add('enter',element=>{
   gsap.to(element,{opacity:1,y:0,duration:desktop?.8:.5,ease:'power3.out',overwrite:'auto',clearProps:'transform,opacity'});
  });
  for(const element of document.querySelectorAll('.reveal')) {
   // Keep above-the-fold content, keyboard focus and no-JS fallback visible.
   if(element.getBoundingClientRect().top<innerHeight)continue;
   gsap.set(element,{opacity:0,y:desktop?28:14});
   ScrollTrigger.create({trigger:element,start:'top 94%',once:true,onEnter:()=>context.enter(element)});
  }

  if(desktop){
   // Small image-only movements inside already clipped boxes; no pinning,
   // scroll hijacking or animated layout dimensions on touch screens.
   for(const selector of ['.about-visual > img','.contacts-photo > img']) {
    const image=document.querySelector(selector);
    gsap.fromTo(image,{scale:1.09,yPercent:-2},{scale:1.09,yPercent:2,ease:'none',scrollTrigger:{trigger:image.parentElement,start:'top bottom',end:'bottom top',scrub:.8}});
   }
   gsap.fromTo('.collage-main',{rotation:8},{rotation:2,ease:'none',scrollTrigger:{trigger:'.coffee-collage',start:'top bottom',end:'bottom top',scrub:.8}});
   gsap.fromTo('.collage-small',{rotation:-12},{rotation:-4,ease:'none',scrollTrigger:{trigger:'.coffee-collage',start:'top bottom',end:'bottom top',scrub:.8}});
   for(const section of document.querySelectorAll('.section-heading')){
    const heading=section.querySelector('h2');
    if(heading)gsap.from(heading,{y:20,duration:.9,ease:'power3.out',clearProps:'transform',scrollTrigger:{trigger:section,start:'top 88%',once:true}});
   }
  }
  const showFocused=event=>{
   const element=event.target.closest('.reveal');
   if(element){gsap.killTweensOf(element);gsap.set(element,{clearProps:'transform,opacity'});}
  };
  document.addEventListener('focusin',showFocused);
  return ()=>document.removeEventListener('focusin',showFocused);
 });

 const refresh=()=>ScrollTrigger.refresh();
 const restore=event=>{if(event.persisted)refresh();};
 window.addEventListener('load',refresh,{once:true});
 window.addEventListener('pageshow',restore);
 document.fonts?.ready.then(refresh);
 // Menu category changes alter document height; refresh after the layout settles.
 document.addEventListener('sayyes:layout',refresh);
 return ()=>{media.revert();window.removeEventListener('load',refresh);window.removeEventListener('pageshow',restore);document.removeEventListener('sayyes:layout',refresh);};
}
