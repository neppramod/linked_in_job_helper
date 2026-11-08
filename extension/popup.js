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
    let msg = isNew ? 'Saved and copied.' : 'Already saved. Copied again.';
    if (isNew && settings.writeCsv) {
      await writeCsv(settings);
      msg = `Saved, copied, and written to Downloads/${settings.csvPath}.`;
    }
    setStatus(msg, true);
    showSaved();
    if (isNew && settings.openLetterAfterSave) {
      chrome.tabs.create({ url: chrome.runtime.getURL('letter.html?id=' + encodeURIComponent(job.id)), active: true });
    }
  } catch (e) {
    setStatus('Could not save: ' + e.message, false);
  }
}

async function remove() {
  if (!info) return;
  await removeJob(info.link);
  if (settings.writeCsv) await writeCsv(settings);
  saved = null;
  setStatus('Removed from the Tracker.', true);
  showSaved();
}

async function letter() {
  // The letter page needs a saved job; save it first if needed.
  info = current();
  if (!saved) {
    const { fitInfo = {} } = await chrome.storage.local.get('fitInfo');
    saved = (await addJob(info, fitInfo[jobIdFromLink(info.link)] || {})).job;
    if (settings.writeCsv) await writeCsv(settings);
  }
  openPage('letter.html?id=' + encodeURIComponent(saved.id));
}

$('save').addEventListener('click', save);
$('remove').addEventListener('click', remove);
$('letter').addEventListener('click', letter);
$('openTracker').addEventListener('click', () => openPage('tracker.html'));
$('openSettings').addEventListener('click', () => openPage('options.html'));
$('openSetup').addEventListener('click', () => openPage('options.html?welcome=1'));

(async () => {
  settings = await loadSettings();
  $('setup').hidden = !!settings.govMode;
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
  } catch (e) {
    setStatus(e.message, false);
  }
})();
