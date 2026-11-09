// Background: first-run setup, SETUP.md syncing, and the Alt+Shift+R shortcut.
importScripts('settings-store.js', 'setup-md.js', 'shared.js', 'pdf.js', 'files.js');

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncSetupMd(reason === 'install');
  // Updating (not reinstalling) keeps the saved jobs, so the CSV there is the one we wrote.
  if (reason === 'update') {
    const { csvOwned } = await chrome.storage.local.get('csvOwned');
    if (!csvOwned && (await getJobs()).length) {
      const s = await loadSettings();
      await chrome.storage.local.set({ csvOwned: safePath(s.csvPath, SETTINGS_DEFAULTS.csvPath) });
    }
  }
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
  // Files are written here, not in the popup: when the popup closes, Chrome cancels its downloads.
  if (msg?.type === 'writeFiles') {
    writeFilesNow(msg).then(reply, e => reply({ error: e.message }));
    return true;
  }
});

// Downloads-folder saving (used when no folder was picked in Settings).
// csv: rewrite the CSV. letterFor: job id whose cover letter PDF to save. removedJob: delete its letter.
async function writeFilesNow({ csv, letterFor, removedJob }) {
  const settings = await loadSettings();
  const out = {};
  if (removedJob) {
    const { lastLetter } = await chrome.storage.local.get('lastLetter');
    if (lastLetter && isRemoved(lastLetter.jobId, removedJob)) {
      await deleteDownload(lastLetter.id);
      await chrome.storage.local.remove('lastLetter');
    }
  }
  if (csv && settings.writeCsv) {
    const r = await writeCsv(settings);
    if (r?.written) out.csv = safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath);
    if (r?.blocked) out.csvBlocked = csvBlockedText(settings);
  }
  if (letterFor) {
    const job = (await getJobs()).find(j => j.id === letterFor);
    if (job) {
      out.letter = await saveLetterPdf(job, settings);
      if (!out.letter) out.letterFailed = true;
    }
  }
  return out;
}

// After a change made here (Alt+Shift+R): the picked folder if there is one, else Downloads.
async function syncFiles(what) {
  if ((await folderState(false)) === 'none') return writeFilesNow(what);
  return saveFiles(what);
}

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
    if (removed) await syncFiles({ csv: true, removedJob: removed.id });
    flashBadge(tab.id, removed ? 'DEL' : '—', removed ? '#0b5d26' : '#666');
  } catch (e) {
    console.error(e);
    flashBadge(tab.id, 'ERR', '#a1001b');
  }
});
