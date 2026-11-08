// Tracker page: list of saved jobs with status, notes, CSV export.

const $ = (id) => document.getElementById(id);
let settings = null;
let csvTimer = null;

function status(msg, ok = true) {
  $('status').textContent = msg;
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
}

// Rewrite the CSV a moment after the last change, not on every keystroke.
function csvSoon() {
  if (!settings.writeCsv) return;
  clearTimeout(csvTimer);
  csvTimer = setTimeout(async () => {
    await writeCsv(settings);
    status(`CSV updated: Downloads/${settings.csvPath}`);
  }, 1500);
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
      csvSoon();
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

$('writeCsv').addEventListener('click', async () => {
  await writeCsv(settings, { force: true });
  status(`Written to Downloads/${settings.csvPath}`);
});
$('exportCsv').addEventListener('click', () => writeCsv(settings, { force: true, saveAs: true }));
$('importCsv').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await importCsv(await file.text());
    let msg = `Added ${r.added} job${r.added === 1 ? '' : 's'}.`;
    if (r.existing) msg += ` ${r.existing} already in the Tracker (kept as they are).`;
    if (r.skipped) msg += ` ${r.skipped} row${r.skipped === 1 ? '' : 's'} skipped (no job link).`;
    status(msg, r.added > 0 || r.existing > 0);
    if (r.added) csvSoon();
    render();
  } catch (err) {
    status(err.message, false);
  }
});
$('clearAll').addEventListener('click', async () => {
  if (!confirm('Delete ALL saved jobs? Export a CSV first if you want a copy.')) return;
  await setJobs([]);
  csvSoon();
  render();
});

// Another tab saved or removed a job: refresh.
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.jobs) render(); });

(async () => {
  settings = await loadSettings();
  STATUSES.forEach(s => $('statusFilter').append(el('option', { value: s, textContent: s })));
  $('csvHelp').textContent = settings.writeCsv
    ? `The CSV file is updated automatically: Downloads/${settings.csvPath}. Close it in Excel before saving jobs.`
    : 'Automatic CSV writing is off (Settings → Saving jobs). Use "Write CSV now" or "Export CSV as…".';
  render();
})();
