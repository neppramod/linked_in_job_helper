// SETUP.md: a plain-text settings file people can edit in Notepad.
// generateSetupMd(settings) writes it, parseSetupMd(text) reads it back.
// Both use the same SECTIONS list, so the format can't drift.
// Needs settings-store.js (SETTINGS_DEFAULTS, GOV_PRESET, DEFAULT_TEMPLATE).

const SETUP_SECTIONS = [
  { title: '1. Government and defense jobs (pick one)', type: 'choice', key: 'govMode',
    help: ['Do you want to see jobs with the government, the military,',
      'or companies that need a security clearance?'],
    after: ['"No, hide them" uses a ready-made list of words and companies.',
      'You can see that list at the bottom of this file.'],
    options: [['include', 'Yes, show them'], ['avoid', 'No, hide them']] },

  { title: '2. Your skills', type: 'list', key: 'strengths',
    help: ['Write one skill per line. Start each line with "- ".',
      'If a skill has other names, put them on the same line with | between them.',
      'Example:   - Excel | spreadsheets',
      'The extension looks for these words in each job and rates the job: Strong, Mixed or Weak.'] },

  { title: '3. Skills the job must have', type: 'list', key: 'mustHave',
    help: ['If a job does not mention one of these, it is rated Weak.',
      'Leave this empty if you have none.'] },

  { title: '4. Things you do not want', type: 'list', key: 'gaps',
    help: ['Skills you do not have, or work you do not want to do.',
      'The extension warns you when a job mentions them.',
      'Example:   - Night shift'] },

  { title: '5. Hide jobs with these words', type: 'list', key: 'hideKeywords',
    help: ['If the job title, company name or location has one of these words,',
      'the job is hidden from the list.',
      'Example:   - Unpaid'] },

  { title: '6. Hide jobs from these companies', type: 'list', key: 'hideCompanies',
    help: ['Example:   - Example Staffing Inc'] },

  { title: '7. Warn me when a job description has these words', type: 'list', key: 'flagDescription',
    help: ['When you open a job that has one of these, you see a red warning.',
      'The job is also hidden from the list after that.',
      'Example:   - 100% travel'] },

  { title: '8. Warn me about these industries', type: 'list', key: 'avoidIndustries',
    help: ['LinkedIn shows each company\'s industry under "About the company".',
      'Example:   - Tobacco'] },

  { title: '9. Other choices (tick all you want)', type: 'checks',
    options: [['hideApplied', 'Hide jobs I already applied to'],
      ['avoidIsWeak', 'Rate a job Weak if it is a company type I do not want'],
      ['writeCsv', 'Update my spreadsheet (CSV file) every time I save a job'],
      ['openLetterAfterSave', 'Open the cover letter after I save a job']] },

  { title: '10. Hidden jobs (pick one)', type: 'choice', key: 'filterAction',
    options: [['hide', 'Hide them completely'], ['mark', 'Show them with a red border']] },

  { title: '11. Date in the cover letter (pick one)', type: 'choice', key: 'dateFormat',
    options: [['long', 'November 7, 2026'], ['short', '11/07/2026'], ['iso', '2026-11-07']] },

  { title: '12. Rating numbers', type: 'numbers',
    help: ['You can leave these as they are.'],
    options: [['heavyGap', 'How many times a "thing you do not want" must appear to make the job Mixed'],
      ['strongMin', 'How many of your skills a job needs to be Strong']] },

  { title: '13. Where to save the spreadsheet', type: 'text', key: 'csvPath',
    help: ['A folder and file name inside your Downloads folder.',
      'Close the file in Excel before you save a new job.',
      'If it is open, Chrome may make a second copy, like jobs (1).csv.'] },

  { title: '14. What to copy when you save a job', type: 'code', key: 'copyFormat',
    help: ['The text between the two ``` lines is copied.',
      'These are replaced for each job:',
      '{{COMPANY}} = company name, {{ROLE}} = job title, {{LINK}} = job link, {{DATE}} = today'] },

  { title: '15. Your cover letter', type: 'code', key: 'letterTemplate',
    help: ['Write your letter between the two ``` lines.',
      'Replace everything in [square brackets] with your own words.',
      'These are filled in for each job: {{COMPANY}} {{ROLE}} {{DATE}} {{LINK}}',
      'To make words bold, put ** on both sides: **like this**',
      'Start a line with # and a space to make it a heading, for your name: # Jane Doe',
      'Leave an empty line between paragraphs.'] }
];

const FENCE = '```';

function generateSetupMd(s) {
  const out = [
    '# Job Helper Setup',
    '',
    '> How to use this file:',
    '> 1. Open it in Notepad (or any text editor).',
    '> 2. To pick an answer, put an x in the box: [x]   To un-pick it, use a space: [ ]',
    '> 3. To add to a list, write a new line that starts with "- "',
    '> 4. Save the file.',
    '>',
    '> Lines that start with > are help. You can leave them as they are.',
    '> Your changes are used the next time you open a LinkedIn page.',
    '> If they are not, go to chrome://extensions and click the round arrow on LinkedIn Job Helper.',
    ''
  ];
  for (const sec of SETUP_SECTIONS) {
    out.push('## ' + sec.title, '');
    (sec.help || []).forEach(h => out.push('> ' + h));
    if (sec.help) out.push('');
    if (sec.type === 'choice') {
      sec.options.forEach(([v, label]) => out.push(`- [${s[sec.key] === v ? 'x' : ' '}] ${label}`));
      if (sec.after) { out.push(''); sec.after.forEach(h => out.push('> ' + h)); }
    } else if (sec.type === 'checks') {
      sec.options.forEach(([k, label]) => out.push(`- [${s[k] ? 'x' : ' '}] ${label}`));
    } else if (sec.type === 'numbers') {
      sec.options.forEach(([k, label]) => out.push(`- ${label}: ${s[k]}`));
    } else if (sec.type === 'list') {
      const items = lines(s[sec.key]);
      if (items.length) items.forEach(i => out.push('- ' + i));
      else out.push('- ');
    } else if (sec.type === 'text') {
      out.push('- ' + (s[sec.key] || ''));
    } else if (sec.type === 'code') {
      out.push(FENCE, String(s[sec.key] || '').replace(/\r\n/g, '\n'), FENCE);
    }
    out.push('');
  }
  out.push('## The ready-made list for "No, hide them"', '',
    '> You do not need to change anything here. It is only so you can see what is hidden.', '>',
    '> Jobs are hidden if the title, company name or location has: ' + GOV_PRESET.hideKeywords.join(', '),
    '>',
    '> You get a red warning if the job description has: ' + GOV_PRESET.flagDescription.join(', '),
    '>',
    '> You get a warning for these industries: ' + GOV_PRESET.avoidIndustries.join(', '),
    '');
  return out.join('\n');
}

