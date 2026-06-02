// ═══════════════════════════════════════════════════════════════
// Promo codes router (TMA).
//
// Промокоды:
//   - kind='bonus_quota'  payload={ value: N }    → +N к tg_bonus_quota
//   - kind='sub_trial'    payload={ plan, days }  → продление подписки на N дней
//
// Идемпотентность: одна пара (promo_code_id, telegram_user_id) в promo_uses,
// чтобы каждый юзер не мог применить один и тот же код несколько раз.
// telegram_user_id уникален — никаких durable hardware-таблиц.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db, { upsertUserFromInitData } from '../db/index.js';

const router = Router();

function ensureUser(req) {
  const { user } = upsertUserFromInitData(req.tgUser, req.startParam);
  return user;
}

// Seed дефолтных кодов из env (только если ещё не в БД) — для обратной совместимости.
// H4 — на дефолтные коды ставим max_uses и expires_at (+90 дней от текущей даты),
// чтобы они не оставались "вечными" при компрометации списка.
const SEED_CODES = (process.env.PROMO_CODES || 'CUPIDON10,LAUNCH2026,BETA50,ARROW2026')
  .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

const DEFAULT_EXPIRES_AT = new Date(Date.now() + 90 * 86_400_000).toISOString();

const SEED_BONUSES = {
  CUPIDON10:  { kind: 'sub_trial', payload: JSON.stringify({ plan: 'basic', days: 7  }), max_uses: 5000, expires_at: DEFAULT_EXPIRES_AT },
  LAUNCH2026: { kind: 'sub_trial', payload: JSON.stringify({ plan: 'basic', days: 14 }), max_uses: 5000, expires_at: DEFAULT_EXPIRES_AT },
  BETA50:     { kind: 'sub_trial', payload: JSON.stringify({ plan: 'basic', days: 30 }), max_uses: 2000, expires_at: DEFAULT_EXPIRES_AT },
  ARROW2026:  { kind: 'sub_trial', payload: JSON.stringify({ plan: 'basic', days: 60 }), max_uses: 1000, expires_at: DEFAULT_EXPIRES_AT },
};

for (const code of SEED_CODES) {
  const bonus = SEED_BONUSES[code] || {
    kind: 'sub_trial',
    payload: JSON.stringify({ plan: 'basic', days: 7 }),
    max_uses: 1000,
    expires_at: DEFAULT_EXPIRES_AT,
  };
  db.run(
    `INSERT OR IGNORE INTO promo_codes (code, kind, payload, max_uses, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    code, bonus.kind, bonus.payload, bonus.max_uses ?? null, bonus.expires_at ?? null
  );
}

/** H4 — лог неудачных попыток применения промо в admin_audit_log. */
function logPromoFail(req, codeRaw, reason) {
  try {
    const codeMask = String(codeRaw || '').slice(0, 3) + '***';
    db.run(
      'INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)',
      'promo_apply_fail',
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown',
      JSON.stringify({
        tg_user_id: req.tgUser?.id ?? null,
        code_mask: codeMask,
        reason,
      })
    );
  } catch (_) { /* best-effort */ }
}

// POST /api/v1/promo/apply
// Per-user rate-limit (5/час) подключён глобально в index.js через promoLimiter.
router.post('/apply', (req, res) => {
  const { code } = req.body;
  if (!code?.trim()) {
    logPromoFail(req, code, 'empty');
    return res.status(400).json({ ok: false, error: 'code обязателен' });
  }

  const normalized = code.trim().toUpperCase().slice(0, 64);
  const user = ensureUser(req);

  const promo = db.get('SELECT * FROM promo_codes WHERE code = ?', normalized);
  if (!promo) {
    logPromoFail(req, normalized, 'not_found');
    return res.status(400).json({ ok: false, error: 'Промокод не найден или недействителен' });
  }
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    logPromoFail(req, normalized, 'expired');
    return res.status(400).json({ ok: false, error: 'Срок действия промокода истёк' });
  }
  if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
    logPromoFail(req, normalized, 'max_uses_reached');
    return res.status(400).json({ ok: false, error: 'Лимит использований промокода исчерпан' });
  }

  // Идемпотентная резервация: INSERT OR IGNORE по (promo_code_id, telegram_user_id)
  const ins = db.run(
    `INSERT OR IGNORE INTO promo_uses (promo_code_id, telegram_user_id) VALUES (?, ?)`,
    promo.id, req.tgUser.id
  );
  if (ins.changes === 0) {
    logPromoFail(req, normalized, 'already_used');
    return res.status(400).json({ ok: false, error: 'Этот промокод уже был использован' });
  }

  let payload;
  try { payload = JSON.parse(promo.payload || '{}'); }
  catch (_) { payload = {}; }

  // Применяем эффект промокода
  let appliedSummary = {};
  if (promo.kind === 'bonus_quota') {
    const value = Math.max(0, Math.min(parseInt(payload.value, 10) || 0, 1000));
    db.run(
      'UPDATE users SET tg_bonus_quota = COALESCE(tg_bonus_quota, 0) + ? WHERE id = ?',
      value, user.id
    );
    appliedSummary = { kind: 'bonus_quota', added: value };
  } else if (promo.kind === 'sub_trial') {
    const plan = ['basic', 'premium', 'day_pass'].includes(payload.plan) ? payload.plan : 'basic';
    const days = Math.max(1, Math.min(parseInt(payload.days, 10) || 7, 365));

    // Продлеваем существующую активную подписку или создаём новую с now+days
    const existing = db.get(
      `SELECT id, expires_at FROM subscriptions
       WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
       ORDER BY datetime(expires_at) DESC LIMIT 1`,
      req.tgUser.id
    );
    const base = existing?.expires_at && new Date(existing.expires_at) > new Date()
      ? new Date(existing.expires_at)
      : new Date();
    const newExpires = new Date(base.getTime() + days * 86_400_000).toISOString();

    db.run(
      `INSERT INTO subscriptions (telegram_user_id, plan, source, started_at, expires_at, is_trial, auto_renew)
       VALUES (?, ?, 'promo', datetime('now'), ?, 1, 0)`,
      req.tgUser.id, plan, newExpires
    );
    appliedSummary = { kind: 'sub_trial', plan, days, expires_at: newExpires };
  } else {
    // Неизвестный kind — откатить резервацию чтобы пользователь смог попробовать ещё раз
    db.run('DELETE FROM promo_uses WHERE promo_code_id = ? AND telegram_user_id = ?', promo.id, req.tgUser.id);
    return res.status(500).json({ ok: false, error: 'Промокод имеет неизвестный тип' });
  }

  db.run(`UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?`, promo.id);

  res.json({
    ok: true,
    code: normalized,
    applied: appliedSummary,
  });
});

export default router;
