const crypto = require('crypto');
const bcrypt = require('bcrypt');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
const BCRYPT_ROUNDS = 12;

// 10-char random password shown to the admin once, then only its hash is stored.
function generateTempPassword(length = 10) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

module.exports = { generateTempPassword, hashPassword, BCRYPT_ROUNDS };
