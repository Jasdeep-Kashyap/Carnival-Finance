// src/utils.js — shared utility functions

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'warn'|'info'} type
 */
export function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container') || createToastContainer();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.prepend(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, 3500);
}

function createToastContainer() {
  const el = document.createElement('div');
  el.id = 'toast-container';
  document.body.appendChild(el);
  return el;
}

/**
 * Format a token amount to Indian rupee string
 * @param {number} tokens
 * @param {number} tokenValue  tokens-per-rupee ratio (default 1)
 */
export function formatRupees(tokens, tokenValue = 1) {
  const rupees = tokens * tokenValue;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function formatTokens(n) {
  return Number(n).toLocaleString('en-IN');
}

/**
 * Format a JS Date / ISO string to "DD MMM, HH:MM"
 */
export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  });
}

/**
 * Relative time string ("2 minutes ago")
 */
export function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

/**
 * Generate a UUID v4
 */
export function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      );
}

/**
 * Escape HTML for safe insertion
 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Download a string as a file
 */
export function downloadFile(content, filename, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert an array of objects to CSV string
 */
export function toCSV(rows) {
  if (!rows?.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const v = r[h] ?? '';
        return String(v).includes(',') ? `"${v}"` : v;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

/**
 * Role badge HTML
 */
export function roleBadge(role) {
  const map = { admin: 'badge-danger', counter: 'badge-success', stall: 'badge-brand' };
  return `<span class="badge ${map[role] || 'badge-ghost'}">${esc(role)}</span>`;
}

/**
 * Kind badge
 */
export function kindBadge(kind) {
  const map = {
    create:  ['badge-success', '🆕'],
    top_up:  ['badge-info',    '⬆️'],
    spend:   ['badge-brand',   '💳'],
    refund:  ['badge-warn',    '↩️'],
    reverse: ['badge-danger',  '🔄'],
  };
  const [cls, icon] = map[kind] || ['badge-ghost', '?'];
  return `<span class="badge ${cls}">${icon} ${esc(kind)}</span>`;
}

/**
 * Simple tab controller
 */
export function initTabs(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const buttons = container.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

/**
 * Show / hide element
 */
export function show(el) { if (el) el.classList.remove('hidden'); }
export function hide(el) { if (el) el.classList.add('hidden'); }
export function toggle(el, cond) { cond ? show(el) : hide(el); }

/**
 * Set text content safely
 */
export function setText(sel, text) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (el) el.textContent = text;
}
