// Settings page: loads settings into the form and saves them back.

const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ['strengths', 'mustHave', 'gaps', 'hideKeywords', 'hideCompanies', 'flagDescription',
  'avoidIndustries', 'csvPath', 'letterFolder', 'copyFormat', 'letterTemplate'];
const NUMBER_FIELDS = ['heavyGap', 'strongMin'];
const CHECK_FIELDS = ['autoSave', 'hideApplied', 'avoidIsWeak', 'writeCsv', 'openLetterAfterSave', 'saveLetterPdf'];
const SELECT_FIELDS = ['filterAction', 'dateFormat'];

let dirty = false;

function fill(s) {
  TEXT_FIELDS.forEach(k => { $(k).value = s[k] ?? ''; });
  NUMBER_FIELDS.forEach(k => { $(k).value = s[k]; });
  CHECK_FIELDS.forEach(k => { $(k).checked = !!s[k]; });
  SELECT_FIELDS.forEach(k => { $(k).value = s[k]; });
  document.querySelectorAll('input[name=govMode]').forEach(r => { r.checked = r.value === s.govMode; });
  $('welcome').hidden = !(s.govMode === '' || location.search.includes('welcome'));
  dirty = false;
}

function read() {
  const s = { ...SETTINGS_DEFAULTS };
  TEXT_FIELDS.forEach(k => { s[k] = $(k).value; });
  NUMBER_FIELDS.forEach(k => { s[k] = Math.max(1, parseInt($(k).value, 10) || SETTINGS_DEFAULTS[k]); });
  CHECK_FIELDS.forEach(k => { s[k] = $(k).checked; });
  SELECT_FIELDS.forEach(k => { s[k] = $(k).value; });
  s.govMode = document.querySelector('input[name=govMode]:checked')?.value || '';
  s.csvPath = cleanCsvPath(s.csvPath);
  s.letterFolder = cleanFolder(s.letterFolder);
  return s;
}

// Chrome only saves inside Downloads, with a relative path and no "..".
function cleanCsvPath(p) {
  p = safePath(p, SETTINGS_DEFAULTS.csvPath);
  if (!/\.csv$/i.test(p)) p += '.csv';
  return p;
}

// A folder inside Downloads: relative, no "..", no file name.
function cleanFolder(p) {
  return safePath(p, SETTINGS_DEFAULTS.letterFolder);
}

function status(msg, ok) {
  $('status').textContent = msg;
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
}

function showPreset() {
  for (const k of Object.keys(GOV_PRESET)) $('preset-' + k).textContent = GOV_PRESET[k].join(', ');
}

async function save() {
  const s = read();
  if (!s.govMode) {
    $('gov-section').classList.add('required');
    $('gov-error').hidden = false;
    $('gov-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    status('Please answer question 1 (government and defense jobs) first.', false);
    return;
  }
  await saveSettings(s);
  $('csvPath').value = s.csvPath;
  $('letterFolder').value = s.letterFolder;
  $('welcome').hidden = true;
  dirty = false;
  status('Saved. Open LinkedIn jobs to see it in action.', true);
}

document.addEventListener('input', () => { dirty = true; status('', true); });
document.addEventListener('change', (e) => {
  dirty = true;
  if (e.target.name === 'govMode') {
    $('gov-section').classList.remove('required');
    $('gov-error').hidden = true;
  }
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

$('save').addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
});

$('resetTemplate').addEventListener('click', () => {
  if (confirm('Replace your cover letter template with the example?')) {
    $('letterTemplate').value = DEFAULT_TEMPLATE;
    dirty = true;
  }
});

$('exportSettings').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(read(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'job-helper-settings.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

$('importSettings').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async () => {
  const file = $('importFile').files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const s = { ...SETTINGS_DEFAULTS };
    for (const k of Object.keys(SETTINGS_DEFAULTS)) if (k in data) s[k] = data[k];
    fill(s);
    dirty = true;
    status('Loaded from file. Click Save settings to keep it.', true);
  } catch (e) {
    status('That file is not a settings export: ' + e.message, false);
  }
  $('importFile').value = '';
});

$('resetAll').addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults? Your saved jobs in the Tracker are kept.')) return;
  await saveSettings({ ...SETTINGS_DEFAULTS });
  fill({ ...SETTINGS_DEFAULTS });
  status('Reset to defaults.', true);
});

