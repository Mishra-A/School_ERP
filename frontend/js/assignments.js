import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, fmtDateTime, toast } from './ui.js';
import { openForm, confirmBox, rowBtn } from './components.js';

const content = document.getElementById('content');
let role;
let isStaff = false;
let options = [];      // staff: section + subject pairs
let kids = [];         // parent: linked children
let kidId = null;
let list = [];
let materials = [];

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const run = (fn) => (...a) => fn(...a).catch((err) => toast(err.message, 'error'));
const link = (href, label, icon = 'fa-download') => `<a class="btn btn-sm btn-outline-secondary" href="${href}"><i class="fa-solid ${icon} me-1"></i>${esc(label)}</a>`;

function formData(values, extra = {}) {
  const fd = new FormData();
  Object.entries({ ...values, ...extra }).forEach(([k, v]) => { if (k === 'file') { if (v) fd.append('file', v); } else if (v !== null && v !== undefined) fd.append(k, v); });
  return fd;
}

const STATE_BADGE = {
  reviewed: '<span class="badge text-bg-success">Reviewed</span>',
  submitted: '<span class="badge text-bg-primary">Submitted</span>',
  missing: '<span class="badge text-bg-danger">Missing</span>',
  pending: '<span class="badge text-bg-secondary">To do</span>',
};

