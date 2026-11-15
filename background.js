// Right-click menu: "Site volume (NN%)" with a tick on the current level.
const LEVELS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'root', title: 'Site volume', contexts: ['all'] });
    for (const v of LEVELS)
      chrome.contextMenus.create({ id: 'v' + v, parentId: 'root', type: 'radio', checked: v === 100,
        title: v === 0 ? 'Mute (0%)' : v + '%', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'sep', parentId: 'root', type: 'separator', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'reset', parentId: 'root', title: 'Reset (site’s own volume)', contexts: ['all'] });
  });
});

// Show where we are: exact % in the menu title, tick on the matching step.
function show(vol) {
  const pct = Math.round(vol * 100);
  chrome.contextMenus.update('root', { title: `Site volume (${pct}%)` }, () => void chrome.runtime.lastError);
  for (const v of LEVELS)
    chrome.contextMenus.update('v' + v, { checked: v === pct }, () => void chrome.runtime.lastError);
}

function refresh(tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'get' }, { frameId: 0 }, r => {
    if (chrome.runtime.lastError || !r) { chrome.contextMenus.update('root', { title: 'Site volume' }, () => void chrome.runtime.lastError); return; }
    show(r.vol);
  });
}

chrome.tabs.onActivated.addListener(({ tabId }) => refresh(tabId));
// Switching windows changes which tab the menu is about.
chrome.windows.onFocusChanged.addListener(winId => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId: winId }, ([tab]) => { if (tab) refresh(tab.id); });
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  const tabId = sender.tab?.id;
  // Only the tab you're looking at, in the window you're in, sets the menu.
  if (m.type === 'current' && sender.tab?.active) {
    chrome.windows.getLastFocused(w => { if (!chrome.runtime.lastError && w?.id === sender.tab.windowId) show(m.vol); });
  }
  // An embedded frame just loaded: tell it the tab's level, which the top frame holds.
  if (m.type === 'level?' && tabId != null) {
    chrome.tabs.sendMessage(tabId, { type: 'get' }, { frameId: 0 }, r => { void chrome.runtime.lastError; reply(r ? r.vol : null); });
    return true;
  }
  // An embedded frame has a player: let the top frame know, so the popup lists the tab.
  if (m.type === 'frame-media' && tabId != null) {
    chrome.tabs.sendMessage(tabId, { type: 'child-media' }, { frameId: 0 }, () => void chrome.runtime.lastError);
  }
});

// The menu changes only once the tab confirms it got the new level.
const apply = (tabId, msg, vol) => chrome.tabs.sendMessage(tabId, msg, r => {
  if (!chrome.runtime.lastError && r?.ok) show(vol);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === 'reset') {
    apply(tab.id, { type: 'reset' }, 1);
    return;
  }
  if (!String(info.menuItemId).startsWith('v')) return;
  const vol = Number(info.menuItemId.slice(1)) / 100;
  apply(tab.id, { type: 'set', vol }, vol);
});
