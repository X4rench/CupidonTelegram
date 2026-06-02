# Security Audit — Купидон TMA

Дата: 2026-06-01
Аудитор: Claude (Opus 4.7)
Скоуп: `D:\TwinStars\Купидон-TMA\` (backend + mini-app)
Главный коммит ветки: `16-version`

## Сводка

- 🔴 Critical: 1
- 🟠 High: 5
- 🟡 Medium: 9
- 🟢 Low / Hardening: 11
- ✅ Что сделано правильно (highlights):
  - HMAC-валидация initData реализована корректно (constant-time `timingSafeEqual`, правильный `secret_key = HMAC(BOT_TOKEN, 'WebAppData')`, удаляется `signature` перед сборкой `data_check_string`).
  - В production fatal-exit при `DEV_BYPASS_INITDATA=1` (auth.js:35-38).
  - Webhook secret сверяется через `timingSafeEqual` с проверкой длины (telegram.js:41-51).
  - Идемпотентность платежей через `payments.charge_id UNIQUE` + `INSERT OR IGNORE` + `processed_at` в одной транзакции (telegram.js:199-248).
  - pre_checkout_query валидирует `payload.tg_user_id === query.from?.id` (telegram.js:161).
  - Whitelist `photo_uri` (contacts.js:39-47) запрещает `data:image/svg+xml`, `javascript:`, `data:text/html`.
  - Все SQL запросы parameterized (better-sqlite3 `prepare(...).run/get/all(...)`), нет конкатенаций строк.
  - Промпт-инъекция: `sanitizeForPrompt` снимает `{}`, ``` ``` и известные триггеры (`promptSanitize.js`).
  - AI-output валидаторы (`aiSchemas.js`) клампят score, фильтруют enum, обрезают длину — защита от prompt-injection через JSON-эмиссию.
  - `request_logs` сохраняет только `sanitize()` версии req.body, а не plain text переписки (logger.js:101-110).
  - Глобальные security-headers выставлены (X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, Cache-Control: no-store) в index.js:41-48.
  - Webhook routes подключены ДО глобального `requireInitData` (index.js:92 vs 95) — порядок верный.
  - Admin endpoint фильтрует `telegram_user_id` в `recent_users` (admin.js:148-151).
  - Log retention 90/180 дней с автоочисткой (`logCleanup.js`).
  - `.env` в `.gitignore` (обоих проектов).

---

## 🔴 Critical findings

### C1. CSP отсутствует на фронте — открытый XSS-сурфейс
**Файл**: `mini-app/public/_headers:1-19`
**Проблема**: Файл `_headers` для Cloudflare Pages не содержит `Content-Security-Policy`. В `index.html` (mini-app/index.html:11) грузится внешний скрипт `https://telegram.org/js/telegram-web-app.js` (т.е. внешний JS без SRI/integrity). Если CDN telegram.org будет скомпрометирован/перехвачен или если злоумышленник найдёт reflection через user-input (например, в notes, name контактов которые рендерятся в React), `<script>`-инъекция, `javascript:` URL'ы и сторонние трекеры не блокируются.
Дополнительно: `X-Frame-Options: ALLOWALL` (строка 9) — это эквивалент отсутствия защиты. TMA это требует, но CSP `frame-ancestors` дал бы более точный whitelist (`https://web.telegram.org https://*.telegram.org`).
**Impact**: XSS, кража initData из localStorage (где он не лежит, но кэш и пользовательский профиль — лежит), кража токенов сессии в браузерных вкладках, MitM при загрузке telegram-web-app.js.
**Fix**:
```
# В _headers
/
  Content-Security-Policy: default-src 'self'; script-src 'self' https://telegram.org; connect-src 'self' https://api.your-domain.ru https://*.sentry.io; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors https://web.telegram.org https://*.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```
И добавить `integrity="sha384-..."` + `crossorigin="anonymous"` для `<script src="https://telegram.org/js/telegram-web-app.js">` или self-host этого файла (как помечено в `index.html:9-10` TODO).

---

## 🟠 High findings

