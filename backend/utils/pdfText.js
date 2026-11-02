// PDF text helpers: Latin text in Noto Sans, Devanagari (Hindi) in Noto Sans Devanagari, picked per run,
// because PDFKit does not fall back between fonts by itself. Falls back to Helvetica if the font files are missing.
const DEV_RE = /[\u0900-\u097F\u200C\u200D]+(?:[ ]+[\u0900-\u097F\u200C\u200D]+)*/g;

function resolve(name) {
  try { return require.resolve(name); } catch { return null; }
}

const FILES = {
  latin: resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
  latinBold: resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'),
  dev: resolve('@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff'),
  devBold: resolve('@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff'),
};
const HAVE_FONTS = Boolean(FILES.latin && FILES.latinBold && FILES.dev && FILES.devBold);

function registerFonts(doc) {
  if (!HAVE_FONTS) return;
  doc.registerFont('latin', FILES.latin);
  doc.registerFont('latin-bold', FILES.latinBold);
  doc.registerFont('dev', FILES.dev);
  doc.registerFont('dev-bold', FILES.devBold);
}

// Splits a string into [{ text, dev }] runs.
function runs(text) {
  const out = [];
  let last = 0;
  String(text).replace(DEV_RE, (m, idx) => {
    if (idx > last) out.push({ text: text.slice(last, idx), dev: false });
    out.push({ text: m, dev: true });
    last = idx + m.length;
    return m;
  });
  if (last < text.length) out.push({ text: text.slice(last), dev: false });
  return out;
}

function fontFor(run, bold) {
  if (!HAVE_FONTS) return bold ? 'Helvetica-Bold' : 'Helvetica';
  return `${run.dev ? 'dev' : 'latin'}${bold ? '-bold' : ''}`;
}

// Without the font files, drop characters Helvetica cannot show rather than printing garbage.
const safe = (t) => (HAVE_FONTS ? String(t ?? '') : String(t ?? '').replace(/[^\x20-\x7E]/g, '?'));

function widthOf(doc, text, size, bold = false) {
  doc.fontSize(size);
  return runs(safe(text)).reduce((w, r) => w + doc.font(fontFor(r, bold)).widthOfString(r.text), 0);
}

// Draws one line of mixed-script text. align: 'left' | 'right' | 'center' within [x, x + width]. Long text is shortened with "...".
function drawText(doc, text, x, y, { size = 10, bold = false, width, align = 'left', color = '#1b2420' } = {}) {
  let t = safe(text);
  if (width) {
    while (t.length > 1 && widthOf(doc, t, size, bold) > width) t = `${t.slice(0, -2)}…`.replace('……', '…');
  }
  const total = widthOf(doc, t, size, bold);
  let cx = x;
  if (width && align === 'right') cx = x + width - total;
  if (width && align === 'center') cx = x + (width - total) / 2;
  doc.fillColor(color).fontSize(size);
  for (const r of runs(t)) {
    doc.font(fontFor(r, bold)).text(r.text, cx, y, { lineBreak: false });
    cx += doc.widthOfString(r.text);
  }
  return total;
}

module.exports = { registerFonts, drawText, widthOf, HAVE_FONTS };
