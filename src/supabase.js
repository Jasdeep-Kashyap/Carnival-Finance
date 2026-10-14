// src/supabase.js — Supabase client singleton
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Missing Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). Please configure them in .env or your Vercel Project Settings.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// ─── Auth helpers ───────────────────────────────────────────────────────────

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ─── RPC wrappers ───────────────────────────────────────────────────────────

export async function rpc_createAttendeeWallet({ name, tokens, payment_method, upi_ref }) {
  const { data, error } = await supabase.rpc('create_attendee_wallet', {
    p_name: name || null,
    p_tokens: tokens,
    p_payment_method: payment_method,
    p_upi_ref: upi_ref || null,
  });
  if (error) throw error;
  return data; // returns { public_code, wallet_id }
}

export async function rpc_topUp({ public_code, tokens, payment_method, upi_ref }) {
  const { data, error } = await supabase.rpc('top_up', {
    p_public_code: public_code,
    p_tokens: tokens,
    p_payment_method: payment_method,
    p_upi_ref: upi_ref || null,
  });
  if (error) throw error;
  return data; // returns new balance
}

export async function rpc_refundUnused({ public_code, tokens, payment_method }) {
  const { data, error } = await supabase.rpc('refund_unused', {
    p_public_code: public_code,
    p_tokens: tokens,
    p_payment_method: payment_method,
  });
  if (error) throw error;
  return data; // returns new balance
}

export async function rpc_spend({ public_code, stall_wallet_id, tokens, idempotency_key }) {
  const { data, error } = await supabase.rpc('spend', {
    p_public_code: public_code,
    p_stall_wallet_id: stall_wallet_id,
    p_tokens: tokens,
    p_idempotency_key: idempotency_key,
  });
  if (error) throw error;
  return data; // returns { attendee_balance, stall_balance, ledger_id }
}

export async function rpc_reverseEntry({ ledger_id, reason }) {
  const { data, error } = await supabase.rpc('reverse_entry', {
    p_ledger_id: ledger_id,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

export async function getWalletByCode(public_code) {
  const { data, error } = await supabase
    .from('attendee_wallets_public')
    .select('*')
    .eq('public_code', public_code)
    .single();
  if (error) throw error;
  return data;
}

export async function getMyStallWallet(userId) {
  const { data, error } = await supabase
    .from('stall_wallets')
    .select('*, stalls(*)')
    .eq('assigned_user_id', userId)
    .eq('active', true)
    .single();
  if (error) throw error;
  return data;
}

export async function getDashboardStats() {
  const { data, error } = await supabase
    .from('dashboard_stats')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getStallLeaderboard() {
  const { data, error } = await supabase
    .from('stall_leaderboard')
    .select('*')
    .order('tokens_earned', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getRecentFeed(limit = 20) {
  const { data, error } = await supabase
    .from('public_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getCounterRecentActivity(limit = 20) {
  const { data, error } = await supabase
    .from('ledger')
    .select('*, attendee_wallets(public_code, name)')
    .in('kind', ['top_up', 'create', 'refund'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getLedger({ stall_id, kind, from, to } = {}) {
  let query = supabase
    .from('ledger')
    .select('*, attendee_wallets(public_code, name), stall_wallets(stalls(name))')
    .order('created_at', { ascending: false })
    .limit(200);
  if (stall_id) query = query.eq('stall_wallet_id', stall_id);
  if (kind) query = query.eq('kind', kind);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getStalls() {
  const { data, error } = await supabase
    .from('stalls')
    .select('*, stall_wallets(*)')
    .order('name');
  if (error) throw error;
  return data;
}

export async function getProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateSettings(updates) {
  const { data, error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', 1);
  if (error) throw error;
  return data;
}

export async function getTokensPerHour() {
  const { data, error } = await supabase
    .from('tokens_per_hour')
    .select('*')
    .order('hour');
  if (error) throw error;
  return data;
}
