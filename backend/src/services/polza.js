// ═══════════════════════════════════════════════════════════════
// Polza.ai сервис — OpenAI-совместимый шлюз с детальным логированием.
// Используем Qwen3 235B A22B Instruct 2507 (Alibaba) как основную модель.
//
// История миграции:
//  - до 2026-05-15: x-ai/grok-4.1-fast (18.21/45.54 ₽/1M)
//    → xAI ретайрил эту версию 15.05.2026, перенаправляя на Grok 4.3 (113.84/227.69 ₽/1M)
//    что в 5+ раз дороже и за пределами бюджета.
//  - с 2026-05-15: qwen/qwen3-235b-a22b-2507 (13.62/54.46 ₽/1M, 131k контекст)
//    Преимущества: дешевле Grok по input, отличный русский, низкая цензура для
//    creative/dating контента, превосходный creative writing (EQ-Bench3 1500+),
//    мгновенный response (4-8 сек vs 30-50 у Grok с reasoning).
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';

const POLZA_API_KEY = process.env.POLZA_API_KEY;
const POLZA_BASE    = 'https://polza.ai/api/v1';

export const FREE_MODELS = {
  primary:  'qwen/qwen3-235b-a22b-2507',
  fallback: 'qwen/qwen3-235b-a22b-2507',
  fast:     'meta-llama/llama-4-maverick',
};

export const GROK_FAST = 'qwen/qwen3-235b-a22b-2507';
export const QWEN_FAST = 'qwen/qwen3-235b-a22b-2507';

