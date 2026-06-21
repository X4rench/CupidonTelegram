// ═══════════════════════════════════════════════════════════════
// AI output validators.
//
// Защита от prompt-injection: пользователь может через notes/text/experience
// заставить AI эмитить произвольный JSON. parseAIJson толерантен и его
// поднимет. Без валидации это попадает в analysis_sessions.score (как
// authoritative metric для UI ProgressBar) или в кеш для других юзеров.
//
// Стратегия: после parseAIJson — каждое значение клампится / приводится к
// enum'у / отбрасывается если структура битая. Не падаем — возвращаем
// безопасный default + поле _validation_warnings (для дебага).
// ═══════════════════════════════════════════════════════════════

const MOOD_ENUM    = new Set(['positive', 'warning', 'negative']);
const VERDICT_ENUM = new Set(['fix', 'move_on', 'try', 'win']);
const SEVERITY_ENUM = new Set(['minor', 'moderate', 'critical']);
const HER_MOOD_ENUM = new Set(['вовлечена', 'игрива', 'устала', 'дистанцируется', 'пропадающая']);
const ENTRY_TYPE_ENUM = new Set(['reply', 'resume']);
const LAST_SPEAKER_ENUM = new Set(['he', 'she']);
const MEDIA_TYPE_ENUM = new Set(['voice', 'circle']);

// ─── helpers ─────────────────────────────────────────────────────────────────
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};
const enumOr = (v, set, fallback) => set.has(v) ? v : fallback;
const safeStr = (v, maxLen = 2000) => {
  if (typeof v !== 'string') return '';
  return v.slice(0, maxLen);
};
const safeArr = (v, maxLen, mapFn) => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxLen).map(mapFn).filter(x => x != null);
};

// ─── /wing ───────────────────────────────────────────────────────────────────
const WING_BADGE_ENUM = new Set(['дружелюбный', 'игривый', 'флирт', 'уверенный', 'универсальный']);

export function validateWingResult(raw) {
  if (!isObj(raw)) {
    return { score: 5, mood: 'warning', summary: 'Не удалось проанализировать.', responses: [] };
  }
  return {
    score:      clampNum(raw.score, 0, 10, 5),
    mood:       enumOr(raw.mood, MOOD_ENUM, 'warning'),
    engagement: clampNum(raw.engagement, 0, 100, 50),
    trust:      clampNum(raw.trust, 0, 100, 50),
    sentiment:  clampNum(raw.sentiment, 0, 100, 50),
    context_read: isObj(raw.context_read) ? {
      last_speaker:         enumOr(raw.context_read.last_speaker, LAST_SPEAKER_ENUM, 'she'),
      hours_since_her_last: clampNum(raw.context_read.hours_since_her_last, 0, 9999, 0),
      her_mood:             enumOr(raw.context_read.her_mood, HER_MOOD_ENUM, 'вовлечена'),
      entry_type:           enumOr(raw.context_read.entry_type, ENTRY_TYPE_ENUM, 'reply'),
    } : null,
    girl_typazh_description: safeStr(raw.girl_typazh_description, 1000),
    signals: safeArr(raw.signals, 10, s => isObj(s) ? {
      type: enumOr(s.type, new Set(['positive', 'warning', 'negative']), 'warning'),
      text: safeStr(s.text, 300),
    } : null).filter(s => s.text),
    strategy: safeStr(raw.strategy, 2000),
    responses: safeArr(raw.responses, 9, r => isObj(r) ? {
      text:  safeStr(r.text, 1000),
      why:   safeStr(r.why, 500),
      badge: enumOr(r.badge, WING_BADGE_ENUM, 'универсальный'),
    } : (typeof r === 'string' ? { text: safeStr(r, 1000), why: '', badge: 'универсальный' } : null)).filter(r => r.text),
    media_hint: isObj(raw.media_hint) && raw.media_hint.type ? {
      type:         enumOr(raw.media_hint.type, MEDIA_TYPE_ENUM, 'voice'),
      reason:       safeStr(raw.media_hint.reason, 500),
      what_to_say:  safeStr(raw.media_hint.what_to_say, 1000),
    } : null,
    summary: safeStr(raw.summary, 500),
  };
}

