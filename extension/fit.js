// Fit check: when you open a job, shows a panel above the description with
// matched strengths, gaps and the years of experience asked for.
// It never hides anything. Settings come from the Settings page.
// Uses helpers from settings-store.js and filter.js (loaded first).

// Text color, light background, border. Dark text on a light tint reads well.
const FIT_COLORS = { Strong: '#0b5d26', Mixed: '#8a4b00', Weak: '#a1001b', Unrated: '#444' };
const FIT_BG     = { Strong: '#e3f6e8', Mixed: '#fff2db', Weak: '#fde4e4', Unrated: '#f1f1f1' };
const FIT_BORDER = { Strong: '#7cc791', Mixed: '#e8b766', Weak: '#ec8f8f', Unrated: '#ccc' };

const groupRegex = (g) => new RegExp(toRegex(g.terms).source, 'gi');
let FS = { ...SETTINGS_DEFAULTS };   // settings used by the fit check
let STRENGTH_RES = [], GAP_RES = [], TYPE_RES = [], MUST_HAVE = [];
let AVOID_INDUSTRY_RE = null;

function applyFitSettings(settings) {
  FS = settings;
  STRENGTH_RES = parseGroups(FS.strengths).map(g => ({ label: g.label, re: groupRegex(g) }));
  GAP_RES = parseGroups(FS.gaps).map(g => ({ label: g.label, re: groupRegex(g) }));
  TYPE_RES = companyTypes(FS).map(g => ({ label: g.label, avoid: !!g.avoid, re: groupRegex(g) }));
  // Must-have may be typed as a label or any of its synonyms.
  MUST_HAVE = lines(FS.mustHave).map(m => {
    const g = parseGroups(FS.strengths).find(g => g.terms.some(t => t.toLowerCase() === m.toLowerCase()));
    return g ? g.label : m;
  });
  const ind = effectiveLists(FS).avoidIndustries;
  AVOID_INDUSTRY_RE = ind.length
    ? new RegExp(ind.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : null;
}

let fitById = {};      // job id -> verdict, remembered so list cards can show a badge
let fitByTitle = {};   // title -> verdict, fallback when cards have no job id
let fitInfo = {};      // job id -> { verdict, salary, industry }, read by the popup when saving

chrome.storage.local.get(['fitById', 'fitByTitle', 'fitInfo'], (d) => {
  // Merge: a scan may already have stored results before this callback runs.
  fitById = { ...(d.fitById || {}), ...fitById };
  fitByTitle = { ...(d.fitByTitle || {}), ...fitByTitle };
  fitInfo = { ...(d.fitInfo || {}), ...fitInfo };
});

function computeFit(text, extra = {}) {
  const strengths = STRENGTH_RES.filter(g => (text.match(g.re) || []).length > 0).map(g => g.label);
  // Must-haves that aren't strengths at all are matched on their own.
  const missing = MUST_HAVE.filter(l => {
    if (strengths.includes(l)) return false;
    if (STRENGTH_RES.some(g => g.label === l)) return true;
    const re = toRegex([l]);
    return !(re && re.test(text));
  });
  const gaps = GAP_RES.map(g => ({ label: g.label, count: (text.match(g.re) || []).length }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.count - a.count);

  const years = [...new Set([...text.matchAll(/(?<![\d.])(\d{1,2})\s*\+?\s*(?:or more\s+|plus\s+)?(?:years|yrs)\b/gi)]
    .map(m => +m[1]).filter(n => n > 0 && n <= 30))].sort((a, b) => a - b);

  const types = TYPE_RES.map(g => ({ label: g.label, avoid: g.avoid, count: (text.match(g.re) || []).length }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  const industry = extra.industry || '';
  const avoidReason = (AVOID_INDUSTRY_RE && AVOID_INDUSTRY_RE.test(industry) && industry)
    || (types.find(t => t.avoid) || {}).label || '';
  const avoid = !!avoidReason;
  const configured = STRENGTH_RES.length + GAP_RES.length + MUST_HAVE.length > 0;

  let verdict;
  if (avoid && FS.avoidIsWeak) verdict = 'Weak';
  else if (!configured) verdict = 'Unrated';
  else if (missing.length) verdict = 'Weak';
  else if (gaps.some(g => g.count >= +FS.heavyGap)) verdict = 'Mixed';
  else if (strengths.length >= +FS.strongMin) verdict = 'Strong';
  else verdict = 'Mixed';

  return { verdict, configured, strengths, missing, gaps, years, types, industry, avoid, avoidReason, salary: extra.salary || '' };
}

function line(text, color) {
  const d = document.createElement('div');
  d.textContent = text;
  d.style.cssText = `margin-top:4px;color:${color || 'inherit'};`;
  return d;
}

function buildPanel(fit) {
  const p = document.createElement('div');
  p.id = 'ljc-fit';
  p.style.cssText = `border:1px solid ${FIT_BORDER[fit.verdict]};border-radius:6px;padding:8px 12px;margin:8px 0;` +
    `font:14px/1.4 system-ui,sans-serif;color:#1f1f1f;background:${FIT_BG[fit.verdict]};`;

  const head = document.createElement('div');
  head.textContent = fit.verdict === 'Unrated' ? 'Job Helper' : `Fit: ${fit.verdict}`;
  head.style.cssText = `font-weight:700;font-size:15px;color:${FIT_COLORS[fit.verdict]};`;
  p.appendChild(head);

  // Company line: LinkedIn industry, then the type guessed from the description.
  const parts = [];
  if (fit.industry) parts.push(fit.industry);
  if (fit.types.length) parts.push('description: ' + fit.types.map(t => t.label).join(', '));
  if (parts.length) p.appendChild(line('Company: ' + parts.join(' · ')));
  if (fit.avoid) p.appendChild(line('⚠ Company type you want to avoid: ' + fit.avoidReason, '#a1001b'));
  if (fit.salary) p.appendChild(line('Salary: ' + fit.salary));

  if (fit.strengths.length) p.appendChild(line('✓ ' + fit.strengths.join(' · '), '#0b5d26'));
  if (fit.missing.length) p.appendChild(line('✗ Not mentioned: ' + fit.missing.join(', '), '#a1001b'));
  if (fit.gaps.length) p.appendChild(line('⚠ ' + fit.gaps.map(g => `${g.label} ×${g.count}`).join(' · '), '#8a4b00'));
  if (fit.years.length) p.appendChild(line('Years asked: ' + fit.years.map(n => n + '+').join(', ')));
  if (!fit.configured) p.appendChild(line('Add your skills on the Settings page to get a fit rating ' +
    '(right-click the extension icon → Options).', '#555'));
  return p;
}

// Section under a heading like "About the company".
function sectionByHeading(title) {
  const h = [...document.querySelectorAll('h1, h2, h3')]
    .find(e => e.textContent.trim().toLowerCase() === title.toLowerCase());
  let el = h;
  while (el && (el.textContent || '').length < 80) el = el.parentElement;
  return el || null;
}

// LinkedIn shows "Financial Services · 10,001+ employees" under "About the company".
function companyIndustry() {
  const sec = sectionByHeading('About the company');
  if (!sec) return '';
  const pieces = cardPieces(sec);
  for (let i = 0; i < pieces.length; i++) {
    if (!/\d[\d,]*\+?\s*employees/i.test(pieces[i])) continue;
    const before = pieces[i].split(/\s*[·•]\s*/)[0].trim();
    if (before && !/employees/i.test(before)) return before;
    for (let j = i - 1; j >= 0; j--) {
      const q = pieces[j].replace(/\s*[·•]\s*$/, '').trim();
      if (q && q.length < 60 && !/followers|^follow$|on linkedin|^[·•]$/i.test(q)) return q;
    }
  }
  return '';
}

const AMT = String.raw`\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?[kK]?`;
const PER = String.raw`(?:\s?(?:\/|per|an|a)\s?(?:yr|year|annum|hr|hour))?`;
const RANGE_RE = new RegExp(`(${AMT})${PER}\\s*(?:-|–|—|to)\\s*(${AMT})(${PER})`, 'i');
const SINGLE_RE = new RegExp(`(${AMT})\\s?(?:\\/|per|an|a)\\s?(yr|year|annum|hr|hour)`, 'i');

function unit(per) {
  if (!per) return '';
  return /hr|hour/i.test(per) ? ' /hr' : ' /yr';
}

// Salary from the top of the job pane, the job's list card, or the description.
function findSalary(descText) {
  const texts = [];
  const h1 = document.querySelector('h1');
  let top = h1;
  for (let i = 0; top && i < 4; i++) top = top.parentElement;
  if (top) texts.push(cardPieces(top).join(' | '));
  const id = currentJobId();
  findCards().forEach((cid, card) => { if (id && cid === id) texts.push(cardPieces(card).join(' | ')); });
  texts.push(descText);
  for (const t of texts) {
    const m = t.match(RANGE_RE);
    if (m) return `${m[1].replace(/\s/g, '')} – ${m[2].replace(/\s/g, '')}${unit(m[3])}`;
  }
  for (const t of texts) {
    const m = t.match(SINGLE_RE);
    if (m) return `${m[1].replace(/\s/g, '')}${unit(m[2])}`;
  }
  return '';
}

function currentTitle() {
  const h = document.querySelector('h1');
  return h ? h.textContent.trim().toLowerCase() : '';
}

function remember(id, title, verdict, info) {
  if (id && JSON.stringify(fitInfo[id]) !== JSON.stringify(info)) {
    fitInfo[id] = info;
    fitInfo = Object.fromEntries(Object.entries(fitInfo).slice(-3000));
    chrome.storage.local.set({ fitInfo });
  }
  if (verdict === 'Unrated') return;   // no badge without a rating
  let changed = false;
  if (id && fitById[id] !== verdict) { fitById[id] = verdict; changed = true; }
  if (title && fitByTitle[title] !== verdict) { fitByTitle[title] = verdict; changed = true; }
  if (!changed) return;
  // Keep storage small: only the most recent 3000 entries.
  const trim = (o) => Object.fromEntries(Object.entries(o).slice(-3000));
  fitById = trim(fitById);
  fitByTitle = trim(fitByTitle);
  chrome.storage.local.set({ fitById, fitByTitle });
}

function scanFitPanel() {
  const id = currentJobId();
  const desc = findDescription();
  const old = document.getElementById('ljc-fit');
  if (old && old.dataset.ljcFor !== id) old.remove();
  if (!id || !desc) return;

  // Rebuild only when something changed (the page loads in pieces).
  const text = cardPieces(desc).join(' | ');
  if (text.length < 200) return;   // not loaded yet
  const industry = companyIndustry();
  const salary = findSalary(text);
  const sig = `${text.length}|${industry}|${salary}`;
  const panel = document.getElementById('ljc-fit');
  if (panel && panel.dataset.sig === sig) return;

  const fit = computeFit(text, { industry, salary });
  panel?.remove();
  const p = buildPanel(fit);
  p.dataset.ljcFor = id;
  p.dataset.sig = sig;
  desc.prepend(p);
  remember(id, currentTitle(), fit.verdict,
    { verdict: fit.verdict === 'Unrated' ? '' : fit.verdict, salary: fit.salary, industry: fit.industry });
}

// Small "Fit: Strong" badge on list cards for jobs you've already opened.
function scanFitBadges() {
  const cards = findCards();
  // Remove badges from anything that is no longer a list card.
  document.querySelectorAll('.ljc-badge').forEach(b => { if (!cards.has(b.parentElement)) b.remove(); });
  cards.forEach((id, card) => {
    const pieces = cardPieces(card);
    const verdict = (id && fitById[id]) || (pieces[0] && fitByTitle[pieces[0].toLowerCase()]);
    let badge = card.querySelector(':scope .ljc-badge');
    if (!verdict) { badge?.remove(); return; }
    const text = `Fit: ${verdict}`;
    if (badge && badge.textContent === text) return;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ljc-badge';
      card.prepend(badge);
    }
    badge.textContent = text;
    badge.style.cssText = `display:inline-block;width:auto;margin:4px 0 0 8px;padding:1px 8px;border-radius:10px;` +
      `font:600 11px/1.6 system-ui,sans-serif;color:${FIT_COLORS[verdict]};background:${FIT_BG[verdict]};` +
      `border:1px solid ${FIT_BORDER[verdict]};`;
  });
}

function scanFit() {
  scanFitPanel();
  scanFitBadges();
}
