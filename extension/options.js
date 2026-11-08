// Settings page: loads settings into the form and saves them back.

const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ['strengths', 'mustHave', 'gaps', 'hideKeywords', 'hideCompanies', 'flagDescription',
  'avoidIndustries', 'csvPath', 'copyFormat', 'letterTemplate'];
const NUMBER_FIELDS = ['heavyGap', 'strongMin'];
const CHECK_FIELDS = ['hideApplied', 'avoidIsWeak', 'writeCsv', 'openLetterAfterSave'];
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
  return s;
}

// Chrome only saves inside Downloads, with a relative path and no "..".
function cleanCsvPath(p) {
  p = String(p || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/(^|\/)\.\.(?=\/|$)/g, '');
  if (!p) p = SETTINGS_DEFAULTS.csvPath;
  if (!/\.csv$/i.test(p)) p += '.csv';
  return p;
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
