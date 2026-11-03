const fs = require('fs');
if (process.env.TEST_RUN !== '1') { console.error('Run the tests with: npm test (they need their own test database).'); process.exit(1); }
const { sql } = require('../helpers/sql');
const B = process.env.TEST_BASE_URL;
const UPLOADS = process.env.UPLOAD_DIR;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); };
const liveFiles = () => fs.readdirSync(UPLOADS).filter((f) => f !== '.gitkeep');
const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86400000));
const daysAhead = (n) => ymd(new Date(Date.now() + n * 86400000));

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
  call.form = (m, u, fd) => send(m, u, fd, true);
  call.login = async (e, p) => {
    const r = await call('POST', '/api/auth/login', { email: e, password: p });
    // Accounts created by the office start with a temporary password that must be replaced first.
    if (r.status === 200 && r.json.user.mustChangePassword) await call('POST', '/api/auth/change-password', { currentPassword: p, newPassword: 'Changed#2026x' });
    return r;
  };
  return call;
}
const fd = (fields, file) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, String(v)); if (file) f.append('file', new Blob([file.content]), file.name); return f; };
const PDF = (t = 'x') => ({ name: 'notes.pdf', content: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(t)]) });
const DOCX = (t = 'x') => ({ name: 'work.docx', content: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(t)]) });

