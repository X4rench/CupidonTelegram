// ═══════════════════════════════════════════════════════════════
// Analysis router (TMA): Wing, Quick-reply, Rejection, Support,
// Reboot, Date-invite, Style-shift, history.
//
// Identity: req.tgUser (set by global requireInitData middleware).
// Все связанные таблицы (analysis_sessions, rejection_analyses) хранят
// telegram_user_id напрямую — никаких join к users по PK.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import crypto from 'node:crypto';
import db, { upsertUserFromInitData } from '../db/index.js';
import { callAI, parseAIJson } from '../services/polza.js';
import { logAICall } from '../middleware/logger.js';
import { checkAndIncrementLimit } from '../utils/limits.js';
import { makeKey, getCached, setCached } from '../services/cache.js';
import { typazhNameFor, typazhDescFor } from '../utils/typazhes.js';
import {
  validateWingResult,
  validateRejectionResult,
  validateSupportResult,
  validateQuickReplyResult,
  validateRebootResult,
  validateDateInviteResult,
  validateStyleShiftResult,
} from '../utils/aiSchemas.js';
import { sanitizeForPrompt } from '../utils/promptSanitize.js';

const router = Router();

const normText = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

/** Ensure user-row exists (upsert идемпотентен — обновляет first_name/etc). */
function ensureUser(req) {
  const { user } = upsertUserFromInitData(req.tgUser, req.startParam);
  return user;
}

const getPrompt = (key) => db.get('SELECT * FROM prompts WHERE key = ? AND is_active = 1', key);

const MAX_TEXT_LEN    = 8_000;
const MAX_SUPPORT_LEN = 4_000;
const MAX_CITY_LEN    = 100;

// H3 — PII retention: после успешного анализа храним только префикс input_text
// (для history-snippet/preview). Идемпотентность держится через input_hash.
const STORED_INPUT_TEXT_MAX = 500;
const truncStored = (s) => {
  if (!s) return s;
  const str = String(s);
  return str.length > STORED_INPUT_TEXT_MAX
    ? `${str.slice(0, STORED_INPUT_TEXT_MAX)}…[truncated]`
    : str;
};

// ── Хелперы для персонализации промптов ──────────────────────────────────────

function buildUserCtx(profile = {}) {
  if (!profile || typeof profile !== 'object') return '';
  const parts = [];
  if (profile.age        && typeof profile.age === 'string')        parts.push(sanitizeForPrompt(profile.age, 30));
  if (profile.experience && typeof profile.experience === 'string') parts.push(`опыт: ${sanitizeForPrompt(profile.experience, 30)}`);
  if (!parts.length) return '';
  return `Пользователь: ${parts.filter(Boolean).join(', ')}.\n`;
}

function buildGirlCtx(tgUserId, contactId, typazhHint = null) {
  const hintRaw = typeof typazhHint === 'string' ? typazhHint.trim() : '';
  let contact = null;
  const cid = parseInt(contactId, 10);
  if (Number.isFinite(cid) && cid > 0) {
    contact = db.get(
      'SELECT name, typazh, notes FROM contacts WHERE id = ? AND telegram_user_id = ?',
      cid, tgUserId
    );
  }
  if (!contact && !hintRaw) return '';

  const parts = [];
  if (contact?.name) parts.push(sanitizeForPrompt(contact.name, 100));

  if (hintRaw) {
    parts.push(`типаж (указан игроком сейчас): ${typazhNameFor(hintRaw)} — ${typazhDescFor(hintRaw)}`);
  } else if (contact?.typazh) {
    parts.push(`типаж (из её карточки): ${typazhNameFor(contact.typazh)} — ${typazhDescFor(contact.typazh)}`);
  } else {
    parts.push('типаж не указан — определи сам по переписке');
  }

  let ctx = `Девушка: ${parts.filter(Boolean).join(', ') || 'без имени'}.`;
  if (contact?.notes) ctx += ` Заметки: ${sanitizeForPrompt(contact.notes, 300)}.`;
  return `${ctx}\n`;
}

