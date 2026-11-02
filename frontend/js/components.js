// Reusable UI building blocks for list/form pages: modal forms, confirm dialogs, pager, debounce.
import { esc, toast } from './ui.js';

let modalCounter = 0;

function mountModal(html) {
  const id = `modal-${++modalCounter}`;
  document.body.insertAdjacentHTML('beforeend', html.replace('__ID__', id));
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  el.addEventListener('hidden.bs.modal', () => { modal.dispose(); el.remove(); });
  return { el, modal };
}

function fieldHtml(f, value) {
  const id = `f-${f.name}`;
  const req = f.required ? ' required' : '';
  const col = f.col || 12;
  const label = `<label class="form-label" for="${id}">${esc(f.label)}${f.required ? ' <span class="text-danger" aria-hidden="true">*</span>' : ''}</label>`;
  const help = f.help ? `<div class="form-text">${esc(f.help)}</div>` : '';
  let input;
  if (f.type === 'select') {
    const opts = [`<option value="">${esc(f.placeholder || 'Select...')}</option>`]
      .concat((f.options || []).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`));
    input = `<select class="form-select" id="${id}" name="${f.name}"${req}>${opts.join('')}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea class="form-control" id="${id}" name="${f.name}" rows="2"${req}>${esc(value ?? '')}</textarea>`;
  } else if (f.type === 'file') {
    input = `<input class="form-control" type="file" id="${id}" name="${f.name}"${req} accept="${esc(f.accept || '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg')}">`;
  } else if (f.type === 'checkbox') {
    return `<div class="col-${col}"><div class="form-check"><input class="form-check-input" type="checkbox" id="${id}" name="${f.name}"${value ? ' checked' : ''}><label class="form-check-label" for="${id}">${esc(f.label)}</label></div>${help}</div>`;
  } else {
    input = `<input class="form-control" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(value ?? '')}"${req}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.max ? ` maxlength="${f.max}"` : ''}${f.min !== undefined ? ` min="${f.min}"` : ''}>`;
  }
  return `<div class="col-12 col-md-${col}">${label}${input}${help}</div>`;
}

// Opens a modal form. Resolves with onSubmit's result after a successful save, or null if cancelled.
export function openForm({ title, fields, values = {}, submitLabel = 'Save', onSubmit }) {
  return new Promise((resolve) => {
    const { el, modal } = mountModal(`
      <div class="modal fade" id="__ID__" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable"><form class="modal-content" novalidate>
          <div class="modal-header"><h2 class="modal-title fs-5">${esc(title)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
          <div class="modal-body"><div class="alert alert-danger d-none" role="alert" data-error></div>
            <div class="row g-3">${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</div></div>
          <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">${esc(submitLabel)}</button></div>
        </form></div>
      </div>`);
    const form = el.querySelector('form');
    const errBox = el.querySelector('[data-error]');
    const btn = form.querySelector('[type=submit]');
    let result = null;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.classList.add('d-none');
      const data = {};
      for (const f of fields) {
        const input = form.elements[f.name];
        data[f.name] = f.type === 'checkbox' ? input.checked : f.type === 'file' ? (input.files[0] || null) : input.value.trim();
        if (f.type === 'file' && data[f.name] && data[f.name].size > 10 * 1024 * 1024) {
          errBox.textContent = 'That file is too large. The limit is 10 MB.';
          errBox.classList.remove('d-none');
          return;
        }
        if (f.required && f.type !== 'checkbox' && !data[f.name]) {
          errBox.textContent = `${f.label} is required.`;
          errBox.classList.remove('d-none');
          input.focus();
          return;
        }
      }
      btn.disabled = true;
      try {
        result = (await onSubmit(data)) ?? true;
        modal.hide();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
        btn.disabled = false;
      }
    });
    el.addEventListener('shown.bs.modal', () => { const first = form.querySelector('input,select,textarea'); if (first) first.focus(); });
    el.addEventListener('hidden.bs.modal', () => resolve(result));
    modal.show();
  });
}

