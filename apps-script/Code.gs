/**
 * Shape U Clinic — lead capture endpoint.
 *
 * Receives the JSON payload posted by index.html (submitLead()) and appends
 * one row per lead to its own tab in an existing Google Sheet.
 *
 * This runs as a STANDALONE script with its own deployment URL, so it does not
 * touch — or conflict with — the script already serving the other landing page.
 * Two bound scripts cannot share one spreadsheet, and two doPost functions
 * cannot share one script project; opening by ID sidesteps both limits.
 *
 * Setup instructions: see README.md in this folder.
 */

/* ── Settings ──────────────────────────────────────────────────────────── */

// The spreadsheet to write into — the long id in its URL:
// https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
const SPREADSHEET_ID = '1VwgJmRAQ6N4v4g-WKZtOJVp62_iisCgX7FKHMOzVjRQ';

// Tab this LP's leads go to. Created automatically if missing, and kept
// separate from the tab the other landing page writes to.
const SHEET_NAME = 'Question LP';

// Timezone used for the timestamp column.
const TIMEZONE = 'Asia/Kolkata';

// Set to an address to get an email on every new lead. Leave '' for none.
const NOTIFY_EMAIL = '';

// Columns, in order. Header row is written automatically on first run.
// One column per question the landing page actually asks — nothing else.
const COLUMNS = [
  'Timestamp',
  'Name',
  'Phone',
  'WhatsApp OK',
  'Goal',
  'Goal Price',
  'Age',
  'Weight (kg)',
  'Height (cm)',
  'BMI',
  'BMI Category',
  'Gender',
  'Intent',
  'Priority',
  'Clinic',
  'Callback Slot',
  // Q, R, S - what the lead did on the confirmation screen, after the row
  // above was already written. 'No' on arrival, flipped to 'Yes' by an
  // update from the page. Anything added by hand to the RIGHT of these
  // (Lead Feedback and friends) is never touched.
  'Save Contact',
  'Scratch Card',
  'WhatsApp Confirm'
];

// Maps the `field` the page sends to the column that records it. Going via
// the header name rather than a hard-coded 17/18/19 keeps COLUMNS the single
// source of truth for where each one lives.
const ACTION_COLUMNS = {
  saveContact: 'Save Contact',
  scratch:     'Scratch Card',
  whatsapp:    'WhatsApp Confirm'
};


/* ── Entry points ──────────────────────────────────────────────────────── */

function doPost(e) {
  // One writer at a time, so two submissions never claim the same row.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // The confirmation screen reports back what the lead did there. Same
    // endpoint, because a second web app would be a second URL to keep in
    // sync for no gain.
    if (body.type === 'update') {
      const marked = markAction(body.phone, body.field);
      return json({ ok: marked > 0, row: marked || null });
    }

    const row = appendLead(body);
    if (NOTIFY_EMAIL) notify(body, row);
    return json({ ok: true, row: row });

  } catch (err) {
    // Log the failure so a bad payload is recoverable instead of silently lost.
    console.error(err, e && e.postData && e.postData.contents);
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Open the web app URL in a browser to confirm the deployment is live AND that
// it can actually reach the spreadsheet — catches a wrong id before any real
// lead is lost to it.
function doGet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return json({ ok: true, spreadsheet: ss.getName(), tab: SHEET_NAME });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ── Core ──────────────────────────────────────────────────────────────── */

function appendLead(lead) {
  const sheet = getSheet();

  sheet.appendRow([
    Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    lead.name || '',
    // Leading apostrophe keeps Sheets from treating a leading + as a formula
    // and from stripping a leading 0 off the number.
    text(lead.fullPhone || lead.phone),
    lead.whatsapp ? 'Yes' : 'No',
    lead.goal || '',
    lead.goalPrice || '',
    lead.age || '',
    lead.weight || '',
    lead.height || '',
    lead.bmi || '',
    lead.bmiCategory || '',
    lead.gender || '',
    lead.intent || '',
    lead.lead_priority || lead.tier || '',
    lead.clinic || '',
    lead.slot || '',
    'No',
    'No',
    'No'
  ]);


  return sheet.getLastRow();
}

/**
 * Flip one action column to Yes on the lead's row.
 *
 * Matched on the last 10 digits of the phone number, not on a row number:
 * the page never reads our reply (a cross-origin read of the redirect Apps
 * Script issues is not dependable), so it has no way to learn which row it
 * landed in. Scanning from the bottom means a repeat booker's newest row
 * wins - that is the one they are looking at.
 *
 * Returns the row it stamped, or 0 if nothing matched.
 */
function markAction(phone, field) {
  const header = ACTION_COLUMNS[field];
  if (!header) return 0;

  const wanted = lastTen(phone);
  if (!wanted) return 0;

  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return 0;

  const phones = sheet.getRange(2, COLUMNS.indexOf('Phone') + 1, last - 1, 1).getValues();
  for (let i = phones.length - 1; i >= 0; i--) {
    if (lastTen(phones[i][0]) === wanted) {
      sheet.getRange(i + 2, COLUMNS.indexOf(header) + 1).setValue('Yes');
      return i + 2;
    }
  }
  return 0;
}

/**
 * One-off, run by hand from the editor if you would rather see No than a
 * blank on the rows that predate these columns. Nothing calls it.
 */
function backfillActionDefaults() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return;

  Object.keys(ACTION_COLUMNS).forEach(function (field) {
    const range = sheet.getRange(2, COLUMNS.indexOf(ACTION_COLUMNS[field]) + 1, last - 1, 1);
    range.setValues(range.getValues().map(function (r) { return [r[0] || 'No']; }));
  });
}

function getSheet() {

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getMaxColumns() < COLUMNS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), COLUMNS.length - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  // A column added after the sheet went live gets no header from the branch
  // above. Fill in the blanks only, so a header someone renamed by hand
  // keeps the name they gave it.
  const head = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  let patched = false;
  for (let i = 0; i < COLUMNS.length; i++) {
    if (!head[i]) { head[i] = COLUMNS[i]; patched = true; }
  }
  if (patched) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([head]).setFontWeight('bold');
  }

  return sheet;

}

function notify(lead, row) {
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: `New lead: ${lead.name || 'Unknown'} (${lead.lead_priority || 'warm'})`,
    body: [
      `Name:    ${lead.name || '—'}`,
      `Phone:   ${lead.fullPhone || lead.phone || '—'}`,
      `Goal:    ${lead.goal || '—'}`,
      `Intent:  ${lead.intent || '—'}`,
      `Clinic:  ${lead.clinic || '—'}`,
      `Callback: ${lead.slot || '—'}`,
      ``,
      `Sheet row ${row}: ${SpreadsheetApp.openById(SPREADSHEET_ID).getUrl()}`
    ].join('\n')
  });
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

// Last 10 digits, so '+919876543210', '919876543210' and '9876543210' all
// compare equal - and the apostrophe the phone is stored behind drops out
// along with every other non-digit.
function lastTen(value) {
  const d = String(value == null ? '' : value).replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

function text(value) {

  return value ? "'" + value : '';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
