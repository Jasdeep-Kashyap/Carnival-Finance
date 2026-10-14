// src/pages/admin.js
import {
  supabase, getSession, getProfile, signOut,
  getLedger, getStalls, getProfiles,
  rpc_reverseEntry, getSettings, updateSettings,
  getStallLeaderboard,
} from '../supabase.js';
import {
  toast, formatTokens, formatTime, kindBadge, roleBadge,
  esc, toCSV, downloadFile, show, hide,
} from '../utils.js';

// ─── State ────────────────────────────────────────────────────────
let currentUser = null;
let allStalls = [];
let allProfiles = [];
let allLedger = [];
let selectedReverseId = null;
let tokenValue = 1;

// ─── Auth guard ───────────────────────────────────────────────────
async function init() {
  const session = await getSession();
  if (!session) { window.location.href = '/index.html'; return; }
  const profile = await getProfile(session.user.id);
  if (profile.role !== 'admin') {
    toast('Admin access required.', 'error');
    setTimeout(() => { window.location.href = '/index.html'; }, 1500);
    return;
  }
  currentUser = profile;

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOut(); window.location.href = '/index.html';
  });

  setupSidebar();
  await Promise.allSettled([loadStalls(), loadStaff(), loadLedger(), loadSettings()]);
  setupExport();
  setupSettingsForm();
  setupStallModal();
  setupReverseModal();
}

// ─── Sidebar navigation ───────────────────────────────────────────
function setupSidebar() {
  const sections = ['stalls', 'staff', 'ledger', 'export', 'settings'];
  const links = document.querySelectorAll('.sidebar-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      sections.forEach(s => {
        const el = document.getElementById(`section-${s}`);
        if (el) el.classList.toggle('hidden', s !== link.dataset.section);
      });
    });
  });
}

// ─── STALLS ──────────────────────────────────────────────────────
async function loadStalls() {
  try {
    allStalls = await getStalls();
    renderStallsTable();
    populateStallFilter();
    populateStallAssignSelect();
  } catch (err) {
    document.getElementById('stalls-tbody').innerHTML =
      `<tr><td colspan="6" class="text-danger" style="padding:1rem">${esc(err.message)}</td></tr>`;
  }
}

