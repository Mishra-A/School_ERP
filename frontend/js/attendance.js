import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, toast } from './ui.js';

const content = document.getElementById('content');
const STATUSES = [['present', 'Present', 'success'], ['absent', 'Absent', 'danger'], ['late', 'Late', 'warning'], ['leave', 'Leave', 'secondary']];
const pctClass = (p) => (p === null ? '' : p < 75 ? 'low' : p < 85 ? 'mid' : 'good');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monthStart = () => `${todayStr().slice(0, 8)}01`;

let options = [];       // section + subject pairs the user may use
let roster = [];
let isAdmin = false;

// ---------------- Mark attendance
async function loadRoster() {
  const box = document.getElementById('roster');
  const idx = document.getElementById('combo').value;
  const date = document.getElementById('date').value;
  if (idx === '' || !date) { box.innerHTML = ''; return; }
  const o = options[Number(idx)];
  showLoading(box, 'Loading students...');
  try {
    const data = await api.get(`/api/attendance/roster?sectionId=${o.sectionId}&subjectId=${o.subjectId}&date=${date}`);
    roster = data.students;
    if (!roster.length) { box.innerHTML = `<section class="panel">${emptyHtml('No students in this section', 'Enroll students in this section first.', 'fa-user-graduate')}</section>`; return; }
    box.innerHTML = `
      ${data.alreadyMarked ? '<div class="alert alert-info" role="status">Attendance was already marked for this date. Saving will update it.</div>' : ''}
      <section class="panel">
        <div class="panel-head"><h2>${esc(o.sectionLabel)} &middot; ${esc(o.subjectName)}</h2>
          <div class="d-flex gap-2 align-items-center"><span class="muted small" id="counts"></span><button class="btn btn-sm btn-outline-secondary" id="all-present">Mark all present</button></div></div>
        <div class="table-responsive"><table class="table align-middle"><thead><tr><th>Roll</th><th>Student</th><th>Status</th></tr></thead><tbody>
          ${roster.map((s) => `<tr><td>${s.rollNo ?? '-'}</td><td class="fw-semibold">${esc(s.name)}</td><td>
            <div class="btn-group status-group" role="group" aria-label="Attendance for ${esc(s.name)}">
              ${STATUSES.map(([v, label, color]) => `<input type="radio" class="btn-check" name="st-${s.studentId}" id="st-${s.studentId}-${v}" value="${v}"${(s.status || 'present') === v ? ' checked' : ''}>
              <label class="btn btn-outline-${color}" for="st-${s.studentId}-${v}">${label}</label>`).join('')}
            </div></td></tr>`).join('')}
        </tbody></table></div>
        <div class="p-3 border-top d-flex justify-content-end"><button class="btn btn-primary" id="save-att">Save attendance</button></div>
      </section>`;
    box.addEventListener('change', updateCounts);
    document.getElementById('all-present').addEventListener('click', () => { roster.forEach((s) => { document.getElementById(`st-${s.studentId}-present`).checked = true; }); updateCounts(); });
    document.getElementById('save-att').addEventListener('click', () => save(o, date));
    updateCounts();
  } catch (err) { showError(box, err.message, loadRoster); }
}

function currentRecords() {
  return roster.map((s) => ({ studentId: s.studentId, status: document.querySelector(`input[name="st-${s.studentId}"]:checked`).value }));
}

function updateCounts() {
  const el = document.getElementById('counts');
  if (!el) return;
  const c = { present: 0, absent: 0, late: 0, leave: 0 };
  currentRecords().forEach((r) => { c[r.status] += 1; });
  el.textContent = `${c.present} present, ${c.absent} absent, ${c.late} late, ${c.leave} on leave`;
}

async function save(o, date) {
  const btn = document.getElementById('save-att');
  btn.disabled = true;
  try {
    const r = await api.post('/api/attendance/bulk', { sectionId: o.sectionId, subjectId: o.subjectId, date, records: currentRecords() });
    toast(`Attendance saved for ${r.saved} students.`);
    loadRoster();
  } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
}