function setupMsg(r) {
  const el = $('setupMsg');
  if (r.error) { el.textContent = r.error; el.className = 'error'; return; }
  const w = r.warnings || [];
  el.className = w.length ? 'error' : 'help';
  el.textContent = (r.applied ? 'Loaded settings from SETUP.md.' : '') +
    (w.length ? ' Problems in SETUP.md: ' + w.join(' ') : '');
}

$('downloadSetup').addEventListener('click', () => {
  const blob = new Blob([generateSetupMd(read()).replace(/\n/g, '\r\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'SETUP.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $('setupMsg').className = 'help';
  $('setupMsg').textContent = 'Downloaded. Move SETUP.md from Downloads into the extension folder, replacing the old one.';
});

$('loadSetup').addEventListener('click', async () => {
  if (dirty && !confirm('Replace what is on this page with SETUP.md?')) return;
  const r = await syncSetupMd(true);
  setupMsg(r);
  fill(await loadSettings());
});

showPreset();
// Pick up SETUP.md edits first, then show the settings.
syncSetupMd(false).then(async (r) => {
  if (r.applied || r.error) setupMsg(r);
  fill(await loadSettings());
});

// ---------- Folder for files ----------

async function showFolder() {
  const h = await getFolder();
  const st = await folderState(false);
  $('folderName').textContent = !h ? 'Not chosen yet. Files go to your Downloads folder (Chrome may ask where to save).'
    : st === 'granted' ? h.name : `${h.name} (Chrome needs you to click "Allow again")`;
  $('forgetFolder').hidden = !h;
  $('allowFolder').hidden = !h || st === 'granted';
}

function folderMsg(msg, ok) {
  $('folderMsg').textContent = msg;
  $('folderMsg').className = 'status ' + (ok ? 'ok' : 'err');
}

// A new folder also gets the cover letter of the most recently saved job, so it's ready to upload.
async function newestLetterJob() {
  const s = await loadSettings();
  if (!s.saveLetterPdf) return null;
  const jobs = await getJobs();
  const newest = jobs.reduce((a, j) => (!a || String(j.savedAt) > String(a.savedAt) ? j : a), null);
  return newest?.id || null;
}

function folderResult(r) {
  if (r.error) return folderMsg('Could not write to the folder: ' + r.error, false);
  if (r.csvBlocked) return folderMsg(r.csvBlocked, false);
  folderMsg('Done. ' + (r.csv ? `${r.csv} is up to date.` : '') + (r.letter ? ` Cover letter: ${r.letter}.` : '') +
    (r.merged ? ` ${r.merged} job${r.merged === 1 ? '' : 's'} from the old file were added to the Tracker.` : ''), true);
}

$('pickFolder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    folderMsg('This browser can\'t pick a folder. Files will go to Downloads.', false);
    return;
  }
  try {
    const h = await showDirectoryPicker({ id: 'job-helper', mode: 'readwrite', startIn: 'documents' });
    await setFolder(h);
    folderResult(await saveFiles({ csv: true, letterFor: await newestLetterJob() }));
  } catch (e) {
    if (e.name !== 'AbortError') folderMsg(e.message, false);
  }
  showFolder();
if (location.hash === '#folder') {
  $('folder').scrollIntoView({ block: 'center' });
  $('pickFolder').focus();
}
});
$('allowFolder').addEventListener('click', async () => {
  if ((await folderState(true)) === 'granted') folderResult(await saveFiles({ csv: true }));
  showFolder();
if (location.hash === '#folder') {
  $('folder').scrollIntoView({ block: 'center' });
  $('pickFolder').focus();
}
});
$('forgetFolder').addEventListener('click', async () => {
  await setFolder(null);
  folderMsg('Files will go to your Downloads folder again.', true);
  showFolder();
if (location.hash === '#folder') {
  $('folder').scrollIntoView({ block: 'center' });
  $('pickFolder').focus();
}
});
showFolder();
if (location.hash === '#folder') {
  $('folder').scrollIntoView({ block: 'center' });
  $('pickFolder').focus();
}
