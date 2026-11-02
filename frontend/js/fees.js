import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, fmtMoney, toast } from './ui.js';
import { openForm, confirmBox, renderPager, debounce, rowBtn } from './components.js';
import { feesHtml, methodLabel } from './feesView.js';

const content = document.getElementById('content');
let isAdmin = false;
let role;
let sections = [];
let classes = [];
// Handlers may be sync (back to list) or async (API calls); both are covered.
const run = (fn) => (...a) => Promise.resolve().then(() => fn(...a)).catch((err) => toast(err.message, 'error'));
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ============================================================ student / parent
async function loadLearner(studentId) {
  const box = document.getElementById('learner');
  showLoading(box, 'Loading fees...');
  try { box.innerHTML = feesHtml(await api.get(`/api/fees/student/${studentId}`)); } catch (err) { showError(box, err.message, () => loadLearner(studentId)); }
}

// ============================================================ admin: collect fees
const bal = { page: 1, search: '', sectionId: '', status: 'pending' };
let openStudent = null;
let detail = null;

async function loadBalances() {
  const list = document.getElementById('bal-list');
  showLoading(list);
  try {
    const qs = new URLSearchParams({ page: bal.page, search: bal.search, sectionId: bal.sectionId, status: bal.status });
    const d = await api.get(`/api/fees/balances?${qs}`);
    document.getElementById('bal-summary').innerHTML = `
      <div class="col-4"><div class="stat"><div class="stat-label">Billed</div><div class="stat-value">${fmtMoney(d.summary.billed)}</div></div></div>
      <div class="col-4"><div class="stat"><div class="stat-label">Collected</div><div class="stat-value">${fmtMoney(d.summary.collected)}</div></div></div>
      <div class="col-4"><div class="stat"><div class="stat-label">Pending</div><div class="stat-value">${fmtMoney(d.summary.pending)}</div></div></div>`;
    list.innerHTML = d.rows.length
      ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Student</th><th>Class</th><th class="text-end">Total</th><th class="text-end">Paid</th><th class="text-end">Remaining</th><th>Next due</th><th></th></tr></thead><tbody>${d.rows.map((r) => `
          <tr><td><div class="fw-semibold">${esc(r.name)}</div><div class="muted small">${esc(r.admissionNo)}</div></td><td>${esc(r.className)} - ${esc(r.sectionName)}</td>
          <td class="text-end">${fmtMoney(r.total)}</td><td class="text-end">${fmtMoney(r.paid)}</td><td class="text-end fw-semibold">${fmtMoney(r.remaining)}</td>
          <td>${r.remaining > 0 && r.nextDue ? `${fmtDate(r.nextDue)}${r.overdue ? ' <span class="badge text-bg-danger">Overdue</span>' : ''}` : '<span class="badge text-bg-success">Cleared</span>'}</td>
          <td><div class="row-actions">${rowBtn('open', r.studentId, 'Open', 'btn-outline-primary')}</div></td></tr>`).join('')}</tbody></table></div>`
      : emptyHtml(bal.search || bal.sectionId || bal.status ? 'No students match' : 'No fees to show yet', 'Set up fees in the Fee structure tab, and place students in classes.', 'fa-indian-rupee-sign');
    renderPager(document.getElementById('bal-pager'), { ...d, onPage: (p) => { bal.page = p; loadBalances(); } });
  } catch (err) { showError(list, err.message, loadBalances); }
}

async function openStudentFees(studentId) {
  openStudent = studentId;
  const pane = document.getElementById('pane-collect');
  showLoading(pane);
  try {
    const [d, prof] = await Promise.all([api.get(`/api/fees/student/${studentId}`), api.get(`/api/students/${studentId}`)]);
    detail = d;
    const s = prof.student;
    pane.innerHTML = `
      <button class="btn btn-link px-0 mb-2" data-action="back"><i class="fa-solid fa-arrow-left me-1"></i>All students</button>
      <div class="page-head mb-3"><h1 class="h3">${esc(s.name)}</h1><p>Admission no. ${esc(s.admissionNo)}${prof.current ? ` &middot; ${esc(prof.current.className)} - ${esc(prof.current.sectionName)}` : ''}</p></div>
      ${feesHtml(d, { admin: true })}`;
  } catch (err) { showError(pane, err.message, () => openStudentFees(studentId)); }
}

async function recordPayment(structureId) {
  const line = detail.lines.find((l) => String(l.structureId) === structureId);
  const saved = await openForm({
    title: `Record payment: ${line.feeType}`, submitLabel: 'Record payment',
    values: { amount: line.remaining, paidOn: todayStr(), method: 'cash' },
    fields: [
      { name: 'amount', label: `Amount (balance ${fmtMoney(line.remaining)})`, type: 'number', required: true, col: 6, min: 0.01 },
      { name: 'paidOn', label: 'Payment date', type: 'date', required: true, col: 6 },
      { name: 'method', label: 'Method', type: 'select', required: true, options: ['cash', 'upi', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: methodLabel(m) })) },
    ],
    onSubmit: (v) => api.post('/api/fees/payments', { studentId: openStudent, feeStructureId: Number(structureId), amount: Number(v.amount), paidOn: v.paidOn, method: v.method }),
  });
  if (saved) { toast(`Payment recorded. Receipt ${saved.receiptNo}.`); openStudentFees(openStudent); }
}

async function voidPayment(id) {
  const p = detail.payments.find((x) => String(x.id) === id);
  const saved = await openForm({
    title: `Void receipt ${p.receiptNo}?`, submitLabel: 'Void payment',
    fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, max: 255, help: `The ${fmtMoney(p.amount)} will count as unpaid again. The receipt is kept and marked void.` }],
    onSubmit: (v) => api.post(`/api/fees/payments/${id}/void`, v),
  });
  if (saved) { toast('Payment voided.'); openStudentFees(openStudent); }
}

function renderCollect() {
  const pane = document.getElementById('pane-collect');
  openStudent = null;
  pane.innerHTML = `
    <div class="row g-3 mb-3" id="bal-summary"></div>
    <div class="toolbar">
      <input class="form-control grow" type="search" id="bal-search" placeholder="Search by student name or admission no." aria-label="Search students">
      <select class="form-select w-auto" id="bal-section" aria-label="Filter by section"><option value="">All sections</option>${sections.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
      <select class="form-select w-auto" id="bal-status" aria-label="Filter by status"><option value="pending">Has a balance</option><option value="paid">Fully paid</option><option value="">Everyone</option></select>
    </div>
    <section class="panel"><div id="bal-list"></div><div class="p-3" id="bal-pager"></div></section>`;
  document.getElementById('bal-status').value = bal.status;
  document.getElementById('bal-search').value = bal.search;
  document.getElementById('bal-section').value = bal.sectionId;
  document.getElementById('bal-search').addEventListener('input', debounce((e) => { bal.search = e.target.value.trim(); bal.page = 1; loadBalances(); }));
  document.getElementById('bal-section').addEventListener('change', (e) => { bal.sectionId = e.target.value; bal.page = 1; loadBalances(); });
  document.getElementById('bal-status').addEventListener('change', (e) => { bal.status = e.target.value; bal.page = 1; loadBalances(); });
  loadBalances();
}

// ============================================================ admin: payments list
const pay = { page: 1, search: '', from: '', to: '' };
let payRows = [];
async function loadPayments() {
  const list = document.getElementById('pay-list');
  showLoading(list);
  try {
    const qs = new URLSearchParams({ page: pay.page, search: pay.search, from: pay.from, to: pay.to });
    const d = await api.get(`/api/fees/payments?${qs}`);
    payRows = d.rows;
    document.getElementById('pay-total').textContent = `${d.total} payments, ${fmtMoney(d.collected)} collected (voided excluded)`;
    list.innerHTML = d.rows.length
      ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Fee</th><th>Method</th><th class="text-end">Amount</th><th></th></tr></thead><tbody>${d.rows.map((p) => `
          <tr${p.voided ? ' class="text-decoration-line-through text-muted"' : ''}><td>${esc(p.receiptNo)}${p.voided ? ' <span class="badge text-bg-danger text-decoration-none">Void</span>' : ''}</td><td>${fmtDate(p.paidOn)}</td>
          <td><div class="fw-semibold">${esc(p.studentName)}</div><div class="small muted">${esc(p.className)}</div></td><td>${esc(p.feeType)}</td><td>${esc(methodLabel(p.method))}</td><td class="text-end">${fmtMoney(p.amount)}</td>
          <td><div class="row-actions"><a class="btn btn-sm btn-outline-secondary" href="/api/fees/payments/${p.id}/receipt"><i class="fa-solid fa-file-pdf me-1"></i>Receipt</a>${p.voided ? '' : rowBtn('void-list', p.id, 'Void', 'btn-outline-danger')}</div></td></tr>`).join('')}</tbody></table></div>`
      : emptyHtml('No payments found', 'Try a different search or date range.', 'fa-receipt');
    renderPager(document.getElementById('pay-pager'), { ...d, onPage: (p) => { pay.page = p; loadPayments(); } });
  } catch (err) { showError(list, err.message, loadPayments); }
}

async function voidFromList(id) {
  const p = payRows.find((x) => String(x.id) === id);
  const saved = await openForm({
    title: `Void receipt ${p.receiptNo}?`, submitLabel: 'Void payment',
    fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, max: 255, help: `The ${fmtMoney(p.amount)} will count as unpaid again. The receipt is kept and marked void.` }],
    onSubmit: (v) => api.post(`/api/fees/payments/${id}/void`, v),
  });
  if (saved) { toast('Payment voided.'); loadPayments(); }
}

