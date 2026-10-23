const crypto = require('node:crypto');

const CATEGORIES = [
  'Product quality',
  'Damaged goods',
  'Late / missed delivery',
  'Wrong item',
  'Pricing / invoice',
  'Customer service',
  'Other',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

// Fields in the order they appear in the email. The "Key: value" block is
// deliberately plain so CRM email parsers (or a human) can map it to fields.
const FIELDS = [
  ['reference', 'Reference'],
  ['submittedAt', 'Submitted'],
  ['repName', 'Sales rep'],
  ['repEmail', 'Rep email'],
  ['customerName', 'Customer'],
  ['accountNumber', 'Account number'],
  ['contactName', 'Customer contact'],
  ['contactPhone', 'Contact phone'],
  ['orderNumber', 'Order / invoice number'],
  ['productName', 'Product'],
  ['category', 'Category'],
  ['priority', 'Priority'],
];

function makeReference(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `CMP-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip CR/LF so user input can never break out of a header line.
function oneLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function buildComplaintEmail(complaint, files, config) {
  const subject = oneLine(
    `${config.subjectPrefix} ${complaint.priority} - ${complaint.customerName} - ${complaint.category} (${complaint.reference})`
  );

  const rows = FIELDS.filter(([key]) => complaint[key]);

  const text = [
    ...rows.map(([key, label]) => `${label}: ${oneLine(complaint[key])}`),
    `Attachments: ${files.length}`,
    '',
    'Description:',
    complaint.description,
    '',
  ].join('\n');

  const htmlRows = rows
    .map(
      ([key, label]) =>
        `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top">${label}</th>` +
        `<td style="padding:4px 0">${escapeHtml(complaint[key])}</td></tr>`
    )
    .join('');

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px">` +
    `<h2 style="margin:0 0 12px">Customer complaint ${escapeHtml(complaint.reference)}</h2>` +
    `<table style="border-collapse:collapse">${htmlRows}` +
    `<tr><th align="left" style="padding:4px 12px 4px 0">Attachments</th><td>${files.length}</td></tr></table>` +
    `<h3 style="margin:16px 0 4px">Description</h3>` +
    `<p style="white-space:pre-wrap;margin:0">${escapeHtml(complaint.description)}</p></div>`;

  const attachments = files.map((file, i) => ({
    filename: `${complaint.reference}-${i + 1}${extensionFor(file.mimetype)}`,
    content: file.buffer,
    contentType: file.mimetype,
  }));

  return {
    from: config.fromEmail,
    to: config.crmEmail,
    cc: config.ccEmails.length ? config.ccEmails : undefined,
    replyTo: complaint.repEmail || undefined,
    subject,
    text,
    html,
    attachments,
  };
}

function extensionFor(mimetype) {
  return (
    {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'image/gif': '.gif',
    }[mimetype] || ''
  );
}

module.exports = { CATEGORIES, PRIORITIES, makeReference, buildComplaintEmail };
