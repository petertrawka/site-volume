// The window behind the toolbar icon. The tab that matters gets the big pillar; the rest sit below.
import { plug } from './lib/hairline.js';
import { lift } from './lift.js';

const $ = s => document.querySelector(s);
const GLOBE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#a3a3a3" stroke-width="1.2"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>');
const ICON_ON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2l3-2.5v9L4.5 10h-2z"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2l3-2.5v9L4.5 10h-2z"/><path d="M10.5 6l4 4M14.5 6l-4 4"/></svg>';

const ask = tab => new Promise(res => {
  const t = setTimeout(() => res(null), 400);
  chrome.tabs.sendMessage(tab.id, { type: 'get' }, r => { clearTimeout(t); void chrome.runtime.lastError; res(r || null); });
});
const send = (tabId, vol) => chrome.tabs.sendMessage(tabId, { type: 'set', vol }, () => void chrome.runtime.lastError);
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// Page titles often start with a play mark or an unread count: "▶ Song", "(1) X".
const clean = t => (t || '').replace(/^[\s\uFE0E\uFE0F]*(?:[▶►▷⏵][\uFE0E\uFE0F]?\s*|\(\d+\)\s*)+/, '').trim();
const fav = (img, url) => { img.onerror = () => { img.src = GLOBE; }; img.src = url || GLOBE; };

let items = [], hero = null, pillar = null, winId;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

// The big number: counts to a new value when it changes by itself (mute, swap); follows instantly while you drag.
let countRaf = 0, shownNum = null;
function showNum(p, animate) {
  cancelAnimationFrame(countRaf);
  const el = $('#bigNum'), from = shownNum ?? p;
  shownNum = p;
  if (!animate || reduce || from === p) { el.textContent = p; return; }
  const t0 = performance.now(), D = 240;
  const step = now => {
    const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (p - from) * e);
    if (k < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}
const last = new Map();   // level to come back to after unmuting, per tab

function setLevel(item, vol, { fromPillar = false } = {}) {
  item.vol = vol;
  if (vol > 0) last.set(item.tab.id, vol);
  if (item.info) send(item.tab.id, vol);
  if (item === hero) paintHero(!fromPillar, !fromPillar);
  else paintRow(item);
}

/* ── The big one ── */
function paintHero(movePillar, countUp = false) {
  const p = Math.round(hero.vol * 100);
  showNum(p, countUp);
  $('#hero').classList.toggle('is-muted', p === 0);
  $('#heroMute').innerHTML = (p === 0 ? ICON_OFF : ICON_ON) + (p === 0 ? 'Unmute' : 'Mute');
  if (movePillar && pillar) pillar.set(hero.vol);
}

function showHero(item, animate) {
  const prev = hero;
  hero = item;
  const h = $('#hero');
  const textEls = [$('#heroFav'), $('.who')];
  const fill = () => {
    $('#heroTitle').textContent = clean(item.tab.title) || hostOf(item.tab.url);
    $('#heroHost').replaceChildren(hostOf(item.tab.url));
    if (item.tab.audible) {
      const eq = document.createElement('span'); eq.className = 'eq'; eq.innerHTML = '<i></i><i></i><i></i>';
      $('#heroHost').append(eq);
    }
    fav($('#heroFav'), item.tab.favIconUrl);
    h.classList.toggle('is-dead', !item.info);
    $('#heroNote').hidden = !!item.info;
  };
  const label = `Volume for ${hostOf(item.tab.url)}`;
  if (!pillar) {
    pillar = lift($('#stage'), { value: item.vol, label, onInput: v => setLevel(hero, v, { fromPillar: true }) });
  } else {
    $('#stage').setAttribute('aria-label', label);
    pillar.set(item.vol);               // the same pillar springs to the new tab's level: you see it change
  }
  if (!animate || h.hidden) {
    fill(); paintHero(false); h.hidden = false;
    h.style.setProperty('--i', 0); h.classList.add('rise');
  } else {
    // Swap: the old name fades up and away (140ms), the new one rises in from below, where its row was (220ms).
    const out = reduce ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(3px)' }];
    const inn = reduce ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }];
    Promise.all(textEls.map(el => el.animate(out, { duration: 140, easing: EASE_OUT, fill: 'forwards' }).finished)).then(() => {
      fill();
      textEls.forEach((el, i) => el.animate(inn, { duration: 220, delay: i * 30, easing: EASE_OUT, fill: 'forwards' }));
    });
    paintHero(false, true);
    if (!reduce) h.animate([{ transform: 'scale(0.995)' }, { transform: 'none' }], { duration: 220, easing: EASE_OUT });
  }
  renderRows(animate, prev);
}