// Returns { settings, warnings }. Anything missing or unreadable keeps its default.
function parseSetupMd(text, base = SETTINGS_DEFAULTS) {
  const s = { ...base };
  const warnings = [];
  const norm = (t) => t.toLowerCase().replace(/^\d+\.\s*/, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  // Split into sections by "## " headings.
  const blocks = {};
  let current = null;
  let inFence = false;
  for (const raw of String(text).replace(/\r\n/g, '\n').split('\n')) {
    if (!inFence && raw.startsWith('## ')) {
      current = norm(raw.slice(3));
      blocks[current] = [];
      continue;
    }
    if (raw.trim().startsWith(FENCE)) inFence = !inFence;
    if (current) blocks[current].push(raw);
  }

  for (const sec of SETUP_SECTIONS) {
    const body = blocks[norm(sec.title)];
    if (!body) { warnings.push(`Section "${sec.title}" not found, kept the current value.`); continue; }
    const content = body.filter(l => !l.trim().startsWith('>'));
    const boxes = content.map(l => l.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+?)\s*$/)).filter(Boolean)
      .map(m => ({ on: m[1].toLowerCase() === 'x', label: m[2].toLowerCase() }));
    const findBox = (label) => boxes.find(b => b.label.startsWith(label.toLowerCase().slice(0, 20)));

    if (sec.type === 'choice') {
      const on = sec.options.filter(([, label]) => findBox(label)?.on);
      if (on.length > 1) warnings.push(`"${sec.title}": more than one box ticked, used the first one.`);
      s[sec.key] = on.length ? on[0][0] : (sec.key === 'govMode' ? '' : base[sec.key]);
    } else if (sec.type === 'checks') {
      sec.options.forEach(([k, label]) => { const b = findBox(label); if (b) s[k] = b.on; });
    } else if (sec.type === 'numbers') {
      sec.options.forEach(([k, label]) => {
        const l = content.find(x => x.toLowerCase().includes(label.toLowerCase().slice(0, 30)));
        const n = l && parseInt((l.match(/:\s*(\d+)/) || [])[1], 10);
        if (n > 0) s[k] = n;
        else warnings.push(`"${label}": no number found, kept ${s[k]}.`);
      });
    } else if (sec.type === 'list' || sec.type === 'text') {
      const items = content.map(l => l.match(/^\s*[-*]\s+(.*)$/) || l.match(/^\s*[-*]\s*$/))
        .filter(Boolean).map(m => (m[1] || '').trim()).filter(i => i && !/^\[[ xX]\]/.test(i));
      s[sec.key] = sec.type === 'text' ? (items[0] || base[sec.key]) : items.join('\n');
    } else if (sec.type === 'code') {
      // Use the raw lines: a template line may start with ">" and must be kept.
      const start = body.findIndex(l => l.trim().startsWith(FENCE));
      const end = start >= 0 ? body.findIndex((l, i) => i > start && l.trim().startsWith(FENCE)) : -1;
      if (start >= 0 && end > start) s[sec.key] = body.slice(start + 1, end).join('\n');
      else warnings.push(`"${sec.title}": the text must be between two lines of three backticks.`);
    }
  }
  return { settings: s, warnings };
}

// Small hash to notice when SETUP.md changed.
function hashText(t) {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// Reads SETUP.md from the extension folder and applies it if it changed since last time.
// force = true applies it even if unchanged. Returns { applied, warnings, error }.
async function syncSetupMd(force = false) {
  try {
    const res = await fetch(chrome.runtime.getURL('SETUP.md') + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return { applied: false, warnings: [], error: 'SETUP.md not found in the extension folder.' };
    const text = await res.text();
    const hash = hashText(text);
    const { setupHash } = await chrome.storage.local.get('setupHash');
    if (!force && hash === setupHash) return { applied: false, warnings: [] };
    // An untouched SETUP.md (as shipped) must not wipe settings made on the Settings page,
    // e.g. after updating to a new version.
    const asShipped = parseSetupMd(text, SETTINGS_DEFAULTS).settings;
    const untouched = Object.keys(SETTINGS_DEFAULTS).every(k => String(asShipped[k]) === String(SETTINGS_DEFAULTS[k]));
    if (untouched && !force) {
      await chrome.storage.local.set({ setupHash: hash });
      return { applied: false, warnings: [] };
    }
    const current = await loadSettings();
    const { settings, warnings } = parseSetupMd(text, current);
    await saveSettings(settings);
    await chrome.storage.local.set({ setupHash: hash, setupWarnings: warnings });
    return { applied: true, warnings };
  } catch (e) {
    return { applied: false, warnings: [], error: e.message };
  }
}
