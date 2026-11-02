import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtMoney, fmtPct } from './ui.js';
import { downloadCsv } from './components.js';
import { methodLabel } from './feesView.js';

const content = document.getElementById('content');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const monthStart = () => `${today().slice(0, 8)}01`;
const pctClass = (p) => (p === null ? '' : p < 75 ? 'low' : p < 85 ? 'mid' : 'good');
const stat = (label, value) => `<div class="col-6 col-lg-3"><div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div></div>`;
const table = (head, rows) => `<div class="table-responsive"><table class="table align-middle"><thead><tr>${head.map((h, i) => `<th${i ? ' class="text-end"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const csvBtn = (id) => `<button class="btn btn-sm btn-outline-secondary" id="${id}"><i class="fa-solid fa-download me-1"></i>Download CSV</button>`;
const rangeBar = (id, from) => `<div class="toolbar"><label class="muted" for="${id}-from">From</label><input class="form-control w-auto" type="date" id="${id}-from" value="${from}"><label class="muted" for="${id}-to">To</label><input class="form-control w-auto" type="date" id="${id}-to" value="${today()}"></div>`;
const range = (id) => `from=${document.getElementById(`${id}-from`).value}&to=${document.getElementById(`${id}-to`).value}`;

// ---------------------------------------------------------------- fees
async function loadFees() {
  const box = document.getElementById('fees-out');
  showLoading(box, 'Building report...');
  try {
    const d = await api.get(`/api/reports/fees?${range('fees')}`);
    box.innerHTML = d.classes.length ? `
      <div class="row g-3 mb-3">${stat('Billed this year', fmtMoney(d.totals.billed))}${stat('Collected this year', fmtMoney(d.totals.collected))}${stat('Pending', fmtMoney(d.totals.pending))}${stat('Collected in range', fmtMoney(d.totals.collectedInRange))}</div>
      <section class="panel mb-3"><div class="panel-head"><h2>By class</h2>${csvBtn('fees-csv')}</div>
        ${table(['Class', 'Students', 'Billed', 'Collected', 'Pending', 'Collected in range'], d.classes.map((c) => `<tr><td class="fw-semibold">${esc(c.className)}</td><td class="text-end">${c.students}</td><td class="text-end">${fmtMoney(c.billed)}</td><td class="text-end">${fmtMoney(c.collected)}</td><td class="text-end">${fmtMoney(c.pending)}</td><td class="text-end">${fmtMoney(c.collectedInRange)}</td></tr>`))}</section>
      <div class="row g-3"><div class="col-lg-6"><section class="panel h-100"><div class="panel-head"><h2>In the date range, by method</h2></div>
        ${d.byMethod.length ? table(['Method', 'Payments', 'Amount'], d.byMethod.map((m) => `<tr><td>${esc(methodLabel(m.method))}</td><td class="text-end">${m.payments}</td><td class="text-end">${fmtMoney(m.amount)}</td></tr>`)) : emptyHtml('No payments in this range', '', 'fa-receipt')}</section></div>
        <div class="col-lg-6"><section class="panel h-100"><div class="panel-head"><h2>Last 12 months</h2></div>
        ${d.byMonth.length ? table(['Month', 'Collected'], d.byMonth.map((m) => `<tr><td>${esc(m.month)}</td><td class="text-end">${fmtMoney(m.amount)}</td></tr>`)) : emptyHtml('No payments yet', '', 'fa-receipt')}</section></div></div>`
      : `<section class="panel">${emptyHtml('No fees set up yet', 'Add fees under Fees > Fee structure.', 'fa-indian-rupee-sign')}</section>`;
    const b = document.getElementById('fees-csv');
    if (b) b.addEventListener('click', () => downloadCsv(`fees-${d.from}-to-${d.to}.csv`, ['Class', 'Students', 'Billed', 'Collected', 'Pending', 'Collected in range'], d.classes.map((c) => [c.className, c.students, c.billed, c.collected, c.pending, c.collectedInRange])));
  } catch (err) { showError(box, err.message, loadFees); }
}

// ---------------------------------------------------------------- attendance
async function loadAttendance() {
  const box = document.getElementById('att-out');
  showLoading(box, 'Building report...');
  try {
    const d = await api.get(`/api/reports/attendance?${range('att')}`);
    box.innerHTML = d.sections.length
      ? `<section class="panel"><div class="panel-head"><h2>By section</h2>${csvBtn('att-csv')}</div>
        ${table(['Section', 'Students', 'Present', 'Late', 'Absent', 'Leave', 'Attendance', 'Under 75%'], d.sections.map((s) => `<tr><td class="fw-semibold">${esc(s.label)}</td><td class="text-end">${s.students}</td><td class="text-end">${s.present}</td><td class="text-end">${s.late}</td><td class="text-end">${s.absent}</td><td class="text-end">${s.onLeave}</td><td class="text-end pct ${pctClass(s.percent)}">${s.percent === null ? '<span class="muted fw-normal">No records</span>' : fmtPct(s.percent)}</td><td class="text-end">${s.lowAttendance}</td></tr>`))}</section>`
      : `<section class="panel">${emptyHtml('No sections yet', 'Create classes and sections under Academics.', 'fa-table-cells')}</section>`;
    const b = document.getElementById('att-csv');
    if (b) b.addEventListener('click', () => downloadCsv(`attendance-${d.from}-to-${d.to}.csv`, ['Section', 'Students', 'Present', 'Late', 'Absent', 'Leave', 'Attendance %', 'Students under 75%'], d.sections.map((s) => [s.label, s.students, s.present, s.late, s.absent, s.onLeave, s.percent ?? '', s.lowAttendance])));
  } catch (err) { showError(box, err.message, loadAttendance); }
}

// ---------------------------------------------------------------- enrollment
async function loadEnrollment() {
  const box = document.getElementById('enr-out');
  showLoading(box, 'Counting students...');
  try {
    const d = await api.get('/api/reports/enrollment');
    box.innerHTML = d.sections.length
      ? `<div class="row g-3 mb-3">${stat('Students', d.totals.total)}${stat('Boys', d.totals.male)}${stat('Girls', d.totals.female)}${stat('Other / not set', d.totals.other + d.totals.unspecified)}</div>
        <section class="panel"><div class="panel-head"><h2>By section</h2>${csvBtn('enr-csv')}</div>
        ${table(['Section', 'Total', 'Boys', 'Girls', 'Other', 'Not set'], d.sections.map((s) => `<tr><td class="fw-semibold">${esc(s.className)} - ${esc(s.sectionName)}</td><td class="text-end">${s.total}</td><td class="text-end">${s.male}</td><td class="text-end">${s.female}</td><td class="text-end">${s.other}</td><td class="text-end">${s.unspecified}</td></tr>`))}</section>`
      : `<section class="panel">${emptyHtml('No sections yet', 'Create classes and sections under Academics.', 'fa-table-cells')}</section>`;
    const b = document.getElementById('enr-csv');
    if (b) b.addEventListener('click', () => downloadCsv('enrollment.csv', ['Section', 'Total', 'Boys', 'Girls', 'Other', 'Not set'], d.sections.map((s) => [`${s.className} - ${s.sectionName}`, s.total, s.male, s.female, s.other, s.unspecified])));
  } catch (err) { showError(box, err.message, loadEnrollment); }
}

// ---------------------------------------------------------------- exams
async function loadExam() {
  const pick = document.getElementById('exam-pick');
  const box = document.getElementById('exam-out');
  if (!pick || !box) return; // no exams yet: the tab shows its empty state instead
  const id = pick.value;
  if (!id) { box.innerHTML = ''; return; }
  showLoading(box, 'Calculating results...');
  try {
    const d = await api.get(`/api/reports/exam/${id}`);
    box.innerHTML = `
      <section class="panel mb-3"><div class="panel-head"><h2>${esc(d.exam.name)} by section</h2>${csvBtn('exam-csv')}</div>
        ${d.sections.length ? table(['Section', 'Students', 'Results ready', 'Passed', 'Failed', 'Average %', 'Highest %'], d.sections.map((s) => `<tr><td class="fw-semibold">${esc(d.exam.className)} - ${esc(s.sectionName)}</td><td class="text-end">${s.students}</td><td class="text-end">${s.completed}</td><td class="text-end">${s.passed}</td><td class="text-end">${s.failed}</td><td class="text-end">${s.averagePercent === null ? '-' : fmtPct(s.averagePercent)}</td><td class="text-end">${s.highestPercent === null ? '-' : fmtPct(s.highestPercent)}</td></tr>`)) : emptyHtml('No sections', '', 'fa-table-cells')}</section>
      <section class="panel"><div class="panel-head"><h2>By subject</h2></div>
        ${d.subjects.length ? table(['Subject', 'Marks entered', 'Absent', 'Average %', 'Pass rate'], d.subjects.map((s) => `<tr><td class="fw-semibold">${esc(s.subjectName)}</td><td class="text-end">${s.entered}</td><td class="text-end">${s.absent}</td><td class="text-end">${s.averagePercent === null ? '-' : fmtPct(s.averagePercent)}</td><td class="text-end">${s.passRate === null ? '-' : fmtPct(s.passRate)}</td></tr>`)) : emptyHtml('No marks entered yet', 'Subject figures appear once teachers enter marks.', 'fa-square-poll-vertical')}</section>`;
    document.getElementById('exam-csv').addEventListener('click', () => downloadCsv(`exam-${id}.csv`, ['Section', 'Students', 'Results ready', 'Passed', 'Failed', 'Average %', 'Highest %'], d.sections.map((s) => [`${d.exam.className} - ${s.sectionName}`, s.students, s.completed, s.passed, s.failed, s.averagePercent ?? '', s.highestPercent ?? ''])));
  } catch (err) { showError(box, err.message, loadExam); }
}

try {
  const user = await initLayout('reports', 'Reports');
  if (user.role !== 'admin') location.href = '/pages/dashboard.html';
  const exams = (await api.get('/api/exams')).exams;
  content.innerHTML = `
    <div class="page-head mb-3"><h1>Reports</h1><p>Fees, attendance, enrollment and exam results for the current year. Every table can be downloaded as CSV.</p></div>
    <ul class="nav nav-tabs mb-3" role="tablist">
      <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-fees" type="button" role="tab">Fees</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-att" type="button" role="tab">Attendance</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-enr" type="button" role="tab">Enrollment</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-exam" type="button" role="tab">Exams</button></li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="pane-fees" role="tabpanel">${rangeBar('fees', monthStart())}<div id="fees-out"></div></div>
      <div class="tab-pane fade" id="pane-att" role="tabpanel">${rangeBar('att', monthStart())}<div id="att-out"></div></div>
      <div class="tab-pane fade" id="pane-enr" role="tabpanel"><div id="enr-out"></div></div>
      <div class="tab-pane fade" id="pane-exam" role="tabpanel">
        ${exams.length ? `<div class="toolbar"><select class="form-select w-auto" id="exam-pick" aria-label="Exam">${exams.map((e) => `<option value="${e.id}">${esc(e.name)} - ${esc(e.className)}</option>`).join('')}</select></div><div id="exam-out"></div>`
          : `<section class="panel">${emptyHtml('No exams yet', 'Create an exam under Exams first.', 'fa-file-pen')}</section>`}</div>
    </div>`;
  ['fees', 'att'].forEach((id) => ['from', 'to'].forEach((k) => document.getElementById(`${id}-${k}`).addEventListener('change', id === 'fees' ? loadFees : loadAttendance)));
  document.querySelector('[data-bs-target="#pane-att"]').addEventListener('shown.bs.tab', loadAttendance);
  document.querySelector('[data-bs-target="#pane-enr"]').addEventListener('shown.bs.tab', loadEnrollment);
  document.querySelector('[data-bs-target="#pane-exam"]').addEventListener('shown.bs.tab', loadExam);
  const pick = document.getElementById('exam-pick');
  if (pick) pick.addEventListener('change', loadExam);
  loadFees();
} catch (err) { showError(content, err.message); }
