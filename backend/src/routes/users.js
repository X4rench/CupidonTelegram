// ═══════════════════════════════════════════════════════════════
// Users router (TMA).
//
// Идентификация — глобально через initData (req.tgUser). Хелпер
// upsertUserFromInitData сам создаёт/обновляет строку users.
// Никаких device_id / hardware_id / session_token — telegram_user_id уникален
// и подделать его нельзя.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db, { upsertUserFromInitData, getActiveSubscription, getUserTier } from '../db/index.js';
import { buildLimitInfo } from '../utils/limits.js';
import { getAdminIds } from '../middleware/auth.js';
import { callBotApi } from '../services/bot-api.js';
import { attributePartnerReferral, isPartner } from '../utils/partnerHooks.js';

const router = Router();

// Канал для верификации подписки бонусом. Если не задан — fallback (DEV).
const REQUIRED_CHANNEL = process.env.TG_BONUS_CHANNEL_ID;

/**
 * Безопасный ответ — только то, что нужно фронту.
 * НЕ возвращаем внутренний user.id (AUTOINCREMENT PK) — фронт работает только
 * через telegram_user_id (он же — identity).
 */
function buildUserResponse(user) {
  const adminIds = getAdminIds();
  return {
    telegram_user_id:   user.telegram_user_id,
    first_name:         user.first_name,
    last_name:          user.last_name,
    username:           user.username,
    language_code:      user.language_code,
    onboarding_done:    !!user.onboarding_done,
    questionnaire_done: !!user.questionnaire_done,
    tutorial_done:      !!user.tutorial_done,
    user_profile:       user.user_profile ? safeJsonParse(user.user_profile) : null,
    requests_count:     user.requests_count,
    simulations_count:  user.simulations_count,
    tg_bonus_claimed:   !!user.tg_bonus_claimed,
    is_admin:           adminIds.includes(user.telegram_user_id),
    is_partner:         isPartner(user.telegram_user_id),
    created_at:         user.created_at,
    ...buildLimitInfo(user),
  };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

// ── GET /api/v1/users/me ──────────────────────────────────────────────────────
// Первый запрос фронта — заодно upsert юзера из initData.
// Если юзер новый и пришёл через реф-ссылку (start_param=p_<code>), пытаемся
// атрибутировать (first-touch). Существующие юзера без атрибуции — protected,
// повторный заход по реф-ссылке их не зацепит.
router.get('/me', (req, res) => {
  const { user, isNew } = upsertUserFromInitData(req.tgUser, req.startParam);
  if (isNew && req.startParam) {
    try { attributePartnerReferral(user.telegram_user_id, req.startParam); }
    catch (e) { console.warn('[users/me] partner attribution failed:', e?.message); }
  }
  res.json({ ok: true, user: buildUserResponse(user), is_new: isNew });
});

// ── PUT /api/v1/users/me ──────────────────────────────────────────────────────
// Обновить профиль (анкета онбординга) — user_profile + onboarding_done +
// questionnaire_done. Не разрешаем менять telegram_user_id / счётчики / подписку.
router.put('/me', (req, res) => {
  const { user_profile, onboarding_done, questionnaire_done, tutorial_done } = req.body;
  const user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });

  // Валидация user_profile: JSON.stringify (любой объект) либо null
  let profileJson = null;
  if (user_profile !== undefined && user_profile !== null) {
    if (typeof user_profile !== 'object' || Array.isArray(user_profile)) {
      return res.status(400).json({ ok: false, error: 'user_profile должен быть объектом' });
    }
    try { profileJson = JSON.stringify(user_profile).slice(0, 8_000); }
    catch (_) { return res.status(400).json({ ok: false, error: 'user_profile не сериализуется в JSON' }); }
  }

  db.run(
    `UPDATE users SET
       user_profile       = COALESCE(?, user_profile),
       onboarding_done    = COALESCE(?, onboarding_done),
       questionnaire_done = COALESCE(?, questionnaire_done),
       tutorial_done      = COALESCE(?, tutorial_done),
       updated_at         = datetime('now')
     WHERE id = ?`,
    profileJson,
    typeof onboarding_done    === 'boolean' ? (onboarding_done    ? 1 : 0) : null,
    typeof questionnaire_done === 'boolean' ? (questionnaire_done ? 1 : 0) : null,
    typeof tutorial_done      === 'boolean' ? (tutorial_done      ? 1 : 0) : null,
    user.id
  );

  const updated = db.get('SELECT * FROM users WHERE id = ?', user.id);
  res.json({ ok: true, user: buildUserResponse(updated) });
});