// ================================================= STAFF: assignments
async function loadStaffAssignments() {
  const box = document.getElementById('asg-list');
  showLoading(box);
  try {
    const f = document.getElementById('asg-filter').value;
    list = (await api.get(`/api/assignments${f ? `?classSubjectId=${f}` : ''}`)).assignments;
    box.innerHTML = list.length
      ? `<section class="panel"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Title</th><th>Class</th><th>Due</th><th>Submitted</th><th></th></tr></thead><tbody>${list.map((a) => `
          <tr><td class="fw-semibold">${esc(a.title)}${a.hasFile ? ' <i class="fa-solid fa-paperclip muted" title="Has attachment"></i>' : ''}</td>
          <td>${esc(a.sectionLabel)}<div class="muted small">${esc(a.subjectName)}</div></td><td>${fmtDate(a.dueDate)}</td>
          <td>${a.submitted} / ${a.totalStudents}</td>
          <td><div class="row-actions">${rowBtn('subs', a.id, 'Submissions', 'btn-outline-primary')}${rowBtn('edit-asg', a.id, 'Edit')}${rowBtn('del-asg', a.id, 'Delete', 'btn-outline-danger')}</div></td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="panel">${emptyHtml('No assignments yet', 'Create one and your students will see it straight away.', 'fa-book-open')}</section>`;
  } catch (err) { showError(box, err.message, loadStaffAssignments); }
}

async function newAssignment() {
  const saved = await openForm({
    title: 'New assignment', submitLabel: 'Create assignment',
    fields: [
      { name: 'classSubjectId', label: 'Class and subject', type: 'select', required: true, options: options.map((o) => ({ value: o.classSubjectId, label: `${o.sectionLabel} - ${o.subjectName}` })) },
      { name: 'title', label: 'Title', required: true, max: 150 },
      { name: 'description', label: 'Instructions', type: 'textarea', max: 2000 },
      { name: 'dueDate', label: 'Due date', type: 'date', required: true, min: todayStr() },
      { name: 'file', label: 'Attachment (optional)', type: 'file', help: 'PDF, Word, Excel, PowerPoint, text or image. Up to 10 MB.' },
    ],
    onSubmit: (v) => api.upload('POST', '/api/assignments', formData(v)),
  });
  if (saved) { toast('Assignment created.'); loadStaffAssignments(); }
}

async function editAssignment(id) {
  const a = list.find((x) => String(x.id) === id);
  const full = (await api.get(`/api/assignments/${id}`)).assignment;
  const saved = await openForm({
    title: 'Edit assignment', values: full,
    fields: [
      { name: 'title', label: 'Title', required: true, max: 150 },
      { name: 'description', label: 'Instructions', type: 'textarea', max: 2000 },
      { name: 'dueDate', label: 'Due date', type: 'date', required: true },
      { name: 'file', label: a.hasFile ? 'Replace attachment (optional)' : 'Attachment (optional)', type: 'file', help: a.hasFile ? 'Leave empty to keep the current file.' : '' },
    ],
    onSubmit: (v) => api.upload('PUT', `/api/assignments/${id}`, formData(v)),
  });
  if (saved) { toast('Assignment updated.'); loadStaffAssignments(); }
}

async function deleteAssignment(id) {
  const a = list.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete assignment?', message: `"${a.title}" will be deleted. This only works if nobody has submitted yet.`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await api.del(`/api/assignments/${id}`);
  toast('Assignment deleted.');
  loadStaffAssignments();
}

async function showSubmissions(id) {
  const pane = document.getElementById('pane-asg');
  showLoading(pane);
  try {
    const { assignment: a, rows } = await api.get(`/api/assignments/${id}/submissions`);
    const state = (r) => (!r.submissionId ? '<span class="badge text-bg-danger">Not submitted</span>' : r.status === 'reviewed' ? '<span class="badge text-bg-success">Reviewed</span>' : '<span class="badge text-bg-primary">Submitted</span>') + (r.isLate ? ' <span class="badge text-bg-warning">Late</span>' : '');
    pane.innerHTML = `
      <button class="btn btn-link px-0 mb-2" id="back"><i class="fa-solid fa-arrow-left me-1"></i>All assignments</button>
      <section class="panel"><div class="panel-head"><h2>${esc(a.title)}</h2><span class="muted">${esc(a.sectionLabel)} &middot; ${esc(a.subjectName)} &middot; due ${fmtDate(a.dueDate)}</span></div>
        ${rows.length ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Roll</th><th>Student</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>${rows.map((r) => `
          <tr><td>${r.rollNo ?? '-'}</td><td class="fw-semibold">${esc(r.name)}</td><td>${state(r)}${r.feedback ? `<div class="muted small mt-1">${esc(r.feedback)}</div>` : ''}</td>
          <td>${r.submittedAt ? fmtDateTime(r.submittedAt) : '<span class="muted">-</span>'}</td>
          <td><div class="row-actions">${r.submissionId ? `${link(`/api/assignments/submissions/${r.submissionId}/file`, 'Download')}${rowBtn('review', r.submissionId, r.status === 'reviewed' ? 'Edit feedback' : 'Review', 'btn-outline-primary')}` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
          : emptyHtml('No students in this section', '', 'fa-user-graduate')}</section>`;
    document.getElementById('back').addEventListener('click', renderStaffAssignments);
    pane.querySelectorAll('[data-action=review]').forEach((b) => b.addEventListener('click', run(async () => {
      const row = rows.find((r) => String(r.submissionId) === b.dataset.id);
      const saved = await openForm({
        title: `Feedback for ${row.name}`, values: { feedback: row.feedback || '' }, submitLabel: 'Save feedback',
        fields: [{ name: 'feedback', label: 'Feedback', type: 'textarea', required: true, max: 1000 }],
        onSubmit: (v) => api.put(`/api/assignments/submissions/${b.dataset.id}/review`, v),
      });
      if (saved) { toast('Feedback saved.'); showSubmissions(id); }
    })));
  } catch (err) { showError(pane, err.message, () => showSubmissions(id)); }
}

function renderStaffAssignments() {
  const pane = document.getElementById('pane-asg');
  pane.innerHTML = `
    <div class="toolbar">
      <select class="form-select w-auto" id="asg-filter" aria-label="Filter by class"><option value="">All my classes</option>${options.map((o) => `<option value="${o.classSubjectId}">${esc(o.sectionLabel)} - ${esc(o.subjectName)}</option>`).join('')}</select>
      <button class="btn btn-primary ms-auto" id="new-asg"><i class="fa-solid fa-plus me-1"></i>New assignment</button>
    </div><div id="asg-list"></div>`;
  document.getElementById('asg-filter').addEventListener('change', loadStaffAssignments);
  document.getElementById('new-asg').addEventListener('click', run(newAssignment));
  document.getElementById('asg-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    ({ subs: showSubmissions, 'edit-asg': editAssignment, 'del-asg': deleteAssignment }[b.dataset.action])(b.dataset.id).catch((err) => toast(err.message, 'error'));
  });
  loadStaffAssignments();
}

// ================================================= STAFF: materials
async function loadStaffMaterials() {
  const box = document.getElementById('mat-list');
  showLoading(box);
  try {
    const f = document.getElementById('mat-filter').value;
    materials = (await api.get(`/api/materials${f ? `?classSubjectId=${f}` : ''}`)).materials;
    box.innerHTML = materialTable(materials, true);
  } catch (err) { showError(box, err.message, loadStaffMaterials); }
}

function materialTable(rows, canDelete) {
  return rows.length
    ? `<section class="panel"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Title</th><th>Class</th><th>Added</th><th></th></tr></thead><tbody>${rows.map((m) => `
        <tr><td class="fw-semibold">${esc(m.title)}${m.description ? `<div class="muted small fw-normal">${esc(m.description)}</div>` : ''}</td>
        <td>${esc(m.sectionLabel)}<div class="muted small">${esc(m.subjectName)}</div></td><td>${fmtDate(String(m.createdAt).slice(0, 10))}</td>
        <td><div class="row-actions">${link(`/api/materials/${m.id}/file`, 'Download')}${canDelete ? rowBtn('del-mat', m.id, 'Delete', 'btn-outline-danger') : ''}</div></td></tr>`).join('')}</tbody></table></div></section>`
    : `<section class="panel">${emptyHtml('No study material yet', isStaff ? 'Upload notes or worksheets for your classes.' : 'Notes and worksheets from your teachers will appear here.', 'fa-folder-open')}</section>`;
}

async function uploadMaterial() {
  const saved = await openForm({
    title: 'Upload study material', submitLabel: 'Upload',
    fields: [
      { name: 'classSubjectId', label: 'Class and subject', type: 'select', required: true, options: options.map((o) => ({ value: o.classSubjectId, label: `${o.sectionLabel} - ${o.subjectName}` })) },
      { name: 'title', label: 'Title', required: true, max: 150 },
      { name: 'description', label: 'Description', type: 'textarea', max: 2000 },
      { name: 'file', label: 'File', type: 'file', required: true, help: 'PDF, Word, Excel, PowerPoint, text or image. Up to 10 MB.' },
    ],
    onSubmit: (v) => api.upload('POST', '/api/materials', formData(v)),
  });
  if (saved) { toast('Material uploaded.'); loadStaffMaterials(); }
}

async function deleteMaterial(id) {
  const m = materials.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete material?', message: `"${m.title}" will be removed for everyone.`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await api.del(`/api/materials/${id}`);
  toast('Material deleted.');
  loadStaffMaterials();
}

function renderStaffMaterials() {
  const pane = document.getElementById('pane-mat');
  pane.innerHTML = `
    <div class="toolbar">
      <select class="form-select w-auto" id="mat-filter" aria-label="Filter by class"><option value="">All my classes</option>${options.map((o) => `<option value="${o.classSubjectId}">${esc(o.sectionLabel)} - ${esc(o.subjectName)}</option>`).join('')}</select>
      <button class="btn btn-primary ms-auto" id="new-mat"><i class="fa-solid fa-upload me-1"></i>Upload material</button>
    </div><div id="mat-list"></div>`;
  document.getElementById('mat-filter').addEventListener('change', loadStaffMaterials);
  document.getElementById('new-mat').addEventListener('click', run(uploadMaterial));
  document.getElementById('mat-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action=del-mat]');
    if (b) run(deleteMaterial)(b.dataset.id);
  });
  loadStaffMaterials();
}

