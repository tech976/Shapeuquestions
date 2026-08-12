# Connecting leads to Google Sheets

The landing page already posts every lead as JSON. All that's missing is the
Apps Script that receives it and the URL to point the page at.

## 1. Create the sheet and script

1. Go to [sheets.new](https://sheets.new) and name it e.g. `Shape U Leads`.
2. In that sheet: **Extensions → Apps Script**.
3. Delete the placeholder `myFunction` code, paste in all of [`Code.gs`](Code.gs),
   and save.

Don't create the script standalone from script.google.com — it must be created
**from inside the sheet** so it's bound to it. A tab named **Question LP** and
its header row are created automatically on the first lead — you don't need to
set them up by hand. To use a different tab name, change `SHEET_NAME` at the top
of `Code.gs`.

## 2. Deploy it as a web app

1. **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** **Anyone** ← must be "Anyone", not "Anyone with a Google account"
4. **Deploy**, then authorize when prompted. Google shows an "unverified app"
   warning — that's expected for your own script: **Advanced → Go to … (unsafe)**.
5. Copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfycb…/exec`

## 3. Point the page at it

In [`../index.html`](../index.html), find the `CONFIG` block and paste the URL:

```js
leadEndpoint: "https://script.google.com/macros/s/AKfycb…/exec",
```

While it's `""` the page runs in demo mode and logs the lead to the console
instead of sending it.

## 4. Test

Open the web app URL directly in a browser first — it should return
`{"ok":true,"service":"Shape U lead capture"}`. That confirms the deployment is
live and public.

Then fill in the form on the page and check that a row lands in the sheet.

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
  raw payload — check there if a lead is missing.
