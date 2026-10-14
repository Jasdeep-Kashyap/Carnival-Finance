// src/pages/counter.js
import QRCode from 'qrcode';
import {
  supabase, getSession, getProfile, signOut,
  rpc_createAttendeeWallet, rpc_topUp, rpc_refundUnused,
  getWalletByCode, getCounterRecentActivity,
} from '../supabase.js';
import { toast, formatTokens, formatTime, kindBadge, initTabs, show, hide, setText } from '../utils.js';

// ─── Auth guard ───────────────────────────────────────────────────
let currentUser = null;

async function init() {
  const session = await getSession();
  if (!session) { window.location.href = '/index.html'; return; }

  const profile = await getProfile(session.user.id);
  if (!['counter', 'admin'].includes(profile.role)) {
    toast('Access denied. Counter or admin role required.', 'error');
    setTimeout(() => { window.location.href = '/index.html'; }, 1500);
    return;
  }
  currentUser = profile;
  document.getElementById('user-role-badge').textContent = profile.role;
  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOut(); window.location.href = '/index.html';
  });

  initTabs('#counter-tabs');
  setupCreateCard();
  setupTopUp();
  setupRefund();
  loadHistory();
}

// ─── Amount button helpers ─────────────────────────────────────────
function bindAmountButtons(gridId, customInputId, onSelect) {
  const btns = document.querySelectorAll(`#${gridId} .amount-btn`);
  const customInput = document.getElementById(customInputId);
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      customInput.value = '';
      onSelect(Number(btn.dataset.amount));
    });
  });
  customInput.addEventListener('input', () => {
    btns.forEach(b => b.classList.remove('selected'));
    onSelect(Number(customInput.value) || 0);
  });
}

// ─── CREATE CARD ──────────────────────────────────────────────────
function setupCreateCard() {
  let selectedAmount = 0;
  bindAmountButtons('create-amounts', 'create-custom', v => { selectedAmount = v; });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('create-alert');
    alertEl.innerHTML = '';

    const tokens = selectedAmount || Number(document.getElementById('create-custom').value);
    if (!tokens || tokens < 1) {
      alertEl.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>Please select or enter an amount.</span></div>`;
      return;
    }

    const btn = document.getElementById('create-btn');
    const spinner = document.getElementById('create-spinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');

    try {
      const result = await rpc_createAttendeeWallet({
        name: document.getElementById('create-name').value.trim() || null,
        tokens,
        payment_method: document.getElementById('create-payment').value,
        upi_ref: document.getElementById('create-upi-ref').value.trim() || null,
      });

      // Show QR result
      const code = result.public_code;
      document.getElementById('create-result').classList.remove('hidden');

      // Generate QR into canvas
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, code, { width: 220, margin: 1, color: { dark: '#0a0b0f', light: '#ffffff' } });
      const qrWrap = document.getElementById('create-qr-canvas');
      qrWrap.innerHTML = '';
      qrWrap.appendChild(canvas);
      document.getElementById('create-code-display').textContent = code;

      // Print area
      const printCanvas = document.createElement('canvas');
      await QRCode.toCanvas(printCanvas, code, { width: 180, margin: 1 });
      document.getElementById('print-qr-canvas').innerHTML = '';
      document.getElementById('print-qr-canvas').appendChild(printCanvas);
      document.getElementById('print-code-text').textContent = code;
      const name = document.getElementById('create-name').value.trim();
      document.getElementById('print-name-text').textContent = name ? `Name: ${name}` : '';

      toast(`Card created! Code: ${code}`, 'success');
      loadHistory();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${err.message}</span></div>`;
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
    }
  });

  document.getElementById('create-another-btn').addEventListener('click', () => {
    document.getElementById('create-result').classList.add('hidden');
    document.getElementById('create-form').reset();
    document.querySelectorAll('#create-amounts .amount-btn').forEach(b => b.classList.remove('selected'));
    selectedAmount = 0;
  });
}

