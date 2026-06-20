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

// ── Давность знакомства (слайдер на экране) → калибровка рапорта для ОТВЕТОВ ──
// Влияет только на тон/смелость responses; анализ (score/mood/signals) не трогает.
const ACQ_HINTS = {
  min30: 'ДАВНОСТЬ ЗНАКОМСТВА: только списались (~30 минут). Рапорта почти нет — ответы проще и теплее, без фамильярности, без тяжёлого флирта, рано лезть в личное.',
  h2:    'ДАВНОСТЬ ЗНАКОМСТВА: пара часов. Ещё прощупываете друг друга — лёгкое тепло, без перебора в близость.',
  today: 'ДАВНОСТЬ ЗНАКОМСТВА: общаетесь сегодня, первый день. Можно живее и игривее, но глубокую близость не изображай.',
  days:  'ДАВНОСТЬ ЗНАКОМСТВА: пара дней. Есть ниточка — тёплый подкол, лёгкий флирт, отсылки к тому, что уже обсуждали, уместны.',
  week:  'ДАВНОСТЬ ЗНАКОМСТВА: около недели. Рапорт есть — свободнее, общие шутки и инсайды ок, флирт уместен.',
  weeks: 'ДАВНОСТЬ ЗНАКОМСТВА: 2-3 недели. Уже близко — можно прямее, тёплый флирт, звать куда-то естественно.',
  month: 'ДАВНОСТЬ ЗНАКОМСТВА: месяц и больше, почти свои. По-свойски, прямо, с заботой и уверенным флиртом; встречи предлагать без церемоний.',
};
function buildAcqBlock(acquaintance) {
  if (typeof acquaintance !== 'string') return { norm: null, block: '' };
  const key = acquaintance.trim().toLowerCase();
  if (!ACQ_HINTS[key]) return { norm: null, block: '' };
  return { norm: key, block: ACQ_HINTS[key] };
}

// ── Цель на девушку (селектор) → стратегическая рамка ответов (оба режима) ────
const GOAL_HINTS = {
  chat:         'ЦЕЛЬ С НЕЙ: просто общение — поддержать диалог, узнавать её, легко и тепло. Флирт минимальный, не дожимать.',
  friends:      'ЦЕЛЬ С НЕЙ: по-дружески — тёплое приятельское общение, БЕЗ флирта и романтических намёков.',
  flirt:        'ЦЕЛЬ С НЕЙ: флирт/симпатия — показывай интерес, лёгкий тиз и намёки, держи игривость.',
  closer:       'ЦЕЛЬ С НЕЙ: сблизиться — постепенная эскалация близости, теплее и смелее, личные темы уместны.',
  date:         'ЦЕЛЬ С НЕЙ: позвать на свидание — веди к встрече: мостики к оффлайну, при удобном моменте мягкое приглашение-констатация.',
  relationship: 'ЦЕЛЬ С НЕЙ: отношения — узнавай глубже, искренний интерес к её миру, инвестируй, без спешки в близость.',
};
function buildGoalHint(goal) {
  if (typeof goal !== 'string') return { norm: null, block: '' };
  const key = goal.trim().toLowerCase();
  if (!GOAL_HINTS[key]) return { norm: null, block: '' };
  return { norm: key, block: GOAL_HINTS[key] };
}

// Гарантия контраста подачи: модель любит дробить ВСЕ ответы на 2-3 пузыря.
// Схлопываем самые короткие разбитые (text с \n) в одну строку, пока не
// наберётся минимум minSingle одиночных «коротких выстрелов». Работает поверх
// промпта И кэша (применяется при отдаче). Массив копируем — кэш не мутируем.
function enforceBubbleBalance(responses, minSingle = 3) {
  if (!Array.isArray(responses) || responses.length <= minSingle) return responses;
  const out = responses.slice();
  const hasBreak = (r) => typeof r?.text === 'string' && r.text.includes('\n');
  let singles = out.filter(r => !hasBreak(r)).length;
  if (singles >= minSingle) return out;
  const splitOrder = out
    .map((r, i) => ({ i, len: (r && r.text ? r.text.length : 0), split: hasBreak(r) }))
    .filter(x => x.split)
    .sort((a, b) => a.len - b.len);
  for (const { i } of splitOrder) {
    if (singles >= minSingle) break;
    out[i] = { ...out[i], text: String(out[i].text).split('\n').map(s => s.trim()).filter(Boolean).join(' ') };
    singles++;
  }
  return out;
}

