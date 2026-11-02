import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, toast } from './ui.js';
import { openForm, confirmBox, credentialsBox, renderPager, debounce, badge, rowBtn } from './components.js';

const content = document.getElementById('content');
const state = { page: 1, search: '', status: '', sectionId: '' };
let rows = [];
let sections = [];
let isAdmin = false;

const sectionOptions = () => sections.map((s) => ({ value: s.id, label: s.label }));

function formFields() {
  return [
    { name: 'name', label: 'Full name', required: true, max: 120 },
    { name: 'email', label: 'Email (used to log in)', type: 'email', required: true, max: 190 },
    { name: 'admissionNo', label: 'Admission number', required: true, col: 6, max: 30 },
    { name: 'gender', label: 'Gender', type: 'select', col: 6, options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }], placeholder: 'Not specified' },
    { name: 'dob', label: 'Date of birth', type: 'date', col: 6 },
    { name: 'phone', label: 'Phone', type: 'tel', col: 6, max: 20 },
    { name: 'sectionId', label: 'Class and section', type: 'select', col: 8, options: sectionOptions(), placeholder: 'Not placed yet',
      help: sections.length ? 'Current academic year.' : 'No sections yet. Create the academic year, classes and sections under Academics first.' },
    { name: 'rollNo', label: 'Roll no.', type: 'number', col: 4, min: 1 },
    { name: 'address', label: 'Address', type: 'textarea', max: 255 },
  ];
}

async function load() {
  const list = document.getElementById('list');
  showLoading(list, 'Loading students...');
  try {
    const qs = new URLSearchParams({ page: state.page, search: state.search, status: state.status, sectionId: state.sectionId });
    const data = await api.get(`/api/students?${qs}`);
    rows = data.rows;
    const filtered = state.search || state.status || state.sectionId;
    list.innerHTML = rows.length
      ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Admission no.</th><th>Name</th><th>Class</th><th>Roll</th>${isAdmin ? '<th>Status</th><th></th>' : ''}</tr></thead><tbody>${rows.map((s) => `
          <tr><td>${esc(s.admissionNo)}</td>
          <td><a class="fw-semibold text-decoration-none" href="/pages/student.html?id=${s.id}">${esc(s.name)}</a></td>
          <td>${s.className ? `${esc(s.className)} - ${esc(s.sectionName)}` : '<span class="muted">Not placed</span>'}</td>
          <td>${s.rollNo ?? '<span class="muted">-</span>'}</td>
          ${isAdmin ? `<td>${badge(s.isActive)}</td><td><div class="row-actions">${rowBtn('edit', s.id, 'Edit')}${rowBtn('reset', s.id, 'Reset password')}${rowBtn('toggle', s.id, s.isActive ? 'Deactivate' : 'Activate', s.isActive ? 'btn-outline-danger' : 'btn-outline-success')}</div></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : emptyHtml(filtered ? 'No students match' : 'No students yet',
          filtered ? 'Try a different search or filter.' : (isAdmin ? 'Add your first student to get started.' : 'Students from the classes you teach will appear here.'), 'fa-user-graduate');
    renderPager(document.getElementById('pager'), { ...data, onPage: (p) => { state.page = p; load(); } });
  } catch (err) {
    showError(list, err.message, load);
  }
}

async function addStudent() {
  const created = await openForm({ title: 'Add student', fields: formFields(), submitLabel: 'Add student', onSubmit: (v) => api.post('/api/students', v) });
  if (created) { await credentialsBox({ title: 'Student added', name: created.name, email: created.email, password: created.temporaryPassword }); load(); }
}

async function editStudent(id) {
  const { student, current } = await api.get(`/api/students/${id}`);
  const values = { ...student, sectionId: current ? current.sectionId : '', rollNo: current ? current.rollNo ?? '' : '' };
  const saved = await openForm({ title: 'Edit student', fields: formFields(), values, onSubmit: (v) => api.put(`/api/students/${id}`, v) });
  if (saved) { toast('Student updated.'); load(); }
}

async function toggle(id) {
  const s = rows.find((r) => String(r.id) === id);
  const ok = await confirmBox({
    title: s.isActive ? 'Deactivate student?' : 'Activate student?',
    message: s.isActive ? `${s.name} will no longer be able to log in and will be hidden from teachers' lists. Their records are kept.` : `${s.name} will be able to log in again.`,
    confirmLabel: s.isActive ? 'Deactivate' : 'Activate', danger: s.isActive,
  });
  if (!ok) return;
  await api.patch(`/api/students/${id}/status`, { active: !s.isActive });
  toast(s.isActive ? 'Student deactivated.' : 'Student activated.');
  load();
}

async function reset(id) {
  const s = rows.find((r) => String(r.id) === id);
  const ok = await confirmBox({ title: 'Reset password?', message: `${s.name}'s current password will stop working and a new temporary one will be created.`, confirmLabel: 'Reset password' });
  if (!ok) return;
  const r = await api.post(`/api/students/${id}/reset-password`);
  await credentialsBox({ title: 'Password reset', name: r.name, email: r.email, password: r.temporaryPassword });
}

try {
  const user = await initLayout('students', 'Students');
  if (user.role !== 'admin' && user.role !== 'teacher') location.href = '/pages/dashboard.html';
  isAdmin = user.role === 'admin';
  sections = (await api.get('/api/sections/options')).sections;

  content.innerHTML = `
    <div class="page-head mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h1>${isAdmin ? 'Students' : 'My students'}</h1><p>${isAdmin ? 'All students, their class and login accounts.' : 'Students in the sections you teach.'}</p></div>
      ${isAdmin ? '<button class="btn btn-primary" id="add-btn"><i class="fa-solid fa-plus me-1"></i>Add student</button>' : ''}
    </div>
    <div class="toolbar">
      <input class="form-control grow" type="search" id="search" placeholder="Search by name, admission no. or email" aria-label="Search students">
      <select class="form-select w-auto" id="section" aria-label="Filter by section"><option value="">All sections</option>${sections.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
      ${isAdmin ? '<select class="form-select w-auto" id="status" aria-label="Filter by status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>' : ''}
    </div>
    <section class="panel"><div id="list"></div><div class="p-3" id="pager"></div></section>`;

  if (isAdmin) {
    document.getElementById('add-btn').addEventListener('click', () => addStudent().catch((e) => toast(e.message, 'error')));
    document.getElementById('status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
  }
  document.getElementById('search').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }));
  document.getElementById('section').addEventListener('change', (e) => { state.sectionId = e.target.value; state.page = 1; load(); });
  document.getElementById('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    ({ edit: editStudent, toggle, reset }[b.dataset.action])(b.dataset.id).catch((err) => toast(err.message, 'error'));
  });
  load();
} catch (err) { showError(content, err.message); }
