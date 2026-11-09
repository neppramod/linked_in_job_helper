// Saving files into a folder the user picked once on the Settings page (File System Access API).
// No "Save as" box, works with Chrome's "Ask where to save each file" turned on, on Windows, Mac and
// Linux, and the extension can read the jobs.csv already in the folder (so a reinstall merges it
// instead of replacing it). Without a folder, files go to Downloads through the background (shared.js).
// Needs settings-store.js, shared.js and pdf.js.

const FOLDER_DB = 'ljh-files';

// The folder handle lives in IndexedDB (chrome.storage can't hold it).
function folderDb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(FOLDER_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { open.result.close(); resolve(req?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}

async function getFolder() {
  try { return (await folderDb('readonly', s => s.get('folder'))) || null; } catch (e) { return null; }
}

// A new folder may already have a jobs.csv, so it is read and merged before the first write.
async function setFolder(handle) {
  await folderDb('readwrite', s => (handle ? s.put(handle, 'folder') : s.delete('folder')));
  await chrome.storage.local.remove(['folderCsvOwned', 'folderLastLetter']);
}

// 'none' (no folder chosen), 'granted', 'prompt' (Chrome needs one click to allow it again) or 'denied'.
// ask = true shows Chrome's "allow" question; only works right after a click.
async function folderState(ask = false) {
  const h = await getFolder();
  if (!h) return 'none';
  try {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
    return p;
  } catch (e) {
    return 'denied';
  }
}

// "<folder name>/<path>" for messages.
function inRoot(root, p) { return root.name ? root.name + '/' + p : p; }

async function subFolder(root, relPath) {
  let dir = root;
  for (const part of relPath.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

async function readFileText(dir, name) {
  try { return await (await (await dir.getFileHandle(name)).getFile()).text(); } catch (e) { return null; }
}

async function writeFileData(dir, name, data) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

// The CSV file name in the folder: the file name part of the "spreadsheet" setting (jobs.csv).
function folderCsvName(settings) {
  return safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath).split('/').pop();
}

// Writes jobs.csv in the folder. The first time (new folder, or after a reinstall) the jobs already
// in that file are added to the Tracker first, so nothing in it is lost. After that the file is
// simply rewritten, so removing a job in the Tracker removes it from the file too.
async function writeCsvToFolder(root, settings) {
  const name = folderCsvName(settings);
  const { folderCsvOwned } = await chrome.storage.local.get('folderCsvOwned');
  const out = {};
  if (folderCsvOwned !== name) {
    const old = await readFileText(root, name);
    if (old && old.trim()) {
      try {
        const r = await importCsv(old);
        out.merged = r.added;
      } catch (e) {
        // Not a file this extension wrote (no Link column): leave it alone.
        return { csvBlocked: `${inRoot(root, name)} is not a jobs file from this extension, so it was not changed. ` +
          'Rename or move it, or pick another folder in Settings.' };
      }
    }
  }
  await writeFileData(root, name, toCsv(await getJobs()));
  await chrome.storage.local.set({ folderCsvOwned: name, csvStale: false });
  out.csv = inRoot(root, name);
  return out;
}

function base64Bytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Writes the cover letter PDF, then deletes the one written before it (only that file, by name).
async function saveLetterToFolder(root, job, settings) {
  const folder = safePath(settings.letterFolder, SETTINGS_DEFAULTS.letterFolder);
  const name = letterFileName(job);
  const dir = await subFolder(root, folder);
  await writeFileData(dir, name, new Blob([base64Bytes(letterPdfBase64(filledLetter(job, settings)))], { type: 'application/pdf' }));
  const { folderLastLetter: last } = await chrome.storage.local.get('folderLastLetter');
  if (last && !(last.folder === folder && last.name === name)) {
    try { await (await subFolder(root, last.folder)).removeEntry(last.name); } catch (e) { /* already gone */ }
  }
  await chrome.storage.local.set({ folderLastLetter: { folder, name, jobId: job.id } });
  return inRoot(root, `${folder}/${name}`);
}

// When a job is removed, its cover letter (if it's the one in the folder) goes too.
async function removeLetterOfJob(root, removed) {
  const { folderLastLetter: last } = await chrome.storage.local.get('folderLastLetter');
  if (!last || !isRemoved(last.jobId, removed)) return;
  try { await (await subFolder(root, last.folder)).removeEntry(last.name); } catch (e) { /* already gone */ }
  await chrome.storage.local.remove('folderLastLetter');
}

// The one function pages call to write files.
//   csv: rewrite jobs.csv. letterFor: job id whose cover letter to save. removedJob: job id(s) just
//   removed, or '*' for all (their cover letter is deleted).
// Returns { csv, letter, merged, csvBlocked, needAllow, inFolder, folderName, error }.
async function saveFiles(what) {
  const settings = await loadSettings();
  const state = await folderState(false);
  if (state === 'none') {
    // No folder chosen: Downloads, through the background.
    return writeFiles(what);
  }
  const root = await getFolder();
  if (state !== 'granted') {
    if (what.csv) await chrome.storage.local.set({ csvStale: true });
    return { needAllow: true, folderName: root.name };
  }
  const out = { inFolder: true, folderName: root.name };
  try {
    if (what.removedJob) await removeLetterOfJob(root, what.removedJob);
    if (what.csv && settings.writeCsv) Object.assign(out, await writeCsvToFolder(root, settings));
    if (what.letterFor) {
      const job = (await getJobs()).find(j => j.id === what.letterFor);
      if (job) out.letter = await saveLetterToFolder(root, job, settings);
    }
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

// A page that opens can catch up on a CSV change it couldn't write earlier (e.g. Alt+Shift+R
// while Chrome still needed the "allow" click).
async function catchUpCsv() {
  const { csvStale } = await chrome.storage.local.get('csvStale');
  if (csvStale && (await folderState(false)) === 'granted') return saveFiles({ csv: true });
  return null;
}