// ── POST /api/v1/analysis/wing ────────────────────────────────────────────────
router.post('/wing', async (req, res) => {
  const { text, with_context = false, contact_id, user_profile, now_time, typazh_hint, tone, acquaintance, goal, no_analysis = false } = req.body;
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
  const { norm: acqNorm, block: acqBlock } = buildAcqBlock(acquaintance);
  const acqLine = acqBlock ? `\n\n${acqBlock}` : '';
  const { norm: goalNorm, block: goalBlock } = buildGoalHint(goal);
  const goalLine = goalBlock
    ? `\n\n${goalBlock}\nЦель — это НАПРАВЛЕНИЕ, а не задача на одно сообщение. Веди к ней ПОСТЕПЕННО: шаг подбирай под текущий момент диалога и под то, сколько вы знакомы. НЕ форсируй и не дожимай раньше времени — если ещё рано или она прохладна, просто двинь на ОДИН шаг ближе к цели, а не прыгай к финалу.`
    : '';

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'wing')) return;

  // ── Режим БЕЗ анализа: короткий промпт wing_quick_mix, только 9 ответов ──────
  if (no_analysis) {
    const qp = getPrompt('wing_quick_mix');
    if (!qp) return res.status(500).json({ ok: false, error: `Промпт 'wing_quick_mix' не найден` });
    const t0q = Date.now();
    try {
      const { content, usage, model } = await callAI({
        model: qp.model,
        temperature: qp.temperature,
        max_tokens: Math.max(qp.max_tokens, 1400),
        reasoning: 'off',
        systemPrompt: qp.system_prompt,
        variables: { user_ctx: buildUserCtx(user_profile) },
        messages: [{
          role: 'user',
          content: `<conversation_history>\n${text}\n</conversation_history>\n\nСейчас: ${nowTimeStr}.${gapHint ? `\n\n${gapHint}` : ''}${acqLine}${goalLine}\n\nБЕЗ анализа. Сам определи лучший ход под последнее её сообщение. Верни ТОЛЬКО JSON: {"responses":[{"badge":"дружелюбный|игривый|флирт|уверенный|универсальный","text":"...","why":"коротко по смыслу"}, ... РОВНО 9; среди них 2-3 — вопрос ей]}.`,
        }],
      });
      logAICall({ endpoint: '/analysis/wing[quick]', model, tokens: usage?.total_tokens, duration: Date.now() - t0q });
      let parsed; try { parsed = parseAIJson(content); } catch (_) { parsed = null; }
      const validated = validateWingResult(parsed);
      const result = { score: null, mood: null, responses: enforceBubbleBalance(validated.responses || []), summary: '', is_quick_reply: false };
      const { lastInsertRowid } = db.run(
        `INSERT INTO analysis_sessions (telegram_user_id, contact_id, input_text, with_context, result, score, mood, input_hash, typazh_hint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        req.tgUser.id, parseIntId(contact_id) ?? null, truncStored(text), 0,
        JSON.stringify(result), null, null, sha(`${normText(text)}|noanalysis|${acqNorm || ''}`), hintNorm
      );
      return res.json({ ok: true, session_id: lastInsertRowid, result, no_analysis: true, contact_typazh: null, typazh_hint: hintNorm });
    } catch (err) {
      logAICall({ endpoint: '/analysis/wing[quick]', model: qp.model, duration: Date.now() - t0q, error: err.message });
      console.error('[wing quick]', err.message);
      return res.status(500).json({ ok: false, error: 'Ошибка. Попробуй ещё раз.' });
    }
  }

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
  const inputHash = sha(`${normText(text)}|${contact_id || 'none'}|${with_context ? 1 : 0}|${hintNorm || ''}|${toneNorm || ''}|${acqNorm || ''}|${goalNorm || ''}`);
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

Сейчас: ${nowTimeStr}. Парси таймштампы [ДД.ММ.ГГГГ ЧЧ:ММ] если есть.${gapHint ? `\n\n${gapHint}` : ''}${acqLine}${goalLine}

Это ПОВТОРНЫЙ запрос — нужны ТОЛЬКО новые 9 вариантов ответа на ту же ситуацию. Стратегия и сигналы прежние.

ЧИТАЙ СУТЬ, не отдельные слова: реагируй на СМЫСЛ её последнего хода и вайб. Грубое словцо в шутку — её юмор, не тема; «ахаха»/смайл — ей хорошо, подхвати волну, не долби слово из середины. Живой диалог (<суток) — на последний ход; разрыв ≥ суток — заход заново (свежий повод, без "ты пропала?/живая?").

СОСТАВ 9 (поле badge): 2 «дружелюбный», 2 «игривый», 2 «флирт», 2 «уверенный», 1 «универсальный». Среди 9 минимум 2-3 — ВОПРОС ей (узнать/продвинуть тему), остальные реакции/заходы; разные по ходу. Каждый в своём тоне, по смыслу, под ЦЕЛЬ. ФОРМАТ: РОВНО 3-4 из 9 — одной строкой без \\n (короткие), остальные 5-6 разбей на 2-3 сообщения через \\n (изредка 3). Разбивать ВСЕ 9 нельзя. При заходе заново не дроби.

Верни ТОЛЬКО JSON: {"responses": [{"badge":"дружелюбный|игривый|флирт|уверенный|универсальный","text":"...","why":"коротко почему зайдёт по смыслу"}, ... ровно 9]}.`,
          }],
        });
        logAICall({ endpoint: '/analysis/wing[regen]', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });
        let parsed;
        try { parsed = parseAIJson(content); } catch (_) { parsed = { responses: priorResult.responses || [] }; }
        const validated = validateWingResult(parsed);
        newResponses = validated.responses.length ? validated.responses : (priorResult.responses || []);
        await setCached(regenKey, newResponses, 3600);
      }
      const merged = { ...priorResult, responses: enforceBubbleBalance(newResponses) };
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

