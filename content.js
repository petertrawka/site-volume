// Each tab keeps its own volume while it stays open. Nothing is saved: every new tab or reload starts at 100%.
// The top frame holds the tab's level. Embedded frames (YouTube embeds, ads) that load later ask the
// background for it, so they don't start at full volume, and tell the top frame when they have a player.
const isTop = window === top;
let tabVol = 1;           // this tab's level
let sawMedia = false;     // a player started in this frame or an embedded one (also catches hidden players)
let heardSet = false;     // a level arrived directly, so a late answer to our "what's the level?" is stale

const send = v => document.dispatchEvent(new CustomEvent('site-volume-set', { detail: v }));
// Talk to the extension. After the extension is updated or reloaded, a tab that wasn't reloaded keeps this
// old copy running, cut off from the extension: sending then throws "Extension context invalidated".
// Stay quiet instead (the page keeps working; the tab just needs a reload to be controlled again).
const tell = (msg, cb = () => void chrome.runtime.lastError) => {
  try { if (chrome.runtime?.id) chrome.runtime.sendMessage(msg, cb); } catch { /* cut off from the extension */ }
};
const report = v => { if (isTop) tell({ type: 'current', vol: v }); };
const hasMedia = () => sawMedia || !!document.querySelector('audio, video');

document.addEventListener('site-volume-media', () => {
  if (isTop) { sawMedia = true; return; }
  if (!sawMedia) { sawMedia = true; tell({ type: 'frame-media' }); }
});

if (isTop) {
  report(tabVol);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) report(tabVol); });
} else {
  tell({ type: 'level?' }, vol => {
    void chrome.runtime.lastError;
    if (heardSet || typeof vol !== 'number' || vol === 1) return;
    tabVol = vol;
    send(vol);
  });
}

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.type === 'get') {
    if (!isTop) return;
    reply({ host: location.hostname, vol: tabVol, hasMedia: hasMedia() });
    return;
  }
  if (m.type === 'child-media') {
    if (isTop) sawMedia = true;
    return;
  }
  // Reset: back to the page's own volume.
  if (m.type === 'reset' || m.type === 'set') {
    const v = m.type === 'reset' ? 1 : m.vol;
    heardSet = true;
    tabVol = v;
    send(v);
    report(v);
    if (isTop) reply({ ok: true });   // only the top frame answers, so the sender knows the tab got it
  }
});
