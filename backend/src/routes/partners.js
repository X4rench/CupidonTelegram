// ═══════════════════════════════════════════════════════════════
// Partner program routes.
//
// Партнёрские (требует флаг is_partner):
//   GET    /partner/me/stats            — балансы, статистика, графики, ранк
//   GET    /partner/me/payouts          — история выплат
//   POST   /partner/me/request-payout   — запросить выплату (если available >= 2000₽)
//
// Админские (требует is_admin):
//   GET    /admin/partners              — список + сводка
//   POST   /admin/partners              — создать
//   GET    /admin/partners/dashboard    — top-5, totals для главной
//   GET    /admin/partners/:id          — детальная карточка
//   PATCH  /admin/partners/:id          — редактировать (НЕ commission_pct, НЕ code)
//   DELETE /admin/partners/:id          — soft-delete (status='archived')
//   POST   /admin/partners/:id/pay      — отметить выплату как paid
//
// Защита payout_details: payout_details — JSON-строка реквизитов (банк, карта).
// AES-256-GCM шифрование через PAYOUT_ENCRYPTION_KEY (если задан) — иначе
// предупреждение в лог и хранение plaintext.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import db from '../db/index.js';
import { getAdminIds } from '../middleware/auth.js';

const router = Router();

const MIN_PAYOUT_KOPECKS = (parseInt(process.env.PARTNER_MIN_PAYOUT_RUB, 10) || 2000) * 100;

// ── Encryption helpers ──────────────────────────────────────────────────────

function getEncKey() {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) return null;
  // Поддерживаем base64 (32 bytes → 44 chars) и hex (64 chars)
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 40) {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    // Fallback — sha256 хеш от исходной строки (32 bytes detrministically)
    return createHash('sha256').update(raw).digest();
  } catch (_) { return null; }
}

function encryptPayoutDetails(plainJson) {
  if (!plainJson) return null;
  const key = getEncKey();
  if (!key) {
    console.warn('[partners] PAYOUT_ENCRYPTION_KEY не задан — храним payout_details plaintext');
    return JSON.stringify({ _plain: plainJson });
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(plainJson), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  });
}

function decryptPayoutDetails(stored) {
  if (!stored) return null;
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (parsed._plain) return parsed._plain;
    if (parsed.v === 1 && parsed.iv && parsed.tag && parsed.ct) {
      const key = getEncKey();
      if (!key) return null;
      const iv = Buffer.from(parsed.iv, 'base64');
      const tag = Buffer.from(parsed.tag, 'base64');
      const ct = Buffer.from(parsed.ct, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      return JSON.parse(pt);
    }
    return parsed;
  } catch (e) {
    console.warn('[partners] decryptPayoutDetails failed:', e?.message);
    return null;
  }
}

