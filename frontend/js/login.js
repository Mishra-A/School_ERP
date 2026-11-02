import { api } from './api.js';

const form = document.getElementById('login-form');
const errBox = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

// Already signed in? Skip the form.
api.get('/api/auth/me').then(() => { location.href = '/pages/dashboard.html'; }).catch(() => {});

function showError(msg) { errBox.textContent = msg; errBox.classList.remove('d-none'); }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.classList.add('d-none');
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Enter a valid email address.');
  if (!password) return showError('Enter your password.');

  btn.disabled = true;
  btn.textContent = 'Logging in...';
  try {
    await api.post('/api/auth/login', { email, password });
    location.href = '/pages/dashboard.html';
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});