const Y = '\x1b[33m', G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', D = '\x1b[2m', X = '\x1b[0m';

/**
 * Отправить запрос к Polza.ai (OpenAI-compatible).
 *
 * @param {Object} opts
 * @param {string} [opts.reasoning] — 'off' | 'low' | 'medium' | 'high'
 */
export async function callAI({ model, messages, temperature = 0.7, max_tokens = 1500, systemPrompt, variables = {}, reasoning, lang = 'ru' }) {
  if (!POLZA_API_KEY) {
    console.error(`${R}[Polza] POLZA_API_KEY не задан в .env!${X}`);
    throw new Error('POLZA_API_KEY не задан');
  }

  // Подстановка переменных {{variable}} в промпт
  let finalPrompt = systemPrompt;
  for (const [k, v] of Object.entries(variables)) {
    finalPrompt = finalPrompt.replaceAll(`{{${k}}}`, String(v ?? ''));
  }
  // Сносим любые оставшиеся {{что-то}} плейсхолдеры — защита от опечаток
  const leftover = finalPrompt.match(/\{\{[^}]+\}\}/g);
  if (leftover) {
    console.warn(`${Y}[Polza]${X} Незамещённые плейсхолдеры: ${leftover.join(', ')} — выношу.`);
    finalPrompt = finalPrompt.replace(/\{\{[^}]+\}\}/g, '');
  }

  // TMA: только русский. lang передаётся для обратной совместимости (если кто-то
  // ещё ставит lang='en' — игнорируем, AI отвечает на языке промпта).

  const usedModel = model || GROK_FAST;
  const t0 = Date.now();

  console.log(`\n${Y}[Polza]${X} ─── Запрос ───────────────────────────`);
  console.log(`  ${D}model:${X}       ${usedModel}`);
  console.log(`  ${D}temperature:${X} ${temperature}`);
  console.log(`  ${D}max_tokens:${X}  ${max_tokens}`);
  console.log(`  ${D}messages:${X}    ${messages.length} шт`);
  console.log(`  ${D}system:${X}      ${finalPrompt.slice(0, 120).replace(/\n/g, ' ')}...`);
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    console.log(`  ${D}last msg:${X}    [${last.role}] ${String(last.content).slice(0, 100)}`);
  }

  const body = {
    model: usedModel,
    messages: [
      { role: 'system', content: finalPrompt },
      ...messages,
    ],
    temperature,
    max_tokens,
  };

  if (reasoning === 'off') {
    body.reasoning = { exclude: true, effort: 'low' };
  } else if (reasoning === 'low') {
    body.reasoning = { effort: 'low' };
  } else if (reasoning === 'medium') {
    body.reasoning = { effort: 'medium' };
  } else if (reasoning === 'high') {
    body.reasoning = { effort: 'high' };
  }

  const ALL_FALLBACKS = [
    FREE_MODELS.primary,
    FREE_MODELS.fast,
  ];
  const QWEN_FALLBACKS = [
    QWEN_FAST,
    'meta-llama/llama-4-maverick',
  ];
  let modelsToTry;
  if (usedModel === QWEN_FAST) {
    modelsToTry = QWEN_FALLBACKS;
  } else {
    const startIdx = ALL_FALLBACKS.indexOf(usedModel);
    modelsToTry = startIdx >= 0
      ? ALL_FALLBACKS.slice(startIdx)
      : [usedModel, ...ALL_FALLBACKS];
  }

  let res, data;
  let lastErr;

  for (const tryModel of modelsToTry) {
    if (tryModel !== modelsToTry[0]) {
      console.log(`${Y}[Polza]${X} ↻ Fallback → ${tryModel}`);
    }
    body.model = tryModel;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 300_000);

    try {
      res = await fetch(`${POLZA_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${POLZA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (networkErr) {
      clearTimeout(timeoutId);
      if (networkErr.name === 'AbortError') {
        console.error(`${R}[Polza] Timeout (${tryModel})${X} — пробуем следующую модель`);
        lastErr = new Error(`Timeout: ${tryModel}`);
        continue;
      }
      // L4 — логируем только err.code (или generic message), не err.cause:
      // cause может содержать URL/заголовки запроса (включая API key).
      const code = networkErr.code || networkErr.cause?.code || 'NETWORK_ERROR';
      console.error(`${R}[Polza] Сетевая ошибка:${X} code=${code}`);
      lastErr = new Error(`Network error: ${code}`);
      continue;
    }
    clearTimeout(timeoutId);

    if (res.status === 429 || res.status === 503 || res.status === 404 || res.status === 400) {
      const errText = await res.text();
      console.error(`${R}[Polza] HTTP ${res.status} (${tryModel})${X} — пробуем следующую модель`);
      console.error(`  Body:`, errText.slice(0, 300));
      lastErr = new Error(`Polza ${res.status}: ${errText.slice(0, 200)}`);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      const ms2 = Date.now() - t0;
      console.error(`${R}[Polza] HTTP ${res.status}${X} за ${ms2}ms`);
      console.error(`  Body:`, errText.slice(0, 500));
      if (res.status === 401) console.error(`  → Неверный API ключ или истёк`);
      if (res.status === 402) console.error(`  → Баланс на Polza.ai исчерпан`);
      throw new Error(`Polza ${res.status}: ${errText.slice(0, 200)}`);
    }

    lastErr = null;
    break;
  }

  if (lastErr) {
    console.error(`${R}[Polza] Все модели вернули ошибку — сдаёмся${X}`);
    throw lastErr;
  }

  data = await res.json();

  const ms = Date.now() - t0;
  const content = data.choices?.[0]?.message?.content ?? '';
  const usage   = data.usage ?? {};
  const retModel = data.model ?? body.model;

  const reasoningToks = usage?.completion_tokens_details?.reasoning_tokens
    ?? usage?.reasoning_tokens
    ?? 0;

  console.log(`${G}[Polza]${X} ─── Ответ ────────────────────────────`);
  console.log(`  ${D}модель:${X}      ${retModel}`);
  console.log(`  ${D}время:${X}       ${ms}ms`);
  console.log(`  ${D}токены:${X}      prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}` + (reasoningToks ? ` ${Y}reasoning=${reasoningToks}${X}` : ''));
  console.log(`  ${D}raw (первые 300):${X}`);
  console.log(`  ${C}${content.slice(0, 300)}${content.length > 300 ? '...' : ''}${X}`);

  try {
    const parsed = parseAIJson(content);
    console.log(`  ${D}parsed JSON keys:${X}`, Object.keys(parsed).join(', '));
    if (parsed.score !== undefined) console.log(`  ${D}score:${X}`, parsed.score);
    if (parsed.mood)                console.log(`  ${D}mood:${X}`, parsed.mood);
  } catch (_) {
    console.log(`  ${D}(не JSON-ответ — текстовый)${X}`);
  }
  console.log(`${Y}[Polza]${X} ────────────────────────────────────────\n`);

  return { content, usage, model: retModel };
}

function autoCloseJson(str) {
  const stack = [];
  let inString = false;
  let escape = false;

  for (const ch of str) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let result = str;
  if (inString) result += '"';
  while (stack.length) result += stack.pop();

  return result;
}

function truncateToLastComplete(str) {
  const idx = Math.max(
    str.lastIndexOf('",'),
    str.lastIndexOf('},'),
    str.lastIndexOf('],'),
  );
  if (idx <= 0) return str;
  return str.slice(0, idx + 1);
}

export function parseAIJson(content) {
  const candidates = [];

  candidates.push(content.trim());

  const fenced = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (fenced?.[1]?.trim()) candidates.push(fenced[1].trim());

  const legacyCleaned = content
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();
  candidates.push(legacyCleaned);

  const braceStart = content.indexOf('{');
  const braceEnd   = content.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    candidates.push(content.substring(braceStart, braceEnd + 1));
  }

  const seen = new Set();
  const unique = candidates.filter(c => {
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  let firstErr;
  for (const candidate of unique) {
    try { return JSON.parse(candidate); }
    catch (e) { firstErr ??= e; }

    try { return JSON.parse(autoCloseJson(candidate)); }
    catch (_) {}

    try { return JSON.parse(autoCloseJson(truncateToLastComplete(candidate))); }
    catch (_) {}
  }

  console.error('[parseAIJson] Все стратегии не сработали');
  console.error('  raw (первые 500 симв.):', content.slice(0, 500));
  throw new Error(`AI вернул невалидный JSON: ${firstErr?.message ?? 'unknown'}`);
}
