// Shared by the popup, background, Tracker and Cover letter pages.
// Needs settings-store.js loaded first.

// Runs inside the LinkedIn page. Must be self-contained (no outer variables).
function extractJobInfo() {
  const pick = (selectors) => {
    for (const s of selectors) {
      const text = document.querySelector(s)?.innerText?.trim();
      if (text) return text.split('\n')[0].trim();
    }
    return '';
  };

  // LinkedIn changes class names often. Add new selectors at the top of these lists.
  let title = pick([
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    'h1.top-card-layout__title',
    'h1.topcard__title'
  ]);
  let company = pick([
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    'a.topcard__org-name-link',
    '.topcard__flavor a'
  ]);

  // Fallback: tab title on /jobs/view/ pages looks like "Title | Company | LinkedIn"
  const parts = document.title.replace(/^\(\d+\)\s*/, '').split(' | ');
  if (parts.length >= 3 && parts[parts.length - 1].trim() === 'LinkedIn') {
    title = title || parts[0].trim();
    company = company || parts[1].trim();
  }

  // Newer layout fallbacks.
  if (!company) {
    const el = document.querySelector('[aria-label^="Company, " i]');
    if (el) company = el.getAttribute('aria-label').replace(/^Company,\s*/i, '').replace(/\.$/, '').trim();
  }
  if (!company) {
    // First line under the "About the company" heading is the company name.
    const h = [...document.querySelectorAll('h2, h3')].find(e => e.textContent.trim() === 'About the company');
    let sec = h;
    while (sec && (sec.innerText || '').split('\n').filter(Boolean).length < 2) sec = sec.parentElement;
    const lines = (sec?.innerText || '').split('\n').map(l => l.trim())
      .filter(l => l && l !== 'About the company' && !/followers|^follow$/i.test(l));
    company = lines[0] || '';
  }
  if (!title) title = (document.querySelector('h1')?.innerText || '').split('\n')[0].trim();

  const url = new URL(location.href);
  const id = url.searchParams.get('currentJobId')
    || (url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/) || [])[1];
  const link = id ? `https://www.linkedin.com/jobs/view/${id}/` : url.origin + url.pathname;

  return { company, title, link };
}

async function getJobInfo(tab) {
  if (!tab?.url?.includes('linkedin.com')) throw new Error('Open a LinkedIn job page first.');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractJobInfo
  });
  return result;
}

// ---------- Saved jobs (the Tracker) ----------
// Stored in chrome.storage.local under "jobs": newest first.

const STATUSES = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];

const jobIdFromLink = (link) => (String(link).match(/\/jobs\/view\/(?:[^/?]*-)?(\d+)/) || [])[1] || '';
const sameJob = (a, b) => (jobIdFromLink(a) && jobIdFromLink(a) === jobIdFromLink(b)) ||
  String(a).replace(/\/+$/, '') === String(b).replace(/\/+$/, '');

async function getJobs() {
  const { jobs } = await chrome.storage.local.get('jobs');
  return Array.isArray(jobs) ? jobs : [];
}

async function setJobs(jobs) {
  await chrome.storage.local.set({ jobs });
}

async function findJob(link) {
  return (await getJobs()).find(j => sameJob(j.link, link)) || null;
}

// Adds a job, or returns the existing one if it's already saved.
async function addJob(info, extra = {}) {
  const jobs = await getJobs();
  const existing = jobs.find(j => sameJob(j.link, info.link));
  if (existing) return { job: existing, isNew: false };
  const job = {
    id: jobIdFromLink(info.link) || String(Date.now()),
    savedAt: new Date().toISOString(),
    company: info.company || '',
    title: info.title || '',
    link: info.link,
    status: 'Saved',
    fit: extra.fit || extra.verdict || '',
    salary: extra.salary || '',
    industry: extra.industry || '',
    notes: ''
  };
  jobs.unshift(job);
  await setJobs(jobs);
  return { job, isNew: true };
}

async function removeJob(link) {
  const jobs = await getJobs();
  const gone = jobs.find(j => sameJob(j.link, link)) || null;
  await setJobs(jobs.filter(j => !sameJob(j.link, link)));
  return gone;   // the removed job, or null
}

// Was this job removed? removed is a job id, a list of ids, or '*' for all.
function isRemoved(jobId, removed) {
  const list = [].concat(removed || []);
  return list.includes('*') || list.includes(jobId);
}

async function updateJob(id, patch) {
  const jobs = await getJobs();
  const j = jobs.find(x => x.id === id);
  if (j) Object.assign(j, patch);
  await setJobs(jobs);
  return j;
}

// ---------- CSV ----------

const CSV_COLUMNS = [
  ['Date saved', j => (j.savedAt || '').slice(0, 10)],
  ['Company', j => j.company],
  ['Job title', j => j.title],
  ['Link', j => j.link],
  ['Status', j => j.status],
  ['Fit', j => j.fit],
  ['Salary', j => j.salary],
  ['Industry', j => j.industry],
  ['Notes', j => j.notes]
];

