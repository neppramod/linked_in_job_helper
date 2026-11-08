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
  const left = jobs.filter(j => !sameJob(j.link, link));
  await setJobs(left);
  return left.length < jobs.length;
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

// Writes all saved jobs to Downloads/<csvPath>, replacing the old file.
// saveAs = true shows the "Save as" dialog (used by the Export button).
async function writeCsv(settings, { saveAs = false, force = false } = {}) {
  if (!settings.writeCsv && !force) return null;
  const jobs = await getJobs();
  const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(toCsv(jobs));
  return chrome.downloads.download({
    url,
    filename: settings.csvPath || SETTINGS_DEFAULTS.csvPath,
    conflictAction: 'overwrite',
    saveAs
  });
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
