// Shared UI helpers: escaping, toasts, loading / empty / error states, formatters.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, type = 'success') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.className = 'toast-container position-fixed top-0 end-0 p-3';
    box.style.zIndex = 2000;
    document.body.appendChild(box);
  }
  const color = type === 'error' ? 'danger' : 'success';
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${color} border-0`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  el.querySelector('.toast-body').textContent = message;
  box.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: type === 'error' ? 6000 : 3500 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

export function showLoading(el, text = 'Loading...') {
  el.innerHTML = `<div class="state-box" role="status"><div class="spinner-border spinner-border-sm text-secondary mb-2" aria-hidden="true"></div><div>${esc(text)}</div></div>`;
}

export function showError(el, message, onRetry) {
  el.innerHTML = `<div class="state-box error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><div class="title">Couldn't load this</div><div class="mb-3">${esc(message)}</div>${onRetry ? '<button class="btn btn-outline-secondary btn-sm" data-retry>Try again</button>' : ''}</div>`;
  if (onRetry) el.querySelector('[data-retry]').addEventListener('click', onRetry);
}

export function emptyHtml(title, hint = '', icon = 'fa-inbox') {
  return `<div class="state-box"><i class="fa-solid ${icon}"></i><div class="title">${esc(title)}</div>${hint ? `<div>${esc(hint)}</div>` : ''}</div>`;
}

const parseDate = (s) => new Date(String(s).replace(' ', 'T') + (String(s).length === 10 ? 'T00:00:00' : ''));

export const fmtDate = (s) => (s ? parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const fmtDay = (s) => (s ? parseDate(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const fmtDateTime = (s) => (s ? parseDate(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
export const fmtTime = (s) => (s ? String(s).slice(0, 5) : '');
export const fmtMoney = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);
export const fmtPct = (n) => (n === null || n === undefined ? '-' : `${Number(n)}%`);
