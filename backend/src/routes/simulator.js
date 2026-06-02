// ═══════════════════════════════════════════════════════════════
// Simulator router (TMA).
// /start /message /finish /analyze /hints /ai-girl
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import crypto from 'crypto';
import db, { upsertUserFromInitData } from '../db/index.js';
import { callAI, parseAIJson } from '../services/polza.js';
import { validateSimulatorResult } from '../utils/aiSchemas.js';
import { logAICall } from '../middleware/logger.js';
import { checkAndIncrementLimit } from '../utils/limits.js';
import { typazhDescFor, typazhNameFor, typazhWarmupFor } from '../utils/typazhes.js';

const router = Router();

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

/** Безопасный JSON.parse — возвращает fallback при битом JSON. */
function safeParse(raw, fallback) {
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

function stripStageDirections(text) {
  if (!text) return '';
  let out = String(text)
    .replace(/\*[^*\n]{0,80}\*/g, ' ')
    .replace(/\([^()\n]*[А-Яа-яЁё]{3,}[^()\n]*\)/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.!?…])/g, '$1')
    .trim();
  if (!out) out = String(text).replace(/[*()]/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  return out || String(text).trim();
}

function ensureUser(req) {
  const { user } = upsertUserFromInitData(req.tgUser, req.startParam);
  return user;
}

const getPrompt = (key) => db.get('SELECT * FROM prompts WHERE key = ? AND is_active = 1', key);

const MAX_MSG_LEN = 1_000;

function moodDescForDifficulty(d) {
  if (d <= 3)  return 'дружелюбно, открыто, с интересом к парню';
  if (d <= 6)  return 'ровно, нейтрально, без явного тепла или холода';
  if (d <= 8)  return 'сдержанно, короткие ответы, требует заинтересовать';
  return 'односложно, часто игнорирует, холодно — почти не хочет общаться';
}

function parseIntId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── POST /api/v1/simulator/start ─────────────────────────────────────────────
router.post('/start', (req, res) => {
  const { typazh, place, difficulty = 5 } = req.body;
  if (!typazh?.trim() || !place?.trim())
    return res.status(400).json({ ok: false, error: 'typazh и place обязательны' });
  if (typazh.length > 100 || place.length > 100)
    return res.status(400).json({ ok: false, error: 'typazh/place: максимум 100 символов' });

  const diff = Math.min(10, Math.max(1, parseInt(difficulty, 10) || 5));

  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res, 'simulator')) return;

  const { lastInsertRowid } = db.run(
    `INSERT INTO simulator_sessions (telegram_user_id, typazh, place, difficulty, messages) VALUES (?, ?, ?, ?, '[]')`,
    req.tgUser.id, typazh.trim(), place.trim(), diff
  );
  res.json({ ok: true, session_id: lastInsertRowid });
});