(async () => {
  const admin = client(); await admin.login('admin@test.local', 'TestPass12345');
  const mk = async (m, u, b) => (await admin(m, u, b)).json;
  const year = (await mk('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })).id;
  const cls = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 5' })).id;
  const secA = (await mk('POST', '/api/sections', { classId: cls, name: 'A' })).id;
  const secB = (await mk('POST', '/api/sections', { classId: cls, name: 'B' })).id;
  const math = (await mk('POST', '/api/subjects', { name: 'Mathematics', code: 'MATH' })).id;
  const eng = (await mk('POST', '/api/subjects', { name: 'English', code: 'ENG' })).id;
  const t1 = await mk('POST', '/api/teachers', { name: 'Tara Teacher', email: 'tara@test.local', employeeCode: 'T1' });
  const t2 = await mk('POST', '/api/teachers', { name: 'Tom Teacher', email: 'tom@test.local', employeeCode: 'T2' });
  const csAmath = (await mk('POST', '/api/class-subjects', { sectionId: secA, subjectId: math, teacherId: t1.id })).id;
  const csAeng = (await mk('POST', '/api/class-subjects', { sectionId: secA, subjectId: eng, teacherId: t2.id })).id;
  const csBmath = (await mk('POST', '/api/class-subjects', { sectionId: secB, subjectId: math, teacherId: t2.id })).id;
  const sam = await mk('POST', '/api/students', { name: 'Sam Student', email: 'sam@test.local', admissionNo: 'A1', sectionId: secA, rollNo: 1 });
  const amy = await mk('POST', '/api/students', { name: 'Amy Student', email: 'amy@test.local', admissionNo: 'A2', sectionId: secA, rollNo: 2 });
  const bee = await mk('POST', '/api/students', { name: 'Bee Student', email: 'bee@test.local', admissionNo: 'B1', sectionId: secB, rollNo: 1 });
  const pat = await mk('POST', '/api/parents', { name: 'Pat Parent', email: 'pat@test.local' });
  await admin('POST', `/api/students/${sam.id}/parents`, { parentId: pat.id, relation: 'mother' });
  const tara = client(); await tara.login('tara@test.local', t1.temporaryPassword);
  const tom = client(); await tom.login('tom@test.local', t2.temporaryPassword);
  const samC = client(); await samC.login('sam@test.local', sam.temporaryPassword);
  const amyC = client(); await amyC.login('amy@test.local', amy.temporaryPassword);
  const beeC = client(); await beeC.login('bee@test.local', bee.temporaryPassword);
  const patC = client(); await patC.login('pat@test.local', pat.temporaryPassword);
  let r;

  // ================= teaching options
  r = await tara('GET', '/api/class-subjects/mine'); ok(r.status === 200 && r.json.options.length === 1 && r.json.options[0].subjectName === 'Mathematics', 'teacher options are only their own');
  r = await tom('GET', '/api/class-subjects/mine'); ok(r.json.options.length === 2, 'tom has two');
  r = await admin('GET', '/api/class-subjects/mine'); ok(r.json.options.length === 3, 'admin sees all');
  r = await samC('GET', '/api/class-subjects/mine'); ok(r.status === 403, 'student blocked from options');

  // ================= attendance
  const today = daysAgo(0);
  r = await tara('GET', `/api/attendance/roster?sectionId=${secA}&subjectId=${math}&date=${today}`); ok(r.status === 200 && r.json.students.length === 2 && r.json.students[0].name === 'Sam Student' && !r.json.alreadyMarked, 'roster ordered by roll');
  r = await tara('GET', `/api/attendance/roster?sectionId=${secA}&subjectId=${eng}&date=${today}`); ok(r.status === 403, "teacher can't take another teacher's subject " + r.status);
  r = await tara('GET', `/api/attendance/roster?sectionId=${secB}&subjectId=${math}&date=${today}`); ok(r.status === 403, "teacher can't take another section");
  r = await tara('GET', `/api/attendance/roster?sectionId=${secB}&subjectId=${eng}&date=${today}`); ok(r.status === 422, 'subject not taught in section 422');
  r = await tara('GET', `/api/attendance/roster?sectionId=${secA}&subjectId=${math}&date=nope`); ok(r.status === 422, 'bad date');
  r = await samC('GET', `/api/attendance/roster?sectionId=${secA}&subjectId=${math}&date=${today}`); ok(r.status === 403, 'student cannot open roster');

  const mark = (c, date, recs, sec = secA, sub = math) => c('POST', '/api/attendance/bulk', { sectionId: sec, subjectId: sub, date, records: recs });
  r = await mark(tara, today, [{ studentId: sam.id, status: 'present' }, { studentId: amy.id, status: 'absent' }]); ok(r.status === 200 && r.json.saved === 2, 'mark attendance ' + r.status);
  r = await tara('GET', `/api/attendance/roster?sectionId=${secA}&subjectId=${math}&date=${today}`); ok(r.json.alreadyMarked && r.json.students[1].status === 'absent', 'roster reflects saved');
  r = await mark(tara, today, [{ studentId: sam.id, status: 'late' }, { studentId: amy.id, status: 'absent' }]); ok(r.status === 200, 're-mark updates');
  r = await tara('GET', `/api/attendance/roster?sectionId=${secA}&subjectId=${math}&date=${today}`); ok(r.json.students[0].status === 'late', 'upsert changed status');
  r = await mark(tara, daysAhead(1), [{ studentId: sam.id, status: 'present' }]); ok(r.status === 422, 'future date blocked');
  r = await mark(tara, daysAgo(10), [{ studentId: sam.id, status: 'present' }]); ok(r.status === 403, 'teacher cannot backdate beyond window');
  r = await mark(admin, daysAgo(10), [{ studentId: sam.id, status: 'present' }, { studentId: amy.id, status: 'present' }]); ok(r.status === 200, 'admin can backdate');
  r = await mark(tara, today, [{ studentId: sam.id, status: 'sick' }]); ok(r.status === 422, 'bad status');
  r = await mark(tara, today, [{ studentId: sam.id, status: 'present' }, { studentId: sam.id, status: 'absent' }]); ok(r.status === 422, 'duplicate student');
  r = await mark(tara, today, [{ studentId: bee.id, status: 'present' }]); ok(r.status === 422, 'student from another section rejected');
  r = await mark(tara, today, []); ok(r.status === 422, 'empty records');
  r = await mark(tom, today, [{ studentId: sam.id, status: 'present' }]); ok(r.status === 403, "other teacher can't mark");
  r = await mark(samC, today, [{ studentId: sam.id, status: 'present' }]); ok(r.status === 403, 'student cannot mark own attendance');
  await mark(tara, daysAgo(1), [{ studentId: sam.id, status: 'leave' }, { studentId: amy.id, status: 'present' }]);
  await mark(tom, daysAgo(1), [{ studentId: sam.id, status: 'absent' }, { studentId: amy.id, status: 'present' }], secA, eng);

  r = await samC('GET', `/api/attendance/student/${sam.id}`);
  // sam: today late(math), 10d ago present(math), yesterday leave(math), yesterday absent(eng) => attended 2 of (2+1)=66.7
  ok(r.status === 200 && r.json.summary.total === 4 && r.json.summary.percent === 66.7 && r.json.summary.onLeave === 1, 'student summary % ' + JSON.stringify(r.json && r.json.summary));
  ok(r.json.bySubject.length === 2 && r.json.records.length === 4, 'by subject + records');
  r = await patC('GET', `/api/attendance/student/${sam.id}`); ok(r.status === 200, 'parent sees child attendance');
  r = await patC('GET', `/api/attendance/student/${bee.id}`); ok(r.status === 403, 'parent blocked from other child');
  r = await samC('GET', `/api/attendance/student/${amy.id}`); ok(r.status === 403, 'student blocked from classmate');
  r = await tara('GET', `/api/attendance/student/${bee.id}`); ok(r.status === 403, 'teacher blocked from other section student');
  r = await tara('GET', `/api/attendance/student/${sam.id}?from=${daysAgo(2)}&to=${today}`); ok(r.json.summary.total === 3, 'date range filter ' + r.json.summary.total);
  r = await tara('GET', `/api/attendance/student/${sam.id}?from=${today}&to=${daysAgo(5)}`); ok(r.status === 422, 'from after to');

  r = await tara('GET', `/api/attendance/report?sectionId=${secA}&from=${daysAgo(30)}&to=${today}`);
  ok(r.status === 200 && r.json.rows.length === 2 && r.json.rows[0].percent === 66.7 && r.json.rows[1].name === 'Amy Student' && r.json.rows[1].total === 4, 'section report ' + JSON.stringify(r.json));
  r = await tara('GET', `/api/attendance/report?sectionId=${secA}&subjectId=${eng}&from=${daysAgo(30)}&to=${today}`); ok(r.json.rows[0].total === 1 && r.json.rows[0].percent === 0, 'report filtered by subject');
  r = await tara('GET', `/api/attendance/report?sectionId=${secB}&from=${daysAgo(30)}&to=${today}`); ok(r.status === 403, "teacher can't report on other section");
  r = await admin('GET', `/api/attendance/report?sectionId=${secB}&from=${daysAgo(30)}&to=${today}`); ok(r.status === 200 && r.json.rows[0].total === 0 && r.json.rows[0].percent === null, 'admin report, no records -> null');
  r = await admin('GET', `/api/attendance/report?sectionId=${secA}&from=2020-01-01&to=${today}`); ok(r.status === 422, 'range over a year rejected');
  r = await samC('GET', `/api/attendance/report?sectionId=${secA}&from=${daysAgo(5)}&to=${today}`); ok(r.status === 403, 'student cannot run reports');

  // ================= timetable
  const tt = (c, o) => c('POST', '/api/timetable', { dayOfWeek: 1, periodNo: 1, startTime: '09:00', endTime: '09:40', room: 'R1', ...o });
  r = await tt(admin, { classSubjectId: csAmath }); ok(r.status === 201, 'timetable create ' + JSON.stringify(r.json)); const e1 = r.json.id;
  // Tom teaches B-math; Tara teaches A-math. Teacher clash needs the same teacher: Tom A-eng vs Tom B-math
  r = await tt(admin, { classSubjectId: csAeng, periodNo: 2, startTime: '09:40', endTime: '10:20' }); ok(r.status === 201, 'adjacent slot ok (A eng, Tom)'); const e2 = r.json.id;
  r = await tt(admin, { classSubjectId: csBmath, periodNo: 5, startTime: '10:00', endTime: '10:30' }); ok(r.status === 409 && /Tom Teacher is already teaching English to Class 5 - A/.test(r.json.error), 'teacher time clash message: ' + (r.json && r.json.error));
  r = await tt(admin, { classSubjectId: csBmath, periodNo: 2, startTime: '11:00', endTime: '11:40' }); ok(r.status === 409, 'teacher same period number clash ' + r.status);
  r = await tt(admin, { classSubjectId: csAeng, periodNo: 4, startTime: '09:10', endTime: '09:30' }); ok(r.status === 409 && /This section already has/.test(r.json.error), 'section time clash ' + (r.json && r.json.error));
  r = await tt(admin, { classSubjectId: csBmath, periodNo: 1, startTime: '09:00', endTime: '09:40' }); ok(r.status === 201, 'same period, different section+teacher is fine'); const e3 = r.json.id;
  r = await tt(admin, { classSubjectId: csBmath, dayOfWeek: 2, periodNo: 1, startTime: '09:00', endTime: '09:40' }); ok(r.status === 201, 'same slot on another day fine');
  r = await tt(admin, { classSubjectId: csBmath, startTime: '10:00', endTime: '09:00', periodNo: 9 }); ok(r.status === 422, 'end before start');
  r = await tt(admin, { classSubjectId: csBmath, startTime: '9am', periodNo: 9 }); ok(r.status === 422, 'bad time format');
  r = await tt(admin, { classSubjectId: csBmath, dayOfWeek: 8, periodNo: 9 }); ok(r.status === 422, 'bad day');
  r = await tt(admin, { classSubjectId: 99999, periodNo: 9 }); ok(r.status === 422, 'unknown assignment');
  r = await tt(tara, { classSubjectId: csAmath, periodNo: 8 }); ok(r.status === 403, 'teacher cannot edit timetable');
  r = await admin('PUT', `/api/timetable/${e1}`, { classSubjectId: csAmath, dayOfWeek: 1, periodNo: 1, startTime: '09:00', endTime: '09:40', room: 'R2' }); ok(r.status === 200, 'update own slot (no self clash)');
  r = await admin('PUT', `/api/timetable/${e1}`, { classSubjectId: csAmath, dayOfWeek: 1, periodNo: 2, startTime: '09:40', endTime: '10:20' }); ok(r.status === 409, 'update into a clash blocked');
  r = await admin('PUT', `/api/timetable/${e1}`, { classSubjectId: csBmath, dayOfWeek: 1, periodNo: 1, startTime: '09:00', endTime: '09:40' }); ok(r.status === 422, "can't swap in another section's subject");

  r = await tara('GET', '/api/timetable/mine'); ok(r.status === 200 && r.json.views[0].mode === 'teacher' && r.json.views[0].entries.length === 1 && r.json.views[0].entries[0].room === 'R2', 'teacher own timetable');
  r = await samC('GET', '/api/timetable/mine'); ok(r.json.views.length === 1 && r.json.views[0].entries.length === 2 && r.json.views[0].entries[0].teacherName === 'Tara Teacher', 'student sees own section ' + JSON.stringify(r.json.views[0] && r.json.views[0].entries.length));
  r = await patC('GET', '/api/timetable/mine'); ok(r.json.views.length === 1 && /Sam Student/.test(r.json.views[0].title), 'parent gets child view');
  r = await beeC('GET', '/api/timetable/mine'); ok(r.json.views[0].entries.length === 2 && r.json.views[0].entries.every((e) => e.sectionId === secB), 'bee sees section B');
  r = await admin('GET', '/api/timetable/mine'); ok(r.status === 403, 'admin uses section endpoint');
  r = await admin('GET', `/api/timetable/section/${secA}`); ok(r.status === 200 && r.json.entries.length === 2, 'admin section view');
  r = await samC('GET', `/api/timetable/section/${secA}`); ok(r.status === 200, 'student own section');
  r = await samC('GET', `/api/timetable/section/${secB}`); ok(r.status === 403, "student can't read other section");
  r = await patC('GET', `/api/timetable/section/${secB}`); ok(r.status === 403, "parent can't read other section");
  r = await tara('GET', `/api/timetable/section/${secA}`); ok(r.status === 200, 'teacher reads a section they teach');
  r = await tara('GET', `/api/timetable/section/${secB}`); ok(r.status === 403, "teacher can't read unrelated section");

  // changing a teacher moves timetable rows, and refuses if the new teacher is busy
  r = await admin('PUT', `/api/class-subjects/${csAmath}`, { teacherId: t2.id }); ok(r.status === 409, 'new teacher busy at that time (Tom has period 1 in B) -> 409 ' + r.status);
  r = await admin('DELETE', `/api/class-subjects/${csAmath}`); ok(r.status === 409 && /timetable/i.test(r.json.error), 'cannot delete assignment used in timetable');
  r = await admin('DELETE', `/api/timetable/${e3}`); ok(r.status === 200, 'delete timetable entry');
  r = await admin('PUT', `/api/class-subjects/${csAmath}`, { teacherId: t2.id }); ok(r.status === 200, 'teacher change succeeds once slot is free');
  r = await tom('GET', '/api/timetable/mine'); ok(r.json.views[0].entries.some((e) => e.subjectName === 'Mathematics' && e.sectionId === secA), 'timetable followed the new teacher');
  await admin('PUT', `/api/class-subjects/${csAmath}`, { teacherId: t1.id });
  r = await admin('DELETE', '/api/timetable/99999'); ok(r.status === 404, 'delete missing 404');

  // ================= assignments
  const before = liveFiles().length;
  const mkAsg = (c, o, file) => c.form('POST', '/api/assignments', fd({ classSubjectId: csAmath, title: 'Fractions worksheet', description: 'Do Q1-10', dueDate: daysAhead(3), ...o }, file));
  r = await mkAsg(tara, {}, PDF('worksheet')); ok(r.status === 201, 'create assignment ' + JSON.stringify(r.json)); const asg = r.json.id;
  ok(liveFiles().length === before + 1, 'file stored');
  ok(!liveFiles().some((f) => /notes/.test(f)), 'stored under random name, not the original');
  r = await mkAsg(tara, { dueDate: daysAgo(1) }, null); ok(r.status === 422, 'past due date rejected');
  r = await mkAsg(tara, { classSubjectId: csAeng }, PDF()); ok(r.status === 403, "can't post to another teacher's subject");
  ok(liveFiles().length === before + 1, 'rejected uploads leave no file behind');
  r = await mkAsg(tara, {}, { name: 'run.exe', content: Buffer.from('MZ....') }); ok(r.status === 422 && /isn't allowed/.test(r.json.error), 'exe rejected');
  r = await mkAsg(tara, {}, { name: 'fake.pdf', content: Buffer.from('this is not a pdf') }); ok(r.status === 422 && /real .pdf/.test(r.json.error), 'fake pdf rejected by signature ' + (r.json && r.json.error));
  r = await mkAsg(tara, {}, { name: 'big.pdf', content: Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(11 * 1024 * 1024)]) }); ok(r.status === 413, 'over 10MB rejected ' + r.status);
  r = await mkAsg(tara, { title: '' }, PDF()); ok(r.status === 422, 'title required');
  ok(liveFiles().length === before + 1, 'all failed uploads cleaned up ' + liveFiles().length);
  r = await mkAsg(samC, {}, PDF()); ok(r.status === 403, 'student cannot create');
  ok(liveFiles().length === before + 1, 'forbidden role never reaches disk');
  r = await mkAsg(tara, { title: 'No attachment' }, null); ok(r.status === 201, 'attachment optional'); const asgNoFile = r.json.id;

  r = await tara('GET', '/api/assignments'); ok(r.json.assignments.length === 2 && r.json.assignments[0].totalStudents === 2, 'teacher list with totals');
  r = await tom('GET', '/api/assignments'); ok(r.json.assignments.length === 0, "other teacher doesn't see it");
  r = await samC('GET', '/api/assignments'); ok(r.json.assignments.length === 2 && r.json.assignments.every((a) => a.state === 'pending'), 'student list pending');
  r = await beeC('GET', '/api/assignments'); ok(r.json.assignments.length === 0, 'other section student sees none');
  r = await patC('GET', `/api/assignments?studentId=${sam.id}`); ok(r.status === 200 && r.json.assignments.length === 2, 'parent sees child list');
  r = await patC('GET', `/api/assignments?studentId=${bee.id}`); ok(r.status === 403, 'parent blocked from other child list');
  r = await patC('GET', '/api/assignments'); ok(r.status === 422, 'parent must choose child');

  r = await samC('GET', `/api/assignments/${asg}/file`); ok(r.status === 200 && r.buf.toString().startsWith('%PDF-1.4') && /attachment/.test(r.headers.get('content-disposition')) && /Fractions worksheet\.pdf/.test(r.headers.get('content-disposition')), 'student downloads attachment ' + r.status);
  r = await beeC('GET', `/api/assignments/${asg}/file`); ok(r.status === 403, 'other section student blocked from file');
  r = await client()('GET', `/api/assignments/${asg}/file`); ok(r.status === 401, 'anonymous blocked');
  r = await samC('GET', `/api/assignments/${asgNoFile}/file`); ok(r.status === 404, 'no attachment 404');
  r = await beeC('GET', `/api/assignments/${asg}`); ok(r.status === 403, 'detail blocked for other section');
  r = await samC('GET', '/api/assignments/abc'); ok(r.status === 422, 'bad id');
  r = await fetch(B + '/uploads/' + liveFiles()[0]); ok(r.status === 404, 'uploads dir is not served statically');

  // submissions
  r = await samC.form('POST', `/api/assignments/${asg}/submit`, fd({}, DOCX('sam v1'))); ok(r.status === 200, 'student submits ' + JSON.stringify(r.json));
  const afterSubmit = liveFiles().length;
  r = await samC.form('POST', `/api/assignments/${asg}/submit`, fd({}, DOCX('sam v2'))); ok(r.status === 200 && liveFiles().length === afterSubmit, 'resubmission replaces old file (no leak)');
  r = await samC.form('POST', `/api/assignments/${asg}/submit`, fd({}, null)); ok(r.status === 422, 'file required for submit');
  r = await beeC.form('POST', `/api/assignments/${asg}/submit`, fd({}, DOCX())); ok(r.status === 403, 'other section student cannot submit');
  r = await patC.form('POST', `/api/assignments/${asg}/submit`, fd({}, DOCX())); ok(r.status === 403, 'parent cannot submit');
  r = await tara.form('POST', `/api/assignments/${asg}/submit`, fd({}, DOCX())); ok(r.status === 403, 'teacher cannot submit');
  r = await tara('GET', `/api/assignments/${asg}/submissions`); ok(r.status === 200 && r.json.rows.length === 2 && r.json.rows[0].status === 'submitted' && r.json.rows[1].submissionId === null, 'teacher sees submissions + missing');
  const subId = r.json.rows[0].submissionId;
  r = await tom('GET', `/api/assignments/${asg}/submissions`); ok(r.status === 403, 'other teacher cannot see submissions');
  r = await samC('GET', `/api/assignments/${asg}/submissions`); ok(r.status === 403, 'student cannot list submissions');
  r = await tara('GET', `/api/assignments/submissions/${subId}/file`); ok(r.status === 200 && r.buf.toString('latin1').includes('sam v2'), 'teacher downloads submission (latest version)');
  r = await samC('GET', `/api/assignments/submissions/${subId}/file`); ok(r.status === 200, 'student downloads own submission');
  r = await patC('GET', `/api/assignments/submissions/${subId}/file`); ok(r.status === 200, 'parent downloads child submission');
  r = await amyC('GET', `/api/assignments/submissions/${subId}/file`); ok(r.status === 403, 'classmate blocked from submission');
  r = await tom('GET', `/api/assignments/submissions/${subId}/file`); ok(r.status === 403, 'other teacher blocked from submission');
  r = await samC('GET', '/api/assignments'); ok(r.json.assignments.find((a) => a.id === asg).state === 'submitted', 'student sees submitted state');
  r = await tom('PUT', `/api/assignments/submissions/${subId}/review`, { feedback: 'Nice' }); ok(r.status === 403, 'other teacher cannot review');
  r = await tara('PUT', `/api/assignments/submissions/${subId}/review`, { feedback: '' }); ok(r.status === 422, 'feedback required');
  r = await tara('PUT', `/api/assignments/submissions/${subId}/review`, { feedback: 'Good work, check Q7.' }); ok(r.status === 200, 'review');
  r = await samC('GET', '/api/assignments'); const row = r.json.assignments.find((a) => a.id === asg); ok(row.state === 'reviewed' && row.feedback === 'Good work, check Q7.', 'student sees feedback');
  r = await samC.form('POST', `/api/assignments/${asg}/submit`, fd({}, DOCX('late edit'))); ok(r.status === 409, 'cannot resubmit after review');
  r = await tara('DELETE', `/api/assignments/${asg}`); ok(r.status === 409, 'cannot delete assignment with submissions');
  r = await tara.form('PUT', `/api/assignments/${asg}`, fd({ title: 'Fractions worksheet v2', description: '', dueDate: daysAhead(5) })); ok(r.status === 200, 'edit assignment');
  r = await tara('GET', `/api/assignments/${asg}`); ok(r.json.assignment.title === 'Fractions worksheet v2' && r.json.assignment.hasFile, 'edit kept the attachment');
  const n0 = liveFiles().length;
  r = await tara.form('PUT', `/api/assignments/${asg}`, fd({ title: 'Fractions worksheet v3', dueDate: daysAhead(5) }, PDF('replacement'))); ok(r.status === 200 && liveFiles().length === n0, 'replacing attachment removes the old file');
  r = await tara('DELETE', `/api/assignments/${asgNoFile}`); ok(r.status === 200, 'delete assignment without submissions');

  // ================= study material
  const mat = (c, o, file) => c.form('POST', '/api/materials', fd({ classSubjectId: csAmath, title: 'Chapter 3 notes', ...o }, file));
  r = await mat(tara, {}, PDF('chapter3')); ok(r.status === 201, 'upload material'); const m1 = r.json.id;
  r = await mat(tara, {}, null); ok(r.status === 422, 'material needs a file');
  r = await mat(tom, {}, PDF()); ok(r.status === 403, "other teacher can't upload to this subject");
  r = await mat(samC, {}, PDF()); ok(r.status === 403, 'student cannot upload');
  r = await samC('GET', '/api/materials'); ok(r.status === 200 && r.json.materials.length === 1 && r.json.materials[0].subjectName === 'Mathematics', 'student lists material');
  r = await beeC('GET', '/api/materials'); ok(r.json.materials.length === 0, 'other section sees none');
  r = await patC('GET', `/api/materials?studentId=${sam.id}`); ok(r.json.materials.length === 1, 'parent lists child material');
  r = await patC('GET', `/api/materials?studentId=${bee.id}`); ok(r.status === 403, 'parent blocked for other child');
  r = await samC('GET', `/api/materials/${m1}/file`); ok(r.status === 200 && r.buf.toString().includes('chapter3'), 'download material');
  r = await beeC('GET', `/api/materials/${m1}/file`); ok(r.status === 403, 'other section blocked from material file');
  r = await tara('GET', '/api/materials'); ok(r.json.materials.length === 1, 'teacher lists own material');
  r = await tom('DELETE', `/api/materials/${m1}`); ok(r.status === 403, 'other teacher cannot delete material');
  const n1 = liveFiles().length;
  r = await tara('DELETE', `/api/materials/${m1}`); ok(r.status === 200 && liveFiles().length === n1 - 1, 'delete removes file');

  // ================= dashboard still fine & leftovers
  r = await tara('GET', '/api/reports/dashboard'); ok(r.status === 200 && r.json.stats.periodsToday >= 0, 'teacher dashboard');
  const expected = 1 /* asg attachment (replaced) */ + 1 /* sam's submission */;
  ok(liveFiles().length === expected, `no orphan files: ${liveFiles().length} vs ${expected}`);
  console.log(`passed ${pass}, failed ${fail}`);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
