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
  'Intent',
  'Priority',
  'Clinic',
  'Callback Slot'
];

/* ── Entry points ──────────────────────────────────────────────────────── */

function doPost(e) {
  // One writer at a time, so two submissions never claim the same row.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lead = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const row = appendLead(lead);
    if (NOTIFY_EMAIL) notify(lead, row);
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
    lead.intent || '',
    lead.lead_priority || lead.tier || '',
    lead.clinic || '',
    lead.slot || ''
  ]);

  return sheet.getLastRow();
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
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

function text(value) {
  return value ? "'" + value : '';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
