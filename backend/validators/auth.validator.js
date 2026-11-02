const AppError = require('../utils/AppError');
const { requireEmail, requireString } = require('../utils/validate');

function validateLogin(body = {}) {
  const email = requireEmail(body.email);
  if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 200) {
    throw new AppError('Password is required.', 422);
  }
  return { email, password: body.password };
}

function validatePasswordChange(body = {}) {
  const current = requireString(body.currentPassword, 'Current password', { max: 200 });
  const next = requireString(body.newPassword, 'New password', { min: 8, max: 200 });
  if (next.length < 8) throw new AppError('New password must be at least 8 characters.', 422);
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) throw new AppError('The new password needs at least one letter and one number.', 422);
  if (current === next) throw new AppError('New password must be different from the current one.', 422);
  return { currentPassword: body.currentPassword, newPassword: body.newPassword };
}

function validatePreferences(body = {}) {
  if (typeof body.emailNotifications !== 'boolean') throw new AppError('emailNotifications must be true or false.', 422);
  return { emailNotifications: body.emailNotifications };
}

module.exports = { validateLogin, validatePasswordChange, validatePreferences };