// ── POST /api/v1/simulator/message ───────────────────────────────────────────
router.post('/message', async (req, res) => {
  const { session_id, message } = req.body;
  if (!session_id || !message?.trim())
    return res.status(400).json({ ok: false, error: 'session_id и message обязательны' });
  if (message.length > MAX_MSG_LEN)
    return res.status(400).json({ ok: false, error: `Сообщение не может быть длиннее ${MAX_MSG_LEN} символов` });

  const sid = parseIntId(session_id);
  if (!sid) return res.status(400).json({ ok: false, error: 'session_id должен быть числом' });

  const session = db.get('SELECT * FROM simulator_sessions WHERE id = ? AND telegram_user_id = ?', sid, req.tgUser.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Сессия не найдена' });

  const prompt = getPrompt('simulator_chat');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт симулятора не найден' });

  const history = safeParse(session.messages, []);
  const t0 = Date.now();
  try {
    const aiMessages = [
      ...history.map(m => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: message },
    ];
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'off',
      systemPrompt: prompt.system_prompt,
      variables: {
        typazh:         typazhNameFor(session.typazh),
        typazh_desc:    typazhDescFor(session.typazh),
        place:          session.place,
        mood_desc:      moodDescForDifficulty(session.difficulty),
        warmup_rounds:  String(typazhWarmupFor(session.typazh)),
        round_number:   String(history.length / 2 + 1),
      },
      messages: aiMessages,
    });
    logAICall({ endpoint: '/simulator/message', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let girlResponse = stripStageDirections(content);
    const prevHer = [...history].reverse().find(m => m.from === 'her');
    if (prevHer && /\)+\s*$/.test(prevHer.text) && /\)+\s*$/.test(girlResponse)) {
      girlResponse = girlResponse.replace(/[)\s]+$/, '').trimEnd() || girlResponse;
    }
    const updatedHistory = [...history, { from: 'me', text: message }, { from: 'her', text: girlResponse }];
    db.run('UPDATE simulator_sessions SET messages = ? WHERE id = ?', JSON.stringify(updatedHistory), sid);
    res.json({ ok: true, response: girlResponse, messages: updatedHistory });
  } catch (err) {
    logAICall({ endpoint: '/simulator/message', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[simulator/message]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка ответа. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/simulator/finish ────────────────────────────────────────────
router.post('/finish', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id)
    return res.status(400).json({ ok: false, error: 'session_id обязателен' });

  const sid = parseIntId(session_id);
  if (!sid) return res.status(400).json({ ok: false, error: 'session_id должен быть числом' });

  const session = db.get('SELECT * FROM simulator_sessions WHERE id = ? AND telegram_user_id = ?', sid, req.tgUser.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Сессия не найдена' });

  const history = safeParse(session.messages, []);
  if (history.length < 2)
    return res.status(400).json({ ok: false, error: 'Слишком короткий диалог для анализа' });

  // Идемпотентность: тот же диалог уже разбирали — отдаём кешированный результат
  const msgHash = sha(JSON.stringify(history));
  if (session.result_json && session.result_hash === msgHash) {
    try {
      const cached = JSON.parse(session.result_json);
      return res.json({ ok: true, result: cached, session_id: sid, cached: true });
    } catch (_) { /* битый кеш — пересчитаем ниже */ }
  }

  // Новый разбор — теперь списываем лимит
  const user = ensureUser(req);
  if (!checkAndIncrementLimit(user, res)) return;

  const prompt = getPrompt('simulator_result');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт результата не найден' });

  const dialogText = history
    .map(m => `${m.from === 'me' ? 'Ты' : session.typazh}: ${m.text}`)
    .join('\n');

  const t0 = Date.now();
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'low',
      systemPrompt: prompt.system_prompt,
      messages: [{ role: 'user', content: `Симуляция (${session.typazh}, ${session.place}, сложность ${session.difficulty}):\n\n${dialogText}\n\nОтветь ТОЛЬКО чистым JSON без markdown и без пояснений.` }],
    });
    logAICall({ endpoint: '/simulator/finish', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); } catch (_) { result = null; }
    result = validateSimulatorResult(result);

    const wasCompleted = session.completed;
    db.run(
      'UPDATE simulator_sessions SET completed = 1, score = ?, result_json = ?, result_hash = ? WHERE id = ?',
      result.score, JSON.stringify(result), msgHash, sid
    );
    // H3 — PII hygiene: после успешного анализа очищаем raw переписку.
    // result_json содержит score+result, который и так показывается юзеру.
    // history больше не нужен для повторного анализа (есть idempotency по result_hash).
    db.run('UPDATE simulator_sessions SET messages = ? WHERE id = ?', '[]', sid);
    if (!wasCompleted) {
      db.run('UPDATE users SET simulations_count = simulations_count + 1 WHERE telegram_user_id = ?', req.tgUser.id);
    }
    res.json({ ok: true, result, session_id: sid });
  } catch (err) {
    logAICall({ endpoint: '/simulator/finish', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[simulator/finish]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка анализа. Попробуй ещё раз.' });
  }
});

// ── POST /api/v1/simulator/analyze ───────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id)
    return res.status(400).json({ ok: false, error: 'session_id обязателен' });

  const sid = parseIntId(session_id);
  if (!sid) return res.status(400).json({ ok: false, error: 'session_id должен быть числом' });

  const session = db.get('SELECT * FROM simulator_sessions WHERE id = ? AND telegram_user_id = ?', sid, req.tgUser.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Сессия не найдена' });

  const prompt = getPrompt('simulator_analyze');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт simulator_analyze не найден' });

  const history = safeParse(session.messages, []);
  if (history.length < 2)
    return res.json({ ok: true, result: { engagement: 50, interest: 50, quality: 50, recommendation: 'Напиши первое сообщение, чтобы получить разбор её реакции.' } });

  const dialogText = history.slice(-10)
    .map(m => `${m.from === 'me' ? 'Ты' : session.typazh}: ${m.text}`)
    .join('\n');

  const t0 = Date.now();
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature,
      max_tokens: Math.max(prompt.max_tokens ?? 0, 1200),
      reasoning: 'low',
      systemPrompt: prompt.system_prompt,
      variables: {
        typazh: typazhNameFor(session.typazh),
        typazh_desc: typazhDescFor(session.typazh),
        place: session.place,
      },
      messages: [{ role: 'user', content: `Диалог:\n\n${dialogText}\n\nОтветь ТОЛЬКО JSON: {"engagement":число,"interest":число,"quality":число,"recommendation":"строка"}` }],
    });
    logAICall({ endpoint: '/simulator/analyze', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); }
    catch (_) { result = { engagement: 50, interest: 50, quality: 50, recommendation: 'Продолжай диалог — данных пока недостаточно.' }; }
    res.json({ ok: true, result });
  } catch (err) {
    logAICall({ endpoint: '/simulator/analyze', model: prompt.model, duration: Date.now() - t0, error: err.message });
    res.json({ ok: true, result: { engagement: 50, interest: 50, quality: 50, recommendation: 'Не удалось проанализировать диалог.' } });
  }
});