Сейчас: ${nowTimeStr}. Парси таймштампы [ДД.ММ.ГГГГ ЧЧ:ММ] если есть.${gapHint ? `\n\n${gapHint}` : ''}${acqLine}${goalLine}

ШАГ 1. Найди в conversation_history САМОЕ ПОСЛЕДНЕЕ сообщение и его автора. Заполни context_read.last_speaker ("she" если её, "he" если парня) и entry_type ("reply" если разрыв < суток, "resume" если с последнего сообщения прошли сутки и больше).
ШАГ 2. Если её последняя реплика — короткий мусор (ок/ага/+/одиночный смайл/хм/ахаха) — это РЕАКЦИЯ. Подхвати её настрой и веди дальше; НЕ возвращайся долбить провокационное слово из середины. Опирайся на смысл, а не на выдернутое слово.
ШАГ 3. Заполни schema: score, mood, engagement, trust, sentiment, context_read (last_speaker, hours_since_her_last, her_mood, entry_type), girl_typazh_description (2-3 предл.), signals, strategy (НАЧНИ с «Сейчас лучший ход: X», где X — спросить / вытащить из неловкости / флирт / звать на встречу / поддержать вайб / сменить тему; затем коротко КАК; не пересказ), responses (РОВНО 9, у КАЖДОГО поле badge; состав тонов: 2 «дружелюбный», 2 «игривый», 2 «флирт», 2 «уверенный», 1 «универсальный»; ПРИ ЭТОМ среди 9 минимум 2-3 — это ВОПРОС ей (узнать о ней / продвинуть тему), остальные реакции/заходы; ответы разные по ХОДУ, не однотипные; каждый — по СМЫСЛУ её хода и под ЦЕЛЬ, в своём тоне, живой мессенджер; подача — по правилу ФОРМАТ ниже), media_hint (null если нет всех 5 условий), summary.