// ─── /rejection ──────────────────────────────────────────────────────────────
// Поля совпадают с тем, что ждёт RejectionScreen.js:
//   errors[].title + errors[].description + errors[].message_example + errors[].severity
//   principles: массив строк (frontend рендерит <Chip label={p}>)
const ERROR_TYPE_ENUM = new Set(['double_message', 'cringe', 'clingy', 'boring', 'pushy', 'other']);

export function validateRejectionResult(raw) {
  if (!isObj(raw)) {
    return { score: 5, errors: [], principles: [], what_to_do: '', verdict: 'fix', verdict_text: '', recovery_attempt: '', recovery_options: [], next_steps: [] };
  }
  return {
    score:    clampNum(raw.score, 0, 10, 5),
    errors:   safeArr(raw.errors, 10, e => isObj(e) ? {
      type:            enumOr(e.type, ERROR_TYPE_ENUM, 'other'),
      title:           safeStr(e.title, 200),
      description:     safeStr(e.description ?? e.detail, 800),
      message_example: safeStr(e.message_example, 500),
      severity:        enumOr(e.severity, SEVERITY_ENUM, 'moderate'),
    } : null).filter(e => e.title),
    principles: safeArr(raw.principles, 10, p => {
      if (typeof p === 'string') return safeStr(p, 500);
      if (isObj(p) && p.title) return safeStr(p.title, 500);
      return null;
    }).filter(Boolean),
    what_to_do:       safeStr(raw.what_to_do, 1500),
    verdict:          enumOr(raw.verdict, VERDICT_ENUM, 'fix'),
    verdict_text:     safeStr(raw.verdict_text, 500),
    recovery_attempt: safeStr(raw.recovery_attempt, 800),
    recovery_options: safeArr(raw.recovery_options, 6, o => isObj(o) ? {
      angle: safeStr(o.angle, 200),
      text:  safeStr(o.text, 600),
    } : (typeof o === 'string' ? { angle: '', text: safeStr(o, 600) } : null)).filter(o => o.text),
    next_steps:       safeArr(raw.next_steps, 6, p => {
      if (typeof p === 'string') return safeStr(p, 400);
      if (isObj(p) && p.text) return safeStr(p.text, 400);
      if (isObj(p) && p.title) return safeStr(p.title, 400);
      return null;
    }).filter(Boolean),
  };
}

// ─── /support ────────────────────────────────────────────────────────────────
const SUPPORT_LEVEL_ENUM = new Set(['ЛЁГКИЙ', 'ГЛУБОКИЙ', 'С ЮМОРОМ', 'ТЁПЛЫЙ']);

export function validateSupportResult(raw) {
  if (!isObj(raw)) return { responses: [], dont_say: '' };
  const responses = safeArr(raw.responses, 9, r => isObj(r) ? {
    text:  safeStr(r.text, 1000),
    level: enumOr(r.level, SUPPORT_LEVEL_ENUM, 'ЛЁГКИЙ'),
  } : (typeof r === 'string' ? { text: safeStr(r, 1000), level: 'ЛЁГКИЙ' } : null)).filter(r => r.text);
  if (responses.length > 0 && responses.length < 9) {
    const base = responses.length;
    for (let i = 0; responses.length < 9; i++) responses.push(responses[i % base]);
  }
  return { responses, dont_say: safeStr(raw.dont_say, 500) };
}

// ─── /quick-reply ────────────────────────────────────────────────────────────
const QUICK_REPLY_ANGLE_ENUM = new Set(['statement', 'side_topic', 'tease', 'mirror', 'hook_question']);

export function validateQuickReplyResult(raw) {
  if (!isObj(raw)) return { replies: [] };
  return {
    replies: safeArr(raw.replies, 5, r => isObj(r) ? {
      text:  safeStr(r.text, 800),
      angle: enumOr(r.angle, QUICK_REPLY_ANGLE_ENUM, ''),
    } : (typeof r === 'string' ? { text: safeStr(r, 800), angle: '' } : null)).filter(r => r.text),
  };
}

