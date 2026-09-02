/**
 * KU-KIT PO Request — Google Apps Script backend (Option A)
 *
 * Paste this whole file into Extensions > Apps Script of the Google Sheet
 * that has the "Orders", "Sales Reps", and "Config" tabs (see the CSV
 * templates / Setup Instructions sent alongside this file).
 *
 * After pasting, deploy via Deploy > New deployment > Web app:
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Then send the resulting Web app URL back so the KU-KIT PO form can be
 * pointed at it.
 *
 * TEST MODE: set the "Test Mode" row in the Config tab to ON to safely test
 * submissions — orders still get logged to the Orders tab (Status shows
 * "TEST (no email sent)") but no email is sent to any sales rep or
 * customer, no matter what data is submitted. Set it back to OFF to go
 * live. No redeploy needed — it's read fresh from the sheet every time.
 *
 * There are TWO separate dropdown columns in Orders — kept apart on purpose
 * so confirming an order and requesting its PI never overwrite each other:
 *
 *   - "Status"   — the order's own review state: New / Confirmed /
 *                  Needs Revision / Closed.
 *   - "PI Stage" — separate, independent tracker for the PI paperwork:
 *                  (blank) / Requested / Generated / Sent to Customer.
 *
 * SETUP (once, after pasting/saving this file): run setupDropdowns()
 * (select it in the function dropdown next to the Run button, then click
 * Run) — this adds both dropdowns to the Orders sheet.
 *
 * ONE-TIME MIGRATION if you're updating an existing sheet from an earlier
 * version of this script: add these header cells as the LAST columns of
 * row 1 in the Orders tab, in this exact order (this script always appends
 * new fields at the end so existing rows/columns are never disturbed):
 *   Revision Notes | Edit Token | PI Number | PI Approval Token | PI Sent To Customer At | Bank Account | PI Review Token
 * (If you already added some of these from an earlier update, just add
 * whichever ones are missing, in order, after the last one you have.)
 * That's the only sheet change needed; everything else keeps working as
 * before — including a brand-new "Bank Accounts" tab, which this script
 * creates and pre-fills for you the first time setupDropdowns() runs (see
 * below).
 *
 * MULTIPLE BANK ACCOUNTS: the "Bank Accounts" tab (Label, Bank Name,
 * Account No., SWIFT Code, A/C Name) holds every bank the company can get
 * paid into. Each Orders row's "Bank Account" dropdown picks which one
 * that order's PI prints — reviewable/overridable per order before the PI
 * is generated. Add, remove, or edit rows in that tab any time; every
 * dropdown reads it live, no code change or re-run needed. Leave a row's
 * "Bank Account" blank to fall back to the Config "Default Bank Account"
 * label (pre-filled onto every new order automatically), or leave that
 * blank too to fall back further to the old single-account Config rows
 * (Bank Name / Bank Account No. / Bank SWIFT Code / Bank Account Name) —
 * kept around as a last-resort default so nothing breaks if the Bank
 * Accounts tab is ever emptied out.
 *
 * CONFIRMING AN ORDER: whoever reviews an order opens the sheet and changes
 * that row's "Status" to "Confirmed" — the "Confirmed By" and
 * "Confirmed At" columns fill in automatically, and the customer is
 * automatically emailed that their order has been confirmed.
 *
 * SENDING AN ORDER BACK FOR CORRECTION: if something in the customer's
 * order is wrong, first fix or note the issue, then change that row's
 * "Status" to "Needs Revision" — the customer is automatically emailed
 * that their order needs a correction, WITH A LINK straight back to their
 * own PO on the KU-KIT website, pre-filled with everything they already
 * entered, so they only have to fix what's wrong instead of retyping the
 * whole form. Submitting that form again updates this SAME row (same PO
 * number) instead of creating an unrelated new one — Status resets to
 * "New" so it comes back into your review queue. Fill in the "Revision
 * Notes" column BEFORE changing the Status, if you want the customer's
 * email to explain what's wrong / what needs to change; leave it blank for
 * a generic "please review and correct" message. You can also just edit
 * any field directly in the row yourself (company name, items, quantities,
 * etc.) to fix a simple typo instead of sending it back — every field the
 * PI later pulls from is a normal cell in that row.
 *
 * "Closed" doesn't send any email — use it purely for your own tracking
 * once an order is fully wrapped up.
 *
 * CUSTOMERS CAN CHECK THEIR OWN STATUS: the KU-KIT website has a "check my
 * order" box (PO number + the email they used) that calls this script
 * read-only and shows the current Status — no login, no token needed for
 * that (it only reveals status, nothing editable, and requires knowing
 * both the PO number and the email on file).
 *
 * GENERATING A PI: happens automatically the moment you set Status to
 * "Confirmed" on a row that asked for a PI — no separate step needed. (To
 * manually (re)trigger it instead — e.g. to redraft after a correction —
 * change that row's "PI Stage", a different column, to "Requested".) Either
 * way this drafts a Proforma Invoice PDF from the row's data and saves it
 * to a Drive folder called "KU-KIT PI Documents". Requires these
 * Config rows to be filled in: Bank Name, Bank Account No., Bank SWIFT
 * Code, Bank Account Name (or use the "Bank Accounts" tab + this row's
 * "Bank Account" column instead — see below), PI Issuer Email (plus the
 * existing Current PI Signer Name/Title). The first time this runs, Google
 * will ask you to re-authorize (it now also needs Drive access to save the
 * PDF) — approve it the same way as the first deployment.
 *
 * TWO-STAGE APPROVAL (review, then sign) — PI Stage tracks both:
 *   1. "Generated": the draft is emailed to whoever is this order's
 *      "Assigned Sales Rep" (falls back to Config "Default Sales Rep
 *      Email" if that cell is blank/unmatched), with an "Approve & forward
 *      for signature" link. This step only forwards the draft on — it
 *      never reaches the customer, and there's no reject button: if
 *      something's wrong, fix it directly in the row and set PI Stage back
 *      to "Requested" to regenerate.
 *   2. "Reviewed": clicking that link emails the PI Issuer (the person
 *      with signing authority) the SAME draft with the real "Approve &
 *      send to customer" link.
 *   3. "Sent to Customer": the PI Issuer clicks that — ONE CLICK — and the
 *      script regenerates the same PI with the company's signature image
 *      stamped into the signature block (from "Signature Image File ID" in
 *      Config — see below; skipped gracefully if that Config row is
 *      blank) and emails the final PDF directly to the customer, no
 *      further action needed from anyone. This is a visual signature stamp
 *      automatically applied on a one-click email approval — NOT a
 *      legally-verifiable cryptographic e-signature with an audit trail
 *      (that would mean integrating a real e-signature service like
 *      DocuSign or Google Workspace's eSignature, which needs actual API
 *      credentials from your IT/Workspace admin — this lightweight version
 *      needs none of that and works with what's already deployed). Good
 *      enough to move paperwork immediately; upgrade later if a
 *      legally-binding signature becomes a requirement.
 *   To set up the signature image: upload a PNG of the signature to
 *   Google Drive, right-click it > Share > "Anyone with the link" (Viewer
 *   is enough), then copy the file ID out of the share link — the long
 *   string between "/d/" and "/view" — and paste just that ID into the
 *   "Signature Image File ID" row in Config.
 *
 * REVIEW-BEFORE-GENERATE GATE: PI Stage refuses to become "Requested" (it
 * resets to blank with an on-screen alert) unless that row's Status is
 * already "Confirmed" — and since Confirmed now auto-drafts the PI anyway,
 * this gate mainly matters for the manual regenerate path. Either way,
 * this is the review checkpoint — whoever needs to check the order
 * (management/sales) does so by editing the Orders row itself BEFORE
 * confirming: every field the PI pulls from (company, address, items,
 * Incoterm, payment terms, bank detail, signer, etc.) is just a normal
 * cell in that row, so correct anything there first, then set Status to
 * Confirmed — that alone starts the PI draft + sales-rep review email.
 *
 * NO MATCHING SALES REP: if the buyer's country doesn't match any row in
 * the "Sales Reps" tab, the order still gets logged and the customer still
 * gets their "we received it" email, but nobody used to get notified to
 * actually review it. This version adds a fallback: if "Default Sales Rep
 * Email" is filled in on the Config tab, that inbox gets the review email
 * instead (the "Assigned Sales Rep" cell is left showing "(unassigned —
 * sent to default inbox)" so it's obvious at a glance this wasn't routed
 * to a specific person). Leave that Config row blank to keep the old
 * silent behavior for unmatched countries.
 *
 * "Site Base URL" (Config, optional): the live KU-KIT site address used to
 * build the "edit your PO" link emailed on a revision request. Defaults to
 * the current GitHub Pages URL if left blank — only fill this in if the
 * site ever moves.
 *
 * "Link Secret" (Config): a random string used to generate the edit/
 * approval link tokens so they can't be guessed. If you leave this row
 * blank, the script creates one for you automatically the first time it's
 * needed and writes it back into Config — you never have to set this by
 * hand, just don't delete or edit it once it exists (changing it
 * invalidates every link already emailed out).
 *
 * DEALER LOGIN (email + password, set by you — no self-service reset): the
 * "Dealers" tab — Company | Country | Dealer Contact Name | Dealer Email |
 * Approved | Password — is the allow-list for the website's sign-in box. A
 * dealer types their email and the password you set for them in that
 * "Password" column; if both match a row with "Approved" set to exactly
 * "Y", they're signed in immediately (no email round-trip) and the site
 * remembers them (prefilling the order form's company/country/contact
 * fields) until they sign out. Set "Approved" to anything else (or delete
 * the row) to revoke access — takes effect immediately, no redeploy.
 *   Security note: "Password" is stored and compared as plain text —
 *   anyone with edit access to this spreadsheet can read every dealer's
 *   password. This is a deliberately lightweight gate (consistent with
 *   every other link/token in this system) meant to keep random visitors
 *   from spamming the order form, NOT a hardened login — tell dealers to
 *   use a password made up for this, never one they reuse elsewhere.
 * The dealer-login request is sent as a POST (not a GET query string) from
 * the site specifically so the password never ends up in a URL or access
 * log.
 *
 * None of onEdit/setupDropdowns/PI generation need a Web App redeploy to
 * take effect — only doGet/doPost do. Just saving the script is enough.
 */

