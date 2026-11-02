import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDateTime, toast } from './ui.js';
import { renderPager } from './components.js';

const content = document.getElementById('content');
let page = 1;

async function load() {
  const list = document.getElementById('list');
  showLoading(list, 'Loading notifications...');
  try {
    const d = await api.get(`/api/notifications?page=${page}&limit=15`);
    document.getElementById('summary').textContent = d.unread ? `${d.unread} unread` : 'All caught up';
    list.innerHTML = d.rows.length
      ? `<section class="panel"><ul class="list-plain">${d.rows.map((n) => `<li>
          <a class="text-decoration-none d-block" href="${esc(n.link || '#')}" data-notif="${n.id}">
            <div class="d-flex justify-content-between gap-2"><span class="${n.isRead ? '' : 'fw-semibold'}">${n.isRead ? '' : '<span class="badge text-bg-primary me-2">New</span>'}${esc(n.title)}</span><span class="muted small text-nowrap">${fmtDateTime(n.createdAt)}</span></div>
            ${n.message ? `<div class="muted">${esc(n.message)}</div>` : ''}</a></li>`).join('')}</ul></section>`
      : `<section class="panel">${emptyHtml('No notifications yet', 'New notices, assignments, marks, fees and alerts will show up here.', 'fa-bell')}</section>`;
    renderPager(document.getElementById('pager'), { ...d, onPage: (p) => { page = p; load(); } });
  } catch (err) { showError(list, err.message, load); }
}

try {
  await initLayout(null, 'Notifications');
  content.innerHTML = `
    <div class="page-head mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h1>Notifications</h1><p id="summary"></p></div>
      <button class="btn btn-outline-secondary" id="read-all"><i class="fa-solid fa-check-double me-1"></i>Mark all as read</button>
    </div>
    <div id="list"></div><div id="pager"></div>`;
  document.getElementById('read-all').addEventListener('click', async () => {
    try { await api.post('/api/notifications/read-all'); toast('All marked as read.'); load(); } catch (err) { toast(err.message, 'error'); }
  });
  document.getElementById('list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-notif]');
    if (a) api.post(`/api/notifications/${a.dataset.notif}/read`).catch(() => {});
  });
  load();
} catch (err) { showError(content, err.message); }
