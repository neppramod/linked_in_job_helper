// LinkedIn job filter: hides job cards that match keywords or companies,
// and flags open jobs whose description mentions terms you want to avoid.

// Settings come from settings-store.js (loaded first) and the Settings page.

let S = { ...SETTINGS_DEFAULTS };   // current settings
let CARD_RE = null;                 // hide words + companies
let DESC_RE = null;                 // description words that flag a job
let ready = false;

let flagged = new Set();   // job IDs flagged from their description
let showHidden = false;
let hiddenCount = 0;
let cardCount = 0;

function applyFilterSettings(settings) {
  S = settings;
  const L = effectiveLists(S);
  CARD_RE = toRegex([...L.hideKeywords, ...L.hideCompanies]);
  DESC_RE = toRegex(L.flagDescription);
}

// Ask the background to pick up SETUP.md edits (settings then update through onSettingsChanged).
try { chrome.runtime.sendMessage({ type: 'syncSetup' }, () => void chrome.runtime.lastError); } catch (e) { /* ignore */ }

Promise.all([
  loadSettings(),
  new Promise(r => chrome.storage.local.get('flaggedJobs', r))
]).then(([settings, d]) => {
  flagged = new Set(d.flaggedJobs || []);
  applyFilterSettings(settings);
  if (typeof applyFitSettings === 'function') applyFitSettings(settings);
  ready = true;
  scan();
});

// Settings page saved: apply right away, no reload needed.
onSettingsChanged((settings) => {
  applyFilterSettings(settings);
  if (typeof applyFitSettings === 'function') applyFitSettings(settings);
  document.getElementById('ljc-banner')?.remove();
  document.getElementById('ljc-fit')?.remove();
  scan();
});

function currentJobId() {
  const u = new URL(location.href);
  return u.searchParams.get('currentJobId')
    || (u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/) || [])[1];
}

function cardJobId(card) {
  return card.dataset.ljcJobId
    || card.getAttribute('data-occludable-job-id')
    || card.querySelector('[data-job-id]')?.getAttribute('data-job-id')
    || card.getAttribute('data-job-id');
}

// Text of a card as separate pieces. Works the same whether the card is shown or
// hidden (innerText changes when an element is hidden, which caused flicker).
// Elements the extension adds to the page. Their text is never matched.
const OURS = '#ljc-pill, #ljc-banner, #ljc-fit, .ljc-badge';
const isOurs = (n) => !!n && !!(n.nodeType === 1 ? n : n.parentElement)?.closest(OURS);

function cardPieces(card) {
  const pieces = [];
  const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (isOurs(n)) continue;
    const t = n.nodeValue.trim();
    if (t) pieces.push(t);
  }
  return pieces;
}

// "Applied", "Applied on company site", "Applied 2 days ago" -- but not "Applied Scientist".
const APPLIED_PIECE_RE = /^Applied( on .*| \d+ \w+ ago)?$/;

function reasonToHide(card) {
  const pieces = cardPieces(card);
  if (!pieces.length) return null;             // not rendered yet (LinkedIn lazy-loads)
  const id = cardJobId(card);
  if (id && flagged.has(id)) return 'flagged description';
  const m = CARD_RE && pieces.join(' | ').match(CARD_RE);
  if (m) return m[1];
  if (S.hideApplied && pieces.some(p => APPLIED_PIECE_RE.test(p))) return 'applied';
  return null;
}

// Finds job cards without relying on LinkedIn's class names (they change a lot).
// "Seeds" are things every card has: a link to the job or a dismiss (X) button.
// From each seed we walk up the page until the next step would swallow another
// job's seed. That element is the card.
function findCards() {
  const seeds = [];
  document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]').forEach(a => {
    const m = a.href.match(/currentJobId=(\d+)/) || a.href.match(/\/jobs\/view\/(?:[^/?]*-)?(\d+)/);
    if (m) seeds.push({ el: a, key: 'id:' + m[1] });
  });
  document.querySelectorAll('button[aria-label*="ismiss" i]').forEach(b => {
    seeds.push({ el: b, key: 'x:' + b.getAttribute('aria-label') });
  });
  document.querySelectorAll('[data-occludable-job-id], [data-job-id]').forEach(el => {
    seeds.push({ el, key: 'id:' + (el.getAttribute('data-occludable-job-id') || el.getAttribute('data-job-id')) });
  });

  const cards = new Map();   // card element -> job id (if known)
  for (const s of seeds) {
    let el = s.el;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      if ((p.textContent || '').length > 2000) break;          // too big to be one card
      const other = seeds.some(o => o.key !== s.key && o.key.slice(0, 2) === s.key.slice(0, 2)
        && p.contains(o.el) && !el.contains(o.el));
      if (other) break;
      el = p;
    }
    if (el === s.el) continue;                                   // never grew: not a card
    if (!cards.has(el) || s.key.startsWith('id:')) {
      cards.set(el, s.key.startsWith('id:') ? s.key.slice(3) : cards.get(el));
    }
  }
  // Keep only the outermost card when one sits inside another.
  for (const c of [...cards.keys()]) {
    for (const d of cards.keys()) if (d !== c && d.contains(c)) { cards.delete(c); break; }
  }
  // Keep only cards in the job list on the left. Sections of the open job's
  // pane on the right (header, Premium box, "People you can reach out to")
  // also contain job links, but they are not job cards.
  const desc = findDescription();
  const paneLeft = desc ? desc.getBoundingClientRect().left - 40 : Infinity;
  for (const c of [...cards.keys()]) {
    const r = c.getBoundingClientRect();
    if (r.width === 0) {                       // hidden by us: keep if it was a list card
      if (c.dataset.ljcList !== '1') cards.delete(c);
    } else if (r.left >= paneLeft || c.contains(desc) || desc?.contains(c)) {
      cards.delete(c);
    } else {
      c.dataset.ljcList = '1';
    }
  }
  return cards;
}