function parseIntId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Best-effort: разрыв между последним таймштампом переписки и "сейчас".
function buildGapHint(text, nowTimeStr) {
  try {
    const stamps = [...String(text).matchAll(/\[(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/g)];
    if (!stamps.length) return '';
    const s = stamps[stamps.length - 1];
    const last = new Date(+s[3], +s[2] - 1, +s[1], +s[4], +s[5]);
    if (Number.isNaN(last.getTime())) return '';

    let now = null;
    let m = String(nowTimeStr).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) now = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
    else {
      m = String(nowTimeStr).match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
      if (m) now = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    }
    if (!now || Number.isNaN(now.getTime())) return '';

    const hours = (now.getTime() - last.getTime()) / 3600000;
    if (hours < 24) return '';
    const days = Math.max(1, Math.round(hours / 24));
    return `РАЗРЫВ ПО ВРЕМЕНИ: с последнего сообщения прошло ~${days} дн. Диалог остыл → РЕЖИМ ЗАХОДА ЗАНОВО (блок ВРЕМЯ, режим B/C): 9 ответов — это РАЗНЫЕ способы вернуться после паузы (свежий повод/история/новая тема/лёгкая интрига), а НЕ ответы на старые сообщения. НЕ переспрашивай то, что уже спрашивал и что проигнорили. НЕ "ты пропала?/живая?", без оправданий за паузу.`;
  } catch {
    return '';
  }
}

// ── Tone hints — добавляются в user message при выбранном стиле ──────────────
// Если tone не задан или 'auto' → пустая строка → промпт работает как раньше.
const TONE_HINTS = {
  friendly:  'СТИЛЬ ОТВЕТОВ (выбор игрока): ДРУЖЕЛЮБНО, без флирта. Все 9 вариантов — тёплое общение, искренний интерес к её темам, лёгкие шутки. БЕЗ комплиментов внешности, БЕЗ романтических намёков, БЕЗ тиза. Цель — поддержать диалог и углубить общение, а не флиртовать.',
  playful:   'СТИЛЬ ОТВЕТОВ (выбор игрока): ИГРИВО — лёгкая ирония, добрый тиз, ненавязчивая игра. Внутренняя уверенность чувствуется, но без открытого флирта. Подкалываем по-доброму, ловим её настроение, играем со словами. БЕЗ пошлости, БЕЗ агрессии.',
  flirty:    'СТИЛЬ ОТВЕТОВ (выбор игрока): ОТКРЫТЫЙ ФЛИРТ — явный романтический интерес. Намёки, тиз, контролируемая дерзость, инициативные ходы (намёк на встречу, на следующий шаг). НЕ пошло, но смело. Можно лёгкий комплимент, если он органичен.',
  confident: 'СТИЛЬ ОТВЕТОВ (выбор игрока): УВЕРЕННО — рамка лидера, спокойная инициатива. Сам предлагает темы и идеи, не оправдывается, не подстраивается под её настроение. Без сомнений в формулировках. Не агрессия, а лёгкая ведущая роль.',
};

function buildToneHint(tone) {
  if (typeof tone !== 'string') return { norm: null, text: '' };
  const key = tone.trim().toLowerCase();
  if (!TONE_HINTS[key]) return { norm: null, text: '' };
  return { norm: key, text: TONE_HINTS[key] };
}

// ── POST /api/v1/analysis/wing ────────────────────────────────────────────────
router.post('/wing', async (req, res) => {
  const { text, with_context = false, contact_id, user_profile, now_time, typazh_hint, tone } = req.body;
  if (!text?.trim())       return res.status(400).json({ ok: false, error: 'text обязателен' });
  if (text.length > MAX_TEXT_LEN)
    return res.status(400).json({ ok: false, error: `Текст не может быть длиннее ${MAX_TEXT_LEN} символов` });

  const nowTimeStr = (typeof now_time === 'string' && now_time.trim())
    ? now_time.trim().slice(0, 80)
    : new Date().toISOString().slice(0, 16).replace('T', ' ');

  const gapHint = buildGapHint(text, nowTimeStr);
  const hintNorm = (typeof typazh_hint === 'string' && typazh_hint.trim())
    ? typazh_hint.trim().slice(0, 200)
    : null;
  const { norm: toneNorm, text: toneText } = buildToneHint(tone);
  const toneBlock = toneText ? `${toneText}\n\n` : '';

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'wing')) return;

  const prompt = getPrompt('wing_analysis');
  if (!prompt) return res.status(500).json({ ok: false, error: `Промпт 'wing_analysis' не найден` });

  let contactTypazh = null;
  const cidForLookup = parseIntId(contact_id);
  if (cidForLookup) {
    const c = db.get('SELECT typazh FROM contacts WHERE id = ? AND telegram_user_id = ?', cidForLookup, req.tgUser.id);
    contactTypazh = c?.typazh || null;
  }

  // Идемпотентность по input_hash (см. RN-версию).
  // tone включён в hash → смена тона = новый анализ, не кэшированный.
  const inputHash = sha(`${normText(text)}|${contact_id || 'none'}|${with_context ? 1 : 0}|${hintNorm || ''}|${toneNorm || ''}`);
  const prior = db.get(
    `SELECT result FROM analysis_sessions
     WHERE telegram_user_id = ? AND input_hash = ?
     ORDER BY created_at DESC LIMIT 1`,
    req.tgUser.id, inputHash
  );

  let prevContext = '';
  if (with_context && contact_id) {
    const cid = parseIntId(contact_id);
    if (cid) {
      const history = db.all(
        `SELECT substr(input_text, 1, 400) AS snippet, created_at
         FROM analysis_sessions
         WHERE telegram_user_id = ? AND contact_id = ?
         ORDER BY created_at DESC
         LIMIT 3`,
        req.tgUser.id, cid
      );
      if (history.length) {
        prevContext = 'Предыдущие переписки (самые свежие):\n' +
          history.map((h, i) => `[${i + 1}] ${h.snippet}`).join('\n') + '\n\n';
      }
    }
  }

  const t0 = Date.now();

  if (prior) {
    try {
      const priorResult = JSON.parse(prior.result || '{}');
      // Per-user cache key (используем telegram_user_id — он стабилен и уникален)
      const regenKey = makeKey('wing-regen', { tg_user_id: req.tgUser.id, hash: inputHash, t: Math.floor(Date.now() / 3600000) });
      let newResponses = await getCached(regenKey);
      if (!newResponses) {
        const { content, usage, model } = await callAI({
          model: prompt.model,
          temperature: prompt.temperature,
          max_tokens: 1200,
          reasoning: 'low',
          systemPrompt: prompt.system_prompt,
          variables: {
            user_ctx: buildUserCtx(user_profile),
            girl_ctx: buildGirlCtx(req.tgUser.id, contact_id, hintNorm),
            now_time: nowTimeStr,
          },
          messages: [{
            role: 'user',
            content: `${prevContext}<conversation_history>
${text}
</conversation_history>

Сейчас: ${nowTimeStr}. Парси таймштампы [ДД.ММ.ГГГГ ЧЧ:ММ] если есть.${gapHint ? `\n\n${gapHint}` : ''}

${toneBlock}Это ПОВТОРНЫЙ запрос — нужны ТОЛЬКО новые 9 вариантов ответа на ту же ситуацию. Стратегия и сигналы остаются прежними.

ГЛАВНОЕ ПРАВИЛО: если диалог живой (разрыв < суток) — все 9 РЕАКЦИЯ на ПОСЛЕДНЕЕ сообщение (или последнюю содержательную её реплику если последнее — мусор типа ок/ага), не цепляйся за середину. ЕСЛИ с последнего сообщения прошли СУТКИ И БОЛЬШЕ — НЕ отвечай на старое: 9 вариантов = разные способы ЗАЙТИ ЗАНОВО (свежий повод/тема/крючок), не переспрашивай проигнорированный вопрос, без "ты пропала?/живая?".

${toneText ? 'Все 9 — В РАМКАХ ВЫБРАННОГО СТИЛЯ выше, но различаются по углу/энергии/длине/триггеру. Живой мессенджерный стиль с переносами \\n, 3-12 слов.' : 'Все 9 разные ПО ТОНУ: тёплый, зеркало, подхват, догадка, инициатива, лидерская рамка, переворот, троллинг, намёк-крючок. Живой мессенджерный стиль с переносами \\n, 3-12 слов.'}

Верни ТОЛЬКО JSON: {"responses": [{"text":"...","why":"почему работает: в живом режиме - цитата ПОСЛЕДНЕЙ её фразы; в режиме захода заново - повод захода"}, ... 9 штук]}.`,
          }],
        });
        logAICall({ endpoint: '/analysis/wing[regen]', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });
        let parsed;
        try { parsed = parseAIJson(content); } catch (_) { parsed = { responses: priorResult.responses || [] }; }
        const validated = validateWingResult(parsed);
        newResponses = validated.responses.length ? validated.responses : (priorResult.responses || []);
        await setCached(regenKey, newResponses, 3600);
      }
      const merged = { ...priorResult, responses: newResponses };
      const { lastInsertRowid } = db.run(
        `INSERT INTO analysis_sessions (telegram_user_id, contact_id, input_text, with_context, result, score, mood, input_hash, typazh_hint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        req.tgUser.id, contact_id ?? null, truncStored(text), with_context ? 1 : 0,
        JSON.stringify(merged), priorResult.score ?? null, priorResult.mood ?? null, inputHash, hintNorm
      );
      return res.json({
        ok: true,
        session_id: lastInsertRowid,
        result: merged,
        idempotent: true,
        contact_typazh: contactTypazh,
        typazh_hint: hintNorm,
      });
    } catch (err) {
      console.warn('[wing] idempotent regen failed, falling back:', err.message);
    }
  }

  try {
    const { content, usage, model } = await callAI({
      model:       prompt.model,
      temperature: prompt.temperature,
      max_tokens:  Math.max(prompt.max_tokens, 3000),
      reasoning:   'low',
      systemPrompt: prompt.system_prompt,
      variables: {
        user_ctx: buildUserCtx(user_profile),
        girl_ctx: buildGirlCtx(req.tgUser.id, contact_id, hintNorm),
        now_time: nowTimeStr,
      },
      messages: [{
        role: 'user',
        content: `${prevContext}<conversation_history>
${text}
</conversation_history>

Сейчас: ${nowTimeStr}. Парси таймштампы [ДД.ММ.ГГГГ ЧЧ:ММ] если есть.${gapHint ? `\n\n${gapHint}` : ''}

${toneBlock}ШАГ 1. Найди в conversation_history САМОЕ ПОСЛЕДНЕЕ сообщение и его автора. Заполни context_read.last_speaker ("she" если её, "he" если парня) и entry_type ("reply" если разрыв < суток, "resume" если с последнего сообщения прошли сутки и больше).
ШАГ 2. Если её последняя реплика — короткий мусор (ок/ага/+/одиночный смайл/хм) — для генерации ответов опирайся на её ПОСЛЕДНЮЮ СОДЕРЖАТЕЛЬНУЮ реплику перед мусором (но last_speaker всё равно отражает фактически последнее).
ШАГ 3. Заполни schema: score, mood, engagement, trust, sentiment, context_read (last_speaker, hours_since_her_last, her_mood, entry_type), girl_typazh_description (2-3 предл.), signals (наблюдения по ПОСЛЕДНЕЙ реплике в первую очередь), strategy (КАК отвечать на ПОСЛЕДНЮЮ — не пересказ диалога), responses (РОВНО 9 живых мессенджерных реплик с переносами \\n), media_hint (null если нет всех 5 условий), summary.${toneText ? '\nШАГ 3a. Все 9 responses[].text — В РАМКАХ ВЫБРАННОГО СТИЛЯ выше. Различаются по углу/энергии/длине/триггеру, но НЕ выпрыгивают из выбранного стиля.' : ''}

ГЛАВНОЕ ПРАВИЛО (живой диалог, разрыв < суток): все 9 responses[].text — РЕАКЦИЯ СТРОГО на ПОСЛЕДНЕЕ сообщение в conversation_history (или на последнюю содержательную её реплику если последнее — мусор). Контекст истории — только для тона, типажа и понимания паттерна, НЕ как тема ответа. Любой из 9 ответов цепляющийся за реплику из середины при наличии свежей = ПРОВАЛ ЗАДАЧИ. ИСКЛЮЧЕНИЕ: если разрыв ≥ суток — работает блок ВРЕМЯ (режим захода заново): 9 ответов не отвечают на старое, а заходят заново свежим поводом; проигнорированный вопрос не переспрашивать.

Пиши как живой пацан, а не как AI. Ответь ТОЛЬКО чистым JSON.`,
      }],
    });
    logAICall({ endpoint: '/analysis/wing', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); }
    catch (_) { result = null; }
    result = validateWingResult(result);

    const { lastInsertRowid } = db.run(
      `INSERT INTO analysis_sessions (telegram_user_id, contact_id, input_text, with_context, result, score, mood, input_hash, typazh_hint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.tgUser.id, contact_id ?? null, truncStored(text), with_context ? 1 : 0,
      JSON.stringify(result), result.score ?? null, result.mood ?? null, inputHash, hintNorm
    );
    res.json({
      ok: true,
      session_id: lastInsertRowid,
      result,
      contact_typazh: contactTypazh,
      typazh_hint: hintNorm,
    });
  } catch (err) {
    logAICall({ endpoint: '/analysis/wing', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[wing]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка анализа. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/analysis/rejection ──────────────────────────────────────────
router.post('/rejection', async (req, res) => {
  const { text, user_profile, now_time } = req.body;
  const nowTimeStr = (typeof now_time === 'string' && now_time.trim())
    ? now_time.trim().slice(0, 80)
    : new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text обязателен' });
  if (text.length > MAX_TEXT_LEN)
    return res.status(400).json({ ok: false, error: `Текст не может быть длиннее ${MAX_TEXT_LEN} символов` });

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'rejection')) return;

  const prompt = getPrompt('rejection_analysis');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('rejection', {
    tg_user_id: req.tgUser.id, text: normText(text),
    age: user_profile?.age, exp: user_profile?.experience,
    model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    db.run(`INSERT INTO rejection_analyses (telegram_user_id, input_text, result) VALUES (?, ?, ?)`,
      req.tgUser.id, truncStored(text), JSON.stringify(cached));
    return res.json({ ok: true, result: cached, cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'low',
      systemPrompt: prompt.system_prompt,
      variables: { user_ctx: buildUserCtx(user_profile), now_time: nowTimeStr },
      messages: [{ role: 'user', content: `Неудачная переписка:\n\n${text}\n\nОтветь ТОЛЬКО чистым JSON без markdown и без пояснений.` }],
    });
    logAICall({ endpoint: '/analysis/rejection', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateRejectionResult(result);

    await setCached(cacheKey, result);
    db.run(`INSERT INTO rejection_analyses (telegram_user_id, input_text, result) VALUES (?, ?, ?)`,
      req.tgUser.id, truncStored(text), JSON.stringify(result));
    res.json({ ok: true, result });
  } catch (err) {
    logAICall({ endpoint: '/analysis/rejection', model: prompt.model, duration: Date.now() - t0, error: err.message });
    res.status(500).json({ ok: false, error: 'Ошибка анализа. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/analysis/support ────────────────────────────────────────────
router.post('/support', async (req, res) => {
  const { situation_text, tags = [], with_context = false } = req.body;
  if (!situation_text?.trim()) return res.status(400).json({ ok: false, error: 'situation_text обязателен' });
  if (situation_text.length > MAX_SUPPORT_LEN)
    return res.status(400).json({ ok: false, error: `Текст не может быть длиннее ${MAX_SUPPORT_LEN} символов` });
  if (!Array.isArray(tags) || tags.length > 20)
    return res.status(400).json({ ok: false, error: 'tags: массив до 20 элементов' });

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'support')) return;

  const prompt = getPrompt('support_advice');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт support_advice не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('support', {
    tg_user_id: req.tgUser.id, sit: normText(situation_text),
    tags: [...tags].sort().join(','), model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.json({ ok: true, responses: cached.responses || [], dont_say: cached.dont_say || '', cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'off',
      systemPrompt: prompt.system_prompt,
      variables: {
        situation: situation_text.trim(),
        tags:      tags.length ? tags.slice(0, 20).join(', ') : 'не указаны',
      },
      messages: [{ role: 'user', content: 'Сгенерируй РОВНО 9 вариантов поддержки. Ответь ТОЛЬКО чистым JSON без markdown и без пояснений.' }],
    });
    logAICall({ endpoint: '/analysis/support', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateSupportResult(result);

    await setCached(cacheKey, result);
    res.json({ ok: true, responses: result.responses, dont_say: result.dont_say });
  } catch (err) {
    logAICall({ endpoint: '/analysis/support', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[support]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/analysis/quick-reply ────────────────────────────────────────
router.post('/quick-reply', async (req, res) => {
  const { last_message, user_profile } = req.body;
  if (!last_message?.trim())  return res.status(400).json({ ok: false, error: 'last_message обязателен' });
  if (last_message.length > 1_000)
    return res.status(400).json({ ok: false, error: 'last_message не может быть длиннее 1000 символов' });

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'quick_reply')) return;

  const prompt = getPrompt('quick_reply');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт quick_reply не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('quick-reply', {
    tg_user_id: req.tgUser.id, msg: normText(last_message),
    age: user_profile?.age, exp: user_profile?.experience,
    model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.json({ ok: true, replies: cached.replies || [], cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'off',
      systemPrompt: prompt.system_prompt,
      variables: { user_ctx: buildUserCtx(user_profile) },
      messages: [{ role: 'user', content: `Сообщение девушки: "${last_message.trim()}"\n\nДай 5 вариантов ответа. Ответь ТОЛЬКО чистым JSON без markdown.` }],
    });
    logAICall({ endpoint: '/analysis/quick-reply', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateQuickReplyResult(result);
    await setCached(cacheKey, result, 24 * 3600);
    res.json({ ok: true, replies: result.replies });
  } catch (err) {
    logAICall({ endpoint: '/analysis/quick-reply', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[quick-reply]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/analysis/reboot ─────────────────────────────────────────────
router.post('/reboot', async (req, res) => {
  const { last_chat, days_silence = 3, user_profile } = req.body;
  if (!last_chat?.trim()) return res.status(400).json({ ok: false, error: 'last_chat обязателен' });
  if (last_chat.length > MAX_TEXT_LEN)
    return res.status(400).json({ ok: false, error: `last_chat не может быть длиннее ${MAX_TEXT_LEN} символов` });
  const days = Math.min(90, Math.max(1, parseInt(days_silence, 10) || 3));

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'reboot')) return;

  const prompt = getPrompt('reboot_silence');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт reboot_silence не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('reboot', {
    tg_user_id: req.tgUser.id, chat: normText(last_chat), days,
    age: user_profile?.age, exp: user_profile?.experience,
    model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.json({ ok: true, result: cached, cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      systemPrompt: prompt.system_prompt,
      variables: {
        user_ctx:      buildUserCtx(user_profile),
        days_silence:  String(days),
        last_chat:     last_chat.trim(),
      },
      messages: [{ role: 'user', content: 'Дай 5 сообщений для разморозки молчания. Ответь ТОЛЬКО чистым JSON без markdown.' }],
    });
    logAICall({ endpoint: '/analysis/reboot', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateRebootResult(result);
    await setCached(cacheKey, result);
    res.json({ ok: true, result });
  } catch (err) {
    logAICall({ endpoint: '/analysis/reboot', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[reboot]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/analysis/date-invite ────────────────────────────────────────
router.post('/date-invite', async (req, res) => {
  const { last_chat, city = '', user_profile } = req.body;
  if (!last_chat?.trim()) return res.status(400).json({ ok: false, error: 'last_chat обязателен' });
  if (last_chat.length > MAX_TEXT_LEN)
    return res.status(400).json({ ok: false, error: `last_chat не может быть длиннее ${MAX_TEXT_LEN} символов` });
  if (city && city.length > MAX_CITY_LEN)
    return res.status(400).json({ ok: false, error: `city не более ${MAX_CITY_LEN} символов` });

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'date_invite')) return;

  const prompt = getPrompt('date_invite');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт date_invite не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('date-invite', {
    tg_user_id: req.tgUser.id, chat: normText(last_chat), city: normText(city),
    age: user_profile?.age, exp: user_profile?.experience,
    model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.json({ ok: true, result: cached, cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      systemPrompt: prompt.system_prompt,
      variables: {
        user_ctx:  buildUserCtx(user_profile),
        last_chat: last_chat.trim(),
        city:      city?.trim() || 'не указан',
      },
      messages: [{ role: 'user', content: 'Дай 5 вариантов приглашения на свидание. Ответь ТОЛЬКО чистым JSON без markdown.' }],
    });
    logAICall({ endpoint: '/analysis/date-invite', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateDateInviteResult(result);
    await setCached(cacheKey, result);
    res.json({ ok: true, result });
  } catch (err) {
    logAICall({ endpoint: '/analysis/date-invite', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[date-invite]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/analysis/style-shift ────────────────────────────────────────
router.post('/style-shift', async (req, res) => {
  const { chat, user_profile } = req.body;
  if (!chat?.trim())  return res.status(400).json({ ok: false, error: 'chat обязателен' });
  if (chat.length > MAX_TEXT_LEN)
    return res.status(400).json({ ok: false, error: `chat не может быть длиннее ${MAX_TEXT_LEN} символов` });

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'style_shift')) return;

  const prompt = getPrompt('style_shift');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт style_shift не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('style-shift', {
    tg_user_id: req.tgUser.id, chat: normText(chat),
    age: user_profile?.age, exp: user_profile?.experience,
    model: prompt.model,
  });
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.json({ ok: true, result: cached, cached: true });
  }
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      systemPrompt: prompt.system_prompt,
      variables: {
        user_ctx: buildUserCtx(user_profile),
        chat:     chat.trim(),
      },
      messages: [{ role: 'user', content: 'Диагностируй стиль и предложи смену. Ответь ТОЛЬКО чистым JSON без markdown.' }],
    });
    logAICall({ endpoint: '/analysis/style-shift', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateStyleShiftResult(result);
    await setCached(cacheKey, result);
    res.json({ ok: true, result });
  } catch (err) {
    logAICall({ endpoint: '/analysis/style-shift', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[style-shift]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации. Попробуй ещё раз.' });
  }
});

// ── GET /api/v1/analysis/history ─────────────────────────────────────────────
router.get('/history', (req, res) => {
  const sessions = db.all(
    `SELECT id, contact_id, score, mood, created_at, substr(input_text,1,100) as preview
     FROM analysis_sessions WHERE telegram_user_id = ? ORDER BY created_at DESC LIMIT 20`,
    req.tgUser.id
  );
  res.json({ ok: true, sessions });
});

export default router;
