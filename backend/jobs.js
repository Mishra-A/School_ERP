// Background housekeeping. Timers are unref'd so they never keep the process alive on their own.
const notifications = require('./services/notifications.service');

function start() {
  const every = (ms, fn) => setInterval(() => fn().catch((e) => console.error('job failed:', e.message)), ms).unref();
  every(5 * 60 * 1000, notifications.notifyDueNotices);   // scheduled notices reach people on their publish date
  every(24 * 60 * 60 * 1000, notifications.cleanup);      // trim old notifications
  setTimeout(() => notifications.notifyDueNotices().catch((e) => console.error('job failed:', e.message)), 15 * 1000).unref();
}

module.exports = { start };