### H1. `/users/claim-tg-bonus` не верифицирует подписку на канал
**Файл**: `backend/src/routes/users.js:129-149`
**Проблема**: Endpoint просто проставляет `tg_bonus_claimed = 1` и инкрементирует квоту без проверки реальной подписки на TG-канал. В комментарии (`users.js:127-128`) явно стоит TODO. Любой юзер может POST'нуть `/users/claim-tg-bonus` и получить +5 бесплатных AI-генераций.
**Impact**: Бесплатная эксплуатация AI-токенов (Polza.ai стоит реальных денег: ~14₽/1M input по Qwen3). При массовом фарме (новые TG-аккаунты × +5 на каждого) — реальная финансовая утечка.
**Fix**:
```js
import { callBotApi } from '../services/bot-api.js';
const REQUIRED_CHANNEL = process.env.TG_BONUS_CHANNEL_ID; // -100xxxxxxxxxx

router.post('/claim-tg-bonus', async (req, res) => {
  const user = db.get('SELECT * FROM users WHERE telegram_user_id = ?', req.tgUser.id);
  if (!user) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
  if (user.tg_bonus_claimed) return res.status(400).json({ ok: false, error: 'Бонус уже получен' });

  if (REQUIRED_CHANNEL) {
    try {
      const member = await callBotApi('getChatMember', { chat_id: REQUIRED_CHANNEL, user_id: req.tgUser.id });
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return res.status(403).json({ ok: false, error: 'Подпишись на канал' });
      }
    } catch (err) {
      return res.status(503).json({ ok: false, error: 'Не удалось проверить подписку' });
    }
  }
  // ... остальное как сейчас
});
```

### H2. Глобальный rate-limit ключ не учитывает auth — атака может сбить лимит другим юзерам с того же IP
**Файл**: `backend/src/index.js:67-74`
**Проблема**: `express-rate-limit` по умолчанию keying'ит по IP. При `TRUST_PROXY_HOPS=1` берёт первый X-Forwarded-For. Несколько Telegram-юзеров за одним мобильным CGNAT IP получают общий лимит в 30/min. Кроме того, нет специального rate-limit для:
- `/promo/apply` — позволяет перебор кодов
- `/users/claim-tg-bonus` — пока без verify это критично (см. H1)
- `/payments/invoice` — позволяет спам invoice'ов
- LLM endpoints — защищены только daily quota (если `LIMITS_ENABLED=1`), а скорость генерации не ограничена → DoS на Polza бюджет.
**Impact**: Юзер за корпоративным NAT/Wi-Fi блокирует других; перебор промокодов (см. H4); финансовая DoS на LLM.
**Fix**: Использовать `keyGenerator: (req) => req.tgUser?.id ? String(req.tgUser.id) : req.ip` (но это работает только после `requireInitData`). Поскольку лимитер сейчас стоит ДО auth-middleware (`app.use('/api/', limiter)` строка 74, а `requireInitData` — на 95), перенесите его внутрь `/api/v1/*` после auth:
```js
app.use('/api/v1', requireInitData);
const userLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  keyGenerator: (req) => req.tgUser?.id ? `tg:${req.tgUser.id}` : req.ip,
  message: { ok: false, error: 'Слишком много запросов' },
});
app.use('/api/v1/promo', rateLimit({ windowMs: 60_000, max: 5, keyGenerator: (req) => `tg:${req.tgUser.id}` }));
app.use('/api/v1/payments', rateLimit({ windowMs: 60_000, max: 10, keyGenerator: (req) => `tg:${req.tgUser.id}` }));
app.use('/api/v1', userLimiter);
```

### H3. Прямой dump переписок в БД через `simulator_sessions.messages`
**Файл**: `backend/src/routes/simulator.js:117, 344` + `backend/src/db/schema.sql:132`
**Проблема**: `simulator_sessions.messages` хранит всю переписку юзера с AI-симулятором (включая сцены чувствительного характера) в plain text. `analysis_sessions.input_text` (schema.sql:113) — тоже plain переписка с реальными девушками, имена и контекст. `first_messages.profile_text` — фрагменты профилей из дейтинг-приложений (потенциально PII — фамилии, телефоны если юзер вставил). Это PII по 152-ФЗ. При утечке БД у RU-хостинга — компромат на тысячи юзеров.
**Impact**: Утечка PII + риск отказа в аккредитации Роскомнадзора; репутационный риск.
**Fix**: Минимум — хэшировать `input_text` для идемпотентности и не хранить полный текст после успешного анализа (только score+result). Или шифровать через `crypto.subtle` с ключом из env (AES-256-GCM, ключ ротировать). Для `simulator_sessions.messages` можно очищать сразу после `finish` (передавать result, удалять messages).
```js
// в simulator/finish после успешного result
db.run('UPDATE simulator_sessions SET messages = ? WHERE id = ?', '[]', sid);
```
Для analysis — клиппинг raw `input_text` до 500 символов с пометкой `[truncated]` после успешного ответа.

