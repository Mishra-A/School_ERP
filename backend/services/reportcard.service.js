const PDFDocument = require('pdfkit');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { canViewStudent } = require('./access.service');
const { loadStudentExam } = require('./results.service');
const { registerFonts, drawText } = require('../utils/pdfText');

const GREEN = '#1d3a34';
const OCHRE = '#b9780f';
const RULE = '#d9dfdc';
const SOFT = '#5b6a64';
const COLORS = { pass: '#1f7a4d', fail: '#b3372c', absent: '#b3372c', pending: '#b9780f' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (s) => (s ? `${Number(String(s).slice(8, 10))} ${MONTHS[Number(String(s).slice(5, 7)) - 1]} ${String(s).slice(0, 4)}` : '');
const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

// Collects everything the card needs (and checks access) before any bytes are streamed.
async function prepare(user, studentId, examId) {
  if (!(await canViewStudent(user, studentId))) throw new AppError("You don't have access to this student.", 403);
  const data = await loadStudentExam(studentId, examId);
  if (!data) throw new AppError('This student has no such exam.', 404);
  const [remarks] = await pool.query(
    `SELECT r.remark, r.created_at AS createdAt, u.name AS teacherName
       FROM teacher_remarks r JOIN teachers t ON t.id = r.teacher_id JOIN users u ON u.id = t.user_id
      WHERE r.student_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 3`, [studentId]);
  let classTeacher = null;
  if (data.info.classTeacherId) {
    const [[t]] = await pool.query('SELECT u.name FROM teachers te JOIN users u ON u.id = te.user_id WHERE te.id = ?', [data.info.classTeacherId]);
    classTeacher = t ? t.name : null;
  }
  return { ...data, remarks, classTeacher };
}

function build(doc, { info, result, remarks, classTeacher }) {
  const M = 40;
  const W = 515;
  registerFonts(doc);

  // header band
  doc.rect(0, 0, 595, 78).fill(GREEN);
  drawText(doc, process.env.SCHOOL_NAME || 'School', M, 20, { size: 20, bold: true, width: W, align: 'center', color: '#ffffff' });
  drawText(doc, 'REPORT CARD', M, 50, { size: 10, bold: true, width: W, align: 'center', color: '#f6ead2' });

  drawText(doc, info.examName, M, 98, { size: 14, bold: true, width: 340, color: GREEN });
  drawText(doc, `Academic year ${info.yearName}`, M + 340, 101, { size: 10, width: 175, align: 'right', color: SOFT });

  // student block
  let y = 130;
  doc.roundedRect(M, y, W, 66, 4).lineWidth(0.8).strokeColor(RULE).stroke();
  const field = (label, value, x, fy) => {
    drawText(doc, label, x, fy, { size: 8.5, color: SOFT });
    drawText(doc, value, x, fy + 11, { size: 11, bold: true, width: 230 });
  };
  field('Student', info.studentName, M + 14, y + 9);
  field('Admission no.', info.admissionNo, M + 270, y + 9);
  field('Class and section', `${info.className} - ${info.sectionName}`, M + 14, y + 38);
  field('Roll no.', info.rollNo ? String(info.rollNo) : '-', M + 270, y + 38);

  // marks table
  const cols = [
    { label: 'Subject', w: 195, align: 'left' }, { label: 'Max', w: 55, align: 'right' }, { label: 'Pass', w: 55, align: 'right' },
    { label: 'Obtained', w: 75, align: 'right' }, { label: 'Grade', w: 55, align: 'center' }, { label: 'Result', w: 80, align: 'center' },
  ];
  const header = (hy) => {
    doc.rect(M, hy, W, 24).fill('#f2f4f3');
    let x = M;
    cols.forEach((c) => { drawText(doc, c.label, x + 8, hy + 7, { size: 9, bold: true, width: c.w - 16, align: c.align, color: SOFT }); x += c.w; });
  };
  y = 214;
  header(y);
  y += 24;

  const cell = (text, ci, ry, opts = {}) => {
    const x = M + cols.slice(0, ci).reduce((a, c) => a + c.w, 0);
    drawText(doc, text, x + 8, ry, { size: 10.5, width: cols[ci].w - 16, align: cols[ci].align, ...opts });
  };
  const STATUS_TEXT = { pass: 'Pass', fail: 'Fail', absent: 'Absent', pending: 'Pending' };
  for (const s of result.subjects) {
    if (y > 690) { doc.addPage(); registerFonts(doc); y = 40; header(y); y += 24; }
    cell(s.subjectName, 0, y + 7);
    cell(num(s.maxMarks), 1, y + 7);
    cell(num(s.passMarks), 2, y + 7);
    cell(s.status === 'pending' ? '-' : s.absent ? 'AB' : num(s.marks), 3, y + 7, { bold: true });
    cell(s.grade || '-', 4, y + 7);
    cell(STATUS_TEXT[s.status], 5, y + 7, { bold: true, color: COLORS[s.status] });
    y += 26;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.5).strokeColor(RULE).stroke();
  }
  // totals
  doc.rect(M, y, W, 28).fill('#f2f4f3');
  cell('Total', 0, y + 8, { bold: true });
  cell(num(result.totalMax), 1, y + 8, { bold: true });
  cell(num(result.totalObtained), 3, y + 8, { bold: true });
  y += 44;

  // summary
  if (y > 640) { doc.addPage(); registerFonts(doc); y = 40; }
  const box = (label, value, x, color) => {
    doc.roundedRect(x, y, 160, 54, 4).lineWidth(0.8).strokeColor(RULE).stroke();
    drawText(doc, label, x + 12, y + 9, { size: 8.5, color: SOFT });
    drawText(doc, value, x + 12, y + 24, { size: 17, bold: true, width: 136, color });
  };
  box('Percentage', result.percentage === null ? '-' : `${result.percentage}%`, M, GREEN);
  box('Overall grade', result.grade || '-', M + 177, GREEN);
  box('Result', { pass: 'PASS', fail: 'FAIL', pending: 'PENDING' }[result.result], M + 354, COLORS[result.result]);
  y += 70;

  if (result.pendingSubjects.length) {
    doc.roundedRect(M, y, W, 30, 4).fill('#f6ead2');
    drawText(doc, `Result pending: marks not yet entered for ${result.pendingSubjects.join(', ')}.`, M + 12, y + 10, { size: 9.5, width: W - 24, color: '#7a4f08' });
    y += 44;
  }

  if (remarks.length) {
    if (y > 660) { doc.addPage(); registerFonts(doc); y = 40; }
    drawText(doc, "Teachers' remarks", M, y, { size: 11, bold: true, color: GREEN });
    y += 20;
    for (const r of remarks) {
      const t = `${r.remark}`;
      doc.font('latin').fontSize(9.5);
      const h = Math.min(Math.ceil(t.length / 95) * 13 + 4, 58);
      drawText(doc, `${r.teacherName}, ${fmtDate(String(r.createdAt).slice(0, 10))}`, M, y, { size: 8.5, color: SOFT, width: W });
      doc.fillColor('#1b2420');
      // remarks may contain Hindi, so they go through the same mixed-script line drawing, one wrapped line at a time
      const words = t.split(/\s+/);
      let line = '';
      let ly = y + 12;
      for (const w of words) {
        const probe = line ? `${line} ${w}` : w;
        if (probe.length > 95 && line) { drawText(doc, line, M, ly, { size: 9.5, width: W }); ly += 13; line = w; } else { line = probe; }
      }
      if (line) drawText(doc, line, M, ly, { size: 9.5, width: W });
      y = Math.max(y + h, ly + 20);
    }
  }

  // footer / signatures
  const fy = 770;
  doc.moveTo(M, fy).lineTo(M + 150, fy).lineWidth(0.6).strokeColor(SOFT).stroke();
  doc.moveTo(M + W - 150, fy).lineTo(M + W, fy).stroke();
  drawText(doc, classTeacher ? `Class teacher: ${classTeacher}` : 'Class teacher', M, fy + 4, { size: 8.5, color: SOFT, width: 200 });
  drawText(doc, 'Principal', M + W - 150, fy + 4, { size: 8.5, color: SOFT, width: 150, align: 'right' });
  drawText(doc, `Generated on ${fmtDate(new Date().toISOString().slice(0, 10))}`, M, fy + 20, { size: 7.5, color: SOFT, width: W, align: 'center' });
}

function render(data) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Report card - ${data.info.studentName}`, Author: process.env.SCHOOL_NAME || 'School ERP' } });
  build(doc, data);
  return doc;
}

module.exports = { prepare, render };
