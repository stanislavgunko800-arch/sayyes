import {readFile, writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await build({
  entryPoints: [new URL('../public/motion.js', import.meta.url).pathname],
  outfile: new URL('../public/motion.bundle.js', import.meta.url).pathname,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'inline'
});
console.log('Built local Motion bundle');

// Inline in the existing HTML: the server intentionally serves an explicit asset list.
const indexUrl = new URL('../public/index.html', import.meta.url);
const bundle = await readFile(new URL('../public/motion.bundle.js', import.meta.url), 'utf8');
const html = await readFile(indexUrl, 'utf8');
await writeFile(indexUrl, html.replace(/<script data-sayyes-motion>[\s\S]*?<\/script>/,
  () => '<script data-sayyes-motion>' + bundle + '</script>'));
