import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, toast } from './ui.js';

const content = document.getElementById('content');
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

async function load() {
  showLoading(content, 'Checking the system...');
  try {
    const s = await api.get('/api/system/status');
    content.innerHTML = `
      <div class="page-head mb-4"><h1>Settings</h1><p>Email, system health and backups.</p></div>
      <div class="row g-3">
        <div class="col-lg-6"><section class="panel h-100"><div class="panel-head"><h2>Email notifications</h2>${s.email.configured ? '<span class="badge text-bg-success">On</span>' : '<span class="badge text-bg-secondary">Off</span>'}</div><div class="panel-body">
          ${s.email.configured
            ? `<p>Emails go out through <strong>${esc(s.email.host)}</strong> from <strong>${esc(s.email.from)}</strong> for notices, new assignments and fee payments. Each person can switch their own emails off from the account menu.</p>
               <button class="btn btn-outline-primary" id="test-email"><i class="fa-regular fa-paper-plane me-1"></i>Send a test email to me</button>`
            : `<p>Email is not set up, so people only get notifications inside the app. Everything else works.</p>
               <p class="mb-1">To turn it on, add these lines to <code>.env</code> and restart the server:</p>
               <pre class="bg-light p-2 rounded small mb-2">SMTP_HOST=smtp.example.com\nSMTP_PORT=587\nSMTP_USER=your-user\nSMTP_PASS=your-password\nSMTP_FROM=School Name &lt;noreply@yourschool.in&gt;\nAPP_URL=https://erp.yourschool.in</pre>
               <p class="muted small mb-0">Come back here afterwards to send a test email. Details are in docs/DEPLOYMENT.md.</p>`}
        </div></section></div>
        <div class="col-lg-6"><section class="panel h-100"><div class="panel-head"><h2>System</h2><span class="badge text-bg-success">Database ${esc(s.database)}</span></div><div class="panel-body">
          <dl class="dl-grid">
            <dt>School name</dt><dd>${s.schoolName ? esc(s.schoolName) : '<span class="muted">Not set. Add SCHOOL_NAME to .env so it shows on PDFs.</span>'}</dd>
            <dt>App address</dt><dd>${esc(s.appUrl)}</dd>
            <dt>Mode</dt><dd>${esc(s.environment)}</dd>
            <dt>Uploaded files</dt><dd>${s.uploads.files} files, ${size(s.uploads.bytes)}</dd>
          </dl></div></section></div>
        <div class="col-12"><section class="panel"><div class="panel-head"><h2>Backups</h2></div><div class="panel-body">
          <p>Your data lives in the MySQL database and the uploads folder. Back up both regularly, and keep a copy on another drive or cloud storage.</p>
          <p class="mb-1">To make a backup right now, run this in the project folder:</p>
          <pre class="bg-light p-2 rounded small mb-2">npm run backup</pre>
          <p class="muted small mb-0">It creates a dated folder inside <code>backups/</code> with <code>database.sql</code> and a copy of the uploads. Restore steps are in docs/DEPLOYMENT.md.</p>
        </div></section></div>
      </div>`;
    const t = document.getElementById('test-email');
    if (t) t.addEventListener('click', async () => {
      t.disabled = true;
      try { const r = await api.post('/api/system/test-email'); toast(`Test email sent to ${r.to}.`); } catch (err) { toast(err.message, 'error'); } finally { t.disabled = false; }
    });
  } catch (err) { showError(content, err.message, load); }
}

try {
  const user = await initLayout('settings', 'Settings');
  if (user.role !== 'admin') location.href = '/pages/dashboard.html';
  else load();
} catch (err) { showError(content, err.message); }
