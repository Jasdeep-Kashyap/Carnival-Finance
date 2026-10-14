// src/pages/dashboard.js
import Chart from 'chart.js/auto';
import {
  supabase,
  getDashboardStats, getStallLeaderboard, getRecentFeed, getTokensPerHour,
} from '../supabase.js';
import { formatTokens, relativeTime, esc } from '../utils.js';

// ─── State ────────────────────────────────────────────────────────
let hourlyChart = null;
let tokenValue = 1; // 1 token = ₹1 (updated from settings)

async function init() {
  await loadAll();
  setupRealtime();
}

// ─── Load all dashboard data ──────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([
    loadStats(),
    loadLeaderboard(),
    loadFeed(),
    loadChart(),
  ]);
}

// ─── Stats ────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const stats = await getDashboardStats();
    document.getElementById('stat-total').textContent   = formatTokens(stats.total_tokens_sold ?? 0);
    document.getElementById('stat-revenue').textContent = `₹${formatTokens((stats.total_tokens_sold ?? 0) * tokenValue)}`;
    document.getElementById('stat-txns').textContent    = formatTokens(stats.total_txns ?? 0);
    document.getElementById('stat-stalls').textContent  = formatTokens(stats.active_stalls ?? 0);
  } catch (err) {
    console.error('Stats load error:', err.message);
  }
}

// ─── Leaderboard ──────────────────────────────────────────────────
async function loadLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  try {
    const rows = await getStallLeaderboard();
    if (!rows?.length) {
      el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--clr-text-3)">No stall data yet.</div>`;
      return;
    }
    const max = rows[0].tokens_earned || 1;
    el.innerHTML = rows.map((row, i) => {
      const pct = Math.max(5, Math.round((row.tokens_earned / max) * 100));
      const isTop = i < 3;
      return `
        <div class="lb-row">
          <div class="lb-rank ${isTop ? 'top' : ''}">${isTop ? ['🥇','🥈','🥉'][i] : i + 1}</div>
          <div class="lb-name">${esc(row.stall_name)}</div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="lb-tokens">₹${formatTokens(row.tokens_earned)}</div>
            <div class="lb-bar-wrap">
              <div class="lb-bar" style="width:${pct}%"></div>
            </div>
          </div>
          <div style="font-size:0.75rem;color:var(--clr-text-3);text-align:right">${formatTokens(row.txn_count)} sales</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--clr-danger);padding:1rem;font-size:0.85rem">${err.message}</div>`;
  }
}

// ─── Recent Feed ──────────────────────────────────────────────────
async function loadFeed() {
  const el = document.getElementById('feed-list');
  try {
    const rows = await getRecentFeed(20);
    if (!rows?.length) {
      el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--clr-text-3)">Waiting for transactions…</div>`;
      return;
    }
    el.innerHTML = rows.map(r => `
      <div class="feed-item">
        <div class="feed-icon spend">💳</div>
        <div class="feed-body">
          <div class="feed-title">${esc(r.stall_name || 'Stall')}</div>
          <div class="feed-sub">${relativeTime(r.created_at)}</div>
        </div>
        <div class="feed-amount">+₹${formatTokens(r.tokens)}</div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--clr-danger);padding:1rem;font-size:0.85rem">${err.message}</div>`;
  }
}

// ─── Chart ────────────────────────────────────────────────────────
async function loadChart() {
  const ctx = document.getElementById('hourly-chart');
  if (!ctx) return;

  try {
    const rows = await getTokensPerHour();
    const labels = rows.map(r => {
      const d = new Date(r.hour);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    });
    const data = rows.map(r => r.tokens);

    if (hourlyChart) hourlyChart.destroy();

    hourlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tokens',
          data,
          backgroundColor: 'rgba(255,149,0,0.5)',
          borderColor: 'rgba(255,149,0,0.9)',
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1d28',
            borderColor: 'rgba(255,149,0,0.3)',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `₹${formatTokens(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#5a6175', font: { size: 11 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            ticks: { color: '#5a6175', font: { size: 11 }, callback: v => `₹${v}` },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            beginAtZero: true,
          },
        },
      },
    });
  } catch {
    // Chart data not available yet — that's fine
    if (hourlyChart) hourlyChart.destroy();
    hourlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['No data yet'],
        datasets: [{ label: 'Tokens', data: [0], backgroundColor: 'rgba(255,149,0,0.3)', borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#5a6175' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#5a6175' }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
        },
      },
    });
  }
}

// ─── Realtime subscriptions ───────────────────────────────────────
function setupRealtime() {
  // Subscribe to ledger inserts — update feed + stats + chart
  supabase.channel('dashboard-ledger')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ledger' }, () => {
      loadStats();
      loadFeed();
      loadChart();
    })
    .subscribe();

  // Subscribe to wallet updates — update stats
  supabase.channel('dashboard-wallets')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stall_wallets' }, () => {
      loadStats();
      loadLeaderboard();
    })
    .subscribe();
}

init();
