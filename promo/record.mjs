// Records the X / README demo: real popup, scripted hand. Frames from Chrome's screencast, joined by ffmpeg.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const FR = path.join(process.argv[2] || '/tmp', 'frames'); fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => srv.listen(4818, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
await page.goto('http://localhost:4818/promo/stage.html?intro=1');
await page.waitForTimeout(500);

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async f => {
  const i = frames.length; const file = path.join(FR, `f${String(i).padStart(5, '0')}.png`);
  frames.push({ file, t: f.metadata.timestamp });
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

const wait = ms => page.waitForTimeout(ms);
// Hand moves: strong ease-in-out (0.77,0,0.175,1) approximated by cubic in-out for the path.
const io = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let cx = 1340, cy = 760;
async function move(x, y, ms = 650, down = false) {
  const x0 = cx, y0 = cy, n = Math.max(2, Math.round(ms / 16)), t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    const k = io(i / n); cx = x0 + (x - x0) * k; cy = y0 + (y - y0) * k;
    await page.mouse.move(cx, cy); await page.evaluate(([a, b, d]) => cursor(a, b, d), [cx, cy, down]);
    const due = t0 + (ms * i) / n - Date.now(); if (due > 0) await wait(due);
  }
}
const press = async () => { await page.evaluate(([a, b]) => { cursor(a, b, true); ripple(a, b); }, [cx, cy]); await page.mouse.down(); };
const release = async () => { await page.mouse.up(); await page.evaluate(([a, b]) => cursor(a, b, false), [cx, cy]); };
const click = async () => { await press(); await wait(90); await release(); };
const box = async sel => { const f = page.frameLocator('#pop').locator(sel).first(); const b = await f.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };

// 1. Arrival
await page.evaluate(() => { cursor(1340, 760, false); go(); });
await wait(250);
await page.evaluate(() => loadPopup());
await wait(1700);
await page.evaluate(() => zoom(1.3));
await move(900, 600, 1100);
await wait(150);

// 2. Grab the pillar, pull it down slowly to ~30%, then up to ~60%
const st = await box('#stage');
await move(st.x, st.y - 10, 900);
await wait(250);
await press(); await wait(150);
await move(st.x, st.y - 10 + 75, 1300, true);
await wait(350);
await move(st.x, st.y - 10 + 30, 700, true);
await wait(250);
await release();
await wait(700);

// 3. Flick up: carries on to the next step
await press();
await move(cx, cy - 22, 110, true);
await release();
await wait(900);

// 4. Scroll down a little
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 18); await wait(70); }
await wait(800);

// 5. Mute, then unmute
const mu = await box('#heroMute');
await move(mu.x, mu.y, 700); await wait(200); await click(); await wait(1000); await click(); await wait(800);

// 6. Swap: make the SoundCloud tab the big one
const pk = await box('.row .pick');
await move(pk.x - 20, pk.y, 750); await wait(200); await click(); await wait(1200);

// 7. Drag a row slider in the list
const sl = await box('.row:nth-child(2) .slider input');
const x0 = sl.b.x + sl.b.width * 0.35;
await move(x0, sl.y, 700); await wait(150);
await press(); await move(sl.b.x + sl.b.width * 0.9, sl.y, 900, true); await wait(150); await release();
await wait(400);
await wait(500);
await page.evaluate(() => zoom(0));
await move(1180, 690, 1100);
await wait(2000);

await cdp.send('Page.stopScreencast');
await browser.close(); srv.close();

// Join: each frame shown until the next one arrived.
const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? f.t + 0.5) - f.t).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
fs.writeFileSync(path.join(FR, 'list.txt'), list);
const out = path.join(ROOT, 'media', 'demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(FR, 'list.txt'),
  '-vf', 'scale=1920:1080:flags=lanczos,fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', out]);
console.log('frames', frames.length, 'span', (frames.at(-1).t - frames[0].t).toFixed(2) + 's');
