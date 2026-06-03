// ═══════════════════════════════════════════════════════════════
// Admin router (TMA).
//
// Аутентификация:
//   - Если в запросе есть валидный req.tgUser (это глобальный requireInitData
//     для /api/v1/*) И его id в ADMIN_TELEGRAM_IDS — пускаем.
//   - Если нет (CLI/curl без initData) — проверяем legacy X-Admin-Secret
//     (requireAdminSecret).
// Это даёт удобный UX для админа из TMA и не теряет возможности ручных операций.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db from '../db/index.js';
import { callAI, parseAIJson, FREE_MODELS } from '../services/polza.js';
import { requireAdminTg, getAdminIds } from '../middleware/auth.js';
import { requireAdminSecret, getAuditLog } from '../middleware/adminAuth.js';

const router = Router();

// Гибридный admin guard: req.tgUser (initData) ИЛИ X-Admin-Secret.
function requireAdminAny(req, res, next) {
  // Если initData уже валиден и user в allowlist — пускаем
  if (req.tgUser?.id && getAdminIds().includes(req.tgUser.id)) {
    return next();
  }
  // Иначе пробуем secret-fallback (для curl)
  return requireAdminSecret(req, res, next);
}

router.use(requireAdminAny);

// ── GET /api/v1/admin/prompts ─────────────────────────────────────────────────
router.get('/prompts', (req, res) => {
  const prompts = db.all('SELECT * FROM prompts ORDER BY key ASC');
  res.json({ ok: true, prompts });
});

// ── GET /api/v1/admin/prompts/:id ─────────────────────────────────────────────
router.get('/prompts/:id', (req, res) => {
  const prompt = db.get('SELECT * FROM prompts WHERE id = ?', req.params.id);
  if (!prompt) return res.status(404).json({ ok: false, error: 'Промпт не найден' });
  res.json({ ok: true, prompt });
});

