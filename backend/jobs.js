// Background housekeeping. Timers are unref'd so they never keep the process alive on their own.
const notifications = require('./services/notifications.service');

function start() {
  const isProduction = process.env.NODE_ENV === 'production'
    || process.env.RENDER === 'true'
    || Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_HOSTNAME);
  const cleanupEnabled = process.env.NOTIFICATION_CLEANUP_ENABLED === 'true'
    || (!isProduction && process.env.NOTIFICATION_CLEANUP_ENABLED !== 'false');
  const reportFailure = (name, err) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'background_job_failed',
      job: name,
      error: {
        name: err?.name || 'UnknownError',
        message: err?.message || String(err),
        code: err?.code || null,
        stack: err?.stack || null,
        causes: Array.isArray(err?.errors) ? err.errors.map((cause) => ({ message: cause.message, code: cause.code })) : [],
      },
    }));
  };
  const every = (name, ms, fn) => setInterval(() => fn().catch((err) => reportFailure(name, err)), ms).unref();
  every('notifyDueNotices', 5 * 60 * 1000, notifications.notifyDueNotices);
    if (cleanupEnabled) every('cleanupNotifications', 24 * 60 * 60 * 1000, notifications.cleanup);
  setTimeout(() => notifications.notifyDueNotices().catch((err) => reportFailure('notifyDueNotices', err)), 15 * 1000).unref();
}

module.exports = { start };