export function confirmBox({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const { el, modal } = mountModal(`
      <div class="modal fade" id="__ID__" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header"><h2 class="modal-title fs-5">${esc(title)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
          <div class="modal-body">${esc(message)}</div>
          <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button></div>
        </div></div>
      </div>`);
    let answer = false;
    el.querySelector('[data-confirm]').addEventListener('click', () => { answer = true; modal.hide(); });
    el.addEventListener('hidden.bs.modal', () => resolve(answer));
    modal.show();
  });
}

// Shows a one-time temporary password after creating a user or resetting a password.
export function credentialsBox({ title, name, email, password }) {
  return new Promise((resolve) => {
    const { el, modal } = mountModal(`
      <div class="modal fade" id="__ID__" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header"><h2 class="modal-title fs-5">${esc(title)}</h2></div>
          <div class="modal-body">
            <p class="mb-3">Give these login details to <strong>${esc(name)}</strong>. The password is shown only once, so copy it now.</p>
            <dl class="row mb-0">
              <dt class="col-sm-3">Email</dt><dd class="col-sm-9">${esc(email)}</dd>
              <dt class="col-sm-3">Password</dt><dd class="col-sm-9"><code class="fs-5 user-select-all">${esc(password)}</code></dd>
            </dl>
            <p class="muted small mt-3 mb-0">They can change it after logging in, from the menu at the top right.</p>
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-copy><i class="fa-regular fa-copy me-1"></i>Copy password</button><button type="button" class="btn btn-primary" data-bs-dismiss="modal">Done</button></div>
        </div></div>
      </div>`);
    el.querySelector('[data-copy]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(password); toast('Password copied.'); } catch { toast('Select the password and copy it manually.', 'error'); }
    });
    el.addEventListener('hidden.bs.modal', resolve);
    modal.show();
  });
}

export function renderPager(el, { page, limit, total, onPage }) {
  const pages = Math.max(Math.ceil(total / limit), 1);
  if (total <= limit) { el.innerHTML = total ? `<div class="muted small">${total} ${total === 1 ? 'result' : 'results'}</div>` : ''; return; }
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  el.innerHTML = `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div class="muted small">${from}-${to} of ${total}</div>
      <div class="btn-group btn-group-sm" role="group" aria-label="Pagination">
        <button class="btn btn-outline-secondary" data-p="${page - 1}"${page <= 1 ? ' disabled' : ''}>Previous</button>
        <button class="btn btn-outline-secondary" disabled>Page ${page} of ${pages}</button>
        <button class="btn btn-outline-secondary" data-p="${page + 1}"${page >= pages ? ' disabled' : ''}>Next</button>
      </div></div>`;
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const badge = (active) =>
  active ? '<span class="badge text-bg-success">Active</span>' : '<span class="badge text-bg-secondary">Inactive</span>';

// Small icon-only/label buttons used in table rows (handled by event delegation on data-action).
export const rowBtn = (action, id, label, cls = 'btn-outline-secondary') =>
  `<button class="btn btn-sm ${cls}" data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;

// Read-only modal with arbitrary (already escaped) HTML.
export function infoBox({ title, html, wide = false }) {
  return new Promise((resolve) => {
    const { el, modal } = mountModal(`
      <div class="modal fade" id="__ID__" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable${wide ? ' modal-lg' : ''}"><div class="modal-content">
          <div class="modal-header"><h2 class="modal-title fs-5">${esc(title)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
          <div class="modal-body">${html}</div>
          <div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button></div>
        </div></div>
      </div>`);
    el.addEventListener('hidden.bs.modal', resolve);
    modal.show();
  });
}

export const RESULT_BADGE = {
  pass: '<span class="badge text-bg-success">Pass</span>',
  fail: '<span class="badge text-bg-danger">Fail</span>',
  absent: '<span class="badge text-bg-danger">Absent</span>',
  pending: '<span class="badge text-bg-warning">Pending</span>',
};

// Downloads rows as a CSV file (opens cleanly in Excel, including Hindi text).
export function downloadCsv(filename, headers, rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = [headers, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
