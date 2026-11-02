import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, fmtDay, toast } from './ui.js';
import { openForm, confirmBox, rowBtn } from './components.js';

const content = document.getElementById('content');
let isAdmin = false;
let classes = [];
let exams = [];
let current = null; // exam being viewed

const run = (fn) => (...a) => fn(...a).catch((err) => toast(err.message, 'error'));
const num = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : String(Number(n)));

// ---------------------------------------------------------------- exams list
async function loadList() {
  const pane = document.getElementById('pane-exams');
  showLoading(pane);
  try {
    exams = (await api.get('/api/exams')).exams;
    pane.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <p class="muted mb-0">${isAdmin ? 'Create an exam for a class, then add its subjects with dates and marks.' : 'Exams for the classes you teach.'}</p>
        ${isAdmin ? '<button class="btn btn-primary" data-action="new-exam"><i class="fa-solid fa-plus me-1"></i>New exam</button>' : ''}
      </div>
      <section class="panel">${exams.length
        ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Exam</th><th>Class</th><th>Dates</th><th>Subjects</th><th></th></tr></thead><tbody>${exams.map((e) => `
            <tr><td class="fw-semibold">${esc(e.name)}</td><td>${esc(e.className)}</td>
            <td>${e.startDate ? `${fmtDate(e.startDate)}${e.endDate ? ` - ${fmtDate(e.endDate)}` : ''}` : '<span class="muted">Not set</span>'}</td><td>${e.subjectCount}</td>
            <td><div class="row-actions">${rowBtn('open', e.id, isAdmin ? 'Subjects and dates' : 'View', 'btn-outline-primary')}${isAdmin ? `${rowBtn('edit-exam', e.id, 'Edit')}${rowBtn('del-exam', e.id, 'Delete', 'btn-outline-danger')}` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No exams yet', isAdmin ? 'Create the first exam, for example "Unit Test 1".' : 'Exams for your classes will appear here.', 'fa-file-pen')}</section>`;
  } catch (err) { showError(pane, err.message, loadList); }
}

const EXAM_FIELDS = [
  { name: 'name', label: 'Exam name', required: true, placeholder: 'e.g. Unit Test 1', max: 100 },
  { name: 'startDate', label: 'Starts on', type: 'date', col: 6 },
  { name: 'endDate', label: 'Ends on', type: 'date', col: 6 },
];

async function newExam() {
  if (!classes.length) { toast('Create an academic year and classes under Academics first.', 'error'); return; }
  const created = await openForm({
    title: 'New exam', submitLabel: 'Create exam',
    fields: [{ name: 'classId', label: 'Class', type: 'select', required: true, options: classes.map((c) => ({ value: c.id, label: c.name })) }, ...EXAM_FIELDS],
    onSubmit: (v) => api.post('/api/exams', { ...v, classId: Number(v.classId) }),
  });
  if (created) { toast('Exam created. Now add its subjects.'); await loadList(); openExam(String(created.id)); }
}

async function editExam(id) {
  const e = exams.find((x) => String(x.id) === id);
  const saved = await openForm({ title: 'Edit exam', fields: EXAM_FIELDS, values: e, onSubmit: (v) => api.put(`/api/exams/${id}`, v) });
  if (saved) { toast('Exam updated.'); loadList(); }
}

async function deleteExam(id) {
  const e = exams.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete exam?', message: `"${e.name}" and its subject schedule will be deleted. This only works if no marks have been entered.`, confirmLabel: 'Delete exam', danger: true });
  if (!ok) return;
  await api.del(`/api/exams/${id}`);
  toast('Exam deleted.');
  loadList();
}

// ---------------------------------------------------------------- one exam: date sheet
let schedule = [];
async function openExam(id) {
  const pane = document.getElementById('pane-exams');
  showLoading(pane);
  try {
    const data = await api.get(`/api/exams/${id}`);
    current = data.exam;
    schedule = data.schedule;
    pane.innerHTML = `
      <button class="btn btn-link px-0 mb-2" data-action="back"><i class="fa-solid fa-arrow-left me-1"></i>All exams</button>
      <section class="panel"><div class="panel-head"><h2>${esc(current.name)} <span class="muted fw-normal">&middot; ${esc(current.className)}</span></h2>
        ${isAdmin ? '<button class="btn btn-sm btn-primary" data-action="add-subject"><i class="fa-solid fa-plus me-1"></i>Add subject</button>' : ''}</div>
        ${schedule.length
          ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th class="text-end">Max marks</th><th class="text-end">Pass marks</th>${isAdmin ? '<th class="text-end">Marks entered</th><th></th>' : ''}</tr></thead><tbody>${schedule.map((s) => `
              <tr><td class="fw-semibold">${esc(s.subjectName)}</td><td>${fmtDay(s.examDate)}</td><td>${s.startTime || '<span class="muted">-</span>'}</td><td class="text-end">${num(s.maxMarks)}</td><td class="text-end">${num(s.passMarks)}</td>
              ${isAdmin ? `<td class="text-end">${s.marksCount}</td><td><div class="row-actions">${rowBtn('edit-sub', s.id, 'Edit')}${rowBtn('del-sub', s.id, 'Remove', 'btn-outline-danger')}</div></td>` : ''}</tr>`).join('')}</tbody></table></div>`
          : emptyHtml('No subjects yet', isAdmin ? 'Add each subject with its date, maximum marks and pass marks.' : 'The office is still setting this up.', 'fa-list-check')}
      </section>`;
  } catch (err) { showError(pane, err.message, () => openExam(id)); }
}

const subjectFields = (subjects, editing) => [
  ...(editing ? [] : [{ name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subjects, placeholder: subjects.length ? 'Choose a subject' : 'No subjects left to add' }]),
  { name: 'examDate', label: 'Date', type: 'date', required: true, col: 6 },
  { name: 'startTime', label: 'Start time', type: 'time', col: 6 },
  { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, col: 6, min: 1 },
  { name: 'passMarks', label: 'Pass marks', type: 'number', required: true, col: 6, min: 0 },
];
const subjPayload = (v) => ({ ...v, maxMarks: Number(v.maxMarks), passMarks: Number(v.passMarks), subjectId: v.subjectId ? Number(v.subjectId) : undefined });

async function addSubject() {
  const all = (await api.get('/api/subjects')).subjects;
  const used = new Set(schedule.map((s) => s.subjectId));
  const options = all.filter((s) => !used.has(s.id)).map((s) => ({ value: s.id, label: s.name }));
  const saved = await openForm({ title: `Add subject to ${current.name}`, submitLabel: 'Add subject', fields: subjectFields(options, false), onSubmit: (v) => api.post(`/api/exams/${current.id}/schedule`, subjPayload(v)) });
  if (saved) { toast('Subject added.'); openExam(current.id); }
}
async function editSubject(id) {
  const s = schedule.find((x) => String(x.id) === id);
  const saved = await openForm({ title: `${s.subjectName}: date and marks`, fields: subjectFields([], true), values: s, onSubmit: (v) => api.put(`/api/exams/schedule/${id}`, subjPayload(v)) });
  if (saved) { toast('Subject updated.'); openExam(current.id); }
}
async function removeSubject(id) {
  const s = schedule.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Remove subject?', message: `${s.subjectName} will be removed from this exam. This only works if no marks are entered.`, confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  await api.del(`/api/exams/schedule/${id}`);
  toast('Subject removed.');
  openExam(current.id);
}

// ---------------------------------------------------------------- grade scale
let scale = [];
function renderScale() {
  const pane = document.getElementById('pane-grades');
  pane.innerHTML = `
    <p class="muted">Each grade starts at the percentage you set and runs up to the next grade. The lowest grade must start at 0. Changes apply to every report card straight away.</p>
    <section class="panel"><div class="panel-body">
      <div id="grade-rows">${scale.map((g, i) => `
        <div class="row g-2 align-items-center mb-2" data-row="${i}">
          <div class="col-4 col-md-2"><label class="visually-hidden" for="g-name-${i}">Grade</label><input class="form-control" id="g-name-${i}" value="${esc(g.grade)}" maxlength="5" aria-label="Grade name"></div>
          <div class="col-5 col-md-3"><div class="input-group"><span class="input-group-text">from</span><input class="form-control" id="g-min-${i}" type="number" min="0" max="100" step="0.01" value="${g.minPercent}" aria-label="Minimum percentage"><span class="input-group-text">%</span></div></div>
          <div class="col-3"><button class="btn btn-sm btn-outline-danger" data-action="del-grade" data-i="${i}" aria-label="Remove grade">Remove</button></div>
        </div>`).join('')}</div>
      <div class="d-flex gap-2 mt-3"><button class="btn btn-outline-secondary" data-action="add-grade">Add grade</button><button class="btn btn-primary" data-action="save-grades">Save grade scale</button></div>
      <div class="alert alert-danger d-none mt-3 mb-0" id="grade-error" role="alert"></div>
    </div></section>`;
}
function readScale() {
  return [...document.querySelectorAll('#grade-rows [data-row]')].map((row) => ({
    grade: row.querySelector('input[id^=g-name]').value.trim(), minPercent: row.querySelector('input[id^=g-min]').value,
  }));
}
async function loadScale() {
  const pane = document.getElementById('pane-grades');
  showLoading(pane);
  try { scale = (await api.get('/api/grades')).grades; renderScale(); } catch (err) { showError(pane, err.message, loadScale); }
}
async function saveScale() {
  const err = document.getElementById('grade-error');
  err.classList.add('d-none');
  const grades = readScale().map((g) => ({ grade: g.grade, minPercent: g.minPercent === '' ? '' : Number(g.minPercent) }));
  try {
    await api.put('/api/grades', { grades });
    toast('Grade scale saved.');
    loadScale();
  } catch (e) { err.textContent = e.message; err.classList.remove('d-none'); }
}

// ---------------------------------------------------------------- wiring
try {
  const user = await initLayout('exams', 'Exams');
  if (user.role !== 'admin' && user.role !== 'teacher') location.href = '/pages/dashboard.html';
  isAdmin = user.role === 'admin';
  if (isAdmin) {
    const years = (await api.get('/api/academic-years')).years;
    const cur = years.find((y) => y.isCurrent);
    classes = cur ? (await api.get(`/api/classes?yearId=${cur.id}`)).classes : [];
  }
  content.innerHTML = `
    <div class="page-head mb-3"><h1>Exams</h1><p>${isAdmin ? 'Set up exams, their subjects and marks, and the grade scale.' : 'The exams for your classes. Enter marks under Marks and results.'}</p></div>
    ${isAdmin ? `<ul class="nav nav-tabs mb-3" role="tablist">
      <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-exams" type="button" role="tab">Exams</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-grades" type="button" role="tab">Grade scale</button></li></ul>` : ''}
    <div class="tab-content"><div class="tab-pane fade show active" id="pane-exams" role="tabpanel"></div>${isAdmin ? '<div class="tab-pane fade" id="pane-grades" role="tabpanel"></div>' : ''}</div>`;
  if (isAdmin) document.querySelector('[data-bs-target="#pane-grades"]').addEventListener('shown.bs.tab', loadScale);
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'del-grade') { scale = readScale().map((g) => ({ grade: g.grade, minPercent: g.minPercent })); scale.splice(Number(b.dataset.i), 1); renderScale(); return; }
    if (a === 'add-grade') { scale = readScale().map((g) => ({ grade: g.grade, minPercent: g.minPercent })); scale.push({ grade: '', minPercent: '' }); renderScale(); return; }
    const fn = { 'new-exam': newExam, 'edit-exam': editExam, 'del-exam': deleteExam, open: openExam, back: loadList, 'add-subject': addSubject, 'edit-sub': editSubject, 'del-sub': removeSubject, 'save-grades': saveScale }[a];
    if (fn) run(fn)(b.dataset.id);
  });
  loadList();
} catch (err) { showError(content, err.message); }
