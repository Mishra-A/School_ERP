const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 10 * 1024 * 1024;

// Allowed extensions and the first bytes a genuine file of that type starts with.
const SIGNATURES = {
  pdf: [Buffer.from('%PDF')],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  docx: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  xlsx: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  pptx: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  doc: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  xls: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  ppt: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  txt: null, // plain text: checked for binary content instead
};
const ALLOWED_LIST = Object.keys(SIGNATURES).join(', ');

const extOf = (name) => path.extname(name || '').slice(1).toLowerCase();

// Files are saved under random names, never the uploader's filename.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.${extOf(file.originalname)}`),
});

const uploader = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!(extOf(file.originalname) in SIGNATURES)) {
      return cb(new AppError(`That file type isn't allowed. Allowed: ${ALLOWED_LIST}.`, 422));
    }
    cb(null, true);
  },
});

function remove(storedName) {
  if (!storedName || path.basename(storedName) !== storedName) return;
  fs.unlink(path.join(UPLOAD_DIR, storedName), () => {});
}

// Reads the start of the saved file and rejects it if it doesn't look like its extension claims.
function verifySignature(file) {
  const ext = extOf(file.filename);
  const fd = fs.openSync(file.path, 'r');
  try {
    const head = Buffer.alloc(1024);
    const n = fs.readSync(fd, head, 0, 1024, 0);
    const bytes = head.subarray(0, n);
    const sigs = SIGNATURES[ext];
    const good = sigs ? sigs.some((sig) => bytes.subarray(0, sig.length).equals(sig)) : !bytes.includes(0);
    if (!n || !good) throw new AppError(`That file doesn't look like a real .${ext} file.`, 422);
  } finally {
    fs.closeSync(fd);
  }
}

// Express middleware: parses one optional/required file field named "file" and validates it.
function uploadOne({ required = false } = {}) {
  const handler = uploader.single('file');
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err) return next(err);
      try {
        if (!req.file && required) throw new AppError('Choose a file to upload.', 422);
        if (req.file) verifySignature(req.file);
        next();
      } catch (e) {
        if (req.file) remove(req.file.filename);
        next(e);
      }
    });
  };
}

function sendDownload(res, storedName, displayTitle) {
  if (!storedName || path.basename(storedName) !== storedName) throw new AppError('File not found.', 404);
  const full = path.join(UPLOAD_DIR, storedName);
  if (!fs.existsSync(full)) throw new AppError('This file is no longer available.', 404);
  const base = String(displayTitle || 'file').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'file';
  res.download(full, `${base}.${extOf(storedName)}`);
}

module.exports = { uploadOne, remove, sendDownload, ALLOWED_LIST, UPLOAD_DIR };
