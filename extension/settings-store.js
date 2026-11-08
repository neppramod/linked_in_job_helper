// Settings shared by every part of the extension.
// Users change these on the Settings page (right-click the icon -> Options).
// They are saved in chrome.storage.local under the key "settings".

const DEFAULT_TEMPLATE = `[Your Name]
[City, State] · [email] · [phone] · [LinkedIn URL]

{{DATE}}

Hiring Team
{{COMPANY}}

Dear Hiring Manager,

I am applying for the **{{ROLE}}** position at **{{COMPANY}}**. [One or two sentences: who you are and how many years of experience you have.]

[One thing you did that matches this job. Name the project, process or system, and the result. For example: what you built or improved, and by how much.]

[Why this company. One specific reason.]

I would welcome the chance to talk about how I can help {{COMPANY}}. Thank you for your time.

Sincerely,
[Your Name]`;

const SETTINGS_DEFAULTS = {
  // Job filter (list on the left). Lists are one item per line.
  hideKeywords: '',
  hideCompanies: '',
  flagDescription: '',
  hideApplied: true,
  filterAction: 'hide',            // 'hide' or 'mark'

  // Fit check. One group per line; "|" adds synonyms: "Python | pandas | NumPy"
  strengths: '',
  mustHave: '',
  gaps: '',
  heavyGap: 3,
  strongMin: 4,

  // Government / defense jobs: '' (not answered yet), 'include' or 'avoid'.
  // 'avoid' adds GOV_PRESET to the filter and fit check (the lists are shown on the Settings page).
  govMode: '',

  // Company type
  avoidIndustries: '',
  avoidIsWeak: true,

  // Saving jobs
  copyFormat: '{{COMPANY}}\n{{ROLE}}\n{{LINK}}',
  writeCsv: true,
  csvPath: 'job-tracker/jobs.csv',  // inside the Downloads folder
  openLetterAfterSave: true,

  // Cover letter. Placeholders: {{COMPANY}} {{ROLE}} {{DATE}} {{LINK}}
  letterTemplate: DEFAULT_TEMPLATE,
  dateFormat: 'long'                // 'long' = November 7, 2026, 'short' = 11/07/2026
};

// Used when govMode is 'avoid'. Kept separate from your own lists so you can see
// exactly what it does and switch it off in one place.
const GOV_PRESET = {
  hideKeywords: ['government', 'federal', 'defense', 'defence', 'national security', 'clearance',
    'cleared', 'TS/SCI', 'top secret', 'DoD', 'public sector'],
  flagDescription: ['security clearance', 'clearance required', 'active clearance', 'secret clearance',
    'top secret', 'TS/SCI', 'polygraph', 'Department of Defense', 'DoD', 'national security',
    'intelligence community', 'federal government', 'government agency', 'defense industry',
    'U.S. citizenship is required', 'US citizenship required', 'must be a U.S. citizen'],
  avoidIndustries: ['Government', 'Defense', 'Military', 'Armed Forces', 'Public Safety',
    'Public Policy', 'Law Enforcement', 'Legislative', 'Executive Offices', 'International Affairs',
    'Political Organizations']
};

// Company types guessed from the job description (top 2 shown in the fit panel).
function companyTypes(settings) {
  return [
    { label: 'Government/Defense', avoid: settings.govMode === 'avoid', terms: ['government agency',
      'federal agency', 'federal government', 'public sector', 'Department of Defense', 'DoD',
      'defense contractor', 'national security', 'security clearance', 'military', 'state agency'] },
    { label: 'Consulting/Staffing', terms: ['our client', 'consulting firm', 'consultancy', 'staffing',
      'contract-to-hire', 'C2C', 'W2 contract'] },
    { label: 'Finance/Banking', terms: ['fintech', 'bank', 'banking', 'payments', 'financial services',
      'credit card', 'lending', 'asset management', 'trading', 'hedge fund'] },
    { label: 'Insurance', terms: ['insurance', 'insurer', 'underwriting'] },
    { label: 'Healthcare/Pharma', terms: ['healthcare', 'health care', 'hospital', 'patients', 'clinical',
      'medical devices', 'pharmaceutical', 'biotech', 'life sciences'] },
    { label: 'Retail/E-commerce', terms: ['retail', 'e-commerce', 'ecommerce', 'shoppers', 'stores'] },
    { label: 'Tech/Software', terms: ['SaaS', 'software company', 'cloud platform', 'tech company'] },
    { label: 'Manufacturing', terms: ['manufacturing', 'production facility', 'industrial'] },
    { label: 'Energy', terms: ['energy', 'oil and gas', 'utilities', 'renewable'] },
    { label: 'Education/Research', terms: ['university', 'academic', 'research institute', 'national laboratory'] },
    { label: 'Nonprofit', terms: ['nonprofit', 'non-profit', 'foundation', 'charity'] }
  ];
}

// Lists actually used: your own lists, plus the government/defense preset when avoiding.
function effectiveLists(settings) {
  const gov = settings.govMode === 'avoid';
  const merge = (own, preset) => [...new Set([...lines(own), ...(gov ? preset : [])])];
  return {
    hideKeywords: merge(settings.hideKeywords, GOV_PRESET.hideKeywords),
    hideCompanies: merge(settings.hideCompanies, []),
    flagDescription: merge(settings.flagDescription, GOV_PRESET.flagDescription),
    avoidIndustries: merge(settings.avoidIndustries, GOV_PRESET.avoidIndustries)
  };
}

// ---------- helpers ----------

const lines = (text) => String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

// "Python | pandas" -> { label: 'Python', terms: ['Python', 'pandas'] }
const parseGroups = (text) => lines(text).map(l => {
  const terms = l.split('|').map(s => s.trim()).filter(Boolean);
  return { label: terms[0], terms };
}).filter(g => g.terms.length);

// Whole-word, case-insensitive regex for a list of terms. null for an empty list.
const toRegex = (list) => list.length ? new RegExp(
  '(?<![A-Za-z0-9])(' +
  list.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|') +
  ')(?![A-Za-z0-9])', 'i') : null;

function loadSettings() {
  return new Promise(resolve => chrome.storage.local.get('settings', d =>
    resolve({ ...SETTINGS_DEFAULTS, ...(d.settings || {}) })));
}

function saveSettings(settings) {
  return new Promise(resolve => chrome.storage.local.set({ settings }, resolve));
}

function onSettingsChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      cb({ ...SETTINGS_DEFAULTS, ...(changes.settings.newValue || {}) });
    }
  });
}
