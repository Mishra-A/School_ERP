if (process.env.TEST_RUN !== '1') { console.error('Run the tests with: npm test (they need their own test database).'); process.exit(1); }
const { sql } = require('../helpers/sql');
const B = process.env.TEST_BASE_URL;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); };
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, json: j };
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
  const admin = client();
  let r = await admin.login('admin@test.local', 'TestPass12345'); ok(r.status === 200, 'admin login');

  // years
  r = await admin('POST', '/api/academic-years', { name: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31' }); ok(r.status === 201, 'old year');
  const oldYear = r.json.id;
  r = await admin('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true }); ok(r.status === 201, 'year');
  const year = r.json.id;
  r = await admin('POST', '/api/academic-years', { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' }); ok(r.status === 409 && /already exists/.test(r.json.error), 'dup year ' + r.status);
  r = await admin('POST', '/api/academic-years', { name: 'X', startDate: '2026-04-01', endDate: '2026-01-01' }); ok(r.status === 422, 'bad dates');
  r = await admin('POST', '/api/academic-years', { name: 'X', startDate: '2026-02-30', endDate: '2027-01-01' }); ok(r.status === 422, 'impossible date');
  r = await admin('GET', '/api/academic-years'); ok(r.json.years.filter((y) => y.isCurrent).length === 1 && r.json.years.find((y) => y.id === year).isCurrent, 'only one current');
  r = await admin('POST', `/api/academic-years/${oldYear}/set-current`); r = await admin('POST', `/api/academic-years/${year}/set-current`);
  r = await admin('GET', '/api/academic-years'); ok(r.json.years.filter((y) => y.isCurrent).length === 1 && r.json.years[0].isCurrent, 'set-current switches');
  r = await admin('POST', '/api/academic-years/9999/set-current'); ok(r.status === 404, 'set-current 404');

  // classes & sections
  r = await admin('POST', '/api/classes', { academicYearId: year, name: 'Class 5' }); ok(r.status === 201, 'class'); const cls = r.json.id;
  r = await admin('POST', '/api/classes', { academicYearId: year, name: 'Class 5' }); ok(r.status === 409, 'dup class');
  r = await admin('POST', '/api/classes', { academicYearId: oldYear, name: 'Class 4' }); const oldCls = r.json.id;
  r = await admin('POST', '/api/sections', { classId: oldCls, name: 'A' }); const oldSec = r.json.id;
  r = await admin('POST', '/api/sections', { classId: cls, name: 'A' }); ok(r.status === 201, 'section A'); const secA = r.json.id;
  r = await admin('POST', '/api/sections', { classId: cls, name: 'B' }); const secB = r.json.id;
  r = await admin('POST', '/api/sections', { classId: cls, name: 'A' }); ok(r.status === 409, 'dup section');
  r = await admin('POST', '/api/sections', { classId: cls, name: 'C', classTeacherId: 9999 }); ok(r.status === 422, 'bad class teacher ' + r.status);
  r = await admin('GET', `/api/classes?yearId=${year}`); ok(r.json.classes[0].sections.length === 2, 'classes tree');
  r = await admin('GET', '/api/classes'); ok(r.status === 422, 'yearId required');
  r = await admin('GET', '/api/sections/options'); ok(r.json.sections.length === 2 && r.json.sections[0].label === 'Class 5 - A', 'section options current year only');

  // subjects
  r = await admin('POST', '/api/subjects', { name: 'Mathematics', code: 'math' }); ok(r.status === 201, 'subject'); const math = r.json.id;
  r = await admin('POST', '/api/subjects', { name: 'Maths 2', code: 'MATH' }); ok(r.status === 409, 'dup subject code (case-insensitive)');
  r = await admin('POST', '/api/subjects', { name: 'English', code: 'ENG' }); const eng = r.json.id;
  r = await admin('GET', '/api/subjects'); ok(r.json.subjects.find((s) => s.id === math).code === 'MATH', 'code uppercased');

  // teachers
  r = await admin('POST', '/api/teachers', { name: 'Tara Teacher', email: 'tara@test.local', employeeCode: 'T001', phone: '9876543210' });
  ok(r.status === 201 && r.json.temporaryPassword && r.json.temporaryPassword.length === 10, 'teacher create'); const t1 = r.json.id; const t1pw = r.json.temporaryPassword;
  ok(!JSON.stringify((await admin('GET', `/api/teachers/${t1}`)).json).includes('password'), 'no password in teacher get');
  r = await admin('POST', '/api/teachers', { name: 'Dup', email: 'tara@test.local', employeeCode: 'T009' }); ok(r.status === 409 && /email/.test(r.json.error), 'dup teacher email');
  r = await admin('POST', '/api/teachers', { name: 'Dup', email: 'x@test.local', employeeCode: 'T001' }); ok(r.status === 409 && /employee code/.test(r.json.error), 'dup emp code');
  r = await admin('POST', '/api/teachers', { name: 'Dup', email: 'x@test.local', employeeCode: 'T009', phone: 'abc' }); ok(r.status === 422, 'bad phone');
  r = await admin('POST', '/api/teachers', { name: 'Tom Teacher', email: 'tom@test.local', employeeCode: 'T002' }); const t2 = r.json.id;
  const tara = client(); r = await tara.login('tara@test.local', t1pw); ok(r.status === 200 && r.json.user.role === 'teacher' && r.json.user.profileId === t1, 'new teacher can log in with temp password');
  r = await admin('GET', '/api/teachers?search=tara'); ok(r.json.total === 1 && r.json.rows[0].name === 'Tara Teacher', 'teacher search');
  r = await admin('GET', '/api/teachers?search=%25'); ok(r.json.total === 0, 'LIKE wildcard escaped');
  r = await admin('GET', '/api/teachers?limit=1&page=2'); ok(r.json.rows.length === 1 && r.json.total === 2, 'paging');
  r = await admin('PUT', `/api/teachers/${t1}`, { name: 'Tara T.', email: 'tara@test.local', employeeCode: 'T001', phone: '9876543210', qualification: 'M.Sc', joinedOn: '2020-06-01' }); ok(r.status === 200, 'teacher update');
  ok((await admin('GET', `/api/teachers/${t1}`)).json.teacher.qualification === 'M.Sc', 'teacher update persisted');
  r = await admin('PUT', `/api/sections/${secA}`, { name: 'A', classTeacherId: t1 }); ok(r.status === 200, 'set class teacher');

  // assignments
  r = await admin('POST', '/api/class-subjects', { sectionId: secA, subjectId: math, teacherId: t1 }); ok(r.status === 201, 'assign'); const asg = r.json.id;
  r = await admin('POST', '/api/class-subjects', { sectionId: secA, subjectId: math, teacherId: t2 }); ok(r.status === 409, 'dup assignment');
  r = await admin('POST', '/api/class-subjects', { sectionId: secB, subjectId: eng, teacherId: t2 }); const asgB = r.json.id;
  r = await admin('GET', `/api/class-subjects?sectionId=${secA}`); ok(r.json.assignments.length === 1 && r.json.assignments[0].teacherName === 'Tara T.', 'list assignments');
  r = await admin('PUT', `/api/class-subjects/${asg}`, { teacherId: t2 }); ok(r.status === 200, 'change teacher');
  r = await admin('PUT', `/api/class-subjects/${asg}`, { teacherId: t1 });

  // students
  r = await admin('POST', '/api/students', { name: 'Sam Student', email: 'sam@test.local', admissionNo: 'A100', gender: 'male', dob: '2015-05-01', sectionId: secA, rollNo: 1 });
  ok(r.status === 201 && r.json.temporaryPassword, 'student create'); const sam = r.json.id; const samPw = r.json.temporaryPassword;
  r = await admin('POST', '/api/students', { name: 'Roll Clash', email: 'clash@test.local', admissionNo: 'A101', sectionId: secA, rollNo: 1 }); ok(r.status === 409 && /roll number/.test(r.json.error), 'roll clash ' + r.status);
  r = await admin('POST', '/api/students', { name: 'Roll Clash', email: 'clash@test.local', admissionNo: 'A101', sectionId: secA, rollNo: 2 }); ok(r.status === 201, 'failed create rolled back (email + admission reusable)'); const clash = r.json.id;
  r = await admin('POST', '/api/students', { name: 'Old Sec', email: 'o@test.local', admissionNo: 'A102', sectionId: oldSec }); ok(r.status === 422, 'section from non-current year rejected');
  r = await admin('POST', '/api/students', { name: 'Future', email: 'f@test.local', admissionNo: 'A103', dob: '2999-01-01' }); ok(r.status === 422, 'future dob');
  r = await admin('POST', '/api/students', { name: 'Bad', email: 'nope', admissionNo: 'A104' }); ok(r.status === 422, 'bad email');
  r = await admin('POST', '/api/students', { name: 'Unplaced', email: 'u@test.local', admissionNo: 'A105' }); ok(r.status === 201, 'student without section'); const unplaced = r.json.id;
  r = await admin('POST', '/api/students', { name: 'Bee Student', email: 'bee@test.local', admissionNo: 'B200', sectionId: secB, rollNo: 1 }); const bee = r.json.id; const beePw = r.json.temporaryPassword;

  r = await admin('GET', '/api/students'); ok(r.json.total === 4, 'student total ' + r.json.total);
  r = await admin('GET', `/api/students?sectionId=${secB}`); ok(r.json.total === 1 && r.json.rows[0].name === 'Bee Student' && r.json.rows[0].className === 'Class 5', 'filter by section');
  r = await admin('GET', '/api/students?search=A100'); ok(r.json.total === 1 && r.json.rows[0].id === sam, 'search admission');

  // parents + linking
  r = await admin('POST', '/api/parents', { name: 'Pat Parent', email: 'pat@test.local', phone: '+91 98765 43210' }); ok(r.status === 201, 'parent'); const pat = r.json.id; const patPw = r.json.temporaryPassword;
  r = await admin('POST', `/api/students/${sam}/parents`, { parentId: pat, relation: 'mother' }); ok(r.status === 200, 'link');
  r = await admin('POST', `/api/students/${sam}/parents`, { parentId: pat, relation: 'cousin' }); ok(r.status === 422, 'bad relation');
  r = await admin('POST', `/api/students/${sam}/parents`, { parentId: 9999, relation: 'mother' }); ok(r.status === 404, 'link missing parent');
  r = await admin('GET', '/api/parents'); ok(r.json.rows[0].children === 'Sam Student', 'parent children list');

  // access control
  const parent = client(); await parent.login('pat@test.local', patPw);
  r = await parent('GET', `/api/students/${sam}`); ok(r.status === 200 && r.json.student.name === 'Sam Student' && r.json.current.sectionId === secA, 'parent sees own child');
  ok(r.json.parents[0].relation === 'mother' && r.json.parents[0].phone === undefined && r.json.parents[0].email === undefined, 'parent view hides contact details');
  r = await parent('GET', `/api/students/${bee}`); ok(r.status === 403, 'parent blocked from other student ' + r.status);
  r = await parent('GET', '/api/students'); ok(r.status === 403, 'parent cannot list');
  r = await parent('GET', '/api/teachers'); ok(r.status === 403, 'parent cannot list teachers');
  r = await parent('POST', '/api/students', { name: 'x' }); ok(r.status === 403, 'parent cannot create');

  const samC = client(); await samC.login('sam@test.local', samPw);
  r = await samC('GET', `/api/students/${sam}`); ok(r.status === 200, 'student sees self');
  r = await samC('GET', `/api/students/${clash}`); ok(r.status === 403, 'student blocked from classmate');
  r = await samC('GET', '/api/students/99999'); ok(r.status === 403, 'unknown id looks identical (403)');
  r = await samC('GET', '/api/students'); ok(r.status === 403, 'student cannot list');
  r = await samC('PUT', `/api/students/${sam}`, { name: 'Hacker', email: 'sam@test.local', admissionNo: 'A100' }); ok(r.status === 403, 'student cannot edit self via admin API');
  r = await samC('PATCH', `/api/students/${bee}/status`, { active: false }); ok(r.status === 403, 'student cannot deactivate');
  ok(parent && (await samC('GET', `/api/students/${sam}`)).json.parents[0].phone === undefined, 'student view hides contact details');

  const taraC = tara; // already logged in (the temporary password was replaced at first login)
  r = await taraC('GET', '/api/students'); ok(r.status === 200 && r.json.total === 2 && r.json.rows.every((s) => s.sectionId === secA), 'teacher sees only own section students ' + JSON.stringify(r.json.total));
  r = await taraC('GET', `/api/students/${sam}`); ok(r.status === 200 && r.json.parents[0].phone === '+91 98765 43210', 'teacher sees own student with contacts');
  r = await taraC('GET', `/api/students/${bee}`); ok(r.status === 403, 'teacher blocked from other section student');
  r = await taraC('GET', `/api/students/${unplaced}`); ok(r.status === 403, 'teacher blocked from unplaced student');
  r = await taraC('POST', '/api/students', { name: 'x' }); ok(r.status === 403, 'teacher cannot create student');
  r = await taraC('GET', '/api/teachers'); ok(r.status === 403, 'teacher cannot list teachers');
  r = await taraC('GET', '/api/subjects'); ok(r.status === 200, 'teacher can read subjects');
  r = await taraC('POST', '/api/subjects', { name: 'x', code: 'X' }); ok(r.status === 403, 'teacher cannot create subjects');

  // updates
  r = await admin('PUT', `/api/students/${unplaced}`, { name: 'Unplaced U', email: 'u@test.local', admissionNo: 'A105', sectionId: secB, rollNo: 5 }); ok(r.status === 200, 'enroll via update');
  r = await admin('GET', `/api/students/${unplaced}`); ok(r.json.current.sectionId === secB && r.json.current.rollNo === 5 && r.json.student.name === 'Unplaced U', 'enrollment created');
  r = await admin('PUT', `/api/students/${unplaced}`, { name: 'Unplaced U', email: 'u@test.local', admissionNo: 'A105', sectionId: secA, rollNo: 9 });
  r = await admin('GET', `/api/students/${unplaced}`); ok(r.json.enrollments.length === 1 && r.json.current.sectionId === secA && r.json.current.rollNo === 9, 'enrollment moved, not duplicated');
  r = await admin('PUT', `/api/students/${unplaced}`, { name: 'Unplaced U', email: 'sam@test.local', admissionNo: 'A105' }); ok(r.status === 409, 'update to taken email 409');

  // status & password reset
  r = await admin('PATCH', `/api/students/${bee}/status`, { active: false }); ok(r.status === 200, 'deactivate');
  const beeC = client(); r = await beeC.login('bee@test.local', beePw); ok(r.status === 403, 'deactivated student cannot log in');
  r = await admin('GET', '/api/students?status=inactive'); ok(r.json.total === 1, 'inactive filter');
  r = await admin('PATCH', `/api/students/${bee}/status`, { active: 'no' }); ok(r.status === 422, 'status validation');
  await admin('PATCH', `/api/students/${bee}/status`, { active: true });
  r = await admin('POST', `/api/students/${bee}/reset-password`); ok(r.status === 200 && r.json.temporaryPassword && r.json.temporaryPassword !== beePw, 'reset password');
  r = await beeC.login('bee@test.local', beePw); ok(r.status === 401, 'old password dead');
  r = await beeC.login('bee@test.local', (await admin('POST', `/api/students/${bee}/reset-password`)).json.temporaryPassword); ok(r.status === 200, 'new temp password works');

  // unlink & deletes
  r = await admin('DELETE', `/api/students/${sam}/parents/${pat}`); ok(r.status === 200, 'unlink');
  r = await parent('GET', `/api/students/${sam}`); ok(r.status === 403, 'parent loses access after unlink');
  r = await admin('DELETE', `/api/classes/${cls}`); ok(r.status === 409, 'class with sections cannot be deleted');
  r = await admin('DELETE', `/api/sections/${secA}`); ok(r.status === 409, 'section with students cannot be deleted');
  r = await admin('DELETE', `/api/subjects/${math}`); ok(r.status === 409, 'assigned subject cannot be deleted ' + r.status);
  r = await admin('DELETE', `/api/class-subjects/${asgB}`); ok(r.status === 200, 'delete assignment');
  r = await admin('POST', '/api/classes', { academicYearId: year, name: 'Temp' }); const tmp = r.json.id;
  r = await admin('DELETE', `/api/classes/${tmp}`); ok(r.status === 200, 'empty class deletable');
  r = await admin('GET', '/api/students/abc'); ok(r.status === 422, 'non-numeric id 422');

  // dashboard reflects real data
  r = await admin('GET', '/api/reports/dashboard'); ok(r.json.stats.students === 4 && r.json.stats.teachers === 2 && r.json.stats.classes === 1, 'dashboard counts ' + JSON.stringify(r.json.stats));
  ok(r.json.charts.enrollment[0].value === 4, 'enrollment chart ' + JSON.stringify(r.json.charts.enrollment));
  r = await taraC('GET', '/api/reports/dashboard'); ok(r.status === 200 && r.json.stats.subjectsTaught === 1 && r.json.stats.studentsReached === 3, 'teacher dashboard ' + JSON.stringify(r.json.stats));
  r = await parent('GET', '/api/reports/dashboard'); ok(r.status === 200 && r.json.children.length === 0, 'parent dashboard after unlink');

  console.log(`passed ${pass}, failed ${fail}`);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
