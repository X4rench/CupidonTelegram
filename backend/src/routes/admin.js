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

export default router;
