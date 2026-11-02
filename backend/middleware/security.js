const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed login attempts. Try again in 15 minutes.' },
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password change attempts. Try again in 15 minutes.' },
});

// CSRF defence: browsers cannot attach a custom header cross-site without a CORS
// preflight, so requiring it on state-changing requests blocks forged form posts.
function requireXhrHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') {
    return next(new AppError('Invalid request origin.', 403));
  }
  next();
}

module.exports = { apiLimiter, loginLimiter, passwordLimiter, requireXhrHeader };
