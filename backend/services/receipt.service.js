const PDFDocument = require('pdfkit');
const { registerFonts, drawText } = require('../utils/pdfText');

const GREEN = '#1d3a34';
const RULE = '#d9dfdc';
const SOFT = '#5b6a64';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (s) => `${Number(String(s).slice(8, 10))} ${MONTHS[Number(String(s).slice(5, 7)) - 1]} ${String(s).slice(0, 4)}`;
const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cheque: 'Cheque' };

function render(r) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Fee receipt ${r.receiptNo}`, Author: process.env.SCHOOL_NAME || 'School ERP' } });
  registerFonts(doc);
  const M = 40;
  const W = 515;

  doc.rect(0, 0, 595, 78).fill(GREEN);
  drawText(doc, process.env.SCHOOL_NAME || 'School', M, 20, { size: 20, bold: true, width: W, align: 'center', color: '#ffffff' });
  drawText(doc, 'FEE RECEIPT', M, 50, { size: 10, bold: true, width: W, align: 'center', color: '#f6ead2' });

  drawText(doc, `Receipt no. ${r.receiptNo}`, M, 100, { size: 13, bold: true, width: 300, color: GREEN });
  drawText(doc, `Date: ${fmtDate(r.paidOn)}`, M + 300, 103, { size: 10.5, width: 215, align: 'right', color: SOFT });

  doc.roundedRect(M, 130, W, 66, 4).lineWidth(0.8).strokeColor(RULE).stroke();
  const field = (label, value, x, y) => {
    drawText(doc, label, x, y, { size: 8.5, color: SOFT });
    drawText(doc, value, x, y + 11, { size: 11, bold: true, width: 230 });
  };
  field('Student', r.studentName, M + 14, 139);
  field('Admission no.', r.admissionNo, M + 270, 139);
  field('Class and section', r.classLabel || '-', M + 14, 168);
  field('Academic year', r.yearName, M + 270, 168);

  doc.rect(M, 216, W, 24).fill('#f2f4f3');
  drawText(doc, 'Description', M + 10, 223, { size: 9, bold: true, color: SOFT });
  drawText(doc, 'Amount paid', M + 10, 223, { size: 9, bold: true, color: SOFT, width: W - 20, align: 'right' });
  drawText(doc, r.feeType, M + 10, 253, { size: 11.5, width: 330 });
  drawText(doc, money(r.amount), M + 10, 253, { size: 13, bold: true, width: W - 20, align: 'right' });
  doc.moveTo(M, 278).lineTo(M + W, 278).lineWidth(0.5).strokeColor(RULE).stroke();

  const line = (label, value, y, bold = false) => {
    drawText(doc, label, M + 250, y, { size: 10.5, color: SOFT, width: 140 });
    drawText(doc, value, M + 390, y, { size: 10.5, bold, width: 125, align: 'right' });
  };
  line('Total for this fee', money(r.feeTotal), 292);
  line('Paid till date', money(r.paidTillDate), 312);
  line('Balance', money(r.balance), 332, true);
  drawText(doc, `Paid by ${METHOD[r.method] || r.method}`, M, 292, { size: 10.5, color: SOFT, width: 220 });
  drawText(doc, `Received by ${r.receivedBy}`, M, 312, { size: 10.5, color: SOFT, width: 220 });

  doc.moveTo(M + W - 150, 400).lineTo(M + W, 400).lineWidth(0.6).strokeColor(SOFT).stroke();
  drawText(doc, 'Authorised signature', M + W - 150, 404, { size: 8.5, color: SOFT, width: 150, align: 'right' });
  drawText(doc, 'This is a computer-generated receipt.', M, 440, { size: 8, color: SOFT, width: W, align: 'center' });

  if (r.voided) {
    doc.save();
    doc.rotate(-20, { origin: [297, 250] });
    drawText(doc, 'VOID', 120, 190, { size: 120, bold: true, color: '#f1c9c4' });
    doc.restore();
    drawText(doc, `This receipt was voided${r.voidReason ? `: ${r.voidReason}` : ''}`, M, 470, { size: 10, bold: true, width: W, align: 'center', color: '#b3372c' });
  }
  return doc;
}

module.exports = { render };