function renderStallsTable() {
  const tbody = document.getElementById('stalls-tbody');
  if (!allStalls?.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--clr-text-3)">No stalls yet. Add one!</td></tr>`;
    return;
  }
  tbody.innerHTML = allStalls.map(s => {
    const wallet = s.stall_wallets?.[0];
    const assignedProfile = allProfiles.find(p => p.id === wallet?.assigned_user_id);
    return `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td><span class="mono" style="font-size:0.8rem">${esc(wallet?.id?.slice(0, 8) || '—')}…</span></td>
        <td><strong class="text-brand">₹${formatTokens(wallet?.balance || 0)}</strong></td>
        <td>${assignedProfile ? esc(assignedProfile.display_name || assignedProfile.email) : '<span style="color:var(--clr-text-3)">Unassigned</span>'}</td>
        <td>${s.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-ghost">Inactive</span>'}</td>
        <td>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-sm" onclick="editStall('${esc(s.id)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="toggleStallActive('${esc(s.id)}', ${!s.active})">
              ${s.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.editStall = (id) => {
  const stall = allStalls.find(s => s.id === id);
  if (!stall) return;
  document.getElementById('stall-modal-title').textContent = 'Edit Stall';
  document.getElementById('stall-modal-name').value = stall.name;
  const wallet = stall.stall_wallets?.[0];
  document.getElementById('stall-modal-assign').value = wallet?.assigned_user_id || '';
  document.getElementById('stall-modal-save').dataset.stallId = id;
  show(document.getElementById('stall-modal-backdrop'));
};

window.toggleStallActive = async (id, active) => {
  try {
    await supabase.from('stalls').update({ active }).eq('id', id);
    toast(`Stall ${active ? 'activated' : 'deactivated'}.`, 'success');
    await loadStalls();
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ─── STAFF ───────────────────────────────────────────────────────
async function loadStaff() {
  try {
    allProfiles = await getProfiles();
    renderStaffTable();
    populateStallAssignSelect();
  } catch (err) {
    document.getElementById('staff-tbody').innerHTML =
      `<tr><td colspan="6" class="text-danger" style="padding:1rem">${esc(err.message)}</td></tr>`;
  }
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-tbody');
  if (!allProfiles?.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--clr-text-3)">No staff profiles found.</td></tr>`;
    return;
  }
  tbody.innerHTML = allProfiles.map(p => {
    const assignedStall = allStalls.find(s => s.stall_wallets?.[0]?.assigned_user_id === p.id);
    return `
      <tr>
        <td><span class="mono" style="font-size:0.82rem">${esc(p.email || '—')}</span></td>
        <td>${esc(p.display_name || '—')}</td>
        <td>${roleBadge(p.role)}</td>
        <td>${assignedStall ? esc(assignedStall.name) : '<span style="color:var(--clr-text-3)">—</span>'}</td>
        <td>${p.active !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-ghost">Inactive</span>'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="toggleUserActive('${esc(p.id)}', ${p.active === false})">
            ${p.active !== false ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.toggleUserActive = async (id, active) => {
  try {
    await supabase.from('profiles').update({ active }).eq('id', id);
    toast(`User ${active ? 'activated' : 'deactivated'}.`, 'success');
    await loadStaff();
  } catch (err) {
    toast(err.message, 'error');
  }
};

document.getElementById('add-staff-btn')?.addEventListener('click', () => {
  toast('To invite staff, use Supabase Auth → Invite user, then assign role in profiles table.', 'info');
});

// ─── LEDGER ──────────────────────────────────────────────────────
async function loadLedger(filters = {}) {
  try {
    allLedger = await getLedger(filters);
    renderLedgerTable();
  } catch (err) {
    document.getElementById('ledger-tbody').innerHTML =
      `<tr><td colspan="7" class="text-danger" style="padding:1rem">${esc(err.message)}</td></tr>`;
  }
}

function renderLedgerTable() {
  const tbody = document.getElementById('ledger-tbody');
  if (!allLedger?.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--clr-text-3)">No transactions found.</td></tr>`;
    return;
  }
  tbody.innerHTML = allLedger.map(r => `
    <tr>
      <td style="white-space:nowrap;font-size:0.82rem">${formatTime(r.created_at)}</td>
      <td>${kindBadge(r.kind)}</td>
      <td><span class="mono">${esc(r.attendee_wallets?.public_code || '—')}</span></td>
      <td>${esc(r.stall_wallets?.stalls?.name || '—')}</td>
      <td><strong class="text-brand">₹${formatTokens(r.tokens)}</strong></td>
      <td style="font-size:0.82rem">${esc(r.created_by_email || '—')}</td>
      <td>
        ${['spend', 'top_up'].includes(r.kind)
          ? `<button class="btn btn-danger btn-sm" onclick="openReverseModal('${esc(r.id)}', '${esc(r.kind)}', ${r.tokens})">Reverse</button>`
          : '<span style="color:var(--clr-text-3)">—</span>'}
      </td>
    </tr>
  `).join('');
}

// Filters
document.getElementById('filter-apply-btn')?.addEventListener('click', () => {
  loadLedger({
    kind:     document.getElementById('filter-kind').value || undefined,
    stall_id: document.getElementById('filter-stall').value || undefined,
    from:     document.getElementById('filter-from').value || undefined,
    to:       document.getElementById('filter-to').value || undefined,
  });
});
document.getElementById('filter-reset-btn')?.addEventListener('click', () => {
  ['filter-kind', 'filter-stall', 'filter-from', 'filter-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadLedger();
});

function populateStallFilter() {
  const sel = document.getElementById('filter-stall');
  if (!sel) return;
  sel.innerHTML = '<option value="">All Stalls</option>' +
    allStalls.map(s => `<option value="${esc(s.stall_wallets?.[0]?.id || '')}">${esc(s.name)}</option>`).join('');
}

// ─── REVERSE MODAL ────────────────────────────────────────────────
function setupReverseModal() {
  document.getElementById('reverse-modal-cancel').addEventListener('click', () => {
    hide(document.getElementById('reverse-modal-backdrop'));
    selectedReverseId = null;
  });
  document.getElementById('reverse-modal-confirm').addEventListener('click', async () => {
    const reason = document.getElementById('reverse-reason').value.trim();
    if (!reason) { toast('Please enter a reason.', 'warn'); return; }
    const btn = document.getElementById('reverse-modal-confirm');
    const spinner = document.getElementById('reverse-spinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    try {
      await rpc_reverseEntry({ ledger_id: selectedReverseId, reason });
      toast('Transaction reversed successfully.', 'success');
      hide(document.getElementById('reverse-modal-backdrop'));
      await loadLedger();
      await loadStalls();
    } catch (err) {
      toast('Reversal failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
      selectedReverseId = null;
    }
  });
}

window.openReverseModal = (id, kind, tokens) => {
  selectedReverseId = id;
  document.getElementById('reverse-entry-info').innerHTML =
    `<span>🔄</span><span>Reversing: ${kindBadge(kind)} ₹${formatTokens(tokens)}</span>`;
  document.getElementById('reverse-reason').value = '';
  show(document.getElementById('reverse-modal-backdrop'));
};

// ─── STALL MODAL ─────────────────────────────────────────────────
function setupStallModal() {
  document.getElementById('add-stall-btn').addEventListener('click', () => {
    document.getElementById('stall-modal-title').textContent = 'Add Stall';
    document.getElementById('stall-modal-name').value = '';
    document.getElementById('stall-modal-assign').value = '';
    delete document.getElementById('stall-modal-save').dataset.stallId;
    show(document.getElementById('stall-modal-backdrop'));
  });
  document.getElementById('stall-modal-cancel').addEventListener('click', () => {
    hide(document.getElementById('stall-modal-backdrop'));
  });
  document.getElementById('stall-modal-save').addEventListener('click', async () => {
    const name = document.getElementById('stall-modal-name').value.trim();
    if (!name) { toast('Enter a stall name.', 'warn'); return; }
    const btn = document.getElementById('stall-modal-save');
    const spinner = document.getElementById('stall-modal-spinner');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    const stallId = btn.dataset.stallId;
    try {
      if (stallId) {
        await supabase.from('stalls').update({ name }).eq('id', stallId);
        const wallet = allStalls.find(s => s.id === stallId)?.stall_wallets?.[0];
        if (wallet) {
          const assignedTo = document.getElementById('stall-modal-assign').value || null;
          await supabase.from('stall_wallets').update({ assigned_user_id: assignedTo }).eq('id', wallet.id);
        }
      } else {
        // Create stall + wallet via RPC or direct insert (admin only)
        const { data: stall, error: se } = await supabase.from('stalls').insert({ name, active: true }).select().single();
        if (se) throw se;
        const assignedTo = document.getElementById('stall-modal-assign').value || null;
        await supabase.from('stall_wallets').insert({ stall_id: stall.id, balance: 0, assigned_user_id: assignedTo });
      }
      toast(`Stall ${stallId ? 'updated' : 'created'} successfully.`, 'success');
      hide(document.getElementById('stall-modal-backdrop'));
      await loadStalls();
    } catch (err) {
      document.getElementById('stall-modal-alert').innerHTML =
        `<div class="alert alert-danger"><span>❌</span><span>${esc(err.message)}</span></div>`;
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
    }
  });
}

function populateStallAssignSelect() {
  const sel = document.getElementById('stall-modal-assign');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    allProfiles
      .filter(p => ['stall', 'admin'].includes(p.role))
      .map(p => `<option value="${esc(p.id)}">${esc(p.display_name || p.email)}</option>`)
      .join('');
}

// ─── EXPORT ──────────────────────────────────────────────────────
function setupExport() {
  document.getElementById('export-ledger-btn').addEventListener('click', async () => {
    try {
      const rows = await getLedger();
      const csv = toCSV(rows.map(r => ({
        id:           r.id,
        created_at:   r.created_at,
        kind:         r.kind,
        tokens:       r.tokens,
        card_code:    r.attendee_wallets?.public_code || '',
        stall:        r.stall_wallets?.stalls?.name || '',
        payment_method: r.payment_method || '',
        upi_ref:      r.upi_ref || '',
        note:         r.note || '',
      })));
      downloadFile(csv, `dunes-carnival-ledger-${new Date().toISOString().slice(0,10)}.csv`);
      toast('Ledger CSV downloaded.', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  });

  document.getElementById('export-stalls-btn').addEventListener('click', async () => {
    try {
      const rows = await getStallLeaderboard();
      const csv = toCSV(rows.map(r => ({
        rank:          rows.indexOf(r) + 1,
        stall_name:    r.stall_name,
        tokens_earned: r.tokens_earned,
        rupee_value:   r.tokens_earned * tokenValue,
        txn_count:     r.txn_count,
      })));
      downloadFile(csv, `dunes-carnival-stall-totals-${new Date().toISOString().slice(0,10)}.csv`);
      toast('Stall totals CSV downloaded.', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  });
}

// ─── SETTINGS ─────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const settings = await getSettings();
    if (settings?.token_value) {
      tokenValue = settings.token_value;
      document.getElementById('setting-token-value').value = settings.token_value;
    }
    if (settings?.refund_policy) {
      document.getElementById('setting-refund-policy').value = settings.refund_policy;
    }
    if (settings?.dashboard_public !== undefined) {
      document.getElementById(settings.dashboard_public ? 'dash-public' : 'dash-private').checked = true;
    }
  } catch {/* settings table may not exist yet */}
}

function setupSettingsForm() {
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    try {
      await updateSettings({
        token_value:      Number(document.getElementById('setting-token-value').value) || 1,
        refund_policy:    document.getElementById('setting-refund-policy').value.trim(),
        dashboard_public: document.getElementById('dash-public').checked,
      });
      toast('Settings saved.', 'success');
    } catch (err) {
      toast('Failed to save settings: ' + err.message, 'error');
    }
  });
}

init();