// ─── TOP UP ───────────────────────────────────────────────────────
function setupTopUp() {
  let selectedAmount = 0;
  let currentWallet = null;
  let scanner = null;

  bindAmountButtons('topup-amounts', 'topup-custom', v => { selectedAmount = v; });

  // Scan button
  document.getElementById('topup-scan-btn').addEventListener('click', async () => {
    const wrap = document.getElementById('topup-scanner-wrap');
    wrap.classList.remove('hidden');
    if (!scanner) {
      scanner = new Html5Qrcode('topup-scanner');
    }
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (code) => {
          document.getElementById('topup-code').value = code.toUpperCase();
          scanner.stop();
          wrap.classList.add('hidden');
          lookupTopUp(code.toUpperCase());
        },
        () => {}
      );
    } catch {
      toast('Camera permission denied or unavailable.', 'error');
    }
  });
  document.getElementById('topup-stop-scan').addEventListener('click', () => {
    if (scanner) scanner.stop().catch(() => {});
    document.getElementById('topup-scanner-wrap').classList.add('hidden');
  });

  document.getElementById('topup-lookup-btn').addEventListener('click', () => {
    const code = document.getElementById('topup-code').value.trim().toUpperCase();
    if (!code) { toast('Enter a card code.', 'warn'); return; }
    lookupTopUp(code);
  });

  async function lookupTopUp(code) {
    const alertEl = document.getElementById('topup-alert');
    alertEl.innerHTML = '';
    try {
      currentWallet = await getWalletByCode(code);
      document.getElementById('topup-card-code').textContent = code;
      const nameEl = document.getElementById('topup-card-name');
      nameEl.textContent = currentWallet.name ? ` — ${currentWallet.name}` : '';
      document.getElementById('topup-current-balance').textContent = `₹${formatTokens(currentWallet.balance)}`;
      show(document.getElementById('topup-step2'));
      hide(document.getElementById('topup-step1'));
    } catch {
      alertEl.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>Card not found: ${code}</span></div>`;
    }
  }

  document.getElementById('topup-back-btn').addEventListener('click', () => {
    hide(document.getElementById('topup-step2'));
    show(document.getElementById('topup-step1'));
    hide(document.getElementById('topup-step3'));
    document.getElementById('topup-code').value = '';
    document.querySelectorAll('#topup-amounts .amount-btn').forEach(b => b.classList.remove('selected'));
    selectedAmount = 0;
  });

  document.getElementById('topup-confirm-btn').addEventListener('click', async () => {
    const tokens = selectedAmount || Number(document.getElementById('topup-custom').value);
    if (!tokens || tokens < 1) { toast('Select or enter an amount.', 'warn'); return; }
    const alertEl = document.getElementById('topup-alert');
    const btn = document.getElementById('topup-confirm-btn');
    const spinner = document.getElementById('topup-spinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    try {
      const newBal = await rpc_topUp({
        public_code: currentWallet.public_code,
        tokens,
        payment_method: document.getElementById('topup-payment').value,
        upi_ref: document.getElementById('topup-upi-ref').value.trim() || null,
      });
      document.getElementById('topup-added').textContent = `₹${formatTokens(tokens)}`;
      document.getElementById('topup-new-balance').textContent = `₹${formatTokens(newBal)}`;
      hide(document.getElementById('topup-step2'));
      show(document.getElementById('topup-step3'));
      toast('Top up successful!', 'success');
      loadHistory();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${err.message}</span></div>`;
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
    }
  });

  document.getElementById('topup-reset-btn').addEventListener('click', () => {
    hide(document.getElementById('topup-step3'));
    hide(document.getElementById('topup-step2'));
    show(document.getElementById('topup-step1'));
    document.getElementById('topup-code').value = '';
    document.getElementById('topup-custom').value = '';
    document.querySelectorAll('#topup-amounts .amount-btn').forEach(b => b.classList.remove('selected'));
    selectedAmount = 0;
    currentWallet = null;
  });
}