function maskPayoutDetails(decoded) {
  if (!decoded || typeof decoded !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(decoded)) {
    if (typeof v !== 'string') { out[k] = v; continue; }
    if (k.toLowerCase().includes('card') || k.toLowerCase().includes('acc')) {
      out[k] = v.length > 4 ? '****' + v.slice(-4) : '****';
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Guards ──────────────────────────────────────────────────────────────────

function requirePartner(req, res, next) {
  const partner = db.get(
    `SELECT id, commission_pct, status, code, display_name FROM partners
     WHERE telegram_user_id = ? AND status = 'active'`,
    req.tgUser?.id
  );
  if (!partner) {
    return res.status(403).json({ ok: false, error: 'Доступ только для партнёров' });
  }
  req.partner = partner;
  next();
}

function requireAdmin(req, res, next) {
  const adminIds = getAdminIds();
  if (!req.tgUser?.id || !adminIds.includes(req.tgUser.id)) {
    return res.status(403).json({ ok: false, error: 'Доступ запрещён' });
  }
  next();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBalances(partnerId) {
  const r = db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN status='pending' THEN commission_amount ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status='available' THEN commission_amount ELSE 0 END), 0) AS available,
       COALESCE(SUM(CASE WHEN status IN ('available','paid','pending') THEN commission_amount ELSE 0 END), 0) AS lifetime_earned
     FROM partner_commissions WHERE partner_id = ?`,
    partnerId
  );
  return {
    pending: r?.pending || 0,
    available: r?.available || 0,
    lifetime_earned: r?.lifetime_earned || 0,
  };
}

function getChartData30d(partnerId) {
  // Возвращаем массив из 30 точек с датой и значениями. Заполняем дырки нулями.
  const rows = db.all(
    `SELECT date(created_at) as d,
            COUNT(*) as commissions,
            SUM(commission_amount) as earned
     FROM partner_commissions
     WHERE partner_id = ? AND datetime(created_at) > datetime('now', '-30 days')
     GROUP BY date(created_at)`,
    partnerId
  );
  const referralRows = db.all(
    `SELECT date(attributed_at) as d, COUNT(*) as cnt
     FROM partner_referrals
     WHERE partner_id = ? AND datetime(attributed_at) > datetime('now', '-30 days')
     GROUP BY date(attributed_at)`,
    partnerId
  );
  const earnedMap = new Map(rows.map(r => [r.d, r.earned]));
  const refMap = new Map(referralRows.map(r => [r.d, r.cnt]));
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push({
      date: key,
      earned: earnedMap.get(key) || 0,
      referrals: refMap.get(key) || 0,
    });
  }
  return result;
}

function getStats30d(partnerId) {
  const newReferrals = db.get(
    `SELECT COUNT(*) as c FROM partner_referrals
     WHERE partner_id = ? AND datetime(attributed_at) > datetime('now', '-30 days')`,
    partnerId
  ).c;
  const paidUsersRow = db.get(
    `SELECT COUNT(DISTINCT telegram_user_id) as c FROM partner_commissions
     WHERE partner_id = ? AND datetime(created_at) > datetime('now', '-30 days')`,
    partnerId
  );
  const paidUsers = paidUsersRow?.c || 0;
  const byTier = db.all(
    `SELECT p.plan as plan, COUNT(DISTINCT pc.telegram_user_id) as users, SUM(pc.commission_amount) as revenue
     FROM partner_commissions pc
     JOIN payments p ON p.id = pc.payment_id
     WHERE pc.partner_id = ? AND datetime(pc.created_at) > datetime('now', '-30 days')
     GROUP BY p.plan`,
    partnerId
  );
  const by_tier = { basic: 0, premium: 0, day_pass: 0 };
  const by_tier_revenue = { basic: 0, premium: 0, day_pass: 0 };
  for (const r of byTier) {
    if (r.plan in by_tier) {
      by_tier[r.plan] = r.users;
      by_tier_revenue[r.plan] = r.revenue || 0;
    }
  }
  const conversion_pct = newReferrals > 0 ? Math.round((paidUsers / newReferrals) * 100) : 0;
  return { new_referrals: newReferrals, paid_users: paidUsers, conversion_pct, by_tier, by_tier_revenue };
}

function getRank(partnerId) {
  // Ранк по lifetime_earned (включая pending — общий вклад).
  const all = db.all(
    `SELECT p.id,
            COALESCE(SUM(CASE WHEN pc.status IN ('available','paid','pending') THEN pc.commission_amount ELSE 0 END), 0) AS total
     FROM partners p
     LEFT JOIN partner_commissions pc ON pc.partner_id = p.id
     WHERE p.status = 'active'
     GROUP BY p.id
     ORDER BY total DESC, p.id ASC`
  );
  const total = all.length;
  const idx = all.findIndex(r => r.id === partnerId);
  if (idx < 0) return { position: total, of_total: total, next_position_diff: 0 };
  const position = idx + 1;
  const next_position_diff = idx > 0 ? Math.max(0, all[idx - 1].total - all[idx].total) : 0;
  return { position, of_total: total, next_position_diff };
}

function getTop5() {
  const rows = db.all(
    `SELECT p.id, p.code, p.display_name,
            COALESCE(SUM(CASE WHEN pc.status IN ('available','paid','pending') THEN pc.commission_amount ELSE 0 END), 0) AS total
     FROM partners p
     LEFT JOIN partner_commissions pc ON pc.partner_id = p.id
     WHERE p.status = 'active'
     GROUP BY p.id
     ORDER BY total DESC, p.id ASC
     LIMIT 5`
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    partner_id: r.id,
    code: r.code,
    display_name: r.display_name,
    total: r.total,
  }));
}

// ─── PARTNER ENDPOINTS ──────────────────────────────────────────────────────

router.get('/partner/me/stats', requirePartner, (req, res) => {
  const partnerId = req.partner.id;
  const balances = getBalances(partnerId);
  const stats_30d = getStats30d(partnerId);
  const chart_data = getChartData30d(partnerId);
  const rank = getRank(partnerId);
  const top5 = getTop5();
  res.json({
    ok: true,
    partner: {
      code: req.partner.code,
      display_name: req.partner.display_name,
      commission_pct: req.partner.commission_pct,
      status: req.partner.status,
    },
    balance: balances,
    stats_30d,
    chart_data,
    rank,
    top5,
    min_payout_kopecks: MIN_PAYOUT_KOPECKS,
  });
});

router.get('/partner/me/payouts', requirePartner, (req, res) => {
  const payouts = db.all(
    `SELECT id, amount, status, requested_at, processed_at, note
     FROM partner_payouts
     WHERE partner_id = ?
     ORDER BY datetime(requested_at) DESC
     LIMIT 50`,
    req.partner.id
  );
  res.json({ ok: true, payouts });
});

router.post('/partner/me/request-payout', requirePartner, (req, res) => {
  const partnerId = req.partner.id;
  const { available } = getBalances(partnerId);
  if (available < MIN_PAYOUT_KOPECKS) {
    return res.status(400).json({
      ok: false,
      error: `Минимум для выплаты — ${MIN_PAYOUT_KOPECKS / 100} ₽. Сейчас доступно ${available / 100} ₽.`,
      available,
      min: MIN_PAYOUT_KOPECKS,
    });
  }
  // Запрещаем повторный запрос если есть активный pending payout
  const pending = db.get(
    `SELECT id FROM partner_payouts WHERE partner_id = ? AND status IN ('requested','processing')`,
    partnerId
  );
  if (pending) {
    return res.status(400).json({ ok: false, error: 'У тебя уже есть запрос на выплату в обработке.' });
  }

  const result = db.run(
    `INSERT INTO partner_payouts (partner_id, amount, status) VALUES (?, ?, 'requested')`,
    partnerId, available
  );
  console.log(`[partner] payout requested: partner=${partnerId} amount=${available/100}₽`);
  res.json({ ok: true, payout_id: result.lastInsertRowid, amount: available });
});

// ─── ADMIN ENDPOINTS ────────────────────────────────────────────────────────

router.get('/admin/partners/dashboard', requireAdmin, (req, res) => {
  // Сводка для главной админки: totals + top-5
  const totals = db.get(
    `SELECT
       (SELECT COUNT(*) FROM partners WHERE status = 'active') as active_partners,
       (SELECT COUNT(*) FROM partner_referrals) as total_referrals,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM partner_commissions WHERE status = 'pending') as pending_kopecks,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM partner_commissions WHERE status = 'available') as available_kopecks,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM partner_commissions WHERE status = 'paid') as paid_kopecks,
       (SELECT COUNT(*) FROM partner_payouts WHERE status IN ('requested','processing')) as pending_payouts
    `
  );
  const month30 = db.get(
    `SELECT
       COALESCE(SUM(gross_amount), 0) as gross_revenue,
       COALESCE(SUM(commission_amount), 0) as commission_paid_out
     FROM partner_commissions
     WHERE datetime(created_at) > datetime('now', '-30 days')`
  );
  res.json({
    ok: true,
    totals: { ...totals, ...month30 },
    top5: getTop5(),
  });
});

router.get('/admin/partners', requireAdmin, (req, res) => {
  const status = req.query.status;
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const where = [];
  const params = [];
  if (status && ['active', 'paused', 'archived'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(lower(code) LIKE ? OR lower(display_name) LIKE ? OR CAST(telegram_user_id AS TEXT) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const sql = `
    SELECT p.id, p.telegram_user_id, p.code, p.display_name, p.commission_pct, p.status, p.notes, p.created_at,
           (SELECT COUNT(*) FROM partner_referrals pr WHERE pr.partner_id = p.id) as referrals,
           COALESCE(SUM(CASE WHEN pc.status IN ('available','paid','pending') THEN pc.commission_amount ELSE 0 END), 0) as lifetime_earned,
           COALESCE(SUM(CASE WHEN pc.status = 'available' THEN pc.commission_amount ELSE 0 END), 0) as available_kopecks
    FROM partners p
    LEFT JOIN partner_commissions pc ON pc.partner_id = p.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY p.id
    ORDER BY lifetime_earned DESC, p.id DESC
    LIMIT 200
  `;
  const partners = db.all(sql, ...params);
  res.json({ ok: true, partners });
});

router.post('/admin/partners', requireAdmin, (req, res) => {
  const { telegram_user_id, code, display_name, commission_pct, payout_details, notes } = req.body || {};
  const tgId = parseInt(telegram_user_id, 10);
  if (!Number.isFinite(tgId)) {
    return res.status(400).json({ ok: false, error: 'telegram_user_id должен быть числом' });
  }
  if (!code || typeof code !== 'string' || !/^[a-zA-Z0-9_]{2,32}$/.test(code)) {
    return res.status(400).json({ ok: false, error: 'code: 2-32 символа, только a-z, 0-9, _' });
  }
  if (!display_name || typeof display_name !== 'string' || display_name.length > 120) {
    return res.status(400).json({ ok: false, error: 'display_name обязателен (до 120 символов)' });
  }
  const pct = parseInt(commission_pct, 10);
  if (!Number.isFinite(pct) || pct < 1 || pct > 80) {
    return res.status(400).json({ ok: false, error: 'commission_pct должен быть от 1 до 80' });
  }

  const codeNorm = code.toLowerCase();

  // Проверка уникальности
  if (db.get('SELECT id FROM partners WHERE telegram_user_id = ?', tgId)) {
    return res.status(400).json({ ok: false, error: 'У этого юзера уже есть запись партнёра' });
  }
  if (db.get('SELECT id FROM partners WHERE lower(code) = ?', codeNorm)) {
    return res.status(400).json({ ok: false, error: `code "${code}" уже занят` });
  }

  const encDetails = payout_details ? encryptPayoutDetails(payout_details) : null;

  const result = db.run(
    `INSERT INTO partners (telegram_user_id, code, display_name, commission_pct, payout_details, notes, status, created_by_admin_id)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    tgId, codeNorm, display_name, pct, encDetails, notes || null, req.tgUser?.id || null
  );
  db.run(
    `INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)`,
    'partner_create',
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    req.headers['user-agent'] || 'unknown',
    JSON.stringify({ admin_tg: req.tgUser?.id, partner_id: result.lastInsertRowid, code: codeNorm, commission_pct: pct })
  );
  const partner = db.get('SELECT * FROM partners WHERE id = ?', result.lastInsertRowid);
  res.json({
    ok: true,
    partner: {
      ...partner,
      payout_details: partner.payout_details ? maskPayoutDetails(decryptPayoutDetails(partner.payout_details)) : null,
    },
  });
});

