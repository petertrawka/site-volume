// Each tab keeps its own volume while it stays open. Nothing is saved: every new tab or reload starts at 100%.
const isTop = window === top;
let tabVol = 1;           // this tab's level
let sawMedia = false;     // page.js saw a player start (also catches hidden players)

const send = v => document.dispatchEvent(new CustomEvent('site-volume-set', { detail: v }));
const report = v => { if (isTop) chrome.runtime.sendMessage({ type: 'current', vol: v }, () => void chrome.runtime.lastError); };
const hasMedia = () => sawMedia || !!document.querySelector('audio, video');

document.addEventListener('site-volume-media', () => { sawMedia = true; });

report(tabVol);
document.addEventListener('visibilitychange', () => { if (!document.hidden) report(tabVol); });

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.type === 'get') {
    if (!isTop) return;
    reply({ host: location.hostname, vol: tabVol, hasMedia: hasMedia() });
    return;
  }
  // Reset: back to the page's own volume.
  if (m.type === 'reset') {
    tabVol = 1;
    send(1);
    report(1);
    return;
  }
  if (m.type === 'set') {
    tabVol = m.vol;
    send(m.vol);
    report(m.vol);
  }
});