const SHEET_ORDERS = 'Orders';
const SHEET_SALES_REPS = 'Sales Reps';
const SHEET_CONFIG = 'Config';
const SHEET_BANK_ACCOUNTS = 'Bank Accounts';
const BANK_ACCOUNTS_HEADERS = ['Label', 'Bank Name', 'Account No.', 'SWIFT Code', 'A/C Name'];
// "Dealers" tab columns: Company | Country | Dealer Contact Name | Dealer
// Email | Approved. Powers the website's magic-link dealer login — see
// findDealer()/handleRequestLogin()/handleDealerProfile() below. A dealer
// row with "Approved" not exactly "Y" is treated as not found (lets a
// company be suspended without deleting its row/history).
const SHEET_DEALERS = 'Dealers';

const ORDERS_HEADERS = [
  'Timestamp', 'PO Number', 'Company', 'Address', 'Country', 'Contact',
  'Email', 'Phone', 'Customer PO Ref', 'Items', 'Subtotal (USD)',
  'Incoterm', 'Port', 'Payment Terms', 'Shipping Method',
  'Requested Delivery Date', 'PI Requested', 'Notes', 'Status',
  'Assigned Sales Rep', 'Confirmed By', 'Confirmed At', 'PI Stage',
  'Revision Notes', 'Edit Token', 'PI Number', 'PI Approval Token',
  'PI Sent To Customer At', 'Bank Account', 'PI Review Token'
];

// Fields a customer resubmission (via their edit link) is allowed to
// overwrite — deliberately excludes Timestamp/PO Number/Status/Assigned
// Sales Rep/Confirmed By/Confirmed At/PI Stage/tokens/PI fields, which are
// either identity/history that must never move, or internal workflow state
// this script itself owns.
const EDITABLE_FIELDS_ON_RESUBMIT = [
  'Company', 'Address', 'Country', 'Contact', 'Email', 'Phone',
  'Customer PO Ref', 'Items', 'Subtotal (USD)', 'Incoterm', 'Port',
  'Payment Terms', 'Shipping Method', 'Requested Delivery Date',
  'PI Requested', 'Notes'
];

const STATUS_OPTIONS = ['New', 'Confirmed', 'Needs Revision', 'Closed'];
const PI_STAGE_OPTIONS = ['', 'Requested', 'Generated', 'Reviewed', 'Sent to Customer'];

const DEFAULT_SITE_BASE_URL = 'https://giftfygift.github.io/ku-kit/';

// ScriptApp.getService().getUrl() is only reliable when the current
// execution is itself an incoming web-app request (doGet/doPost). Called
// from anywhere else — an onEdit trigger being the case that bit us — it
// falls back to the "test deployment" (/dev) URL instead of the real
// deployed (/exec) one. A /dev link only works for whoever is logged in as
// the script's own editor, so a PI review/approval email built from inside
// onEdit would silently hand the reviewer or signer a broken link. Every
// link this script emails out is built from this constant instead — never
// from getUrl() directly. If you ever create a genuinely NEW deployment
// (not just "New version" on the existing one — that keeps the same URL),
// update the "Web App URL" row in Config to the new /exec URL; this
// constant is just the fallback when that Config row is blank.
const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbydrktlXuRtS5Ja1BmEb0j47XV7xDLxck_nCANFRVLPdOwPkWIPw1y0Lw6fh4G_5RSvUw/exec';
function webAppUrl() {
  const configured = getConfig('Web App URL', '');
  return (configured || DEFAULT_WEB_APP_URL).replace(/\/+$/, '');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'No POST body received.' });
    }
    const data = JSON.parse(e.postData.contents);

    // Dealer sign-in travels as POST body, never a GET query string, since
    // it carries a password — routed here, ahead of everything else below,
    // since it doesn't touch the Orders sheet at all.
    if (data.action === 'dealerLogin') return handleDealerLogin(data);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName(SHEET_ORDERS);
    if (!ordersSheet) {
      return jsonResponse({ ok: false, error: 'Orders sheet tab not found — check the tab name is exactly "Orders".' });
    }

    // Resubmission of a PO the customer was asked to correct — update the
    // SAME row in place instead of appending a new, unrelated one.
    if (data.editPoNumber && data.editToken) {
      const existingRow = findRowByPoAndToken(ordersSheet, data.editPoNumber, data.editToken, 'Edit Token');
      if (existingRow) {
        return jsonResponse(applyResubmission(ordersSheet, existingRow, data));
      }
      // Token didn't match (stale/edited link, or the row's token somehow
      // changed) — fall through and treat it as a brand-new submission
      // rather than silently failing the customer's resubmit.
    }

    const buyer = data.buyer || {};
    const itemsText = (data.items || [])
      .map(function (i) { return i.name + ' x' + i.qty + ' ($' + i.price + ')'; })
      .join('; ');
    const subtotal = (data.items || [])
      .reduce(function (sum, i) { return sum + (i.price || 0) * (i.qty || 0); }, 0);
    const editToken = generateToken(data.poNumber || (Date.now() + ''));

    const row = [
      new Date(),
      data.poNumber || '',
      buyer.company || '',
      buyer.address || '',
      buyer.country || '',
      buyer.contact || '',
      buyer.email || '',
      buyer.phone || '',
      buyer.customerRef || '',
      itemsText,
      subtotal,
      data.incotermLabel || '',
      data.port || '',
      data.paymentTermLabel || '',
      data.shippingLabel || '',
      data.deliveryDate || '',
      data.piWanted ? 'Yes' : 'No',
      data.notes || '',
      'New',
      '', // Assigned Sales Rep — filled in below if a match (or fallback) is found
      '', // Confirmed By
      '', // Confirmed At
      '', // PI Stage — blank until someone requests a PI
      '', // Revision Notes — filled in by sales before sending a "Needs Revision" email
      editToken,
      '', // PI Number — filled in once a PI is drafted
      '', // PI Approval Token — filled in once a PI is drafted
      '', // PI Sent To Customer At
      getConfig('Default Bank Account', ''), // Bank Account — which row of the
      // Bank Accounts tab to print on this order's PI; pre-filled from
      // Config so most orders need no action, but reviewable/overridable
      // per order before the PI is generated (e.g. a deal that should be
      // paid into a different account than the usual default).
      '' // PI Review Token — filled in once a PI is drafted
    ];

    const testMode = isTestMode();
    if (testMode) {
      row[ORDERS_HEADERS.indexOf('Status')] = 'TEST (no email sent)';
    }

    ordersSheet.appendRow(row);
    const newRow = ordersSheet.getLastRow();

    // Set both dropdowns on this specific new row directly, rather than
    // relying only on the one-time range-wide setup — guarantees every new
    // order gets working dropdowns even if setupDropdowns() was never run.
    ordersSheet.getRange(newRow, ORDERS_HEADERS.indexOf('Status') + 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(false).build()
    );
    ordersSheet.getRange(newRow, ORDERS_HEADERS.indexOf('PI Stage') + 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(PI_STAGE_OPTIONS, true).setAllowInvalid(false).build()
    );
    applyBankAccountValidation(ordersSheet, newRow, 1);

    // Deep-link straight to this row instead of just the spreadsheet's front
    // page, so the "review this order" email drops the rep right where the
    // data is instead of making them scroll/search for it.
    const rowLink = ss.getUrl() + '#gid=' + ordersSheet.getSheetId() + '&range=A' + newRow;

    let rep = findSalesRep(buyer.country || '', buyer.company || '');
    let unassignedFallback = false;
    if (!rep) {
      const fallbackEmail = getConfig('Default Sales Rep Email', '');
      if (fallbackEmail) {
        rep = { name: 'Sales Team', email: fallbackEmail };
        unassignedFallback = true;
      }
    }
    if (rep) {
      ordersSheet.getRange(newRow, ORDERS_HEADERS.indexOf('Assigned Sales Rep') + 1)
        .setValue(unassignedFallback ? '(unassigned — sent to default inbox)' : rep.name + ' <' + rep.email + '>');
      if (!testMode) notifySalesRep(rep, data, buyer, newRow, rowLink);
    }
    if (!testMode) notifyCustomer(data, buyer);

    return jsonResponse({ ok: true, row: newRow, repNotified: !testMode && !!rep, testMode: testMode });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Overwrites the customer-editable fields of an existing row with a
 * resubmission, resets it back into the review queue, and notifies both
 * the customer (received the update) and the assigned rep (needs another
 * look) — mirroring what a fresh submission does, minus creating a new PO
 * number or a new Edit Token (the same edit link keeps working for
 * however many rounds of correction it takes).
 */
