import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDay, toast } from './ui.js';
import { RESULT_BADGE } from './components.js';

const content = document.getElementById('content');
let options = [];
let sheet = null;

const label = (o) => `${o.examName} - ${o.sectionLabel} - ${o.subjectName} (${fmtDay(o.examDate)})`;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------------------------------------------------------------- enter marks
async function loadSheet() {
  const box = document.getElementById('sheet');
  const idx = document.getElementById('combo').value;
  if (idx === '') { box.innerHTML = ''; return; }
  const o = options[Number(idx)];
  showLoading(box, 'Loading students...');
  try {
    sheet = await api.get(`/api/marks/sheet?examScheduleId=${o.examScheduleId}&sectionId=${o.sectionId}`);
    const { subject: s, students } = sheet;
    const future = s.examDate > todayStr();
    if (!students.length) { box.innerHTML = `<section class="panel">${emptyHtml('No students in this section', 'Enroll students in this section first.', 'fa-user-graduate')}</section>`; return; }
    box.innerHTML = `
      ${future ? `<div class="alert alert-warning" role="status">This exam is on ${esc(fmtDay(s.examDate))}. Marks can be entered once it has taken place.</div>` : ''}
      <section class="panel">
        <div class="panel-head"><h2>${esc(s.examName)} &middot; ${esc(s.subjectName)} &middot; ${esc(s.sectionLabel)}</h2><span class="muted">Maximum ${Number(s.maxMarks)} &middot; pass ${Number(s.passMarks)}</span></div>
        <div class="table-responsive"><table class="table align-middle"><thead><tr><th>Roll</th><th>Student</th><th class="text-end">Marks</th><th>Absent</th></tr></thead><tbody>
          ${students.map((st) => `<tr><td>${st.rollNo ?? '-'}</td><td class="fw-semibold">${esc(st.name)}</td>
            <td class="text-end"><input class="form-control form-control-sm marks-input ms-auto" type="number" min="0" max="${Number(s.maxMarks)}" step="0.01" inputmode="decimal" data-student="${st.studentId}" value="${st.absent || st.marks === null ? '' : st.marks}"${st.absent || future ? ' disabled' : ''} aria-label="Marks for ${esc(st.name)}"></td>
            <td><div class="form-check"><input class="form-check-input" type="checkbox" data-absent="${st.studentId}"${st.absent ? ' checked' : ''}${future ? ' disabled' : ''} aria-label="${esc(st.name)} was absent"></div></td></tr>`).join('')}
        </tbody></table></div>
        <div class="p-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2"><span class="muted small" id="entered"></span><button class="btn btn-primary" id="save-marks"${future ? ' disabled' : ''}>Save marks</button></div>
      </section>`;
    box.addEventListener('input', onInput);
    box.addEventListener('change', onInput);
    document.getElementById('save-marks').addEventListener('click', () => saveMarks(o));
    refreshCount();
  } catch (err) { showError(box, err.message, loadSheet); }
}

function onInput(e) {
  const t = e.target;
  if (t.dataset.absent) {
    const input = document.querySelector(`input[data-student="${t.dataset.absent}"]`);
    input.disabled = t.checked;
    if (t.checked) input.value = '';
  }
  if (t.dataset.student) {
    const bad = t.value !== '' && (Number(t.value) < 0 || Number(t.value) > Number(sheet.subject.maxMarks));
    t.classList.toggle('is-invalid', bad);
  }
  refreshCount();
}

function refreshCount() {
  const el = document.getElementById('entered');
  if (!el) return;
  const rows = [...document.querySelectorAll('input[data-student]')];
  const filled = rows.filter((i) => i.value !== '' || document.querySelector(`input[data-absent="${i.dataset.student}"]`).checked).length;
  el.textContent = `${filled} of ${rows.length} students entered`;
}

async function saveMarks(o) {
  const records = [...document.querySelectorAll('input[data-student]')].map((i) => ({
    studentId: Number(i.dataset.student),
    absent: document.querySelector(`input[data-absent="${i.dataset.student}"]`).checked,
    marks: i.value === '' ? null : Number(i.value),
  }));
  if (document.querySelector('.marks-input.is-invalid')) { toast(`Marks must be between 0 and ${Number(sheet.subject.maxMarks)}.`, 'error'); return; }
  const btn = document.getElementById('save-marks');
  btn.disabled = true;
  try {
    const r = await api.post('/api/marks/bulk', { examScheduleId: o.examScheduleId, sectionId: o.sectionId, records });
    toast(`Marks saved for ${r.saved} students.`);
    loadSheet();
  } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
}