### H4. Промокоды легко угадываемые + нет rate-limit на /promo/apply
**Файл**: `backend/src/routes/promo.js:23-39, 43-116`
**Проблема**: Дефолтные промокоды `CUPIDON10`, `LAUNCH2026`, `BETA50`, `ARROW2026` хранятся в env (по факту в коде как дефолт). Они дают `sub_trial` на 7/14/30/60 дней basic. С учётом, что:
1. Нет rate-limit конкретно на `/promo/apply` (только глобальный 30/min)
2. Коды короткие, в верхнем регистре, без энтропии
3. `INSERT OR IGNORE` идемпотентность — но если один TG-юзер перебрал, он может использовать каждый код один раз
…то любой юзер быстро получит 7+14+30+60 = **111 дней бесплатного basic**. Никакого `expires_at` на самих кодах нет — они вечные (строка 38: `expires_at NULL`).
**Impact**: Финансовая утечка — массовый бесплатный basic тариф.
**Fix**:
1. Дефолтные коды должны иметь `expires_at` (например, +90 дней от launch) и `max_uses` (например, 1000).
2. Per-user rate-limit на `/promo/apply`: 3 попытки в час → потом блок.
3. Логировать неудачные попытки в `admin_audit_log` (`promo_attempt_fail`).
```js
// Добавить в promo.js
const promoLimiter = rateLimit({ windowMs: 3600_000, max: 5, keyGenerator: (req) => `promo:${req.tgUser.id}` });
router.post('/apply', promoLimiter, (req, res) => { ... });
```
И обновить `SEED_BONUSES`:
```js
const SEED_BONUSES = {
  CUPIDON10:  { kind: 'sub_trial', payload: {...}, max_uses: 5000, expires_at: '2026-09-01T00:00:00Z' },
  ...
};
```

### H5. `request_logs.endpoint` хранит `req.originalUrl` с query string — потенциальная утечка PII в логах
**Файл**: `backend/src/middleware/logger.js:84, 101-110`
**Проблема**: `req.originalUrl` включает query string. Если разработчик случайно поставит данные в query (например, `?text=...` или ID в URL), оно попадёт в БД. Сейчас query-string не используется для PII полей (всё в body), но это hardening на будущее. Также `sanitize()` не вырезает PII из URL (`url` логируется отдельно строкой 84, 86-90).
**Impact**: Низкий сейчас, но при будущих изменениях routes (например `/contacts?search=имя`) PII утечёт в `request_logs`.
**Fix**:
```js
const safeUrl = String(url).split('?')[0]; // только path, без query
// логируем safeUrl
db.run(`INSERT INTO request_logs ...`, tgId, safeUrl, method, ...);
```

---

## 🟡 Medium findings

### M1. Глобальный error handler пробрасывает `err.status` без валидации
**Файл**: `backend/src/index.js:114-123`
**Проблема**: `res.status(err.status || 500)` — если злоумышленник может бросить ошибку с `err.status = 200`, ответ будет 200 OK с error body. Также в DEV (`NODE_ENV !== 'production'`) пробрасывается `err.message` целиком (может включать stack info через `.toString()`). Допустимо в dev, но `error_id` светится в проде что хорошо для дебага.
**Impact**: Минимальный (внутренний код контролируем), но 200-with-error-body может сбить мониторинг.
**Fix**:
```js
const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
res.status(status).json({ ok: false, error: isProd ? 'Внутренняя ошибка' : err.message, error_id });
```

### M2. CORS `cb(null, true)` на `!origin` — слишком разрешительно для server-to-server и curl
**Файл**: `backend/src/index.js:55-58`
**Проблема**: `if (!origin) return cb(null, true);` — пропускает без Origin (curl, Postman, server-to-server). Сейчас initData всё равно требуется для `/api/v1/*`, так что серьёзного риска нет. Но это снимает CORS как defense-in-depth слой.
**Impact**: Низкий — initData всё равно нужен. Но при появлении публичных endpoint (например, `/payments/prices` сейчас public под initData) — стоит ужесточить.
**Fix**: Разрешать `!origin` только для `/health`, остальное требует Origin в whitelist.