function applyResubmission(sheet, row, data) {
  const buyer = data.buyer || {};
  const itemsText = (data.items || [])
    .map(function (i) { return i.name + ' x' + i.qty + ' ($' + i.price + ')'; })
    .join('; ');
  const subtotal = (data.items || [])
    .reduce(function (sum, i) { return sum + (i.price || 0) * (i.qty || 0); }, 0);

  const values = {
    'Company': buyer.company || '',
    'Address': buyer.address || '',
    'Country': buyer.country || '',
    'Contact': buyer.contact || '',
    'Email': buyer.email || '',
    'Phone': buyer.phone || '',
    'Customer PO Ref': buyer.customerRef || '',
    'Items': itemsText,
    'Subtotal (USD)': subtotal,
    'Incoterm': data.incotermLabel || '',
    'Port': data.port || '',
    'Payment Terms': data.paymentTermLabel || '',
    'Shipping Method': data.shippingLabel || '',
    'Requested Delivery Date': data.deliveryDate || '',
    'PI Requested': data.piWanted ? 'Yes' : 'No',
    'Notes': data.notes || ''
  };
  EDITABLE_FIELDS_ON_RESUBMIT.forEach(function (field) {
    sheet.getRange(row, ORDERS_HEADERS.indexOf(field) + 1).setValue(values[field]);
  });

  const testMode = isTestMode();
  sheet.getRange(row, ORDERS_HEADERS.indexOf('Status') + 1).setValue(testMode ? 'TEST (no email sent)' : 'New');
  sheet.getRange(row, ORDERS_HEADERS.indexOf('Confirmed By') + 1).setValue('');
  sheet.getRange(row, ORDERS_HEADERS.indexOf('Confirmed At') + 1).setValue('');
  sheet.getRange(row, ORDERS_HEADERS.indexOf('Revision Notes') + 1).setValue('');
  sheet.getRange(row, ORDERS_HEADERS.indexOf('Timestamp') + 1).setValue(new Date());

  const poNumber = sheet.getRange(row, ORDERS_HEADERS.indexOf('PO Number') + 1).getValue();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rowLink = ss.getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + row;

  // Re-resolve the rep rather than trusting the old "Assigned Sales Rep"
  // cell as-is — the buyer's country may have changed as part of the
  // correction, and re-deriving here also self-heals the case where the
  // original submission fell back to the default inbox (that cell has no
  // parseable "<email>" to reuse).
  let rep = findSalesRep(buyer.country || '', buyer.company || '');
  let unassignedFallback = false;
  if (!rep) {
    const fallbackEmail = getConfig('Default Sales Rep Email', '');
    if (fallbackEmail) {
      rep = { name: 'Sales Team', email: fallbackEmail };
      unassignedFallback = true;
    }
  }
  if (rep) {
    sheet.getRange(row, ORDERS_HEADERS.indexOf('Assigned Sales Rep') + 1)
      .setValue(unassignedFallback ? '(unassigned — sent to default inbox)' : rep.name + ' <' + rep.email + '>');
  }
  if (!testMode) {
    if (rep) notifySalesRep(rep, { poNumber: poNumber, piWanted: data.piWanted }, buyer, row, rowLink);
    notifyCustomer({ poNumber: poNumber }, buyer);
  }

  return { ok: true, row: row, updated: true, poNumber: poNumber, testMode: testMode };
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || '';

  if (action === 'order') return handleGetOrderForEdit(params);
  if (action === 'status') return handleGetOrderStatus(params);
  if (action === 'reviewPi') return handleReviewPi(params);
  if (action === 'approvePi') return handleApprovePi(params);

  return jsonResponse({
    ok: true,
    message: 'KU-KIT PO webhook is live. POST a PO payload here.',
    testMode: isTestMode()
  });
}

/**
 * Used by the KU-KIT website to prefill the PO form when a customer opens
 * their "fix this PO" link — requires the real Edit Token, not just the PO
 * number, since this returns full order detail.
 */
function handleGetOrderForEdit(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) return jsonResponse({ ok: false, error: 'Orders sheet tab not found.' });
  const row = findRowByPoAndToken(sheet, params.po, params.token, 'Edit Token');
  if (!row) return jsonResponse({ ok: false, error: 'No matching order found for that link.' });
  const order = getOrderRowData(sheet, row);
  return jsonResponse({
    ok: true,
    poNumber: order['PO Number'],
    status: order['Status'],
    revisionNotes: order['Revision Notes'],
    buyer: {
      company: order['Company'], address: order['Address'], country: order['Country'],
      contact: order['Contact'], email: order['Email'], phone: order['Phone'],
      customerRef: order['Customer PO Ref']
    },
    itemsText: order['Items'],
    incoterm: order['Incoterm'], port: order['Port'], paymentTerms: order['Payment Terms'],
    shippingMethod: order['Shipping Method'], deliveryDate: order['Requested Delivery Date'],
    piWanted: order['PI Requested'] === 'Yes', notes: order['Notes']
  });
}

/**
 * Read-only status lookup for the "check my order" box on the website — no
 * token, just the PO number plus the email already on file for it (so a
 * random guessed PO number alone can't be used to see whose order it is).
 * Deliberately doesn't hand back the Edit Token in general — except when
 * the order actually needs a correction, where handing it over here is no
 * more sensitive than what's already emailed automatically, and it means a
 * customer who lost/can't find that email can still get straight to fixing
 * their PO from the status box instead of being stuck.
 */
function handleGetOrderStatus(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) return jsonResponse({ ok: false, error: 'Orders sheet tab not found.' });
  const row = findRowByPoAndEmail(sheet, params.po, params.email);
  if (!row) return jsonResponse({ ok: false, error: 'No order found matching that PO number and email.' });
  const order = getOrderRowData(sheet, row);
  const needsRevision = order['Status'] === 'Needs Revision';
  return jsonResponse({
    ok: true,
    poNumber: order['PO Number'],
    submittedAt: order['Timestamp'],
    status: order['Status'],
    revisionNotes: needsRevision ? order['Revision Notes'] : '',
    editToken: needsRevision ? order['Edit Token'] : '',
    piStage: order['PI Stage'] || ''
  });
}