// ─── /reboot ─────────────────────────────────────────────────────────────────
export function validateRebootResult(raw) {
  if (!isObj(raw)) return { diagnosis: '', messages: [], verdict: 'try', verdict_reason: '' };
  return {
    diagnosis:      safeStr(raw.diagnosis, 1000),
    messages:       safeArr(raw.messages, 5, m => isObj(m) ? {
      text:   safeStr(m.text, 800),
      tactic: safeStr(m.tactic, 200),
    } : (typeof m === 'string' ? { text: safeStr(m, 800), tactic: '' } : null)).filter(m => m.text),
    verdict:        enumOr(raw.verdict, new Set(['try', 'move_on']), 'try'),
    verdict_reason: safeStr(raw.verdict_reason, 800),
  };
}

// ─── /date-invite ────────────────────────────────────────────────────────────
export function validateDateInviteResult(raw) {
  if (!isObj(raw)) return { readiness: 50, readiness_comment: '', invitations: [] };
  return {
    readiness:         clampNum(raw.readiness, 0, 100, 50),
    readiness_comment: safeStr(raw.readiness_comment, 800),
    invitations:       safeArr(raw.invitations, 5, i => isObj(i) ? {
      text:   safeStr(i.text, 1000),
      type:   safeStr(i.type, 50),
      reason: safeStr(i.reason, 500),
    } : null).filter(i => i.text),
  };
}

// ─── /style-shift ────────────────────────────────────────────────────────────
export function validateStyleShiftResult(raw) {
  if (!isObj(raw)) return { current_style: '', problems: [], recommended_style: '', shift_tips: [], example_message: '' };
  return {
    current_style:     safeStr(raw.current_style, 500),
    problems:          safeArr(raw.problems, 10, p => safeStr(p, 500)),
    recommended_style: safeStr(raw.recommended_style, 500),
    shift_tips:        safeArr(raw.shift_tips, 10, t => safeStr(t, 500)),
    example_message:   safeStr(raw.example_message, 800),
  };
}

// ─── /first-message ──────────────────────────────────────────────────────────
export function validateFirstMessageResult(raw) {
  if (!isObj(raw)) return { messages: [] };
  const messages = safeArr(raw.messages, 9, m => isObj(m) ? {
    text: safeStr(m.text, 1000),
    tone: safeStr(m.tone, 50),
    hook: safeStr(m.hook, 200),
  } : (typeof m === 'string' ? { text: safeStr(m, 1000), tone: '', hook: '' } : null)).filter(m => m.text);
  if (messages.length > 0 && messages.length < 9) {
    const base = messages.length;
    for (let i = 0; messages.length < 9; i++) messages.push(messages[i % base]);
  }
  return { messages };
}

