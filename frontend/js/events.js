import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, toast } from './ui.js';
import { openForm, confirmBox, rowBtn } from './components.js';

const content = document.getElementById('content');
let isAdmin = false;
let scope = 'upcoming';
let type = '';
let events = [];

const TYPES = { exam: 'Exam', sports_day: 'Sports day', annual_function: 'Annual function', ptm: 'Parent-teacher meeting', holiday: 'Holiday', other: 'Other' };
const BADGE = { exam: 'danger', sports_day: 'success', annual_function: 'primary', ptm: 'warning', holiday: 'info', other: 'secondary' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const run = (fn) => (...a) => fn(...a).catch((err) => toast(err.message, 'error'));

const FIELDS = [
  { name: 'title', label: 'Title', required: true, max: 150 },
  { name: 'eventType', label: 'Type', type: 'select', required: true, options: Object.entries(TYPES).map(([value, label]) => ({ value, label })) },
  { name: 'startDate', label: 'Starts on', type: 'date', required: true, col: 6 },
  { name: 'endDate', label: 'Ends on (optional)', type: 'date', col: 6, help: 'For events lasting several days, such as holidays.' },
  { name: 'description', label: 'Details (optional)', type: 'textarea', max: 2000 },
];

async function load() {
  const box = document.getElementById('list');
  showLoading(box, 'Loading events...');
  try {
    events = (await api.get(`/api/events?scope=${scope}&type=${type}`)).events;
    if (!events.length) {
      box.innerHTML = `<section class="panel">${emptyHtml(scope === 'past' ? 'No past events' : 'No upcoming events', isAdmin && scope === 'upcoming' ? 'Add exams, holidays, PTMs and functions so everyone can plan.' : '', 'fa-calendar-days')}</section>`;
      return;
    }
    const groups = new Map();
    events.forEach((e) => { const key = e.startDate.slice(0, 7); groups.set(key, [...(groups.get(key) || []), e]); });
    box.innerHTML = [...groups.entries()].map(([key, list]) => `
      <h2 class="h6 text-uppercase muted mt-4 mb-2">${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}</h2>
      <section class="panel"><ul class="list-plain">${list.map((e) => `
        <li class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div><div class="fw-semibold">${esc(e.title)} <span class="badge text-bg-${BADGE[e.eventType]} ms-1">${esc(TYPES[e.eventType])}</span></div>
            <div class="muted small">${fmtDate(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ` to ${fmtDate(e.endDate)}` : ''}</div>
            ${e.description ? `<div class="mt-1" style="white-space:pre-wrap">${esc(e.description)}</div>` : ''}</div>
          ${isAdmin ? `<div class="row-actions">${rowBtn('edit', e.id, 'Edit')}${rowBtn('delete', e.id, 'Delete', 'btn-outline-danger')}</div>` : ''}
        </li>`).join('')}</ul></section>`).join('');
  } catch (err) { showError(box, err.message, load); }
}

async function addEvent() {
  const saved = await openForm({ title: 'Add event', submitLabel: 'Add event', fields: FIELDS, values: { eventType: 'other' }, onSubmit: (v) => api.post('/api/events', v) });
  if (saved) { toast('Event added.'); load(); }
}
async function editEvent(id) {
  const e = events.find((x) => String(x.id) === id);
  const saved = await openForm({ title: 'Edit event', fields: FIELDS, values: e, onSubmit: (v) => api.put(`/api/events/${id}`, v) });
  if (saved) { toast('Event updated.'); load(); }
}
async function deleteEvent(id) {
  const e = events.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete event?', message: `"${e.title}" will be removed from the calendar.`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await api.del(`/api/events/${id}`);
  toast('Event deleted.');
  load();
}

try {
  const user = await initLayout('events', 'Events');
  isAdmin = user.role === 'admin';
  content.innerHTML = `
    <div class="page-head mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h1>Events</h1><p>School calendar: exams, holidays, meetings and functions.</p></div>
      ${isAdmin ? '<button class="btn btn-primary" id="add-event"><i class="fa-solid fa-plus me-1"></i>Add event</button>' : ''}
    </div>
    <div class="toolbar">
      <div class="btn-group" role="group" aria-label="Show">
        <input type="radio" class="btn-check" name="scope" id="sc-up" value="upcoming" checked><label class="btn btn-outline-secondary" for="sc-up">Upcoming</label>
        <input type="radio" class="btn-check" name="scope" id="sc-past" value="past"><label class="btn btn-outline-secondary" for="sc-past">Past</label>
      </div>
      <select class="form-select w-auto" id="type" aria-label="Filter by type"><option value="">All types</option>${Object.entries(TYPES).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
    </div>
    <div id="list"></div>`;
  if (isAdmin) document.getElementById('add-event').addEventListener('click', run(addEvent));
  document.querySelectorAll('input[name=scope]').forEach((r) => r.addEventListener('change', (e) => { scope = e.target.value; load(); }));
  document.getElementById('type').addEventListener('change', (e) => { type = e.target.value; load(); });
  document.getElementById('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) run({ edit: editEvent, delete: deleteEvent }[b.dataset.action])(b.dataset.id);
  });
  load();
} catch (err) { showError(content, err.message); }