function toCsv(jobs) {
  const cell = (v) => {
    v = String(v ?? '');
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const rows = [CSV_COLUMNS.map(c => c[0])].concat(jobs.map(j => CSV_COLUMNS.map(c => c[1](j))));
  // BOM so Excel opens it as UTF-8 (accents, dashes); CRLF for Windows.
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Splits CSV text into rows of cells. Handles "quoted, cells", "" inside quotes,
// line breaks inside quotes, CRLF and a leading BOM.
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

// Turns CSV text (as written by toCsv, maybe edited in Excel) into job objects.
// Columns are matched by their heading, so their order doesn't matter.
// Returns { jobs, skipped } or throws if no "Link" column is found.
function jobsFromCsv(text) {
  const rows = parseCsv(text);
  const norm = (h) => String(h).trim().toLowerCase();
  const head = (rows.shift() || []).map(norm);
  const col = (name) => head.indexOf(norm(name));
  const keys = { 'Date saved': 'savedAt', 'Company': 'company', 'Job title': 'title', 'Link': 'link',
    'Status': 'status', 'Fit': 'fit', 'Salary': 'salary', 'Industry': 'industry', 'Notes': 'notes' };
  if (col('Link') < 0) throw new Error('This file has no "Link" column. Pick the jobs.csv file this extension wrote.');
  const jobs = [];
  let skipped = 0;
  for (const r of rows) {
    const j = {};
    for (const [h, k] of Object.entries(keys)) j[k] = col(h) >= 0 ? String(r[col(h)] ?? '').trim() : '';
    if (!/^https?:\/\//i.test(j.link)) { skipped++; continue; }
    // "2026-11-07" or a date Excel rewrote, like "11/7/2026". Noon, so the day can't shift.
    const iso = j.savedAt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d = iso ? new Date(+iso[1], iso[2] - 1, +iso[3], 12) : new Date(j.savedAt);
    j.savedAt = isNaN(d) ? new Date().toISOString() : d.toISOString();
    j.status = STATUSES.find(s => s.toLowerCase() === j.status.toLowerCase()) || 'Saved';
    jobs.push(j);
  }
  return { jobs, skipped };
}

// Adds jobs from a CSV to the Tracker. Jobs already in the Tracker are kept as they are.
// Returns { added, existing, skipped }.
async function importCsv(text) {
  const { jobs: incoming, skipped } = jobsFromCsv(text);
  const jobs = await getJobs();
  const ids = new Set(jobs.map(j => j.id));
  let added = 0, existing = 0;
  for (const j of incoming) {
    if (jobs.some(x => sameJob(x.link, j.link))) { existing++; continue; }
    let id = jobIdFromLink(j.link) || String(Date.now());
    while (ids.has(id)) id += '-1';
    ids.add(id);
    jobs.push({ id, ...j });
    added++;
  }
  jobs.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  await setJobs(jobs);
  return { added, existing, skipped };
}

// ---------- File names (must work on Windows, Mac and Linux) ----------

// One file or folder name. Removes characters Windows doesn't allow, trailing dots and spaces,
// and names Windows reserves (CON, NUL, COM1...).
function safeName(t, fallback = 'file') {
  let s = String(t || '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/, '').replace(/^\.+/, '').slice(0, 80).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s += '_';
  return s || fallback;
}

// A path inside Downloads, like "job-tracker/jobs.csv". Chrome needs "/" and no "..".
function safePath(p, fallback) {
  const parts = String(p || '').split(/[\\/]+/).map(x => x.trim())
    .filter(x => x && x !== '.' && x !== '..').map(x => safeName(x));
  return parts.length ? parts.join('/') : fallback;
}

// Asks the background to write the CSV and/or the cover letter PDF (see background.js).
function writeFiles(what) {
  return chrome.runtime.sendMessage({ type: 'writeFiles', ...what }).catch(e => ({ error: e.message }));
}

// Waits until a download has finished (or failed). Returns the download item, or null.
async function downloadDone(id, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const [item] = await chrome.downloads.search({ id });
    if (item && item.state !== 'in_progress') return item;
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

// Does the full path Chrome reports (C:\Users\..\Downloads\x\y.csv or /home/../Downloads/x/y.csv)
// end in our relative path? Ignores case (Windows and Mac don't care about it).
function isSameFile(fullPath, relPath) {
  return String(fullPath).replace(/\\/g, '/').toLowerCase().endsWith('/' + relPath.toLowerCase());
}

// The CSV path this install may replace is stored in csvOwned. It is set when this install
// first created the file, or after you imported it, or chose to replace it. A CSV that is
// already there otherwise (for example after reinstalling the extension) is never replaced:
// its jobs would be lost, because the extension can't read files by itself.
//
// Returns { written: true }, { blocked: true } (an old file is there and was left alone),
// or { written: false } (Chrome didn't finish, e.g. a Save dialog was closed).
// replace = true replaces an old file anyway (after the user said yes).
// saveAs = true shows the "Save as" dialog (used by the Export button).
async function writeCsv(settings, { saveAs = false, force = false, replace = false } = {}) {
  if (!settings.writeCsv && !force) return null;
  const filename = safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath);
  const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(toCsv(await getJobs()));
  if (saveAs) {
    await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: true });
    return { written: true };
  }
  const { csvOwned } = await chrome.storage.local.get('csvOwned');
  if (replace || csvOwned === filename) {
    await chrome.downloads.download({ url, filename, conflictAction: 'overwrite', saveAs: false });
    if (replace) await chrome.storage.local.set({ csvOwned: filename });
    return { written: true };
  }
  // First time for this path: let Chrome rename if a file is already there, then look.
  const id = await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
  const item = await downloadDone(id);
  if (!item || item.state !== 'complete') return { written: false };
  if (isSameFile(item.filename, filename)) {
    await chrome.storage.local.set({ csvOwned: filename });
    return { written: true };
  }
  // Renamed (like "jobs (1).csv"): the old file is there. Remove our copy, keep theirs.
  try { await chrome.downloads.removeFile(id); } catch (e) { /* ignore */ }
  try { await chrome.downloads.erase({ id }); } catch (e) { /* ignore */ }
  return { blocked: true };
}

// After importing a CSV: if it's the file at our CSV path (same file name), the Tracker now has
// its jobs, so it's safe to replace it from now on.
async function markCsvImported(settings, importedName) {
  const filename = safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath);
  const base = filename.split('/').pop().toLowerCase();
  if (String(importedName).toLowerCase() === base) await chrome.storage.local.set({ csvOwned: filename });
}

// Message shown when an old CSV was left alone.
function csvBlockedText(settings) {
  return `Downloads/${safePath(settings.csvPath, SETTINGS_DEFAULTS.csvPath)} already exists and was not changed, ` +
    `so its jobs aren't lost. On the Tracker page, click "Import CSV…" and pick that file. After that it is kept up to date.`;
}

// ---------- Cover letter PDF ----------

// The letter text with the template filled in (still has **bold** and # marks).
// The job title is used without work-type tags, so a letter doesn't say "the Java Engineer [Hybrid]
// position". Removes [Hybrid], (Remote - US), "- Onsite", "| Hybrid/Remote" and the like.
// The Tracker and the CSV keep the full title.
const WORK_TYPE = '(?:hybrid|remote|on[- ]?site|in[- ]office|wfh|work from home)';
function letterRole(title) {
  const t = String(title || '');
  const cleaned = t
    .replace(new RegExp(`\\s*[\\[(][^\\])]*\\b${WORK_TYPE}\\b[^\\])]*[\\])]`, 'gi'), '')
    .replace(new RegExp(`\\s*[-–—|,:]\\s*${WORK_TYPE}(?:\\s*[-–—/,&]\\s*${WORK_TYPE})*(?:\\s*[-–—,]\\s*[A-Za-z .,]{0,30})?\\s*$`, 'i'), '')
    .replace(/\s*[-–—|,:]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || t.trim();
}

function filledLetter(job, settings) {
  return fillTemplate(settings.letterTemplate, { ...job, title: letterRole(job.title) }, settings);
}

function letterFileName(job) {
  return safeName(`Cover Letter - ${safeName(job.company, 'Company')} - ${safeName(letterRole(job.title), 'Role')}`, 'Cover Letter')
    + '.pdf';
}

// Saves the letter PDF to Downloads/<letterFolder>/ and deletes the one saved before it,
// so the folder only has the newest letter. Must run in the background (a closing popup
// would cancel the download). Needs pdf.js.
async function saveLetterPdf(job, settings) {
  const filename = safePath(settings.letterFolder, SETTINGS_DEFAULTS.letterFolder) + '/' + letterFileName(job);
  const id = await chrome.downloads.download({
    url: 'data:application/pdf;base64,' + letterPdfBase64(filledLetter(job, settings)),
    filename,
    conflictAction: 'overwrite',
    saveAs: false
  });
  // Delete the old letter only once the new one is really saved (a closed Save box cancels it).
  const item = await downloadDone(id);
  if (!item || item.state !== 'complete') return null;
  const { lastLetter } = await chrome.storage.local.get('lastLetter');
  if (lastLetter?.id && lastLetter.id !== id && !isSameFile(item.filename, lastLetter.filename)) await deleteDownload(lastLetter.id);
  await chrome.storage.local.set({ lastLetter: { id, filename, jobId: job.id } });
  return filename;
}

// Deletes a file this extension downloaded (by download id; never anything else).
async function deleteDownload(id) {
  try { await chrome.downloads.removeFile(id); } catch (e) { /* already gone */ }
  try { await chrome.downloads.erase({ id }); } catch (e) { /* ignore */ }
}

// ---------- Filling the templates ----------

function formatDate(date, fmt) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  if (fmt === 'short') return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
  if (fmt === 'iso') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fillTemplate(template, job, settings, date = new Date()) {
  const values = {
    COMPANY: job.company || '',
    ROLE: job.title || '',
    LINK: job.link || '',
    DATE: formatDate(date, settings.dateFormat)
  };
  return String(template || '').replace(/\{\{\s*([A-Z]+)\s*\}\}/g, (m, k) => (k in values ? values[k] : m));
}
