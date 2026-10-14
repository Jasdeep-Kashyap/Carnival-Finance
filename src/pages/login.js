// src/pages/login.js
import { signIn, getSession, getProfile } from '../supabase.js';
import { toast } from '../utils.js';

const form    = document.getElementById('login-form');
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const btn     = document.getElementById('login-btn');
const spinner = document.getElementById('login-spinner');
const alertEl = document.getElementById('alert-area');

function showAlert(msg, type = 'danger') {
  alertEl.innerHTML = `<div class="alert alert-${type}"><span>⚠️</span><span>${msg}</span></div>`;
}

// If already logged in, redirect based on role
(async () => {
  const session = await getSession();
  if (session) {
    try {
      const profile = await getProfile(session.user.id);
      redirectByRole(profile.role);
    } catch {/* not yet profiled */}
  }
})();

function redirectByRole(role) {
  const map = { admin: '/admin.html', counter: '/counter.html', stall: '/stall.html' };
  const dest = map[role] || '/dashboard.html';
  window.location.href = dest;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertEl.innerHTML = '';
  btn.disabled = true;
  spinner.classList.remove('hidden');

  try {
    const { session } = await signIn(emailEl.value.trim(), passEl.value);
    if (!session) throw new Error('Login failed. Check credentials.');

    const profile = await getProfile(session.user.id);
    toast('Welcome back, ' + (profile.display_name || 'Staff') + '!', 'success');
    setTimeout(() => redirectByRole(profile.role), 600);
  } catch (err) {
    showAlert(err.message || 'Login failed.');
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
});