### M3. ApiError body теряется при retries 5xx
**Файл**: `mini-app/src/api.ts:42-66`
**Проблема**: При 5xx ответе с `lastError = err; continue;` (строки 59-62) текст ошибки от сервера сохраняется в `lastError`, но через 3 попытки бросается. Если 5xx содержал `error_id`, юзер увидит "Внутренняя ошибка сервера". Это OK, но `error_id` стоит логировать в Sentry breadcrumb для корреляции.
**Impact**: Дебажный, не security.
**Fix**: В catch на финальном retry — `reportError(err, { error_id: err.body?.error_id })`.

### M4. `/admin/prompts/test` позволяет любую модель и любой промпт — обход бюджета
**Файл**: `backend/src/routes/admin.js:95-130`
**Проблема**: Админ может через `prompts/test` запросить произвольную модель с произвольным system_prompt и `max_tokens` (не ограничен). Если admin-аккаунт скомпрометирован → можно жечь токены Polza произвольно (Llama-4-Maverick дороже, например). Также `test_input` не ограничен по длине.
**Impact**: Зависит от компрометации админ-аккаунта (требует TG ID в allowlist). Defense-in-depth.
**Fix**:
```js
if (test_input.length > 5000) return res.status(400).json({ ok: false, error: 'test_input ≤ 5000' });
finalTokens = Math.min(finalTokens || 500, 2000);
const ALLOWED_MODELS = ['qwen/qwen3-235b-a22b-2507', 'meta-llama/llama-4-maverick'];
if (model && !ALLOWED_MODELS.includes(model)) return res.status(400).json(...);
```

### M5. Bot-API `sendMessage` использует `parse_mode: 'HTML'` + неэкранированное `msg.from.first_name`
**Файл**: `backend/src/services/bot-api.js:56-58` + `backend/src/routes/telegram.js:95`
**Проблема**: `sendMessage` по умолчанию выставляет `parse_mode: 'HTML'`. В `handleMessage` строится: `` `Привет, ${msg.from?.first_name || 'друг'}!\n\n` ``. Если у юзера first_name = `<b>тест</b>` или `<a href="https://evil.com">link</a>` — это рендерится. TG отбросит невалидный HTML с error, но `<b>`/`<i>`/`<a>` пройдут.
**Impact**: TG обернёт ответ ошибкой если HTML битый (бот молчит). Если валидный — phishing-ссылки в собственном ответе бота. Минорно.
**Fix**:
```js
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const greeting = `Привет, ${escapeHtml(msg.from?.first_name || 'друг')}!\n\n` + ...
```
Либо `parse_mode: undefined` по умолчанию (a в `sendMessage` принимать опционально).

### M6. `simulator.js` — `JSON.parse(session.messages)` без try/catch
**Файл**: `backend/src/routes/simulator.js:88, 138, 207, 256, 317`
**Проблема**: Если запись `simulator_sessions.messages` будет битая (например, после ручного редактирования DB или миграции), parse упадёт необработанным исключением → попадёт в global error handler → юзер увидит 500.
**Impact**: Operational, не security. Но при компрометации админ-аккаунта/прямом доступе к БД (см. ниже) — потенциальный DoS через bad data.
**Fix**: Обернуть в try/catch с fallback `[]`.

### M7. `INITDATA_TTL_SEC = 7 days` — длинное окно для украденной initData
**Файл**: `backend/src/middleware/auth.js:26`
**Проблема**: 7 дней — это потенциально проблема, если initData украден через XSS/DevTools/clipboard. За 7 дней атакующий может фармить лимиты, читать переписки, удалить аккаунт. В комментарии (auth.js:21-25) автор это осознанно — "украденный initData всё равно даёт доступ только к аккаунту жертвы, не к деньгам" — но `/users/me DELETE` всё равно catastrophic для юзера.
**Impact**: Зависит от наличия XSS вектора (см. C1). Без CSP — реален.
**Fix**: Снизить до `60 * 60 * 24` (24 часа). Telegram WebApp при reload получает свежий initData. Альтернатива — refresh-mechanism через cookie или token rotation.

