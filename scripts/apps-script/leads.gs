/**
 * Starlight Hangars website leads: a Google Apps Script web app.
 *
 * The "Schedule a Demo" modal and the ROI report form (assets/site.js)
 * POST URL-encoded fields here. Each lead becomes a row in the "Leads"
 * sheet, and an email alert goes to NOTIFY_EMAIL. The script answers with
 * JSON ({ ok: true } or { ok: false, error }) so the site can show a real
 * success or error message.
 *
 * Setup (once):
 *   1. Create a Google Sheet (e.g. "Starlight Hangars website leads").
 *   2. In the Sheet: Extensions → Apps Script. Replace Code.gs with this file and save.
 *   3. Optional: set NOTIFY_EMAIL below (blank = the Google account that deploys it).
 *   4. Select `setup` in the function menu and click Run. Approve the permissions
 *      (Sheets + send email as you). It adds the header row and sends a test email.
 *   5. Deploy → New deployment → type "Web app".
 *      Execute as: Me. Who has access: Anyone. Click Deploy.
 *   6. Copy the Web app URL (ends in /exec) into STTUGS_LEAD_CONFIG.endpoint
 *      in assets/site.js.
 *
 * After editing this script, publish the change with Deploy → Manage deployments →
 * (pencil) → Version: New version → Deploy. The /exec URL stays the same.
 */

const SHEET_NAME = 'Leads';
const NOTIFY_EMAIL = '';
const MIN_FILL_MS = 3000;   // matches STTUGS_LEAD_CONFIG.minFillMs in assets/site.js
const MAX_FIELD_LENGTH = 2000;

// [request parameter, column header]
const FIELDS = [
  ['type', 'Type'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['company', 'Company / FBO'],
  ['airport', 'Airport'],
  ['role', 'Role'],
  ['phone', 'Phone'],
  ['hangar', 'Hangar size / aircraft'],
  ['message', 'Message'],
  ['plan', 'Interest'],
  ['page', 'Page'],
];

function doPost(e) {
  const params = (e && e.parameter) || {};

  // Honeypot: people never see this field. Tell bots it worked and keep nothing.
  if (params.website) return json_({ ok: true });
  if (Number(params.elapsed) < MIN_FILL_MS) return json_({ ok: false, error: 'too_fast' });

  const lead = {};
  FIELDS.forEach(([key]) => { lead[key] = clean_(params[key]); });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return json_({ ok: false, error: 'invalid_email' });
  }
  if (!lead.type) lead.type = 'Website lead';

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    getSheet_().appendRow([new Date()].concat(FIELDS.map(([key]) => sheetSafe_(lead[key]))));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'storage_failed' });
  } finally {
    lock.releaseLock();
  }

  // The lead is already saved, so an email problem must not fail the visitor.
  try {
    notify_(lead);
  } catch (err) {
    console.error(err);
  }
  return json_({ ok: true });
}

// Lets you open the /exec URL in a browser to confirm the deployment is live.
function doGet() {
  return json_({ ok: true, service: 'starlight-hangars-leads' });
}

// Run once from the editor: creates the sheet/header row and authorizes email.
function setup() {
  getSheet_();
  MailApp.sendEmail(recipient_(), 'Starlight Hangars lead form connected',
    'Website leads will be added to this spreadsheet:\n' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Received'].concat(FIELDS.map(([, header]) => header)));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, FIELDS.length + 1).setFontWeight('bold');
  }
  return sheet;
}

function notify_(lead) {
  const who = lead.name || lead.email;
  const subject = `${lead.type}: ${who}${lead.company ? ` (${lead.company})` : ''}`;
  const body = FIELDS
    .filter(([key]) => lead[key])
    .map(([key, header]) => `${header}: ${lead[key]}`)
    .join('\n') +
    `\n\nAll leads: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`;
  MailApp.sendEmail({ to: recipient_(), replyTo: lead.email, subject, body });
}

function recipient_() {
  return NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
}

function clean_(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_FIELD_LENGTH);
}

// Stop values such as "=HYPERLINK(...)" from running as spreadsheet formulas.
function sheetSafe_(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