// Looks up an approved row in the "Dealers" tab by email (case-insensitive,
// trimmed). A row whose "Approved" cell isn't exactly "Y" is treated the
// same as not found — lets a company be suspended without deleting its row
// or losing its history. Columns: Company | Country | Dealer Contact Name |
// Dealer Email | Approved | Password.
function findDealer(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DEALERS);
  if (!sheet) return null;
  const needle = String(email || '').trim().toLowerCase();
  if (!needle) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const rowEmail = String(rows[i][3] || '').trim().toLowerCase();
    if (rowEmail && rowEmail === needle) {
      const approved = String(rows[i][4] || '').trim().toUpperCase();
      if (approved !== 'Y') return null;
      return { company: rows[i][0], country: rows[i][1], contact: rows[i][2], email: rows[i][3], password: String(rows[i][5] || '') };
    }
  }
  return null;
}

/**
 * DIAGNOSTIC — run this directly (select it in the function dropdown,
 * click Run), then View > Logs (or Ctrl+Enter) to see every row of the
 * Dealers tab with each value wrapped in quotes — makes a stray leading/
 * trailing space in "Password" or "Dealer Email" (which looks identical
 * to a normal cell at a glance) obvious immediately, instead of just
 * getting "Email or password not recognized" from the website with no
 * way to tell why.
 */
function debugDealers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DEALERS);
  if (!sheet) throw new Error('Dealers sheet tab not found — check the tab name is exactly "Dealers".');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0] && !rows[i][3]) continue; // skip fully blank rows
    Logger.log(
      'Row %s: Company="%s" Email="%s" Approved="%s" Password="%s"',
      i + 1, rows[i][0], rows[i][3], rows[i][4], rows[i][5]
    );
  }
}

/**
 * Instant sign-in: email + a password set for that dealer in the "Password"
 * column of the Dealers tab (plain text — an admin/sales sets it by hand
 * per dealer, there is no self-service reset). This is deliberately a
 * lightweight gate, the same trade-off already made everywhere else in
 * this system: good enough to stop a random visitor from spamming the
 * order form, NOT a hardened login — anyone with edit access to this
 * spreadsheet can read every dealer's password in plain sight, so don't
 * reuse a real account password here.
 */
function handleDealerLogin(params) {
  const email = String(params.email || '').trim();
  // Trimmed on both sides of the comparison — a stray leading/trailing
  // space from copy-pasting into the sheet (or from a mobile keyboard's
  // autocomplete) would otherwise cause a silent, confusing mismatch even
  // though the password "looks" right in both places.
  const password = String(params.password || '').trim();
  const dealer = findDealer(email);
  if (!dealer || !password || String(dealer.password || '').trim() !== password) {
    return jsonResponse({ ok: false, error: 'Email or password not recognized. Contact your KU-KIT sales rep to get set up.' });
  }
  return jsonResponse({ ok: true, company: dealer.company, country: dealer.country, contact: dealer.contact, email: dealer.email });
}

/**
 * Opened directly by a human clicking "Approve & send to customer" in the
 * PI draft email — returns a plain HTML confirmation/error page, not JSON,
 * since nothing but a browser opening the link is on the other end.
 */
function handleApprovePi(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) return htmlResponse('<p>Orders sheet tab not found.</p>');
  const row = findRowByPoAndToken(sheet, params.po, params.token, 'PI Approval Token');
  if (!row) return htmlResponse('<h2>Link not valid</h2><p>This approval link has already been used, or doesn\'t match any order. Check the Orders sheet directly.</p>');
  const order = getOrderRowData(sheet, row);
  if (order['PI Sent To Customer At']) {
    return htmlResponse('<h2>Already sent</h2><p>PO ' + escapeHtml(order['PO Number']) + '\'s PI was already sent to the customer on ' + escapeHtml(String(order['PI Sent To Customer At'])) + '.</p>');
  }
  try {
    const result = approvePiAndSendToCustomer(sheet, row);
    return htmlResponse('<h2>✅ Sent</h2><p>PI ' + escapeHtml(result.piNumber) + ' for PO ' + escapeHtml(order['PO Number']) +
      ' has been emailed directly to ' + escapeHtml(order['Email']) + '. Nothing more to do.</p>');
  } catch (err) {
    return htmlResponse('<h2>Something went wrong</h2><p>' + escapeHtml(String(err)) + '</p><p>The order itself is unaffected — check the Orders sheet, or try again.</p>');
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlResponse(bodyHtml) {
  return HtmlService.createHtmlOutput(
    '<html><body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#222;">' +
    bodyHtml + '</body></html>'
  );
}

// Sales Reps tab columns (as of the "Company" column added): Company |
// Country | Sales Rep Name | Sales Rep Email. Tries an exact company match
// first (case-insensitive) — lets specific known dealers be routed to a
// particular rep even when they share a country with other dealers — then
// falls back to matching on country alone, same as before that column
// existed, for any row/company not explicitly listed.
function findSalesRep(country, company) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALES_REPS);
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();

  const companyNeedle = String(company || '').trim().toLowerCase();
  if (companyNeedle) {
    for (let i = 1; i < rows.length; i++) {
      const rowCompany = String(rows[i][0] || '').trim().toLowerCase();
      if (rowCompany && rowCompany === companyNeedle) {
        const name = rows[i][2];
        const email = rows[i][3];
        if (email) return { name: name || email, email: email };
      }
    }
  }

  const countryNeedle = String(country || '').trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    const rowCountry = String(rows[i][1] || '').trim().toLowerCase();
    if (rowCountry && rowCountry === countryNeedle) {
      const name = rows[i][2];
      const email = rows[i][3];
      if (email) return { name: name || email, email: email };
    }
  }
  return null;
}

function isTestMode() {
  const val = String(getConfig('Test Mode', 'OFF')).trim().toUpperCase();
  return val === 'ON' || val === 'YES' || val === 'TRUE';
}

function getConfig(key, fallback) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  if (!sheet) return fallback;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) return rows[i][1] || fallback;
  }
  return fallback;
}

/**
 * Writes a value into the Config tab, adding the row if that key doesn't
 * exist yet. Used only to self-provision "Link Secret" the first time it's
 * needed (see getLinkSecret()) — every other Config value is meant to stay
 * a manual, human-edited setting.
 */
function setConfig(key, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

/**
 * The secret used to derive edit/approval tokens. Auto-created and saved
 * back into Config on first use so nobody has to remember to set it up —
 * just don't hand-edit or delete the row afterward, or every link already
 * emailed out stops matching.
 */
function getLinkSecret() {
  let secret = getConfig('Link Secret', '');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    setConfig('Link Secret', secret);
  }
  return secret;
}

/**
 * A short, unguessable, deterministic token for a given seed (typically a
 * PO number) — same seed always produces the same token as long as "Link
 * Secret" in Config hasn't changed, so it never needs to be looked up or
 * stored separately from being written into the Orders row once.
 */
function generateToken(seed) {
  const raw = Utilities.computeHmacSha256Signature(String(seed), getLinkSecret());
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('').slice(0, 24);
}

function findRowByPoAndToken(sheet, poNumber, token, tokenColumnName) {
  if (!poNumber || !token) return null;
  const poCol = ORDERS_HEADERS.indexOf('PO Number') + 1;
  const tokenCol = ORDERS_HEADERS.indexOf(tokenColumnName) + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const poValues = sheet.getRange(2, poCol, lastRow - 1, 1).getValues();
  const tokenValues = sheet.getRange(2, tokenCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < poValues.length; i++) {
    if (String(poValues[i][0]) === String(poNumber) && String(tokenValues[i][0]) === String(token)) {
      return i + 2;
    }
  }
  return null;
}

function findRowByPoAndEmail(sheet, poNumber, email) {
  if (!poNumber || !email) return null;
  const poCol = ORDERS_HEADERS.indexOf('PO Number') + 1;
  const emailCol = ORDERS_HEADERS.indexOf('Email') + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const poValues = sheet.getRange(2, poCol, lastRow - 1, 1).getValues();
  const emailValues = sheet.getRange(2, emailCol, lastRow - 1, 1).getValues();
  const needleEmail = String(email).trim().toLowerCase();
  for (let i = 0; i < poValues.length; i++) {
    if (String(poValues[i][0]) === String(poNumber) && String(emailValues[i][0]).trim().toLowerCase() === needleEmail) {
      return i + 2;
    }
  }
  return null;
}

