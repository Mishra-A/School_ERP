import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, toast } from './ui.js';
import { openForm, confirmBox, credentialsBox, renderPager, debounce, badge, rowBtn } from './components.js';

const content = document.getElementById('content');
const FIELDS = [
  { name: 'name', label: 'Full name', required: true, max: 120 },
  { name: 'email', label: 'Email (used to log in)', type: 'email', required: true, max: 190 },
  { name: 'phone', label: 'Phone', type: 'tel', col: 6, max: 20 },
  { name: 'occupation', label: 'Occupation', col: 6, max: 100 },
];
const state = { page: 1, search: '', status: '' };
let rows = [];

async function load() {
  const list = document.getElementById('list');
  showLoading(list, 'Loading parents...');
  try {
    const qs = new URLSearchParams({ page: state.page, search: state.search, status: state.status });
    const data = await api.get(`/api/parents?${qs}`);
    rows = data.rows;
    list.innerHTML = rows.length
      ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Name</th><th>Contact</th><th>Children</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((p) => `
          <tr><td><div class="fw-semibold">${esc(p.name)}</div><div class="muted small">${esc(p.occupation || '')}</div></td>
          <td><div>${esc(p.email)}</div><div class="muted small">${esc(p.phone || '')}</div></td>
          <td>${p.children ? esc(p.children) : '<span class="muted">Not linked yet</span>'}</td>
          <td>${badge(p.isActive)}</td>
          <td><div class="row-actions">${rowBtn('edit', p.id, 'Edit')}${rowBtn('reset', p.id, 'Reset password')}${rowBtn('toggle', p.id, p.isActive ? 'Deactivate' : 'Activate', p.isActive ? 'btn-outline-danger' : 'btn-outline-success')}</div></td></tr>`).join('')}</tbody></table></div>`
      : emptyHtml(state.search || state.status ? 'No parents match' : 'No parents yet', state.search || state.status ? 'Try a different search or filter.' : 'Add a parent, then link them to their child from the student\'s profile.', 'fa-people-roof');
    renderPager(document.getElementById('pager'), { ...data, onPage: (p) => { state.page = p; load(); } });
  } catch (err) {
    showError(list, err.message, load);
  }
}

async function addParent() {
  const created = await openForm({ title: 'Add parent', fields: FIELDS, submitLabel: 'Add parent', onSubmit: (v) => api.post('/api/parents', v) });
  if (created) { await credentialsBox({ title: 'Parent added', name: created.name, email: created.email, password: created.temporaryPassword }); load(); }
}

async function editParent(id) {
  const p = rows.find((r) => String(r.id) === id);
  const saved = await openForm({ title: 'Edit parent', fields: FIELDS, values: p, onSubmit: (v) => api.put(`/api/parents/${id}`, v) });
  if (saved) { toast('Parent updated.'); load(); }
}

async function toggle(id) {
  const p = rows.find((r) => String(r.id) === id);
  const ok = await confirmBox({
    title: p.isActive ? 'Deactivate parent?' : 'Activate parent?',
    message: p.isActive ? `${p.name} will no longer be able to log in. The link to their children is kept.` : `${p.name} will be able to log in again.`,
    confirmLabel: p.isActive ? 'Deactivate' : 'Activate', danger: p.isActive,
  });
  if (!ok) return;
  await api.patch(`/api/parents/${id}/status`, { active: !p.isActive });
  toast(p.isActive ? 'Parent deactivated.' : 'Parent activated.');
  load();
}

async function reset(id) {
  const p = rows.find((r) => String(r.id) === id);
  const ok = await confirmBox({ title: 'Reset password?', message: `${p.name}'s current password will stop working and a new temporary one will be created.`, confirmLabel: 'Reset password' });
  if (!ok) return;
  const r = await api.post(`/api/parents/${id}/reset-password`);
  await credentialsBox({ title: 'Password reset', name: r.name, email: r.email, password: r.temporaryPassword });
}

try {
  const user = await initLayout('parents', 'Parents');
  if (user.role !== 'admin') location.href = '/pages/dashboard.html';
  content.innerHTML = `
    <div class="page-head mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h1>Parents</h1><p>Parent and guardian accounts. Link each one to their child from the student's profile.</p></div>
      <button class="btn btn-primary" id="add-btn"><i class="fa-solid fa-plus me-1"></i>Add parent</button>
    </div>
    <div class="toolbar">
      <input class="form-control grow" type="search" id="search" placeholder="Search by name, email or phone" aria-label="Search parents">
      <select class="form-select w-auto" id="status" aria-label="Filter by status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
    </div>
    <section class="panel"><div id="list"></div><div class="p-3" id="pager"></div></section>`;
  document.getElementById('add-btn').addEventListener('click', addParent);
  document.getElementById('search').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }));
  document.getElementById('status').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
  document.getElementById('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    ({ edit: editParent, toggle, reset }[b.dataset.action])(b.dataset.id).catch((err) => toast(err.message, 'error'));
  });
  load();
} catch (err) { showError(content, err.message); }
