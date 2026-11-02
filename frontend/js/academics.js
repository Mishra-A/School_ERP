import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, toast } from './ui.js';
import { openForm, confirmBox, rowBtn } from './components.js';

const content = document.getElementById('content');
let years = [];
let classes = [];
let selectedYearId = null;
let sectionOpts = [];
let selectedSectionId = '';

const run = (fn) => (...a) => fn(...a).catch((err) => toast(err.message, 'error'));
const opts = (list, label = 'name') => list.map((x) => ({ value: x.id, label: x[label] }));
const teacherOptions = async () => opts((await api.get('/api/teachers/options')).teachers);

async function loadYears() {
  years = (await api.get('/api/academic-years')).years;
  if (!selectedYearId || !years.find((y) => y.id === selectedYearId)) {
    selectedYearId = (years.find((y) => y.isCurrent) || years[0] || {}).id || null;
  }
}

// ---------- Academic years ----------
const YEAR_FIELDS = [
  { name: 'name', label: 'Name', required: true, placeholder: 'e.g. 2026-27', max: 20 },
  { name: 'startDate', label: 'Starts on', type: 'date', required: true, col: 6 },
  { name: 'endDate', label: 'Ends on', type: 'date', required: true, col: 6 },
];

async function renderYears() {
  const pane = document.getElementById('pane-years');
  showLoading(pane);
  try {
    await loadYears();
    pane.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <p class="muted mb-0">Exactly one year is "current". Dashboards, enrollment and the student lists use it.</p>
        <button class="btn btn-primary" data-action="add-year"><i class="fa-solid fa-plus me-1"></i>Add academic year</button>
      </div>
      <section class="panel">${years.length
        ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Year</th><th>Starts</th><th>Ends</th><th>Status</th><th></th></tr></thead><tbody>${years.map((y) => `
            <tr><td class="fw-semibold">${esc(y.name)}</td><td>${fmtDate(y.startDate)}</td><td>${fmtDate(y.endDate)}</td>
            <td>${y.isCurrent ? '<span class="badge text-bg-success">Current</span>' : ''}</td>
            <td><div class="row-actions">${rowBtn('edit-year', y.id, 'Edit')}${y.isCurrent ? '' : rowBtn('set-current', y.id, 'Make current', 'btn-outline-success')}</div></td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No academic year yet', 'Create one first. Classes, exams and fees all belong to a year.', 'fa-calendar')}</section>`;
  } catch (err) { showError(pane, err.message, renderYears); }
}

async function addYear() {
  const created = await openForm({
    title: 'Add academic year', fields: [...YEAR_FIELDS, { name: 'isCurrent', label: 'Make this the current year', type: 'checkbox' }],
    submitLabel: 'Add year', onSubmit: (v) => api.post('/api/academic-years', v),
  });
  if (created) { toast('Academic year added.'); renderYears(); }
}

async function editYear(id) {
  const y = years.find((x) => String(x.id) === id);
  const saved = await openForm({ title: 'Edit academic year', fields: YEAR_FIELDS, values: y, onSubmit: (v) => api.put(`/api/academic-years/${id}`, v) });
  if (saved) { toast('Academic year updated.'); renderYears(); }
}

async function setCurrent(id) {
  const y = years.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Change current year?', message: `${y.name} will become the current academic year across the app.`, confirmLabel: 'Make current' });
  if (!ok) return;
  await api.post(`/api/academic-years/${id}/set-current`);
  toast(`${y.name} is now the current year.`);
  renderYears();
}

// ---------- Classes & sections ----------
async function renderClasses() {
  const pane = document.getElementById('pane-classes');
  showLoading(pane);
  try {
    await loadYears();
    if (!years.length) { pane.innerHTML = `<section class="panel">${emptyHtml('Add an academic year first', 'Classes belong to an academic year. Use the Academic years tab.', 'fa-calendar')}</section>`; return; }
    classes = (await api.get(`/api/classes?yearId=${selectedYearId}`)).classes;
    pane.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2"><label class="muted" for="year-select">Academic year</label>
          <select class="form-select w-auto" id="year-select">${years.map((y) => `<option value="${y.id}"${y.id === selectedYearId ? ' selected' : ''}>${esc(y.name)}${y.isCurrent ? ' (current)' : ''}</option>`).join('')}</select></div>
        <button class="btn btn-primary" data-action="add-class"><i class="fa-solid fa-plus me-1"></i>Add class</button>
      </div>
      ${classes.length ? classes.map((c) => `
        <section class="panel mb-3">
          <div class="panel-head"><h2>${esc(c.name)}</h2><div class="row-actions">
            ${rowBtn('add-section', c.id, 'Add section', 'btn-outline-primary')}${rowBtn('edit-class', c.id, 'Rename')}${rowBtn('delete-class', c.id, 'Delete', 'btn-outline-danger')}</div></div>
          ${c.sections.length
            ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Section</th><th>Class teacher</th><th>Students</th><th></th></tr></thead><tbody>${c.sections.map((s) => `
                <tr><td class="fw-semibold">${esc(s.name)}</td><td>${s.classTeacherName ? esc(s.classTeacherName) : '<span class="muted">Not assigned</span>'}</td><td>${s.studentCount}</td>
                <td><div class="row-actions">${rowBtn('edit-section', s.id, 'Edit')}${rowBtn('delete-section', s.id, 'Delete', 'btn-outline-danger')}</div></td></tr>`).join('')}</tbody></table></div>`
            : emptyHtml('No sections yet', 'Add at least one section, for example A.', 'fa-table-cells')}
        </section>`).join('')
        : `<section class="panel">${emptyHtml('No classes in this year', 'Add your first class, for example "Class 5".', 'fa-school')}</section>`}`;
    document.getElementById('year-select').addEventListener('change', (e) => { selectedYearId = Number(e.target.value); renderClasses(); });
  } catch (err) { showError(pane, err.message, renderClasses); }
}

async function addClass() {
  const created = await openForm({ title: 'Add class', fields: [{ name: 'name', label: 'Class name', required: true, placeholder: 'e.g. Class 5', max: 40 }],
    submitLabel: 'Add class', onSubmit: (v) => api.post('/api/classes', { ...v, academicYearId: selectedYearId }) });
  if (created) { toast('Class added.'); renderClasses(); }
}
async function editClass(id) {
  const c = classes.find((x) => String(x.id) === id);
  const saved = await openForm({ title: 'Rename class', fields: [{ name: 'name', label: 'Class name', required: true, max: 40 }], values: c, onSubmit: (v) => api.put(`/api/classes/${id}`, v) });
  if (saved) { toast('Class renamed.'); renderClasses(); }
}
async function deleteClass(id) {
  const c = classes.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete class?', message: `${c.name} will be deleted. This only works if it has no sections.`, confirmLabel: 'Delete class', danger: true });
  if (!ok) return;
  await api.del(`/api/classes/${id}`);
  toast('Class deleted.');
  renderClasses();
}

async function sectionForm(title, values, onSubmit) {
  const teachers = await teacherOptions();
  return openForm({ title, values, submitLabel: 'Save section', onSubmit, fields: [
    { name: 'name', label: 'Section name', required: true, placeholder: 'e.g. A', max: 20 },
    { name: 'classTeacherId', label: 'Class teacher', type: 'select', options: teachers, placeholder: 'Not assigned', help: teachers.length ? '' : 'Add teachers first to assign one.' },
  ] });
}
async function addSection(classId) {
  const created = await sectionForm('Add section', {}, (v) => api.post('/api/sections', { ...v, classId: Number(classId) }));
  if (created) { toast('Section added.'); renderClasses(); }
}
async function editSection(id) {
  const s = classes.flatMap((c) => c.sections).find((x) => String(x.id) === id);
  const saved = await sectionForm('Edit section', s, (v) => api.put(`/api/sections/${id}`, v));
  if (saved) { toast('Section updated.'); renderClasses(); }
}
async function deleteSection(id) {
  const s = classes.flatMap((c) => c.sections).find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete section?', message: `Section ${s.name} will be deleted. This only works if it has no students or subject assignments.`, confirmLabel: 'Delete section', danger: true });
  if (!ok) return;
  await api.del(`/api/sections/${id}`);
  toast('Section deleted.');
  renderClasses();
}

// ---------- Subjects ----------
let subjects = [];
const SUBJECT_FIELDS = [
  { name: 'name', label: 'Subject name', required: true, placeholder: 'e.g. Mathematics', col: 8, max: 80 },
  { name: 'code', label: 'Code', required: true, placeholder: 'e.g. MATH', col: 4, max: 20 },
];

async function renderSubjects() {
  const pane = document.getElementById('pane-subjects');
  showLoading(pane);
  try {
    subjects = (await api.get('/api/subjects')).subjects;
    pane.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <p class="muted mb-0">The school's subject list. Assign each one to sections and teachers in the next tab.</p>
        <button class="btn btn-primary" data-action="add-subject"><i class="fa-solid fa-plus me-1"></i>Add subject</button>
      </div>
      <section class="panel">${subjects.length
        ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Subject</th><th>Code</th><th></th></tr></thead><tbody>${subjects.map((s) => `
            <tr><td class="fw-semibold">${esc(s.name)}</td><td>${esc(s.code)}</td><td><div class="row-actions">${rowBtn('edit-subject', s.id, 'Edit')}${rowBtn('delete-subject', s.id, 'Delete', 'btn-outline-danger')}</div></td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No subjects yet', 'Add subjects like Mathematics, English and Science.', 'fa-book')}</section>`;
  } catch (err) { showError(pane, err.message, renderSubjects); }
}
async function addSubject() {
  const created = await openForm({ title: 'Add subject', fields: SUBJECT_FIELDS, submitLabel: 'Add subject', onSubmit: (v) => api.post('/api/subjects', v) });
  if (created) { toast('Subject added.'); renderSubjects(); }
}
async function editSubject(id) {
  const s = subjects.find((x) => String(x.id) === id);
  const saved = await openForm({ title: 'Edit subject', fields: SUBJECT_FIELDS, values: s, onSubmit: (v) => api.put(`/api/subjects/${id}`, v) });
  if (saved) { toast('Subject updated.'); renderSubjects(); }
}
async function deleteSubject(id) {
  const s = subjects.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete subject?', message: `${s.name} will be deleted. This only works if it isn't assigned to any section.`, confirmLabel: 'Delete subject', danger: true });
  if (!ok) return;
  await api.del(`/api/subjects/${id}`);
  toast('Subject deleted.');
  renderSubjects();
}

// ---------- Teaching assignments ----------
let assignments = [];

async function renderAssignments() {
  const pane = document.getElementById('pane-assign');
  showLoading(pane);
  try {
    sectionOpts = (await api.get('/api/sections/options')).sections;
    if (!sectionOpts.length) {
      pane.innerHTML = `<section class="panel">${emptyHtml('No sections in the current year', 'Set a current academic year and add classes with sections first.', 'fa-table-cells')}</section>`;
      return;
    }
    if (!sectionOpts.find((s) => String(s.id) === String(selectedSectionId))) selectedSectionId = sectionOpts[0].id;
    assignments = (await api.get(`/api/class-subjects?sectionId=${selectedSectionId}`)).assignments;
    pane.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2"><label class="muted" for="section-select">Section</label>
          <select class="form-select w-auto" id="section-select">${sectionOpts.map((s) => `<option value="${s.id}"${String(s.id) === String(selectedSectionId) ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
        <button class="btn btn-primary" data-action="add-assignment"><i class="fa-solid fa-plus me-1"></i>Assign subject</button>
      </div>
      <section class="panel">${assignments.length
        ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Subject</th><th>Teacher</th><th></th></tr></thead><tbody>${assignments.map((a) => `
            <tr><td class="fw-semibold">${esc(a.subjectName)} <span class="muted fw-normal">${esc(a.subjectCode)}</span></td><td>${esc(a.teacherName)}</td>
            <td><div class="row-actions">${rowBtn('change-teacher', a.id, 'Change teacher')}${rowBtn('delete-assignment', a.id, 'Remove', 'btn-outline-danger')}</div></td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No subjects assigned', 'Assign subjects and their teachers to this section. Teachers only see the students they teach.', 'fa-chalkboard-user')}</section>`;
    document.getElementById('section-select').addEventListener('change', (e) => { selectedSectionId = e.target.value; renderAssignments(); });
  } catch (err) { showError(pane, err.message, renderAssignments); }
}

async function addAssignment() {
  const [teachers, subs] = await Promise.all([teacherOptions(), api.get('/api/subjects').then((r) => opts(r.subjects))]);
  const created = await openForm({
    title: 'Assign subject', submitLabel: 'Assign',
    fields: [
      { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subs, placeholder: subs.length ? 'Choose a subject' : 'No subjects yet' },
      { name: 'teacherId', label: 'Teacher', type: 'select', required: true, options: teachers, placeholder: teachers.length ? 'Choose a teacher' : 'No teachers yet' },
    ],
    onSubmit: (v) => api.post('/api/class-subjects', { sectionId: Number(selectedSectionId), subjectId: Number(v.subjectId), teacherId: Number(v.teacherId) }),
  });
  if (created) { toast('Subject assigned.'); renderAssignments(); }
}
async function changeTeacher(id) {
  const a = assignments.find((x) => String(x.id) === id);
  const teachers = await teacherOptions();
  const saved = await openForm({
    title: `Teacher for ${a.subjectName}`, values: { teacherId: a.teacherId },
    fields: [{ name: 'teacherId', label: 'Teacher', type: 'select', required: true, options: teachers }],
    onSubmit: (v) => api.put(`/api/class-subjects/${id}`, { teacherId: Number(v.teacherId) }),
  });
  if (saved) { toast('Teacher changed.'); renderAssignments(); }
}
async function deleteAssignment(id) {
  const a = assignments.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Remove assignment?', message: `${a.subjectName} will no longer be taught by ${a.teacherName} in this section.`, confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  await api.del(`/api/class-subjects/${id}`);
  toast('Assignment removed.');
  renderAssignments();
}

// ---------- Wiring ----------
const ACTIONS = {
  'add-year': addYear, 'edit-year': editYear, 'set-current': setCurrent,
  'add-class': addClass, 'edit-class': editClass, 'delete-class': deleteClass,
  'add-section': addSection, 'edit-section': editSection, 'delete-section': deleteSection,
  'add-subject': addSubject, 'edit-subject': editSubject, 'delete-subject': deleteSubject,
  'add-assignment': addAssignment, 'change-teacher': changeTeacher, 'delete-assignment': deleteAssignment,
};

try {
  const user = await initLayout('academics', 'Academics');
  if (user.role !== 'admin') location.href = '/pages/dashboard.html';
  content.innerHTML = `
    <div class="page-head mb-3"><h1>Academics</h1><p>Set up the school year, classes, subjects and who teaches what. Do these in order, left to right.</p></div>
    <ul class="nav nav-tabs mb-3" role="tablist">
      <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-years" type="button" role="tab">Academic years</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-classes" type="button" role="tab">Classes and sections</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-subjects" type="button" role="tab">Subjects</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-assign" type="button" role="tab">Teaching assignments</button></li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="pane-years" role="tabpanel"></div>
      <div class="tab-pane fade" id="pane-classes" role="tabpanel"></div>
      <div class="tab-pane fade" id="pane-subjects" role="tabpanel"></div>
      <div class="tab-pane fade" id="pane-assign" role="tabpanel"></div>
    </div>`;
  const loaders = { '#pane-years': renderYears, '#pane-classes': renderClasses, '#pane-subjects': renderSubjects, '#pane-assign': renderAssignments };
  content.querySelectorAll('[data-bs-toggle="tab"]').forEach((b) => b.addEventListener('shown.bs.tab', () => loaders[b.dataset.bsTarget]()));
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b && ACTIONS[b.dataset.action]) run(ACTIONS[b.dataset.action])(b.dataset.id);
  });
  renderYears();
} catch (err) { showError(content, err.message); }