// ── PUT /api/v1/admin/prompts/:id ─────────────────────────────────────────────
router.put('/prompts/:id', (req, res) => {
  const { system_prompt, model, temperature, max_tokens, name, description, is_active } = req.body;

  const existing = db.get('SELECT * FROM prompts WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Промпт не найден' });

  const newValues = {
    system_prompt: system_prompt ?? existing.system_prompt,
    model:         model         ?? existing.model,
    temperature:   temperature   ?? existing.temperature,
    max_tokens:    max_tokens    ?? existing.max_tokens,
    name:          name          ?? existing.name,
    description:   description   ?? existing.description,
    is_active:     is_active     ?? existing.is_active,
  };

  db.run(
    `UPDATE prompts SET
       system_prompt = ?, model = ?, temperature = ?, max_tokens = ?,
       name = ?, description = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    newValues.system_prompt, newValues.model, newValues.temperature, newValues.max_tokens,
    newValues.name, newValues.description, newValues.is_active,
    existing.id
  );

  const changed = {};
  for (const k of Object.keys(newValues)) {
    if (String(newValues[k]) !== String(existing[k])) {
      changed[k] = { from: existing[k], to: newValues[k] };
    }
  }
  db.run(
    'INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)',
    'prompt_update',
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
    req.headers['user-agent'] || 'unknown',
    JSON.stringify({
      prompt_id: existing.id,
      prompt_key: existing.key,
      changed,
      by_tg: req.tgUser?.id ?? null,
    })
  );

  const result = db.get('SELECT * FROM prompts WHERE id = ?', existing.id);
  res.json({ ok: true, prompt: result });
});

// ── POST /api/v1/admin/prompts/test ──────────────────────────────────────────
// M4 — defense-in-depth: ограничиваем модель whitelist'ом, max_tokens cap'ом
// и test_input по длине, чтобы скомпрометированный админ не мог жечь Polza-токены.
const ALLOWED_TEST_MODELS = ['qwen/qwen3-235b-a22b-2507', 'meta-llama/llama-4-maverick'];
const MAX_TEST_TOKENS = 2000;
const MAX_TEST_INPUT = 5000;

router.post('/prompts/test', async (req, res) => {
  const { prompt_id, system_prompt, model, temperature = 0.7, max_tokens = 500, test_input, variables = {} } = req.body;
  if (!test_input) return res.status(400).json({ ok: false, error: 'test_input обязателен' });
  if (typeof test_input !== 'string' || test_input.length > MAX_TEST_INPUT) {
    return res.status(400).json({ ok: false, error: `test_input не более ${MAX_TEST_INPUT} символов` });
  }

  let finalPrompt = system_prompt;
  let finalModel  = model || FREE_MODELS.primary;
  let finalTemp   = temperature;
  let finalTokens = max_tokens;

  if (prompt_id) {
    const p = db.get('SELECT * FROM prompts WHERE id = ?', prompt_id);
    if (!p) return res.status(404).json({ ok: false, error: 'Промпт не найден' });
    finalPrompt = system_prompt ?? p.system_prompt;
    finalModel  = model ?? p.model;
    finalTemp   = temperature ?? p.temperature;
    finalTokens = max_tokens ?? p.max_tokens;
  }

  if (!finalPrompt) return res.status(400).json({ ok: false, error: 'system_prompt обязателен' });

  // Cap max_tokens на 2000 — больше для теста админу не нужно.
  finalTokens = Math.min(Number.isFinite(+finalTokens) ? +finalTokens : 500, MAX_TEST_TOKENS);

  // Whitelist модели — даже если админ скомпрометирован, дорогую модель не вызовет.
  if (finalModel && !ALLOWED_TEST_MODELS.includes(finalModel)) {
    return res.status(400).json({
      ok: false,
      error: `model должен быть одним из: ${ALLOWED_TEST_MODELS.join(', ')}`,
    });
  }

  const t0 = Date.now();
  try {
    const { content, usage, model: usedModel } = await callAI({
      model: finalModel, temperature: finalTemp, max_tokens: finalTokens,
      systemPrompt: finalPrompt, variables,
      messages: [{ role: 'user', content: test_input }],
    });

    let parsed = null;
    try { parsed = parseAIJson(content); } catch (_) {}

    res.json({ ok: true, raw: content, parsed, model: usedModel, usage, duration_ms: Date.now() - t0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, duration_ms: Date.now() - t0 });
  }
});

// ── GET /api/v1/admin/stats ───────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const stats = {
    users:          db.get('SELECT COUNT(*) as c FROM users').c,
    analyses:       db.get('SELECT COUNT(*) as c FROM analysis_sessions').c,
    simulations:    db.get('SELECT COUNT(*) as c FROM simulator_sessions').c,
    rejections:     db.get('SELECT COUNT(*) as c FROM rejection_analyses').c,
    avg_score:      db.get('SELECT AVG(score) as a FROM analysis_sessions WHERE score IS NOT NULL').a,
    requests_today: db.get(`SELECT COUNT(*) as c FROM request_logs WHERE created_at >= date('now')`).c,
    paid_subs:      db.get(`SELECT COUNT(*) as c FROM subscriptions WHERE datetime(expires_at) > datetime('now')`).c,
  };

  // recent_users — без telegram_user_id и username в открытом виде (PII), маскируем
  const recent_users = db.all(
    `SELECT telegram_user_id, username, sub_tier, sub_expires_at, requests_count, simulations_count, created_at, last_seen_at
     FROM users ORDER BY created_at DESC LIMIT 10`
  ).map(u => ({
    ...u,
    telegram_user_id: u.telegram_user_id ? `${String(u.telegram_user_id).slice(0, 4)}***` : null,
    // L1 — username тоже PII (часто содержит имя), маскируем первые 2 символа.
    username: u.username ? `${String(u.username).slice(0, 2)}***` : null,
  }));

  res.json({ ok: true, stats, recent_users });
});

// ── GET /api/v1/admin/logs ────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const logs = db.all('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ?', limit);
  res.json({ ok: true, logs });
});

// ── GET /api/v1/admin/audit-log ──────────────────────────────────────────────
router.get('/audit-log', getAuditLog);

// ── GET /api/v1/admin/models ──────────────────────────────────────────────────
router.get('/models', (req, res) => {
  res.json({ ok: true, models: FREE_MODELS });
});

// ── GET /api/v1/admin/users/:tgId ────────────────────────────────────────────
// Поиск юзера по telegram_user_id для проверки перед grant/revoke.
router.get('/users/:tgId', (req, res) => {
  const tgId = parseInt(req.params.tgId, 10);
  if (!Number.isFinite(tgId)) return res.status(400).json({ ok: false, error: 'Невалидный TG ID' });

  const user = db.get('SELECT id, telegram_user_id, first_name, last_name, username, sub_tier, sub_expires_at, created_at, last_seen_at FROM users WHERE telegram_user_id = ?', tgId);
  if (!user) return res.status(404).json({ ok: false, error: 'Юзер не найден. Он должен сначала открыть Mini App.' });

  // Активная подписка (если есть)
  const sub = db.get(
    `SELECT id, plan, source, started_at, expires_at, cancelled_at, auto_renew
     FROM subscriptions
     WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
     ORDER BY datetime(expires_at) DESC LIMIT 1`,
    tgId
  );

  res.json({ ok: true, user, active_subscription: sub || null });
});

// ── POST /api/v1/admin/users/:tgId/grant-subscription ───────────────────────
// Выдать подписку юзеру. body: { plan: 'basic'|'premium', days: 30 }
// Действия логируются в admin_audit_log для compliance.
router.post('/users/:tgId/grant-subscription', (req, res) => {
  const tgId = parseInt(req.params.tgId, 10);
  if (!Number.isFinite(tgId)) return res.status(400).json({ ok: false, error: 'Невалидный TG ID' });

  const { plan, days } = req.body || {};
  if (!['basic', 'premium', 'day_pass'].includes(plan)) {
    return res.status(400).json({ ok: false, error: "plan должен быть 'basic', 'premium' или 'day_pass'" });
  }
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n < 1 || n > 365) {
    return res.status(400).json({ ok: false, error: 'days должен быть от 1 до 365' });
  }

  const user = db.get('SELECT id FROM users WHERE telegram_user_id = ?', tgId);
  if (!user) return res.status(404).json({ ok: false, error: 'Юзер не найден. Он должен сначала открыть Mini App.' });

  // Продлеваем от max(now, current_expires) чтобы не сбросить активную подписку
  const existing = db.get(
    `SELECT expires_at FROM subscriptions WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
     ORDER BY datetime(expires_at) DESC LIMIT 1`,
    tgId
  );
  const base = existing?.expires_at && new Date(existing.expires_at) > new Date()
    ? new Date(existing.expires_at)
    : new Date();
  const newExpires = new Date(base.getTime() + n * 86_400_000).toISOString();

  db.transaction(() => {
    db.run(
      `INSERT INTO subscriptions (telegram_user_id, plan, source, started_at, expires_at, is_trial, auto_renew)
       VALUES (?, ?, 'admin_grant', datetime('now'), ?, 0, 0)`,
      tgId, plan, newExpires
    );
    db.run(
      `UPDATE users SET sub_tier = ?, sub_expires_at = ? WHERE telegram_user_id = ?`,
      plan === 'premium' ? 'premium' : 'basic',
      newExpires,
      tgId
    );
    // Audit-лог
    const adminTgId = req.tgUser?.id || 'cli';
    db.run(
      `INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)`,
      'grant_subscription',
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown',
      JSON.stringify({ admin_tg: adminTgId, target_tg: tgId, plan, days: n, new_expires: newExpires }),
    );
  })();

  console.log(`[admin] grant_subscription: admin=${req.tgUser?.id || 'cli'} target=${tgId} plan=${plan} days=${n}`);
  res.json({ ok: true, plan, days: n, expires_at: newExpires });
});

// ── POST /api/v1/admin/users/:tgId/revoke-subscription ──────────────────────
// Отозвать активную подписку — expires_at = now, auto_renew = 0.
router.post('/users/:tgId/revoke-subscription', (req, res) => {
  const tgId = parseInt(req.params.tgId, 10);
  if (!Number.isFinite(tgId)) return res.status(400).json({ ok: false, error: 'Невалидный TG ID' });

  const user = db.get('SELECT id FROM users WHERE telegram_user_id = ?', tgId);
  if (!user) return res.status(404).json({ ok: false, error: 'Юзер не найден' });

  const active = db.get(
    `SELECT id, plan, expires_at FROM subscriptions
     WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
     ORDER BY datetime(expires_at) DESC LIMIT 1`,
    tgId
  );
  if (!active) {
    return res.status(404).json({ ok: false, error: 'Активной подписки нет — нечего отзывать' });
  }

  db.transaction(() => {
    db.run(
      `UPDATE subscriptions SET expires_at = datetime('now'), cancelled_at = datetime('now'), auto_renew = 0 WHERE id = ?`,
      active.id
    );
    db.run(
      `UPDATE users SET sub_tier = 'free', sub_expires_at = NULL WHERE telegram_user_id = ?`,
      tgId
    );
    const adminTgId = req.tgUser?.id || 'cli';
    db.run(
      `INSERT INTO admin_audit_log (action, ip, user_agent, details) VALUES (?, ?, ?, ?)`,
      'revoke_subscription',
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown',
      req.headers['user-agent'] || 'unknown',
      JSON.stringify({ admin_tg: adminTgId, target_tg: tgId, revoked_plan: active.plan, was_expires: active.expires_at }),
    );
  })();

  console.log(`[admin] revoke_subscription: admin=${req.tgUser?.id || 'cli'} target=${tgId} was_plan=${active.plan}`);
  res.json({ ok: true, revoked: { plan: active.plan, was_expires: active.expires_at } });
});

export default router;
