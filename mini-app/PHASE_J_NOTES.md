# Phase J — Legal / Admin / Sentry / Themes

Финальная фаза порта Купидона на TMA. Добавлены:

1. `screens/TermsScreen.tsx` — оферта (11 разделов, РФ).
2. `screens/PrivacyScreen.tsx` — Политика конфиденциальности (11 разделов, по 152-ФЗ).
3. `screens/AdminScreen.tsx` — RBAC админка с 4 табами (Статистика, Промпты, Логи, Audit).
4. `screens/ThemeScreen.tsx` — выбор из 8 тем.
5. `contexts/ThemeContext.tsx` — провайдер темы, persistence в `storage.global['theme.id']`.
6. `theme.css` — расширен 7 темами (light/velvet/midnight/rose/forest/aurora/carbon). Цвета взяты 1-в-1 из RN `ThemeContext.js`.
7. `sentry.ts` (frontend) — условная инициализация Sentry с beforeSend-фильтром PII.
8. `backend/src/sentry.js` — серверный Sentry-модуль (опциональный, динамический импорт `@sentry/node`).
9. `package.json` — добавлена зависимость `@sentry/react@^8.45.0`.
10. `main.tsx` — `initSentry()` до `createRoot`, `<ThemeProvider>` обёрнут вокруг `<App />` и `<Landing />`.
11. `SettingsScreen.tsx` — пункт «Тема» теперь ведёт на `/theme`; добавлен раздел «Администрирование» с ссылкой на `/admin` (только для `me.is_admin`).
12. `api.ts` — в конец добавлен блок `adminApi` (getPrompts, updatePrompt, testPrompt, getStats, getLogs, getAuditLog, getModels).

---

## ⚠️ Wiring в App.tsx — обязательно к замене

Поскольку `App.tsx` не редактировался (в плане сказано не трогать его — параллельная работа с главным Claude), нужно заменить заглушки на реальные компоненты. Diff:

```diff
- import {
-   FirstMessageStub, RejectionStub, SupportStub,
-   CommunityStub, TutorialStub,
-   TermsStub, PrivacyStub, AdminStub,
- } from './screens/stubs';
+ import {
+   FirstMessageStub, RejectionStub, SupportStub,
+   CommunityStub, TutorialStub,
+ } from './screens/stubs';
+ import { TermsScreen } from './screens/TermsScreen';
+ import { PrivacyScreen } from './screens/PrivacyScreen';
+ import { AdminScreen } from './screens/AdminScreen';
+ import { ThemeScreen } from './screens/ThemeScreen';
```

И заменить routes:
```diff
- <Route path="/terms"   element={<TermsStub />} />
- <Route path="/privacy" element={<PrivacyStub />} />
- <Route path="/admin"   element={<AdminStub />} />
+ <Route path="/terms"   element={<TermsScreen />} />
+ <Route path="/privacy" element={<PrivacyScreen />} />
+ <Route path="/admin"   element={<AdminScreen />} />
+ <Route path="/theme"   element={<ThemeScreen />} />
```

Также в `screens/stubs.tsx` можно удалить экспорты `TermsStub`, `PrivacyStub`, `AdminStub` (или оставить как dead-code — main Claude решит).

---

## ⚠️ Backend wiring (опционально)

Если хочется включить серверный Sentry — в `backend/package.json` добавить:
```json
"@sentry/node": "^8.45.0"
```

И в `backend/src/index.js` подключить (после `import 'dotenv/config'`):
```js
import { initSentry, sentryRequestHandler, sentryErrorHandler } from './sentry.js';
await initSentry();
// ... после CORS, до роутов:
app.use(sentryRequestHandler());
// ... после всех роутов, ДО глобального error handler:
app.use(sentryErrorHandler());
```

Без `SENTRY_DSN` в env — модуль self-skip'нется. Установка пакета не обязательна на dev/staging.

---

## ⚠️ Placeholder'ы, обязательные к замене юристом

Перед публичным запуском в магазинах Telegram (или в любой публичной коммуникации) необходимо заменить **ВСЕ** следующие placeholder'ы реальными данными ИП/самозанятого:

### `TermsScreen.tsx` (Условия использования)
- `[BUSINESS_NAME]` — ФИО ИП / самозанятого.
- `[BUSINESS_INN]` — ИНН.
- `[BUSINESS_OGRNIP]` — ОГРНИП (если ИП). Для самозанятого — убрать строку.
- `[BUSINESS_ADDRESS]` — юридический адрес / адрес регистрации.
- `[SUPPORT_EMAIL]` — e-mail поддержки.
- `[SUPPORT_TG_USERNAME]` — @username TG-аккаунта поддержки.
- `[PAYMENT_PROVIDER_DETAILS]` — реквизиты эквайера (ЮKassa и т.п.), когда подключите. Сейчас — упоминание условно.

