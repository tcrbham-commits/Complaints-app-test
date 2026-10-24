const crypto = require('node:crypto');

const SUMMARY_MAX = 80;

// "Case details" follows the order of the Sage CRM case screen, so whoever
// files the email can work down it field by field. Each row is
// [complaint key, label]. Labels name the Sage field where there is one.
const CASE_FIELDS = [
  ['customerName', 'Company'],
  ['accountNumber', 'Account number'],
  ['contactName', 'Person'],
  ['contactPhone', 'Phone'],
  ['orderNumber', 'Customer ref (order / invoice no.)'],
  ['productName', 'Product'],
  ['category', 'Problem type'],
  ['priority', 'Priority'],
  ['summary', 'Description'],
];

const SUBMISSION_FIELDS = [
  ['reference', 'Reference'],
  ['submittedAt', 'Submitted'],
  ['repName', 'Sales rep'],
  ['repEmail', 'Rep email'],
  ['sentTo', 'Sent to'],
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

// Sage's case Description is a single short line; fall back to the start of
// the full text when the rep didn't give a summary.
function summarise(complaint) {
  const source = oneLine(complaint.summary || complaint.description);
  return source.length > SUMMARY_MAX ? source.slice(0, SUMMARY_MAX - 1).trimEnd() + '…' : source;
}

function textSection(title, rows, complaint) {
  return [title, ...rows.map(([key, label]) => `${label}: ${oneLine(complaint[key])}`)];
}

function htmlSection(title, rows, complaint) {
  const cells = rows
    .map(
      ([key, label]) =>
        `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap">${label}</th>` +
        `<td style="padding:4px 0">${escapeHtml(complaint[key])}</td></tr>`
    )
    .join('');
  return `<h3 style="margin:16px 0 4px">${title}</h3><table style="border-collapse:collapse">${cells}</table>`;
}

// The CRM inbox is always the main recipient so every complaint reaches Sage;
// the chosen team, fixed CCs and the rep's own copy go on CC.
function ccList(complaint, config) {
  const seen = new Set([config.crmEmail.toLowerCase()]);
  const candidates = [
    complaint.recipient?.address,
    ...config.ccEmails,
    complaint.sendCopy ? complaint.repEmail : '',
  ];
  return candidates.filter((address) => {
    const key = (address || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildComplaintEmail(complaint, files, config) {
  const data = {
    ...complaint,
    summary: summarise(complaint),
    sentTo: complaint.recipient ? `${complaint.recipient.label} (and complaints inbox)` : '',
    photos: String(files.length),
  };
  const cc = ccList(complaint, config);
  const caseRows = CASE_FIELDS.filter(([key]) => data[key]);
  const submissionRows = [...SUBMISSION_FIELDS.filter(([key]) => data[key]), ['photos', 'Photos attached']];

  const subject = oneLine(
    `${config.subjectPrefix} ${data.priority} - ${data.customerName} - ${data.category} (${data.reference})`
  );

  const text = [
    ...textSection('CASE DETAILS (Sage CRM)', caseRows, data),
    '',
    'Problem note:',
    data.description,
    '',
    ...textSection('SUBMITTED BY', submissionRows, data),
    '',
  ].join('\n');

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px">` +
    `<h2 style="margin:0 0 4px">Customer complaint ${escapeHtml(data.reference)}</h2>` +
    htmlSection('Case details (Sage CRM)', caseRows, data) +
    `<h3 style="margin:16px 0 4px">Problem note</h3>` +
    `<p style="white-space:pre-wrap;margin:0">${escapeHtml(data.description)}</p>` +
    htmlSection('Submitted by', submissionRows, data) +
    `</div>`;

  const attachments = files.map((file, i) => ({
    filename: `${data.reference}-${i + 1}${extensionFor(file.mimetype)}`,
    content: file.buffer,
    contentType: file.mimetype,
  }));

  return {
    from: config.fromEmail,
    to: config.crmEmail,
    cc: cc.length ? cc : undefined,
    replyTo: data.repEmail || undefined,
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

module.exports = { makeReference, buildComplaintEmail };