router.get('/admin/partners/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const partner = db.get('SELECT * FROM partners WHERE id = ?', id);
  if (!partner) return res.status(404).json({ ok: false, error: 'Партнёр не найден' });

  const balances = getBalances(id);
  const stats_30d = getStats30d(id);
  const chart_data = getChartData30d(id);
  const recent_referrals = db.all(
    `SELECT pr.telegram_user_id, pr.attributed_at,
            (SELECT MAX(p.plan) FROM payments p WHERE p.telegram_user_id = pr.telegram_user_id AND p.status='succeeded') as last_plan,
            (SELECT MAX(p.processed_at) FROM payments p WHERE p.telegram_user_id = pr.telegram_user_id AND p.status='succeeded') as last_paid_at
     FROM partner_referrals pr
     WHERE pr.partner_id = ?
     ORDER BY datetime(pr.attributed_at) DESC
     LIMIT 20`,
    id
  ).map(r => ({
    ...r,
    telegram_user_id_masked: r.telegram_user_id
      ? `${String(r.telegram_user_id).slice(0, 4)}***`
      : null,
    telegram_user_id: undefined, // не светим полный TG ID на UI
  }));
  const payouts = db.all(
    `SELECT id, amount, status, requested_at, processed_at, note
     FROM partner_payouts
     WHERE partner_id = ?
     ORDER BY datetime(requested_at) DESC
     LIMIT 50`,
    id
  );

  res.json({
    ok: true,
    partner: {
      id: partner.id,
      telegram_user_id: partner.telegram_user_id,
      code: partner.code,
      display_name: partner.display_name,
      commission_pct: partner.commission_pct,
      status: partner.status,
      notes: partner.notes,
      created_at: partner.created_at,
      payout_details: partner.payout_details ? maskPayoutDetails(decryptPayoutDetails(partner.payout_details)) : null,
    },
    balance: balances,
    stats_30d,
    chart_data,
    recent_referrals,
    payouts,
    min_payout_kopecks: MIN_PAYOUT_KOPECKS,
  });
});

