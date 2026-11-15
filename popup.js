// The window behind the toolbar icon. The tab that matters gets the big pillar; the rest sit below.
import { plug } from './lib/hairline.js';
import { lift } from './lift.js';

const $ = s => document.querySelector(s);
const GLOBE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#a3a3a3" stroke-width="1.2"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>');
const ICON_ON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2l3-2.5v9L4.5 10h-2z"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2l3-2.5v9L4.5 10h-2z"/><path d="M10.5 6l4 4M14.5 6l-4 4"/></svg>';

// Ask a tab for its level. A busy or sleeping tab can be slow, so after 400ms the popup opens anyway
// and that tab fills in whenever it answers (`late`). The browser always calls back, with an error if
// the tab has no script, so only a tab without our script gets "reload".
const SLOW = Symbol('slow');
const ask = tab => {
  const late = new Promise(res => {
    chrome.tabs.sendMessage(tab.id, { type: 'get' }, { frameId: 0 }, r => { void chrome.runtime.lastError; res(r || null); });
  });
  return { late, early: Promise.race([late, new Promise(res => setTimeout(() => res(SLOW), 400))]) };
};
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
    paintState(item);
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

// No answer yet: greyed out while waiting. No answer at all: greyed out with "reload" on the big card.
function paintState(item) {
  const dead = !item.info;
  if (item === hero) {
    $('#hero').classList.toggle('is-dead', dead);
    $('#heroNote').hidden = !dead || item.waiting;
  } else if (item.row) {
    item.row.classList.toggle('is-dead', dead);
    item.row.querySelector('.pct').textContent = item.info ? Math.round(item.vol * 100) + '%' : '—';
  }
}

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
    paintState(item);
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
  const asks = tabs.map(ask);
  const infos = await Promise.all(asks.map(a => a.early));
  const isHere = t => t.active && t.windowId === winId;

  const all = tabs.map((tab, i) => {
    const waiting = infos[i] === SLOW, info = waiting ? null : infos[i];
    return { tab, info, waiting, vol: info?.vol ?? 1, late: asks[i].late };
  });
  // The tab you're on stays in while it's still answering, in case it has a player.
  items = all.filter(i => qualifies(i) || (i.waiting && isHere(i.tab)))
    .sort((a, b) => (b.tab.audible - a.tab.audible) || (isHere(b.tab) - isHere(a.tab)));
  items.forEach(i => { if (i.vol > 0) last.set(i.tab.id, i.vol); });
  paintStatus();

  if (!items.length) showEmpty();
  // The big one: the tab you're on if it has a player, else the first one playing.
  else showHero(items.find(i => isHere(i.tab) && (i.waiting || i.info?.hasMedia || i.tab.audible)) || items[0], false);

  // Slow tabs fill in when they answer, including ones not listed yet.
  all.filter(i => i.waiting).forEach(item => item.late.then(info => settle(item, info)));
}

const qualifies = i => i.tab.audible || !!i.info?.hasMedia;

function paintStatus() {
  const playing = items.filter(i => i.tab.audible).length;
  $('#status').innerHTML = playing ? `<span class="dot"></span>${playing} playing` : (items.length ? `${items.length} with a player` : '');
}

let plugged = false;
function showEmpty() {
  $('#hero').hidden = true; $('#others').hidden = true;
  $('#empty').hidden = false; $('#empty').classList.add('rise');
  if (!plugged) { plugged = true; plug($('#emptyFigure'), { play: true, intensity: 0.5, label: 'Nothing plugged in' }); }
}

// A slow tab answered: fill it in, add it if it turned out to have a player, drop it if it didn't.
function settle(item, info) {
  item.waiting = false;
  item.info = info;
  if (info) { item.vol = info.vol; if (info.vol > 0) last.set(item.tab.id, info.vol); }
  const listed = items.includes(item);
  if (!listed) {
    if (!qualifies(item)) return;
    items.push(item);
    paintStatus();
    if (!hero) { $('#empty').hidden = true; showHero(item, false); }
    else renderRows(true, null);
    return;
  }
  if (!qualifies(item)) {
    items = items.filter(i => i !== item);
    paintStatus();
    if (item !== hero) renderRows(true, null);
    else if (items.length) showHero(items[0], true);
    else { hero = null; showEmpty(); }
    return;
  }
  paintState(item);
  if (item === hero) paintHero(true, true); else paintRow(item);
}

start();
