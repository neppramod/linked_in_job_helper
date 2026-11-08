// Cover letter page: fills the template for one saved job.
// "Save as PDF" uses Chrome's print dialog (choose "Save as PDF" as the printer).

const $ = (id) => document.getElementById(id);
let plainText = '';
let job = null;

const esc = (t) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Blank line = new paragraph, single line break kept, **bold** supported.
function render(text) {
  return text.split(/\n\s*\n/).map(par =>
    '<p>' + esc(par.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>'
  ).join('');
}

function note(msg) {
  const d = document.createElement('div');
  d.className = 'warn';
  d.textContent = msg;
  $('notes').appendChild(d);
}

function status(msg, ok = true) {
  $('status').textContent = msg;
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
}

(async () => {
  const id = new URLSearchParams(location.search).get('id');
  const settings = await loadSettings();
  job = (await getJobs()).find(j => j.id === id);
  if (!job) {
    $('paper').textContent = 'This job is not in the Tracker anymore.';
    return;
  }
  const filled = fillTemplate(settings.letterTemplate, job, settings);
  plainText = filled.replace(/\*\*(.+?)\*\*/g, '$1');
  $('paper').innerHTML = render(filled);

  // The PDF file name comes from the page title.
  const safe = (t) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  document.title = `Cover Letter - ${safe(job.company || 'Company')} - ${safe(job.title || 'Role')}`;

  // Checks, so a letter with leftovers isn't sent by mistake.
  const leftover = [...new Set(filled.match(/\{\{\s*[A-Za-z]+\s*\}\}/g) || [])];
  if (leftover.length) note('Unknown placeholders (only {{COMPANY}} {{ROLE}} {{DATE}} {{LINK}} work): ' + leftover.join(' '));
  const brackets = [...new Set(filled.match(/\[[^\]\n]{2,80}\]/g) || [])];
  if (brackets.length) note('Your template still has [bracketed] parts to replace: ' + brackets.slice(0, 6).join(' ') +
    (brackets.length > 6 ? ' …' : '') + '. Click "Edit template".');
  if (!job.company || !job.title) note('The company or job title is empty. Check the job in the Tracker.');
})();

$('print').addEventListener('click', () => window.print());
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(plainText);
  status('Copied.');
});
$('txt').addEventListener('click', () => {
  const blob = new Blob([plainText.replace(/\n/g, '\r\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = document.title + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('edit').addEventListener('click', () => { location.href = 'options.html#letterTemplate'; });