// ── GET /admin/partners/:id/timeline?metric=X ────────────────────────────────
// Daily (30 дней) + monthly (12 месяцев) для метрик партнёра:
//   new_referrals | paid_users | gross_revenue | commission
// Используется в админ-карточке партнёра — клик на цифру открывает диаграмму.
// Cache 24ч (in-memory, ключ = `${partnerId}:${metric}`).
const _partnerTimelineCache = new Map();
const PARTNER_TIMELINE_TTL_MS = 24 * 60 * 60 * 1000;
const PARTNER_METRICS = new Set(['new_referrals', 'paid_users', 'gross_revenue', 'commission']);

router.get('/admin/partners/:id/timeline', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const metric = String(req.query.metric || '').trim();
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });
  if (!PARTNER_METRICS.has(metric)) {
    return res.status(400).json({
      ok: false,
      error: `metric должен быть один из: ${[...PARTNER_METRICS].join(', ')}`,
    });
  }

  const partner = db.get('SELECT id FROM partners WHERE id = ?', id);
  if (!partner) return res.status(404).json({ ok: false, error: 'Партнёр не найден' });

  const cacheKey = `${id}:${metric}`;
  const now = Date.now();
  const cached = _partnerTimelineCache.get(cacheKey);
  if (cached && cached.expires_at_ms > now) {
    return res.json({
      ok: true, metric,
      daily: cached.daily,
      monthly: cached.monthly,
      last_updated_at: cached.last_updated_at,
      cached: true,
    });
  }

  const { daily, monthly } = computePartnerTimeline(id, metric);
  const last_updated_at = new Date().toISOString();
  _partnerTimelineCache.set(cacheKey, {
    daily, monthly, last_updated_at,
    expires_at_ms: now + PARTNER_TIMELINE_TTL_MS,
  });

  res.json({ ok: true, metric, daily, monthly, last_updated_at, cached: false });
});