function renderPayments() {
  const pane = document.getElementById('pane-payments');
  pane.innerHTML = `
    <div class="toolbar">
      <input class="form-control grow" type="search" id="pay-search" placeholder="Search by student, admission no. or receipt no." aria-label="Search payments">
      <label class="muted" for="pay-from">From</label><input class="form-control w-auto" type="date" id="pay-from">
      <label class="muted" for="pay-to">To</label><input class="form-control w-auto" type="date" id="pay-to">
    </div>
    <p class="muted" id="pay-total"></p>
    <section class="panel"><div id="pay-list"></div><div class="p-3" id="pay-pager"></div></section>`;
  document.getElementById('pay-search').addEventListener('input', debounce((e) => { pay.search = e.target.value.trim(); pay.page = 1; loadPayments(); }));
  document.getElementById('pay-from').addEventListener('change', (e) => { pay.from = e.target.value; pay.page = 1; loadPayments(); });
  document.getElementById('pay-to').addEventListener('change', (e) => { pay.to = e.target.value; pay.page = 1; loadPayments(); });
  loadPayments();
}

// ============================================================ admin: fee structure
let structures = [];
const FEE_FIELDS = [
  { name: 'feeType', label: 'Fee name', required: true, placeholder: 'e.g. Tuition fee, Transport', max: 80 },
  { name: 'amount', label: 'Amount per student', type: 'number', required: true, col: 6, min: 1 },
  { name: 'dueDate', label: 'Due date', type: 'date', required: true, col: 6 },
];

