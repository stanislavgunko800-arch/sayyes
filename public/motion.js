import {animate} from 'motion/mini';

const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new Map();
let sectionKey;

function cancelAll() {
  for (const animation of running.values()) animation.cancel();
  running.clear();
}

function play(element, frames, options) {
  if (!element || preference.matches || !element.animate) return;
  running.get(element)?.cancel();
  try {
    const animation = animate(element, frames, {...options, ease: 'easeOut'});
    running.set(element, animation);
    animation.then(() => {
      if (running.get(element) !== animation) return;
      // Remove the temporary effect, retaining the underlying CSS and layout.
      animation.cancel();
      running.delete(element);
    });
  } catch {
    // Motion is progressive enhancement: content remains visible if unsupported.
    running.delete(element);
  }
}

function render(key) {
  cancelAll();
  const changed = sectionKey !== key;
  sectionKey = key;
  if (!changed || preference.matches) return;
  const content = document.querySelector('#app .content');
  play(content, {opacity: [0.4, 1]}, {duration: .18});
  // Animate only two visible entry blocks, never a large calendar or table row list.
  const blocks = content?.querySelectorAll(':scope > .heading, :scope > .day-intro, :scope > .hub-grid, :scope > .panel');
  [...(blocks || [])].filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  }).slice(0, 2).forEach((el, index) => {
    play(el, {transform: ['translateY(5px)', 'translateY(0)']}, {
      duration: .22, delay: index * .025
    });
  });
}

function feedback(event) {
  if (preference.matches || (event.type === 'keydown' &&
      (event.repeat || !['Enter', ' '].includes(event.key)))) return;
  const button = event.target.closest?.('button');
  if (!button || button.disabled || !button.closest('#app, #modal')) return;
  // Preserve positioned controls (floor plans, for example) and existing CSS transforms.
  const base = getComputedStyle(button).transform;
  const prefix = base === 'none' ? '' : base + ' ';
  play(button, {transform: [prefix + 'scale(.985)', prefix + 'scale(1)']}, {duration: .16});
}

window.sayYesMotion = {render};
document.addEventListener('pointerdown', feedback, {passive: true});
document.addEventListener('keydown', feedback);
preference.addEventListener('change', cancelAll);
window.addEventListener('pagehide', cancelAll);
window.addEventListener('beforeprint', cancelAll);
