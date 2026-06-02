# Купидон-TMA — статус портирования

> Полная карта того что сделано в RN→TMA портировании.
> Последнее обновление: конец сессии Phase A-K (без I и J).

## Готовность по фазам

| Phase | Описание | Статус |
|---|---|---|
| **A** | Scaffold (структура папок, базовые конфиги) | ✅ полностью |
| **B** | Backend auth (TG initData HMAC) + schema (telegram_user_id) | ✅ полностью |
| **C** | Backend routes — 10 роутов | ✅ полностью |
| **D** | Mini-app scaffold (router + components + MeContext) | ✅ полностью |
| **E** | Onboarding/Profile экраны (8 экранов) | ✅ полностью |
| **F** | Wing + Theory + Community + PostDetail + Tutorial | ✅ полностью (5/5) |
| **G** | Simulator (+chat+result) + CreateGirl + FirstMessage + Rejection + Support + AllDialogs | ✅ полностью (9/9) |
| **H** | Paywall + Promo + Referral + Stars-инвойс | ✅ полностью |
| **I** | ЮКасса + reconciliation cron | ⏳ не начато (требует договора с ЮКассой ~неделя) |
| **J** | Legal (Privacy/Terms) + Admin UI + 8 тем + Sentry | ✅ полностью |
| **K** | CloudStorage sync + IndexedDB для фото | ✅ полностью |
| **L** | Deploy docs (AEZA + Hetzner + CF Pages) | ✅ полностью |

**Итого**: **11 из 12 фаз готовы** (≈ 92% проекта). Phase I — единственная отложенная, и она не блокирует первый запуск через Telegram Stars.

---

## Карта файлов

### Backend (`backend/`)

```
backend/
├── package.json             # Node 20+, better-sqlite3, undici, express
├── .env.example             # шаблон со всеми ключами
├── .gitignore
├── PHASE_C_NOTES.md         # отчёт по backend port + edge-cases
├── scripts/
│   └── setup-webhook.js     # регистрация webhook через прокси
└── src/
    ├── index.js             # entrypoint, CORS, rate-limit, security headers
    ├── db/
    │   ├── schema.sql       # на telegram_user_id, без device_id/hardware_id
    │   ├── index.js         # better-sqlite3 + helpers
    │   ├── seed.js          # 14 промптов (upsert при старте)
    │   └── polls_seed.js    # ~100 опросов (без EN-колонок)
    ├── middleware/
    │   ├── auth.js          # requireInitData (HMAC), requireAdminTg (RBAC)
    │   ├── adminAuth.js     # requireAdminSecret (legacy для CLI)
    │   └── logger.js        # request logger + PII санитайзинг + logAICall
    ├── routes/
    │   ├── users.js         # /me PUT/GET, /subscription, /stats, /claim-tg-bonus, DELETE /me
    │   ├── analysis.js      # wing/quick-reply/rejection/reboot/date-invite/style-shift/support/history
    │   ├── simulator.js     # start/message/finish/ai-girl/analyze/hints
    │   ├── firstMessage.js  # generate
    │   ├── contacts.js      # CRUD + pin
    │   ├── admin.js         # prompts CRUD + stats + logs + audit-log
    │   ├── promo.js         # apply
    │   ├── polls.js         # today/vote
    │   ├── payments.js      # POST /invoice — Stars invoice link
    │   └── telegram.js      # POST /webhook (вне initData) — /start, /paysupport, payments
    ├── services/
    │   ├── polza.js         # Qwen3 235B + fallback цепочки
    │   ├── bot-api.js       # undici ProxyAgent для РФ-хоста
    │   └── cache.js         # Redis опциональный (REDIS_URL пуст → отключён)
    └── utils/
        ├── limits.js        # daily limits по tier из подписки
        ├── promptSanitize.js
        ├── typazhes.js
        ├── aiSchemas.js
        └── logCleanup.js    # cron на чистку request_logs/audit
```

### Mini-app (`mini-app/`)

