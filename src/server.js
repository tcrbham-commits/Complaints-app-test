const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { loadConfig } = require('./config');
const { makeReference, buildComplaintEmail } = require('./email');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = {
  repName: 100,
  repEmail: 200,
  customerName: 150,
  accountNumber: 50,
  contactName: 100,
  contactPhone: 40,
  orderNumber: 60,
  productName: 150,
  summary: 80,
  description: 5000,
};

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function validate(body, config) {
  const errors = [];
  const complaint = {};

  for (const [key, max] of Object.entries(LIMITS)) {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (value.length > max) errors.push(`${key} is too long (max ${max} characters)`);
    complaint[key] = value;
  }

  if (!complaint.repName) errors.push('Your name is required');
  if (!complaint.customerName) errors.push('Customer name is required');
  if (!complaint.description) errors.push('Description is required');
  if (complaint.repEmail && !EMAIL_RE.test(complaint.repEmail)) errors.push('Your email address is not valid');

  complaint.category = config.problemTypes.includes(body.category) ? body.category : '';
  if (!complaint.category) errors.push('Choose a problem type');

  complaint.priority = config.priorities.includes(body.priority) ? body.priority : config.defaultPriority;

  return { complaint, errors };
}

function createApp({ config = loadConfig(), transport } = {}) {
  const mailer = transport || createTransport(config);
  const app = express();
  app.disable('x-powered-by');

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: config.maxFiles,
      fileSize: config.maxFileSizeMb * 1024 * 1024,
      fields: 30,
    },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
      const err = new Error(`"${file.originalname}" is not a supported image type`);
      err.status = 400;
      cb(err);
    },
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/options', (req, res) => {
    res.json({
      problemTypes: config.problemTypes,
      priorities: config.priorities,
      defaultPriority: config.defaultPriority,
      maxFiles: config.maxFiles,
      maxFileSizeMb: config.maxFileSizeMb,
      requiresAccessCode: Boolean(config.accessCode),
    });
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  const checkAccess = (req, res, next) => {
    if (!config.accessCode) return next();
    if (safeEqual(req.get('x-access-code') || '', config.accessCode)) return next();
    res.status(401).json({ error: 'Invalid or missing team access code' });
  };

  app.post('/api/complaints', checkAccess, upload.array('photos', config.maxFiles), async (req, res, next) => {
    try {
      const { complaint, errors } = validate(req.body || {}, config);
      if (errors.length) return res.status(400).json({ error: errors.join('. '), errors });

      const now = new Date();
      complaint.reference = makeReference(now);
      complaint.submittedAt = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

      const message = buildComplaintEmail(complaint, req.files || [], config);
      await mailer.sendMail(message);

      res.status(201).json({ reference: complaint.reference });
    } catch (err) {
      next(err);
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: `Each photo must be under ${config.maxFileSizeMb} MB`,
        LIMIT_FILE_COUNT: `You can attach up to ${config.maxFiles} photos`,
        LIMIT_UNEXPECTED_FILE: `You can attach up to ${config.maxFiles} photos`,
      };
      return res.status(400).json({ error: messages[err.code] || err.message });
    }
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('Failed to send complaint:', err);
    res.status(502).json({ error: 'Could not send the complaint email. Please try again.' });
  });

  return app;
}

if (require.main === module) {
  const config = loadConfig();
  const missing = ['crmEmail', 'fromEmail'].filter((k) => !config[k]);
  if (!config.smtp.host) missing.push('SMTP_HOST');
  if (missing.length) {
    console.error(`Missing required configuration: ${missing.join(', ')}. See .env.example.`);
    process.exit(1);
  }
  createApp({ config }).listen(config.port, () => {
    console.log(`Complaints app listening on http://localhost:${config.port}`);
    console.log(`Complaints will be emailed to ${config.crmEmail}`);
  });
}

module.exports = { createApp, validate };