// ---------------- Report
function toCsv(rows) {
  const head = ['Roll', 'Admission no.', 'Student', 'Present', 'Late', 'Absent', 'Leave', 'Marked', 'Attendance %'];
  const lines = rows.map((r) => [r.rollNo ?? '', r.admissionNo, r.name, r.present, r.late, r.absent, r.onLeave, r.total, r.percent ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [head.join(','), ...lines].join('\r\n');
}

async function loadReport() {
  const box = document.getElementById('report');
  const sectionId = document.getElementById('r-section').value;
  const subjectId = document.getElementById('r-subject').value;
  const from = document.getElementById('r-from').value;
  const to = document.getElementById('r-to').value;
  if (!sectionId || !from || !to) { box.innerHTML = ''; return; }
  showLoading(box, 'Building report...');
  try {
    const { rows } = await api.get(`/api/attendance/report?sectionId=${sectionId}&from=${from}&to=${to}${subjectId ? `&subjectId=${subjectId}` : ''}`);
    box.innerHTML = rows.length
      ? `<section class="panel"><div class="panel-head"><h2>${rows.length} students</h2><button class="btn btn-sm btn-outline-secondary" id="csv-btn"><i class="fa-solid fa-download me-1"></i>Download CSV</button></div>
          <div class="table-responsive"><table class="table align-middle"><thead><tr><th>Roll</th><th>Student</th><th class="text-end">Present</th><th class="text-end">Late</th><th class="text-end">Absent</th><th class="text-end">Leave</th><th class="text-end">Attendance</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${r.rollNo ?? '-'}</td><td class="fw-semibold">${esc(r.name)}</td><td class="text-end">${r.present}</td><td class="text-end">${r.late}</td><td class="text-end">${r.absent}</td><td class="text-end">${r.onLeave}</td>
            <td class="text-end pct ${pctClass(r.percent)}">${r.percent === null ? '<span class="muted fw-normal">No records</span>' : `${r.percent}%`}</td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="panel">${emptyHtml('No students', 'There are no students in this section.', 'fa-user-graduate')}</section>`;
    const csv = document.getElementById('csv-btn');
    if (csv) csv.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff', toCsv(rows)], { type: 'text/csv' }));
      a.download = `attendance-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  } catch (err) { showError(box, err.message, loadReport); }
}

function fillSubjects() {
  const sectionId = document.getElementById('r-section').value;
  const subs = options.filter((o) => String(o.sectionId) === sectionId);
  document.getElementById('r-subject').innerHTML = `<option value="">All subjects</option>${subs.map((o) => `<option value="${o.subjectId}">${esc(o.subjectName)}</option>`).join('')}`;
}

try {
  const user = await initLayout('attendance', 'Attendance');
  if (user.role !== 'admin' && user.role !== 'teacher') location.href = '/pages/dashboard.html';
  isAdmin = user.role === 'admin';
  options = (await api.get('/api/class-subjects/mine')).options;

  if (!options.length) {
    content.innerHTML = `<div class="page-head mb-3"><h1>Attendance</h1></div><section class="panel">${emptyHtml(isAdmin ? 'No subjects assigned yet' : 'No classes assigned to you yet', isAdmin ? 'Assign subjects to teachers under Academics first.' : 'The school office assigns your subjects. They will show up here.', 'fa-clipboard-user')}</section>`;
  } else {
    const sections = [...new Map(options.map((o) => [o.sectionId, o.sectionLabel])).entries()];
    content.innerHTML = `
      <div class="page-head mb-3"><h1>Attendance</h1><p>Mark attendance per class period, and review it over any date range.</p></div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-mark" type="button" role="tab">Mark attendance</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-report" type="button" role="tab">Report</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="pane-mark" role="tabpanel">
          <div class="toolbar">
            <select class="form-select w-auto" id="combo" aria-label="Class and subject">${options.map((o, i) => `<option value="${i}">${esc(o.sectionLabel)} - ${esc(o.subjectName)}</option>`).join('')}</select>
            <input class="form-control w-auto" type="date" id="date" value="${todayStr()}" max="${todayStr()}" aria-label="Date">
          </div>
          <div id="roster"></div>
        </div>
        <div class="tab-pane fade" id="pane-report" role="tabpanel">
          <div class="toolbar">
            <select class="form-select w-auto" id="r-section" aria-label="Section">${sections.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select>
            <select class="form-select w-auto" id="r-subject" aria-label="Subject"></select>
            <label class="muted" for="r-from">From</label><input class="form-control w-auto" type="date" id="r-from" value="${monthStart()}">
            <label class="muted" for="r-to">To</label><input class="form-control w-auto" type="date" id="r-to" value="${todayStr()}">
          </div>
          <div id="report"></div>
        </div>
      </div>`;
    document.getElementById('combo').addEventListener('change', loadRoster);
    document.getElementById('date').addEventListener('change', loadRoster);
    document.getElementById('r-section').addEventListener('change', () => { fillSubjects(); loadReport(); });
    ['r-subject', 'r-from', 'r-to'].forEach((id) => document.getElementById(id).addEventListener('change', loadReport));
    document.querySelector('[data-bs-target="#pane-report"]').addEventListener('shown.bs.tab', () => { fillSubjects(); loadReport(); });
    loadRoster();
  }
} catch (err) { showError(content, err.message); }
