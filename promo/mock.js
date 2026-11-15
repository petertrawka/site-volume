// Fake browser for the promo renders: three tabs with players, no real extension needed.
(() => {
  const fav = (bg, glyph) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${bg}"/>${glyph}</svg>`);
  const tabs = [
    { id: 1, windowId: 1, active: true, audible: true, url: 'https://www.youtube.com/watch?v=lofi',
      title: '▶ Lofi beats to focus — 24/7 radio', favIconUrl: fav('#e5484d', '<path d="M6 4.5v7l5.5-3.5z" fill="#fff"/>') },
    { id: 2, windowId: 1, active: false, audible: true, url: 'https://soundcloud.com/set/late-night',
      title: 'Late night mix · Vol. 3', favIconUrl: fav('#f76b15', '<path d="M3 11V8m2 3V6.5m2 4.5V5.5m2 5.5V5c2 0 3.5 1.2 3.7 3a1.6 1.6 0 0 1-.2 3z" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/>') },
    { id: 3, windowId: 1, active: false, audible: true, url: 'https://www.twitch.tv/speedrun',
      title: 'Speedrun marathon — day 2', favIconUrl: fav('#8e4ec6', '<path d="M4 3h9v6l-3 3H8l-2 2v-2H4z" fill="#fff"/><path d="M8 6v2.5M10.5 6v2.5" stroke="#8e4ec6" stroke-width="1.2"/>') },
    { id: 4, windowId: 1, active: false, audible: false, url: 'https://news.example.com/video',
      title: 'Morning briefing (video)', favIconUrl: fav('#3e63dd', '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="#fff"/>') },
  ];
  const vols = { 1: 0.8, 2: 0.6, 3: 0.35, 4: 1 };
  window.chrome = {
    runtime: { lastError: undefined },
    windows: { getCurrent: async () => ({ id: 1 }), update: () => {} },
    tabs: {
      query: async () => tabs,
      update: () => {},
      sendMessage: (id, m, a, b) => {
        const cb = typeof a === 'function' ? a : b;
        if (m.type === 'get') setTimeout(() => cb({ host: new URL(tabs.find(t => t.id === id).url).hostname, vol: vols[id], hasMedia: true }), 5);
        else { if (m.type === 'set') vols[id] = m.vol; cb?.(); }
      },
    },
  };
})();
