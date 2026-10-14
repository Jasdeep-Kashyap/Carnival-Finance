// src/pages/stall.js
import { BrowserQRCodeReader } from '@zxing/browser';
import {
  supabase, getSession, getProfile, signOut,
  getWalletByCode, getMyStallWallet, rpc_spend, rpc_reverseEntry,
} from '../supabase.js';
import { toast, uuid, formatTokens, show, hide, setText } from '../utils.js';

// ─── State ────────────────────────────────────────────────────────
let currentUser = null;
let myStallWallet = null;
let currentAttendee = null;
let selectedAmount = 0;
let lastLedgerId = null;
let undoTimer = null;
let scanInterval = null;
let videoStream = null;

const screens = ['scan', 'amount', 'confirm', 'success', 'error'];
const showScreen = (name) => screens.forEach(s => {
  const el = document.getElementById(`screen-${s}`);
  if (el) name === s ? show(el) : hide(el);
});

// ─── Auth guard ───────────────────────────────────────────────────
async function init() {
  const session = await getSession();
  if (!session) { window.location.href = '/index.html'; return; }

  const profile = await getProfile(session.user.id);
  if (!['stall', 'admin'].includes(profile.role)) {
    toast('Access denied. Stall volunteer or admin role required.', 'error');
    setTimeout(() => { window.location.href = '/index.html'; }, 1500);
    return;
  }
  currentUser = profile;

  try {
    myStallWallet = await getMyStallWallet(session.user.id);
    document.getElementById('stall-name-badge').textContent = myStallWallet.stalls?.name || 'Stall';
    updateStallStats();
  } catch {
    toast('No stall assigned to your account. Contact admin.', 'error');
  }

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOut(); window.location.href = '/index.html';
  });

  setupScanner();
  setupAmountScreen();
  setupConfirmScreen();

  // Realtime: update stall stats live
  supabase.channel('my-stall-wallet')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'stall_wallets',
      filter: `id=eq.${myStallWallet?.id}`,
    }, (payload) => {
      if (myStallWallet) {
        myStallWallet.balance = payload.new.balance;
        myStallWallet.txn_count = payload.new.txn_count;
        updateStallStats();
      }
    })
    .subscribe();
}

function updateStallStats() {
  if (!myStallWallet) return;
  setText('#stall-balance', `₹${formatTokens(myStallWallet.balance || 0)}`);
  setText('#stall-txn-count', formatTokens(myStallWallet.txn_count || 0));
}

// ─── SCANNER ─────────────────────────────────────────────────────
function setupScanner() {
  const startBtn     = document.getElementById('start-scan-btn');
  const manualInput  = document.getElementById('manual-code');
  const manualGoBtn  = document.getElementById('manual-lookup-btn');
  const video        = document.getElementById('stall-video');
  const placeholder  = document.getElementById('scanner-placeholder');

  startBtn.addEventListener('click', async () => {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = videoStream;
      video.style.display = 'block';
      placeholder.style.display = 'none';
      await video.play();

      // Use BarcodeDetector if available, else use canvas + zxing polyfill approach
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        scanInterval = setInterval(async () => {
          try {
            const codes = await detector.detect(video);
            if (codes.length) {
              clearInterval(scanInterval);
              stopCamera();
              handleScannedCode(codes[0].rawValue);
            }
          } catch {/* ignore */}
        }, 300);
      } else {
        // Fallback: use @zxing/browser
        toast('Camera started. Scanning for QR…', 'info');
        try {
          const reader = new BrowserQRCodeReader();
          reader.decodeFromVideoDevice(null, video, (result) => {
            if (result) {
              reader.reset();
              stopCamera();
              handleScannedCode(result.getText());
            }
          });
        } catch { /* zxing unavailable, use manual entry */ }
      }
      startBtn.textContent = '⏹ Stop Camera';
      startBtn.onclick = stopCamera;
    } catch {
      toast('Camera permission denied or unavailable. Use manual entry.', 'error');
    }
  });

  manualGoBtn.addEventListener('click', () => {
    const code = manualInput.value.trim().toUpperCase();
    if (!code) { toast('Enter a card code.', 'warn'); return; }
    handleScannedCode(code);
  });
  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = manualInput.value.trim().toUpperCase();
      if (code) handleScannedCode(code);
    }
  });
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  const video = document.getElementById('stall-video');
  video.style.display = 'none';
  document.getElementById('scanner-placeholder').style.display = 'flex';
  const btn = document.getElementById('start-scan-btn');
  btn.textContent = '📷 Scan Card';
  btn.onclick = null;
  setupScanner();
}

