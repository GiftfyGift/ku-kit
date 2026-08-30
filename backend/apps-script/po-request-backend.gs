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
 *                  (blank) / Requested / Generated.
 *
 * SETUP (once, after pasting/saving this file): run setupDropdowns()
 * (select it in the function dropdown next to the Run button, then click
 * Run) — this adds both dropdowns to the Orders sheet.
 *
 * ONE-TIME MIGRATION if you're updating an existing sheet from an earlier
 * version of this script: add a new header cell "Revision Notes" in the
 * FIRST EMPTY COLUMN after "PI Stage" in row 1 of the Orders tab (it must
 * be the very last column — this script always appends new fields at the
 * end so existing rows/columns are never disturbed). That's the only sheet
 * change needed; everything else keeps working as before.
 *
 * CONFIRMING AN ORDER: whoever reviews an order opens the sheet and changes
 * that row's "Status" to "Confirmed" — the "Confirmed By" and
 * "Confirmed At" columns fill in automatically, and the customer is
 * automatically emailed that their order has been confirmed.
 *
 * SENDING AN ORDER BACK FOR CORRECTION: if something in the customer's
 * order is wrong, first fix or note the issue, then change that row's
 * "Status" to "Needs Revision" — the customer is automatically emailed
 * that their order needs a correction. Fill in the "Revision Notes"
 * column (last column) BEFORE changing the Status, if you want the
 * customer's email to explain what's wrong / what needs to change; leave
 * it blank for a generic "please contact us" message. You can also just
 * edit any field directly in the row (company name, items, quantities,
 * etc.) to fix a simple typo yourself instead of sending it back — every
 * field the PI later pulls from is a normal cell in that row.
 *
 * "Closed" doesn't send any email — use it purely for your own tracking
 * once an order is fully wrapped up.
 *
 * GENERATING A PI: change that row's "PI Stage" (a different column) to
 * "Requested" — this drafts a Proforma Invoice PDF from the row's data,
 * saves it to a Drive folder called "KU-KIT PI Documents", and emails it
 * to the "PI Issuer Email" set in Config (falls back to the assigned sales
 * rep if that's blank). This is a DRAFT ONLY — someone still has to review,
 * sign, and forward it to the customer by hand; there's no digital
 * signature or auto-send yet. Requires these Config rows to be filled in:
 * Bank Name, Bank Account No., Bank SWIFT Code, Bank Account Name,
 * PI Issuer Email (plus the existing Current PI Signer Name/Title).
 * The first time this runs, Google will ask you to re-authorize (it now
 * also needs Drive access to save the PDF) — approve it the same way as
 * the first deployment.
 *
 * REVIEW-BEFORE-GENERATE GATE: PI Stage refuses to become "Requested" (it
 * resets to blank with an on-screen alert) unless that row's Status is
 * already "Confirmed". This is the review checkpoint — whoever needs to
 * check the order (management/sales) does so by editing the Orders row
 * itself before confirming: every field the PI pulls from (company,
 * address, items, Incoterm, payment terms, bank detail, signer, etc.) is
 * just a normal cell in that row, so correct anything there first, then
 * set Status to Confirmed, then PI Stage to Requested.
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
 * None of onEdit/setupDropdowns/PI generation need a Web App redeploy to
 * take effect — only doGet/doPost do. Just saving the script is enough.
 */

const SHEET_ORDERS = 'Orders';
const SHEET_SALES_REPS = 'Sales Reps';
const SHEET_CONFIG = 'Config';

const ORDERS_HEADERS = [
  'Timestamp', 'PO Number', 'Company', 'Address', 'Country', 'Contact',
  'Email', 'Phone', 'Customer PO Ref', 'Items', 'Subtotal (USD)',
  'Incoterm', 'Port', 'Payment Terms', 'Shipping Method',
  'Requested Delivery Date', 'PI Requested', 'Notes', 'Status',
  'Assigned Sales Rep', 'Confirmed By', 'Confirmed At', 'PI Stage',
  'Revision Notes'
];

const STATUS_OPTIONS = ['New', 'Confirmed', 'Needs Revision', 'Closed'];
const PI_STAGE_OPTIONS = ['', 'Requested', 'Generated'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'No POST body received.' });
    }
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName(SHEET_ORDERS);
    if (!ordersSheet) {
      return jsonResponse({ ok: false, error: 'Orders sheet tab not found — check the tab name is exactly "Orders".' });
    }

    const buyer = data.buyer || {};
    const itemsText = (data.items || [])
      .map(function (i) { return i.name + ' x' + i.qty + ' ($' + i.price + ')'; })
      .join('; ');
    const subtotal = (data.items || [])
      .reduce(function (sum, i) { return sum + (i.price || 0) * (i.qty || 0); }, 0);

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
      ''  // Revision Notes — filled in by sales before sending a "Needs Revision" email
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

    // Deep-link straight to this row instead of just the spreadsheet's front
    // page, so the "review this order" email drops the rep right where the
    // data is instead of making them scroll/search for it.
    const rowLink = ss.getUrl() + '#gid=' + ordersSheet.getSheetId() + '&range=A' + newRow;

    let rep = findSalesRep(buyer.country || '');
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

