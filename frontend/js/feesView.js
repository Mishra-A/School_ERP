// Shared rendering of one student's fees: summary, what is owed, and payment history.
import { esc, fmtDate, fmtMoney, emptyHtml } from './ui.js';
import { rowBtn } from './components.js';

export const STATUS_BADGE = {
  paid: '<span class="badge text-bg-success">Paid</span>',
  overdue: '<span class="badge text-bg-danger">Overdue</span>',
  partial: '<span class="badge text-bg-primary">Part paid</span>',
  due: '<span class="badge text-bg-secondary">Due</span>',
};
const METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cheque: 'Cheque' };
export const methodLabel = (m) => METHOD[m] || m;

const stat = (label, value, note = '') =>
  `<div class="col-6 col-lg-3"><div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>${note ? `<div class="stat-note">${esc(note)}</div>` : ''}</div></div>`;

export function feesHtml(d, { admin = false } = {}) {
  const t = d.totals;
  if (!d.lines.length) return emptyHtml('No fees set for this class', admin ? 'Add fees for the class in the Fee structure tab.' : 'The school office has not set up fees for your class yet.', 'fa-indian-rupee-sign');
  return `
    <div class="row g-3 mb-3">
      ${stat('Total fee', fmtMoney(t.total))}${stat('Paid', fmtMoney(t.paid))}
      ${stat('Remaining', fmtMoney(t.remaining), t.overdue ? `${fmtMoney(t.overdue)} overdue` : '')}
      ${stat('Next due date', t.nextDue ? fmtDate(t.nextDue) : (t.remaining ? '-' : 'All paid'))}
    </div>
    <section class="panel mb-3"><div class="panel-head"><h2>Fees</h2></div>
      <div class="table-responsive"><table class="table align-middle"><thead><tr><th>Fee</th><th>Due date</th><th class="text-end">Amount</th><th class="text-end">Paid</th><th class="text-end">Remaining</th><th>Status</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
        ${d.lines.map((l) => `<tr><td class="fw-semibold">${esc(l.feeType)}</td><td>${fmtDate(l.dueDate)}</td><td class="text-end">${fmtMoney(l.amount)}</td><td class="text-end">${fmtMoney(l.paid)}</td><td class="text-end fw-semibold">${fmtMoney(l.remaining)}</td><td>${STATUS_BADGE[l.status]}</td>
          ${admin ? `<td>${l.remaining > 0 ? `<div class="row-actions">${rowBtn('pay', l.structureId, 'Record payment', 'btn-primary')}</div>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div></section>
    <section class="panel"><div class="panel-head"><h2>Payment history</h2></div>
      ${d.payments.length
        ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Receipt</th><th>Date</th><th>Fee</th><th>Method</th><th class="text-end">Amount</th><th></th></tr></thead><tbody>
          ${d.payments.map((p) => `<tr${p.voided ? ' class="text-decoration-line-through text-muted"' : ''}><td>${esc(p.receiptNo)}${p.voided ? ' <span class="badge text-bg-danger text-decoration-none">Void</span>' : ''}</td><td>${fmtDate(p.paidOn)}</td><td>${esc(p.feeType)}</td><td>${esc(methodLabel(p.method))}</td><td class="text-end">${fmtMoney(p.amount)}</td>
            <td><div class="row-actions"><a class="btn btn-sm btn-outline-secondary" href="/api/fees/payments/${p.id}/receipt"><i class="fa-solid fa-file-pdf me-1"></i>Receipt</a>${admin && !p.voided ? rowBtn('void', p.id, 'Void', 'btn-outline-danger') : ''}</div></td></tr>
            ${p.voided && p.voidReason ? `<tr><td colspan="6" class="small muted">Voided: ${esc(p.voidReason)}</td></tr>` : ''}`).join('')}
        </tbody></table></div>`
        : emptyHtml('No payments yet', admin ? 'Record the first payment from the fees above.' : 'Payments received by the school will be listed here.', 'fa-receipt')}
    </section>`;
}