function computePartnerTimeline(partnerId, metric) {
  let dailyRaw, monthlyRaw;

  if (metric === 'new_referrals') {
    dailyRaw = db.all(
      `SELECT strftime('%Y-%m-%d', attributed_at) as d, COUNT(*) as v
         FROM partner_referrals
        WHERE partner_id = ? AND attributed_at >= datetime('now', '-29 days')
        GROUP BY d`, partnerId);
    monthlyRaw = db.all(
      `SELECT strftime('%Y-%m', attributed_at) as m, COUNT(*) as v
         FROM partner_referrals
        WHERE partner_id = ? AND attributed_at >= datetime('now', '-11 months', 'start of month')
        GROUP BY m`, partnerId);
  } else if (metric === 'paid_users') {
    // Уникальные платящие — DISTINCT telegram_user_id в commission_table
    dailyRaw = db.all(
      `SELECT strftime('%Y-%m-%d', created_at) as d, COUNT(DISTINCT telegram_user_id) as v
         FROM partner_commissions
        WHERE partner_id = ? AND created_at >= datetime('now', '-29 days')
        GROUP BY d`, partnerId);
    monthlyRaw = db.all(
      `SELECT strftime('%Y-%m', created_at) as m, COUNT(DISTINCT telegram_user_id) as v
         FROM partner_commissions
        WHERE partner_id = ? AND created_at >= datetime('now', '-11 months', 'start of month')
        GROUP BY m`, partnerId);
  } else if (metric === 'gross_revenue') {
    dailyRaw = db.all(
      `SELECT strftime('%Y-%m-%d', created_at) as d, COALESCE(SUM(gross_amount), 0) as v
         FROM partner_commissions
        WHERE partner_id = ? AND created_at >= datetime('now', '-29 days')
        GROUP BY d`, partnerId);
    monthlyRaw = db.all(
      `SELECT strftime('%Y-%m', created_at) as m, COALESCE(SUM(gross_amount), 0) as v
         FROM partner_commissions
        WHERE partner_id = ? AND created_at >= datetime('now', '-11 months', 'start of month')
        GROUP BY m`, partnerId);
  } else { // commission
    dailyRaw = db.all(
      `SELECT strftime('%Y-%m-%d', created_at) as d, COALESCE(SUM(commission_amount), 0) as v
         FROM partner_commissions
        WHERE partner_id = ? AND created_at >= datetime('now', '-29 days')
        GROUP BY d`, partnerId);
    monthlyRaw = db.all(
      `SELECT strftime('%Y-%m', created_at) as m, COALESCE(SUM(commission_amount), 0) as v
         FROM partner_commissions
        WHERE partner_id = ? AND created_at >= datetime('now', '-11 months', 'start of month')
        GROUP BY m`, partnerId);
  }

  // Заполняем дни/месяцы нулями
  const dMap = new Map(dailyRaw.map(r => [r.d, r.v]));
  const mMap = new Map(monthlyRaw.map(r => [r.m, r.v]));
  const today = new Date();
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = dt.toISOString().slice(0, 10);
    daily.push({ date: key, value: dMap.get(key) ?? 0 });
  }
  const monthly = [];
  const cur = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - i, 1));
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const key = `${dt.getUTCFullYear()}-${mm}`;
    monthly.push({ month: key, value: mMap.get(key) ?? 0 });
  }
  return { daily, monthly };
}