// ================================================= STUDENT / PARENT
const childQuery = () => (role === 'parent' ? `?studentId=${kidId}` : '');

async function loadStudentAssignments() {
  const box = document.getElementById('asg-list');
  showLoading(box);
  try {
    list = (await api.get(`/api/assignments${childQuery()}`)).assignments;
    box.innerHTML = list.length
      ? `<section class="panel"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${list.map((a) => `
          <tr><td class="fw-semibold">${esc(a.title)}<div class="muted small fw-normal">${esc(a.subjectName)}</div>${a.description ? `<div class="small mt-1">${esc(a.description)}</div>` : ''}${a.feedback ? `<div class="small mt-1"><strong>Feedback:</strong> ${esc(a.feedback)}</div>` : ''}</td>
          <td>${fmtDate(a.dueDate)}</td>
          <td>${STATE_BADGE[a.state]}${a.isLate ? ' <span class="badge text-bg-warning">Late</span>' : ''}</td>
          <td><div class="row-actions">${a.hasFile ? link(`/api/assignments/${a.id}/file`, 'Attachment', 'fa-paperclip') : ''}${a.submissionId ? link(`/api/assignments/submissions/${a.submissionId}/file`, 'My work', 'fa-file') : ''}
            ${role === 'student' && a.state !== 'reviewed' ? rowBtn('submit', a.id, a.submissionId ? 'Replace' : 'Submit', 'btn-primary') : ''}</div></td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="panel">${emptyHtml('No assignments yet', 'Homework from your teachers will show up here.', 'fa-book-open')}</section>`;
  } catch (err) { showError(box, err.message, loadStudentAssignments); }
}

async function submitWork(id) {
  const a = list.find((x) => String(x.id) === id);
  const saved = await openForm({
    title: `Submit: ${a.title}`, submitLabel: 'Submit work',
    fields: [{ name: 'file', label: 'Your file', type: 'file', required: true, help: 'PDF, Word, Excel, PowerPoint, text or image. Up to 10 MB. Submitting again replaces your earlier file until your teacher reviews it.' }],
    onSubmit: (v) => api.upload('POST', `/api/assignments/${id}/submit`, formData(v)),
  });
  if (saved) { toast('Work submitted.'); loadStudentAssignments(); }
}

async function loadStudentMaterials() {
  const box = document.getElementById('mat-list');
  showLoading(box);
  try {
    materials = (await api.get(`/api/materials${childQuery()}`)).materials;
    box.innerHTML = materialTable(materials, false);
  } catch (err) { showError(box, err.message, loadStudentMaterials); }
}

function renderLearner() {
  document.getElementById('pane-asg').innerHTML = '<div id="asg-list"></div>';
  document.getElementById('pane-mat').innerHTML = '<div id="mat-list"></div>';
  document.getElementById('asg-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action=submit]');
    if (b) run(submitWork)(b.dataset.id);
  });
  loadStudentAssignments();
  loadStudentMaterials();
}

// ================================================= boot
try {
  const user = await initLayout('assignments', 'Assignments');
  role = user.role;
  isStaff = role === 'admin' || role === 'teacher';

  let toolbar = '';
  if (isStaff) {
    options = (await api.get('/api/class-subjects/mine')).options;
  } else {
    kids = (await api.get('/api/students/mine')).students;
    kidId = kids[0] && kids[0].id;
    if (role === 'parent') toolbar = `<div class="toolbar"><label class="muted" for="kid">Child</label><select class="form-select w-auto" id="kid">${kids.map((k) => `<option value="${k.id}">${esc(k.name)}${k.className ? ` (${esc(k.className)} - ${esc(k.sectionName)})` : ''}</option>`).join('')}</select></div>`;
  }

  const empty = isStaff ? !options.length : !kids.length;
  if (empty) {
    content.innerHTML = `<div class="page-head mb-3"><h1>Assignments</h1></div><section class="panel">${emptyHtml(
      isStaff ? 'No classes assigned yet' : role === 'parent' ? 'No child linked yet' : 'Not available yet',
      isStaff ? 'Subjects assigned to you will let you create assignments and share material.' : 'The school office needs to set this up first.', 'fa-book-open')}</section>`;
  } else {
    content.innerHTML = `
      <div class="page-head mb-3"><h1>Assignments</h1><p>${isStaff ? 'Set homework, review submissions and share study material.' : 'Homework, submissions and study material.'}</p></div>
      ${toolbar}
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-asg" type="button" role="tab">Assignments</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-mat" type="button" role="tab">Study material</button></li>
      </ul>
      <div class="tab-content"><div class="tab-pane fade show active" id="pane-asg" role="tabpanel"></div><div class="tab-pane fade" id="pane-mat" role="tabpanel"></div></div>`;
    if (isStaff) { renderStaffAssignments(); renderStaffMaterials(); } else {
      renderLearner();
      const kidSel = document.getElementById('kid');
      if (kidSel) kidSel.addEventListener('change', (e) => { kidId = Number(e.target.value); loadStudentAssignments(); loadStudentMaterials(); });
    }
  }
} catch (err) { showError(content, err.message); }
