# Connecting leads to Google Sheets

The landing page already posts every lead as JSON. All that's missing is the
Apps Script that receives it and the URL to point the page at.

This LP writes into a **spreadsheet that already has a script** for a different
landing page, so it is set up as a **separate standalone script** with its own
deployment URL, writing to its own tab.

> **Do not paste this into the existing script project.** That project already
> has a `doPost`, and a script can only have one — the second silently overrides
> the first and you'd break the live LP. Follow the steps below instead; the
> existing script is never touched.

## 1. Get the spreadsheet id

Open the sheet you already use for leads. The id is the long string in the URL:

```
https://docs.google.com/spreadsheets/d/1a2B3cD4eF5gH6iJ7kL8mN9oP0qR/edit
                                       └────────── this part ──────────┘
```

## 2. Create the standalone script

1. Go to [script.new](https://script.new) — this makes a **standalone** project,
   not attached to any sheet. (Do *not* use Extensions → Apps Script this time.)
2. Name it something like `Question LP — lead capture`.
3. Delete the placeholder `myFunction`, paste in all of [`Code.gs`](Code.gs), save.
4. At the top, replace `PASTE_YOUR_SPREADSHEET_ID_HERE` with the id from step 1.

A tab named **Question LP** and its header row are created automatically on the
first lead — don't create it by hand. To change the tab name, edit `SHEET_NAME`.

## 3. Deploy it as a web app

1. **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** **Anyone** ← must be "Anyone", not "Anyone with a Google account"
4. **Deploy**, then authorize when prompted. Google shows an "unverified app"
   warning — that's expected for your own script: **Advanced → Go to … (unsafe)**.
   Because this script is standalone, it asks for permission to access *your
   spreadsheets* rather than just one sheet. That's expected too.
5. Copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfycb…/exec`

This URL is separate from the other LP's URL. Keep them straight — pointing this
page at the other script would file these leads into the wrong tab.

## 4. Point the page at it

In [`../index.html`](../index.html), find the `CONFIG` block and paste the URL:

```js
leadEndpoint: "https://script.google.com/macros/s/AKfycb…/exec",
```

While it's `""` the page runs in demo mode and logs the lead to the console
instead of sending it.

## 5. Test

Open the web app URL directly in a browser first. It should return the name of
your spreadsheet:

```json
{"ok":true,"spreadsheet":"Shape U Leads","tab":"Question LP"}
```

That single check confirms three things at once: the deployment is live, it's
publicly reachable, and the spreadsheet id is correct. If you instead see
`{"ok":false,"error":"..."}`, the id is wrong or the script lacks access — fix
that before sending real traffic.

Then fill in the form on the page and check that a row lands in the new tab.

## Redeploying after an edit

Editing `Code.gs` does **not** update the live URL on its own. After any change:
**Deploy → Manage deployments → pencil icon → Version: New version → Deploy**.
This keeps the same URL. Creating a *new deployment* instead gives you a new URL
and you'd have to update `index.html` again.

## Optional: email on every lead

In `Code.gs`, set:

```js
const NOTIFY_EMAIL = 'you@example.com';
```

Then redeploy. Gmail allows roughly 100 such emails per day on a free account,
1,500 on Workspace.

## Notes

- **Submissions never block the lead.** The page calls `.catch(done)`, so if the
  script is down the user still reaches the confirmation screen — but that lead
  is lost. Watch the sheet for gaps after any redeploy.
- **Phone numbers are stored as text** (with a hidden leading apostrophe) so
  Sheets doesn't mangle `+91…` into a formula or strip leading zeros. They stay
  copy-pasteable as normal.
- **Only the page's own questions get columns.** UTM / `gclid` / `fbclid` ad
  attribution is deliberately *not* written to the sheet. The page still sends
  it, so if you later want to know which campaign produced a lead, add the
  columns back to `COLUMNS` and the matching `utm.utm_source || ''` lines to
  `appendLead` — no landing page change needed.
- **Failed submissions** are logged in Apps Script under **Executions**, with the
  raw payload — check there if a lead is missing. Note that this project's
  Executions list is separate from the other LP script's.
- **The two scripts are fully independent.** Each has its own code, its own
  deployment URL, and its own tab. Editing or redeploying this one cannot affect
  the other LP, and vice versa. They only meet inside the spreadsheet.
- **Don't reorder or rename the tabs' columns by hand.** New rows are appended
  positionally, so an inserted column would shift every later value. Add helper
  columns to the *right* of `Callback Slot` instead — those are left alone.
