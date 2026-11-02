// Background housekeeping. Timers are unref'd so they never keep the process alive on their own.
const notifications = require('./services/notifications.service');

function start() {
  const reportFailure = (name, err) => console.error(`Background job "${name}" failed:`, err?.stack || err);
  const every = (name, ms, fn) => setInterval(() => fn().catch((err) => reportFailure(name, err)), ms).unref();
  every('notifyDueNotices', 5 * 60 * 1000, notifications.notifyDueNotices);
  every('cleanupNotifications', 24 * 60 * 60 * 1000, notifications.cleanup);
  setTimeout(() => notifications.notifyDueNotices().catch((err) => reportFailure('notifyDueNotices', err)), 15 * 1000).unref();
}

module.exports = { start };
