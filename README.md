# LinkedIn Job Helper

A Chrome extension that makes job searching on LinkedIn faster. Works on Windows, Mac and Linux.
Nothing else to install.

- **Save a job in one click.** Company, job title and link are copied, added to a tracker, and written to a
  spreadsheet (CSV) you can open in Excel or Google Sheets.
- **Cover letter for each job.** Your template is filled in with the company, job title and date.
  Save it as a PDF or copy the text.
- **Fit rating.** When you open a job, a box shows which of your skills it mentions and rates it
  **Strong**, **Mixed** or **Weak**. It also shows the salary (when listed) and what kind of company it is.
- **Hide jobs you don't want.** By words, by company, jobs you already applied to, and (if you choose)
  government and defense jobs.
- **Tracker page.** All saved jobs with status (Saved, Applied, Interview, Offer…), notes, and CSV export.

Everything stays in your own browser. Nothing is sent anywhere.

---

## Install

1. On this GitHub page, click **Code → Download ZIP**.
2. Unzip it to a folder you will keep, for example `Documents\LinkedIn Job Helper`.
   Don't delete this folder later. Chrome loads the extension from it.
3. Open Chrome and go to `chrome://extensions`
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and pick the **`extension`** folder inside the folder you unzipped.
6. Click the puzzle-piece icon in Chrome's toolbar and pin **LinkedIn Job Helper**.

The Settings page opens by itself. Answer the questions there (next section).

> Chrome may sometimes show a message about "developer mode extensions". That is normal for extensions
> installed this way. Click **Keep** or close the message.

---

## Set it up

There are two ways. Use whichever you like.

**A. The Settings page.** Right-click the extension icon → **Options**. Fill it in and click **Save settings**.

**B. The SETUP.md file.** Open `extension\SETUP.md` in Notepad. It explains itself:
put an `x` in a box to pick something, and add list items on lines that start with `- `.
Save the file. The extension reads it the next time you open a LinkedIn page.

What you'll be asked:

1. **Government and defense jobs.** Show them, or hide them. You must pick one.
   "Hide them" uses a ready-made list of words and companies. You can see the whole list
   on the Settings page and at the bottom of SETUP.md.
2. **Your skills.** Used for the fit rating.
3. **Skills the job must have**, and **things you do not want** (optional).
4. **Words and companies to hide** (optional).
5. **Your cover letter.** Replace the `[bracketed]` parts with your own words.

---

## Use it

1. Open a job on LinkedIn.
2. Click the extension icon (or press **Alt+Shift+L**).
3. Check the company and job title. Fix them in the boxes if needed.
4. Click **Save job**.
   - The job is copied to your clipboard and added to the Tracker.
   - The spreadsheet is updated: `Downloads\job-tracker\jobs.csv`
   - The cover letter opens. Click **Save as PDF / Print**, and choose **Save as PDF** as the printer.

Other things:

| To do this | Do this |
|---|---|
| See all saved jobs | Click the icon → **Tracker** |
| Change a job's status or add notes | On the Tracker page |
| Remove the job you're looking at | Click the icon → **Remove**, or press **Alt+Shift+R** |
| See jobs that were hidden | Click the grey box at the bottom left of LinkedIn |
| Change keyboard shortcuts | Go to `chrome://extensions/shortcuts` |

---

## The spreadsheet (CSV)

- It's in your **Downloads** folder: `job-tracker\jobs.csv`. You can change the name in Settings.
- It's rewritten with all your saved jobs every time you save or remove one.
- **Close it in Excel before you save a new job.** If it's open, Chrome may make a second copy like `jobs (1).csv`.
- If Chrome asks where to save every time: open Chrome settings → **Downloads** → turn off
  **"Ask where to save each file before downloading"**.
- Columns: Date saved, Company, Job title, Link, Status, Fit, Salary, Industry, Notes.

---

## How the fit rating works

- **Weak:** a "skill the job must have" isn't mentioned, or it's a company type you said you don't want.
- **Mixed:** a "thing you do not want" is mentioned 3 or more times.
- **Strong:** 4 or more of your skills are mentioned.
- Otherwise **Mixed**.

You can change the numbers in Settings. Matching ignores upper/lower case and only matches whole words,
so `Java` does not match `JavaScript`.

---

## Updating to a new version

1. Download the new ZIP and unzip it.
2. Copy your `extension\SETUP.md` into the new `extension` folder, if you edited it.
3. Replace the old `extension` folder with the new one (same place).
4. Go to `chrome://extensions` and click the round arrow on LinkedIn Job Helper.

Your settings and saved jobs are kept. They're stored in Chrome, not in the folder.

> **Before you remove the extension**, export your jobs (Tracker → **Export CSV as…**) and your settings
> (Settings → **Export settings**). Removing the extension deletes them from Chrome.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| Company or job title is empty in the popup | LinkedIn changed its page. Type them in the boxes and save. |
| No fit box on a job | Scroll down a little or wait a second. LinkedIn loads the description in parts. |
| Fit box says "Add your skills…" | Add your skills in Settings (question 2). |
| My SETUP.md changes don't show | Go to `chrome://extensions` and click the round arrow on LinkedIn Job Helper. Then refresh LinkedIn. |
| `jobs (1).csv` appears | The file was open in Excel. Close it, delete the copy, and save a job again. |
| A job I want is hidden | Click the grey box at the bottom left to show hidden jobs. Hover over a job to see why it was hidden. Then edit your lists. |
| Alt+Shift+L or Alt+Shift+R does nothing | Set the shortcuts at `chrome://extensions/shortcuts`. |

---

## Good to know

- This is not made by or connected to LinkedIn.
- It only reads the LinkedIn pages you open yourself. It does not apply to jobs or click anything for you.
- LinkedIn changes its pages often, so some parts may stop working until they're updated.
- Should also work in Microsoft Edge (`edge://extensions`), but it's tested in Chrome.

## Files (for developers)

```
extension/
  manifest.json        Chrome extension manifest (Manifest V3)
  SETUP.md             Settings file users can edit in Notepad
  settings-store.js    Default settings, the government/defense list, helpers
  setup-md.js          Reads and writes SETUP.md
  filter.js            Hides job cards on LinkedIn, red warnings, the grey box
  fit.js               Fit box, company type, salary, badges on job cards
  shared.js            Reading a job from the page, saved jobs, CSV, filling templates
  popup.*              The window that opens from the toolbar icon
  options.*            Settings page
  tracker.*            Tracker page
  letter.*             Cover letter page
  background.js        First-time setup, SETUP.md checks, Alt+Shift+R
  page.css             Style for the Settings, Tracker and Cover letter pages
```

## License

MIT. See [LICENSE](LICENSE).
# linked_in_job_helper
# linked_in_job_helper
# linked_in_job_helper
