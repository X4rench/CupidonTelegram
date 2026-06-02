// ═══════════════════════════════════════════════════════════════
// Request limits — per-day, в UTC-сутках.
//
// В TMA-версии identity = telegram_user_id (нельзя подделать через
// initData HMAC), поэтому никаких durable hardware-bind таблиц —
// `free_trials(telegram_user_id, feature)` уникальна сама по себе.
//
// Лимиты задаются через env по тиру:
//   FREE_DAILY_LIMIT    (default 3)
//   BASIC_DAILY_LIMIT   (default 30)
//   PREMIUM_DAILY_LIMIT (default 100)
//
// Сутки — UTC (см. §5.28 в TMA_PORTING_PLAYBOOK). Никакой локальной TZ:
// иначе у юзера в Иркутске лимит будет сбрасываться в случайный для бэка час.
// ═══════════════════════════════════════════════════════════════
import db, { getActiveSubscription, getUserTier } from '../db/index.js';

export const FREE_DAILY_LIMIT    = parseInt(process.env.FREE_DAILY_LIMIT, 10)    || 3;
export const BASIC_DAILY_LIMIT   = parseInt(process.env.BASIC_DAILY_LIMIT, 10)   || 30;
export const PREMIUM_DAILY_LIMIT = parseInt(process.env.PREMIUM_DAILY_LIMIT, 10) || 100;

// Идемпотентная миграция: free_trials в TMA — без user_id FK, по telegram_user_id.
// Уникальная пара (telegram_user_id, feature) гарантирует разовость пробника per-фича.
db.exec(`
  CREATE TABLE IF NOT EXISTS free_trials (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id  INTEGER NOT NULL,
    feature           TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(telegram_user_id, feature)
  );
  CREATE INDEX IF NOT EXISTS idx_free_trials_user ON free_trials(telegram_user_id);
`);

/** Активна ли сейчас платная подписка. */
export function isSubActive(user) {
  if (!user?.telegram_user_id) return false;
  return !!getActiveSubscription(user.telegram_user_id);
}

/**
 * UTC-сутки в формате YYYY-MM-DD. Используется как period key для daily_reset_at.
 * Никогда не использовать new Date().toISOString().slice(0,10) — это даёт UTC ✓, но мы
 * фиксируем явно через UTCFullYear/Month/Date чтобы не зависеть от поведения toISOString.
 */
function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Дневной лимит для текущего тира. */
function limitForTier(tier) {
  if (tier === 'premium') return PREMIUM_DAILY_LIMIT;
  if (tier === 'basic')   return BASIC_DAILY_LIMIT;
  return FREE_DAILY_LIMIT;
}

/**
 * Проверяет лимит и инкрементирует счётчик.
 * Возвращает true (разрешить) или false (уже ответил 429).
 *
 * Логика:
 *   1. Если лимит не заблокирует — обычное списание.
 *   2. Если лимит заблокирует — пробуем free trial → TG-бонус → 429.
 *
 * @param {Object} user — строка users (нужны .id, .telegram_user_id, .daily_*, .tg_bonus_quota)
 * @param {Object} res  — express response (используется для 429)
 * @param {string} [feature] — для попытки списать первую бесплатную пробу
 */
export function checkAndIncrementLimit(user, res, feature) {
  const tier = getUserTier(user.telegram_user_id);
  const limit = limitForTier(tier);
  const today = todayUTC();
  const storedKey = user.daily_reset_at?.slice(0, 10);
  const used = storedKey === today ? (user.daily_requests || 0) : 0;
  const wouldBlock = used >= limit;

  if (!wouldBlock) {
    db.run(
      `UPDATE users SET
         daily_requests = ?,
         daily_reset_at = ?,
         requests_count = requests_count + 1
       WHERE id = ?`,
      used + 1,
      today,
      user.id
    );
    return true;
  }

  // Лимит блокирует — пробуем free trial для этой фичи
  if (feature && tryConsumeFreeTrial(user, feature)) {
    db.run('UPDATE users SET requests_count = requests_count + 1 WHERE id = ?', user.id);
    return true;
  }

  // Free trial недоступен — пробуем TG-бонус
  if (tryConsumeBonus(user)) {
    db.run('UPDATE users SET requests_count = requests_count + 1 WHERE id = ?', user.id);
    return true;
  }

  const hint = tier === 'free'
    ? `Бесплатный лимит — ${FREE_DAILY_LIMIT} запросов в день. Оформи подписку для увеличения лимита, или подпишись на наш Telegram-канал и получи +5 бесплатных генераций.`
    : `Лимит ${limit} запросов в день исчерпан. Сбросится завтра в 00:00 UTC.`;

  res.status(429).json({
    ok:           false,
    error:        hint,
    used,
    limit,
    tier,
    resets_at:    today,
    can_claim_tg_bonus: !user.tg_bonus_claimed,
  });
  return false;
}

/**
 * Попытаться использовать бесплатную пробную генерацию в данном режиме.
 * Атомарно через INSERT OR IGNORE — race-safe.
 * Допустимые feature: wing | first_message | rejection | support |
 *                     simulator | reboot | date_invite | style_shift | quick_reply
 */
export function tryConsumeFreeTrial(user, feature) {
  if (!user?.telegram_user_id || !feature) return false;
  try {
    const ins = db.run(
      `INSERT OR IGNORE INTO free_trials (telegram_user_id, feature) VALUES (?, ?)`,
      user.telegram_user_id, feature
    );
    return ins.changes > 0;
  } catch (_) {
    return false;
  }
}

/** Списать одну единицу TG-бонуса (если есть). */
export function tryConsumeBonus(user) {
  if (!user) return false;
  const quota = user.tg_bonus_quota || 0;
  if (quota <= 0) return false;
  try {
    const r = db.run(
      'UPDATE users SET tg_bonus_quota = tg_bonus_quota - 1 WHERE id = ? AND tg_bonus_quota > 0',
      user.id
    );
    return r.changes > 0;
  } catch (_) {
    return false;
  }
}

/** Публичное состояние лимитов для ответа фронтенду. */
export function buildLimitInfo(user) {
  const tier = getUserTier(user.telegram_user_id);
  const sub  = getActiveSubscription(user.telegram_user_id);
  const limit = limitForTier(tier);
  const today = todayUTC();
  const storedKey = user.daily_reset_at?.slice(0, 10);
  const used = storedKey === today ? (user.daily_requests || 0) : 0;
  return {
    tier,
    daily_used:    used,
    daily_limit:   limit,
    resets_at:     today,
    sub_expires_at: sub?.expires_at ?? null,
    tg_bonus_quota: user.tg_bonus_quota || 0,
  };
}
