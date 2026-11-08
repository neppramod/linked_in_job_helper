# Job Helper Setup

> How to use this file:
> 1. Open it in Notepad (or any text editor).
> 2. To pick an answer, put an x in the box: [x]   To un-pick it, use a space: [ ]
> 3. To add to a list, write a new line that starts with "- "
> 4. Save the file.
>
> Lines that start with > are help. You can leave them as they are.
> Your changes are used the next time you open a LinkedIn page.
> If they are not, go to chrome://extensions and click the round arrow on LinkedIn Job Helper.

## 1. Government and defense jobs (pick one)

> Do you want to see jobs with the government, the military,
> or companies that need a security clearance?

- [ ] Yes, show them
- [ ] No, hide them

> "No, hide them" uses a ready-made list of words and companies.
> You can see that list at the bottom of this file.

## 2. Your skills

> Write one skill per line. Start each line with "- ".
> If a skill has other names, put them on the same line with | between them.
> Example:   - Excel | spreadsheets
> The extension looks for these words in each job and rates the job: Strong, Mixed or Weak.

- 

## 3. Skills the job must have

> If a job does not mention one of these, it is rated Weak.
> Leave this empty if you have none.

- 

## 4. Things you do not want

> Skills you do not have, or work you do not want to do.
> The extension warns you when a job mentions them.
> Example:   - Night shift

- 

## 5. Hide jobs with these words

> If the job title, company name or location has one of these words,
> the job is hidden from the list.
> Example:   - Unpaid

- 

## 6. Hide jobs from these companies

> Example:   - Example Staffing Inc

- 

## 7. Warn me when a job description has these words

> When you open a job that has one of these, you see a red warning.
> The job is also hidden from the list after that.
> Example:   - 100% travel

- 

## 8. Warn me about these industries

> LinkedIn shows each company's industry under "About the company".
> Example:   - Tobacco

- 

## 9. Other choices (tick all you want)

- [x] Hide jobs I already applied to
- [x] Rate a job Weak if it is a company type I do not want
- [x] Update my spreadsheet (CSV file) every time I save a job
- [x] Open the cover letter after I save a job

## 10. Hidden jobs (pick one)

- [x] Hide them completely
- [ ] Show them with a red border

## 11. Date in the cover letter (pick one)

- [x] November 7, 2026
- [ ] 11/07/2026
- [ ] 2026-11-07

## 12. Rating numbers

> You can leave these as they are.

- How many times a "thing you do not want" must appear to make the job Mixed: 3
- How many of your skills a job needs to be Strong: 4

## 13. Where to save the spreadsheet

> A folder and file name inside your Downloads folder.
> Close the file in Excel before you save a new job.
> If it is open, Chrome may make a second copy, like jobs (1).csv.

- job-tracker/jobs.csv

## 14. What to copy when you save a job

> The text between the two ``` lines is copied.
> These are replaced for each job:
> {{COMPANY}} = company name, {{ROLE}} = job title, {{LINK}} = job link, {{DATE}} = today

```
{{COMPANY}}
{{ROLE}}
{{LINK}}
```

## 15. Your cover letter

> Write your letter between the two ``` lines.
> Replace everything in [square brackets] with your own words.
> These are filled in for each job: {{COMPANY}} {{ROLE}} {{DATE}} {{LINK}}
> To make words bold, put ** on both sides: **like this**
> Leave an empty line between paragraphs.

```
[Your Name]
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
[Your Name]
```

## The ready-made list for "No, hide them"

> You do not need to change anything here. It is only so you can see what is hidden.
>
> Jobs are hidden if the title, company name or location has: government, federal, defense, defence, national security, clearance, cleared, TS/SCI, top secret, DoD, public sector
>
> You get a red warning if the job description has: security clearance, clearance required, active clearance, secret clearance, top secret, TS/SCI, polygraph, Department of Defense, DoD, national security, intelligence community, federal government, government agency, defense industry, U.S. citizenship is required, US citizenship required, must be a U.S. citizen
>
> You get a warning for these industries: Government, Defense, Military, Armed Forces, Public Safety, Public Policy, Law Enforcement, Legislative, Executive Offices, International Affairs, Political Organizations