### M8. Sentry beforeSend не фильтрует `event.user` и `event.tags`
**Файл**: `mini-app/src/sentry.ts:64-112`
**Проблема**: `beforeSend` чистит `event.request.headers`, `event.extra`, `event.contexts`, `event.breadcrumbs`, `event.request.url`. Но не трогает `event.user` (Sentry может его автоматически заполнить если `Sentry.setUser({...})` вызывается где-то с TG данными) и `event.tags` (если в коде есть `Sentry.setTag('tg_user_id', ...)`).
**Impact**: PII в Sentry. Низкий, если в коде `Sentry.setUser/setTag` не вызывают (надо проверить — поиск показывает `setUser/setTag` нет в codebase, OK).
**Fix**: Превентивно почистить:
```js
if (event.user) {
  event.user = { id: event.user.id ? `${String(event.user.id).slice(0,4)}***` : undefined };
}
```

### M9. `cloudSync.ts` — данные пишутся в CloudStorage без шифрования
**Файл**: `mini-app/src/utils/cloudSync.ts:131-188`
**Проблема**: `cup_profile` (содержит user_profile с возрастом, опытом, целями) и `cc_<id>` (кастомные контакты с именем, типажом, заметками) пишутся в TG CloudStorage plaintext. CloudStorage — это серверы Telegram, привязан к TG-аккаунту, контролируется самим юзером. Однако если юзер делится телефоном с другим (sim swap) или TG-аккаунт компрометирован — атакующий получит этот dump.
**Impact**: TG enforces namespace per-account, так что cross-user leak невозможен. Зависит от TG-аккаунт security.
**Fix**: Опционально — шифровать через `crypto.subtle` с ключом, выводимым из initData hash. Не критично.

---

## 🟢 Low / Hardening

### L1. `recent_users` в `/admin/stats` маскирует tg_id (4 первых цифры) — username при этом полностью виден
**Файл**: `backend/src/routes/admin.js:144-151`
Если username связан с человеком, маскировка ID не помогает.

### L2. `MIGRATIONS = []` пустой — нет audit-trail на схему
**Файл**: `backend/src/db/index.js:32-34`
Все ALTER должны идти через `MIGRATIONS`. Сейчас если ктото поправит `schema.sql`, на старом инстансе колонка не появится (CREATE IF NOT EXISTS не делает ALTER).

### L3. `db.transaction` в `payments.js`/`telegram.js` не возвращает значение, но используется как функция — `db.transaction(fn)()` корректно
**Файл**: `backend/src/db/index.js:70-72`
Правильно. Но лучше документировать что транзакции синхронные (`better-sqlite3` это требует).

### L4. `POLZA_API_KEY` логируется в виде сетевой ошибки если запрос упал
**Файл**: `backend/src/services/polza.js:138-140`
`networkErr.cause?.message` может содержать частично URL с заголовками. Не критично, но стоит логировать только `code`.

### L5. `analysis_sessions.input_hash` хеш короткий (32 hex = 128 бит) — collision вероятность минимальна, OK
**Файл**: `backend/src/routes/analysis.js:31`
ОК. Информационно.

### L6. `setup-webhook.js` — не печатает BOT_TOKEN, OK
**Файл**: `backend/scripts/setup-webhook.js`
Корректно, всё через `.env`.

### L7. `IndexedDB DB_NAME = 'cupidon-photos'` глобален per-origin — теоретически кросс-TG-юзер leak фото на одном устройстве
**Файл**: `mini-app/src/utils/indexedDB.ts:17`
Если юзер выходит из TG-аккаунта A и заходит в B на том же устройстве — IndexedDB shared. Фото из A остаются и привязываются через avatar_ref в CloudStorage юзера B (через cloudSync). На практике вероятность низкая (TG WebView обычно — один аккаунт), но hardening: `const DB_NAME = `cupidon-photos-${tgId}`;` после auth.

### L8. CORS errors в Express дают 500 вместо 403
**Файл**: `backend/src/index.js:55-61`
`cb(new Error(...))` бросается до handler и улетает в global handler как 500. Юзер видит "CORS: origin не allowed" в проде если NODE_ENV != production. В проде маскируется. Низкое.

### L9. `parseAIJson` имеет `autoCloseJson` который может закрыть injection-friendly JSON
**Файл**: `backend/src/services/polza.js:203-232`
Логика разумная для битого LLM-вывода. Validator `aiSchemas.js` догоняет всё что важно (clampNum/enumOr). OK.

### L10. `request_logs` хранит status 4xx тоже — атакующие могут видеть свои попытки если получат admin
**Файл**: `backend/src/middleware/logger.js:100-110`
Стандарт. OK.