// ─── /analysis/real-approach (реальное знакомство) ─────────────────────────────
// Дерево-сценарий подхода. Дефолты на случай мусора; длинное тире → дефис.
export function validateRealApproachResult(raw) {
  const r = isObj(raw) ? raw : {};
  // Floor-страховка: модель иногда роняет извинение за подход («извини что
  // прерываю/мешаю») — это нужда, она под запретом. Срезаем ТОЛЬКО связку
  // извинение+глагол-помехи (прерываю/мешаю/отвлекаю/беспокою/потревожу),
  // чтобы не калечить обычный текст.
  const dropNeedyApology = (s) => s
    // лидирующее извинение за подход (о/ну/ой) (привет,) извини/прости [что..|за..] до 1-го разделителя
    .replace(/^\s*(?:(?:о|ой|ну|эх|да|слушай|эй)[,!]?\s+)?(привет[,!]?\s+)?(?:извини(?:те|юсь)?|прости(?:те)?|сорри|сорян|пардон)(?:\s*,?\s*(?:что|за)\s+(?:я\s+)?(?:тебя\s+)?(?:прерыва|меша|отвлека|беспоко|потревож|врыва)[а-яё]*)?[^,.!?:-]{0,40}?[,.!?:-]+\s*/i, '$1')
    // мид-фраза: извинение + глагол-помехи (прерываю/мешаю/отвлекаю/беспокою/врываюсь)
    .replace(/[,;\s]*(?<![а-яёА-ЯЁ])(?:извини(?:те|юсь)?|прости(?:те)?|сорри|сорян|пардон)\s*,?\s*(?:что\s+|за\s+)?(?:я\s+)?(?:тебя\s+)?(?:прерыва|меша|отвлека|беспоко|потревож|врыва)[а-яёА-ЯЁ]*[\s,-]*/gi, ', ')
    // превентивная защита «я не маньяк/извращенец/псих/подкарауливаю/...» — нужда
    .replace(/[\s,–—-]*(?:я\s+)?не\s+(?:маньяк|извращен|псих|больн|сталкер|стрёмн|опасн|куса|подкараул|навязыва)[а-яё]*(?:\s+как(?:ой|ая|ое|ие)(?:[\s-]+(?:то|нибудь))?)?[\s,–—-]*/gi, ', ')
    // извинение за подход «не хотел/не хочу мешать/врываться»
    .replace(/[,;\s-]*не\s+(?:хот[еи]л[аи]?|хочу)\s+(?:тебе\s+|вам\s+)?(?:мешать|врываться)[а-яё]*/gi, ',')
    // заходы-просьба разрешения подойти: «(я) не (по)мешаю?/не врываюсь?», «можно [одну фразу/секунду]?» — нужда
    .replace(/[,;\s–—-]*(?:я\s+)?не\s+(?:(?:по)?меша|врыва)[а-яё]*\s*\?/gi, ', ')
    .replace(/[,;\s-]*можно\s*(?:одну\s+фразу|на\s+секунду|секунду|на\s+минуту|минуту)?\s*\?/gi, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/([.!?])\s*,/g, '$1')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/^[\s,.;:!?-]+/, '')
    .replace(/[\s,;:–—-]+$/, '');
  // Длинное тире → дефис; вычищаем артефакты модели (иероглифы, zero-width,
  // мусорные символы — Qwen иногда подмешивает их в слова), схлопываем пробелы.
  const clean = (v, len) => dropNeedyApology(
      safeStr(v, len)
        .replace(/[—–]/g, '-')
        .replace(/[^Ѐ-ӿa-zA-Z0-9\s.,!?:;()«»"'’…\/%-]/g, ''),
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
  const strList = (v, n, len = 300) => safeArr(v, n, s => clean(s, len)).filter(Boolean);
  const branch = (b) => {
    const o = isObj(b) ? b : {};
    return {
      openers:     strList(o.openers, 4, 300),
      behavior:    clean(o.behavior, 300),
      get_contact: strList(o.get_contact, 2, 300),
      push:        strList(o.push, 2, 300),
      exit:        strList(o.exit, 2, 300),
    };
  };
  const q = isObj(r.quick) ? r.quick : {};
  const br = isObj(r.branches) ? r.branches : {};
  const branches = { in: branch(br.in), neutral: branch(br.neutral), closed: branch(br.closed) };
  // quick должен быть ВСЕГДА (юзер может переключиться на «быстро» даже если она
  // сидит). Если модель оставила пустым — подстрахуемся заходом/контактом из ветки.
  let qOpeners = strList(q.openers, 2, 300);
  if (qOpeners.length === 0) qOpeners = [branches.in.openers[0] || branches.neutral.openers[0]].filter(Boolean);
  const qContact = clean(q.contact, 300) || branches.in.get_contact[0] || branches.neutral.get_contact[0] || '';
  return {
    read:        clean(r.read, 400),
    prep:        clean(r.prep, 500),
    eye_contact: clean(r.eye_contact, 400),
    talk:        strList(r.talk, 2, 300),
    quick:       { openers: qOpeners, next: clean(q.next, 300), contact: qContact },
    branches,
  };
}

// ─── /simulator/finish ───────────────────────────────────────────────────────
export function validateSimulatorResult(raw) {
  if (!isObj(raw)) {
    return { score: 5, summary: '', strengths: [], improvements: [], best_message: '', worst_message: '', tip: '', next_steps: [] };
  }
  return {
    score:         clampNum(raw.score, 0, 10, 5),
    summary:       safeStr(raw.summary, 1000),
    strengths:     safeArr(raw.strengths, 10, s => safeStr(s, 500)),
    improvements:  safeArr(raw.improvements, 10, s => safeStr(s, 500)),
    best_message:  safeStr(raw.best_message, 800),
    worst_message: safeStr(raw.worst_message, 800),
    tip:           safeStr(raw.tip, 500),
    next_steps:    safeArr(raw.next_steps, 10, s => safeStr(s, 500)),
  };
}