$('#heroMute').onclick = () => {
  const v = hero.vol === 0 ? (last.get(hero.tab.id) || 1) : 0;
  setLevel(hero, v);
};
$('#heroGo').onclick = () => {
  chrome.tabs.update(hero.tab.id, { active: true });
  chrome.windows.update(hero.tab.windowId, { focused: true });
};

/* ── Other tabs ── */
function paintRow(item) {
  if (!item.row) return;
  const p = Math.round(item.vol * 100);
  item.row.querySelector('input').value = p;
  item.row.querySelector('.slider').style.setProperty('--v', p + '%');
  item.row.querySelector('.pct').textContent = item.info ? p + '%' : '—';
  item.row.classList.toggle('is-muted', p === 0);
}

function renderRows(animate, prev) {
  const rest = items.filter(i => i !== hero);
  $('#others').hidden = !rest.length;
  const tpl = $('#rowTpl');
  let dropIn = null;
  $('#list').replaceChildren(...rest.map((item, idx) => {
    const row = tpl.content.firstElementChild.cloneNode(true);
    item.row = row;
    fav(row.querySelector('.fav'), item.tab.favIconUrl);
    row.querySelector('.title').textContent = clean(item.tab.title) || hostOf(item.tab.url);
    row.classList.toggle('quiet', !item.tab.audible);
    row.classList.toggle('is-dead', !item.info);
    row.querySelector('.pick').onclick = () => showHero(item, true);
    const input = row.querySelector('input');
    input.setAttribute('aria-label', `Volume for ${hostOf(item.tab.url)}`);
    input.oninput = () => setLevel(item, input.value / 100);
    paintRow(item);
    // The tab that just left the big card drops into the list; the others hold still.
    if (animate && item === prev && !reduce) dropIn = row;
    else if (!animate) { row.style.setProperty('--i', 2 + idx); row.classList.add('rise'); }
    return row;
  }));
  // Animate only once it is on the page (an animation started on a detached row never runs).
  dropIn?.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: 60, easing: EASE_OUT, fill: 'backwards' });
  if (!animate) { $('#others').querySelector('h2').style.setProperty('--i', 1); $('#others').querySelector('h2').classList.add('rise'); }
}

/* ── Start ── */
async function start() {
  winId = (await chrome.windows.getCurrent()).id;
  const tabs = (await chrome.tabs.query({})).filter(t => /^https?:/.test(t.url || ''));
  const infos = await Promise.all(tabs.map(ask));
  const isHere = t => t.active && t.windowId === winId;

  items = tabs.map((tab, i) => ({ tab, info: infos[i], vol: infos[i]?.vol ?? 1 }))
    .filter(({ tab, info }) => tab.audible || info?.hasMedia)
    .sort((a, b) => (b.tab.audible - a.tab.audible) || (isHere(b.tab) - isHere(a.tab)));
  items.forEach(i => { if (i.vol > 0) last.set(i.tab.id, i.vol); });

  const playing = items.filter(i => i.tab.audible).length;
  $('#status').innerHTML = playing ? `<span class="dot"></span>${playing} playing` : (items.length ? `${items.length} with a player` : '');

  if (!items.length) {
    $('#empty').hidden = false; $('#empty').classList.add('rise');
    plug($('#emptyFigure'), { play: true, intensity: 0.5, label: 'Nothing plugged in' });
    return;
  }
  // The big one: the tab you're on if it has a player, else the first one playing.
  showHero(items.find(i => isHere(i.tab) && (i.info?.hasMedia || i.tab.audible)) || items[0], false);
}

start();