function scanCards() {
  const found = findCards();
  found.forEach((id, el) => { if (id) el.dataset.ljcJobId = id; });
  const cards = new Set(found.keys());
  cardCount = cards.size;

  // Undo anything applied earlier to elements that turned out not to be list cards.
  document.querySelectorAll('[data-ljc-hidden]').forEach(el => {
    if (cards.has(el)) return;
    delete el.dataset.ljcHidden;
    el.style.display = '';
    el.style.outline = '';
  });

  let count = 0;
  cards.forEach(card => {
    const reason = reasonToHide(card);
    if (reason) {
      count++;
      card.dataset.ljcHidden = reason;
      card.title = `Hidden by filter: ${reason}`;
      const hide = S.filterAction === 'hide' && !showHidden;
      card.style.display = hide ? 'none' : '';
      card.style.outline = hide ? '' : '2px solid #b00020';
    } else if (card.dataset.ljcHidden) {
      delete card.dataset.ljcHidden;
      card.style.display = '';
      card.style.outline = '';
    }
  });
  hiddenCount = count;
}

// The open job's description. Works for the classic and the newer layout.
function findDescription() {
  let desc = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content, .description__text');
  if (!desc) {
    // Newer layout: find the "About the job" heading and take its section.
    const h = [...document.querySelectorAll('h1, h2, h3')].find(e => e.textContent.trim() === 'About the job');
    let el = h;
    while (el && (el.textContent || '').length < 300) el = el.parentElement;
    desc = el;
  }
  return desc || null;
}

function scanDescription() {
  const id = currentJobId();
  const desc = findDescription();
  const old = document.getElementById('ljc-banner');
  if (old && old.dataset.ljcFor !== id) old.remove();
  if (!id || !desc || !DESC_RE || document.getElementById('ljc-banner')) return;

  const text = cardPieces(desc).join(' | ');
  const hits = [...new Set([...text.matchAll(new RegExp(DESC_RE.source, 'gi'))].map(m => m[1]))];
  if (!hits.length) return;

  const banner = document.createElement('div');
  banner.id = 'ljc-banner';
  banner.dataset.ljcFor = id;
  banner.textContent = `⚠ Filter match: ${hits.join(', ')}.` + (S.filterAction === 'hide' ? ' This job will be hidden from the list.' : '');
  banner.style.cssText = 'background:#b00020;color:#fff;padding:8px 12px;margin:8px 0;border-radius:4px;font-weight:600;';
  desc.prepend(banner);

  if (!flagged.has(id)) {
    flagged.add(id);
    storeLocal({ flaggedJobs: [...flagged].slice(-5000) });
  }
}

function updatePill() {
  let pill = document.getElementById('ljc-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'ljc-pill';
    pill.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9999;background:#333;color:#fff;' +
      'padding:6px 12px;border-radius:16px;font:13px system-ui;cursor:pointer;opacity:.85;';
    pill.addEventListener('click', () => { showHidden = !showHidden; scan(); });
    document.body.appendChild(pill);
  }
  const text = S.filterAction === 'hide'
    ? `Filter: ${hiddenCount} hidden of ${cardCount} jobs · ${showHidden ? 'hide them' : 'show'}`
    : `Filter: ${hiddenCount} marked of ${cardCount} jobs`;
  if (pill.textContent !== text) pill.textContent = text;
}

function scan() {
  if (!ready) return;
  if (!location.pathname.startsWith('/jobs')) {
    document.getElementById('ljc-pill')?.remove();
    return;
  }
  scanCards();
  scanDescription();
  if (typeof scanFit === 'function') scanFit();   // fit.js
  updatePill();
}

// LinkedIn is a single-page app: rescan when the page changes.
let timer;
const observer = new MutationObserver((muts) => {
  // The extension was reloaded: this old copy stops. Refreshing the page starts the new one.
  if (!extensionAlive()) { observer.disconnect(); return; }
  // Ignore changes made by the extension itself (pill, banner, fit panel, badges).
  if (muts.every(m => isOurs(m.target)
    || (m.addedNodes.length + m.removedNodes.length > 0
        && [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType === 1 && n.matches?.(OURS))))) return;
  // Throttle: at most one scan every 300 ms, even if the page never stops changing.
  if (!timer) timer = setTimeout(() => { timer = null; if (extensionAlive()) scan(); }, 300);
});
observer.observe(document.body, { childList: true, subtree: true });
