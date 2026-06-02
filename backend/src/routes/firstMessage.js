// ═══════════════════════════════════════════════════════════════
// First Message router (TMA).
// /generate — 9 первых сообщений по тегам/описанию профиля.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db, { upsertUserFromInitData } from '../db/index.js';
import { callAI, parseAIJson } from '../services/polza.js';
import { logAICall } from '../middleware/logger.js';
import { checkAndIncrementLimit } from '../utils/limits.js';
import { makeKey, getCached, setCached } from '../services/cache.js';
import { validateFirstMessageResult } from '../utils/aiSchemas.js';
import { sanitizeForPrompt } from '../utils/promptSanitize.js';

const router = Router();
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function ensureUser(req) {
  const { user } = upsertUserFromInitData(req.tgUser, req.startParam);
  return user;
}

const getPrompt = (key) => db.get('SELECT * FROM prompts WHERE key = ? AND is_active = 1', key);

const MAX_PROFILE_LEN = 3_000;
const MAX_NAME_LEN    = 100;
const MAX_TAG_LEN     = 50;

// H3 — PII retention: храним только префикс profile_text после успешного ответа
// (исходник из дейтинг-приложений может содержать PII — фамилии, телефоны).
const STORED_PROFILE_TEXT_MAX = 500;
const truncStored = (s) => {
  if (!s) return s;
  const str = String(s);
  return str.length > STORED_PROFILE_TEXT_MAX
    ? `${str.slice(0, STORED_PROFILE_TEXT_MAX)}…[truncated]`
    : str;
};

function buildUserCtx(profile = {}) {
  if (!profile || typeof profile !== 'object') return '';
  const parts = [];
  if (profile.age        && typeof profile.age === 'string')        parts.push(sanitizeForPrompt(profile.age, 30));
  if (profile.experience && typeof profile.experience === 'string') parts.push(`опыт: ${sanitizeForPrompt(profile.experience, 30)}`);
  if (!parts.length) return '';
  return `Пользователь: ${parts.filter(Boolean).join(', ')}.\n`;
}

// ── POST /api/v1/first-message/generate ──────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { girl_name = '', tags = [], profile_text = '', user_profile } = req.body;

  if (girl_name.length > MAX_NAME_LEN)
    return res.status(400).json({ ok: false, error: `girl_name не может быть длиннее ${MAX_NAME_LEN} символов` });
  if (profile_text.length > MAX_PROFILE_LEN)
    return res.status(400).json({ ok: false, error: `profile_text не может быть длиннее ${MAX_PROFILE_LEN} символов` });
  if (!Array.isArray(tags) || tags.length > 20)
    return res.status(400).json({ ok: false, error: 'tags: массив до 20 элементов' });
  if (tags.some(t => typeof t !== 'string' || t.length > MAX_TAG_LEN))
    return res.status(400).json({ ok: false, error: `Каждый тег не более ${MAX_TAG_LEN} символов` });

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'first_message')) return;

  const prompt = getPrompt('first_message');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт не найден' });

  const safeName    = sanitizeForPrompt(girl_name.trim(),    MAX_NAME_LEN)    || 'не указано';
  const safeProfile = sanitizeForPrompt(profile_text.trim(), MAX_PROFILE_LEN) || 'не указано';
  const safeTags    = tags.slice(0, 20).map(t => sanitizeForPrompt(t, MAX_TAG_LEN)).filter(Boolean).join(', ') || 'не указаны';

  const t0 = Date.now();
  // Кеш per-tg-user — PII в user_ctx нельзя шарить между юзерами
  const cacheKey = makeKey('first-message', {
    tg_user_id: req.tgUser.id,
    name: norm(safeName),
    tags: [...tags].sort().map(norm).join(','),
    profile: norm(safeProfile),
    age: user_profile?.age,
    exp: user_profile?.experience,
    model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    db.run(
      'INSERT INTO first_messages (telegram_user_id, girl_name, tags, profile_text, messages) VALUES (?, ?, ?, ?, ?)',
      req.tgUser.id, safeName, JSON.stringify(tags), truncStored(safeProfile), JSON.stringify(cached.messages || [])
    );
    return res.json({ ok: true, messages: cached.messages || [], cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature,
      max_tokens: Math.max(prompt.max_tokens, 1500),
      reasoning: 'off',
      systemPrompt: prompt.system_prompt,
      variables: {
        girl_name:    safeName,
        tags:         safeTags,
        profile_text: safeProfile,
        user_ctx:     buildUserCtx(user_profile),
      },
      messages: [{ role: 'user', content: 'Сгенерируй РОВНО 9 первых сообщений. Верни массив messages из 9 разных элементов. Ответь ТОЛЬКО чистым JSON без markdown и без пояснений.' }],
    });
    logAICall({ endpoint: '/first-message/generate', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateFirstMessageResult(result);

    await setCached(cacheKey, result);
    db.run(
      'INSERT INTO first_messages (telegram_user_id, girl_name, tags, profile_text, messages) VALUES (?, ?, ?, ?, ?)',
      req.tgUser.id, safeName, JSON.stringify(tags), truncStored(safeProfile), JSON.stringify(result.messages)
    );
    res.json({ ok: true, messages: result.messages });
  } catch (err) {
    logAICall({ endpoint: '/first-message/generate', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[first-message/generate]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации. Попробуй ещё раз.' });
  }
});

export default router;