// ─── REFUND ───────────────────────────────────────────────────────
function setupRefund() {
  let selectedAmount = 0;
  let currentWallet = null;
  let scanner = null;

  const amountBtns = document.querySelectorAll('#refund-amounts .amount-btn:not(#refund-all-btn)');
  const customInput = document.getElementById('refund-custom');

  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      amountBtns.forEach(b => b.classList.remove('selected'));
      document.getElementById('refund-all-btn').classList.remove('selected');
      btn.classList.add('selected');
      customInput.value = '';
      selectedAmount = Number(btn.dataset.amount);
    });
  });
  document.getElementById('refund-all-btn').addEventListener('click', () => {
    amountBtns.forEach(b => b.classList.remove('selected'));
    document.getElementById('refund-all-btn').classList.add('selected');
    customInput.value = '';
    selectedAmount = currentWallet ? currentWallet.balance : 0;
  });
  customInput.addEventListener('input', () => {
    amountBtns.forEach(b => b.classList.remove('selected'));
    document.getElementById('refund-all-btn').classList.remove('selected');
    selectedAmount = Number(customInput.value) || 0;
  });

  document.getElementById('refund-scan-btn').addEventListener('click', async () => {
    const wrap = document.getElementById('refund-scanner-wrap');
    wrap.classList.remove('hidden');
    if (!scanner) {
      scanner = new Html5Qrcode('refund-scanner');
    }
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (code) => {
          document.getElementById('refund-code').value = code.toUpperCase();
          scanner.stop();
          wrap.classList.add('hidden');
          lookupRefund(code.toUpperCase());
        },
        () => {}
      );
    } catch { toast('Camera unavailable.', 'error'); }
  });
  document.getElementById('refund-stop-scan').addEventListener('click', () => {
    if (scanner) scanner.stop().catch(() => {});
    document.getElementById('refund-scanner-wrap').classList.add('hidden');
  });

  document.getElementById('refund-lookup-btn').addEventListener('click', () => {
    const code = document.getElementById('refund-code').value.trim().toUpperCase();
    if (!code) { toast('Enter a card code.', 'warn'); return; }
    lookupRefund(code);
  });

  async function lookupRefund(code) {
    document.getElementById('refund-alert').innerHTML = '';
    try {
      currentWallet = await getWalletByCode(code);
      document.getElementById('refund-card-code').textContent = code;
      document.getElementById('refund-current-balance').textContent = `₹${formatTokens(currentWallet.balance)}`;
      show(document.getElementById('refund-step2'));
      hide(document.getElementById('refund-step1'));
    } catch {
      document.getElementById('refund-alert').innerHTML = `<div class="alert alert-danger"><span>❌</span><span>Card not found: ${code}</span></div>`;
    }
  }

  document.getElementById('refund-back-btn').addEventListener('click', () => {
    hide(document.getElementById('refund-step2'));
    show(document.getElementById('refund-step1'));
    document.getElementById('refund-code').value = '';
    amountBtns.forEach(b => b.classList.remove('selected'));
    document.getElementById('refund-all-btn').classList.remove('selected');
    selectedAmount = 0;
  });

  document.getElementById('refund-confirm-btn').addEventListener('click', async () => {
    const tokens = selectedAmount;
    if (!tokens || tokens < 1) { toast('Select a refund amount.', 'warn'); return; }
    if (tokens > currentWallet.balance) {
      document.getElementById('refund-alert').innerHTML = `<div class="alert alert-danger"><span>❌</span><span>Refund amount exceeds balance.</span></div>`;
      return;
    }
    const btn = document.getElementById('refund-confirm-btn');
    const spinner = document.getElementById('refund-spinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    try {
      const newBal = await rpc_refundUnused({
        public_code: currentWallet.public_code,
        tokens,
        payment_method: document.getElementById('refund-payment').value,
      });
      document.getElementById('refund-amount-show').textContent = `₹${formatTokens(tokens)}`;
      document.getElementById('refund-new-balance').textContent = `₹${formatTokens(newBal)}`;
      hide(document.getElementById('refund-step2'));
      show(document.getElementById('refund-step3'));
      toast('Refund processed!', 'success');
      loadHistory();
    } catch (err) {
      document.getElementById('refund-alert').innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${err.message}</span></div>`;
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
    }
  });

  document.getElementById('refund-reset-btn').addEventListener('click', () => {
    hide(document.getElementById('refund-step3'));
    hide(document.getElementById('refund-step2'));
    show(document.getElementById('refund-step1'));
    document.getElementById('refund-code').value = '';
    customInput.value = '';
    amountBtns.forEach(b => b.classList.remove('selected'));
    document.getElementById('refund-all-btn').classList.remove('selected');
    selectedAmount = 0;
    currentWallet = null;
  });
}

// ─── HISTORY ──────────────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById('history-list');
  try {
    const rows = await getCounterRecentActivity(20);
    if (!rows?.length) {
      list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--clr-text-3)">No recent activity yet.</div>`;
      return;
    }
    const icons = { create: '🆕', top_up: '⬆️', refund: '↩️' };
    list.innerHTML = rows.map(r => `
      <div class="feed-item">
        <div class="feed-icon ${r.kind}">${icons[r.kind] || '•'}</div>
        <div class="feed-body">
          <div class="feed-title">${r.attendee_wallets?.public_code || '—'}</div>
          <div class="feed-sub">${r.attendee_wallets?.name ? r.attendee_wallets.name + ' · ' : ''}${formatTime(r.created_at)}</div>
        </div>
        <div class="feed-amount ${r.kind === 'refund' ? 'text-danger' : 'text-brand'}">
          ${r.kind === 'refund' ? '-' : '+'}₹${formatTokens(r.tokens)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="alert alert-danger" style="margin:0">${err.message}</div>`;
  }
}

// ─── Realtime: refresh history on new ledger inserts ──────────────
supabase.channel('counter-ledger')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ledger' }, loadHistory)
  .subscribe();

init();