function notifySalesRep(rep, data, buyer, rowNum, rowLink) {
  const senderName = getConfig('Notification Sender Name', 'KU-KIT Order System');
  const subject = '[KU-KIT PO] New order from ' + (buyer.company || 'Unknown') + ' — ' + (data.poNumber || '');
  const body = [
    'New purchase order submitted on the KU-KIT website.',
    '',
    'PO Number: ' + (data.poNumber || '-'),
    'Company: ' + (buyer.company || '-'),
    'Country: ' + (buyer.country || '-'),
    'Contact: ' + (buyer.contact || '-') + ' (' + (buyer.email || '-') + ')',
    'PI Requested: ' + (data.piWanted ? 'Yes' : 'No'),
    '',
    'Review this order (row ' + rowNum + '):',
    rowLink,
    '',
    'To confirm it, set this row\'s Status to "Confirmed" — the customer is emailed automatically.',
    'If something\'s wrong, fill in "Revision Notes" and set Status to "Needs Revision" — the ',
    'customer is emailed automatically with that note, plus a link back to fix this exact PO.'
  ].join('\n');
  MailApp.sendEmail({
    to: rep.email,
    subject: subject,
    body: body,
    name: senderName
  });
}

/**
 * Run this once (Run button, with this function selected) after installing
 * the script, to turn the Status and PI Stage columns into dropdowns, color
 * the header row (yellow = review/editable fields that feed the PI, gray =
 * system-managed), color-code each row by its Status, and add a hover-note
 * on the Status/PI Stage header cells listing what each dropdown value
 * actually shows to the customer on the website's status-check page (e.g.
 * "Needs Revision" appears to them as "อยู่ระหว่างการแก้ไขคำสั่งซื้อ" with an
 * edit-PO button). Safe to re-run any time — e.g. after adding many new
 * rows by hand, to extend the range these cover.
 */
function setupDropdowns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) throw new Error('Orders sheet tab not found.');
  const statusCol = ORDERS_HEADERS.indexOf('Status') + 1;
  const piStageCol = ORDERS_HEADERS.indexOf('PI Stage') + 1;
  const bankAccountCol = ORDERS_HEADERS.indexOf('Bank Account') + 1;
  sheet.getRange(2, statusCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(false).build()
  );
  sheet.getRange(2, piStageCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PI_STAGE_OPTIONS, true).setAllowInvalid(false).build()
  );
  applyBankAccountValidation(sheet, 2, 1000);
  sheet.getRange(1, bankAccountCol).setNote(
    'เลือกว่า PI ของ PO แถวนี้จะพิมพ์บัญชีธนาคารไหน — รายชื่อบัญชีมาจากแท็บ "Bank Accounts" ' +
    '(เพิ่ม/แก้บัญชีได้ที่แท็บนั้นโดยตรง ไม่ต้องแก้โค้ด)\n' +
    'ปล่อยว่างได้ — จะใช้ Config "Default Bank Account" หรือค่าเก่าใน Config (Bank Name ฯลฯ) แทน'
  );
  // Hover-note on the header cells translating each dropdown value into
  // what the customer actually sees on the website's status-check page —
  // the sheet only ever shows the internal English value, so whoever is
  // picking a Status/PI Stage here has no way to know the customer-facing
  // wording without this.
  sheet.getRange(1, statusCol).setNote(
    'ข้อความที่ลูกค้าเห็นหน้าเว็บตอนเช็คสถานะ:\n' +
    'New → "รอทีมขายตรวจสอบ"\n' +
    'Confirmed → "ยืนยันคำสั่งซื้อแล้ว"\n' +
    'Needs Revision → "อยู่ระหว่างการแก้ไขคำสั่งซื้อ" (ลูกค้าจะเห็นปุ่ม "แก้ไข PO นี้" ด้วย)\n' +
    'Closed → "ปิดงานแล้ว"'
  );
  sheet.getRange(1, piStageCol).setNote(
    'ข้อความที่ลูกค้าเห็นหน้าเว็บตอนเช็คสถานะ (แสดงเป็นบรรทัดแยกจาก Status ด้านบน):\n' +
    '(ว่าง) → ไม่แสดงบรรทัดนี้เลย\n' +
    'Requested → "อยู่ระหว่างการออก PI"\n' +
    'Generated → "จัดทำ PI แล้ว รอทีมขายตรวจสอบ" (อีเมลไปหาเซลที่ assign ให้ PO นี้)\n' +
    'Reviewed → "ทีมขายตรวจสอบแล้ว รอผู้บริหารเซ็นอนุมัติ" (อีเมลไปหา PI Issuer)\n' +
    'Sent to Customer → "ส่ง PI ให้คุณทางอีเมลแล้ว"'
  );
  setupSheetFormatting(sheet);
}

/**
 * Creates the "Bank Accounts" tab (Label, Bank Name, Account No., SWIFT
 * Code, A/C Name) the first time it's needed, pre-filled with the two
 * accounts found in use on real PIs at the time this was written — Mizuho
 * for the Africa/CIF deals, Bangkok Bank for the Panama/Dubai/FOB deals.
 * Safe to re-run: never touches a tab that already exists, so accounts
 * added or edited by hand afterward are left alone. Add more rows any
 * time — every "Bank Account" dropdown on the Orders sheet reads this
 * range live, so a new row is selectable immediately, no code change or
 * re-run of setupDropdowns() needed.
 */
function ensureBankAccountsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_BANK_ACCOUNTS);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SHEET_BANK_ACCOUNTS);
  sheet.appendRow(BANK_ACCOUNTS_HEADERS);
  sheet.getRange(1, 1, 1, BANK_ACCOUNTS_HEADERS.length).setFontWeight('bold');
  sheet.appendRow([
    'Mizuho Bank (Africa / CIF deals)', 'MIZUHO BANK, LTD.',
    'F15-764-917686', 'MHCBTHBKXXX', 'Siam Kubota Corporation Co.,Ltd.'
  ]);
  sheet.appendRow([
    'Bangkok Bank (Panama / Dubai / FOB deals)', 'BANGKOK BANK PCL',
    '083-3-00059-9', 'BKKBTHBK', 'SIAM KUBOTA Corporation Co., Ltd.'
  ]);
  sheet.autoResizeColumns(1, BANK_ACCOUNTS_HEADERS.length);
  return sheet;
}

// Points an Orders-sheet range's "Bank Account" column at a dropdown built
// from the Bank Accounts tab's Label column — requireValueInRange (not a
// hardcoded list) so it always reflects whatever rows are in that tab.
function applyBankAccountValidation(ordersSheet, startRow, numRows) {
  const bankSheet = ensureBankAccountsSheet();
  const labelRange = bankSheet.getRange(2, 1, Math.max(bankSheet.getMaxRows() - 1, 1), 1);
  const bankAccountCol = ORDERS_HEADERS.indexOf('Bank Account') + 1;
  ordersSheet.getRange(startRow, bankAccountCol, numRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(labelRange, true).setAllowInvalid(false).build()
  );
}

/**
 * Resolves an Orders row's "Bank Account" label into the actual bank
 * detail block to print on that order's PI. Falls back, in order, to: the
 * Config "Default Bank Account" label, then the old flat Bank Name/Bank
 * Account No./Bank SWIFT Code/Bank Account Name Config keys (kept as a
 * safety net for setups that predate the Bank Accounts tab) — so a blank
 * Bank Account cell, an empty Bank Accounts tab, or an old order all still
 * produce a usable PI instead of a blank bank-detail block.
 */
function getBankAccountDetails(label) {
  const bankSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BANK_ACCOUNTS);
  const tryLabel = function (l) {
    if (!bankSheet || !l) return null;
    const rows = bankSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(l).trim()) {
        return { bankName: rows[i][1], accountNo: rows[i][2], swift: rows[i][3], accountName: rows[i][4] };
      }
    }
    return null;
  };
  const found = tryLabel(label) || tryLabel(getConfig('Default Bank Account', ''));
  if (found) return found;
  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  return {
    bankName: getConfig('Bank Name', ''),
    accountNo: getConfig('Bank Account No.', ''),
    swift: getConfig('Bank SWIFT Code', ''),
    accountName: getConfig('Bank Account Name', companyName)
  };
}

