if (process.env.TEST_RUN !== '1') { console.error('Run the tests with: npm test (they need their own test database).'); process.exit(1); }
const mysql = require('mysql2/promise');
const sql = async (q, params = []) => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try { const [rows] = await c.query(q, params); return rows; } finally { await c.end(); }
};
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

(async () => {
  const anon = client();
  let r = await anon('GET', '/api/reports/dashboard'); ok(r.status === 401, 'unauthenticated dashboard is 401');
  r = await anon('POST', '/api/auth/login', { email: 'admin@test.local', password: 'TestPass12345' }, {}); ok(r.status === 403, 'login without the CSRF header is refused');
  r = await anon.raw('admin@test.local', 'wrong'); ok(r.status === 401 && /Incorrect/.test(r.json.error), 'wrong password');
  r = await anon.raw('nobody@test.local', 'wrong'); ok(r.status === 401 && /Incorrect/.test(r.json.error), 'unknown email gives the same answer');
  r = await anon.raw('bad', 'x'); ok(r.status === 422, 'invalid email format');
  r = await anon('POST', '/api/auth/login', {}); ok(r.status === 422, 'empty login body');

  const admin = client();
  r = await admin.login('admin@test.local', 'TestPass12345'); ok(r.status === 200 && r.json.user.role === 'admin', 'admin login');
  ok(!JSON.stringify(r.json).includes('password') && r.json.user.mustChangePassword === false, 'no password in response; seeded admin is not forced to change');
  r = await admin('GET', '/api/auth/me'); ok(r.status === 200 && r.json.user.email === 'admin@test.local', 'me');

  const mk = async (m, u, b) => (await admin(m, u, b)).json;
  const year = (await mk('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })).id;
  const cls = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 5' })).id;
  const sec = (await mk('POST', '/api/sections', { classId: cls, name: 'A' })).id;
  const math = (await mk('POST', '/api/subjects', { name: 'Mathematics', code: 'MATH' })).id;
  const t = await mk('POST', '/api/teachers', { name: 'Tara Teacher', email: 'tara@test.local', employeeCode: 'T1' });
  const cs = (await mk('POST', '/api/class-subjects', { sectionId: sec, subjectId: math, teacherId: t.id })).id;
  const sam = await mk('POST', '/api/students', { name: 'Sam Student', email: 'sam@test.local', admissionNo: 'A1', sectionId: sec, rollNo: 1 });
  const amy = await mk('POST', '/api/students', { name: 'Amy Student', email: 'amy@test.local', admissionNo: 'A2', sectionId: sec, rollNo: 2 });
  const pat = await mk('POST', '/api/parents', { name: 'Pat Parent', email: 'pat@test.local' });
  await admin('POST', `/api/students/${sam.id}/parents`, { parentId: pat.id, relation: 'mother' });
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  await mk('POST', '/api/timetable', { classSubjectId: cs, dayOfWeek: dow, periodNo: 1, startTime: '09:00', endTime: '09:40', room: 'R1' });
  const fee = (await mk('POST', '/api/fees/structures', { classId: cls, feeType: 'Tuition fee', amount: 12000, dueDate: ahead(30) })).id;
  await mk('POST', '/api/fees/payments', { studentId: sam.id, feeStructureId: fee, amount: 5000, paidOn: ago(0), method: 'cash' });
  await mk('POST', '/api/attendance/bulk', { sectionId: sec, subjectId: math, date: ago(0), records: [{ studentId: sam.id, status: 'present' }, { studentId: amy.id, status: 'absent' }] });
  const exam = (await mk('POST', '/api/exams', { classId: cls, name: 'Unit Test 1' })).id;
  await mk('POST', `/api/exams/${exam}/schedule`, { subjectId: math, examDate: ahead(5), maxMarks: 50, passMarks: 18 });
  await mk('POST', '/api/events', { title: 'Sports Day', eventType: 'sports_day', startDate: ahead(7) });

  r = await admin('GET', '/api/reports/dashboard'); const d = r.json;
  ok(r.status === 200 && d.role === 'admin' && d.stats.students === 2 && d.stats.teachers === 1 && d.stats.classes === 1, 'admin counts ' + JSON.stringify(d.stats));
  ok(d.stats.pendingFees === 19000, 'pending fees 24000 billed - 5000 paid, got ' + d.stats.pendingFees);
  ok(d.stats.todayAttendance.present === 1 && d.stats.todayAttendance.absent === 1 && d.stats.todayAttendance.pct === 50, 'today attendance');
  ok(d.upcomingExams.length === 1 && d.charts.enrollment[0].value === 2 && d.events.length === 1, 'upcoming exam, enrollment chart and events');

  const tara = client(); await tara.login('tara@test.local', t.temporaryPassword);
  r = await tara('GET', '/api/reports/dashboard'); ok(r.status === 200 && r.json.stats.sections === 1 && r.json.stats.periodsToday === 1 && r.json.stats.studentsReached === 2, 'teacher dashboard ' + JSON.stringify(r.json.stats));
  const samC = client(); await samC.login('sam@test.local', sam.temporaryPassword);
  r = await samC('GET', '/api/reports/dashboard'); const s = r.json.student;
  ok(r.status === 200 && s.name === 'Sam Student' && s.attendancePercent === 100 && s.fees.remaining === 7000 && s.upcomingExams.length === 1 && s.className === 'Class 5', 'student dashboard ' + JSON.stringify(s));
  ok(!JSON.stringify(r.json).includes('Amy Student'), 'student dashboard never mentions another student');
  const patC = client(); await patC.login('pat@test.local', pat.temporaryPassword);
  r = await patC('GET', '/api/reports/dashboard'); ok(r.status === 200 && r.json.children.length === 1 && r.json.children[0].relation === 'mother', 'parent dashboard');

  r = await admin('POST', '/api/auth/change-password', { currentPassword: 'nope', newPassword: 'NewPass12345' }); ok(r.status === 403, 'wrong current password');
  r = await admin('POST', '/api/auth/change-password', { currentPassword: 'TestPass12345', newPassword: 'short1' }); ok(r.status === 422, 'too short');
  r = await admin('POST', '/api/auth/change-password', { currentPassword: 'TestPass12345', newPassword: 'onlyletters' }); ok(r.status === 422 && /letter and one number/.test(r.json.error), 'needs a number');
  r = await admin('POST', '/api/auth/change-password', { currentPassword: 'TestPass12345', newPassword: 'TestPass12345' }); ok(r.status === 422, 'must differ');
  r = await admin('POST', '/api/auth/change-password', { currentPassword: 'TestPass12345', newPassword: 'NewPass12345' }); ok(r.status === 200, 'change password');
  const again = client(); r = await again.login('admin@test.local', 'NewPass12345'); ok(r.status === 200, 'login with the new password');
  r = await samC('POST', '/api/auth/logout'); ok(r.status === 200, 'logout');
  r = await samC('GET', '/api/reports/dashboard'); ok(r.status === 401, 'logged-out session is dead');

  r = await again('PATCH', `/api/teachers/${t.id}/status`, { active: false }); ok(r.status === 200, 'deactivate teacher');
  r = await tara('GET', '/api/reports/dashboard'); ok(r.status === 401, 'a deactivated user is logged out at once');
  r = await client().raw('tara@test.local', 'Changed#2026x'); ok(r.status === 403, 'and cannot log in again');

  r = await anon('GET', '/api/nope'); ok(r.status === 404, 'unknown API route');
  const pg = await fetch(B + '/pages/login.html'); const html = await pg.text();
  ok(pg.status === 200 && /login-form/.test(html), 'login page served');
  ok(/script-src/.test(pg.headers.get('content-security-policy') || '') && pg.headers.get('x-content-type-options') === 'nosniff', 'security headers (CSP, nosniff)');
  for (const f of ['/js/dashboard.js', '/js/layout.js', '/js/api.js', '/js/ui.js', '/css/style.css', '/pages/dashboard.html']) ok((await fetch(B + f)).status === 200, f + ' is served');
  ok((await fetch(B + '/', { redirect: 'manual' })).status === 302, 'root redirects to login');
  ok((await fetch(B + '/.env')).status === 404 && (await fetch(B + '/backend/server.js')).status === 404 && (await fetch(B + '/uploads/x')).status === 404, 'server code, .env and uploads are not served');

  let last;
  const rl = client();
  for (let i = 0; i < 12; i++) last = await rl.raw(`x${i}@test.local`, 'bad');
  ok(last.status === 429, 'login rate limit kicks in');
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
