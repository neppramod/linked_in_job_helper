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
