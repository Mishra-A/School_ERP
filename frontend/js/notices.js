import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, toast } from './ui.js';
import { openForm, confirmBox, renderPager } from './components.js';

const content = document.getElementById('content');
let role;
let canWrite = false;
let classes = [];
let rows = [];
let page = 1;

const AUDIENCE = { all: 'Everyone', teachers: 'Teachers', students: 'Students', parents: 'Parents' };
const run = (fn) => (...a) => fn(...a).catch((err) => toast(err.message, 'error'));

function formData(v) {
  const fd = new FormData();
  Object.entries(v).forEach(([k, val]) => { if (k === 'file') { if (val) fd.append('file', val); } else if (val !== null && val !== undefined) fd.append(k, val); });
  return fd;
}

function fields(existing) {
  const audiences = role === 'admin' ? ['all', 'teachers', 'students', 'parents'] : ['all', 'students', 'parents'];
  return [
    { name: 'title', label: 'Title', required: true, max: 150 },
    { name: 'description', label: 'Message', type: 'textarea', required: true, max: 5000 },
    { name: 'audience', label: 'Who should see it', type: 'select', required: true, col: 6, options: audiences.map((a) => ({ value: a, label: AUDIENCE[a] })) },
    { name: 'classId', label: role === 'admin' ? 'Class (optional)' : 'Class', type: 'select', required: role === 'teacher', col: 6, options: classes.map((c) => ({ value: c.id, label: c.name })),
      placeholder: role === 'admin' ? 'Whole school' : 'Choose a class', help: role === 'admin' ? 'Leave empty for a school-wide notice.' : 'Teachers can notify the classes they teach.' },
    { name: 'publishDate', label: 'Publish on (optional)', type: 'date', col: 6, help: 'Leave empty to publish now. A future date keeps it hidden until then.' },
    { name: 'file', label: existing && existing.hasAttachment ? 'Replace attachment (optional)' : 'Attachment (optional)', type: 'file', col: 6, help: 'PDF, Word, Excel, PowerPoint, text or image. Up to 10 MB.' },
  ];
}

async function load() {
  const list = document.getElementById('list');
  showLoading(list, 'Loading notices...');
  try {
    const d = await api.get(`/api/notices?page=${page}&limit=10`);
    rows = d.rows;
    list.innerHTML = rows.length
      ? rows.map((n) => `
        <article class="panel mb-3"><div class="panel-body">
          <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <h2 class="h5 mb-1">${esc(n.title)}</h2>
            <div class="d-flex gap-1 flex-wrap">
              <span class="badge text-bg-secondary">${esc(AUDIENCE[n.audience])}</span>${n.className ? `<span class="badge text-bg-primary">${esc(n.className)}</span>` : ''}${n.scheduled ? '<span class="badge text-bg-warning">Scheduled</span>' : ''}
            </div>
          </div>
          <div class="muted small mb-2">${fmtDate(n.publishDate)} &middot; ${esc(n.createdByName)}</div>
          <p style="white-space:pre-wrap" class="mb-2">${esc(n.description)}</p>
          <div class="d-flex gap-2 flex-wrap">
            ${n.hasAttachment ? `<a class="btn btn-sm btn-outline-secondary" href="/api/notices/${n.id}/attachment"><i class="fa-solid fa-paperclip me-1"></i>Attachment</a>` : ''}
            ${n.canEdit ? `<button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${n.id}">Edit</button><button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${n.id}">Delete</button>` : ''}
          </div>
        </div></article>`).join('')
      : `<section class="panel">${emptyHtml('No notices', canWrite ? 'Post the first notice for your students and parents.' : 'Notices from the school will appear here.', 'fa-bullhorn')}</section>`;
    renderPager(document.getElementById('pager'), { ...d, onPage: (p) => { page = p; load(); } });
  } catch (err) { showError(list, err.message, load); }
}

async function newNotice() {
  if (role === 'teacher' && !classes.length) { toast('You have no classes assigned yet.', 'error'); return; }
  const saved = await openForm({ title: 'New notice', submitLabel: 'Post notice', fields: fields(), values: { audience: 'all' }, onSubmit: (v) => api.upload('POST', '/api/notices', formData(v)) });
  if (saved) { toast('Notice posted.'); page = 1; load(); }
}

async function editNotice(id) {
  const n = rows.find((x) => String(x.id) === id);
  const saved = await openForm({
    title: 'Edit notice', fields: fields(n), values: { ...n, classId: n.classId ?? '' },
    onSubmit: (v) => api.upload('PUT', `/api/notices/${id}`, formData(v)),
  });
  if (saved) { toast('Notice updated.'); load(); }
}

async function deleteNotice(id) {
  const n = rows.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete notice?', message: `"${n.title}" will be removed for everyone.`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await api.del(`/api/notices/${id}`);
  toast('Notice deleted.');
  load();
}

try {
  const user = await initLayout('notices', 'Notices');
  role = user.role;
  canWrite = role === 'admin' || role === 'teacher';
  if (canWrite) classes = (await api.get('/api/notices/classes')).classes;
  content.innerHTML = `
    <div class="page-head mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h1>Notices</h1><p>${canWrite ? 'Announcements for students, parents and staff.' : 'Announcements from the school and your teachers.'}</p></div>
      ${canWrite ? '<button class="btn btn-primary" id="new-notice"><i class="fa-solid fa-plus me-1"></i>New notice</button>' : ''}
    </div>
    <div id="list"></div><div id="pager"></div>`;
  if (canWrite) document.getElementById('new-notice').addEventListener('click', run(newNotice));
  document.getElementById('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    run({ edit: editNotice, delete: deleteNotice }[b.dataset.action])(b.dataset.id);
  });
  load();
} catch (err) { showError(content, err.message); }