async function handleScannedCode(code) {
  document.getElementById('stall-alert').innerHTML = '';
  try {
    currentAttendee = await getWalletByCode(code);
    // Show amount screen
    setText('#amount-card-code', code);
    setText('#amount-balance', `₹${formatTokens(currentAttendee.balance)}`);
    selectedAmount = 0;
    document.querySelectorAll('#stall-amounts .amount-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('stall-custom-amount').value = '';
    document.getElementById('proceed-to-confirm-btn').disabled = true;
    showScreen('amount');
  } catch {
    showErrorScreen('❌', 'Card Not Found', `No wallet found for code: ${code}`);
  }
}

// ─── AMOUNT SCREEN ────────────────────────────────────────────────
function setupAmountScreen() {
  const amountBtns = document.querySelectorAll('#stall-amounts .amount-btn');
  const customInput = document.getElementById('stall-custom-amount');
  const proceedBtn  = document.getElementById('proceed-to-confirm-btn');

  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      amountBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      customInput.value = '';
      selectedAmount = Number(btn.dataset.amount);
      proceedBtn.disabled = selectedAmount < 1;
    });
  });
  customInput.addEventListener('input', () => {
    amountBtns.forEach(b => b.classList.remove('selected'));
    selectedAmount = Number(customInput.value) || 0;
    proceedBtn.disabled = selectedAmount < 1;
  });

  proceedBtn.addEventListener('click', () => {
    if (!selectedAmount || !currentAttendee) return;
    if (selectedAmount > currentAttendee.balance) {
      showErrorScreen('💸', 'Insufficient Balance',
        `Card balance is ₹${formatTokens(currentAttendee.balance)} but you're charging ₹${formatTokens(selectedAmount)}.`);
      return;
    }
    // Populate confirm screen
    setText('#confirm-card-code', currentAttendee.public_code);
    setText('#confirm-amount', `₹${formatTokens(selectedAmount)}`);
    setText('#confirm-stall-name', `to ${myStallWallet?.stalls?.name || 'Stall'}`);
    showScreen('confirm');
  });

  document.getElementById('amount-back-btn').addEventListener('click', () => {
    currentAttendee = null;
    selectedAmount = 0;
    showScreen('scan');
  });
}

// ─── CONFIRM SCREEN ───────────────────────────────────────────────
function setupConfirmScreen() {
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    showScreen('amount');
  });

  document.getElementById('confirm-charge-btn').addEventListener('click', async () => {
    const btn     = document.getElementById('confirm-charge-btn');
    const spinner = document.getElementById('charge-spinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');

    const idempotencyKey = uuid();

    try {
      const result = await rpc_spend({
        public_code: currentAttendee.public_code,
        stall_wallet_id: myStallWallet.id,
        tokens: selectedAmount,
        idempotency_key: idempotencyKey,
      });

      lastLedgerId = result.ledger_id;

      // Update local stats
      if (myStallWallet) {
        myStallWallet.balance = result.stall_balance;
        myStallWallet.txn_count = (myStallWallet.txn_count || 0) + 1;
        updateStallStats();
      }

      // Show success
      setText('#success-attendee-bal', `₹${formatTokens(result.attendee_balance)}`);
      setText('#success-stall-bal', `₹${formatTokens(result.stall_balance)}`);
      showScreen('success');
      startUndoTimer();
      toast('Charge successful!', 'success');
    } catch (err) {
      let title = 'Charge Failed';
      let msg = err.message;
      if (msg.includes('insufficient')) {
        showErrorScreen('💸', 'Insufficient Balance', msg);
      } else if (msg.includes('duplicate') || msg.includes('idempotent')) {
        showErrorScreen('🔄', 'Duplicate Request', 'This charge was already processed.');
      } else {
        showErrorScreen('❌', title, msg + '\n\nPlease retry or record on paper.');
      }
      return;
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
    }
  });

  document.getElementById('next-charge-btn').addEventListener('click', () => {
    clearUndoTimer();
    currentAttendee = null;
    selectedAmount = 0;
    lastLedgerId = null;
    showScreen('scan');
  });

  // Undo
  document.getElementById('undo-btn').addEventListener('click', async () => {
    if (!lastLedgerId) return;
    clearUndoTimer();
    try {
      await rpc_reverseEntry({ ledger_id: lastLedgerId, reason: 'Undo by stall volunteer' });
      toast('Charge undone successfully.', 'success');
      if (myStallWallet) {
        myStallWallet.balance = Math.max(0, (myStallWallet.balance || 0) - selectedAmount);
        myStallWallet.txn_count = Math.max(0, (myStallWallet.txn_count || 0) - 1);
        updateStallStats();
      }
    } catch (err) {
      toast('Failed to undo: ' + err.message, 'error');
    }
    lastLedgerId = null;
    showScreen('scan');
  });
}

// ─── UNDO TIMER ───────────────────────────────────────────────────
const UNDO_DURATION = 30;
function startUndoTimer() {
  clearUndoTimer();
  const bar   = document.getElementById('undo-progress-bar');
  const text  = document.getElementById('undo-timer-text');
  const undoBar = document.getElementById('undo-bar');
  show(undoBar);
  bar.style.width = '100%';

  let remaining = UNDO_DURATION;
  text.textContent = `${remaining}s remaining`;

  undoTimer = setInterval(() => {
    remaining -= 1;
    bar.style.width = `${(remaining / UNDO_DURATION) * 100}%`;
    text.textContent = `${remaining}s remaining`;
    if (remaining <= 0) {
      clearUndoTimer();
      hide(undoBar);
      lastLedgerId = null;
    }
  }, 1000);
}

function clearUndoTimer() {
  if (undoTimer) { clearInterval(undoTimer); undoTimer = null; }
  hide(document.getElementById('undo-bar'));
}

// ─── ERROR SCREEN ─────────────────────────────────────────────────
function showErrorScreen(icon, title, message) {
  setText('#error-icon', icon);
  setText('#error-title', title);
  setText('#error-message', message);
  showScreen('error');
  document.getElementById('error-retry-btn').onclick = () => showScreen('scan');
}

init();