// ---------------------------------------------------------------- class results
async function loadResults() {
  const box = document.getElementById('results');
  const val = document.getElementById('r-combo').value;
  if (val === '') { box.innerHTML = ''; return; }
  const [examId, sectionId] = val.split('-');
  showLoading(box, 'Calculating results...');
  try {
    const d = await api.get(`/api/results/exam/${examId}?sectionId=${sectionId}`);
    box.innerHTML = d.rows.length && d.schedule.length
      ? `<section class="panel"><div class="panel-head"><h2>${esc(d.exam.name)} &middot; ${esc(d.exam.className)} - ${esc(d.section.name)}</h2></div>
          <div class="table-responsive"><table class="table align-middle result-table"><thead><tr><th>Roll</th><th>Student</th>${d.schedule.map((s) => `<th class="text-end" title="Maximum ${Number(s.maxMarks)}">${esc(s.subjectName)} <span class="muted fw-normal">/${Number(s.maxMarks)}</span></th>`).join('')}<th class="text-end">Total</th><th class="text-end">%</th><th>Grade</th><th>Result</th><th></th></tr></thead><tbody>
          ${d.rows.map((r) => `<tr><td>${r.rollNo ?? '-'}</td><td class="fw-semibold">${esc(r.name)}</td>
            ${r.subjects.map((s) => `<td class="text-end ${s.status === 'fail' || s.status === 'absent' ? 'text-danger' : ''}">${s.status === 'pending' ? '<span class="muted">-</span>' : s.absent ? 'AB' : Number(s.marks)}</td>`).join('')}
            <td class="text-end fw-semibold">${r.totalMax ? `${Number(r.totalObtained)}/${Number(r.totalMax)}` : '-'}</td><td class="text-end">${r.percentage === null ? '-' : `${r.percentage}%`}</td>
            <td>${esc(r.grade || '-')}</td><td>${RESULT_BADGE[r.result]}</td>
            <td><a class="btn btn-sm btn-outline-secondary" href="/api/results/student/${r.studentId}/exam/${d.exam.id}/report-card"><i class="fa-solid fa-file-pdf me-1"></i>Report card</a></td></tr>`).join('')}
          </tbody></table></div></section>`
      : `<section class="panel">${emptyHtml('Nothing to show yet', d.schedule.length ? 'There are no students in this section.' : 'This exam has no subjects yet.', 'fa-square-poll-vertical')}</section>`;
  } catch (err) { showError(box, err.message, loadResults); }
}

try {
  const user = await initLayout('marks', 'Marks and results');
  if (user.role !== 'admin' && user.role !== 'teacher') location.href = '/pages/dashboard.html';
  options = (await api.get('/api/marks/options')).options;

  if (!options.length) {
    content.innerHTML = `<div class="page-head mb-3"><h1>Marks and results</h1></div><section class="panel">${emptyHtml(
      user.role === 'admin' ? 'No exam subjects yet' : 'No exams for your classes yet',
      user.role === 'admin' ? 'Create an exam and add its subjects under Exams first.' : 'When the office schedules an exam for a subject you teach, it will show up here.', 'fa-square-poll-vertical')}</section>`;
  } else {
    const pairs = [...new Map(options.map((o) => [`${o.examId}-${o.sectionId}`, `${o.examName} - ${o.sectionLabel}`])).entries()];
    content.innerHTML = `
      <div class="page-head mb-3"><h1>Marks and results</h1><p>Enter marks for your subjects, and see each class's results and report cards.</p></div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-marks" type="button" role="tab">Enter marks</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-results" type="button" role="tab">Class results</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="pane-marks" role="tabpanel">
          <div class="toolbar"><select class="form-select" id="combo" aria-label="Exam, class and subject">${options.map((o, i) => `<option value="${i}">${esc(label(o))}</option>`).join('')}</select></div>
          <div id="sheet"></div></div>
        <div class="tab-pane fade" id="pane-results" role="tabpanel">
          <div class="toolbar"><select class="form-select w-auto" id="r-combo" aria-label="Exam and section">${pairs.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
          <div id="results"></div></div>
      </div>`;
    document.getElementById('combo').addEventListener('change', loadSheet);
    document.getElementById('r-combo').addEventListener('change', loadResults);
    document.querySelector('[data-bs-target="#pane-results"]').addEventListener('shown.bs.tab', loadResults);
    loadSheet();
  }
} catch (err) { showError(content, err.message); }
