import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, toast } from './ui.js';
import { openForm, confirmBox, credentialsBox, renderPager, debounce, badge, rowBtn } from './components.js';

const content = document.getElementById('content');
const FIELDS = [
  { name: 'name', label: 'Full name', required: true, max: 120 },
  { name: 'email', label: 'Email (used to log in)', type: 'email', required: true, max: 190 },
  { name: 'employeeCode', label: 'Employee code', required: true, col: 6, max: 30 },
  { name: 'phone', label: 'Phone', type: 'tel', col: 6, max: 20 },
  { name: 'qualification', label: 'Qualification', col: 6, max: 150 },
  { name: 'joinedOn', label: 'Joining date', type: 'date', col: 6 },
];
const state = { page: 1, search: '', status: '' };
let rows = [];

async function load() {
  const list = document.getElementById('list');
  showLoading(list, 'Loading teachers...');
  try {
    const qs = new URLSearchParams({ page: state.page, search: state.search, status: state.status });
    const data = await api.get(`/api/teachers?${qs}`);
    rows = data.rows;
    list.innerHTML = rows.length
      ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Name</th><th>Code</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((t) => `
          <tr><td><div class="fw-semibold">${esc(t.name)}</div><div class="muted small">${esc(t.qualification || '')}</div></td>
          <td>${esc(t.employeeCode)}</td>
          <td><div>${esc(t.email)}</div><div class="muted small">${esc(t.phone || '')}</div></td>
          <td>${badge(t.isActive)}</td>
          <td><div class="row-actions">${rowBtn('edit', t.id, 'Edit')}${rowBtn('reset', t.id, 'Reset password')}${rowBtn('toggle', t.id, t.isActive ? 'Deactivate' : 'Activate', t.isActive ? 'btn-outline-danger' : 'btn-outline-success')}</div></td></tr>`).join('')}</tbody></table></div>`
      : emptyHtml(state.search || state.status ? 'No teachers match' : 'No teachers yet', state.search || state.status ? 'Try a different search or filter.' : 'Add your first teacher to get started.', 'fa-chalkboard-user');
    renderPager(document.getElementById('pager'), { ...data, onPage: (p) => { state.page = p; load(); } });
  } catch (err) {
    showError(list, err.message, load);
  }
}

async function addTeacher() {
  const created = await openForm({ title: 'Add teacher', fields: FIELDS, submitLabel: 'Add teacher', onSubmit: (v) => api.post('/api/teachers', v) });
  if (created) { await credentialsBox({ title: 'Teacher added', name: created.name, email: created.email, password: created.temporaryPassword }); load(); }
}

async function editTeacher(id) {
  const t = rows.find((r) => String(r.id) === id);
  const saved = await openForm({ title: 'Edit teacher', fields: FIELDS, values: t, onSubmit: (v) => api.put(`/api/teachers/${id}`, v) });
  if (saved) { toast('Teacher updated.'); load(); }
}

async function toggle(id) {
  const t = rows.find((r) => String(r.id) === id);
  const ok = await confirmBox({
    title: t.isActive ? 'Deactivate teacher?' : 'Activate teacher?',
    message: t.isActive ? `${t.name} will no longer be able to log in. Their records are kept.` : `${t.name} will be able to log in again.`,
    confirmLabel: t.isActive ? 'Deactivate' : 'Activate', danger: t.isActive,
  });
  if (!ok) return;
  await api.patch(`/api/teachers/${id}/status`, { active: !t.isActive });
  toast(t.isActive ? 'Teacher deactivated.' : 'Teacher activated.');
  load();
}

async function reset(id) {
  const t = rows.find((r) => String(r.id) === id);
  const ok = await confirmBox({ title: 'Reset password?', message: `${t.name}'s current password will stop working and a new temporary one will be created.`, confirmLabel: 'Reset password' });
  if (!ok) return;
  const r = await api.post(`/api/teachers/${id}/reset-password`);
  await credentialsBox({ title: 'Password reset', name: r.name, email: r.email, password: r.temporaryPassword });
}

try {
  const user = await initLayout('teachers', 'Teachers');
  if (user.role !== 'admin') location.href = '/pages/dashboard.html';
  content.innerHTML = `
    <div class="page-head mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h1>Teachers</h1><p>Teaching staff and their login accounts.</p></div>
      <button class="btn btn-primary" id="add-btn"><i class="fa-solid fa-plus me-1"></i>Add teacher</button>
    </div>
    <div class="toolbar">
      <input class="form-control grow" type="search" id="search" placeholder="Search by name, email or code" aria-label="Search teachers">
      <select class="form-select w-auto" id="status" aria-label="Filter by status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
    </div>
    <section class="panel"><div id="list"></div><div class="p-3" id="pager"></div></section>`;
  document.getElementById('add-btn').addEventListener('click', addTeacher);
  document.getElementById('search').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }));
  document.getElementById('status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
  document.getElementById('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    ({ edit: editTeacher, toggle, reset }[b.dataset.action])(b.dataset.id).catch((err) => toast(err.message, 'error'));
  });
  load();
} catch (err) { showError(content, err.message); }
