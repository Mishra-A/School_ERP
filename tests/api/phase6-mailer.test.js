if (process.env.TEST_RUN !== '1') { console.error('Run the tests with: npm test (they need their own test database).'); process.exit(1); }
const { sql } = require('../helpers/sql');
const B = process.env.TEST_BASE_URL;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); };
const ymd = (d) => d.toISOString().slice(0, 10);
const ago = (n) => ymd(new Date(Date.now() - n * 86400000));
const ahead = (n) => ymd(new Date(Date.now() + n * 86400000));

function client() {
  let cookie = '';
  const call = async (method, url, body, headers = { 'X-Requested-With': 'fetch' }) => {
    const h = { ...headers, ...(cookie ? { cookie } : {}) };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(B + url, { method, redirect: 'manual', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, json, headers: r.headers };
  };
  call.raw = (e, p) => call('POST', '/api/auth/login', { email: e, password: p });
  // Accounts created by the office start with a temporary password that must be replaced first.
  call.login = async (e, p) => {
    const r = await call.raw(e, p);
    if (r.status === 200 && r.json.user.mustChangePassword) await call('POST', '/api/auth/change-password', { currentPassword: p, newPassword: 'Changed#2026x' });
    return r;
  };
  return call;
}
const finish = () => { console.log(`passed ${pass}, failed ${fail}`); };

// Unit tests for the email and notification plumbing, using a fake mail server.
const mailer = require('../../backend/services/mailer.service');
const notifications = require('../../backend/services/notifications.service');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  ok(mailer.configured() === false, 'email is off when SMTP is not configured');
  let r = await mailer.send({ to: 'a@x.com', subject: 's', text: 't' });
  ok(r.sent === false, 'sending is a no-op when email is off');
  ok(mailer.enqueue([{ to: 'a@x.com', subject: 's', text: 't' }]) === 0, 'queueing is a no-op when email is off');

  const outbox = [];
  let inFlight = 0, maxInFlight = 0, failNext = false;
  mailer.setTransport({ sendMail: async (m) => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    await sleep(25);
    inFlight -= 1;
    if (failNext) { failNext = false; throw new Error('SMTP down'); }
    outbox.push(m);
  } });
  process.env.SMTP_FROM = 'School <noreply@school.test>';
  process.env.SCHOOL_NAME = 'Test School';
  process.env.APP_URL = 'https://erp.school.test/';

  // real users for the notification tests
  const role = (await sql("SELECT id FROM roles WHERE name = 'student'"))[0].id;
  const mkUser = async (name, email, { active = 1, emailOn = 1 } = {}) =>
    (await sql('INSERT INTO users (role_id, name, email, password_hash, is_active, email_notifications) VALUES (?, ?, ?, ?, ?, ?)', [role, name, email, 'x', active, emailOn])).insertId;
  const u1 = await mkUser('One', 'one@school.test');
  const u2 = await mkUser('Two', 'two@school.test', { emailOn: 0 });
  const u3 = await mkUser('Three', 'three@school.test', { active: 0 });

  const n = await notifications.notifyUsers([u1, u2, u3, u1, null], { title: 'Hello', message: 'Body text', link: '/pages/notices.html' });
  ok(n === 2, 'only active users are notified (and duplicates collapse): ' + n);
  await sleep(200);
  ok((await sql('SELECT COUNT(*) AS n FROM notifications WHERE user_id IN (?, ?, ?)', [u1, u2, u3]))[0].n === 2, 'in-app rows for u1 and u2, none for the inactive u3');
  ok(outbox.length === 1 && outbox[0].to === 'one@school.test', 'email goes only to users who have not opted out: ' + outbox.map((m) => m.to));
  ok(outbox[0].subject === 'Hello' && outbox[0].from === 'School <noreply@school.test>', 'subject and sender');
  ok(outbox[0].text.includes('Body text') && outbox[0].text.includes('Open: https://erp.school.test/pages/notices.html') && outbox[0].text.includes('Test School'), 'body has the message, a working link (no double slash) and the school name');

  outbox.length = 0;
  await notifications.notifyUsers([u1], { title: 'Quiet', message: 'm', email: false });
  await sleep(100);
  ok(outbox.length === 0, 'email: false sends no email');
  ok((await notifications.notifyUsers([u1], { title: 'Skip me' }, { excludeUserId: u1 })) === 0, 'the actor is excluded');

  for (let i = 0; i < 9; i++) mailer.enqueue([{ to: `bulk${i}@school.test`, subject: 'Bulk', text: 'b' }]);
  await sleep(400);
  ok(outbox.length === 9 && maxInFlight <= 3, `a burst of 9 emails is delivered with at most 3 at a time (peak ${maxInFlight})`);

  outbox.length = 0; failNext = true;
  mailer.enqueue([{ to: 'bad@school.test', subject: 'Fails', text: 'x' }, { to: 'good@school.test', subject: 'Works', text: 'y' }]);
  await sleep(200);
  ok(outbox.length === 1 && outbox[0].to === 'good@school.test', 'one failing email never stops the others (and does not throw)');

  const bad = await notifications.safely(async () => { throw new Error('boom'); });
  ok(bad === 0, 'safely() swallows errors from notification code');
  finish();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
