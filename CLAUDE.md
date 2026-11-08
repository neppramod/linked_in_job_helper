# CLAUDE.md

Notes for Claude Code (and other contributors) working on this repo.

## What this is
A Chrome extension (Manifest V3), no build step, no dependencies. Everything is in `extension/`.
Users install it with **Load unpacked**. Target users include non-technical people on Windows,
so nothing may require extra software (no Python, Node, native host).

## Layout
- `settings-store.js`: defaults (`SETTINGS_DEFAULTS`), `GOV_PRESET`, `companyTypes()`, `toRegex()`,
  `parseGroups()`, `loadSettings()`/`saveSettings()`/`onSettingsChanged()`. Loaded first everywhere.
- `setup-md.js`: `SETUP_SECTIONS` drives both `generateSetupMd()` and `parseSetupMd()`, so the
  SETUP.md format can't drift. `syncSetupMd()` re-reads SETUP.md when its hash changes, and ignores
  an untouched (as-shipped) SETUP.md so an update can't wipe settings made on the Settings page.
- Content scripts (order matters, they share globals): `settings-store.js`, `filter.js`, `fit.js`.
  - `filter.js`: `findCards()` (finds job cards without LinkedIn class names: seeds = job links /
    dismiss buttons, walk up until another job's seed would be swallowed, keep only cards left of
    the description), hiding, red banner, grey pill.
  - `fit.js`: fit panel, company type, salary, badges. Stores `fitInfo` for the popup.
- `shared.js`: `extractJobInfo()` (runs in the page via `chrome.scripting`), saved jobs (`jobs` in
  `chrome.storage.local`), `toCsv()`/`writeCsv()` (data URL + `chrome.downloads`, `conflictAction:
  'overwrite'`), `fillTemplate()`.
- Pages: `popup.*`, `options.*` (Settings), `tracker.*`, `letter.*` (print to PDF), `page.css`.
- `background.js`: first-run Settings tab, SETUP.md sync on request, Alt+Shift+R remove.

## Rules learned the hard way
- **Don't rely on LinkedIn class names.** They change. Use structure/text (see `findCards()`).
- **Read card text with a TreeWalker (`cardPieces()`), not `innerText`.** `innerText` of a hidden
  element loses line breaks, which caused hide/unhide flicker.
- **Throttle, don't debounce, the MutationObserver.** LinkedIn mutates constantly; a debounce
  never fires.
- **Ignore our own DOM changes** (`OURS` selector) in the observer, or it loops.
- **Never put `data-job-id` on our own elements.** `findCards()` treats it as a job card seed.
  Use `data-ljc-*`.
- **Merge, don't replace, values loaded from storage** in async callbacks (a scan may have written first).
- Sorting the job list was tried (CSS `order`) and removed: it didn't work on the new layout.
- Keep user-facing text plain and short. SETUP.md is edited in Notepad by non-developers.

## Testing
No test suite yet. What worked: Playwright + Chrome for Testing with
`--load-extension` / `--disable-extensions-except`, `--headless=new`, and `context.route()` to
serve mock LinkedIn pages (two columns: list on the left, job pane with "About the job" and
"About the company" on the right). Notes:
- Tabs opened by `onInstalled` before Playwright attaches aren't visible to it.
- Playwright cancels `chrome.downloads`; allow them with CDP `Browser.setDownloadBehavior`.
  That override also changes the saved file name, so the CSV path can't be verified that way.
- To test the popup in a tab, patch `chrome.tabs.query` with an init script to return the LinkedIn tab.

## Not verified yet
- Real Windows install, Edge, Chrome's "Save as PDF" dialog, CSV folder/file name in real Chrome.
- Company/title fallbacks on LinkedIn's newer `/jobs/search-results/` layout (popup fields are
  editable as a safety net).
