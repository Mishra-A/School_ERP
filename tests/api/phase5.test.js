const fs = require('fs');
if (process.env.TEST_RUN !== '1') { console.error('Run the tests with: npm test (they need their own test database).'); process.exit(1); }
const { sql, columnExists } = require('../helpers/sql');
const B = process.env.TEST_BASE_URL;
const UPLOADS = process.env.UPLOAD_DIR;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); };
const ymd = (d) => d.toISOString().slice(0, 10);
const ago = (n) => ymd(new Date(Date.now() - n * 86400000));
const ahead = (n) => ymd(new Date(Date.now() + n * 86400000));
const liveFiles = () => fs.readdirSync(UPLOADS).filter((f) => f !== '.gitkeep');

function client() {
  let cookie = '';
  const send = async (method, url, body, isForm) => {
    const headers = { 'X-Requested-With': 'fetch', ...(cookie ? { cookie } : {}) };
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(B + url, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    let json = null, buf = null;
    if (ct.includes('application/json')) json = await r.json(); else buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, json, buf, headers: r.headers };
  };
  const call = (m, u, b) => send(m, u, b, false);
  call.form = (m, u, f) => send(m, u, f, true);
  call.login = async (e, p) => {
    const r = await call('POST', '/api/auth/login', { email: e, password: p });
    // Accounts created by the office start with a temporary password that must be replaced first.
    if (r.status === 200 && r.json.user.mustChangePassword) await call('POST', '/api/auth/change-password', { currentPassword: p, newPassword: 'Changed#2026x' });
    return r;
  };
  return call;
}
const fd = (fields, file) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, String(v)); if (file) f.append('file', new Blob([file.content]), file.name); return f; };
const PDF = (t = 'x') => ({ name: 'circular.pdf', content: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(t)]) });