// Columns whose values actually feed into the generated PI — highlighted in
// the header as "review/editable"; everything else is system-managed.
const REVIEWABLE_COLUMNS = [
  'Company', 'Address', 'Country', 'Contact', 'Email', 'Phone',
  'Customer PO Ref', 'Items', 'Incoterm', 'Port', 'Payment Terms',
  'Shipping Method', 'Requested Delivery Date', 'PI Requested', 'Notes',
  'Revision Notes', 'Bank Account'
];

function columnToLetter(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function setupSheetFormatting(sheet) {
  sheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) throw new Error('Orders sheet tab not found.');

  ORDERS_HEADERS.forEach(function (header, i) {
    const col = i + 1;
    const isReviewable = REVIEWABLE_COLUMNS.indexOf(header) !== -1;
    sheet.getRange(1, col).setBackground(isReviewable ? '#FFF2CC' : '#EFEFEF');
  });

  const statusCol = ORDERS_HEADERS.indexOf('Status') + 1;
  const statusLetter = columnToLetter(statusCol);
  const dataRange = sheet.getRange(2, 1, 1000, ORDERS_HEADERS.length);

  const rowColors = [
    { value: 'New', color: '#FFF9C4' },                  // needs review
    { value: 'Confirmed', color: '#D9EAD3' },             // green
    { value: 'Needs Revision', color: '#F4CCCC' },        // red
    { value: 'Closed', color: '#EFEFEF' },                // gray
    { value: 'TEST (no email sent)', color: '#E1D5F0' }   // purple — obvious test marker
  ];
  const rules = rowColors.map(function (r) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + statusLetter + '2="' + r.value + '"')
      .setBackground(r.color)
      .setRanges([dataRange])
      .build();
  });
  sheet.setConditionalFormatRules(rules);
}

/**
 * DIAGNOSTIC — run this directly (select it in the function dropdown, click
 * Run) to test PI generation on the LAST row in Orders. Unlike changing the
 * Status dropdown (which runs via onEdit and hides errors), running this
 * directly shows the real error in the log if something's wrong — use it to
 * debug, then check Drive / the Notes column same as usual.
 */
function testGeneratePi() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) throw new Error('Orders sheet tab not found.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('No order rows found in Orders.');
  const result = generatePiPdfForRow(sheet, lastRow);
  Logger.log('PI generated for row ' + lastRow + ': ' + JSON.stringify(result));
}

/**
 * Simple trigger — runs automatically whenever anyone edits this
 * spreadsheet. Watches two separate columns on the Orders sheet:
 *   - Status:   "Confirmed" stamps who confirmed the order and when, emails
 *               the customer that their order is confirmed, AND — if that
 *               order asked for a PI — immediately drafts it and emails
 *               the assigned sales rep for review, same as if you'd
 *               manually set PI Stage to "Requested" right after (see
 *               below). No separate click needed for the common case.
 *               "Needs Revision" emails the customer that something needs
 *               correcting (including the "Revision Notes" cell, if filled
 *               in first) with a link back to fix this exact PO.
 *   - PI Stage: "Requested" (still available manually) drafts the PI and
 *               emails it to the assigned sales rep for review (see
 *               handleReviewPi() for the next step, which forwards it on
 *               to the PI Issuer to sign) — this is now mainly the
 *               regenerate/correction path: if the sales rep finds
 *               something wrong, fix the row and set this back to
 *               "Requested" to redraft and re-send for review.
 * Status and PI Stage are otherwise independent — changing one never
 * touches the other except for this one auto-trigger. "Closed" and "New"
 * don't trigger any email.
 */
function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_ORDERS) return;
    if (e.range.getRow() === 1) return; // header row

    const row = e.range.getRow();
    const col = e.range.getColumn();
    const newValue = String(e.value || '').trim();
    const statusCol = ORDERS_HEADERS.indexOf('Status') + 1;
    const piStageCol = ORDERS_HEADERS.indexOf('PI Stage') + 1;

    if (col === statusCol && newValue === 'Confirmed') {
      const confirmedByCol = ORDERS_HEADERS.indexOf('Confirmed By') + 1;
      const confirmedAtCol = ORDERS_HEADERS.indexOf('Confirmed At') + 1;
      let user = '';
      try { user = Session.getActiveUser().getEmail(); } catch (ignored) {}
      sheet.getRange(row, confirmedByCol).setValue(user || 'Confirmed (user email unavailable)');
      sheet.getRange(row, confirmedAtCol).setValue(new Date());
      if (!isTestMode()) notifyCustomerConfirmed(getOrderRowData(sheet, row));

      // Auto-draft the PI right on confirmation when one was requested —
      // removes the separate manual "set PI Stage to Requested" click for
      // the common case, so Confirm alone is enough to kick the sales-rep
      // review email out. Guarded on PI Stage still being blank so
      // re-selecting "Confirmed" on an already-in-progress order (e.g. a
      // stray re-click) doesn't regenerate and re-notify everyone; PI
      // Stage -> "Requested" (the branch below) remains the manual
      // regenerate/correction path for after this.
      const piWanted = sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Requested') + 1).getValue();
      const currentPiStage = String(sheet.getRange(row, piStageCol).getValue() || '').trim();
      if (piWanted === 'Yes' && !currentPiStage) {
        try {
          generatePiPdfForRow(sheet, row);
        } catch (err) {
          console.error('Auto PI generation on confirm failed: ' + err);
        }
      }
      return;
    }

    if (col === statusCol && newValue === 'Needs Revision') {
      if (!isTestMode()) notifyCustomerNeedsRevision(getOrderRowData(sheet, row));
      return;
    }

    if (col === piStageCol && newValue === 'Requested') {
      const currentStatus = String(sheet.getRange(row, statusCol).getValue() || '').trim();
      if (currentStatus !== 'Confirmed') {
        e.range.setValue(''); // refuse — reset PI Stage back to blank
        SpreadsheetApp.getUi().alert(
          'This order is not Confirmed yet (Status = "' + (currentStatus || '(blank)') + '"). ' +
          'Review the order details in this row and set Status to "Confirmed" first — that\'s the ' +
          'review checkpoint before any PI gets drafted from this data. Then set PI Stage to "Requested" again.'
        );
        return;
      }
      generatePiPdfForRow(sheet, row);
      return;
    }
  } catch (err) {
    console.error('onEdit error: ' + err);
  }
}

/* ---------- PI (Proforma Invoice) draft generation ---------- */