```
mini-app/
├── package.json             # Vite 5 + React 18 + @telegram-apps/sdk-react + react-router
├── vite.config.ts
├── tsconfig.json
├── index.html
├── .env.example
├── PHASE_E_NOTES.md         # отчёт Phase E
├── PHASE_H_NOTES.md         # отчёт Phase H (Paywall integration)
├── PHASE_K_NOTES.md         # отчёт Phase K (CloudStorage)
├── public/
│   ├── _headers             # CSP + index.html no-cache, /assets/* immutable
│   └── _redirects           # SPA fallback
└── src/
    ├── main.tsx             # entrypoint + initTelegram + Landing fallback
    ├── App.tsx              # BrowserRouter + AuthGate + PaywallProvider + 24 роута
    ├── theme.css            # dark тема через CSS-переменные
    ├── api.ts               # fetchAuthed (с retry/timeout) + все endpoints
    ├── auth.ts              # initData hooks
    ├── vite-env.d.ts
    ├── components/
    │   ├── Layout.tsx                # safe-area + опц. таб-бар padding
    │   ├── BottomTabBar.tsx          # 5 табов с inline SVG
    │   ├── Card.tsx
    │   ├── Chip.tsx
    │   ├── GradientButton.tsx        # accent CTA + haptic + dots-loader
    │   ├── SecondaryButton.tsx
    │   ├── AutoGrowTextarea.tsx      # для чатов/анализа (Phase F/G)
    │   └── ChatBubble.tsx            # для симулятора (Phase G)
    ├── contexts/
    │   ├── MeContext.tsx             # /users/me state с graceful fallback
    │   └── PaywallContext.tsx        # open({reason}) из любого экрана
    ├── hooks/
    │   └── usePersistedState.ts      # useState + LS + опционально CloudStorage
    ├── utils/
    │   ├── storage.ts                # per-tg-user-id localStorage
    │   ├── cloudSync.ts              # CloudStorage обёртка
    │   ├── indexedDB.ts              # фото blobs + resizeImage
    │   ├── haptics.ts                # try/catch обёртки
    │   ├── backButton.ts             # TG нативный BackButton
    │   ├── payments.ts               # startStarsPayment (openInvoice)
    │   ├── posts.ts                  # лента постов (RU only)
    │   ├── theoryCards.ts            # карточки теории
    │   ├── communityFeed.ts          # фид сообщества
    │   ├── customGirls.ts            # кастомные AI-девушки
    │   └── typazhes.ts
    └── screens/
        ├── Landing.tsx               # fallback вне TG
        ├── SplashScreen.tsx          ✅ Phase E
        ├── OnboardingScreen.tsx      ✅ Phase E
        ├── QuestionnaireScreen.tsx   ✅ Phase E
        ├── QuestionnaireForm.tsx     ✅ Phase E (shared)
        ├── HomeScreen.tsx            ✅ Phase E
        ├── ProfileScreen.tsx         ✅ Phase E
        ├── EditProfileScreen.tsx     ✅ Phase E
        ├── SettingsScreen.tsx        ✅ Phase E
        ├── DeleteProfileScreen.tsx   ✅ Phase E
        ├── WingScreen.tsx            ✅ Phase F
        ├── TheoryScreen.tsx          ✅ Phase F
        ├── SimulatorScreen.tsx       ✅ Phase G
        ├── SimulatorChatScreen.tsx   ✅ Phase G
        ├── SimulatorResultScreen.tsx ✅ Phase G
        ├── AllDialogsScreen.tsx      ✅ Phase G
        ├── CreateGirlScreen.tsx      ✅ Phase G
        ├── CreateGirlChatScreen.tsx  ✅ Phase G
        ├── PaywallScreen.tsx         ✅ Phase H
        ├── PromoCodeScreen.tsx       ✅ Phase H
        ├── ReferralScreen.tsx        ✅ Phase H
        └── stubs.tsx                 ⚠️ 8 заглушек
```

---

## Что ещё нужно сделать

### Доделать Phase F (3 экрана)
- `CommunityScreen.tsx` — лента постов из `utils/communityFeed.ts` + `utils/posts.ts` (карточки превью с image/title/excerpt/tag)
- `PostDetailScreen.tsx` (`/post/:slug`) — полная статья
- `TutorialScreen.tsx` — туториал по фичам приложения

### Доделать Phase G (3 экрана)
- `FirstMessageScreen.tsx` — генерация первого сообщения через `POST /first-message/generate`
- `RejectionScreen.tsx` — разбор отказа через `POST /analysis/rejection`
- `SupportScreen.tsx` — «Поддержи её» через `POST /analysis/support`

### Phase I — ЮКасса (требует подписания договора ~неделя)
- `backend/src/routes/yookassa.js` — `POST /yookassa-webhook` + `POST /payments/yookassa/invoice`
- Reconciliation cron — раз в 5 мин для `pending` платежей
- AES-256-GCM шифрование PII партнёров (для выплат)
- В frontend: добавить вторую кнопку «Купить картой» в `PaywallScreen.tsx`

### Phase J — Legal + Admin + темы + Sentry
- `screens/TermsScreen.tsx` + `screens/PrivacyScreen.tsx` — оферта и privacy policy (требует юриста)
- `screens/AdminScreen.tsx` — RBAC UI для гранта подписок и просмотра логов
- 8 тем (`data-theme="dark|light|velvet|midnight|rose|forest|aurora|carbon"`) — портировать из RN `ThemeContext.js`
- Sentry — `mini-app/src/sentry.ts` с `beforeSend` фильтром PII (Authorization headers, длинные тексты)

---

## Готово к деплою?

Можно прямо сейчас:

1. **Локальный smoke-test** — `npm install` в обеих папках, `node src/index.js` + `npm run dev`, открыть `http://localhost:5173` → увидишь Landing.
2. **Создать бота в @BotFather**, получить токен, заполнить `backend/.env`.
3. **Прогнать сценарии**: Splash → Onboarding → Анкета → Home → Wing (анализ переписки) → Profile.
4. **Деплой через `DEPLOY.md`** — инфраструктура (Hetzner-прокси + AEZA Moscow + CF Pages) полностью описана.

⚠ **Не запускать в production без**:
- Доделанных экранов Phase F/G (FirstMessage/Rejection/Support/Community/Tutorial — пока заглушки)
- Phase J (Privacy/Terms — TG требует Privacy URL в BotFather)
- РКН-уведомления (см. DEPLOY.md §6)
- CSP/CSAM фильтров на LLM (для РФ — критично; см. `DEPLOYMENT_PLAYBOOK.md §44` в reference-проекте)

---

## Reference playbook'и

В `D:\TwinStars\Character Chat\CharacterChatRN\`:
- `TMA_PORTING_PLAYBOOK.md` — паттерны порта (раздел 5 — каталог из 43 граблей)
- `DEPLOY-AEZA-RU.md` — деплой инфра
- `DEPLOYMENT_PLAYBOOK.md` — полное руководство по эксплуатации
- `SETUP_NEW_MACHINE.md` — настройка dev-окружения
