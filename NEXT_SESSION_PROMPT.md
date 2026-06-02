# Промпт для следующей сессии Claude

> Скопируй этот промпт в новую сессию Claude Code чтобы он быстро подхватил контекст.

---

## Промпт для копирования

```
Контекст: я работаю над TMA-портом приложения «Купидон» — AI-коуч по
знакомствам и флирту. Проект в D:\TwinStars\Купидон-TMA\. Оригинал RN/Expo
версии — в D:\TwinStars\Купидон\.

Стек: Node 20 + Express + better-sqlite3 (backend), Vite/React +
@telegram-apps/sdk-react (mini-app). Деплой: AEZA Moscow VPS + Hetzner
Helsinki прокси + Cloudflare Pages.

Прочитай для контекста:
1. D:\TwinStars\Купидон-TMA\PROGRESS.md — полная карта проекта и
   готовности по фазам A-L
2. D:\TwinStars\Купидон-TMA\README.md
3. D:\TwinStars\Купидон-TMA\backend\PHASE_C_NOTES.md — backend API
4. D:\TwinStars\Купидон-TMA\mini-app\PHASE_E_NOTES.md,
   PHASE_H_NOTES.md, PHASE_K_NOTES.md — фронт

Готовы phase A, B, C, D, E, H, K, L. Phase F и G — частично (см.
PROGRESS.md «Что ещё нужно сделать»). Phase I и J — не начаты.

Reference playbook (паттерны и грабли прошлого порта):
- D:\TwinStars\Character Chat\CharacterChatRN\TMA_PORTING_PLAYBOOK.md
- D:\TwinStars\Character Chat\CharacterChatRN\DEPLOY-AEZA-RU.md

Действуй так же как в прошлой сессии: большие фазы — запускай через
Agent в фоне с моделью Opus, давая подробный бриф (включая ссылки на
файлы что прочитать, какие API endpoints доступны, паттерны из RN
которые НЕ копируй буквально). Сам параллельно делай что-то независимое
по файлам.

Сейчас сделай: [впиши конкретную задачу — см. ниже опции].
```

---

## Опции «конкретной задачи»

### Вариант A — Доделать Phase F и G (быстро, 1-2 агента)

> Доделай экраны Phase F и G которые остались stubs: FirstMessageScreen,
> RejectionScreen, SupportScreen (Phase G — генерация AI-сообщений),
> CommunityScreen + PostDetailScreen (Phase F — лента постов из
> utils/communityFeed.ts + utils/posts.ts), TutorialScreen (Phase F).
> Используй те же паттерны что в готовых экранах (например WingScreen.tsx
> для AI-форм). После — подключи их в App.tsx (заменив stubs).

### Вариант B — Phase J (Legal + Admin + Sentry + темы)

> Запусти Phase J. Это:
> 1. TermsScreen.tsx, PrivacyScreen.tsx — тексты оферты и privacy policy
>    (готовый базовый шаблон из reference DEPLOYMENT_PLAYBOOK §19, в
>    placeholder'ах для ФИО/ИНН — оставить TODO для юриста).
> 2. AdminScreen.tsx — управление пользователями (грант подписки,
>    просмотр audit_log) через GET/PUT /api/v1/admin/*.
> 3. 8 тем (dark, light, velvet, midnight, rose, forest, aurora, carbon)
>    из RN constants/theme.js — через data-theme attribute + CSS-переменные.
> 4. Sentry — mini-app/src/sentry.ts с beforeSend фильтром PII
>    (Authorization headers, длинные user-тексты — урезать). Phase J
>    из TMA_PORTING_PLAYBOOK §5.17, §5.35.

### Вариант C — Phase I (ЮКасса)

> Запусти Phase I — интеграция ЮКассы как второй платёжный метод (Stars
> уже работают). Требуется:
> 1. backend/src/routes/yookassa.js — POST /yookassa-webhook (HMAC
>    верификация по YK_SECRET_KEY), POST /payments/yookassa/invoice
>    (создаёт ЮК-платёж через REST API)
> 2. Reconciliation cron — раз в 5 мин dergat ЮК для pending платежей,
>    активировать подписку если succeeded (грабли §5.20 — try/catch на
>    каждой итерации)
> 3. AES-256-GCM шифрование банковских реквизитов партнёров
>    (PAYOUT_ENCRYPTION_KEY из env) — для будущей реферальной программы
> 4. В PaywallScreen.tsx — вторая кнопка «Купить картой» рядом со Stars
>
> ВАЖНО: договор с ЮКассой подписывается ~неделя. До этого работаем
> только в тестовом магазине (YK_SHOP_ID/YK_SECRET_KEY = test_*).

### Вариант D — Smoke-test и первый деплой

> Хочу прогнать локальный smoke-test и подготовиться к первому деплою:
> 1. npm install в backend + mini-app
> 2. Запустить backend локально, проверить /health
> 3. Создать тестового бота в @BotFather, заполнить .env
> 4. Запустить vite, открыть в браузере, увидеть Landing
> 5. С DEV_BYPASS_INITDATA=1 — пройти Onboarding/Questionnaire
> 6. Если всё работает — начать setup инфры по DEPLOY.md

---

## Рекомендуемый порядок

1. **Сначала вариант D** — убедись что текущий код собирается и работает локально. Это быстро и даёт уверенность.
2. **Потом вариант A** — закрывает 5 оставшихся экранов. После этого приложение функционально полное.
3. **Потом вариант B** — Privacy/Terms нужны для подключения Mini App в BotFather (без них TG не позволит).
4. **Деплой по DEPLOY.md** — Hetzner + AEZA + CF Pages.
5. **Вариант C (ЮКасса)** — после первого реального запуска и подписания договора с ЮКассой.
