# Security Audit — Закрытые findings

Дата: 2026-06-01
Источник: `SECURITY_AUDIT.md`
Скоуп: `D:\TwinStars\Купидон-TMA\`

## Сводка по severity

| Severity | Всего | Закрыто | Помечено как не-actionable |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 5 | 5 | 0 |
| Medium | 9 | 7 | 2 (M3 — дебажный/не security; M9 — без шифрования намеренно) |
| Low | 11 | 5 | 6 (TMA1, L3, L5, L6, L9, L10, L11 — уже OK / информационные) |
| TMA-specific | 3 | 2 | 1 (TMA1 — уже OK) |

---

## 🔴 Critical

### C1 — CSP отсутствует на фронте
**Файлы**: `mini-app/public/_headers`, `mini-app/index.html`
**Изменения**: Добавлен полноценный CSP (default-src/script-src/connect-src/frame-ancestors/img-src/style-src/font-src/object-src/base-uri/form-action). Удалён невалидный `X-Frame-Options: ALLOWALL` (его роль перенесена в `frame-ancestors` CSP). Добавлен `crossorigin="anonymous"` для telegram-web-app.js (SRI integrity намеренно не ставится — TG обновляет файл).

---

## 🟠 High

### H1 — `/users/claim-tg-bonus` не верифицирует подписку
**Файл**: `backend/src/routes/users.js`
**Изменения**: Endpoint стал async, добавлен вызов `callBotApi('getChatMember', { chat_id: REQUIRED_CHANNEL, user_id: req.tgUser.id })`. Status проверяется на `['member','administrator','creator']`. Try/catch на network errors → 503. Если `TG_BONUS_CHANNEL_ID` env пуст — fallback с `console.warn`. Env-ключ задокументирован в `.env.example`.

### H2 — Rate-limit per-IP вместо per-tg-user
**Файл**: `backend/src/index.js`
**Изменения**: Лимитер перенесён ПОСЛЕ `requireInitData`. `keyGenerator: (req) => req.tgUser?.id ? \`tg:${req.tgUser.id}\` : req.ip`. Добавлены отдельные жёсткие лимиты: `/promo` (5/час), `/payments` (10/мин), `/users/claim-tg-bonus` (3/сутки). Все лимиты задокументированы в `.env.example`.

### H3 — Дамп переписок в БД
**Файлы**: `backend/src/routes/simulator.js`, `backend/src/routes/analysis.js`, `backend/src/routes/firstMessage.js`
**Изменения**:
- `simulator/finish` — после успешного result `messages` обнуляется (`SET messages = '[]'`). История больше не нужна: idempotency держится через `result_hash`.
- `analysis_sessions.input_text` — truncate до 500 символов (`truncStored()`) перед `INSERT` во всех 7 analysis endpoints (`wing`, `rejection`). Idempotency через `input_hash` сохранена.
- `first_messages.profile_text` — аналогичный `truncStored()` до 500.

### H4 — Промокоды без `expires_at` / `max_uses`, нет rate-limit
**Файл**: `backend/src/routes/promo.js`
**Изменения**:
1. `SEED_BONUSES` теперь содержит `max_uses` (1000-5000) и `expires_at` (+90 дней от текущей даты). `INSERT OR IGNORE` обновлён с реальными значениями.
2. Rate-limit (5/час per-tg-user) подключён глобально через `promoLimiter` в `index.js`.
3. Все ветки fail (`empty`/`not_found`/`expired`/`max_uses_reached`/`already_used`) логируются в `admin_audit_log` через `logPromoFail()` с замаскированным кодом (`code.slice(0,3) + '***'`).

### H5 — `request_logs.endpoint` хранит query string
**Файл**: `backend/src/middleware/logger.js`
**Изменения**: `safeUrl = String(url).split('?')[0]` используется и в console.log, и в DB-insert.

---

## 🟡 Medium

### M1 — Global error handler не валидирует `err.status`
**Файл**: `backend/src/index.js`
**Изменения**: `status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500`.

### M2 — CORS пропускает `!origin`
**Файл**: `backend/src/index.js`
**Изменения**: В production `!origin` → `cb(null, false)`. `/health` подключён ДО CORS-middleware, поэтому health-check не затронут.

### M3 — ApiError body теряется при retries 5xx
**Статус**: Не закрыто (дебажный, не security). Sentry breadcrumbs в `mini-app/src/api.ts` оставлены без изменений — это PR/UX-задача, не аудит.

### M4 — `/admin/prompts/test` без ограничений
**Файл**: `backend/src/routes/admin.js`
**Изменения**: Введены константы `ALLOWED_TEST_MODELS = ['qwen/qwen3-235b-a22b-2507', 'meta-llama/llama-4-maverick']`, `MAX_TEST_TOKENS = 2000`, `MAX_TEST_INPUT = 5000`. Валидация: `test_input.length`, `finalTokens` через `Math.min`, whitelist проверки модели.

### M5 — HTML инъекция в `first_name`
**Файл**: `backend/src/routes/telegram.js`
**Изменения**: Добавлен local helper `escapeHtml()` (`&`/`<`/`>`/`"`/`'`). `msg.from?.first_name` обёрнут в `escapeHtml()` перед интерполяцией в greeting-text (parse_mode: HTML).

