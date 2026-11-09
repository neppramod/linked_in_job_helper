// Tracker page: list of saved jobs with status, notes, CSV export.

const $ = (id) => document.getElementById(id);
let settings = null;
let csvTimer = null;

function status(msg, ok = true) {
  $('status').textContent = msg;
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
}

let removedSince = [];   // jobs removed since the last write (their cover letter is deleted)

// Shows the result of saveFiles().
function showFiles(r) {
  $('allowFolder').hidden = !r?.needAllow;
  if (!r) return;
  if (r.error) status('Could not write the file: ' + r.error, false);
  else if (r.needAllow) status(`Click "Allow" so the CSV can be saved to your "${r.folderName}" folder.`, false);
  else if (r.csvBlocked) status(r.csvBlocked, false);
  else if (r.csv) status('CSV updated: ' + (r.inFolder ? r.csv : 'Downloads/' + r.csv) +
    (r.merged ? ` (${r.merged} job${r.merged === 1 ? '' : 's'} from the old file added here)` : ''));
}

// Rewrite the CSV a moment after the last change, not on every keystroke.
// removedJob: a job id (or '*') that was just removed.
function csvSoon(removedJob) {
  if (removedJob) removedSince.push(removedJob);
  chrome.storage.local.set({ csvStale: true });   // if this page closes first, the next page catches up
  clearTimeout(csvTimer);
  csvTimer = setTimeout(syncNow, 800);
}

async function syncNow() {
  clearTimeout(csvTimer);
  const removed = removedSince;
  removedSince = [];
  showFiles(await saveFiles({ csv: true, removedJob: removed.length ? removed : undefined }));
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  children.forEach(c => e.append(c));
  return e;
}

async function render() {
  const q = $('search').value.trim().toLowerCase();
  const sf = $('statusFilter').value;
  const jobs = (await getJobs()).filter(j =>
    (!sf || j.status === sf) &&
    (!q || [j.company, j.title, j.notes, j.industry].join(' ').toLowerCase().includes(q)));
  // Stored newest first; sort by date saved anyway (imports, same-day dates). Ties keep stored order.
  const dir = settings?.trackerOrder === 'oldest' ? -1 : 1;
  const pos = new Map(jobs.map((j, i) => [j, i]));
  jobs.sort((a, b) => dir * (String(b.savedAt).localeCompare(String(a.savedAt)) || pos.get(a) - pos.get(b)));

  const tbody = $('rows');
  tbody.replaceChildren();
  $('empty').hidden = jobs.length > 0;

  for (const j of jobs) {
    const statusSel = el('select');
    STATUSES.forEach(s => statusSel.append(el('option', { value: s, textContent: s, selected: s === j.status })));
    statusSel.addEventListener('change', async () => { await updateJob(j.id, { status: statusSel.value }); csvSoon(); });

    const field = (key, ph) => {
      const i = el('input', { className: 'notes', value: j[key] || '', placeholder: ph });
      i.addEventListener('change', async () => { await updateJob(j.id, { [key]: i.value.trim() }); csvSoon(); });
      return i;
    };
    const notes = el('input', { className: 'notes', value: j.notes || '', placeholder: 'Notes' });
    notes.addEventListener('change', async () => { await updateJob(j.id, { notes: notes.value }); csvSoon(); });

    const letterBtn = el('button', { textContent: 'Letter' });
    letterBtn.addEventListener('click', () => { location.href = 'letter.html?id=' + encodeURIComponent(j.id); });
    const delBtn = el('button', { textContent: 'Delete', className: 'danger' });
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${j.company} · ${j.title}?`)) return;
      await removeJob(j.link);
      csvSoon(j.id);
      render();
    });

    const fit = j.fit ? el('span', { className: 'pill ' + j.fit, textContent: j.fit }) : '';
    tbody.append(el('tr', {},
      el('td', { textContent: formatDate(j.savedAt, settings.dateFormat) }),
      el('td', {}, field('company', 'Company')),
      el('td', {}, field('title', 'Job title'), el('div', {}, el('a', { href: j.link, target: '_blank', textContent: 'Open job ↗' }))),
      el('td', {}, statusSel),
      el('td', {}, fit),
      el('td', { textContent: j.salary || '' }),
      el('td', {}, notes),
      el('td', { className: 'actions' }, letterBtn, ' ', delBtn)
    ));
  }
}

$('search').addEventListener('input', render);
$('statusFilter').addEventListener('change', render);
$('order').addEventListener('change', async () => {
  settings.trackerOrder = $('order').value;
  // Merge into what's stored, so a change made elsewhere isn't lost.
  await saveSettings({ ...(await loadSettings()), trackerOrder: settings.trackerOrder });
  render();
});

$('allowFolder').addEventListener('click', async () => {
  if ((await folderState(true)) === 'granted') syncNow();
  else status('Saving to the folder is still not allowed. Pick the folder again in Settings.', false);
});
$('writeCsv').addEventListener('click', async () => {
  if ((await folderState(false)) !== 'none') { syncNow(); return; }
  const path = 'Downloads/' + safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath);
  let r = await writeCsv(settings, { force: true });
  if (r?.blocked) {
    const n = (await getJobs()).length;
    if (!confirm(`${path} already exists. Replace it with the ${n} job${n === 1 ? '' : 's'} in the Tracker?\n\n` +
      'Jobs that are only in that file will be lost. Click Cancel, then "Import CSV…", to keep them.')) {
      status(csvBlockedText(settings), false);
      return;
    }
    r = await writeCsv(settings, { force: true, replace: true });
  }
  if (r?.written) status(`Written to ${path}`);
  else status('The CSV was not written. If Chrome asked where to save, see "Ask where to save" in the README.', false);
});
$('exportCsv').addEventListener('click', () => writeCsv(settings, { force: true, saveAs: true }));
$('importCsv').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await importCsv(await file.text());
    await markCsvImported(settings, file.name);
    let msg = `Added ${r.added} job${r.added === 1 ? '' : 's'}.`;
    if (r.existing) msg += ` ${r.existing} already in the Tracker (kept as they are).`;
    if (r.skipped) msg += ` ${r.skipped} row${r.skipped === 1 ? '' : 's'} skipped (no job link).`;
    status(msg, r.added > 0 || r.existing > 0);
    csvSoon();   // the file now has everything from the Tracker and the import
    render();
  } catch (err) {
    status(err.message, false);
  }
});
$('clearAll').addEventListener('click', async () => {
  if (!confirm('Delete ALL saved jobs? Export a CSV first if you want a copy.')) return;
  await setJobs([]);
  csvSoon('*');
  render();
});

// Another tab saved or removed a job: refresh.
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.jobs) render(); });

(async () => {
  settings = await loadSettings();
  STATUSES.forEach(s => $('statusFilter').append(el('option', { value: s, textContent: s })));
  $('order').value = settings.trackerOrder === 'oldest' ? 'oldest' : 'newest';
  const folder = await getFolder();
  const csvAt = folder ? `your "${folder.name}" folder (${folderCsvName(settings)})`
    : 'Downloads/' + safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath);
  $('csvHelp').textContent = settings.writeCsv
    ? `The CSV file is updated automatically: ${csvAt}. Close it in Excel before saving jobs.`
    : 'Automatic CSV writing is off (Settings → Saving jobs). Use "Write CSV now" or "Export CSV as…".';
  render();
  showFiles(await catchUpCsv());
})();