function doGet(e) {
  return jsonResponse({
    ok: true,
    message: 'KU-KIT PO webhook is live. POST a PO payload here.',
    testMode: isTestMode()
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function findSalesRep(country) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALES_REPS);
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  const needle = String(country).trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    const rowCountry = String(rows[i][0] || '').trim().toLowerCase();
    if (rowCountry && rowCountry === needle) {
      const name = rows[i][1];
      const email = rows[i][2];
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
    'customer is emailed automatically with that note asking them to correct and resubmit.'
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
 * system-managed), and color-code each row by its Status so the sheet is
 * scannable at a glance. Safe to re-run any time — e.g. after adding many
 * new rows by hand, to extend the range these cover.
 */
function setupDropdowns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sheet) throw new Error('Orders sheet tab not found.');
  const statusCol = ORDERS_HEADERS.indexOf('Status') + 1;
  const piStageCol = ORDERS_HEADERS.indexOf('PI Stage') + 1;
  sheet.getRange(2, statusCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(false).build()
  );
  sheet.getRange(2, piStageCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PI_STAGE_OPTIONS, true).setAllowInvalid(false).build()
  );
  setupSheetFormatting(sheet);
}

// Columns whose values actually feed into the generated PI — highlighted in
// the header as "review/editable"; everything else is system-managed.
const REVIEWABLE_COLUMNS = [
  'Company', 'Address', 'Country', 'Contact', 'Email', 'Phone',
  'Customer PO Ref', 'Items', 'Incoterm', 'Port', 'Payment Terms',
  'Shipping Method', 'Requested Delivery Date', 'PI Requested', 'Notes',
  'Revision Notes'
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
 *   - Status:   "Confirmed" stamps who confirmed the order and when, and
 *               emails the customer that their order is confirmed.
 *               "Needs Revision" emails the customer that something needs
 *               correcting (including the "Revision Notes" cell, if filled
 *               in first).
 *   - PI Stage: "Requested" drafts and emails the PI PDF.
 * Status and PI Stage are independent — changing one never touches the
 * other. "Closed" and "New" don't trigger any email.
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

function generatePiPdfForRow(sheet, row) {
  const order = getOrderRowData(sheet, row);
  const items = parseItemsText(order['Items']);
  const total = items.reduce(function (s, it) { return s + it.qty * it.price; }, 0);

  const piNumber = getConfig('PI Number Prefix', 'SKC-PI') + '-' +
    Utilities.formatDate(new Date(), 'GMT+7', 'yyMMdd') + '-' + row;
  const dateStr = Utilities.formatDate(new Date(), 'GMT+7', 'dd-MMM-yyyy');

  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  const signerName = getConfig('Current PI Signer Name', '');
  const signerTitle = getConfig('Current PI Signer Title', '');
  const bankName = getConfig('Bank Name', '');
  const bankAccountNo = getConfig('Bank Account No.', '');
  const bankSwift = getConfig('Bank SWIFT Code', '');
  const bankAccountName = getConfig('Bank Account Name', companyName);

  const itemRows = items.map(function (it, i) {
    return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(it.name) + '</td>' +
      '<td style="text-align:right">' + it.qty + '</td>' +
      '<td style="text-align:right">' + it.price.toFixed(2) + '</td>' +
      '<td style="text-align:right">' + (it.qty * it.price).toFixed(2) + '</td></tr>';
  }).join('');

  const html = '<html><head><style>' +
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
    '<p style="margin-top:40px;">_______________________________</p>' +
    '<p>(' + escapeHtml(signerName) + ')<br>' + escapeHtml(signerTitle) + '</p>' +
    '</div>' +
    '<p class="small">E.&amp;O.E. — Draft generated by the KU-KIT PO/PI system on ' + dateStr +
    '. Requires manual review and signature before sending to the customer.</p>' +
    '</body></html>';

  const pdfBlob = Utilities.newBlob(html, 'text/html', piNumber + '.html')
    .getAs('application/pdf').setName(piNumber + '.pdf');

  const folder = getOrCreateFolder('KU-KIT PI Documents');
  const file = folder.createFile(pdfBlob);

  const repMatch = String(order['Assigned Sales Rep'] || '').match(/<(.+)>/);
  const issuerEmail = getConfig('PI Issuer Email', '') || (repMatch ? repMatch[1] : '');
  const testMode = isTestMode();
  if (issuerEmail && !testMode) {
    MailApp.sendEmail({
      to: issuerEmail,
      subject: '[KU-KIT PI Draft] ' + piNumber + ' — ' + (order['Company'] || ''),
      body: 'A draft Proforma Invoice has been generated for PO ' + (order['PO Number'] || '') + '.\n\n' +
        'Please review, sign, and forward it to the customer.\n\nDrive link: ' + file.getUrl(),
      attachments: [pdfBlob],
      name: getConfig('Notification Sender Name', 'KU-KIT Order System')
    });
  }

  const notesCol = ORDERS_HEADERS.indexOf('Notes') + 1;
  const existingNotes = sheet.getRange(row, notesCol).getValue();
  const stamp = (testMode ? '[TEST] ' : '') + 'PI generated ' + dateStr + ': ' + file.getUrl();
  sheet.getRange(row, notesCol).setValue(existingNotes ? existingNotes + '\n' + stamp : stamp);

  // Mark the PDF as actually done — "Requested" only means someone asked
  // for it; "Generated" confirms the file exists. Set here rather than left
  // for a human, since generation either fully succeeds (we reach this
  // line) or throws above (caught by the caller, PI Stage stays "Requested"
  // so it's obvious it didn't finish).
  sheet.getRange(row, ORDERS_HEADERS.indexOf('PI Stage') + 1).setValue('Generated');

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
 * "Revision Notes" cell, if anything, so the customer knows what to fix.
 */
function notifyCustomerNeedsRevision(order) {
  const email = order['Email'];
  if (!email) return;
  const senderName = getConfig('Notification Sender Name', 'KU-KIT Order System');
  const companyName = getConfig('Company Name (for emails)', 'Siam Kubota Corporation Co., Ltd.');
  const notes = String(order['Revision Notes'] || '').trim();
  const subject = 'Your purchase order needs a correction — ' + (order['PO Number'] || '');
  const body = [
    'Dear ' + (order['Contact'] || 'Customer') + ',',
    '',
    'We reviewed your purchase order ' + (order['PO Number'] || '') + ' and it needs a correction before we can proceed.',
    notes ? ('Details: ' + notes) : 'Please contact us so we can go over the details together.',
    '',
    'Once corrected, please resubmit your order through the KU-KIT website.',
    '',
    companyName
  ].join('\n');
  MailApp.sendEmail({ to: email, subject: subject, body: body, name: senderName });
}
