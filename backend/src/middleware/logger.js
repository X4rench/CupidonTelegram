// ═══════════════════════════════════════════════════════════════
// Logger middleware.
// В БД хранится только метаинформация (endpoint, статус, ms).
// Содержимое пользовательских сообщений (переписка, профиль, заметки) —
// PII по 152-ФЗ. Никогда не пишется в логи целиком.
// ═══════════════════════════════════════════════════════════════
import db from '../db/index.js';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', grey: '\x1b[90m',
};

function statusColor(s) {
  if (s >= 500) return `${C.red}${s}${C.reset}`;
  if (s >= 400) return `${C.yellow}${s}${C.reset}`;
  if (s >= 300) return `${C.blue}${s}${C.reset}`;
  return `${C.green}${s}${C.reset}`;
}
function methodColor(m) {
  const map = { GET: C.cyan, POST: C.green, PUT: C.yellow, DELETE: C.red, PATCH: C.magenta };
  return `${map[m] || C.grey}${C.bold}${m}${C.reset}`;
}

// PII-поля: вместо содержимого пишется метрика длины.
const PRIVATE_FIELDS = [
  'text', 'situation_text', 'profile_text', 'input_text',
  'messages', 'notes', 'last_message', 'last_chat',
  'chat', 'situation', 'message', 'user_profile',
];
// Поля которые маскируем но не вырезаем полностью
const REDACT_FIELDS = ['initData', 'initDataRaw'];

function sanitize(body) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (PRIVATE_FIELDS.includes(k)) {
      out[k] = typeof v === 'string' ? `[${v.length} chars]`
             : Array.isArray(v)      ? `[${v.length} items]`
             : '[private]';
    } else if (REDACT_FIELDS.includes(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 200)}...`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Console-only AI-call log (используется роутами после callAI).
 * В БД не пишется — мета AI-запроса достаточно увидеть в консоли.
 */
export function logAICall({ endpoint, model, tokens, duration, error }) {
  const badge = error
    ? `  ${C.red}[AI ${C.bold}X${C.reset}${C.red}]${C.reset}`
    : `  ${C.green}[AI ${C.bold}OK${C.reset}${C.green}]${C.reset}`;
  console.log(
    `${badge} ${C.dim}${endpoint}${C.reset}` +
    ` model:${C.cyan}${model}${C.reset}` +
    (tokens ? ` tokens:${C.yellow}${tokens}${C.reset}` : '') +
    ` time:${C.dim}${duration}ms${C.reset}` +
    (error ? ` ${C.red}ERR: ${error}${C.reset}` : '')
  );
}

export function requestLogger(req, res, next) {
  const t0 = Date.now();
  const tgId = req.tgUser?.id ?? null;

  const originalJson = res.json.bind(res);
  let respBody = null;
  res.json = (body) => { respBody = body; return originalJson(body); };

  res.on('finish', () => {
    const ms = Date.now() - t0;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;
    // H5 — вырезаем query string, чтобы случайные PII в URL не попадали в логи.
    const safeUrl = String(url).split('?')[0];

    console.log(
      `\n${C.grey}[${new Date().toISOString()}]${C.reset} ` +
      `${methodColor(method)} ${C.cyan}${safeUrl}${C.reset} ` +
      `${statusColor(status)} ${C.grey}${ms}ms${C.reset} ` +
      `${C.dim}tg:${tgId ?? '-'}${C.reset}`
    );

    if (req.body && Object.keys(req.body).length > 0) {
      const preview = sanitize(req.body);
      console.log(`  ${C.blue}→ REQ${C.reset}`, JSON.stringify(preview));
    }
    if (status >= 400 && respBody) {
      console.log(`  ${C.red}← ERR${C.reset}`, JSON.stringify(respBody));
    }

    try {
      db.run(
        `INSERT INTO request_logs (telegram_user_id, endpoint, method, request_body, response_status, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        tgId,
        safeUrl,
        method,
        JSON.stringify(sanitize(req.body)),
        status,
        ms
      );
    } catch (_) {}
  });

  next();
}
