/**
 * Shape U Clinic — lead capture endpoint.
 *
 * Receives the JSON payload posted by index.html (submitLead()) and appends
 * one row per lead to the bound Google Sheet.
 *
 * Setup instructions: see README.md in this folder.
 */

/* ── Settings ──────────────────────────────────────────────────────────── */

// Tab the leads are written to. Created automatically if missing.
const SHEET_NAME = 'Question LP';

// Timezone used for the timestamp column.
const TIMEZONE = 'Asia/Kolkata';

// Set to an address to get an email on every new lead. Leave '' for none.
const NOTIFY_EMAIL = '';

// Columns, in order. Header row is written automatically on first run.
const COLUMNS = [
  'Timestamp',
  'Name',
  'Phone',
  'Full Phone',
  'WhatsApp OK',
  'Goal',
  'Goal Price',
  'Intent',
  'Priority',
  'Clinic',
  'Callback Slot',
  'Source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'Submitted At (UTC)'
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

// Open the web app URL in a browser to confirm the deployment is live.
function doGet() {
  return json({ ok: true, service: 'Shape U lead capture' });
}

/* ── Core ──────────────────────────────────────────────────────────────── */

function appendLead(lead) {
  const sheet = getSheet();
  const utm = lead.utm || {};

  sheet.appendRow([
    Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    lead.name || '',
    // Leading apostrophe keeps Sheets from treating a leading + as a formula
    // and from stripping a leading 0 off the number.
    text(lead.phone),
    text(lead.fullPhone),
    lead.whatsapp ? 'Yes' : 'No',
    lead.goal || '',
    lead.goalPrice || '',
    lead.intent || '',
    lead.lead_priority || lead.tier || '',
    lead.clinic || '',
    lead.slot || '',
    lead.source || '',
    utm.utm_source || '',
    utm.utm_medium || '',
    utm.utm_campaign || '',
    utm.utm_term || '',
    utm.utm_content || '',
    utm.gclid || '',
    utm.fbclid || '',
    lead.submittedAt || ''
  ]);

  return sheet.getLastRow();
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

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
      `Sheet row ${row}: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`
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
