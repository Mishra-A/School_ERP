import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, toast } from './ui.js';
import { openForm, confirmBox, badge, RESULT_BADGE, infoBox, rowBtn } from './components.js';
import { feesHtml } from './feesView.js';

const content = document.getElementById('content');
let user;
let studentId;

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const GENDER = { male: 'Male', female: 'Female', other: 'Other' };
const dd = (label, value) => `<dt>${esc(label)}</dt><dd>${value ? esc(value) : '<span class="muted">Not provided</span>'}</dd>`;

function render(d) {
  const { student: s, current, enrollments, parents } = d;
  const staff = user.role === 'admin' || user.role === 'teacher';
  const isAdmin = user.role === 'admin';

  content.innerHTML = `
    <div class="panel mb-3"><div class="panel-body profile-head">
      <div class="avatar" aria-hidden="true">${esc(initials(s.name))}</div>
      <div class="flex-grow-1">
        <h1 class="h3 mb-1">${esc(s.name)}</h1>
        <div class="muted">Admission no. ${esc(s.admissionNo)}${current ? ` &middot; ${esc(current.className)} - ${esc(current.sectionName)}${current.rollNo ? `, roll ${current.rollNo}` : ''}` : ' &middot; Not placed in a class'}</div>
      </div>
      ${isAdmin ? badge(s.isActive) : ''}
    </div></div>

    <div class="row g-3">
      <div class="col-lg-6"><section class="panel h-100"><div class="panel-head"><h2>Personal details</h2></div><div class="panel-body">
        <dl class="dl-grid">
          ${dd('Email', s.email)}${dd('Date of birth', s.dob ? fmtDate(s.dob) : '')}${dd('Gender', GENDER[s.gender] || '')}${dd('Phone', s.phone)}${dd('Address', s.address)}
        </dl></div></section></div>

      <div class="col-lg-6"><section class="panel h-100">
        <div class="panel-head"><h2>Parents and guardians</h2>${isAdmin ? '<button class="btn btn-sm btn-outline-primary" id="link-btn">Link parent</button>' : ''}</div>
        <div class="panel-body flush">${parents.length
          ? `<ul class="list-plain">${parents.map((p) => `<li class="d-flex justify-content-between align-items-start gap-2">
              <div><div class="fw-semibold">${esc(p.name)} <span class="muted fw-normal">(${esc(p.relation)})</span></div>${staff ? `<div class="muted small">${esc(p.phone || 'No phone')} &middot; ${esc(p.email)}</div>` : ''}</div>
              ${isAdmin ? `<button class="btn btn-sm btn-outline-danger" data-unlink="${p.id}">Unlink</button>` : ''}</li>`).join('')}</ul>`
          : emptyHtml('No parent linked', isAdmin ? 'Link a parent so they can follow this student.' : '', 'fa-people-roof')}</div>
      </section></div>

      <div class="col-12"><section class="panel"><div class="panel-head"><h2>Attendance</h2><span class="muted small" id="att-range"></span></div><div class="panel-body" id="att-body"></div></section></div>

      ${user.role !== 'teacher' ? `<div class="col-12"><section class="panel"><div class="panel-head"><h2>Fees</h2>${isAdmin ? `<a class="btn btn-sm btn-outline-primary" href="/pages/fees.html?student=${s.id}">Collect or manage</a>` : ''}</div><div class="panel-body" id="fee-body"></div></section></div>` : ''}

      <div class="col-12"><section class="panel"><div class="panel-head"><h2>Exam results</h2></div><div class="panel-body flush" id="res-body"></div></section></div>

      <div class="col-12"><section class="panel"><div class="panel-head"><h2>Teacher remarks</h2>${user.role === 'teacher' ? '<button class="btn btn-sm btn-outline-primary" id="add-remark">Add remark</button>' : ''}</div><div class="panel-body flush" id="rem-body"></div></section></div>

      <div class="col-12"><section class="panel"><div class="panel-head"><h2>Class history</h2></div><div class="panel-body flush">${enrollments.length
        ? `<div class="table-responsive"><table class="table"><thead><tr><th>Academic year</th><th>Class</th><th>Section</th><th>Roll</th></tr></thead><tbody>${enrollments.map((e) => `<tr><td>${esc(e.yearName)}${e.isCurrent ? ' <span class="badge text-bg-success">Current</span>' : ''}</td><td>${esc(e.className)}</td><td>${esc(e.sectionName)}</td><td>${e.rollNo ?? '-'}</td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No class history', 'Enrollment appears here once the student is placed in a section.', 'fa-school')}</div></section></div>
    </div>`;

  loadAttendance();
  if (user.role !== 'teacher') loadFees();
  loadResults();
  loadRemarks();
  const addRemarkBtn = document.getElementById('add-remark');
  if (addRemarkBtn) addRemarkBtn.addEventListener('click', () => addRemark().catch((e) => toast(e.message, 'error')));

  if (isAdmin) {
    document.getElementById('link-btn').addEventListener('click', () => linkParent(s.name).catch((e) => toast(e.message, 'error')));
    content.querySelectorAll('[data-unlink]').forEach((b) => b.addEventListener('click', () => unlink(b.dataset.unlink, s.name).catch((e) => toast(e.message, 'error'))));
  }
}

async function loadFees() {
  const body = document.getElementById('fee-body');
  showLoading(body, 'Loading fees...');
  try { body.innerHTML = feesHtml(await api.get(`/api/fees/student/${studentId}`)); } catch (err) { showError(body, err.message, loadFees); }
}

async function loadResults() {
  const body = document.getElementById('res-body');
  showLoading(body, 'Loading results...');
  try {
    const { exams } = await api.get(`/api/results/student/${studentId}`);
    body.innerHTML = exams.length
      ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Exam</th><th>Year</th><th class="text-end">Total</th><th class="text-end">%</th><th>Grade</th><th>Result</th><th></th></tr></thead><tbody>${exams.map((h) => `
          <tr><td class="fw-semibold">${esc(h.examName)}<div class="muted small fw-normal">${esc(h.className)} - ${esc(h.sectionName)}</div></td><td>${esc(h.yearName)}</td>
          <td class="text-end">${Number(h.totalObtained)}/${Number(h.totalMax)}</td><td class="text-end">${h.percentage === null ? '-' : `${h.percentage}%`}</td><td>${esc(h.grade || '-')}</td><td>${RESULT_BADGE[h.result]}</td>
          <td><div class="d-flex gap-1 justify-content-end">${rowBtn('res-detail', h.examId, 'Subject marks')}<a class="btn btn-sm btn-outline-secondary" href="/api/results/student/${studentId}/exam/${h.examId}/report-card"><i class="fa-solid fa-file-pdf me-1"></i>Report card</a></div></td></tr>`).join('')}</tbody></table></div>`
      : emptyHtml('No results yet', 'Marks appear here once teachers have entered them.', 'fa-square-poll-vertical');
    body.querySelectorAll('[data-action=res-detail]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const { info, result } = await api.get(`/api/results/student/${studentId}/exam/${b.dataset.id}`);
        await infoBox({ title: `${info.examName} - ${info.studentName}`, wide: true, html: `<div class="table-responsive"><table class="table"><thead><tr><th>Subject</th><th class="text-end">Max</th><th class="text-end">Pass</th><th class="text-end">Marks</th><th>Grade</th><th>Result</th></tr></thead><tbody>${result.subjects.map((s) => `<tr><td class="fw-semibold">${esc(s.subjectName)}</td><td class="text-end">${s.maxMarks}</td><td class="text-end">${s.passMarks}</td><td class="text-end">${s.status === 'pending' ? '-' : s.absent ? 'AB' : s.marks}</td><td>${esc(s.grade || '-')}</td><td>${RESULT_BADGE[s.status]}</td></tr>`).join('')}</tbody></table></div>` });
      } catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) { showError(body, err.message, loadResults); }
}

async function loadRemarks() {
  const body = document.getElementById('rem-body');
  showLoading(body, 'Loading remarks...');
  try {
    const { remarks } = await api.get(`/api/remarks?studentId=${studentId}`);
    body.innerHTML = remarks.length
      ? `<ul class="list-plain">${remarks.map((r) => `<li class="d-flex justify-content-between align-items-start gap-2"><div><div>${esc(r.remark)}</div><div class="muted small">${esc(r.teacherName)} &middot; ${fmtDate(String(r.createdAt).slice(0, 10))}</div></div>${r.canDelete ? `<button class="btn btn-sm btn-outline-danger" data-del-remark="${r.id}">Delete</button>` : ''}</li>`).join('')}</ul>`
      : emptyHtml('No remarks yet', user.role === 'teacher' ? 'Add a note about this student\'s progress or behaviour.' : '', 'fa-comment-dots');
    body.querySelectorAll('[data-del-remark]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmBox({ title: 'Delete remark?', message: 'This remark will be removed for everyone.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      try { await api.del(`/api/remarks/${b.dataset.delRemark}`); toast('Remark deleted.'); loadRemarks(); } catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) { showError(body, err.message, loadRemarks); }
}

async function addRemark() {
  const saved = await openForm({
    title: 'Add a remark', submitLabel: 'Add remark',
    fields: [{ name: 'remark', label: 'Remark', type: 'textarea', required: true, max: 500, help: 'Visible to the student and their parents.' }],
    onSubmit: (v) => api.post('/api/remarks', { studentId, remark: v.remark }),
  });
  if (saved) { toast('Remark added.'); loadRemarks(); }
}

const STATUS_LABEL = { present: ['Present', 'success'], absent: ['Absent', 'danger'], late: ['Late', 'warning'], leave: ['Leave', 'secondary'] };
const pctClass = (p) => (p === null ? '' : p < 75 ? 'low' : p < 85 ? 'mid' : 'good');

async function loadAttendance() {
  const body = document.getElementById('att-body');
  showLoading(body, 'Loading attendance...');
  try {
    const d = await api.get(`/api/attendance/student/${studentId}`);
    const t = d.summary;
    document.getElementById('att-range').textContent = d.from ? `Since ${fmtDate(d.from)}` : '';
    if (!t.total) { body.innerHTML = emptyHtml('No attendance recorded yet', 'It will show up here once teachers start marking it.', 'fa-clipboard-user'); return; }
    body.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Attendance</div><div class="stat-value pct ${pctClass(t.percent)}">${t.percent === null ? '-' : `${t.percent}%`}</div><div class="stat-note">${t.total} periods recorded</div></div></div>
        <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Present</div><div class="stat-value">${t.present}</div></div></div>
        <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Late</div><div class="stat-value">${t.late}</div></div></div>
        <div class="col-6 col-md-3"><div class="stat"><div class="stat-label">Absent / Leave</div><div class="stat-value">${t.absent} / ${t.onLeave}</div></div></div>
      </div>
      <div class="row g-3"><div class="col-lg-5"><h3 class="h6">By subject</h3>
        <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Subject</th><th class="text-end">Periods</th><th class="text-end">Attendance</th></tr></thead><tbody>${d.bySubject.map((x) => `<tr><td>${esc(x.subjectName)}</td><td class="text-end">${x.total}</td><td class="text-end pct ${pctClass(x.percent)}">${x.percent === null ? '-' : `${x.percent}%`}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="col-lg-7"><h3 class="h6">Recent</h3>
        <div class="table-responsive" style="max-height:260px;overflow-y:auto"><table class="table table-sm"><tbody>${d.records.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.subjectName)}</td><td class="text-end"><span class="badge text-bg-${STATUS_LABEL[r.status][1]}">${STATUS_LABEL[r.status][0]}</span></td></tr>`).join('')}</tbody></table></div></div></div>`;
  } catch (err) { showError(body, err.message, loadAttendance); }
}

async function linkParent(studentName) {
  const { parents } = await api.get('/api/parents/options');
  const saved = await openForm({
    title: `Link a parent to ${studentName}`,
    submitLabel: 'Link parent',
    fields: [
      { name: 'parentId', label: 'Parent', type: 'select', required: true, options: parents.map((p) => ({ value: p.id, label: p.name })), placeholder: parents.length ? 'Choose a parent' : 'No parents yet',
        help: parents.length ? '' : 'Add the parent under Parents first, then come back to link them.' },
      { name: 'relation', label: 'Relation', type: 'select', required: true, options: [{ value: 'father', label: 'Father' }, { value: 'mother', label: 'Mother' }, { value: 'guardian', label: 'Guardian' }, { value: 'other', label: 'Other' }] },
    ],
    onSubmit: (v) => api.post(`/api/students/${studentId}/parents`, { parentId: Number(v.parentId), relation: v.relation }),
  });
  if (saved) { toast('Parent linked.'); load(); }
}

async function unlink(parentId, studentName) {
  const ok = await confirmBox({ title: 'Unlink parent?', message: `They will no longer be able to see ${studentName}'s information.`, confirmLabel: 'Unlink', danger: true });
  if (!ok) return;
  await api.del(`/api/students/${studentId}/parents/${parentId}`);
  toast('Parent unlinked.');
  load();
}

async function load() {
  showLoading(content, 'Loading profile...');
  try {
    render(await api.get(`/api/students/${studentId}`));
  } catch (err) {
    showError(content, err.status === 403 || err.status === 404 ? "You can't view this student, or they no longer exist." : err.message, err.status === 403 ? null : load);
  }
}

try {
  user = await initLayout(null, 'Student profile');
  const param = Number(new URLSearchParams(location.search).get('id'));
  studentId = param || (user.role === 'student' ? user.profileId : 0);
  if (!studentId) location.href = '/pages/dashboard.html';
  else {
    if (user.role === 'student') document.querySelector('.nav-link[href="/pages/student.html"]')?.classList.add('active');
    load();
  }
} catch (err) { showError(content, err.message); }
