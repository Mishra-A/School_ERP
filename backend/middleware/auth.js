const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// Requires a valid session AND an account that is still active in the database,
// so deactivating a user takes effect immediately, not at session expiry.
const requireAuth = asyncHandler(async (req, res, next) => {
  const userId = req.session && req.session.userId;
  if (!userId) throw new AppError('Please log in to continue.', 401);

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.is_active, u.must_change_password, u.email_notifications, r.name AS role,
            COALESCE(st.id, te.id, pa.id) AS profile_id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN students st ON st.user_id = u.id
       LEFT JOIN teachers te ON te.user_id = u.id
       LEFT JOIN parents pa ON pa.user_id = u.id
      WHERE u.id = ?`,
    [userId]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    await new Promise((resolve) => req.session.destroy(resolve));
    throw new AppError('Your session has ended. Please log in again.', 401);
  }
  req.user = {
    id: user.id, name: user.name, email: user.email, role: user.role, profileId: user.profile_id || null,
    mustChangePassword: Boolean(user.must_change_password), emailNotifications: Boolean(user.email_notifications),
  };
  // A temporary password (issued by the office) must be replaced before anything else works.
  if (req.user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) {
    throw new AppError('Please set a new password to continue.', 403, 'PASSWORD_CHANGE_REQUIRED');
  }
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to do that.', 403));
  }
  next();
};

module.exports = { requireAuth, requireRole };
