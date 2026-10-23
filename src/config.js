require('dotenv').config({ quiet: true });

// Set PROBLEM_TYPES / PRIORITIES to your own Sage CRM dropdown values so reps
// pick exactly what gets entered. Low/Normal/High is Sage's standard priority list.
const DEFAULT_PROBLEM_TYPES = [
  'Product quality',
  'Damaged goods',
  'Late / missed delivery',
  'Wrong item',
  'Pricing / invoice',
  'Customer service',
  'Other',
];
const DEFAULT_PRIORITIES = ['Low', 'Normal', 'High'];

function list(value, fallback) {
  const items = (value || '').split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

function loadConfig(env = process.env) {
  const priorities = list(env.PRIORITIES, DEFAULT_PRIORITIES);
  return {
    problemTypes: list(env.PROBLEM_TYPES, DEFAULT_PROBLEM_TYPES),
    priorities,
    defaultPriority: priorities.includes(env.DEFAULT_PRIORITY)
      ? env.DEFAULT_PRIORITY
      : priorities[Math.floor((priorities.length - 1) / 2)],
    port: Number(env.PORT) || 3000,
    // Where complaints are sent: your CRM's email-to-case / inbound address.
    crmEmail: env.CRM_EMAIL || '',
    fromEmail: env.FROM_EMAIL || env.SMTP_USER || '',
    // Optional extra recipients (comma-separated), e.g. a sales manager.
    ccEmails: (env.CC_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Optional shared code the team enters once, to stop strangers submitting.
    accessCode: env.APP_ACCESS_CODE || '',
    subjectPrefix: env.SUBJECT_PREFIX || '[Complaint]',
    maxFiles: Number(env.MAX_FILES) || 5,
    maxFileSizeMb: Number(env.MAX_FILE_SIZE_MB) || 8,
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
    },
  };
}

module.exports = { loadConfig };