ФОРМАТ ПОДАЧИ (ВАЖНО, проверь перед выдачей): РОВНО 3-4 ответа из 9 оставь ОДНОЙ строкой без \\n (короткие хлёсткие выстрелы). Остальные 5-6 разбей на 2-3 коротких сообщения через \\n (изредка 3, если мысль правда в несколько заходов). РАЗБИВАТЬ ВСЕ 9 НЕЛЬЗЯ: если у каждого ответа есть \\n — это ошибка, верни 3-4 из них в одну строку. При заходе заново (разрыв ≥ суток) НЕ дроби вообще.

ГЛАВНОЕ ПРАВИЛО (живой диалог, разрыв < суток): все 9 responses[].text — РЕАКЦИЯ СТРОГО на ПОСЛЕДНЕЕ сообщение в conversation_history (или на последнюю содержательную её реплику если последнее — мусор). Контекст истории — только для тона, типажа и понимания паттерна, НЕ как тема ответа. Любой из 9 ответов цепляющийся за реплику из середины при наличии свежей = ПРОВАЛ ЗАДАЧИ. ИСКЛЮЧЕНИЕ: если разрыв ≥ суток — работает блок ВРЕМЯ (режим захода заново): 9 ответов не отвечают на старое, а заходят заново свежим поводом; проигнорированный вопрос не переспрашивать.

Пиши как живой пацан, а не как AI. Ответь ТОЛЬКО чистым JSON.`,
      }],
    });
    logAICall({ endpoint: '/analysis/wing', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); }
    catch (_) { result = null; }
    result = validateWingResult(result);
    result.responses = enforceBubbleBalance(result.responses);

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
  const { situation_text, tags = [], with_context = false, need, about, since, closeness } = req.body;
  if (!situation_text?.trim()) return res.status(400).json({ ok: false, error: 'situation_text обязателен' });
  if (situation_text.length > MAX_SUPPORT_LEN)
    return res.status(400).json({ ok: false, error: `Текст не может быть длиннее ${MAX_SUPPORT_LEN} символов` });
  if (!Array.isArray(tags) || tags.length > 20)
    return res.status(400).json({ ok: false, error: 'tags: массив до 20 элементов' });

  // Опциональные подсказки-чипы с экрана — калибруют тон/режим поддержки.
  // Каждое поле короткое (значение из фикс-набора), но юзер мог прислать что
  // угодно — режем до 60 символов и санитизируем.
  const hintField = (v) => (typeof v === 'string' && v.trim()) ? sanitizeForPrompt(v.trim(), 60) : '';
  const needN  = hintField(need);
  const aboutN = hintField(about);
  const sinceN = hintField(since);
  const closeN = hintField(closeness);
  const hintLines = [];
  if (needN)  hintLines.push(`Что ей сейчас нужнее: ${needN}`);
  if (aboutN) hintLines.push(`Ситуация про: ${aboutN}`);
  if (sinceN) hintLines.push(`Давность: ${sinceN}`);
  if (closeN) hintLines.push(`Кто она пользователю: ${closeN}`);
  const userHints = hintLines.length ? hintLines.join('\n') : 'не указаны';

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'support')) return;

  const prompt = getPrompt('support_advice');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт support_advice не найден' });

  const t0 = Date.now();
  const cacheKey = makeKey('support', {
    tg_user_id: req.tgUser.id, sit: normText(situation_text),
    tags: [...tags].sort().join(','),
    hints: `${needN}|${aboutN}|${sinceN}|${closeN}`,
    model: prompt.model,
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
        situation:  situation_text.trim(),
        tags:       tags.length ? tags.slice(0, 20).join(', ') : 'не указаны',
        user_hints: userHints,
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