// ── GET /api/v1/users/subscription ───────────────────────────────────────────
router.get('/subscription', (req, res) => {
  // Auto-upsert на случай race с /me
  let user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) {
    upsertUserFromInitData(req.tgUser, req.startParam);
    user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  }
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });

  const sub = getActiveSubscription(req.tgUser.id);
  res.json({
    ok: true,
    tier: getUserTier(req.tgUser.id),
    subscription: sub,
    ...buildLimitInfo(user),
  });
});

// ── GET /api/v1/users/stats ──────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  // Auto-upsert: если /stats пришёл раньше /me (race condition на параллельных
  // запросах с фронта), создаём юзера из initData. Иначе фронт получит 404.
  let user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) {
    upsertUserFromInitData(req.tgUser, req.startParam);
    user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  }
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });

  const analysisCount = db.get('SELECT COUNT(*) as c FROM analysis_sessions WHERE telegram_user_id = ?', req.tgUser.id).c;
  const simCount      = db.get('SELECT COUNT(*) as c FROM simulator_sessions WHERE telegram_user_id = ?', req.tgUser.id).c;
  const avgRow        = db.get('SELECT AVG(score) as avg FROM analysis_sessions WHERE telegram_user_id = ? AND score IS NOT NULL', req.tgUser.id);
  const avgScore      = avgRow?.avg ? parseFloat(avgRow.avg.toFixed(1)) : null;

  res.json({
    ok: true,
    stats: {
      requests:    analysisCount,
      simulations: simCount,
      avg_score:   avgScore,
      days_in_app: Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000) + 1,
      ...buildLimitInfo(user),
    },
  });
});

// ── GET /api/v1/users/stats/timeline ─────────────────────────────────────────
// Дневная (последние 30 дней) + месячная (последние 12 месяцев) активность.
// Используется в Профиле для bar-графиков. Считаем по UTC-датам (как и
// created_at в таблицах — там datetime('now') = UTC).
//
// Возвращает структуру:
//   {
//     daily:   [{ date: 'YYYY-MM-DD', requests: N, simulations: N }, ...30],
//     monthly: [{ month: 'YYYY-MM',    requests: N, simulations: N }, ...12],
//   }
// Дни/месяцы возвращаются ВСЕГДА — отсутствующие дни заполняются нулями
// (иначе bar-chart "схлопывается" — пропадают пустые периоды).
router.get('/stats/timeline', (req, res) => {
  let user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) {
    upsertUserFromInitData(req.tgUser, req.startParam);
    user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  }
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });

  const tgId = req.tgUser.id;

  // Daily — последние 30 дней. strftime('%Y-%m-%d', created_at) даёт UTC-дату.
  // analysis_sessions / simulator_sessions — таблицы откуда лежат активности.
  const analysisDaily = db.all(
    `SELECT strftime('%Y-%m-%d', created_at) as d, COUNT(*) as c
       FROM analysis_sessions
      WHERE telegram_user_id = ? AND created_at >= datetime('now', '-29 days')
      GROUP BY d`,
    tgId
  );
  const simDaily = db.all(
    `SELECT strftime('%Y-%m-%d', created_at) as d, COUNT(*) as c
       FROM simulator_sessions
      WHERE telegram_user_id = ? AND created_at >= datetime('now', '-29 days')
      GROUP BY d`,
    tgId
  );
  const analysisMonthly = db.all(
    `SELECT strftime('%Y-%m', created_at) as m, COUNT(*) as c
       FROM analysis_sessions
      WHERE telegram_user_id = ? AND created_at >= datetime('now', '-11 months', 'start of month')
      GROUP BY m`,
    tgId
  );
  const simMonthly = db.all(
    `SELECT strftime('%Y-%m', created_at) as m, COUNT(*) as c
       FROM simulator_sessions
      WHERE telegram_user_id = ? AND created_at >= datetime('now', '-11 months', 'start of month')
      GROUP BY m`,
    tgId
  );

  const aD = new Map(analysisDaily.map(r => [r.d, r.c]));
  const sD = new Map(simDaily.map(r => [r.d, r.c]));
  const aM = new Map(analysisMonthly.map(r => [r.m, r.c]));
  const sM = new Map(simMonthly.map(r => [r.m, r.c]));

  // Заполняем все 30 дней нулями где нет активности.
  const today = new Date();
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(today.getTime() - i * 86400000);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    daily.push({
      date: key,
      requests: aD.get(key) ?? 0,
      simulations: sD.get(key) ?? 0,
    });
  }

  // 12 месяцев включая текущий.
  const monthly = [];
  const cur = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(cur.getFullYear(), cur.getMonth() - i, 1);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const key = `${yyyy}-${mm}`;
    monthly.push({
      month: key,
      requests: aM.get(key) ?? 0,
      simulations: sM.get(key) ?? 0,
    });
  }

  res.json({ ok: true, daily, monthly });
});