### `PrivacyScreen.tsx` (Политика конфиденциальности)
- `[BUSINESS_NAME]`, `[BUSINESS_INN]`, `[BUSINESS_ADDRESS]` — те же.
- `[PRIVACY_EMAIL]` — отдельный (или тот же) e-mail для обращений по 152-ФЗ.
- `[RKN_REGISTRATION_NUMBER]` — номер в реестре операторов ПДн Роскомнадзора. **Зарегистрироваться обязательно ДО запуска** (rkn.gov.ru → «Подать уведомление об обработке ПДн»).
- `[POLZA_DPA_REF]` — ссылка / номер DPA с polza.ai (или текст «обработка по публичной оферте polza.ai»).
- `[PAYMENT_PROVIDER_DETAILS]` — тот же placeholder, что в Terms.

### Дата
- `LAST_UPDATED` в обоих файлах сейчас `01.06.2026` (текущая дата сессии). Обновить при финальной редакции.

---

## ⚠️ Юридические TODO (помимо текста)

1. **Возрастной гейт.** В Terms сказано «18+», но фактически проверки нет. Рассмотреть добавление чекбокса возраста на онбординге (если не реализовано в Phase E).
2. **Согласие на обработку ПДн.** В TMA согласие подразумевается через факт использования. Для надёжности — на онбординге показать чекбокс «Согласен с Политикой конфиденциальности» (если не реализовано).
3. **РКН-уведомление.** Подать через rkn.gov.ru до публичного запуска. Получить регистрационный номер → в `PrivacyScreen.tsx`.
4. **Самозанятый vs ИП.** Если регистрируете самозанятого — упростить п.1 Terms (убрать ОГРНИП). Если ИП — расширить.
5. **Возврат подписки Stars.** Telegram автоматически обрабатывает refund через `/paysupport` команду бота — убедиться, что бот её отвечает.
6. **CSAM-репортинг.** Если получили жалобу/обнаружили — обязательное сообщение в РКН + правоохранительные органы по 149-ФЗ. Документировать процесс.

---

## Sentry env vars

### Frontend (Vite)
- `VITE_SENTRY_DSN` — DSN из Sentry-проекта (опционально). Без него `initSentry()` no-op.
- `VITE_BUILD_VERSION` — версия билда для тегирования release (уже используется).

### Backend (Node)
- `SENTRY_DSN` — DSN backend-проекта (опционально).
- `SENTRY_RELEASE` — версия (опционально, default: `cupidon-backend@${npm_version}`).

PII-фильтр `beforeSend`:
- Authorization headers → `[redacted]`
- `initData` / `tgWebAppData` в body / query → `[redacted]`
- Строки > 500 символов → truncate с маркером
- Network noise (`NetworkError`, `Failed to fetch`, `ECONNRESET` и т.д.) → drop (не флудим квоту)
- `telegram_user_id` / `tg_id` / `user_id` в URL → маска

`tracesSampleRate`: 0.1 frontend, 0.05 backend. Replay выключен (heavy + PII risk).

---

## Темы

Идиоматичный для веба паттерн: 8 тем определены через `:root[data-theme='X']` в `theme.css`. JS-код через `useTheme()` только меняет атрибут `<html data-theme="X">` — все cascade-stylings срабатывают мгновенно, никаких пере-рендеров.

8 тем:

| ID         | Название    | Accent     | BG        |
|------------|-------------|------------|-----------|
| `dark`     | Тёмная      | `#F43F5E`  | `#09090B` |
| `light`    | Светлая     | `#E8384F`  | `#FAF8F4` |
| `velvet`   | Золото      | `#D4A843`  | `#0E0A04` |
| `midnight` | Полночь     | `#3B82F6`  | `#04060F` |
| `rose`     | Роза        | `#EC4899`  | `#0F0810` |
| `forest`   | Лес         | `#10B981`  | `#040C07` |
| `aurora`   | Аврора      | `#8B5CF6`  | `#07050F` |
| `carbon`   | Карбон      | `#06B6D4`  | `#050505` |

Хранится в `storage.global['theme.id']` — общий ключ для всех TG-аккаунтов на устройстве (тема — это вкусовщина, а не привязка к юзеру).

Также красится `<meta name="theme-color">` — TG WebView читает её для подкраски статус-бара. На случай отсутствия meta-тега в `index.html` — `applyDocTheme` тихо пропустит.

**TODO:** Если в `mini-app/index.html` ещё нет `<meta name="theme-color" content="#09090B">` — стоит добавить.

---

## Admin RBAC

Сейчас гейт на `me.is_admin` (бэк проверяет `ADMIN_TELEGRAM_IDS`). Никакой ввод admin-секрета не нужен — initData достаточно. Отличается от RN-версии, где требовался `cupidon-admin-...` секрет (Keychain).

Для curl/CLI операций фоллбэк через `X-Admin-Secret` оставлен на бэке (`requireAdminSecret`).

Все админские мутации логируются в `admin_audit_log` с `by_tg: req.tgUser?.id` — кто что менял видно во вкладке «Audit».
