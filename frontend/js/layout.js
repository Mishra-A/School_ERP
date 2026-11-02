import { api } from './api.js';
import { esc, toast } from './ui.js';
import { NAV, ROLE_LABEL } from './nav.js';

const ago = (iso) => {
  const t = new Date(String(iso).replace(' ', 'T'));
  const m = Math.round((Date.now() - t.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

// Temporary passwords (issued by the office) must be replaced before anything else works.
function forcePasswordChange() {
  return new Promise((resolve) => {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="force-modal" tabindex="-1" aria-labelledby="force-title" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-dialog-centered"><form class="modal-content" id="force-form" novalidate>
          <div class="modal-header"><h2 class="modal-title fs-5" id="force-title">Set your own password</h2></div>
          <div class="modal-body">
            <p>You signed in with a temporary password. Choose a new one to continue.</p>
            <div class="alert alert-danger d-none" id="force-error" role="alert"></div>
            <div class="mb-3"><label class="form-label" for="fp-current">Temporary password</label><input class="form-control" type="password" id="fp-current" autocomplete="current-password" required></div>
            <div class="mb-3"><label class="form-label" for="fp-new">New password</label><input class="form-control" type="password" id="fp-new" autocomplete="new-password" required><div class="form-text">At least 8 characters, with a letter and a number.</div></div>
            <div><label class="form-label" for="fp-confirm">Confirm new password</label><input class="form-control" type="password" id="fp-confirm" autocomplete="new-password" required></div>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-light" id="force-logout">Log out</button><button type="submit" class="btn btn-primary" id="force-submit">Save and continue</button></div>
        </form></div>
      </div>`);
    const el = document.getElementById('force-modal');
    const modal = new bootstrap.Modal(el);
    const form = document.getElementById('force-form');
    const err = document.getElementById('force-error');
    document.getElementById('force-logout').addEventListener('click', async () => { try { await api.post('/api/auth/logout'); } finally { location.href = '/pages/login.html'; } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.add('d-none');
      const currentPassword = form.elements['fp-current'].value;
      const newPassword = form.elements['fp-new'].value;
      let problem = '';
      if (!currentPassword) problem = 'Enter the temporary password you were given.';
      else if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) problem = 'The new password needs at least 8 characters, with a letter and a number.';
      else if (newPassword !== form.elements['fp-confirm'].value) problem = 'The new passwords do not match.';
      if (problem) { err.textContent = problem; err.classList.remove('d-none'); return; }
      const btn = document.getElementById('force-submit');
      btn.disabled = true;
      try {
        await api.post('/api/auth/change-password', { currentPassword, newPassword });
        el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(); });
        modal.hide();
        toast('Password updated. Welcome!');
      } catch (ex) { err.textContent = ex.message; err.classList.remove('d-none'); btn.disabled = false; }
    });
    modal.show();
  });
}

// Bell with unread badge in the navbar: counts every minute, loads the list when opened.
function setupBell() {
  const countEl = document.getElementById('bell-count');
  const list = document.getElementById('bell-list');
  const setCount = (n) => { countEl.textContent = n > 99 ? '99+' : String(n); countEl.classList.toggle('d-none', n === 0); };
  const refresh = async () => { try { setCount((await api.get('/api/notifications/count')).unread); } catch { /* offline or logged out: leave as is */ } };
  const loadList = async () => {
    list.innerHTML = '<div class="state-box py-3"><div class="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Loading"></div></div>';
    try {
      const d = await api.get('/api/notifications?limit=8');
      setCount(d.unread);
      list.innerHTML = d.rows.length
        ? d.rows.map((n) => `<a href="${esc(n.link || '/pages/notifications.html')}" class="dropdown-item border-bottom py-2 text-wrap${n.isRead ? '' : ' bg-light'}" data-notif="${n.id}">
            <div class="${n.isRead ? '' : 'fw-semibold'}">${esc(n.title)}</div>${n.message ? `<div class="small muted">${esc(n.message)}</div>` : ''}<div class="small muted">${ago(n.createdAt)}</div></a>`).join('')
        : '<div class="state-box py-4"><i class="fa-regular fa-bell"></i><div>You are all caught up.</div></div>';
    } catch (ex) { list.innerHTML = `<div class="p-3 text-danger small">${esc(ex.message)}</div>`; }
  };
  document.getElementById('bell-wrap').addEventListener('show.bs.dropdown', loadList);
  list.addEventListener('click', (e) => {
    const a = e.target.closest('[data-notif]');
    if (a) api.post(`/api/notifications/${a.dataset.notif}/read`).catch(() => {}); // navigation continues; marking is best-effort
  });
  document.getElementById('bell-readall').addEventListener('click', async () => { try { await api.post('/api/notifications/read-all'); setCount(0); loadList(); } catch (ex) { toast(ex.message, 'error'); } });
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
}

// Builds the sidebar + navbar for the current user and returns that user.
export async function initLayout(activeKey, pageTitle) {
  const { user } = await api.get('/api/auth/me');
  const items = NAV[user.role] || [];

  document.getElementById('app-sidebar').innerHTML = `
    <aside class="app-sidebar" id="sidebar" aria-label="Main navigation">
      <h2 class="brand">School ERP</h2>
      <div class="brand-sub">${esc(ROLE_LABEL[user.role] || user.role)}</div>
      <nav>
        ${items.map((i) => `<a class="nav-link${i.key === activeKey ? ' active' : ''}" href="${i.href}"${i.key === activeKey ? ' aria-current="page"' : ''}><i class="fa-solid ${i.icon}"></i><span>${esc(i.label)}</span></a>`).join('')}
      </nav>
    </aside>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>`;

  document.getElementById('app-navbar').innerHTML = `
    <header class="app-navbar">
      <button class="btn btn-outline-secondary btn-sm d-lg-none" id="sidebar-toggle" aria-label="Open menu" aria-controls="sidebar"><i class="fa-solid fa-bars"></i></button>
      <h1 class="page-title">${esc(pageTitle)}</h1>
      <div class="ms-auto dropdown" id="bell-wrap">
        <button class="btn btn-light border position-relative" id="bell-btn" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label="Notifications">
          <i class="fa-regular fa-bell"></i><span class="badge rounded-pill text-bg-danger position-absolute top-0 start-100 translate-middle d-none" id="bell-count">0</span>
        </button>
        <div class="dropdown-menu dropdown-menu-end p-0 notification-menu" id="bell-menu">
          <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom"><strong>Notifications</strong><button class="btn btn-link btn-sm p-0" id="bell-readall">Mark all read</button></div>
          <div id="bell-list" class="notification-list"></div>
          <div class="text-center border-top py-2"><a href="/pages/notifications.html">View all</a></div>
        </div>
      </div>
      <div class="dropdown">
        <button class="btn btn-light border dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="fa-solid fa-circle-user me-1"></i><span class="d-none d-sm-inline">${esc(user.name)}</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li class="px-3 py-2"><div class="fw-semibold">${esc(user.name)}</div><div class="muted small">${esc(user.email)}</div></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" id="email-pref"></button></li>
          <li><button class="dropdown-item" id="open-password"><i class="fa-solid fa-key me-2"></i>Change password</button></li>
          <li><button class="dropdown-item" id="logout-btn"><i class="fa-solid fa-right-from-bracket me-2"></i>Log out</button></li>
        </ul>
      </div>
    </header>`;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="password-modal" tabindex="-1" aria-labelledby="password-title" aria-hidden="true">
      <div class="modal-dialog"><form class="modal-content" id="password-form" novalidate>
        <div class="modal-header"><h2 class="modal-title fs-5" id="password-title">Change password</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">
          <div class="alert alert-danger d-none" id="password-error" role="alert"></div>
          <div class="mb-3"><label class="form-label" for="pw-current">Current password</label><input class="form-control" type="password" id="pw-current" autocomplete="current-password" required></div>
          <div class="mb-3"><label class="form-label" for="pw-new">New password</label><input class="form-control" type="password" id="pw-new" autocomplete="new-password" minlength="8" required><div class="form-text">At least 8 characters.</div></div>
          <div><label class="form-label" for="pw-confirm">Confirm new password</label><input class="form-control" type="password" id="pw-confirm" autocomplete="new-password" required></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary" id="pw-submit">Save password</button></div>
      </form></div>
    </div>`);

  const toggle = () => document.body.classList.toggle('sidebar-open');
  document.getElementById('sidebar-toggle').addEventListener('click', toggle);
  document.getElementById('sidebar-backdrop').addEventListener('click', toggle);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } finally { location.href = '/pages/login.html'; }
  });

  const modal = new bootstrap.Modal(document.getElementById('password-modal'));
  const form = document.getElementById('password-form');
  const errBox = document.getElementById('password-error');
  document.getElementById('open-password').addEventListener('click', () => { form.reset(); errBox.classList.add('d-none'); modal.show(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('d-none');
    const currentPassword = form.elements['pw-current'].value;
    const newPassword = form.elements['pw-new'].value;
    let problem = '';
    if (!currentPassword) problem = 'Enter your current password.';
    else if (newPassword.length < 8) problem = 'New password must be at least 8 characters.';
    else if (newPassword !== form.elements['pw-confirm'].value) problem = 'The new passwords do not match.';
    if (problem) { errBox.textContent = problem; errBox.classList.remove('d-none'); return; }

    const btn = document.getElementById('pw-submit');
    btn.disabled = true;
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      modal.hide();
      toast('Password updated.');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('d-none');
    } finally {
      btn.disabled = false;
    }
  });

  setupBell();

  const pref = document.getElementById('email-pref');
  const drawPref = () => { pref.innerHTML = `<i class="fa-regular fa-envelope me-2"></i>Email notifications: <strong>${user.emailNotifications ? 'On' : 'Off'}</strong>`; };
  drawPref();
  pref.addEventListener('click', async () => {
    try {
      const r = await api.patch('/api/auth/preferences', { emailNotifications: !user.emailNotifications });
      user.emailNotifications = r.emailNotifications;
      drawPref();
      toast(user.emailNotifications ? 'You will get emails for important updates.' : 'Email notifications are off. You will still see them here.');
    } catch (ex) { toast(ex.message, 'error'); }
  });

  if (user.mustChangePassword) { await forcePasswordChange(); user.mustChangePassword = false; }
  return user;
}
