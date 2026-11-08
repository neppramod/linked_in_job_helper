// Background: first-run setup, SETUP.md syncing, and the Alt+Shift+R shortcut.
importScripts('settings-store.js', 'setup-md.js', 'shared.js');

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncSetupMd(reason === 'install');
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(() => syncSetupMd(false));

// LinkedIn pages ask for a SETUP.md check when they load.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'syncSetup') {
    syncSetupMd(false).then(reply);
    return true;   // reply later
  }
});

function flashBadge(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 4000);
}

// Alt+Shift+R: remove the open job from the Tracker without opening the popup.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'remove-job') return;
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  try {
    const info = await getJobInfo(tab);
    const removed = await removeJob(info.link);
    const settings = await loadSettings();
    if (removed && settings.writeCsv) await writeCsv(settings);
    flashBadge(tab.id, removed ? 'DEL' : '—', removed ? '#0b5d26' : '#666');
  } catch (e) {
    console.error(e);
    flashBadge(tab.id, 'ERR', '#a1001b');
  }
});
