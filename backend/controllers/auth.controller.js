const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const { validateLogin, validatePasswordChange, validatePreferences } = require('../validators/auth.validator');

const login = asyncHandler(async (req, res) => {
  const { email, password } = validateLogin(req.body);
  const user = await authService.authenticate(email, password);

  // New session id on login prevents session fixation.
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = user.id;
  await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

  const profile = await authService.getProfileIds(user);
  res.json({ user: { ...user, ...profile } });
});

const logout = asyncHandler(async (req, res) => {
  await new Promise((resolve) => req.session.destroy(resolve));
  res.clearCookie('school_erp.sid');
  res.json({ ok: true });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = validatePasswordChange(req.body);
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ ok: true });
});

const preferences = asyncHandler(async (req, res) => {
  const { emailNotifications } = validatePreferences(req.body);
  await authService.setEmailNotifications(req.user.id, emailNotifications);
  res.json({ ok: true, emailNotifications });
});

module.exports = { login, logout, me, changePassword, preferences };