async function loadStructures() {
  const pane = document.getElementById('pane-structure');
  showLoading(pane);
  try {
    structures = (await api.get('/api/fees/structures')).structures;
    const byClass = classes.map((c) => ({ ...c, fees: structures.filter((s) => s.classId === c.id) }));
    pane.innerHTML = `
      <p class="muted">Each fee applies to every student enrolled in that class this year. Fees that already have payments can't be deleted.</p>
      ${byClass.length ? byClass.map((c) => `
        <section class="panel mb-3"><div class="panel-head"><h2>${esc(c.name)}</h2>${rowBtn('add-fee', c.id, 'Add fee', 'btn-outline-primary')}</div>
          ${c.fees.length
            ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Fee</th><th>Due date</th><th class="text-end">Amount</th><th class="text-end">Students</th><th class="text-end">Collected</th><th class="text-end">Pending</th><th></th></tr></thead><tbody>${c.fees.map((f) => `
              <tr><td class="fw-semibold">${esc(f.feeType)}</td><td>${fmtDate(f.dueDate)}</td><td class="text-end">${fmtMoney(f.amount)}</td><td class="text-end">${f.students}</td><td class="text-end">${fmtMoney(f.collected)}</td><td class="text-end">${fmtMoney(f.pending)}</td>
              <td><div class="row-actions">${rowBtn('edit-fee', f.id, 'Edit')}${rowBtn('del-fee', f.id, 'Delete', 'btn-outline-danger')}</div></td></tr>`).join('')}</tbody></table></div>`
            : emptyHtml('No fees yet', 'Add the fees this class pays, for example tuition.', 'fa-indian-rupee-sign')}</section>`).join('')
        : `<section class="panel">${emptyHtml('No classes in the current year', 'Create the academic year and classes under Academics first.', 'fa-school')}</section>`}`;
  } catch (err) { showError(pane, err.message, loadStructures); }
}
async function addFee(classId) {
  const saved = await openForm({ title: 'Add fee', submitLabel: 'Add fee', fields: FEE_FIELDS, onSubmit: (v) => api.post('/api/fees/structures', { ...v, amount: Number(v.amount), classId: Number(classId) }) });
  if (saved) { toast('Fee added.'); loadStructures(); }
}
async function editFee(id) {
  const f = structures.find((x) => String(x.id) === id);
  const saved = await openForm({ title: 'Edit fee', fields: FEE_FIELDS, values: f, onSubmit: (v) => api.put(`/api/fees/structures/${id}`, { ...v, amount: Number(v.amount) }) });
  if (saved) { toast('Fee updated.'); loadStructures(); }
}
async function deleteFee(id) {
  const f = structures.find((x) => String(x.id) === id);
  const ok = await confirmBox({ title: 'Delete fee?', message: `"${f.feeType}" for ${f.className} will be deleted. This only works if no payments exist.`, confirmLabel: 'Delete fee', danger: true });
  if (!ok) return;
  await api.del(`/api/fees/structures/${id}`);
  toast('Fee deleted.');
  loadStructures();
}

// ============================================================ boot
try {
  const user = await initLayout('fees', 'Fees');
  role = user.role;
  isAdmin = role === 'admin';
  if (role === 'teacher') location.href = '/pages/dashboard.html';

  if (isAdmin) {
    sections = (await api.get('/api/sections/options')).sections;
    const years = (await api.get('/api/academic-years')).years;
    const cur = years.find((y) => y.isCurrent);
    classes = cur ? (await api.get(`/api/classes?yearId=${cur.id}`)).classes : [];
    content.innerHTML = `
      <div class="page-head mb-3"><h1>Fees</h1><p>Collect fees, issue receipts and see who still owes.</p></div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-collect" type="button" role="tab">Collect fees</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-payments" type="button" role="tab">Payments</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-structure" type="button" role="tab">Fee structure</button></li>
      </ul>
      <div class="tab-content"><div class="tab-pane fade show active" id="pane-collect" role="tabpanel"></div><div class="tab-pane fade" id="pane-payments" role="tabpanel"></div><div class="tab-pane fade" id="pane-structure" role="tabpanel"></div></div>`;
    document.querySelector('[data-bs-target="#pane-payments"]').addEventListener('shown.bs.tab', renderPayments);
    document.querySelector('[data-bs-target="#pane-structure"]').addEventListener('shown.bs.tab', loadStructures);
    content.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const fn = { open: openStudentFees, back: renderCollect, pay: recordPayment, void: voidPayment, 'void-list': voidFromList, 'add-fee': addFee, 'edit-fee': editFee, 'del-fee': deleteFee }[b.dataset.action];
      if (fn) run(fn)(b.dataset.id);
    });
    const wanted = new URLSearchParams(location.search).get('student');
    if (wanted) openStudentFees(wanted); else renderCollect();
  } else {
    const kids = (await api.get('/api/students/mine')).students;
    if (!kids.length) {
      content.innerHTML = `<div class="page-head mb-3"><h1>Fees</h1></div><section class="panel">${emptyHtml(role === 'parent' ? 'No child linked yet' : 'Not available yet', 'The school office needs to set this up first.', 'fa-indian-rupee-sign')}</section>`;
    } else {
      content.innerHTML = `
        <div class="page-head mb-3"><h1>Fees</h1><p>What is due, what you have paid, and your receipts.</p></div>
        ${role === 'parent' ? `<div class="toolbar"><label class="muted" for="kid">Child</label><select class="form-select w-auto" id="kid">${kids.map((k) => `<option value="${k.id}">${esc(k.name)}${k.className ? ` (${esc(k.className)} - ${esc(k.sectionName)})` : ''}</option>`).join('')}</select></div>` : ''}
        <div id="learner"></div>`;
      const kidSel = document.getElementById('kid');
      if (kidSel) kidSel.addEventListener('change', (e) => loadLearner(e.target.value));
      loadLearner(kids[0].id);
    }
  }
} catch (err) { showError(content, err.message); }
