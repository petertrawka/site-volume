// Stills: README hero (1920x1080 at 2x of 1280x720... ) and GitHub social card (1280x640).
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => srv.listen(4817, r));
const browser = await chromium.launch();
const out = path.join(ROOT, 'media');
for (const [name, w, h, v, dsf] of [['hero.png', 1280, 720, '', 2], ['social-preview.png', 1280, 640, 'social', 1], ['x-post.png', 1280, 720, '', 1.5]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, colorScheme: 'light' });
  await page.goto(`http://localhost:4817/promo/stage.html?v=${v}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, name) });
  await page.close();
}
await browser.close(); srv.close();
