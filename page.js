// Runs inside the page itself (before the site's own scripts), so it also sees hidden players.
//
// Sites like YouTube keep writing their own player volume back onto the video, which wiped out a
// level set from outside. So the extension's level is a multiplier on top of whatever the page asks
// for: page volume × our level. The page still reads back its own value, so its own slider keeps
// working and it has nothing to "correct".
(() => {
  const proto = HTMLMediaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'volume');
  if (!desc || !desc.set) return;

  const wanted = new WeakMap();   // what the page itself asked for, per player
  // Every player we've seen, held weakly so sites that make a new Audio() per sound don't leak memory.
  const known = new WeakSet();
  const media = new Set();        // of WeakRef
  const remember = el => { if (!known.has(el)) { known.add(el); media.add(new WeakRef(el)); return true; } return false; };
  const each = fn => media.forEach(r => { const el = r.deref(); if (el) fn(el); else media.delete(r); });
  let level = null;               // our level, 0..1; null until set

  const real = (el, v) => desc.set.call(el, level === null ? v : Math.max(0, Math.min(1, v * level)));
  const pageVol = el => (wanted.has(el) ? wanted.get(el) : desc.get.call(el));

  const track = el => {
    if (remember(el)) {
      if (!wanted.has(el)) wanted.set(el, desc.get.call(el));
      document.dispatchEvent(new CustomEvent('site-volume-media'));
    }
    if (level !== null) real(el, pageVol(el));
  };

  Object.defineProperty(proto, 'volume', {
    configurable: true,
    enumerable: desc.enumerable,
    get() { return pageVol(this); },
    set(v) {
      // Same checks as the browser's own setter, so a page that relies on them sees no difference.
      const n = Number(v);
      if (!Number.isFinite(n)) throw new TypeError("Failed to set the 'volume' property on 'HTMLMediaElement': The provided double value is non-finite.");
      if (n < 0 || n > 1) throw new DOMException(`Failed to set the 'volume' property on 'HTMLMediaElement': The volume provided (${n}) is outside the range [0, 1].`, 'IndexSizeError');
      wanted.set(this, n); remember(this); real(this, n);
    },
  });

  const origPlay = proto.play;
  proto.play = function (...a) { track(this); return origPlay.apply(this, a); };
  document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) track(e.target); }, true);
  document.addEventListener('loadedmetadata', e => { if (e.target instanceof HTMLMediaElement) track(e.target); }, true);

  document.addEventListener('site-volume-set', e => {
    level = e.detail;
    document.querySelectorAll('audio, video').forEach(remember);
    each(el => {
      if (!wanted.has(el)) wanted.set(el, desc.get.call(el));
      real(el, pageVol(el));
    });
  });
})();
