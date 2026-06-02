// ═══════════════════════════════════════════════════════════════
// Sentry integration — error tracking для mini-app.
//
// Условная инициализация: только если VITE_SENTRY_DSN задан.
// Без DSN — все вызовы превращаются в no-op (Sentry SDK сам это умеет).
//
// PII-фильтр (beforeSend):
//   - Authorization headers → '[redacted]'  (грабли §5.35)
//   - длинные тексты пользователя (>500 chars) → truncate + маркер
//   - спам типа "NetworkError" / "Failed to fetch" на плохом 4G → drop
//     (грабли §5.17 — не флудим квоту Sentry)
//   - telegram_user_id в URL → маска
//
// tracesSampleRate: 0.1 — для performance monitoring дёшево.
// ═══════════════════════════════════════════════════════════════
import * as Sentry from '@sentry/react';

const DSN     = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV     = (import.meta.env.MODE as string) || 'production';
const RELEASE = (import.meta.env.VITE_BUILD_VERSION as string) || 'dev';

const PII_TRUNCATE_LIMIT = 500;
const NETWORK_NOISE_PATTERNS = [
  /NetworkError/i,
  /Failed to fetch/i,
  /Сеть недоступна/i,
  /Превышено время ожидания/i,
  /Load failed/i,
  /aborted/i,
];

/**
 * Инициализирует Sentry, если задан VITE_SENTRY_DSN.
 * Вызывать ОДИН раз, до createRoot/рендера.
 */
export function initSentry(): void {
  if (!DSN) {
    // dev / staging без DSN — Sentry не включаем. Никаких ворнингов:
    // в TMA окружении это нормально.
    return;
  }

  try {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      // Sample только 10% транзакций — экономим квоту.
      tracesSampleRate: 0.1,
      // Replay — выключаем (heavy + PII risk в TG WebView).
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Не отправляем PII по дефолту.
      sendDefaultPii: false,
      // Не репортим ошибки бекенда (они логируются на сервере).
      ignoreErrors: [
        // Сетевые шумы — это не проблема приложения.
        /NetworkError/,
        /Failed to fetch/,
        /Load failed/,
        // Игнорируем ResizeObserver loop (известный браузерный шум).
        /ResizeObserver loop/,
      ],
      beforeSend: (event, hint) => {
        try {
          // 1) Network noise — drop
          const msg = (hint?.originalException as any)?.message || event.message || '';
          if (NETWORK_NOISE_PATTERNS.some(re => re.test(String(msg)))) {
            return null;
          }

          // 2) Чистим Authorization (РФ §5.35 — токены не должны утекать)
          if (event.request?.headers) {
            const headers = { ...(event.request.headers as Record<string, string>) };
            for (const key of Object.keys(headers)) {
              if (/authorization/i.test(key)) {
                headers[key] = '[redacted]';
              }
            }
            event.request.headers = headers;
          }

          // 3) Truncate длинные тексты в extra/contexts (часто там переписки)
          if (event.extra) {
            event.extra = truncateStrings(event.extra, PII_TRUNCATE_LIMIT);
          }
          if (event.contexts) {
            event.contexts = truncateStrings(event.contexts, PII_TRUNCATE_LIMIT) as any;
          }

          // 4) Чистим breadcrumbs от длинных fetch-payload
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map(b => ({
              ...b,
              data: b.data ? truncateStrings(b.data, PII_TRUNCATE_LIMIT) as any : b.data,
            }));
          }

          // 5) Маскируем telegram_user_id в URL (на случай если оказался в query)
          if (event.request?.url) {
            event.request.url = String(event.request.url).replace(
              /(telegram_user_id|tg_id|user_id)=\d+/gi,
              '$1=***'
            );
          }

          // 6) M8 — превентивно маскируем event.user (на случай если Sentry SDK
          // или будущий код вызовет Sentry.setUser с TG-данными).
          if (event.user) {
            const maskedId = event.user.id != null
              ? `${String(event.user.id).slice(0, 4)}***`
              : undefined;
            event.user = { id: maskedId };
          }

          return event;
        } catch (_) {
          // Любые ошибки в beforeSend — пропускаем event как есть.
          return event;
        }
      },
    });
  } catch (e) {
    // Sentry init не должен ронять приложение.
    // eslint-disable-next-line no-console
    console.warn('[sentry] init failed:', e);
  }
}

/** Рекурсивно обрезает все строковые поля до maxLen символов. */
function truncateStrings(obj: any, maxLen: number, depth = 0): any {
  if (obj == null) return obj;
  if (depth > 5) return obj; // protection от бесконечной вложенности
  if (typeof obj === 'string') {
    return obj.length > maxLen
      ? `${obj.slice(0, maxLen)}...[truncated ${obj.length - maxLen} chars]`
      : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(v => truncateStrings(v, maxLen, depth + 1));
  }
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = truncateStrings(v, maxLen, depth + 1);
    }
    return out;
  }
  return obj;
}

/** Удобный capture для catch-блоков. */
export function reportError(err: unknown, ctx?: Record<string, any>): void {
  if (!DSN) return;
  try {
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
  } catch (_) {}
}
