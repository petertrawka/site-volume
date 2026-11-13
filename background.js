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
  chrome.tabs.sendMessage(tabId, { type: 'get' }, r => {
    if (chrome.runtime.lastError || !r) { chrome.contextMenus.update('root', { title: 'Site volume' }, () => void chrome.runtime.lastError); return; }
    show(r.vol);
  });
}

chrome.tabs.onActivated.addListener(({ tabId }) => refresh(tabId));

chrome.runtime.onMessage.addListener((m, sender) => {
  if (m.type === 'current' && sender.tab?.active) show(m.vol);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === 'reset') {
    chrome.tabs.sendMessage(tab.id, { type: 'reset' }, () => void chrome.runtime.lastError);
    show(1);
    return;
  }
  if (!String(info.menuItemId).startsWith('v')) return;
  const vol = Number(info.menuItemId.slice(1)) / 100;
  chrome.tabs.sendMessage(tab.id, { type: 'set', vol }, () => void chrome.runtime.lastError);
  show(vol);
});