// ── POST /api/v1/users/claim-tg-bonus ────────────────────────────────────────
// Подписка на Telegram-канал → +5 бесплатных генераций.
// В TMA-версии: проверка через флаг user.tg_bonus_claimed (telegram_user_id
// уникален → одна заявка на TG-аккаунт). Никаких durable hardware-таблиц.
// Реальная подписка проверяется через getChatMember если TG_BONUS_CHANNEL_ID
// задан (формат -100xxxxxxxxxx). Без env — fallback на старое поведение (DEV).
router.post('/claim-tg-bonus', async (req, res) => {
  const user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
  if (user.tg_bonus_claimed) {
    return res.status(400).json({ ok: false, error: 'Бонус уже получен' });
  }

  // Проверка подписки на канал. Если env не задан — warn в DEV-режиме и пропускаем.
  if (REQUIRED_CHANNEL) {
    try {
      const member = await callBotApi('getChatMember', {
        chat_id: REQUIRED_CHANNEL,
        user_id: req.tgUser.id,
      });
      const allowedStatuses = ['member', 'administrator', 'creator'];
      if (!member || !allowedStatuses.includes(member.status)) {
        return res.status(403).json({ ok: false, error: 'Подпишись на канал, чтобы получить бонус' });
      }
    } catch (err) {
      console.error('[claim-tg-bonus] getChatMember failed:', err?.message || err);
      return res.status(503).json({ ok: false, error: 'Не удалось проверить подписку. Попробуй позже.' });
    }
  } else {
    console.warn('[claim-tg-bonus] TG_BONUS_CHANNEL_ID не задан — проверка подписки пропущена (DEV-режим)');
  }

  const bonusQuota = 5;
  db.run(
    `UPDATE users SET tg_bonus_claimed = 1,
                      tg_bonus_quota = COALESCE(tg_bonus_quota, 0) + ?
     WHERE id = ?`,
    bonusQuota, user.id
  );

  res.json({
    ok: true,
    bonus_quota: bonusQuota,
    total_quota: (user.tg_bonus_quota || 0) + bonusQuota,
  });
});

// ── DELETE /api/v1/users/me ───────────────────────────────────────────────────
// Удаление аккаунта. Требует подтверждения в body. CASCADE удалит связанные
// данные (subscriptions, payments, contacts, etc через ON DELETE — но в schema
// FK не везде поставлены; чистим вручную для надёжности).
router.delete('/me', (req, res) => {
  const confirm = req.body?.confirm;
  if (confirm !== 'DELETE_MY_ACCOUNT') {
    return res.status(400).json({
      ok: false,
      error: 'Для удаления требуется подтверждение в теле запроса: { "confirm": "DELETE_MY_ACCOUNT" }'
    });
  }

  const user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });

  const tgId = req.tgUser.id;
  db.transaction(() => {
    db.run('DELETE FROM analysis_sessions  WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM simulator_sessions WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM rejection_analyses WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM first_messages     WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM contacts           WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM free_trials        WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM poll_votes         WHERE telegram_user_id = ?', tgId);
    db.run('DELETE FROM promo_uses         WHERE telegram_user_id = ?', tgId);
    // Subscriptions/payments оставляем — это финансовая история, нельзя терять
    // (для refund/налогов). Но удаляем user — без неё профиль "забыт".
    db.run('DELETE FROM users WHERE id = ?', user.id);
  })();

  res.json({ ok: true, message: 'Профиль и все данные удалены' });
});

export default router;