### M6 — `JSON.parse(session.messages)` без try/catch
**Файл**: `backend/src/routes/simulator.js`
**Изменения**: Добавлен `safeParse(raw, fallback)` helper. Все 5 вхождений `JSON.parse(session.messages || '[]')` заменены на `safeParse(session.messages, [])`.

### M7 — `INITDATA_TTL_SEC` = 7 дней
**Файл**: `backend/src/middleware/auth.js`
**Изменения**: Default 7 дней → 24 часа (`60 * 60 * 24`). Все `parseInt` в auth.js получили radix 10. Env-ключ `INITDATA_TTL_SEC=86400` добавлен в `.env.example`. Радикс 10 проставлен также в `admin.js`, `adminAuth.js`, `payments.js`, `index.js`, `limits.js`, `logCleanup.js` для всех `parseInt(process.env.*)`.

### M8 — Sentry `event.user` не маскируется
**Файл**: `mini-app/src/sentry.ts`
**Изменения**: В `beforeSend` добавлен блок маскировки `event.user.id` (первые 4 символа + `***`).

### M9 — CloudStorage без шифрования
**Файл**: `mini-app/src/utils/cloudSync.ts`
**Изменения**: Не шифруем (риск низкий, TG enforces namespace per-account). Добавлен подробный note в JSDoc-комментарий с обоснованием — данные plain text by design, шифровать имеет смысл только при появлении медицинских/финансовых PII.

---

## 🟢 Low / Hardening

### L1 — username не маскируется в `recent_users`
**Файл**: `backend/src/routes/admin.js`
**Изменения**: `username: u.username ? \`${String(u.username).slice(0, 2)}***\` : null`.

### L2 — Пустой `MIGRATIONS`
**Файл**: `backend/src/db/index.js`
**Изменения**: Добавлена стартовая миграция `001_init_marker` (без DDL, маркер инфры) — теперь pipeline миграций проверяется при первом старте.

### L3, L5, L6, L9, L10, L11
**Статус**: Не требуют действий — уже OK по аудиту (информационные/корректные реализации).

### L4 — `POLZA_API_KEY` мог утекать через `networkErr.cause`
**Файл**: `backend/src/services/polza.js`
**Изменения**: В catch network-ошибки логируется только `err.code` (или `'NETWORK_ERROR'` fallback), `lastErr` теперь `Network error: ${code}` без `networkErr.message`/`cause`.

### L7 — IndexedDB DB_NAME глобален per-origin
**Файл**: `mini-app/src/utils/indexedDB.ts`
**Изменения**: Введён `getDbName()` который читает `Telegram.WebApp.initDataUnsafe.user.id` и возвращает `cupidon-photos-${id}` (или `cupidon-photos-anon` вне TG). `openDb()` использует `getDbName()` вместо константы.

### L8 — CORS errors → 500
**Файл**: `backend/src/index.js`
**Изменения**: CORS callback теперь устанавливает `err.status = 403; err.code = 'CORS_NOT_ALLOWED'`. Добавлен отдельный CORS-error-handler ДО global error handler, возвращающий 403 с понятным сообщением.

---

## TMA-specific

### TMA1 — `expires_at` без CHECK
**Статус**: Информационное. SQLite не enforces CHECK на дату; код использует `datetime(expires_at)` при сравнении. Без изменений.

### TMA2 — `start_param` без валидации длины
**Файл**: `backend/src/db/index.js`
**Изменения**: В `upsertUserFromInitData`: `safeStartParam = startParam != null ? String(startParam).slice(0, 256) : null`.

### TMA3 — `polls` UPSERT с изменением выбора
**Файл**: `backend/src/routes/polls.js`
**Изменения**: `ON CONFLICT(poll_id, telegram_user_id) DO UPDATE` заменён на `DO NOTHING`. Голос фиксируется один раз, повторный POST не меняет статистику.

---

## Новые env-переменные (в `.env.example`)

| Ключ | Назначение | Default | Required prod |
|---|---|---|---|
| `TG_BONUS_CHANNEL_ID` | id канала для проверки подписки (формат -100xxx) | empty (DEV) | YES |
| `INITDATA_TTL_SEC` | TTL initData в секундах | 86400 | optional |

## Зависимости / нерешённое

- M3 — не security-fix, оставлен как UX-PR на будущее.
- M9 — закрыт как "не нужно" с обоснованием в JSDoc.
- Аудит M2 требовал проверки что `/health` не ломается. Проверено: `cb(null, false)` в `cors` package означает "не добавлять CORS-заголовки, но не прерывать запрос" — curl/мониторинг без Origin продолжают работать (CORS — это браузерная политика, server-to-server не задействует). `/health` отвечает 200 OK как и раньше. Если в проде мониторинг ходит через браузер с Origin — добавить его в `CORS_ALLOWED_ORIGINS`.
- Все правки сделаны без `npm install` (зависимостей не добавлено). `callBotApi` уже импортируется в `bot-api.js`, `rateLimit` уже импортируется в `index.js` — новых deps не требуется.
