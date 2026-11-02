const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const mailer = require('../services/mailer.service');
const { UPLOAD_DIR } = require('../services/files.service');

router.use(requireAuth, requireRole('admin'));

router.get('/status', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  let files = 0;
  let bytes = 0;
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    if (f === '.gitkeep') continue;
    files += 1;
    bytes += fs.statSync(path.join(UPLOAD_DIR, f)).size;
  }
  res.json({
    database: 'ok',
    email: { configured: mailer.configured(), from: mailer.configured() ? process.env.SMTP_FROM : null, host: mailer.configured() ? process.env.SMTP_HOST : null },
    appUrl: mailer.appUrl(), environment: process.env.NODE_ENV || 'development', schoolName: process.env.SCHOOL_NAME || null,
    uploads: { files, bytes },
  });
}));

// Sends one email to the logged-in admin, so SMTP settings can be checked without bothering anyone else.
router.post('/test-email', asyncHandler(async (req, res) => {
  if (!mailer.configured()) throw new AppError('Email is not set up. Add the SMTP settings to .env and restart.', 409);
  try {
    await mailer.send({ to: req.user.email, subject: 'Test email from School ERP', text: 'If you can read this, email notifications are working.' });
  } catch (err) {
    throw new AppError(`The email server refused it: ${err.message}`, 502);
  }
  res.json({ ok: true, to: req.user.email });
}));

module.exports = router;
