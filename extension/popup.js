// Popup: shows the open job and lets you save it, remove it, or write a cover letter.

const $ = (id) => document.getElementById(id);
let info = null;
let settings = null;
let saved = null;   // the saved job, if this one is already in the Tracker

function setStatus(msg, ok) {
  $('status').textContent = msg;
  $('status').className = ok ? 'ok' : 'err';
}

function openPage(page) {
  chrome.tabs.create({ url: chrome.runtime.getURL(page) });
  window.close();
}

// What the last file write asked for, to try again after "Allow".
let lastWhat = null;
let openLetterAfter = null;

// Where a written file is, for messages: "Downloads/x" or "<folder>/x".
function where(path, r) { return r.inFolder ? path : 'Downloads/' + path; }

// Turns the result of saveFiles() into a message. Returns { text, ok }.
function describeFiles(r, start) {
  $('allow').hidden = !r?.needAllow;
  if (!r) return { text: start, ok: true };
  if (r.error) return { text: start + ' But a file could not be written: ' + r.error, ok: false };
  if (r.needAllow) return { text: `${start} Click "Allow" so the files can be saved to your "${r.folderName}" folder.`, ok: false };
  let text = start;
  let ok = true;
  const files = [r.csv, r.letter].filter(Boolean).map(f => where(f, r));
  if (files.length) text += ' Written to ' + files.join(' and ') + '.';
  if (r.merged) text += ` ${r.merged} job${r.merged === 1 ? '' : 's'} from the old CSV added to the Tracker.`;
  if (r.csvBlocked) { text += ' ' + r.csvBlocked; ok = false; }
  if (r.letterFailed) {
    text += ' The cover letter was not saved (the Save box was closed). Pick a folder in Settings to stop the Save box.';
    ok = false;
  }
  return { text, ok };
}

async function runFiles(what, start) {
  lastWhat = { what, start };
  const r = await saveFiles(what);
  const { text, ok } = describeFiles(r, start);
  setStatus(text, ok);
  return ok;
}

function showSaved() {
  $('save').textContent = saved ? 'Saved ✓' : 'Save job';
  $('save').disabled = !!saved;
  $('remove').hidden = !saved;
  $('letter').disabled = !info;
}

// Use what's in the boxes, in case the page didn't have it or it was edited.
function current() {
  return { ...info, company: $('company').value.trim(), title: $('title').value.trim() };
}

async function save() {
  try {
    info = current();
    if (!info.company || !info.title) {
      ['company', 'title'].forEach(k => $(k).classList.toggle('missing', !$(k).value.trim()));
      setStatus('Type the company and job title first.', false);
      return;
    }
    const { fitInfo = {} } = await chrome.storage.local.get('fitInfo');
    const extra = fitInfo[jobIdFromLink(info.link)] || {};
    const { job, isNew } = await addJob(info, extra);
    saved = job;
    await navigator.clipboard.writeText(fillTemplate(settings.copyFormat, job, settings));
    let ok = true;
    if (isNew) {
      ok = await runFiles({ csv: true, letterFor: settings.saveLetterPdf ? job.id : null }, 'Saved and copied.');
    } else setStatus('Already saved. Copied again.', true);
    showSaved();
    openLetterAfter = isNew && settings.openLetterAfterSave ? job.id : null;
    // On a problem, don't open the letter tab: the popup would close before the message is read.
    if (ok) openLetterNow();
  } catch (e) {
    setStatus('Could not save: ' + e.message, false);
  }
}

function openLetterNow() {
  if (!openLetterAfter) return;
  const id = openLetterAfter;
  openLetterAfter = null;
  chrome.tabs.create({ url: chrome.runtime.getURL('letter.html?id=' + encodeURIComponent(id)), active: true });
}

async function remove() {
  if (!info) return;
  const gone = await removeJob(info.link);
  saved = null;
  showSaved();
  await runFiles({ csv: true, removedJob: gone?.id }, 'Removed from the Tracker.');
}

// Chrome asks again for the folder after a restart; this click lets it ask, then finishes the save.
async function allow() {
  if ((await folderState(true)) !== 'granted') {
    setStatus('Saving to the folder is still not allowed. Pick the folder again in Settings.', false);
    return;
  }
  $('allow').hidden = true;
  if (lastWhat && await runFiles(lastWhat.what, lastWhat.start)) openLetterNow();
}

async function letter() {
  // The letter page needs a saved job; save it first if needed.
  info = current();
  if (!saved) {
    const { fitInfo = {} } = await chrome.storage.local.get('fitInfo');
    saved = (await addJob(info, fitInfo[jobIdFromLink(info.link)] || {})).job;
    if (!await runFiles({ csv: true, letterFor: settings.saveLetterPdf ? saved.id : null }, 'Saved.')) return;
  }
  openPage('letter.html?id=' + encodeURIComponent(saved.id));
}

$('save').addEventListener('click', save);
$('remove').addEventListener('click', remove);
$('allow').addEventListener('click', allow);
$('letter').addEventListener('click', letter);
$('openTracker').addEventListener('click', () => openPage('tracker.html'));
$('openSettings').addEventListener('click', () => openPage('options.html'));
$('openSetup').addEventListener('click', () => openPage('options.html?welcome=1'));
$('openFolder').addEventListener('click', () => openPage('options.html#folder'));

(async () => {
  settings = await loadSettings();
  $('setup').hidden = !!settings.govMode;
  $('noFolder').hidden = !settings.govMode || (await folderState(false)) !== 'none';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    info = await getJobInfo(tab);
    $('company').value = info.company || '';
    $('title').value = info.title || '';
    ['company', 'title'].forEach(k => $(k).classList.toggle('missing', !$(k).value));
    $('link').textContent = info.link;

    const { fitInfo = {} } = await chrome.storage.local.get('fitInfo');
    const f = fitInfo[jobIdFromLink(info.link)];
    if (f && (f.verdict || f.salary)) {
      $('fitRow').hidden = false;
      if (f.verdict) { $('fit').textContent = f.verdict; $('fit').className = 'pill ' + f.verdict; }
      else $('fit').textContent = '';
      $('salary').textContent = f.salary ? '· ' + f.salary : '';
    }

    saved = await findJob(info.link);
    if (saved) { $('company').value = saved.company; $('title').value = saved.title; }
    showSaved();
    if (saved) setStatus(`Saved on ${formatDate(saved.savedAt, settings.dateFormat)} · ${saved.status}`, true);
    else if (!info.company || !info.title) setStatus('Some details were not found. Type them in the boxes.', false);
    if (!saved) $('save').focus();   // press Enter to save
    // Save as soon as the icon is clicked (if the details were found).
    if (!saved && settings.autoSave && info.company && info.title) await save();
    else await catchUpCsv();
  } catch (e) {
    setStatus(e.message, false);
  }
})();
