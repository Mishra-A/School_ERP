import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, toast } from './ui.js';
import { openForm, confirmBox } from './components.js';

const content = document.getElementById('content');
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let isAdmin = false;
let sectionId = null;
let assignments = [];   // class_subjects of the selected section (admin editing)
let entries = [];

// Builds the weekly grid: days across, period numbers down.
function gridHtml(list, mode, editable) {
  const days = [1, 2, 3, 4, 5, 6];
  if (list.some((e) => e.dayOfWeek === 7)) days.push(7);
  const periods = [...new Set(list.map((e) => e.periodNo))].sort((a, b) => a - b);
  if (editable) { const next = (periods[periods.length - 1] || 0) + 1; if (next <= 15) periods.push(next); }
  if (!periods.length) return emptyHtml('No timetable yet', editable ? 'Choose a subject slot with the + button to start.' : 'Your timetable will appear here once the office sets it up.', 'fa-calendar-week');

  const bell = {}; // period -> times seen, to prefill new slots
  list.forEach((e) => { bell[e.periodNo] = `${e.startTime}-${e.endTime}`; });
  const cell = (day, p) => {
    const e = list.find((x) => x.dayOfWeek === day && x.periodNo === p);
    if (!e) return editable ? `<button class="tt-empty" data-action="add" data-day="${day}" data-period="${p}" aria-label="Add class on ${DAY_NAMES[day]}, period ${p}">+</button>` : '';
    const who = mode === 'teacher' ? esc(e.sectionLabel) : esc(e.teacherName);
    return `<div class="tt-cell"><div class="sub">${esc(e.subjectName)}</div><div class="meta">${who}</div><div class="meta">${e.startTime}-${e.endTime}${e.room ? ` &middot; ${esc(e.room)}` : ''}</div>
      ${editable ? `<div class="mt-1 d-flex gap-1"><button class="btn btn-sm btn-outline-secondary py-0" data-action="edit" data-id="${e.id}">Edit</button><button class="btn btn-sm btn-outline-danger py-0" data-action="delete" data-id="${e.id}">Remove</button></div>` : ''}</div>`;
  };
  return `<div class="tt-wrap"><table class="tt-grid"><thead><tr><th>Period</th>${days.map((d) => `<th>${DAY_NAMES[d]}</th>`).join('')}</tr></thead><tbody>
    ${periods.map((p) => `<tr><td class="tt-period">${p}<div class="muted fw-normal small">${bell[p] || ''}</div></td>${days.map((d) => `<td>${cell(d, p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ---------------- read-only views (teacher / student / parent)
async function loadMine() {
  showLoading(content, 'Loading timetable...');
  try {
    const { views } = await api.get('/api/timetable/mine');
    content.innerHTML = `<div class="page-head mb-3"><h1>Timetable</h1></div>` + (views.length
      ? views.map((v) => `<section class="panel mb-3"><div class="panel-head"><h2>${esc(v.title)}</h2></div><div class="panel-body flush">${gridHtml(v.entries, v.mode, false)}</div></section>`).join('')
      : `<section class="panel">${emptyHtml('No timetable available', 'You need to be placed in a class first.', 'fa-calendar-week')}</section>`);
  } catch (err) { showError(content, err.message, loadMine); }
}

// ---------------- admin editor
async function loadSection() {
  const box = document.getElementById('grid');
  showLoading(box, 'Loading timetable...');
  try {
    const [tt, cs] = await Promise.all([api.get(`/api/timetable/section/${sectionId}`), api.get(`/api/class-subjects?sectionId=${sectionId}`)]);
    entries = tt.entries;
    assignments = cs.assignments;
    box.innerHTML = assignments.length
      ? `<section class="panel"><div class="panel-body flush">${gridHtml(entries, 'section', true)}</div></section>`
      : `<section class="panel">${emptyHtml('No subjects assigned to this section', 'Assign subjects and teachers under Academics, then build the timetable here.', 'fa-chalkboard-user')}</section>`;
  } catch (err) { showError(box, err.message, loadSection); }
}

function entryFields() {
  return [
    { name: 'classSubjectId', label: 'Subject (and its teacher)', type: 'select', required: true, options: assignments.map((a) => ({ value: a.id, label: `${a.subjectName} - ${a.teacherName}` })) },
    { name: 'dayOfWeek', label: 'Day', type: 'select', required: true, col: 6, options: DAY_NAMES.slice(1).map((n, i) => ({ value: i + 1, label: n })) },
    { name: 'periodNo', label: 'Period no.', type: 'number', required: true, col: 6, min: 1 },
    { name: 'startTime', label: 'Starts', type: 'time', required: true, col: 6 },
    { name: 'endTime', label: 'Ends', type: 'time', required: true, col: 6 },
    { name: 'room', label: 'Room', col: 12, max: 30 },
  ];
}

const payload = (v) => ({ ...v, classSubjectId: Number(v.classSubjectId), dayOfWeek: Number(v.dayOfWeek), periodNo: Number(v.periodNo) });

async function addEntry(day, period) {
  const sameBell = entries.find((e) => e.periodNo === Number(period));
  const saved = await openForm({
    title: 'Add class to timetable', submitLabel: 'Add', fields: entryFields(),
    values: { dayOfWeek: day, periodNo: period, startTime: sameBell ? sameBell.startTime : '', endTime: sameBell ? sameBell.endTime : '' },
    onSubmit: (v) => api.post('/api/timetable', payload(v)),
  });
  if (saved) { toast('Added to the timetable.'); loadSection(); }
}

async function editEntry(id) {
  const e = entries.find((x) => String(x.id) === id);
  const saved = await openForm({
    title: 'Edit timetable slot', fields: entryFields(), values: e,
    onSubmit: (v) => api.put(`/api/timetable/${id}`, payload(v)),
  });
  if (saved) { toast('Timetable updated.'); loadSection(); }
}

async function deleteEntry(id) {
  const e = entries.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Remove from timetable?', message: `${e.subjectName} on ${DAY_NAMES[e.dayOfWeek]}, period ${e.periodNo} will be removed.`, confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  await api.del(`/api/timetable/${id}`);
  toast('Removed from the timetable.');
  loadSection();
}

try {
  const user = await initLayout('timetable', 'Timetable');
  isAdmin = user.role === 'admin';
  if (!isAdmin) {
    await loadMine();
  } else {
    const sections = (await api.get('/api/sections/options')).sections;
    if (!sections.length) {
      content.innerHTML = `<div class="page-head mb-3"><h1>Timetable</h1></div><section class="panel">${emptyHtml('No sections in the current year', 'Create the academic year, classes and sections under Academics first.', 'fa-table-cells')}</section>`;
    } else {
      sectionId = sections[0].id;
      content.innerHTML = `
        <div class="page-head mb-3"><h1>Timetable</h1><p>Build each section's week. A teacher can't be booked in two places at once, and the app will tell you if a slot clashes.</p></div>
        <div class="toolbar"><label class="muted" for="section">Section</label>
          <select class="form-select w-auto" id="section">${sections.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></div>
        <div id="grid"></div>`;
      document.getElementById('section').addEventListener('change', (e) => { sectionId = Number(e.target.value); loadSection(); });
      content.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        const run = { add: () => addEntry(b.dataset.day, b.dataset.period), edit: () => editEntry(b.dataset.id), delete: () => deleteEntry(b.dataset.id) }[b.dataset.action];
        run().catch((err) => toast(err.message, 'error'));
      });
      loadSection();
    }
  }
} catch (err) { showError(content, err.message); }
