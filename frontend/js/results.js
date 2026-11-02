import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, fmtDay, toast } from './ui.js';
import { infoBox, RESULT_BADGE, rowBtn } from './components.js';

const content = document.getElementById('content');
let role;
let kidId = null;
let history = [];

const q = () => (role === 'parent' ? `?studentId=${kidId}` : '');
const pdfLink = (studentId, examId) => `/api/results/student/${studentId}/exam/${examId}/report-card`;

async function loadSchedule() {
  const box = document.getElementById('pane-schedule');
  showLoading(box);
  try {
    const { exams } = await api.get(`/api/exams/mine${q()}`);
    box.innerHTML = exams.length
      ? exams.map((e) => `<section class="panel mb-3"><div class="panel-head"><h2>${esc(e.name)} <span class="muted fw-normal">&middot; ${esc(e.className)}</span></h2>${e.upcoming ? '<span class="badge text-bg-primary">Upcoming</span>' : '<span class="badge text-bg-secondary">Over</span>'}</div>
          ${e.schedule.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th class="text-end">Max marks</th></tr></thead><tbody>${e.schedule.map((s) => `<tr><td class="fw-semibold">${esc(s.subjectName)}</td><td>${fmtDay(s.examDate)}</td><td>${s.startTime || '-'}</td><td class="text-end">${Number(s.maxMarks)}</td></tr>`).join('')}</tbody></table></div>` : emptyHtml('Date sheet not ready', 'Subjects and dates will appear here.', 'fa-calendar')}</section>`).join('')
      : `<section class="panel">${emptyHtml('No exams scheduled', 'Exam date sheets will show up here.', 'fa-file-pen')}</section>`;
  } catch (err) { showError(box, err.message, loadSchedule); }
}

async function loadResults() {
  const box = document.getElementById('pane-results');
  showLoading(box);
  try {
    const sid = role === 'parent' ? kidId : (await api.get('/api/students/mine')).students[0].id;
    history = (await api.get(`/api/results/student/${sid}`)).exams;
    box.innerHTML = history.length
      ? `<section class="panel"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Exam</th><th>Year</th><th class="text-end">Total</th><th class="text-end">%</th><th>Grade</th><th>Result</th><th></th></tr></thead><tbody>${history.map((h) => `
          <tr><td class="fw-semibold">${esc(h.examName)}<div class="muted small fw-normal">${esc(h.className)} - ${esc(h.sectionName)}</div></td><td>${esc(h.yearName)}</td>
          <td class="text-end">${Number(h.totalObtained)}/${Number(h.totalMax)}</td><td class="text-end">${h.percentage === null ? '-' : `${h.percentage}%`}</td><td>${esc(h.grade || '-')}</td><td>${RESULT_BADGE[h.result]}</td>
          <td><div class="row-actions">${rowBtn('details', h.examId, 'Subject marks')}<a class="btn btn-sm btn-outline-secondary" href="${pdfLink(sid, h.examId)}"><i class="fa-solid fa-file-pdf me-1"></i>Report card</a></div></td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="panel">${emptyHtml('No results yet', 'Marks appear here once teachers have entered them.', 'fa-square-poll-vertical')}</section>`;
    box.dataset.sid = sid;
  } catch (err) { showError(box, err.message, loadResults); }
}

async function showDetails(examId) {
  const sid = document.getElementById('pane-results').dataset.sid;
  const { info, result } = await api.get(`/api/results/student/${sid}/exam/${examId}`);
  await infoBox({
    title: `${info.examName} - ${info.studentName}`, wide: true,
    html: `<div class="table-responsive"><table class="table"><thead><tr><th>Subject</th><th class="text-end">Max</th><th class="text-end">Pass</th><th class="text-end">Marks</th><th>Grade</th><th>Result</th></tr></thead><tbody>
      ${result.subjects.map((s) => `<tr><td class="fw-semibold">${esc(s.subjectName)}</td><td class="text-end">${s.maxMarks}</td><td class="text-end">${s.passMarks}</td><td class="text-end">${s.status === 'pending' ? '-' : s.absent ? 'AB' : s.marks}</td><td>${esc(s.grade || '-')}</td><td>${RESULT_BADGE[s.status]}</td></tr>`).join('')}
      <tr class="fw-semibold"><td>Total</td><td class="text-end">${result.totalMax}</td><td></td><td class="text-end">${result.totalObtained}</td><td>${esc(result.grade || '-')}</td><td>${RESULT_BADGE[result.result]}</td></tr></tbody></table></div>
      ${result.pendingSubjects.length ? `<p class="muted mb-0">Marks pending for: ${esc(result.pendingSubjects.join(', '))}.</p>` : `<p class="mb-0">Percentage: <strong>${result.percentage}%</strong></p>`}`,
  });
}

try {
  const user = await initLayout('results', 'Exams and results');
  role = user.role;
  if (role !== 'student' && role !== 'parent') location.href = '/pages/dashboard.html';
  const kids = (await api.get('/api/students/mine')).students;
  kidId = kids[0] && kids[0].id;
  if (!kids.length) {
    content.innerHTML = `<div class="page-head mb-3"><h1>Exams and results</h1></div><section class="panel">${emptyHtml(role === 'parent' ? 'No child linked yet' : 'Not available yet', 'The school office needs to set this up first.', 'fa-square-poll-vertical')}</section>`;
  } else {
    content.innerHTML = `
      <div class="page-head mb-3"><h1>Exams and results</h1><p>Exam dates, marks and report cards.</p></div>
      ${role === 'parent' ? `<div class="toolbar"><label class="muted" for="kid">Child</label><select class="form-select w-auto" id="kid">${kids.map((k) => `<option value="${k.id}">${esc(k.name)}${k.className ? ` (${esc(k.className)} - ${esc(k.sectionName)})` : ''}</option>`).join('')}</select></div>` : ''}
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-schedule" type="button" role="tab">Exam schedule</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-results" type="button" role="tab">Results</button></li>
      </ul>
      <div class="tab-content"><div class="tab-pane fade show active" id="pane-schedule" role="tabpanel"></div><div class="tab-pane fade" id="pane-results" role="tabpanel"></div></div>`;
    document.getElementById('pane-results').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action=details]');
      if (b) showDetails(b.dataset.id).catch((err) => toast(err.message, 'error'));
    });
    document.querySelector('[data-bs-target="#pane-results"]').addEventListener('shown.bs.tab', loadResults);
    const kidSel = document.getElementById('kid');
    if (kidSel) kidSel.addEventListener('change', (e) => { kidId = Number(e.target.value); loadSchedule(); loadResults(); });
    loadSchedule();
  }
} catch (err) { showError(content, err.message); }