router.patch('/admin/partners/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const partner = db.get('SELECT * FROM partners WHERE id = ?', id);
  if (!partner) return res.status(404).json({ ok: false, error: 'Партнёр не найден' });

  const updates = {};
  if (typeof req.body?.display_name === 'string') updates.display_name = req.body.display_name.slice(0, 120);
  if (['active', 'paused', 'archived'].includes(req.body?.status)) updates.status = req.body.status;
  if (typeof req.body?.notes === 'string') updates.notes = req.body.notes.slice(0, 2000);
  if (req.body?.payout_details && typeof req.body.payout_details === 'object') {
    updates.payout_details = encryptPayoutDetails(req.body.payout_details);
  }
  // commission_pct и code — НЕ редактируем (правила задачи)

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: 'Нечего обновить' });
  }

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const params = Object.values(updates);
  db.run(`UPDATE partners SET ${sets} WHERE id = ?`, ...params, id);

  db.run(
    `INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)`,
    'partner_update',
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    req.headers['user-agent'] || 'unknown',
    JSON.stringify({ admin_tg: req.tgUser?.id, partner_id: id, fields: Object.keys(updates) })
  );
  res.json({ ok: true });
});

router.delete('/admin/partners/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const partner = db.get('SELECT * FROM partners WHERE id = ?', id);
  if (!partner) return res.status(404).json({ ok: false, error: 'Партнёр не найден' });
  db.run(`UPDATE partners SET status = 'archived' WHERE id = ?`, id);
  db.run(
    `INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)`,
    'partner_archive',
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    req.headers['user-agent'] || 'unknown',
    JSON.stringify({ admin_tg: req.tgUser?.id, partner_id: id })
  );
  res.json({ ok: true });
});

