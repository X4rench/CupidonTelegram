// ═══════════════════════════════════════════════════════════════
// Admin Auth Middleware (legacy / CLI fallback).
//
// В TMA первичная админская авторизация — через initData + ADMIN_TELEGRAM_IDS
// (см. requireAdminTg в middleware/auth.js). Этот файл — fallback для curl/CLI
// операций (миграции, ручная подкрутка БД на проде), где TMA initData получить
// неоткуда. Активируется через header X-Admin-Secret.
//
// Включается только если ADMIN_SECRET задан в env. Без него — всем 403.
//
// Защита: rate limiting, IP-блокировка, audit log, timing-safe сравнение.
// ═══════════════════════════════════════════════════════════════
import { timingSafeEqual } from 'crypto';
import db from '../db/index.js';

const failedAttempts = new Map();
const requestWindows = new Map();

const MAX_FAILS   = 3;
const BLOCK_MS    = 15 * 60 * 1000;
const RATE_LIMIT  = 10;
const RATE_WINDOW = 60 * 1000;

const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function normalizeIp(ip) {
  if (!ip) return '';
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (m) return m[1];
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function isIpAllowed(ip) {
  if (ADMIN_IP_ALLOWLIST.length === 0) return true;
  const norm = normalizeIp(ip);
  return ADMIN_IP_ALLOWLIST.some(allowed => normalizeIp(allowed) === norm);
}

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function writeAudit(action, ip, userAgent, details = {}) {
  try {
    db.run(
      'INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)',
      action, ip, userAgent, JSON.stringify(details)
    );
  } catch (_) {}
}

function isBlocked(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry?.blockedUntil) return false;
  if (Date.now() < entry.blockedUntil) return true;
  failedAttempts.delete(ip);
  return false;
}

function recordFail(ip) {
  const entry = failedAttempts.get(ip) || { count: 0, blockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_FAILS) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    console.warn(`[AdminAuth] IP blocked 15 min: ${ip} (${entry.count} failed attempts)`);
  }
  failedAttempts.set(ip, entry);
}

function clearFails(ip) {
  failedAttempts.delete(ip);
}

function checkRateLimit(ip) {
  const now    = Date.now();
  const window = (requestWindows.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (window.length >= RATE_LIMIT) return false;
  window.push(now);
  requestWindows.set(ip, window);
  return true;
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) {
      timingSafeEqual(ba, ba);
      return false;
    }
    return timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}

/**
 * Renamed from RN-версии `requireAdmin` — чтобы было ясно что это legacy путь
 * через X-Admin-Secret header (для curl/CLI). Основной — requireAdminTg.
 */
export function requireAdminSecret(req, res, next) {
  const ip        = getIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const secret    = req.headers['x-admin-secret'];

  if (!isIpAllowed(ip)) {
    writeAudit('ip_not_allowed', ip, userAgent, { endpoint: req.path });
    return res.status(404).json({ ok: false, error: 'Маршрут не найден' });
  }

  if (!checkRateLimit(ip)) {
    writeAudit('rate_limited', ip, userAgent, { endpoint: req.path });
    return res.status(429).json({ ok: false, error: 'Слишком много запросов. Подождите 1 минуту.' });
  }

  if (isBlocked(ip)) {
    const remainMs  = (failedAttempts.get(ip)?.blockedUntil || 0) - Date.now();
    const remainMin = Math.ceil(remainMs / 60000);
    writeAudit('login_blocked', ip, userAgent, { endpoint: req.path });
    return res.status(403).json({ ok: false, error: `IP заблокирован. Попробуйте через ${remainMin} мин.` });
  }

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    return res.status(403).json({ ok: false, error: 'Доступ запрещён' });
  }

  if (!safeEqual(secret, ADMIN_SECRET)) {
    recordFail(ip);
    const fails = failedAttempts.get(ip)?.count || 1;
    writeAudit('login_fail', ip, userAgent, { endpoint: req.path, attempts: fails });
    return res.status(401).json({
      ok: false,
      error: `Доступ запрещён. Осталось попыток: ${Math.max(0, MAX_FAILS - fails)}`,
    });
  }

  clearFails(ip);
  writeAudit('login_ok', ip, userAgent, { endpoint: req.path, method: req.method, via: 'secret' });
  next();
}

export function getAuditLog(req, res) {
  const limit  = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const action = req.query.action;

  const logs = action
    ? db.all('SELECT * FROM admin_audit_log WHERE action = ? ORDER BY created_at DESC LIMIT ?', action, limit)
    : db.all('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?', limit);

  res.json({ ok: true, logs, count: logs.length });
}
