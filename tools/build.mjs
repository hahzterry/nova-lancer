// Build script: bundles src/main.js (with three.js) into a single self-contained HTML file.
//   node tools/build.mjs          → minified build
//   node tools/build.mjs --dev    → unminified build with inline sourcemap (for debugging)
//   node tools/build.mjs --watch  → dev build, rebuilds on change
//
// Outputs
//   public/index.html              full HTML document (served by Vercel, works offline)
//   public/nova-lancer.html        same page without the <html>/<head>/<body> wrapper
//                                  (for hosting as an Artifact)
//   dist/nova-lancer.html          same as above, kept for local convenience
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const TEMPLATE = path.join(root, 'src', 'template.html');
const OUT_DIR = path.join(root, 'public');
const OUT_FULL = path.join(OUT_DIR, 'index.html');
const OUT_FRAGMENT = path.join(OUT_DIR, 'nova-lancer.html');
const OUT_FRAGMENT_DIST = path.join(root, 'dist', 'nova-lancer.html');

function writeHtml(js) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const [head, body] = tpl.split('<!-- @@BODY@@ -->');
  if (body === undefined) throw new Error('template.html is missing the <!-- @@BODY@@ --> marker');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const bodyWithScript = body.replace('<!-- @@SCRIPT@@ -->', () => `<script>\n${safeJs}\n</script>`);
  const full =
    '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    head.trim() + '\n</head>\n<body>\n' + bodyWithScript.trim() + '\n</body>\n</html>\n';
  const fragment = head.trim() + '\n' + bodyWithScript.trim() + '\n';

  // Vercel expects a `public` directory by default.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FULL, full);
  fs.writeFileSync(OUT_FRAGMENT, fragment);

  // Keep dist/ copy as well (harmless for hosting, convenient locally).
  fs.mkdirSync(path.dirname(OUT_FRAGMENT_DIST), { recursive: true });
  fs.writeFileSync(OUT_FRAGMENT_DIST, fragment);

  const kb = (Buffer.byteLength(full) / 1024).toFixed(0);
  console.log(`[build] ${new Date().toLocaleTimeString()}  public/index.html ${kb} KB${dev ? ' (dev)' : ''}`);
}

const options = {
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'eof',
  write: false,
  logLevel: 'warning',
  define: { __DEV__: dev ? 'true' : 'false' },
  plugins: [{
    name: 'html-writer',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length) return;
        try { writeHtml(result.outputFiles[0].text); } catch (e) { console.error(e); }
      });
    },
  }],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  fs.watch(TEMPLATE, () => ctx.rebuild().catch(() => {}));
  console.log('[build] watching src/ …');
} else {
  const result = await esbuild.build(options);
  if (result.errors.length) process.exit(1);
}