### L11. `ADMIN_SECRET` сравнивается через `timingSafeEqual` с предварительной проверкой длины (через сравнение dummy если длины разные)
**Файл**: `backend/src/middleware/adminAuth.js:89-102`
Корректно. ОК.

---

## TMA-specific findings

### TMA1. `expires_at` без NOT NULL CHECK
**Файл**: `backend/src/db/schema.sql:65`
NOT NULL стоит — OK. Но нет CHECK на формат ISO-даты. SQLite не enforces.

### TMA2. `start_param` из initData копируется в `users.start_param` без валидации
**Файл**: `backend/src/db/index.js:114, 84`
`startParam` приходит из initData (TG валидирует), но если кто-то поставит длинный реф-код в `?startapp=...` (через QR-spoofing), он попадёт в БД. Длину стоит ограничить.
**Fix**: В `upsertUserFromInitData` — `String(startParam ?? '').slice(0, 256)`.

### TMA3. `polls` записывает голос с UPSERT — пользователь может менять выбор бесконечно
**Файл**: `backend/src/routes/polls.js:55-59`
`ON CONFLICT DO UPDATE SET choice = excluded.choice` — формально пользовательский выбор изменяемый. Это может быть фича (autosave), но если опрос показывается публично (комьюнити-результаты), 1 юзер может крутить статистику. По умолчанию OK.

---

## Чек-лист для production

- [ ] **C1**: Добавить CSP в `_headers`. Self-host telegram-web-app.js или добавить SRI.
- [ ] **H1**: Реализовать `getChatMember` верификацию в `/users/claim-tg-bonus` или disable endpoint до Phase D.
- [ ] **H2**: Сделать rate-limit per-TG-user-ID (не по IP), добавить отдельные лимиты на `/promo/apply` (5/час), `/payments/invoice` (10/мин).
- [ ] **H3**: Чистить `simulator_sessions.messages` после `finish`. Рассмотреть encryption-at-rest для `analysis_sessions.input_text` и `first_messages.profile_text`.
- [ ] **H4**: Дефолтным промокодам выставить `expires_at` + `max_uses`. Добавить rate-limit на `/promo/apply`.
- [ ] **H5**: Вырезать query-string из `request_logs.endpoint`.
- [ ] **M5**: Эскейпить HTML в `msg.from.first_name` перед `parse_mode: 'HTML'`.
- [ ] **M7**: Снизить `INITDATA_TTL_SEC` до 24 часов (после фикса C1).
- [ ] Проверить, что `DEV_BYPASS_INITDATA=0` и `LIMITS_ENABLED=1` в проде.
- [ ] Проверить, что `ADMIN_TELEGRAM_IDS` не содержит дефолтное значение `794285476` из `.env.example` (если это не ваш TG).
- [ ] Установить `TELEGRAM_WEBHOOK_SECRET` минимум 32 hex (openssl rand -hex 32) и не комитить.
- [ ] Установить `ADMIN_SECRET` минимум 32+ символа.
- [ ] Заполнить `ADMIN_IP_ALLOWLIST` для X-Admin-Secret endpoint'ов.
- [ ] Проверить, что nginx пробрасывает `X-Telegram-Bot-Api-Secret-Token` (DEPLOY.md уже об этом упоминает).
- [ ] Установить `TRUST_PROXY_HOPS` ровно по nginx hops (обычно `1`).
- [ ] Настроить ротацию SQLite (бэкапы + WAL checkpoint).
- [ ] Sentry DSN заполнен в `mini-app/.env.production`.
- [ ] Проверить, что Polza.ai API key — production (не тестовый).
- [ ] Verify `LOGS_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS` — 90/180 OK по 152-ФЗ.

---

## Полезные ссылки на файлы

- Auth core: `backend/src/middleware/auth.js`
- Admin guard hybrid: `backend/src/routes/admin.js:20-27`
- Payment idempotency: `backend/src/routes/telegram.js:199-248`
- Prompt sanitizer: `backend/src/utils/promptSanitize.js`
- AI output validators: `backend/src/utils/aiSchemas.js`
- Frontend Sentry filter: `mini-app/src/sentry.ts:64-112`
- CSP file (нет CSP!): `mini-app/public/_headers`
- IndexedDB photos: `mini-app/src/utils/indexedDB.ts:17`
