# Phase C — заметки

> Что сделано в фазе портирования backend-роутов и на что обратить внимание при ревью.

## Состав

| Файл | Статус | Комментарий |
|---|---|---|
| `routes/users.js` | ✅ | `/me`, `PUT /me`, `/subscription`, `/stats`, `/claim-tg-bonus`, `DELETE /me`. Транзакционное удаление PII, финансовая история (subscriptions/payments) остаётся. |
| `routes/analysis.js` | ✅ | wing / quick-reply / rejection / reboot / date-invite / style-shift / support / history. Без `lang=en` веток. |
| `routes/simulator.js` | ✅ | start / message / finish / ai-girl / analyze / hints. Кеш разбора через `result_hash`. |
| `routes/firstMessage.js` | ✅ | generate. |
| `routes/contacts.js` | ✅ | CRUD + pin. |
| `routes/admin.js` | ✅ | Теперь под `requireAdminTg` (RBAC по `ADMIN_TELEGRAM_IDS`). |
| `routes/promo.js` | ✅ | apply. Идемпотентность по `(promo_code_id, telegram_user_id)`. |
| `routes/polls.js` | ✅ | today / vote. Без EN-колонок. |
| `routes/payments.js` | ✅ | `POST /payments/invoice` — создание Stars invoice link. Plans: basic/premium/day_pass. |
| `routes/telegram.js` | ✅ | Webhook handler. `/start` / `/paysupport` / `/help` / `pre_checkout` / `successful_payment`. timingSafeEqual для X-Telegram-Bot-Api-Secret-Token. |
| `middleware/auth.js` | ✅ | TG initData HMAC + `requireAdminTg`. |
| `middleware/logger.js` | ✅ | PII-санитайзинг, `logAICall` для роутов после `callAI`. |
| `middleware/adminAuth.js` | ✅ | Legacy admin-secret для CLI/curl — переименован `requireAdminSecret`. |
| `db/schema.sql` | ✅ | `telegram_user_id` везде. Subscriptions + payments + promo_codes + promo_uses. |
| `db/index.js` | ✅ | better-sqlite3 + WAL + helpers `upsertUserFromInitData`/`getActiveSubscription`/`getUserTier`. |
| `db/seed.js` | ✅ | Промпты (14 ключей) upsertятся при каждом старте. |
| `db/polls_seed.js` | ✅ | ~100 опросов, idempotent по slug, без EN-полей. |
| `services/bot-api.js` | ✅ | undici ProxyAgent. Все TG API вызовы через него. |
| `services/polza.js` | ✅ | Скопировано как есть. Qwen3 235B primary + fallback цепочки. |
| `services/cache.js` | ✅ | Redis опциональный. Если `REDIS_URL` пуст — кеш отключён. |

## Идемпотентность платежей

Критично — TG ретраит webhook'и при таймауте >35-40s.

- Таблица `payments` UNIQUE по `charge_id` (telegram_payment_charge_id).
- В `telegram.js handleSuccessfulPayment`:
  ```js
  INSERT OR IGNORE INTO payments (...)
  if (ins.changes === 0) return;  // уже processed — выходим
  ```
- Подписка продлевается через `INSERT INTO subscriptions` с `expires_at = max(now, existing_expires) + days`. Double-processing физически невозможен.

## Что осталось на потом (явные TODOs)

1. **`/claim-tg-bonus`** — сейчас доверяет фронту что юзер подписался на TG-канал. На ревью добавить проверку через `getChatMember(channel_id, telegram_user_id)` из bot-api.js.
2. **Reconciliation cron** — Phase I. Webhook'и теряются → раз в N минут вытягивать актуальное состояние из ЮКассы для `pending` платежей.
3. **YooKassa интеграция** — Phase I. Сейчас только Stars.
4. **Auto-renew для подписок** — в schema есть `auto_renew` колонка. Логика обработки — Phase I.
5. **CSP/CSAM фильтры на LLM** — для РФ-аудитории критично (UK ст. 242.1). Pre-filter и post-filter в analysis.js / simulator.js. Phase H/I.
6. **Self-host telegram-web-app.js** — сейчас в `index.html` загружается с CDN telegram.org. Phase L.

## Известные edge-cases

- В `users.js DELETE /me` — записи `subscriptions` и `payments` остаются (финансовая история). Если юзер хочет полного забвения — это требует обезличивания (`telegram_user_id` → hash). Это **не нарушение 152-ФЗ** при условии что в Privacy Policy указано хранение финансовых данных по 54-ФЗ. Но `/me` после удаления вернёт 404 — фронт должен показать «аккаунт удалён, чтобы вернуться зарегистрируйся снова».
- `claim-tg-bonus` без реальной проверки подписки → пока в DEV-режиме можно фармить +5. В production выставить проверку.
- `payments_router` создаёт invoice через TG но не через ЮКассу. ЮК-инвойсы — Phase I.

## Что обязательно сделать ДО первого деплоя (Phase L)

1. Заполнить `.env` боевыми значениями (POLZA_API_KEY, BOT_TOKEN, TG_API_PROXY, TELEGRAM_WEBHOOK_SECRET, ADMIN_TELEGRAM_IDS, PAYOUT_ENCRYPTION_KEY).
2. `npm install` в `backend/` — better-sqlite3 компилируется из C++, нужен build-essential.
3. Запустить `node src/index.js` — увидеть в логах `[db] better-sqlite3 connected` + порт.
4. `curl localhost:3001/health` → `{ok:true, ...}`.
5. На прод-сервере: `scripts/setup-webhook.js` зарегистрирует webhook через Hetzner-прокси.