(async () => {
  const admin = client(); await admin.login('admin@test.local', 'TestPass12345');
  const mk = async (m, u, b) => (await admin(m, u, b)).json;
  const year = (await mk('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })).id;
  const cls = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 5' })).id;
  const cls6 = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 6' })).id;
  const secA = (await mk('POST', '/api/sections', { classId: cls, name: 'A' })).id;
  const sec6 = (await mk('POST', '/api/sections', { classId: cls6, name: 'A' })).id;
  const math = (await mk('POST', '/api/subjects', { name: 'Mathematics', code: 'MATH' })).id;
  const t1 = await mk('POST', '/api/teachers', { name: 'Tara Teacher', email: 'tara@test.local', employeeCode: 'T1' });
  const t2 = await mk('POST', '/api/teachers', { name: 'Tess Teacher', email: 'tess@test.local', employeeCode: 'T2' });
  await mk('POST', '/api/class-subjects', { sectionId: secA, subjectId: math, teacherId: t1.id });
  await mk('POST', '/api/class-subjects', { sectionId: sec6, subjectId: math, teacherId: t2.id });
  const sam = await mk('POST', '/api/students', { name: 'सैम Student', email: 'sam@test.local', admissionNo: 'A1', gender: 'male', sectionId: secA, rollNo: 1 });
  const amy = await mk('POST', '/api/students', { name: 'Amy Student', email: 'amy@test.local', admissionNo: 'A2', gender: 'female', sectionId: secA, rollNo: 2 });
  const cal = await mk('POST', '/api/students', { name: 'Cal Sixth', email: 'cal@test.local', admissionNo: 'C1', sectionId: sec6, rollNo: 1 });
  const pat = await mk('POST', '/api/parents', { name: 'Pat Parent', email: 'pat@test.local' });
  const pam = await mk('POST', '/api/parents', { name: 'Pam Parent', email: 'pam@test.local' });
  await admin('POST', `/api/students/${sam.id}/parents`, { parentId: pat.id, relation: 'mother' });
  await admin('POST', `/api/students/${cal.id}/parents`, { parentId: pam.id, relation: 'father' });
  const tara = client(); await tara.login('tara@test.local', t1.temporaryPassword);
  const tess = client(); await tess.login('tess@test.local', t2.temporaryPassword);
  const samC = client(); await samC.login('sam@test.local', sam.temporaryPassword);
  const amyC = client(); await amyC.login('amy@test.local', amy.temporaryPassword);
  const calC = client(); await calC.login('cal@test.local', cal.temporaryPassword);
  const patC = client(); await patC.login('pat@test.local', pat.temporaryPassword);
  const pamC = client(); await pamC.login('pam@test.local', pam.temporaryPassword);
  let r;
  ok(await columnExists('fee_payments', 'voided_at'), 'migration 002 applied');

  // ================= fee structure
  const fee = (o) => admin('POST', '/api/fees/structures', { classId: cls, feeType: 'Tuition fee', amount: 12000, dueDate: ahead(30), ...o });
  r = await fee({}); ok(r.status === 201, 'create fee'); const tuition = r.json.id;
  r = await fee({}); ok(r.status === 409 && /already has a fee/.test(r.json.error), 'dup fee type');
  r = await fee({ feeType: 'Transport', amount: 3000, dueDate: ago(10) }); ok(r.status === 201, 'second fee (overdue)'); const transport = r.json.id;
  r = await fee({ feeType: 'Bad', amount: 0 }); ok(r.status === 422, 'amount 0');
  r = await fee({ feeType: 'Bad', amount: 10.555 }); ok(r.status === 422, 'amount decimals');
  r = await fee({ feeType: '', amount: 5 }); ok(r.status === 422, 'name required');
  r = await fee({ feeType: 'Bad', dueDate: '2026-13-01' }); ok(r.status === 422, 'bad date');
  r = await fee({ classId: 9999 }); ok(r.status === 404, 'unknown class');
  r = await tara('POST', '/api/fees/structures', { classId: cls, feeType: 'X', amount: 1, dueDate: ahead(1) }); ok(r.status === 403, 'teacher cannot create fee');
  r = await tara('GET', '/api/fees/structures'); ok(r.status === 403, 'teacher cannot list fees');
  r = await samC('GET', '/api/fees/structures'); ok(r.status === 403, 'student cannot list structures');
  r = await admin('GET', '/api/fees/structures'); ok(r.status === 200 && r.json.structures.length === 2 && r.json.structures[0].students === 2 && r.json.structures.find((s) => s.id === tuition).billed === 24000, 'structure list billed = students x amount: ' + JSON.stringify(r.json.structures.map((s) => s.billed)));
  r = await admin('PUT', `/api/fees/structures/${tuition}`, { feeType: 'Tuition fee', amount: 12500, dueDate: ahead(30) }); ok(r.status === 200, 'raise amount');
  await admin('PUT', `/api/fees/structures/${tuition}`, { feeType: 'Tuition fee', amount: 12000, dueDate: ahead(30) });

  // ================= student fee view before payments
  r = await samC('GET', `/api/fees/student/${sam.id}`);
  ok(r.status === 200 && r.json.totals.total === 15000 && r.json.totals.paid === 0 && r.json.totals.remaining === 15000 && r.json.totals.overdue === 3000 && r.json.totals.nextDue === ago(10), 'student totals: ' + JSON.stringify(r.json.totals));
  ok(r.json.lines.find((l) => l.feeType === 'Transport').status === 'overdue' && r.json.lines.find((l) => l.feeType === 'Tuition fee').status === 'due', 'line statuses');
  r = await patC('GET', `/api/fees/student/${sam.id}`); ok(r.status === 200, 'parent sees child fees');
  r = await patC('GET', `/api/fees/student/${amy.id}`); ok(r.status === 403, 'parent blocked from other child');
  r = await samC('GET', `/api/fees/student/${amy.id}`); ok(r.status === 403, 'student blocked from classmate fees');
  r = await tara('GET', `/api/fees/student/${sam.id}`); ok(r.status === 403, 'teacher blocked from fees even for own student');
  r = await calC('GET', `/api/fees/student/${cal.id}`); ok(r.status === 200 && r.json.lines.length === 0 && r.json.totals.total === 0, 'class with no fees -> empty');

  // ================= payments
  const pay = (c, o) => c('POST', '/api/fees/payments', { studentId: sam.id, feeStructureId: tuition, amount: 5000, paidOn: ago(0), method: 'cash', ...o });
  r = await pay(admin, {}); ok(r.status === 201 && /^R\d{4}\d{6}$/.test(r.json.receiptNo), 'record payment ' + JSON.stringify(r.json)); const p1 = r.json.id; const rc1 = r.json.receiptNo;
  r = await pay(admin, { amount: 7500 }); ok(r.status === 409 && /more than the balance of 7000/.test(r.json.error), 'overpayment blocked');
  r = await pay(admin, { amount: 0 }); ok(r.status === 422, 'zero amount');
  r = await pay(admin, { amount: -5 }); ok(r.status === 422, 'negative amount');
  r = await pay(admin, { amount: 10.123 }); ok(r.status === 422, 'amount decimals');
  r = await pay(admin, { paidOn: ahead(2) }); ok(r.status === 422, 'future date');
  r = await pay(admin, { method: 'barter' }); ok(r.status === 422, 'bad method');
  r = await pay(admin, { studentId: cal.id }); ok(r.status === 422 && /doesn't apply/.test(r.json.error), 'fee of another class rejected');
  r = await pay(admin, { studentId: 99999 }); ok(r.status === 404, 'unknown student');
  r = await pay(admin, { feeStructureId: 99999 }); ok(r.status === 404, 'unknown fee');
  r = await pay(tara, {}); ok(r.status === 403, 'teacher cannot record');
  r = await pay(samC, {}); ok(r.status === 403, 'student cannot record');
  r = await pay(patC, {}); ok(r.status === 403, 'parent cannot record');
  r = await pay(admin, { amount: 7000 }); ok(r.status === 201, 'pay the rest'); const p2 = r.json.id;
  r = await pay(admin, { amount: 1 }); ok(r.status === 409 && /fully paid/.test(r.json.error), 'fully paid blocks more');
  r = await pay(admin, { feeStructureId: transport, amount: 1000, method: 'upi', paidOn: ago(2) }); ok(r.status === 201, 'partial transport'); const p3 = r.json.id;
  // two payments racing for the same last balance: only one may win
  const race = await Promise.all([pay(admin, { feeStructureId: transport, amount: 2000 }), pay(admin, { feeStructureId: transport, amount: 2000 })]);
  ok(race.filter((x) => x.status === 201).length === 1 && race.filter((x) => x.status === 409).length === 1, 'concurrent overpayment: exactly one succeeds ' + race.map((x) => x.status));
  r = await samC('GET', `/api/fees/student/${sam.id}`);
  ok(r.json.totals.paid === 15000 && r.json.totals.remaining === 0 && r.json.totals.nextDue === null && r.json.lines.every((l) => l.status === 'paid'), 'all paid: ' + JSON.stringify(r.json.totals));
  ok(r.json.payments.length === 4 && r.json.payments[0].receiptNo.startsWith('R'), 'payment history');
  const lastId = race.find((x) => x.status === 201).json.id;

  // ================= void
  r = await admin('POST', `/api/fees/payments/${p3}/void`, {}); ok(r.status === 422, 'void needs reason');
  r = await tara('POST', `/api/fees/payments/${p3}/void`, { reason: 'x' }); ok(r.status === 403, 'teacher cannot void');
  r = await samC('POST', `/api/fees/payments/${p3}/void`, { reason: 'x' }); ok(r.status === 403, 'student cannot void');
  r = await admin('POST', `/api/fees/payments/${p3}/void`, { reason: 'Entered by mistake' }); ok(r.status === 200, 'void payment');
  r = await admin('POST', `/api/fees/payments/${p3}/void`, { reason: 'again' }); ok(r.status === 409, 'cannot void twice');
  r = await admin('POST', '/api/fees/payments/99999/void', { reason: 'x' }); ok(r.status === 404, 'void missing 404');
  r = await samC('GET', `/api/fees/student/${sam.id}`);
  ok(r.json.totals.paid === 14000 && r.json.totals.remaining === 1000 && r.json.payments.find((p) => p.id === p3).voided === true && r.json.payments.find((p) => p.id === p3).voidReason === 'Entered by mistake', 'voided excluded from totals, kept in history: ' + JSON.stringify(r.json.totals));
  r = await admin('GET', '/api/reports/dashboard'); ok(r.json.stats.pendingFees === 1000 + 15000, 'admin dashboard pending excludes voided (1000 sam + 15000 amy) got ' + r.json.stats.pendingFees);
  r = await samC('GET', '/api/reports/dashboard'); ok(r.json.student.fees.remaining === 1000, 'student dashboard excludes voided');
  r = await admin('DELETE', `/api/fees/structures/${tuition}`); ok(r.status === 409, 'fee with payments cannot be deleted');
  r = await admin('PUT', `/api/fees/structures/${tuition}`, { feeType: 'Tuition fee', amount: 11000, dueDate: ahead(30) }); ok(r.status === 409 && /already paid 12000/.test(r.json.error), 'cannot lower below paid');
  r = await pay(admin, { feeStructureId: transport, amount: 1000 }); ok(r.status === 201, 'voided amount can be paid again');
  const gone = await fee({ feeType: 'Temp', amount: 100 }); r = await admin('DELETE', `/api/fees/structures/${gone.json.id}`); ok(r.status === 200, 'unused fee can be deleted');

  // ================= receipts
  r = await samC('GET', `/api/fees/payments/${p1}/receipt`);
  ok(r.status === 200 && r.headers.get('content-type') === 'application/pdf' && r.buf.subarray(0, 4).toString() === '%PDF' && r.headers.get('content-disposition').includes(rc1), 'student downloads receipt');
  ok(r.buf.length > 2000 && r.buf.includes('%%EOF'), 'receipt is a complete PDF (' + r.buf.length + ' bytes)');
  r = await admin('GET', `/api/fees/payments/${p3}/receipt`);
  ok(r.status === 200 && r.buf.length > 2000, 'voided receipt still renders');
  r = await patC('GET', `/api/fees/payments/${p1}/receipt`); ok(r.status === 200, 'parent downloads child receipt');
  r = await amyC('GET', `/api/fees/payments/${p1}/receipt`); ok(r.status === 403, "classmate can't read someone else's receipt");
  r = await pamC('GET', `/api/fees/payments/${p1}/receipt`); ok(r.status === 403, "other parent can't read it");
  r = await tara('GET', `/api/fees/payments/${p1}/receipt`); ok(r.status === 403, 'teacher cannot read receipts');
  r = await client()('GET', `/api/fees/payments/${p1}/receipt`); ok(r.status === 401, 'anonymous blocked');
  r = await admin('GET', '/api/fees/payments/99999/receipt'); ok(r.status === 404, 'missing receipt 404');

  // ================= admin lists
  r = await admin('GET', '/api/fees/balances'); ok(r.status === 200 && r.json.total === 2 && r.json.summary.billed === 30000, 'balances: ' + JSON.stringify(r.json.summary));
  const amyRow = r.json.rows.find((x) => x.studentId === amy.id);
  ok(amyRow.remaining === 15000 && amyRow.overdue === true, 'amy 15000 overdue, listed first (largest balance)');
  r = await admin('GET', '/api/fees/balances?status=pending'); ok(r.json.total === 1 && r.json.rows[0].name === 'Amy Student' && r.json.summary.pending === 15000, 'pending filter (only Amy owes)');
  r = await admin('GET', '/api/fees/balances?status=paid'); ok(r.json.total === 1 && r.json.rows[0].studentId === sam.id && r.json.rows[0].remaining === 0, 'paid filter (Sam cleared everything)');
  r = await admin('GET', '/api/fees/balances?search=Amy'); ok(r.json.total === 1 && r.json.rows[0].name === 'Amy Student', 'search');
  r = await admin('GET', `/api/fees/balances?sectionId=${sec6}`); ok(r.json.total === 0, 'class with no fees has no balance rows');
  r = await samC('GET', '/api/fees/balances'); ok(r.status === 403, 'student cannot list balances');
  r = await admin('GET', `/api/fees/payments?from=${ago(1)}&to=${ago(0)}`); ok(r.status === 200 && r.json.rows.length >= 3 && r.json.collected > 0, 'payments list');
  r = await admin('GET', '/api/fees/payments?search=' + encodeURIComponent(rc1)); ok(r.json.total === 1 && r.json.rows[0].id === p1, 'search by receipt number');
  r = await admin('GET', '/api/fees/payments?search=%25'); ok(r.json.total === 0, 'wildcard escaped');
  r = await tara('GET', '/api/fees/payments'); ok(r.status === 403, 'teacher cannot list payments');
  r = await admin('GET', '/api/fees/payments?from=bad'); ok(r.status === 422, 'bad date filter');

  // ================= notices
  const notice = (c, o, file) => c.form('POST', '/api/notices', fd({ title: 'Holiday on Friday', description: 'School closed.', audience: 'all', ...o }, file));
  const before = liveFiles().length;
  r = await notice(admin, {}, PDF('circular')); ok(r.status === 201, 'admin posts school-wide notice'); const nAll = r.json.id;
  ok(liveFiles().length === before + 1, 'attachment stored');
  r = await notice(admin, { title: 'Teachers only', audience: 'teachers' }); ok(r.status === 201, 'teachers-only'); const nTeach = r.json.id;
  r = await notice(admin, { title: 'Class 5 trip', audience: 'all', classId: cls }); ok(r.status === 201, 'class-specific'); const nC5 = r.json.id;
  r = await notice(admin, { title: 'Parents of class 6', audience: 'parents', classId: cls6 }); const nP6 = r.json.id;
  r = await notice(admin, { title: 'Scheduled', publishDate: ahead(3) }); ok(r.status === 201, 'scheduled'); const nFuture = r.json.id;
  r = await notice(admin, { title: '' }); ok(r.status === 422, 'title required');
  r = await notice(admin, { audience: 'martians' }); ok(r.status === 422, 'bad audience');
  r = await notice(admin, { classId: 9999 }); ok(r.status === 404, 'unknown class');
  r = await notice(admin, {}, { name: 'x.exe', content: Buffer.from('MZ') }); ok(r.status === 422, 'exe rejected');
  ok(liveFiles().length === before + 1, 'failed uploads leave no file');
  r = await notice(samC, {}); ok(r.status === 403, 'student cannot post');
  r = await notice(patC, {}); ok(r.status === 403, 'parent cannot post');
  r = await notice(tara, {}); ok(r.status === 403 && /office/.test(r.json.error), 'teacher cannot send school-wide');
  r = await notice(tara, { classId: cls6 }); ok(r.status === 403, "teacher cannot target another teacher's class");
  r = await notice(tara, { classId: cls, audience: 'teachers' }); ok(r.status === 403, 'teacher cannot target teachers');
  r = await notice(tara, { title: 'Maths test Monday', classId: cls, audience: 'students' }); ok(r.status === 201, 'teacher posts to own class'); const nT = r.json.id;

  const titles = async (c) => (await c('GET', '/api/notices')).json.rows.map((n) => n.title);
  let t = await titles(samC); ok(t.includes('Holiday on Friday') && t.includes('Class 5 trip') && t.includes('Maths test Monday') && !t.includes('Teachers only') && !t.includes('Parents of class 6') && !t.includes('Scheduled'), 'student sees: ' + t);
  t = await titles(calC); ok(t.includes('Holiday on Friday') && !t.includes('Class 5 trip') && !t.includes('Maths test Monday'), 'class 6 student: school-wide only: ' + t);
  t = await titles(patC); ok(t.includes('Holiday on Friday') && t.includes('Class 5 trip') && !t.includes('Maths test Monday') && !t.includes('Teachers only'), 'parent of class 5: ' + t);
  t = await titles(pamC); ok(t.includes('Parents of class 6') && !t.includes('Class 5 trip'), 'parent of class 6: ' + t);
  t = await titles(tara); ok(t.includes('Teachers only') && t.includes('Class 5 trip') && t.includes('Maths test Monday') && !t.includes('Parents of class 6') && !t.includes('Scheduled'), 'teacher: ' + t);
  t = await titles(tess); ok(t.includes('Teachers only') && !t.includes('Class 5 trip') && t.includes('Parents of class 6') === false, 'other teacher: ' + t);
  t = await titles(admin); ok(t.length === 6 && t.includes('Scheduled'), 'admin sees all incl. scheduled: ' + t.length);
  r = await admin('GET', '/api/notices?limit=2&page=2'); ok(r.json.rows.length === 2 && r.json.total === 6, 'notices paging');
  r = await samC('GET', `/api/notices/${nAll}/attachment`); ok(r.status === 200 && r.buf.toString().startsWith('%PDF') && /Holiday on Friday\.pdf/.test(r.headers.get('content-disposition')), 'student downloads notice attachment');
  r = await calC('GET', `/api/notices/${nC5}/attachment`); ok(r.status === 404, 'hidden notice attachment looks nonexistent');
  r = await samC('GET', `/api/notices/${nTeach}/attachment`); ok(r.status === 404, 'wrong audience cannot fetch');
  r = await samC('GET', `/api/notices/${nFuture}/attachment`); ok(r.status === 404, 'unpublished not reachable');
  r = await client()('GET', `/api/notices/${nAll}/attachment`); ok(r.status === 401, 'anonymous blocked');
  r = await samC('GET', `/api/notices/${nC5}/attachment`); ok(r.status === 404, 'notice without file -> 404');
  r = await tara('GET', '/api/notices/classes'); ok(r.json.classes.length === 1 && r.json.classes[0].name === 'Class 5', 'teacher target classes');
  r = await admin('GET', '/api/notices/classes'); ok(r.json.classes.length === 2, 'admin target classes');
  r = await samC('GET', '/api/notices/classes'); ok(r.status === 403, 'student has no target classes');
  r = await tess.form('PUT', `/api/notices/${nT}`, fd({ title: 'Hacked', description: 'x', audience: 'all', classId: cls6 })); ok(r.status === 403, "other teacher can't edit it");
  r = await tara.form('PUT', `/api/notices/${nT}`, fd({ title: 'Maths test Tuesday', description: 'moved', audience: 'students', classId: cls })); ok(r.status === 200, 'author edits');
  r = await tara.form('PUT', `/api/notices/${nAll}`, fd({ title: 'x', description: 'x', audience: 'all' })); ok(r.status === 403, "teacher can't edit admin notice");
  const n0 = liveFiles().length;
  r = await admin.form('PUT', `/api/notices/${nAll}`, fd({ title: 'Holiday on Friday', description: 'School closed.', audience: 'all' }, PDF('v2'))); ok(r.status === 200 && liveFiles().length === n0, 'replacing attachment removes old file');
  r = await tara('DELETE', `/api/notices/${nAll}`); ok(r.status === 403, "teacher can't delete admin notice");
  r = await tara('DELETE', `/api/notices/${nT}`); ok(r.status === 200, 'author deletes');
  const n1 = liveFiles().length;
  r = await admin('DELETE', `/api/notices/${nAll}`); ok(r.status === 200 && liveFiles().length === n1 - 1, 'admin delete removes file');
  r = await admin('DELETE', '/api/notices/99999'); ok(r.status === 404, 'delete missing');

  // ================= events
  const ev = (c, o) => c('POST', '/api/events', { title: 'Sports Day', eventType: 'sports_day', startDate: ahead(10), ...o });
  r = await ev(admin, {}); ok(r.status === 201, 'create event'); const e1 = r.json.id;
  r = await ev(admin, { title: 'Winter break', eventType: 'holiday', startDate: ahead(40), endDate: ahead(50) }); const e2 = r.json.id;
  r = await ev(admin, { title: 'Old PTM', eventType: 'ptm', startDate: ago(20) }); const e3 = r.json.id;
  r = await ev(admin, { title: 'Ongoing camp', eventType: 'other', startDate: ago(2), endDate: ahead(2) });
  r = await ev(admin, { title: '' }); ok(r.status === 422, 'event title required');
  r = await ev(admin, { eventType: 'party' }); ok(r.status === 422, 'bad type');
  r = await ev(admin, { startDate: ahead(5), endDate: ahead(1) }); ok(r.status === 422, 'end before start');
  r = await ev(tara, {}); ok(r.status === 403, 'teacher cannot create events');
  r = await ev(samC, {}); ok(r.status === 403, 'student cannot create events');
  r = await samC('GET', '/api/events'); ok(r.status === 200 && r.json.events.length === 3 && r.json.events[0].title === 'Ongoing camp' && !r.json.events.some((e) => e.title === 'Old PTM'), 'upcoming list incl. ongoing, excl. past: ' + JSON.stringify(r.json.events.map((e) => e.title)));
  r = await patC('GET', '/api/events?scope=past'); ok(r.json.events.length === 1 && r.json.events[0].title === 'Old PTM', 'past list');
  r = await tara('GET', '/api/events?type=holiday'); ok(r.json.events.length === 1 && r.json.events[0].title === 'Winter break', 'type filter');
  r = await client()('GET', '/api/events'); ok(r.status === 401, 'anonymous blocked');
  r = await admin('PUT', `/api/events/${e1}`, { title: 'Annual Sports Day', eventType: 'sports_day', startDate: ahead(11) }); ok(r.status === 200, 'edit event');
  r = await tara('PUT', `/api/events/${e1}`, { title: 'x', eventType: 'other', startDate: ahead(1) }); ok(r.status === 403, 'teacher cannot edit');
  r = await admin('DELETE', `/api/events/${e3}`); ok(r.status === 200, 'delete event');
  r = await admin('DELETE', '/api/events/99999'); ok(r.status === 404, 'delete missing event');
  r = await samC('GET', '/api/reports/dashboard'); ok(r.json.events.length === 3 && r.json.events.some((e) => e.title === 'Annual Sports Day'), 'dashboard carries upcoming events');
  r = await tara('GET', '/api/reports/dashboard'); ok(r.json.events.length === 3, 'teacher dashboard events');

  // ================= reports
  const rep = (c, p) => c('GET', `/api/reports/${p}`);
  r = await rep(admin, `fees?from=${ago(30)}&to=${ago(0)}`);
  ok(r.status === 200 && r.json.totals.billed === 30000 && r.json.totals.collected === 14000 + 1000 && r.json.totals.collectedInRange === 15000 && r.json.classes[0].className === 'Class 5', 'fee report totals: ' + JSON.stringify(r.json.totals));
  ok(r.json.byMethod.length >= 1 && r.json.byMonth.length >= 1, 'fee report by method / month');
  r = await rep(admin, `fees?from=${ago(30)}`); ok(r.status === 422, 'fee report needs range');
  r = await rep(samC, `fees?from=${ago(30)}&to=${ago(0)}`); ok(r.status === 403, 'student blocked from fee report');
  r = await rep(tara, `fees?from=${ago(30)}&to=${ago(0)}`); ok(r.status === 403, 'teacher blocked from fee report');
  r = await rep(admin, 'enrollment'); ok(r.status === 200 && r.json.totals.total === 3 && r.json.totals.male === 1 && r.json.totals.female === 1 && r.json.totals.unspecified === 1 && r.json.sections.length === 2, 'enrollment report: ' + JSON.stringify(r.json.totals));
  r = await rep(tara, 'enrollment'); ok(r.status === 403, 'teacher blocked from enrollment report');
  // attendance + exam data
  await admin('POST', '/api/attendance/bulk', { sectionId: secA, subjectId: math, date: ago(1), records: [{ studentId: sam.id, status: 'present' }, { studentId: amy.id, status: 'absent' }] });
  r = await rep(admin, `attendance?from=${ago(7)}&to=${ago(0)}`);
  const a5 = r.json.sections.find((s) => s.label === 'Class 5 - A');
  ok(r.status === 200 && a5.students === 2 && a5.records === 2 && a5.percent === 50 && a5.lowAttendance === 1, 'attendance report: ' + JSON.stringify(a5));
  ok(r.json.sections.find((s) => s.label === 'Class 6 - A').percent === null, 'no records -> null percent');
  r = await rep(tara, `attendance?from=${ago(7)}&to=${ago(0)}`); ok(r.status === 403, 'teacher blocked from attendance report');
  r = await rep(admin, `attendance?from=${ago(900)}&to=${ago(0)}`); ok(r.status === 422, 'range over a year');
  const exam = (await mk('POST', '/api/exams', { classId: cls, name: 'Unit Test 1', startDate: ago(5) })).id;
  const es = (await mk('POST', `/api/exams/${exam}/schedule`, { subjectId: math, examDate: ago(4), maxMarks: 50, passMarks: 18 })).id;
  await tara('POST', '/api/marks/bulk', { examScheduleId: es, sectionId: secA, records: [{ studentId: sam.id, marks: 45 }, { studentId: amy.id, marks: 10 }] });
  r = await rep(admin, `exam/${exam}`);
  ok(r.status === 200 && r.json.sections[0].students === 2 && r.json.sections[0].passed === 1 && r.json.sections[0].failed === 1 && r.json.sections[0].averagePercent === 55 && r.json.sections[0].highestPercent === 90, 'exam report section: ' + JSON.stringify(r.json.sections[0]));
  ok(r.json.subjects[0].subjectName === 'Mathematics' && r.json.subjects[0].passRate === 50 && r.json.subjects[0].averagePercent === 55, 'exam report subject: ' + JSON.stringify(r.json.subjects[0]));
  r = await rep(admin, 'exam/99999'); ok(r.status === 404, 'exam report 404');
  r = await rep(samC, `exam/${exam}`); ok(r.status === 403, 'student blocked from exam report');

  // leftovers
  const expected = 1; // admin notice's replaced attachment was deleted with the notice; nothing else stored
  ok(liveFiles().length === 0 || liveFiles().length === expected - 1, 'no orphan files: ' + liveFiles().length);
  console.log(`passed ${pass}, failed ${fail}`);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
