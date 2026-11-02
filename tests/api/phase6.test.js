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
  const admin = client(); await admin.login('admin@test.local', 'TestPass12345');
  const mk = async (m, u, b) => (await admin(m, u, b)).json;
  const year = (await mk('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })).id;
  const cls5 = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 5' })).id;
  const cls6 = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 6' })).id;
  const secA = (await mk('POST', '/api/sections', { classId: cls5, name: 'A' })).id;
  const sec6 = (await mk('POST', '/api/sections', { classId: cls6, name: 'A' })).id;
  const math = (await mk('POST', '/api/subjects', { name: 'Mathematics', code: 'MATH' })).id;
  const t1 = await mk('POST', '/api/teachers', { name: 'Tara Teacher', email: 'tara@test.local', employeeCode: 'T1' });
  const t2 = await mk('POST', '/api/teachers', { name: 'Tom Teacher', email: 'tom@test.local', employeeCode: 'T2' });
  await mk('PUT', `/api/sections/${secA}`, { name: 'A', classTeacherId: t1.id });
  await mk('POST', '/api/class-subjects', { sectionId: secA, subjectId: math, teacherId: t1.id });
  await mk('POST', '/api/class-subjects', { sectionId: sec6, subjectId: math, teacherId: t2.id });
  const sam = await mk('POST', '/api/students', { name: 'Sam Student', email: 'sam@test.local', admissionNo: 'A1', sectionId: secA, rollNo: 1 });
  const amy = await mk('POST', '/api/students', { name: 'Amy Student', email: 'amy@test.local', admissionNo: 'A2', sectionId: secA, rollNo: 2 });
  const bee = await mk('POST', '/api/students', { name: 'Bee Student', email: 'bee@test.local', admissionNo: 'B1', sectionId: sec6, rollNo: 1 });
  const pat = await mk('POST', '/api/parents', { name: 'Pat Parent', email: 'pat@test.local' });
  const pam = await mk('POST', '/api/parents', { name: 'Pam Parent', email: 'pam@test.local' });
  await admin('POST', `/api/students/${sam.id}/parents`, { parentId: pat.id, relation: 'mother' });
  await admin('POST', `/api/students/${bee.id}/parents`, { parentId: pam.id, relation: 'father' });
  const C = {};
  for (const [k, e, u] of [['tara', 'tara@test.local', t1], ['tom', 'tom@test.local', t2], ['sam', 'sam@test.local', sam], ['amy', 'amy@test.local', amy], ['bee', 'bee@test.local', bee], ['pat', 'pat@test.local', pat], ['pam', 'pam@test.local', pam]]) {
    C[k] = client(); await C[k].login(e, u.temporaryPassword);
  }
  const titles = async (c) => (await c('GET', '/api/notifications?limit=50')).json.rows.map((n) => n.title);
  const count = async (c, t) => (await titles(c)).filter((x) => x === t).length;
  const everyone = Object.keys(C);
  let r;

  // ================= new assignment -> that section's students and parents only
  const csA = (await mk('GET', `/api/class-subjects?sectionId=${secA}`)).assignments[0].id;
  const fdata = new FormData(); fdata.append('classSubjectId', String(csA)); fdata.append('title', 'Fractions'); fdata.append('dueDate', ahead(3));
  const post = await fetch(B + '/api/assignments', { method: 'POST', headers: { 'X-Requested-With': 'fetch', cookie: '' }, body: fdata }); // unauthenticated: must not notify anyone
  ok(post.status === 401, 'unauthenticated assignment create refused');
  r = await C.tara('POST', '/api/assignments', undefined); // JSON body is not multipart: refused cleanly
  ok(r.status >= 400, 'create without form data fails cleanly');
  // multipart create through a logged-in cookie (the helper client is JSON-only, so log in once more by hand)
  const login = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ email: 'tara@test.local', password: 'Changed#2026x' }) });
  const taraCookie = login.headers.get('set-cookie').split(';')[0];
  const f2 = new FormData(); f2.append('classSubjectId', String(csA)); f2.append('title', 'Fractions'); f2.append('dueDate', ahead(3));
  r = await fetch(B + '/api/assignments', { method: 'POST', headers: { 'X-Requested-With': 'fetch', cookie: taraCookie }, body: f2 });
  ok(r.status === 201, 'teacher creates assignment ' + r.status);
  ok((await count(C.sam, 'New assignment: Fractions')) === 1 && (await count(C.amy, 'New assignment: Fractions')) === 1 && (await count(C.pat, 'New assignment: Fractions')) === 1, 'section students and parent notified');
  ok((await count(C.bee, 'New assignment: Fractions')) === 0 && (await count(C.pam, 'New assignment: Fractions')) === 0 && (await count(C.tara, 'New assignment: Fractions')) === 0 && (await count(C.tom, 'New assignment: Fractions')) === 0, 'other section, other parent and the author are not');

  // ================= notices
  const notice = (o) => admin('POST', '/api/notices', { title: 'x', description: 'y', audience: 'all', ...o });
  r = await notice({ title: 'School closed Friday' }); ok(r.status === 201, 'school-wide notice');
  ok((await Promise.all(everyone.map((k) => count(C[k], 'Notice: School closed Friday')))).every((n) => n === 1), 'a school-wide notice reaches every student, parent and teacher exactly once');
  ok((await count(admin, 'Notice: School closed Friday')) === 0, 'the admin who posted it is not notified');
  await notice({ title: 'Class 5 trip', audience: 'students', classId: cls5 });
  ok((await count(C.sam, 'Notice: Class 5 trip')) === 1 && (await count(C.amy, 'Notice: Class 5 trip')) === 1 && (await count(C.bee, 'Notice: Class 5 trip')) === 0 && (await count(C.pat, 'Notice: Class 5 trip')) === 0 && (await count(C.tara, 'Notice: Class 5 trip')) === 0, 'class + students only reaches that class\'s students');
  await notice({ title: 'Class 6 parents meet', audience: 'parents', classId: cls6 });
  ok((await count(C.pam, 'Notice: Class 6 parents meet')) === 1 && (await count(C.pat, 'Notice: Class 6 parents meet')) === 0 && (await count(C.bee, 'Notice: Class 6 parents meet')) === 0, 'class + parents only reaches that class\'s parents');
  await notice({ title: 'Staff briefing', audience: 'teachers', classId: cls5 });
  ok((await count(C.tara, 'Notice: Staff briefing')) === 1 && (await count(C.tom, 'Notice: Staff briefing')) === 0 && (await count(C.sam, 'Notice: Staff briefing')) === 0, 'class + teachers only reaches that class\'s teachers');
  r = await C.tara('POST', '/api/notices', { title: 'x' }); ok(r.status >= 400, 'sanity: JSON notice by teacher is not accepted as multipart');
  await notice({ title: 'Scheduled one', publishDate: ahead(3) });
  ok((await count(C.sam, 'Notice: Scheduled one')) === 0, 'a scheduled notice notifies nobody yet');
  await sql("UPDATE notices SET publish_date = CURDATE() WHERE title = 'Scheduled one'");
  await notice({ title: 'Trigger sweep' });
  ok((await count(C.sam, 'Notice: Scheduled one')) === 1, 'once due, the next sweep announces it');
  await notice({ title: 'Another' });
  ok((await count(C.sam, 'Notice: Scheduled one')) === 1, 'and never announces it twice');

  // ================= fees
  const fee = (await mk('POST', '/api/fees/structures', { classId: cls5, feeType: 'Tuition fee', amount: 12000, dueDate: ahead(30) })).id;
  r = await admin('POST', '/api/fees/payments', { studentId: sam.id, feeStructureId: fee, amount: 5000, paidOn: ago(0), method: 'cash' }); const p1 = r.json.id;
  ok((await count(C.sam, 'Payment received')) === 1 && (await count(C.pat, 'Payment received')) === 1 && (await count(C.amy, 'Payment received')) === 0, 'payment tells the student and parent only');
  const pn = (await C.pat('GET', '/api/notifications?limit=50')).json.rows.find((n) => n.title === 'Payment received');
  ok(/Rs\. 5000 received for Tuition fee/.test(pn.message) && /R\d+/.test(pn.message) && pn.link === '/pages/fees.html', 'payment message: ' + pn.message);
  await admin('POST', `/api/fees/payments/${p1}/void`, { reason: 'Typo' });
  ok((await count(C.sam, 'A payment was voided')) === 1 && (await count(C.pat, 'A payment was voided')) === 1, 'void is announced');
  await admin('POST', '/api/fees/payments', { studentId: sam.id, feeStructureId: fee, amount: 3000, paidOn: ago(0), method: 'upi' });

  // ================= remark, marks, attendance
  r = await C.tara('POST', '/api/remarks', { studentId: sam.id, remark: 'Very attentive.' }); ok(r.status === 201, 'remark');
  ok((await count(C.sam, 'New remark from Tara Teacher')) === 1 && (await count(C.pat, 'New remark from Tara Teacher')) === 1 && (await count(C.tara, 'New remark from Tara Teacher')) === 0, 'remark tells student and parent, not the author');

  const exam = (await mk('POST', '/api/exams', { classId: cls5, name: 'Unit Test 1', startDate: ago(5) })).id;
  const es = (await mk('POST', `/api/exams/${exam}/schedule`, { subjectId: math, examDate: ago(4), maxMarks: 50, passMarks: 18 })).id;
  const marks = (recs) => C.tara('POST', '/api/marks/bulk', { examScheduleId: es, sectionId: secA, records: recs });
  r = await marks([{ studentId: sam.id, marks: 45 }, { studentId: amy.id, marks: 10 }]); ok(r.status === 200, 'marks saved');
  ok((await count(C.sam, 'New marks: Mathematics')) === 1 && (await count(C.amy, 'New marks: Mathematics')) === 1 && (await count(C.pat, 'New marks: Mathematics')) === 1 && (await count(C.pam, 'New marks: Mathematics')) === 0, 'new marks reach the student and their parent');
  await marks([{ studentId: sam.id, marks: 46 }, { studentId: amy.id, marks: 12 }]);
  ok((await count(C.sam, 'New marks: Mathematics')) === 1, 'correcting marks does not notify again');

  const att = (status) => C.tara('POST', '/api/attendance/bulk', { sectionId: secA, subjectId: math, date: ago(0), records: [{ studentId: sam.id, status }, { studentId: amy.id, status: 'present' }] });
  await att('absent');
  ok((await count(C.pat, 'Marked absent')) === 1 && (await count(C.sam, 'Marked absent')) === 0 && (await count(C.pam, 'Marked absent')) === 0, 'absence alerts the parent only');
  const ab = (await C.pat('GET', '/api/notifications?limit=50')).json.rows.find((n) => n.title === 'Marked absent');
  ok(/Sam Student was marked absent in Mathematics/.test(ab.message), 'absence message: ' + ab.message);
  await att('absent');
  ok((await count(C.pat, 'Marked absent')) === 1, 're-saving the same absence does not repeat the alert');
  await att('present'); await att('absent');
  ok((await count(C.pat, 'Marked absent')) === 2, 'absent again after being present is a new alert');

  // ================= inactive users are skipped
  await admin('PATCH', `/api/students/${amy.id}/status`, { active: false });
  const before = (await sql('SELECT COUNT(*) AS n FROM notifications WHERE user_id = (SELECT user_id FROM students WHERE id = ?)', [amy.id]))[0].n;
  const f3 = new FormData(); f3.append('classSubjectId', String(csA)); f3.append('title', 'Decimals'); f3.append('dueDate', ahead(4));
  await fetch(B + '/api/assignments', { method: 'POST', headers: { 'X-Requested-With': 'fetch', cookie: taraCookie }, body: f3 });
  const after = (await sql('SELECT COUNT(*) AS n FROM notifications WHERE user_id = (SELECT user_id FROM students WHERE id = ?)', [amy.id]))[0].n;
  ok(before === after, 'a deactivated student gets nothing');
  await admin('PATCH', `/api/students/${amy.id}/status`, { active: true });

  // ================= reading notifications
  r = await C.sam('GET', '/api/notifications?limit=3&page=1'); ok(r.status === 200 && r.json.rows.length === 3 && r.json.total > 3 && r.json.unread === r.json.total, 'paging + unread count');
  r = await C.sam('GET', '/api/notifications/count'); const unread0 = r.json.unread; ok(unread0 > 3, 'count endpoint');
  const first = (await C.sam('GET', '/api/notifications?limit=1')).json.rows[0];
  r = await C.sam('POST', `/api/notifications/${first.id}/read`); ok(r.status === 200, 'mark one read');
  r = await C.sam('GET', '/api/notifications/count'); ok(r.json.unread === unread0 - 1, 'unread dropped by one');
  r = await C.sam('GET', '/api/notifications?unread=1&limit=50'); ok(r.json.rows.every((n) => !n.isRead) && r.json.rows.length === unread0 - 1, 'unread filter');
  const patOwn = (await C.pat('GET', '/api/notifications?limit=1')).json.rows[0];
  r = await C.sam('POST', `/api/notifications/${patOwn.id}/read`); ok(r.status === 404, "cannot touch someone else's notification");
  r = await C.pat('GET', '/api/notifications?limit=50'); ok(r.json.rows.every((n) => n.id !== first.id) && r.json.rows.find((n) => n.id === patOwn.id).isRead === false, "lists never mix users, and sam's action left pat's untouched");
  r = await C.sam('POST', '/api/notifications/read-all'); ok(r.status === 200, 'read all');
  r = await C.sam('GET', '/api/notifications/count'); ok(r.json.unread === 0, 'all read');
  r = await client()('GET', '/api/notifications'); ok(r.status === 401, 'anonymous blocked');
  r = await C.sam('POST', '/api/notifications/abc/read'); ok(r.status === 422, 'bad id');

  // ================= email settings and system status
  r = await C.sam('GET', '/api/auth/me'); ok(r.json.user.emailNotifications === true, 'email notifications on by default');
  r = await C.sam('PATCH', '/api/auth/preferences', { emailNotifications: false }); ok(r.status === 200, 'opt out');
  r = await C.sam('GET', '/api/auth/me'); ok(r.json.user.emailNotifications === false, 'preference saved');
  r = await C.sam('PATCH', '/api/auth/preferences', { emailNotifications: 'no' }); ok(r.status === 422, 'preference must be a boolean');
  r = await admin('GET', '/api/system/status'); ok(r.status === 200 && r.json.database === 'ok' && r.json.email.configured === false && r.json.uploads.files >= 0, 'system status: ' + JSON.stringify(r.json));
  r = await C.tara('GET', '/api/system/status'); ok(r.status === 403, 'teacher cannot see system status');
  r = await C.sam('POST', '/api/system/test-email'); ok(r.status === 403, 'student cannot send test email');
  r = await admin('POST', '/api/system/test-email'); ok(r.status === 409 && /not set up/.test(r.json.error), 'test email explains that SMTP is missing');

  // ================= dashboard analytics
  r = await admin('GET', '/api/reports/dashboard'); const ch = r.json.charts;
  ok(r.json.windowDays === 7, 'dashboard defaults to a 7-day window');
  r = await admin('GET', '/api/reports/dashboard?window=30'); ok(r.status === 200 && r.json.windowDays === 30, 'dashboard accepts a 30-day window');
  r = await admin('GET', '/api/reports/dashboard?window=14'); ok(r.status === 422, 'dashboard rejects unsupported date windows');
  r = await admin('GET', '/api/reports/dashboard');
  ok(ch.feeCollection.length === 6 && ch.feeCollection[5].amount === 3000 && ch.feeCollection.slice(0, 5).every((m) => m.amount === 0 || m.amount > 0), 'fee collection chart: this month = 3000 (the voided 5000 is excluded) ' + JSON.stringify(ch.feeCollection.map((m) => m.amount)));
  ok(ch.performance.length === 1 && /Unit Test 1 \(Class 5\)/.test(ch.performance[0].label) && ch.performance[0].percentage === 58, 'performance chart: (46+12)/100 = 58%: ' + JSON.stringify(ch.performance));
  const samC2 = client(); await samC2.raw('sam@test.local', 'Changed#2026x');
  r = await samC2('GET', '/api/reports/dashboard'); ok(r.json.student.performance.length === 1 && r.json.student.performance[0].percentage === 92, 'student performance trend: 46/50 = 92%: ' + JSON.stringify(r.json.student.performance));
  r = await C.pat('GET', '/api/reports/dashboard'); ok(r.json.children[0].performance.length === 1, 'parent sees the child trend');

  // ================= forced password change for temporary passwords
  const t3 = await mk('POST', '/api/teachers', { name: 'Tess Teacher', email: 'tess@test.local', employeeCode: 'T3' });
  const tess = client();
  r = await tess.raw('tess@test.local', t3.temporaryPassword); ok(r.status === 200 && r.json.user.mustChangePassword === true, 'temporary password flags the account');
  r = await tess('GET', '/api/auth/me'); ok(r.status === 200 && r.json.user.mustChangePassword === true, 'me still works');
  r = await tess('GET', '/api/reports/dashboard'); ok(r.status === 403 && r.json.code === 'PASSWORD_CHANGE_REQUIRED', 'everything else is blocked until the password is changed');
  r = await tess('GET', '/api/notifications'); ok(r.status === 403 && r.json.code === 'PASSWORD_CHANGE_REQUIRED', 'including notifications');
  r = await tess('POST', '/api/auth/change-password', { currentPassword: t3.temporaryPassword, newPassword: 'abcdefgh' }); ok(r.status === 422, 'weak new password refused');
  r = await tess('POST', '/api/auth/change-password', { currentPassword: t3.temporaryPassword, newPassword: 'Fresh#Pass99' }); ok(r.status === 200, 'password changed');
  r = await tess('GET', '/api/reports/dashboard'); ok(r.status === 200, 'access restored straight away');
  r = await tess('GET', '/api/auth/me'); ok(r.json.user.mustChangePassword === false, 'flag cleared');
  const reset = (await admin('POST', `/api/teachers/${t3.id}/reset-password`)).json;
  const tess2 = client(); r = await tess2.raw('tess@test.local', reset.temporaryPassword); ok(r.json.user.mustChangePassword === true, 'an admin reset forces a change again');
  r = await tess('GET', '/api/reports/dashboard'); ok(r.status === 200 || r.status === 403, 'old session behaviour is defined (no crash)');

  // ================= account lockout (kept last: it deliberately uses up failed attempts)
  const lock = client();
  for (let i = 0; i < 5; i++) await lock.raw('tess@test.local', 'wrong-password-' + i);
  r = await lock.raw('tess@test.local', 'Fresh#Pass99'); ok(r.status === 429 && /Too many wrong passwords/.test(r.json.error), 'five wrong passwords lock the account, even for the right password: ' + r.status);
  r = await client().raw('sam@test.local', 'Changed#2026x'); ok(r.status === 200, 'other accounts are unaffected');

  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