function getOrderRowData(sheet, row) {
  const values = sheet.getRange(row, 1, 1, ORDERS_HEADERS.length).getValues()[0];
  const obj = {};
  ORDERS_HEADERS.forEach(function (h, i) { obj[h] = values[i]; });
  return obj;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseItemsText(text) {
  if (!text) return [];
  return String(text).split(';').map(function (s) { return s.trim(); }).filter(Boolean).map(function (seg) {
    const m = seg.match(/^(.*)\sx(\d+(?:\.\d+)?)\s\(\$([\d,.]+)\)$/);
    if (!m) return { name: seg, qty: 1, price: 0 };
    return { name: m[1].trim(), qty: parseFloat(m[2]), price: parseFloat(m[3].replace(/,/g, '')) };
  });
}

function getOrCreateFolder(name) {
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

/**
 * Builds the PI's HTML (shared by the draft and the final signed copy) —
 * `signatureDataUri`, when provided, replaces the blank signature line
 * with the actual stamped image.
 */
function buildPiHtml(order, piNumber, dateStr, signatureDataUri) {
  const items = parseItemsText(order['Items']);
  const total = items.reduce(function (s, it) { return s + it.qty * it.price; }, 0);

  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  const signerName = getConfig('Current PI Signer Name', '');
  const signerTitle = getConfig('Current PI Signer Title', '');
  const bank = getBankAccountDetails(order['Bank Account']);
  const bankName = bank.bankName;
  const bankAccountNo = bank.accountNo;
  const bankSwift = bank.swift;
  const bankAccountName = bank.accountName;

  const itemRows = items.map(function (it, i) {
    return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(it.name) + '</td>' +
      '<td style="text-align:right">' + it.qty + '</td>' +
      '<td style="text-align:right">' + it.price.toFixed(2) + '</td>' +
      '<td style="text-align:right">' + (it.qty * it.price).toFixed(2) + '</td></tr>';
  }).join('');

  const sigBlock = signatureDataUri
    ? '<img src="' + signatureDataUri + '" style="height:60px;display:block;margin-top:10px;" alt="Signature">'
    : '<p style="margin-top:40px;">_______________________________</p>';

  return '<html><head><style>' +
    'body{font-family:Arial,sans-serif;font-size:11px;color:#111;}' +
    'h1{text-align:center;font-size:20px;letter-spacing:2px;margin-bottom:20px;}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:12px;}' +
    'td,th{border:1px solid #333;padding:5px 8px;vertical-align:top;}' +
    '.label{font-weight:bold;background:#f2f2f2;width:22%;}' +
    '.items th{background:#f2f2f2;text-align:left;}' +
    '.total-row td{font-weight:bold;}' +
    '.sig-block{margin-top:30px;}' +
    '.small{font-size:9px;color:#555;margin-top:16px;}' +
    '</style></head><body>' +
    '<h1>PROFORMA INVOICE</h1>' +
    '<table>' +
    '<tr><td class="label">Invoice No.</td><td>' + piNumber + '</td><td class="label">Date</td><td>' + dateStr + '</td></tr>' +
    '<tr><td class="label">Consigned to Messrs</td><td colspan="3">' + escapeHtml(order['Company']) + '<br>' + escapeHtml(order['Address']) + '</td></tr>' +
    '<tr><td class="label">Buyer\'s Order No.</td><td>' + escapeHtml(order['Customer PO Ref'] || order['PO Number']) + '</td>' +
    '<td class="label">Sales Confirmation No.</td><td>' + escapeHtml(order['PO Number']) + '</td></tr>' +
    '<tr><td class="label">Shipped Per</td><td>' + escapeHtml(order['Shipping Method']) + '</td>' +
    '<td class="label">On or About</td><td>' + escapeHtml(order['Requested Delivery Date']) + '</td></tr>' +
    '<tr><td class="label">Port of Loading</td><td>Laem Chabang, Thailand</td>' +
    '<td class="label">Port of Discharge</td><td>' + escapeHtml(order['Port'] || '-') + '</td></tr>' +
    '<tr><td class="label">Terms of Payment</td><td colspan="3">' + escapeHtml(order['Payment Terms']) + '</td></tr>' +
    '<tr><td class="label">Place of Delivery</td><td>' + escapeHtml(order['Incoterm']) + '</td>' +
    '<td class="label">Country of Origin</td><td>Thailand</td></tr>' +
    '</table>' +
    '<table class="items"><thead><tr><th>No.</th><th>Description</th><th>Qty</th><th>Unit Price (USD)</th><th>Amount (USD)</th></tr></thead>' +
    '<tbody>' + itemRows +
    '<tr class="total-row"><td colspan="4" style="text-align:right">TOTAL (USD)</td><td style="text-align:right">' + total.toFixed(2) + '</td></tr>' +
    '</tbody></table>' +
    '<table><tr><td class="label">Bank Detail</td><td>' + escapeHtml(bankName) +
    '<br>Account No.: ' + escapeHtml(bankAccountNo) +
    '<br>SWIFT Code: ' + escapeHtml(bankSwift) +
    '<br>A/C Name: ' + escapeHtml(bankAccountName) + '</td></tr></table>' +
    '<div class="sig-block">' +
    '<p>' + escapeHtml(companyName) + '</p>' +
    sigBlock +
    '<p>(' + escapeHtml(signerName) + ')<br>' + escapeHtml(signerTitle) + '</p>' +
    '</div>' +
    '<p class="small">E.&amp;O.E. — Draft generated by the KU-KIT PO/PI system on ' + dateStr +
    (signatureDataUri ? '.' : '. Requires manual review and approval before sending to the customer.') +
    '</p>' +
    '</body></html>';
}

function generatePiPdfForRow(sheet, row) {
  const order = getOrderRowData(sheet, row);

  const existingPiNumber = order['PI Number'];
  const piNumber = existingPiNumber || (getConfig('PI Number Prefix', 'SKC-PI') + '-' +
    Utilities.formatDate(new Date(), 'GMT+7', 'yyMMdd') + '-' + row);
  const dateStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd-MMM-yyyy');

  const html = buildPiHtml(order, piNumber, dateStr, null);
  const pdfBlob = Utilities.newBlob(html, 'text/html', piNumber + '.html')
    .getAs('application/pdf').setName(piNumber + '-draft.pdf');

  const folder = getOrCreateFolder('KU-KIT PI Documents');
  const file = folder.createFile(pdfBlob);

  // Two separate one-click links, used at two separate stages: the review
  // link (sent now, to whoever is assigned to this order) only forwards the
  // draft on to the signer — it never touches the customer. The approval
  // link (sent later, by handleReviewPi(), once the reviewer clicks) is the
  // one that actually stamps the signature and reaches the customer. Both
  // tokens are generated and stored now so the approval link is ready the
  // moment it's needed, without a second write to the row.
  const reviewToken = generateToken(String(order['PO Number']) + '|pireview|' + piNumber);
  const approvalToken = generateToken(String(order['PO Number']) + '|pi|' + piNumber);
  const scriptUrl = webAppUrl();
  const reviewLink = scriptUrl + '?action=reviewPi&po=' + encodeURIComponent(order['PO Number']) + '&token=' + reviewToken;

  const repMatch = String(order['Assigned Sales Rep'] || '').match(/<(.+)>/);
  const reviewerEmail = (repMatch ? repMatch[1] : '') || getConfig('Default Sales Rep Email', '');
  const testMode = isTestMode();

  if (reviewerEmail && !testMode) {
    MailApp.sendEmail({
      to: reviewerEmail,
      subject: '[KU-KIT PI Draft] ' + piNumber + ' — ' + (order['Company'] || '') + ' (please check before it goes to signing)',
      body: 'A draft Proforma Invoice has been generated for PO ' + (order['PO Number'] || '') + '.\n\n' +
        'Please check the attached draft against the order details. If everything is correct, click the ' +
        'link below to forward it on for signature — that\'s the only step this link does, it does NOT go ' +
        'to the customer yet.\n\n' +
        'Approve & forward for signature:\n' + reviewLink + '\n\n' +
        'If something is wrong: fix it directly in the Orders sheet row for this PO, then set PI Stage back ' +
        'to "Requested" to regenerate the draft — there is no reject button, this is the correction path.\n\n' +
        'Drive copy of the draft: ' + file.getUrl(),
      attachments: [pdfBlob],
      name: getConfig('Notification Sender Name', 'KU-KIT Order System')
    });
  }

  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Number') + 1).setValue(piNumber);
  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Approval Token') + 1).setValue(approvalToken);
  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Review Token') + 1).setValue(reviewToken);

  const notesCol = ORDERS_HEADERS.indexOf('Notes') + 1;
  const existingNotes = sheet.getRange(row, notesCol).getValue();
  let stamp = (testMode ? '[TEST] ' : '') + 'PI draft generated ' + dateStr + ': ' + file.getUrl();
  if (!reviewerEmail) {
    stamp += ' — ⚠ no reviewer email found (Assigned Sales Rep is blank/unmatched and Config ' +
      '"Default Sales Rep Email" is also blank), so nobody was notified. Set one of those, then set PI ' +
      'Stage back to "Requested" to regenerate and actually send the review email.';
  }
  sheet.getRange(row, notesCol).setValue(existingNotes ? existingNotes + '\n' + stamp : stamp);

  // "Requested" only means someone asked for it; "Generated" confirms the
  // draft exists and is out for review. Set here rather than left for a
  // human, since generation either fully succeeds (we reach this line) or
  // throws above (caught by the caller, PI Stage stays "Requested" so it's
  // obvious it didn't finish).
  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Stage') + 1).setValue('Generated');

  return { piNumber: piNumber, url: file.getUrl(), reviewLink: reviewLink };
}

/**
 * Runs when the assigned sales rep clicks "Approve & forward for signature"
 * in the PI review email — does NOT touch the customer or stamp any
 * signature; it only forwards the already-drafted PI on to the PI Issuer
 * (the executive) using the approval token generated back when the draft
 * was created. Marks PI Stage "Reviewed" so a re-click of an already-used
 * review link is recognized instead of notifying the issuer twice.
 */
function handleReviewPi(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) return htmlResponse('<p>Orders sheet tab not found.</p>');
  const row = findRowByPoAndToken(sheet, params.po, params.token, 'PI Review Token');
  if (!row) return htmlResponse('<h2>Link not valid</h2><p>This review link has already been used, or doesn\'t match any order. Check the Orders sheet directly.</p>');
  const order = getOrderRowData(sheet, row);
  const stage = order['PI Stage'];
  if (stage === 'Reviewed' || stage === 'Sent to Customer') {
    return htmlResponse('<h2>Already forwarded</h2><p>PO ' + escapeHtml(order['PO Number']) + '\'s PI was already forwarded for signature. No need to do this again.</p>');
  }
  try {
    const issuerEmail = getConfig('PI Issuer Email', '');
    const piNumber = order['PI Number'];
    const approvalToken = order['PI Approval Token'];
    const scriptUrl = webAppUrl();
    const approveLink = scriptUrl + '?action=approvePi&po=' + encodeURIComponent(order['PO Number']) + '&token=' + approvalToken;
    const testMode = isTestMode();

    if (issuerEmail && !testMode) {
      // Rebuild the same unsigned draft to attach here — the signer should
      // see exactly what they're approving without having to dig up the
      // Drive link from the earlier review email themselves.
      const dateStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd-MMM-yyyy');
      const html = buildPiHtml(order, piNumber, dateStr, null);
      const pdfBlob = Utilities.newBlob(html, 'text/html', piNumber + '.html')
        .getAs('application/pdf').setName(piNumber + '-draft.pdf');
      MailApp.sendEmail({
        to: issuerEmail,
        subject: '[KU-KIT PI Ready to Sign] ' + piNumber + ' — ' + (order['Company'] || ''),
        body: 'PO ' + (order['PO Number'] || '') + ' has been checked by the sales team and is ready for your signature.\n\n' +
          'Review the attached draft. Click the link below — this stamps the saved signature onto the PDF ' +
          'and emails the final copy straight to the customer. No further action needed after that.\n\n' +
          'Approve & send to customer:\n' + approveLink,
        attachments: [pdfBlob],
        name: getConfig('Notification Sender Name', 'KU-KIT Order System')
      });
    }

    sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Stage') + 1).setValue('Reviewed');

    return htmlResponse(issuerEmail
      ? '<h2>✅ Forwarded</h2><p>PI ' + escapeHtml(piNumber) + ' for PO ' + escapeHtml(order['PO Number']) + ' has been forwarded to ' + escapeHtml(issuerEmail) + ' for signature. Nothing more to do on your end.</p>'
      : '<h2>⚠ No PI Issuer Email set</h2><p>PO ' + escapeHtml(order['PO Number']) + ' was marked reviewed, but Config "PI Issuer Email" is blank so nobody was actually notified. Set that Config row, then open the Orders sheet and re-run this by setting PI Stage back to "Generated" then "Requested" — or approve it directly from the Orders sheet.</p>');
  } catch (err) {
    return htmlResponse('<h2>Something went wrong</h2><p>' + escapeHtml(String(err)) + '</p><p>The order itself is unaffected — check the Orders sheet, or try again.</p>');
  }
}

/**
 * Runs when the PI Issuer clicks "Approve & send to customer" — stamps the
 * signature image (if configured) into a fresh copy of the same PI and
 * emails it directly to the customer. Marks PI Stage "Sent to Customer" and
 * fills "PI Sent To Customer At" so handleApprovePi() can recognize a
 * re-click of an already-used link instead of sending twice.
 */
function approvePiAndSendToCustomer(sheet, row) {
  const order = getOrderRowData(sheet, row);
  const piNumber = order['PI Number'] || (getConfig('PI Number Prefix', 'SKC-PI') + '-' +
    Utilities.formatDate(new Date(), 'GMT+7', 'yyMMdd') + '-' + row);
  const dateStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd-MMM-yyyy');

  let signatureDataUri = null;
  const sigFileId = getConfig('Signature Image File ID', '');
  if (sigFileId) {
    try {
      const sigBlob = DriveApp.getFileById(sigFileId).getBlob();
      signatureDataUri = 'data:' + sigBlob.getContentType() + ';base64,' + Utilities.base64Encode(sigBlob.getBytes());
    } catch (err) {
      // Missing/inaccessible file shouldn't block sending the PI — it just
      // goes out without a stamped signature image, same as the draft.
      console.error('Could not load signature image: ' + err);
    }
  }

  const html = buildPiHtml(order, piNumber, dateStr, signatureDataUri);
  const pdfBlob = Utilities.newBlob(html, 'text/html', piNumber + '.html')
    .getAs('application/pdf').setName(piNumber + '.pdf');

  const folder = getOrCreateFolder('KU-KIT PI Documents');
  const file = folder.createFile(pdfBlob);

  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  if (order['Email']) {
    MailApp.sendEmail({
      to: order['Email'],
      subject: 'Proforma Invoice ' + piNumber + ' — PO ' + (order['PO Number'] || ''),
      body: 'Dear ' + (order['Contact'] || 'Customer') + ',\n\n' +
        'Please find attached the Proforma Invoice for your purchase order ' + (order['PO Number'] || '') + '.\n\n' +
        companyName,
      attachments: [pdfBlob],
      name: getConfig('Notification Sender Name', 'KU-KIT Order System')
    });
  }

  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Stage') + 1).setValue('Sent to Customer');
  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Sent To Customer At') + 1).setValue(new Date());

  return { piNumber: piNumber, url: file.getUrl() };
}

function notifyCustomer(data, buyer) {
  if (!buyer.email) return;
  const senderName = getConfig('Notification Sender Name', 'KU-KIT Order System');
  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  const subject = 'We received your purchase order — ' + (data.poNumber || '');
  const body = [
    'Dear ' + (buyer.contact || 'Customer') + ',',
    '',
    "Thank you — we've received your purchase order " + (data.poNumber || '') + '.',
    'Our sales team will review it and get back to you shortly.',
    '',
    companyName
  ].join('\n');
  MailApp.sendEmail({
    to: buyer.email,
    subject: subject,
    body: body,
    name: senderName
  });
}

function siteBaseUrl() {
  const configured = getConfig('Site Base URL', '');
  const base = configured || DEFAULT_SITE_BASE_URL;
  return base.replace(/\/+$/, '') + '/';
}

/**
 * Sent automatically when a sales rep sets an order's Status to
 * "Confirmed" (see onEdit). `order` is the full row as read by
 * getOrderRowData(), keyed by the ORDERS_HEADERS column names.
 */
function notifyCustomerConfirmed(order) {
  const email = order['Email'];
  if (!email) return;
  const senderName = getConfig('Notification Sender Name', 'KU-KIT Order System');
  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  const subject = 'Your purchase order has been confirmed — ' + (order['PO Number'] || '');
  const body = [
    'Dear ' + (order['Contact'] || 'Customer') + ',',
    '',
    'Good news — your purchase order ' + (order['PO Number'] || '') + ' has been reviewed and confirmed.',
    order['PI Requested'] === 'Yes'
      ? 'A Proforma Invoice will follow separately once it has been prepared.'
      : 'Our team will be in touch about the next steps.',
    '',
    companyName
  ].join('\n');
  MailApp.sendEmail({ to: email, subject: subject, body: body, name: senderName });
}

/**
 * Sent automatically when a sales rep sets an order's Status to
 * "Needs Revision" (see onEdit). Include whatever's in that row's
 * "Revision Notes" cell, if anything, plus a link straight back to that
 * exact PO on the KU-KIT website (pre-filled, editable) so the customer
 * doesn't have to retype the whole form or accidentally create an
 * unrelated second PO.
 */
function notifyCustomerNeedsRevision(order) {
  const email = order['Email'];
  if (!email) return;
  const senderName = getConfig('Notification Sender Name', 'KU-KIT Order System');
  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  const notes = String(order['Revision Notes'] || '').trim();
  const editLink = siteBaseUrl() + '?po=' + encodeURIComponent(order['PO Number']) + '&token=' + encodeURIComponent(order['Edit Token']) + '#po-request';
  const subject = 'Your purchase order needs a correction — ' + (order['PO Number'] || '');
  const body = [
    'Dear ' + (order['Contact'] || 'Customer') + ',',
    '',
    'We reviewed your purchase order ' + (order['PO Number'] || '') + ' and it needs a correction before we can proceed.',
    notes ? ('Details: ' + notes) : 'Please review and correct the order below.',
    '',
    'Fix and resubmit this exact PO here (your details are already filled in):',
    editLink,
    '',
    companyName
  ].join('\n');
  MailApp.sendEmail({ to: email, subject: subject, body: body, name: senderName });
}