// ── POST /api/v1/simulator/hints ─────────────────────────────────────────────
router.post('/hints', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id)
    return res.status(400).json({ ok: false, error: 'session_id обязателен' });

  const sid = parseIntId(session_id);
  if (!sid) return res.status(400).json({ ok: false, error: 'session_id должен быть числом' });

  const session = db.get('SELECT * FROM simulator_sessions WHERE id = ? AND telegram_user_id = ?', sid, req.tgUser.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Сессия не найдена' });

  const prompt = getPrompt('simulator_hints');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт simulator_hints не найден' });

  const history     = safeParse(session.messages, []);
  const lastHerMsg  = [...history].reverse().find(m => m.from === 'her')?.text || '';
  const recentHistory = history.slice(-6)
    .map(m => `${m.from === 'me' ? 'Ты' : session.typazh}: ${m.text}`)
    .join('\n');

  const t0 = Date.now();
  try {
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'off',
      systemPrompt: prompt.system_prompt,
      variables: {
        typazh: typazhNameFor(session.typazh),
        typazh_desc: typazhDescFor(session.typazh),
        place: session.place,
      },
      messages: [{ role: 'user', content: `Последние сообщения:\n${recentHistory}\n\nПоследнее сообщение девушки: "${lastHerMsg}"\n\nПредложи 5 вариантов ответа. Ответь ТОЛЬКО чистым JSON без markdown и без пояснений.` }],
    });
    logAICall({ endpoint: '/simulator/hints', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let result;
    try { result = parseAIJson(content); }
    catch (_) { result = { hints: [] }; }
    res.json({ ok: true, hints: result.hints || [] });
  } catch (err) {
    logAICall({ endpoint: '/simulator/hints', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[simulator/hints]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка генерации подсказок.' });
  }
});

// ── POST /api/v1/simulator/ai-girl ───────────────────────────────────────────
router.post('/ai-girl', async (req, res) => {
  const { session_id, message, girl_profile } = req.body;
  if (!session_id || !message?.trim())
    return res.status(400).json({ ok: false, error: 'session_id и message обязательны' });
  if (message.length > MAX_MSG_LEN)
    return res.status(400).json({ ok: false, error: `Сообщение не может быть длиннее ${MAX_MSG_LEN} символов` });

  const sid = parseIntId(session_id);
  if (!sid) return res.status(400).json({ ok: false, error: 'session_id должен быть числом' });

  const session = db.get('SELECT * FROM simulator_sessions WHERE id = ? AND telegram_user_id = ?', sid, req.tgUser.id);
  if (!session) return res.status(404).json({ ok: false, error: 'Сессия не найдена' });

  const prompt = getPrompt('ai_girl_chat');
  if (!prompt) return res.status(500).json({ ok: false, error: 'Промпт ai_girl_chat не найден' });

  const gp = girl_profile || {};
  const rawTypazh = String(gp.typazh ?? 'Весёлая').slice(0, 100);
  const safe = {
    girl_name:   String(gp.name ?? 'Она').slice(0, 50),
    typazh:      typazhNameFor(rawTypazh),
    typazh_desc: typazhDescFor(rawTypazh),
    character:   String(gp.character ?? 'Мягкий').slice(0, 50),
    comm_style:  String(gp.comm_style ?? 'Развёрнутые ответы').slice(0, 100),
    hobbies:     Array.isArray(gp.hobbies) ? gp.hobbies.slice(0, 10).join(', ') : String(gp.hobbies ?? '').slice(0, 200),
    description: String(gp.description ?? '').slice(0, 500),
  };

  const history = safeParse(session.messages, []);
  const t0 = Date.now();
  try {
    const aiMessages = [
      ...history.slice(-20).map(m => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: message },
    ];
    const roundNumber = Math.floor(history.length / 2) + 1;
    const { content, usage, model } = await callAI({
      model: prompt.model, temperature: prompt.temperature, max_tokens: prompt.max_tokens,
      reasoning: 'off',
      systemPrompt: prompt.system_prompt,
      variables: {
        ...safe,
        round_number:  String(roundNumber),
        warmup_rounds: String(typazhWarmupFor(rawTypazh)),
      },
      messages: aiMessages,
    });
    logAICall({ endpoint: '/simulator/ai-girl', model, tokens: usage?.total_tokens, duration: Date.now() - t0 });

    let girlResponse = stripStageDirections(content);
    const prevHer = [...history].reverse().find(m => m.from === 'her');
    if (prevHer && /\)+\s*$/.test(prevHer.text) && /\)+\s*$/.test(girlResponse)) {
      girlResponse = girlResponse.replace(/[)\s]+$/, '').trimEnd() || girlResponse;
    }
    const updatedHistory = [...history, { from: 'me', text: message }, { from: 'her', text: girlResponse }];
    db.run('UPDATE simulator_sessions SET messages = ? WHERE id = ?', JSON.stringify(updatedHistory), sid);
    res.json({ ok: true, response: girlResponse, messages: updatedHistory });
  } catch (err) {
    logAICall({ endpoint: '/simulator/ai-girl', model: prompt.model, duration: Date.now() - t0, error: err.message });
    console.error('[simulator/ai-girl]', err.message);
    res.status(500).json({ ok: false, error: 'Ошибка ответа. Попробуй ещё раз.' });
  }
});

export default router;
