// ═══════════════════════════════════════════════════════════════
// Backend Sentry — error tracking для серверной части.
//
// Условная инициализация: только если SENTRY_DSN задан в .env.
// Без DSN — все функции no-op.
//
// PII-фильтр (beforeSend):
//   - Authorization header → '[redacted]'
//   - initData в body / query → '[redacted]'
//   - длинные текстовые поля (>500 chars) → truncate
//   - игнорируем ApiError 4xx (это валидные клиентские ошибки)
//
// Подключение в src/index.js:
//   import { initSentry, sentryRequestHandler, sentryErrorHandler } from './sentry.js';
//   initSentry();
//   // ПЕРЕД роутами:
//   app.use(sentryRequestHandler());
//   // ПОСЛЕ роутов, ДО глобального error handler:
//   app.use(sentryErrorHandler());
//
// Зависимость: @sentry/node — добавить в backend/package.json при включении.
// ═══════════════════════════════════════════════════════════════

let Sentry = null;
let initialized = false;

const PII_TRUNCATE_LIMIT = 500;
const NETWORK_NOISE_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EHOSTUNREACH/i,
  /aborted/i,
];

/**
 * Инициализирует Sentry если SENTRY_DSN задан.
 * Безопасно вызывать несколько раз — повторные вызовы no-op.
 */
export async function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    // Динамический импорт — чтобы не падать когда пакет ещё не установлен.
    const mod = await import('@sentry/node').catch(() => null);
    if (!mod) {
      console.warn('[sentry-backend] @sentry/node не установлен. Пропускаем.');
      return;
    }
    Sentry = mod;

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release:     process.env.SENTRY_RELEASE || `cupidon-backend@${process.env.npm_package_version || 'dev'}`,
      tracesSampleRate: 0.05,
      sendDefaultPii: false,
      beforeSend: (event, hint) => {
        try {
          // 1) Network noise → drop
          const msg = hint?.originalException?.message || event.message || '';
          if (NETWORK_NOISE_PATTERNS.some(re => re.test(String(msg)))) return null;

          // 2) Чистим Authorization в request headers
          if (event.request?.headers) {
            const headers = { ...event.request.headers };
            for (const key of Object.keys(headers)) {
              if (/authorization/i.test(key)) headers[key] = '[redacted]';
            }
            event.request.headers = headers;
          }

          // 3) Чистим initData в body / query
          if (event.request?.data) {
            event.request.data = truncateStrings(stripInitData(event.request.data), PII_TRUNCATE_LIMIT);
          }
          if (event.request?.query_string) {
            event.request.query_string = String(event.request.query_string).replace(
              /(initData|tgWebAppData)=[^&]+/gi,
              '$1=[redacted]'
            );
          }

          // 4) Truncate strings в extra/contexts
          if (event.extra)    event.extra    = truncateStrings(event.extra, PII_TRUNCATE_LIMIT);
          if (event.contexts) event.contexts = truncateStrings(event.contexts, PII_TRUNCATE_LIMIT);

          return event;
        } catch (_) {
          return event;
        }
      },
    });

    initialized = true;
    console.log('[sentry-backend] initialized for env', process.env.NODE_ENV);
  } catch (e) {
    console.warn('[sentry-backend] init failed:', e?.message || e);
  }
}

/** Express request handler — должен быть подключён ДО роутов. */
export function sentryRequestHandler() {
  return (req, res, next) => {
    if (!Sentry || !initialized) return next();
    try {
      const h = Sentry.Handlers?.requestHandler?.();
      if (h) return h(req, res, next);
    } catch (_) {}
    return next();
  };
}

/** Express error handler — ПОСЛЕ роутов, ДО кастомного error middleware. */
export function sentryErrorHandler() {
  return (err, req, res, next) => {
    if (!Sentry || !initialized) return next(err);
    try {
      const h = Sentry.Handlers?.errorHandler?.({
        // Не репортим 4xx — это валидные клиентские ошибки.
        shouldHandleError: (e) => {
          const status = e?.status || e?.statusCode || 500;
          return status >= 500;
        },
      });
      if (h) return h(err, req, res, next);
    } catch (_) {}
    return next(err);
  };
}

/** Удобный capture для catch-блоков в роутах. */
export function reportError(err, ctx) {
  if (!Sentry || !initialized) return;
  try {
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
  } catch (_) {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripInitData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(out)) {
    if (/^(initData|tgWebAppData|Authorization)$/i.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof out[key] === 'object' && out[key] !== null) {
      out[key] = stripInitData(out[key]);
    }
  }
  return out;
}

function truncateStrings(obj, maxLen, depth = 0) {
  if (obj == null) return obj;
  if (depth > 5) return obj;
  if (typeof obj === 'string') {
    return obj.length > maxLen
      ? `${obj.slice(0, maxLen)}...[truncated ${obj.length - maxLen} chars]`
      : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => truncateStrings(v, maxLen, depth + 1));
  }
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = truncateStrings(v, maxLen, depth + 1);
    }
    return out;
  }
  return obj;
}
