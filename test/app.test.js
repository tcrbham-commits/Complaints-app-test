const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { loadConfig } = require('../src/config');

const config = {
  ...loadConfig({}),
  crmEmail: 'crm@example.com',
  fromEmail: 'app@example.com',
  ccEmails: ['manager@example.com'],
  accessCode: 'letmein',
  maxFiles: 2,
  maxFileSizeMb: 1,
};

const sent = [];
const transport = { sendMail: async (msg) => { sent.push(msg); return { messageId: 'x' }; } };

let server;
let baseUrl;

before(async () => {
  server = createApp({ config, transport }).listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => { sent.length = 0; });

function validForm() {
  const fd = new FormData();
  fd.append('repName', 'Sam Rep');
  fd.append('repEmail', 'sam@example.com');
  fd.append('customerName', 'Acme Ltd');
  fd.append('orderNumber', 'INV-123');
  fd.append('category', 'Damaged goods');
  fd.append('priority', 'High');
  fd.append('description', 'Pallet arrived crushed.\n<b>Customer</b> wants a credit.');
  return fd;
}

const jpeg = (size = 100) => new Blob([Buffer.alloc(size, 1)], { type: 'image/jpeg' });

function post(fd, code = 'letmein') {
  return fetch(`${baseUrl}/api/complaints`, {
    method: 'POST',
    body: fd,
    headers: code ? { 'X-Access-Code': code } : {},
  });
}

test('serves the form and options', async () => {
  const html = await (await fetch(`${baseUrl}/`)).text();
  assert.match(html, /Log a Complaint/);
  const opts = await (await fetch(`${baseUrl}/api/options`)).json();
  assert.ok(opts.categories.includes('Damaged goods'));
  assert.equal(opts.requiresAccessCode, true);
  assert.equal(opts.maxFiles, 2);
});

test('sends an email with photos to the CRM address', async () => {
  const fd = validForm();
  fd.append('photos', jpeg(), 'one.jpg');
  fd.append('photos', jpeg(), 'two.jpg');
  const res = await post(fd);
  assert.equal(res.status, 201);
  const { reference } = await res.json();
  assert.match(reference, /^CMP-\d{8}-[0-9A-F]{6}$/);

  assert.equal(sent.length, 1);
  const msg = sent[0];
  assert.equal(msg.to, 'crm@example.com');
  assert.deepEqual(msg.cc, ['manager@example.com']);
  assert.equal(msg.replyTo, 'sam@example.com');
  assert.equal(msg.subject, `[Complaint] High - Acme Ltd - Damaged goods (${reference})`);
  assert.match(msg.text, /Customer: Acme Ltd/);
  assert.match(msg.text, /Order \/ invoice number: INV-123/);
  assert.match(msg.text, /Attachments: 2/);
  assert.match(msg.html, /&lt;b&gt;Customer&lt;\/b&gt;/, 'HTML is escaped');
  assert.equal(msg.attachments.length, 2);
  assert.equal(msg.attachments[0].filename, `${reference}-1.jpg`);
});

test('rejects a wrong access code', async () => {
  assert.equal((await post(validForm(), 'nope')).status, 401);
  assert.equal((await post(validForm(), '')).status, 401);
  assert.equal(sent.length, 0);
});

test('requires mandatory fields', async () => {
  const fd = new FormData();
  fd.append('repName', 'Sam');
  const res = await post(fd);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Customer name is required/);
  assert.match(body.error, /Description is required/);
  assert.match(body.error, /category/);
  assert.equal(sent.length, 0);
});

test('rejects non-image uploads', async () => {
  const fd = validForm();
  fd.append('photos', new Blob(['hi'], { type: 'text/plain' }), 'notes.txt');
  const res = await post(fd);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /not a supported image/);
});

test('enforces photo count and size limits', async () => {
  const many = validForm();
  for (let i = 0; i < 3; i++) many.append('photos', jpeg(), `p${i}.jpg`);
  assert.equal((await post(many)).status, 400);

  const big = validForm();
  big.append('photos', jpeg(2 * 1024 * 1024), 'big.jpg');
  const res = await post(big);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /under 1 MB/);
  assert.equal(sent.length, 0);
});

test('strips newlines from the subject line', async () => {
  const fd = validForm();
  fd.set('customerName', 'Acme\r\nBcc: evil@example.com');
  assert.equal((await post(fd)).status, 201);
  assert.doesNotMatch(sent[0].subject, /[\r\n]/);
});

test('returns 502 when the email cannot be sent', async () => {
  const failing = createApp({ config, transport: { sendMail: async () => { throw new Error('smtp down'); } } }).listen(0);
  await new Promise((r) => failing.once('listening', r));
  const origError = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`http://127.0.0.1:${failing.address().port}/api/complaints`, {
      method: 'POST', body: validForm(), headers: { 'X-Access-Code': 'letmein' },
    });
    assert.equal(res.status, 502);
  } finally {
    console.error = origError;
    failing.close();
  }
});
