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

// ── POST /api/v1/users/claim-tg-bonus ────────────────────────────────────────
// DEPRECATED: бонус за подписку на TG-канал убран по запросу клиента
// (экономика: +5 запросов = ~150₽ убытка на подписчика). Endpoint оставлен
// чтобы старые билды фронта не падали 404, но всегда возвращает 410 Gone.
// Канал остаётся как контент-маркетинг — без денежной плюшки.
router.post('/claim-tg-bonus', (_req, res) => {
  res.status(410).json({
    ok: false,
    error: 'Бонус за подписку на канал больше не действует. Спасибо что с нами!',
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
