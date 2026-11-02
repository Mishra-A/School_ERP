const AppError = require('./AppError');

// Small, dependency-free validation helpers. Each throws AppError(422) with a user-readable message.

function requireString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== 'string') throw new AppError(`${field} is required.`, 422);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new AppError(`${field} is required.`, 422);
  if (trimmed.length > max) throw new AppError(`${field} must be at most ${max} characters.`, 422);
  return trimmed;
}

function optionalString(value, field, { max = 255 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, { max });
}

function requireEmail(value) {
  const email = requireString(value, 'Email', { max: 190 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid email address.', 422);
  return email;
}

function toId(value, field = 'ID') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(`${field} is invalid.`, 422);
  return n;
}

function optionalId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return toId(value, field);
}

function requireDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new AppError(`${field} must be a valid date.`, 422);
  }
  return value;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireDate(value, field);
}

function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) throw new AppError(`${field} must be one of: ${allowed.join(', ')}.`, 422);
  return value;
}

function optionalEnum(value, field, allowed) {
  if (value === undefined || value === null || value === '') return null;
  return requireEnum(value, field, allowed);
}

function optionalPhone(value, field = 'Phone') {
  const v = optionalString(value, field, { max: 20 });
  if (v && !/^[0-9+\-\s()]{6,20}$/.test(v)) throw new AppError(`${field} looks invalid.`, 422);
  return v;
}

// Reads ?page=&limit= with sane bounds.
function pagination(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

// Escapes LIKE wildcards so user input is matched literally.
function likeTerm(search) {
  const s = String(search || '').trim().slice(0, 100);
  return s ? `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

module.exports = {
  requireString, optionalString, requireEmail, toId, optionalId, requireDate, optionalDate,
  requireEnum, optionalEnum, optionalPhone, pagination, likeTerm,
};

// ---- Phase 2 additions ----
function optionalString(value, field, { max = 255 } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (typeof value !== 'string') throw new AppError(`${field} is not valid.`, 422);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new AppError(`${field} must be at most ${max} characters.`, 422);
  return trimmed;
}

function requireInt(value, field, { min = 1 } = {}) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isInteger(n) || n < min) {
    throw new AppError(`${field} is required.`, 422);
  }
  return n;
}

function optionalInt(value, field, { min = 1 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requireInt(value, field, { min });
}

function isRealDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function requireDate(value, field) {
  if (typeof value !== 'string' || !isRealDate(value)) throw new AppError(`${field} must be a valid date.`, 422);
  return value;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireDate(value, field);
}

function oneOf(value, field, list) {
  if (!list.includes(value)) throw new AppError(`${field} must be one of: ${list.join(', ')}.`, 422);
  return value;
}

function optionalPhone(value) {
  const phone = optionalString(value, 'Phone', { max: 20 });
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) throw new AppError('Enter a valid phone number.', 422);
  return phone;
}

function parsePaging(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

// Escapes % and _ so a search term is matched literally inside LIKE.
function likeTerm(text) {
  return `%${String(text).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function parseId(value, field = 'id') {
  return requireInt(value, field);
}

Object.assign(module.exports, {
  optionalString, requireInt, optionalInt, requireDate, optionalDate, oneOf, optionalPhone, parsePaging, likeTerm, parseId,
});

// ---- Phase 4 additions
function requireNumber(value, field, { min = 0, max = Infinity, decimals = 2 } = {}) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') throw new AppError(`${field} is required.`, 422);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new AppError(`${field} must be a number.`, 422);
  if (n < min || n > max) throw new AppError(`${field} must be between ${min} and ${max}.`, 422);
  const f = 10 ** decimals;
  if (Math.round(n * f) / f !== n) throw new AppError(`${field} can have at most ${decimals} decimal places.`, 422);
  return n;
}
function optionalTime(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new AppError(`${field} must be a time like 09:30.`, 422);
  return value;
}
Object.assign(module.exports, { requireNumber, optionalTime });
