// Optional email via SMTP (Nodemailer). If SMTP_HOST and SMTP_FROM are not set, email is simply off:
// everything else works and nothing is sent. Sending is best-effort and never delays or fails a request.
const nodemailer = require('nodemailer');

let transport = null;

function configured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransport() {
  if (transport) return transport;
  if (!configured()) return null;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transport;
}

// For tests: swap in a fake transport.
function setTransport(t) { transport = t; }

const appUrl = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

async function send({ to, subject, text }) {
  const t = getTransport();
  if (!t) return { sent: false, reason: 'Email is not set up.' };
  await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  return { sent: true };
}

// Small in-memory queue (3 at a time) so a school-wide notice doesn't open hundreds of connections at once.
const queue = [];
let running = 0;
function pump() {
  while (running < 3 && queue.length) {
    const job = queue.shift();
    running += 1;
    send(job).catch((err) => console.error(`Email to ${job.to} failed: ${err.message}`)).finally(() => { running -= 1; pump(); });
  }
}

// messages: [{ to, subject, text }]. Adds the app link to the body.
function enqueue(messages, link) {
  if (!getTransport()) return 0;
  for (const m of messages) {
    queue.push({ ...m, text: `${m.text}${link ? `\n\nOpen: ${appUrl()}${link}` : ''}\n\n- ${process.env.SCHOOL_NAME || 'School'}` });
  }
  pump();
  return messages.length;
}

module.exports = { configured, send, enqueue, setTransport, appUrl };