router.post('/admin/partners/:id/pay', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const partner = db.get('SELECT * FROM partners WHERE id = ?', id);
  if (!partner) return res.status(404).json({ ok: false, error: 'Партнёр не найден' });

  // amount в копейках. По умолчанию — текущий available.
  const balances = getBalances(id);
  let amountKopecks = parseInt(req.body?.amount, 10);
  if (!Number.isFinite(amountKopecks) || amountKopecks <= 0) {
    amountKopecks = balances.available;
  }
  if (amountKopecks <= 0) {
    return res.status(400).json({ ok: false, error: 'Нет доступных к выплате средств' });
  }
  if (amountKopecks > balances.available) {
    return res.status(400).json({
      ok: false,
      error: `Запрошено ${amountKopecks/100}₽, но available только ${balances.available/100}₽`,
    });
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : null;

  db.transaction(() => {
    // Создать или взять existing requested payout
    let payoutId;
    const existing = db.get(
      `SELECT id FROM partner_payouts WHERE partner_id = ? AND status IN ('requested','processing')
       ORDER BY datetime(requested_at) DESC LIMIT 1`,
      id
    );
    if (existing) {
      payoutId = existing.id;
      db.run(
        `UPDATE partner_payouts SET status='paid', amount=?, processed_at=datetime('now'), note=?, admin_id=? WHERE id=?`,
        amountKopecks, note, req.tgUser?.id || null, payoutId
      );
    } else {
      const ins = db.run(
        `INSERT INTO partner_payouts (partner_id, amount, status, requested_at, processed_at, note, admin_id)
         VALUES (?, ?, 'paid', datetime('now'), datetime('now'), ?, ?)`,
        id, amountKopecks, note, req.tgUser?.id || null
      );
      payoutId = ins.lastInsertRowid;
    }

    // Списать commissions из available в paid (с привязкой к этому payout).
    // FIFO — самые старые available закрываем сначала.
    let remaining = amountKopecks;
    const available = db.all(
      `SELECT id, commission_amount FROM partner_commissions
       WHERE partner_id = ? AND status = 'available'
       ORDER BY datetime(created_at) ASC`,
      id
    );
    for (const c of available) {
      if (remaining <= 0) break;
      if (c.commission_amount <= remaining) {
        db.run(
          `UPDATE partner_commissions SET status='paid', paid_at=datetime('now'), payout_id=? WHERE id=?`,
          payoutId, c.id
        );
        remaining -= c.commission_amount;
      } else {
        // Частичная выплата — split commission на две строки
        const rest = c.commission_amount - remaining;
        db.run(
          `UPDATE partner_commissions SET commission_amount=?, status='paid', paid_at=datetime('now'), payout_id=? WHERE id=?`,
          remaining, payoutId, c.id
        );
        // оставшийся хвост — отдельной строкой с тем же payment_id, статус 'available'
        const orig = db.get('SELECT * FROM partner_commissions WHERE id = ?', c.id);
        db.run(
          `INSERT INTO partner_commissions
             (partner_id, payment_id, telegram_user_id, gross_amount, ai_cost, yk_fee, tax, net_amount,
              commission_pct, commission_amount, status, available_at, created_at)
           VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, ?, 'available', datetime('now'), datetime('now'))`,
          orig.partner_id, orig.payment_id, orig.telegram_user_id, orig.commission_pct, rest
        );
        remaining = 0;
      }
    }

    db.run(
      `INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)`,
      'partner_pay',
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown',
      JSON.stringify({ admin_tg: req.tgUser?.id, partner_id: id, amount_kopecks: amountKopecks, payout_id: payoutId, note })
    );
  })();

  console.log(`[partner] paid: admin=${req.tgUser?.id} partner=${id} amount=${amountKopecks/100}₽`);
  res.json({ ok: true, amount: amountKopecks });
});

export default router;
