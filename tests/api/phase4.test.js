const fs = require('fs');
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
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86400000));
const daysAhead = (n) => ymd(new Date(Date.now() + n * 86400000));

function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const headers = { 'X-Requested-With': 'fetch', ...(cookie ? { cookie } : {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(B + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    let json = null, buf = null;
    if (ct.includes('application/json')) json = await r.json(); else buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, json, buf, headers: r.headers };
  };
  call.login = async (e, p) => {
    const r = await call('POST', '/api/auth/login', { email: e, password: p });
    // Accounts created by the office start with a temporary password that must be replaced first.
    if (r.status === 200 && r.json.user.mustChangePassword) await call('POST', '/api/auth/change-password', { currentPassword: p, newPassword: 'Changed#2026x' });
    return r;
  };
  return call;
}

(async () => {
  const admin = client(); await admin.login('admin@test.local', 'TestPass12345');
  const mk = async (m, u, b) => (await admin(m, u, b)).json;
  const year = (await mk('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })).id;
  const cls = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 5' })).id;
  const cls6 = (await mk('POST', '/api/classes', { academicYearId: year, name: 'Class 6' })).id;
  const secA = (await mk('POST', '/api/sections', { classId: cls, name: 'A' })).id;
  const secB = (await mk('POST', '/api/sections', { classId: cls, name: 'B' })).id;
  const sec6 = (await mk('POST', '/api/sections', { classId: cls6, name: 'A' })).id;
  const math = (await mk('POST', '/api/subjects', { name: 'Mathematics', code: 'MATH' })).id;
  const eng = (await mk('POST', '/api/subjects', { name: 'English', code: 'ENG' })).id;
  const sci = (await mk('POST', '/api/subjects', { name: 'Science', code: 'SCI' })).id;
  const t1 = await mk('POST', '/api/teachers', { name: 'Tara Teacher', email: 'tara@test.local', employeeCode: 'T1' });
  const t2 = await mk('POST', '/api/teachers', { name: 'Tom Teacher', email: 'tom@test.local', employeeCode: 'T2' });
  const t3 = await mk('POST', '/api/teachers', { name: 'Tess Teacher', email: 'tess@test.local', employeeCode: 'T3' });
  await mk('PUT', `/api/sections/${secA}`, { name: 'A', classTeacherId: t1.id });
  await mk('POST', '/api/class-subjects', { sectionId: secA, subjectId: math, teacherId: t1.id });
  await mk('POST', '/api/class-subjects', { sectionId: secA, subjectId: eng, teacherId: t2.id });
  await mk('POST', '/api/class-subjects', { sectionId: secB, subjectId: math, teacherId: t2.id });
  await mk('POST', '/api/class-subjects', { sectionId: secB, subjectId: eng, teacherId: t2.id });
  await mk('POST', '/api/class-subjects', { sectionId: sec6, subjectId: sci, teacherId: t3.id });
  const sam = await mk('POST', '/api/students', { name: 'सैम Student', email: 'sam@test.local', admissionNo: 'A1', sectionId: secA, rollNo: 1 });
  const amy = await mk('POST', '/api/students', { name: 'Amy Student', email: 'amy@test.local', admissionNo: 'A2', sectionId: secA, rollNo: 2 });
  const bee = await mk('POST', '/api/students', { name: 'Bee Student', email: 'bee@test.local', admissionNo: 'B1', sectionId: secB, rollNo: 1 });
  const cal = await mk('POST', '/api/students', { name: 'Cal Sixth', email: 'cal@test.local', admissionNo: 'C1', sectionId: sec6, rollNo: 1 });
  const pat = await mk('POST', '/api/parents', { name: 'Pat Parent', email: 'pat@test.local' });
  await admin('POST', `/api/students/${sam.id}/parents`, { parentId: pat.id, relation: 'mother' });
  const tara = client(); await tara.login('tara@test.local', t1.temporaryPassword);
  const tom = client(); await tom.login('tom@test.local', t2.temporaryPassword);
  const tess = client(); await tess.login('tess@test.local', t3.temporaryPassword);
  const samC = client(); await samC.login('sam@test.local', sam.temporaryPassword);
  const amyC = client(); await amyC.login('amy@test.local', amy.temporaryPassword);
  const beeC = client(); await beeC.login('bee@test.local', bee.temporaryPassword);
  const calC = client(); await calC.login('cal@test.local', cal.temporaryPassword);
  const patC = client(); await patC.login('pat@test.local', pat.temporaryPassword);
  let r;

  const col = [String((await sql("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'marks' AND column_name = 'is_absent'"))[0].n), String((await sql('SELECT COUNT(*) AS n FROM schema_migrations'))[0].n)];
  ok(col[0] === '1' && Number(col[1]) >= 2, 'migrations applied ' + col.join(','));

  // ===== grade scale
  r = await samC('GET', '/api/grades'); ok(r.status === 200 && r.json.grades[0].grade === 'A+' && r.json.grades.length === 7, 'default grade scale readable by anyone');
  r = await tara('PUT', '/api/grades', { grades: [{ grade: 'P', minPercent: 0 }, { grade: 'D', minPercent: 50 }] }); ok(r.status === 403, 'teacher cannot edit scale');
  r = await admin('PUT', '/api/grades', { grades: [{ grade: 'A', minPercent: 50 }, { grade: 'B', minPercent: 10 }] }); ok(r.status === 422 && /0%/.test(r.json.error), 'scale must reach 0');
  r = await admin('PUT', '/api/grades', { grades: [{ grade: 'A', minPercent: 50 }, { grade: 'a', minPercent: 0 }] }); ok(r.status === 422, 'duplicate grade name');
  r = await admin('PUT', '/api/grades', { grades: [{ grade: 'A', minPercent: 50 }, { grade: 'B', minPercent: 50 }, { grade: 'C', minPercent: 0 }] }); ok(r.status === 422, 'duplicate boundary');
  r = await admin('PUT', '/api/grades', { grades: [{ grade: 'A', minPercent: 150 }, { grade: 'B', minPercent: 0 }] }); ok(r.status === 422, 'percent over 100');

  // ===== exams
  r = await admin('POST', '/api/exams', { classId: cls, name: 'Unit Test 1', startDate: daysAgo(5), endDate: daysAgo(3) }); ok(r.status === 201, 'create exam'); const ex = r.json.id;
  r = await admin('POST', '/api/exams', { classId: cls, name: 'Unit Test 1' }); ok(r.status === 409 && /already has an exam/.test(r.json.error), 'dup exam name');
  r = await admin('POST', '/api/exams', { classId: cls, name: 'X', startDate: daysAgo(1), endDate: daysAgo(5) }); ok(r.status === 422, 'end before start');
  r = await admin('POST', '/api/exams', { classId: 9999, name: 'X' }); ok(r.status === 404, 'unknown class');
  r = await tara('POST', '/api/exams', { classId: cls, name: 'Hack' }); ok(r.status === 403, 'teacher cannot create exam');
  const sched = (o) => admin('POST', `/api/exams/${ex}/schedule`, { subjectId: math, examDate: daysAgo(4), startTime: '09:00', maxMarks: 50, passMarks: 18, ...o });
  r = await sched({}); ok(r.status === 201, 'schedule math'); const esMath = r.json.id;
  r = await sched({}); ok(r.status === 409 && /already scheduled/.test(r.json.error), 'dup subject in exam');
  r = await sched({ subjectId: sci }); ok(r.status === 422 && /isn't taught/.test(r.json.error), 'subject not taught in class');
  r = await sched({ subjectId: eng, passMarks: 60 }); ok(r.status === 422, 'pass > max');
  r = await sched({ subjectId: eng, maxMarks: 0 }); ok(r.status === 422, 'max 0');
  r = await sched({ subjectId: eng, maxMarks: 50.123 }); ok(r.status === 422, 'too many decimals');
  r = await sched({ subjectId: eng, examDate: '2026-02-30' }); ok(r.status === 422, 'bad date');
  r = await sched({ subjectId: eng, examDate: daysAhead(10) }); ok(r.status === 201, 'schedule english (future)'); const esEng = r.json.id;
  r = await tara('POST', `/api/exams/${ex}/schedule`, { subjectId: math, examDate: daysAgo(1), maxMarks: 10, passMarks: 3 }); ok(r.status === 403, 'teacher cannot schedule');

  r = await tara('GET', '/api/exams'); ok(r.status === 200 && r.json.exams.length === 1 && r.json.exams[0].subjectCount === 2, 'teacher sees exams of classes they teach');
  r = await tess('GET', '/api/exams'); ok(r.json.exams.length === 0, "Class 6 teacher doesn't see Class 5 exam");
  r = await tess('GET', `/api/exams/${ex}`); ok(r.status === 403, 'unrelated teacher blocked from exam');
  r = await admin('GET', '/api/exams'); ok(r.json.exams.length === 1, 'admin list');
  r = await samC('GET', '/api/exams/mine'); ok(r.status === 200 && r.json.exams.length === 1 && r.json.exams[0].schedule.length === 2 && r.json.exams[0].upcoming === true, 'student date sheet');
  r = await patC('GET', `/api/exams/mine?studentId=${sam.id}`); ok(r.status === 200 && r.json.exams.length === 1, 'parent date sheet');
  r = await patC('GET', `/api/exams/mine?studentId=${bee.id}`); ok(r.status === 403, 'parent blocked for other child');
  r = await patC('GET', '/api/exams/mine'); ok(r.status === 422, 'parent must choose child');
  r = await calC('GET', `/api/exams/${ex}`); ok(r.status === 403, 'other class student blocked from exam');
  r = await samC('GET', `/api/exams/${ex}`); ok(r.status === 200 && r.json.schedule[0].marksCount === undefined, 'student can view exam, no staff-only fields');
  r = await samC('GET', '/api/exams'); ok(r.status === 403, 'student cannot list all exams');

  // ===== marks entry
  r = await tara('GET', '/api/marks/options'); ok(r.status === 200 && r.json.options.length === 1 && r.json.options[0].subjectName === 'Mathematics' && r.json.options[0].sectionId === secA, 'teacher options only own subject: ' + JSON.stringify(r.json.options && r.json.options.length));
  r = await tom('GET', '/api/marks/options'); ok(r.json.options.length === 3, 'tom: english A, math B, english B = 3, got ' + r.json.options.length);
  r = await samC('GET', '/api/marks/options'); ok(r.status === 403, 'student blocked from marks options');
  r = await tara('GET', `/api/marks/sheet?examScheduleId=${esMath}&sectionId=${secA}`); ok(r.status === 200 && r.json.students.length === 2 && r.json.subject.maxMarks === 50 && r.json.students[0].marks === null, 'marks sheet');
  r = await tara('GET', `/api/marks/sheet?examScheduleId=${esMath}&sectionId=${secB}`); ok(r.status === 403, "can't open other section (tom's math)");
  r = await tara('GET', `/api/marks/sheet?examScheduleId=${esEng}&sectionId=${secA}`); ok(r.status === 403, "can't open other teacher's subject");
  r = await tara('GET', `/api/marks/sheet?examScheduleId=${esMath}&sectionId=${sec6}`); ok(r.status === 422, 'section from another class');
  const save = (c, es, sec, recs) => c('POST', '/api/marks/bulk', { examScheduleId: es, sectionId: sec, records: recs });
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 51 }]); ok(r.status === 422 && /maximum of 50/.test(r.json.error), 'over max');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: -1 }]); ok(r.status === 422, 'negative');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 12.345 }]); ok(r.status === 422, '3 decimals');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 'abc' }]); ok(r.status === 422, 'non numeric');
  r = await save(tara, esMath, secA, [{ studentId: bee.id, marks: 30 }]); ok(r.status === 422 && /not in this section/.test(r.json.error), 'student from other section');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 30 }, { studentId: sam.id, marks: 31 }]); ok(r.status === 422, 'duplicate student');
  r = await save(tom, esMath, secA, [{ studentId: sam.id, marks: 30 }]); ok(r.status === 403, "tom can't enter tara's marks");
  r = await save(samC, esMath, secA, [{ studentId: sam.id, marks: 50 }]); ok(r.status === 403, 'student cannot enter marks');
  r = await save(tom, esEng, secA, [{ studentId: sam.id, marks: 15 }]); ok(r.status === 422 && /taken place/.test(r.json.error), 'future exam blocked');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 45 }, { studentId: amy.id, absent: true, marks: 40 }]); ok(r.status === 200 && r.json.saved === 2, 'save marks (absent ignores marks)');
  r = await tara('GET', `/api/marks/sheet?examScheduleId=${esMath}&sectionId=${secA}`); ok(r.json.students[0].marks === 45 && r.json.students[1].absent === true && r.json.students[1].marks === 0, 'sheet shows saved + absent');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 44.5 }, { studentId: amy.id, marks: '' }]); ok(r.status === 200, 'update + clear');
  r = await tara('GET', `/api/marks/sheet?examScheduleId=${esMath}&sectionId=${secA}`); ok(r.json.students[0].marks === 44.5 && r.json.students[1].marks === null && r.json.students[1].absent === false, 'blank cleared the entry');
  r = await save(tara, esMath, secA, [{ studentId: sam.id, marks: 45 }, { studentId: amy.id, absent: true }]);
  // english: admin moves the date to the past, tom enters
  r = await admin('PUT', `/api/exams/schedule/${esEng}`, { examDate: daysAgo(3), startTime: '09:00', maxMarks: 50, passMarks: 18 }); ok(r.status === 200, 'admin edits schedule');
  r = await save(tom, esEng, secA, [{ studentId: sam.id, marks: 15 }, { studentId: amy.id, marks: 40 }]); ok(r.status === 200, 'tom enters english');
  const absentRow = (await sql('SELECT is_absent, marks_obtained FROM marks WHERE student_id = ? AND exam_schedule_id = ?', [amy.id, esMath]))[0];
  ok(absentRow.is_absent === 1 && Number(absentRow.marks_obtained) === 0, 'absent stored as is_absent=1, 0 marks');

  // ===== results
  r = await samC('GET', `/api/results/student/${sam.id}`); const h = r.json.exams[0];
  ok(r.status === 200 && r.json.exams.length === 1 && h.totalObtained === 60 && h.totalMax === 100 && h.percentage === 60 && h.grade === 'B' && h.result === 'fail', 'sam summary: 60/100=60% B, fails english: ' + JSON.stringify(h));
  r = await samC('GET', `/api/results/student/${sam.id}/exam/${ex}`); const d = r.json.result;
  ok(d.subjects[0].grade === 'A+' && d.subjects[0].status === 'pass' && d.subjects[1].grade === 'F' && d.subjects[1].status === 'fail', 'subject grades/status: ' + JSON.stringify(d.subjects.map((s) => [s.subjectName, s.percentage, s.grade, s.status])));
  ok(r.json.info.studentName === 'सैम Student' && r.json.info.className === 'Class 5', 'info block');
  r = await amyC('GET', `/api/results/student/${amy.id}/exam/${ex}`); const a = r.json.result;
  ok(a.subjects[0].absent && a.subjects[0].grade === 'AB' && a.subjects[0].status === 'absent' && a.totalObtained === 40 && a.totalMax === 100 && a.percentage === 40 && a.result === 'fail' && a.grade === 'D', 'amy absent counts 0, fails: ' + JSON.stringify([a.totalObtained, a.percentage, a.grade, a.result]));
  r = await beeC('GET', `/api/results/student/${bee.id}`); ok(r.status === 200 && r.json.exams.length === 0, 'no marks yet -> no results listed');
  r = await beeC('GET', `/api/results/student/${bee.id}/exam/${ex}`); ok(r.status === 200 && r.json.result.result === 'pending' && r.json.result.pendingSubjects.length === 2 && r.json.result.grade === null, 'pending result, no grade');
  r = await beeC('GET', `/api/results/student/${sam.id}`); ok(r.status === 403, 'student blocked from classmate results');
  r = await beeC('GET', `/api/results/student/${sam.id}/exam/${ex}`); ok(r.status === 403, 'student blocked from classmate detail');
  r = await patC('GET', `/api/results/student/${sam.id}/exam/${ex}`); ok(r.status === 200, 'parent sees child detail');
  r = await patC('GET', `/api/results/student/${bee.id}/exam/${ex}`); ok(r.status === 403, 'parent blocked from other child');
  r = await calC('GET', `/api/results/student/${cal.id}/exam/${ex}`); ok(r.status === 404, 'student not in that exam class -> 404');
  r = await tess('GET', `/api/results/student/${sam.id}`); ok(r.status === 403, 'unrelated teacher blocked');
  r = await tara('GET', `/api/results/student/${sam.id}`); ok(r.status === 200, 'teacher of section sees result');

  r = await tara('GET', `/api/results/exam/${ex}?sectionId=${secA}`); ok(r.status === 200 && r.json.rows.length === 2 && r.json.schedule.length === 2 && r.json.rows[0].percentage === 60 && r.json.rows[1].grade === 'D', 'class result sheet');
  r = await tara('GET', `/api/results/exam/${ex}?sectionId=${secB}`); ok(r.status === 403, 'teacher blocked from other section sheet');
  r = await admin('GET', `/api/results/exam/${ex}?sectionId=${secB}`); ok(r.status === 200 && r.json.rows[0].result === 'pending', 'admin sheet shows pending');
  r = await admin('GET', `/api/results/exam/${ex}?sectionId=${sec6}`); ok(r.status === 422, 'section from another class');
  r = await samC('GET', `/api/results/exam/${ex}?sectionId=${secA}`); ok(r.status === 403, 'student cannot view class sheet');

  // custom grade scale changes grades
  r = await admin('PUT', '/api/grades', { grades: [{ grade: 'Distinction', minPercent: 85 }, { grade: 'Pass', minPercent: 33 }, { grade: 'Fail', minPercent: 0 }] }); ok(r.status === 422, 'grade name over 5 chars');
  r = await admin('PUT', '/api/grades', { grades: [{ grade: 'Dist', minPercent: 85 }, { grade: 'Pass', minPercent: 33 }, { grade: 'Fail', minPercent: 0 }] }); ok(r.status === 200, 'custom scale saved');
  r = await samC('GET', `/api/results/student/${sam.id}/exam/${ex}`); ok(r.json.result.grade === 'Pass' && r.json.result.subjects[0].grade === 'Dist', 'new scale applied to results');
  r = await admin('GET', '/api/grades'); ok(r.json.grades.length === 3 && r.json.grades[0].grade === 'Dist', 'scale persisted, ordered high to low');
  const mx = (await sql('SELECT grade, min_percent AS mn, max_percent AS mx FROM grade_scale ORDER BY min_percent DESC')).map((g) => `${g.grade} ${Number(g.mn).toFixed(2)} ${Number(g.mx).toFixed(2)}`);
  ok(mx[0] === 'Dist 85.00 100.00' && mx[1] === 'Pass 33.00 84.99', 'max_percent derived: ' + mx.join(' | '));
  await admin('PUT', '/api/grades', { grades: [{ grade: 'A+', minPercent: 90 }, { grade: 'A', minPercent: 80 }, { grade: 'B+', minPercent: 70 }, { grade: 'B', minPercent: 60 }, { grade: 'C', minPercent: 50 }, { grade: 'D', minPercent: 40 }, { grade: 'F', minPercent: 0 }] });

  // ===== report card PDF
  r = await samC('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`);
  ok(r.status === 200 && r.headers.get('content-type') === 'application/pdf' && r.buf.subarray(0, 4).toString() === '%PDF' && /attachment; filename="report-card-A1-exam\d+\.pdf"/.test(r.headers.get('content-disposition')), 'student downloads own PDF ' + r.status);
  ok(r.buf.length > 3000 && r.buf.includes('%%EOF'), 'report card PDF is a complete file (' + r.buf.length + ' bytes)');
  r = await patC('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`); ok(r.status === 200, 'parent downloads child PDF');
  r = await tara('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`); ok(r.status === 200, 'teacher downloads');
  r = await beeC('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`); ok(r.status === 403 && !r.buf, 'classmate blocked from PDF');
  r = await tess('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`); ok(r.status === 403, 'unrelated teacher blocked from PDF');
  r = await client()('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`); ok(r.status === 401, 'anonymous blocked from PDF');
  r = await beeC('GET', `/api/results/student/${bee.id}/exam/${ex}/report-card`); ok(r.status === 200, 'pending PDF still generates');
  ok(r.buf.length > 3000, 'pending report card still renders');

  // ===== remarks
  r = await tara('POST', '/api/remarks', { studentId: sam.id, remark: 'Very attentive in class.' }); ok(r.status === 201, 'teacher adds remark'); const rm1 = r.json.id;
  r = await tara('POST', '/api/remarks', { studentId: bee.id, remark: 'x' }); ok(r.status === 403, 'teacher cannot remark on other-section student');
  r = await tara('POST', '/api/remarks', { studentId: sam.id, remark: '' }); ok(r.status === 422, 'empty remark');
  r = await tara('POST', '/api/remarks', { studentId: sam.id, remark: 'x'.repeat(501) }); ok(r.status === 422, 'remark too long');
  r = await admin('POST', '/api/remarks', { studentId: sam.id, remark: 'Admin note' }); ok(r.status === 403, 'admin cannot author remarks');
  r = await samC('POST', '/api/remarks', { studentId: sam.id, remark: 'self' }); ok(r.status === 403, 'student cannot add remark');
  r = await patC('POST', '/api/remarks', { studentId: sam.id, remark: 'parent' }); ok(r.status === 403, 'parent cannot add remark');
  r = await samC('GET', `/api/remarks?studentId=${sam.id}`); ok(r.status === 200 && r.json.remarks.length === 1 && r.json.remarks[0].teacherName === 'Tara Teacher' && r.json.remarks[0].canDelete === false, 'student sees remark, cannot delete');
  r = await patC('GET', `/api/remarks?studentId=${sam.id}`); ok(r.json.remarks.length === 1, 'parent sees remark');
  r = await beeC('GET', `/api/remarks?studentId=${sam.id}`); ok(r.status === 403, 'classmate blocked');
  r = await tess('GET', `/api/remarks?studentId=${sam.id}`); ok(r.status === 403, 'unrelated teacher blocked');
  r = await tara('GET', `/api/remarks?studentId=${sam.id}`); ok(r.json.remarks[0].canDelete === true, 'author can delete');
  r = await tom('DELETE', `/api/remarks/${rm1}`); ok(r.status === 403, 'other teacher cannot delete');
  r = await tom('POST', '/api/remarks', { studentId: sam.id, remark: 'Good at English.' }); ok(r.status === 201, 'second teacher of the section can add'); const rm2 = r.json.id;
  r = await samC('GET', `/api/results/student/${sam.id}/exam/${ex}/report-card`);
  ok(r.status === 200 && r.buf.length > 3000, 'report card with remarks renders');
  r = await admin('DELETE', `/api/remarks/${rm2}`); ok(r.status === 200, 'admin can delete any remark');
  r = await tara('DELETE', `/api/remarks/${rm1}`); ok(r.status === 200, 'author deletes own');
  r = await tara('DELETE', '/api/remarks/99999'); ok(r.status === 404, 'missing remark 404');

  // ===== guards once marks exist
  r = await admin('DELETE', `/api/exams/${ex}`); ok(r.status === 409, 'exam with marks cannot be deleted');
  r = await admin('DELETE', `/api/exams/schedule/${esMath}`); ok(r.status === 409, 'subject with marks cannot be removed');
  r = await admin('PUT', `/api/exams/schedule/${esMath}`, { examDate: daysAgo(4), maxMarks: 40, passMarks: 15 }); ok(r.status === 409, 'cannot lower max below existing marks');
  r = await admin('PUT', `/api/exams/schedule/${esMath}`, { examDate: daysAgo(4), maxMarks: 60, passMarks: 20 }); ok(r.status === 200, 'can raise max');
  r = await admin('PUT', `/api/exams/${ex}`, { name: 'Unit Test 1 (Revised)', startDate: daysAgo(5), endDate: daysAgo(3) }); ok(r.status === 200, 'rename exam');
  r = await admin('POST', '/api/exams', { classId: cls, name: 'Spare' }); const spare = r.json.id;
  r = await admin('DELETE', `/api/exams/${spare}`); ok(r.status === 200, 'exam without marks can be deleted');
  r = await admin('GET', '/api/exams/abc'); ok(r.status === 422, 'bad id');
  r = await admin('GET', '/api/exams/99999'); ok(r.status === 404, 'missing exam');

  console.log(`passed ${pass}, failed ${fail}`);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
