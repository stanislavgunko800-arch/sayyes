import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
execFileSync('python3',['render.py'],{stdio:'inherit'});
execFileSync('python3',['locales/generate.py'],{stdio:'inherit'});
await build({entryPoints:['src/app.js'],outfile:'dist/app.js',bundle:true,minify:true,format:'iife',target:['es2020'],legalComments:'inline'});
await copyFile('src/style.css','dist/style.css');
console.log('Built Say Yes with local Motion, GSAP and ScrollTrigger animations');
