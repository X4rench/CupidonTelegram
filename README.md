# Купидон — Telegram Mini App

Порт RN/Expo приложения «Купидон» (AI-коуч по знакомствам и флирту) на стек Telegram Mini App.

## Стек

| Слой | Технология | Почему |
|---|---|---|
| Frontend | Vite 5 + React 18 + @telegram-apps/sdk-react | Стандартный TMA-стек |
| Routing | react-router 6 | Работает в TG WebView без issues |
| Backend | Node.js 20 LTS + Express 4 | Стабильно на AEZA, простая отладка |
| DB | better-sqlite3 | Sync API, один файл, легко бэкапить |
| LLM | polza.ai (Qwen3 235B) | Уже подключён, низкая цена, хороший RU |
| Auth | TG initData HMAC | Стандарт TMA, никаких email/паролей |
| Payments | Telegram Stars + ЮКасса | Stars быстрее, ЮКасса дешевле в комиссии |
| Hosting (prod) | AEZA Moscow + Hetzner-прокси + Cloudflare Pages | 152/242-ФЗ комплианс |

## Структура

```
Купидон-TMA/
├── backend/                # Node.js API
│   ├── src/
│   │   ├── index.js        # entry point
│   │   ├── db/
│   │   │   ├── index.js    # better-sqlite3 + миграции
│   │   │   ├── schema.sql  # схема с telegram_user_id
│   │   │   ├── seed.js     # промпты
│   │   │   └── polls_seed.js
│   │   ├── middleware/
│   │   │   ├── auth.js     # HMAC initData валидация
│   │   │   ├── adminAuth.js
│   │   │   ├── logger.js
│   │   │   └── lang.js     # будет удалён
│   │   ├── routes/         # users, simulator, analysis, ...
│   │   ├── services/       # polza, bot-api (с прокси)
│   │   └── utils/
│   ├── scripts/
│   │   └── setup-webhook.js
│   ├── package.json
│   └── .env.example
│
├── mini-app/               # Vite + React + TG SDK
│   ├── public/
│   │   ├── _headers        # CSP для CF Pages
│   │   └── _redirects
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── auth.ts         # initData hooks
│   │   ├── api.ts          # fetchAuthed
│   │   ├── theme.css       # TG themeParams
│   │   ├── components/
│   │   ├── screens/        # порт RN-экранов
│   │   ├── contexts/
│   │   └── utils/
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
│
├── DEPLOY.md               # AEZA Moscow + Hetzner + CF Pages
├── SETUP_NEW_MACHINE.md
└── README.md
```

## Фазы порта

Эти фазы трекаются в TaskCreate сессии Claude Code.

- **Phase A**: Audit + scaffold (этот документ + базовые файлы)
- **Phase B**: Backend — TG initData auth + миграция схемы
- **Phase C**: Backend — порт роутов под TMA
- **Phase D**: Mini-app scaffold + базовая инфра
- **Phase E**: Порт экранов Auth/Onboarding/Home/Profile
- **Phase F**: Порт экранов Wing (Theory/Posts/Community/Tutorial)
- **Phase G**: Порт экранов Simulator/CreateGirl/FirstMessage
- **Phase H**: Paywall + Subscription + Promo + Referral
- **Phase I**: ЮКасса интеграция + reconciliation cron
- **Phase J**: Legal (Privacy/Terms) + age-gate + AdminScreen
- **Phase K**: CloudStorage sync (cross-device persistence)
- **Phase L**: Deploy docs + smoke-test

## Quick start (для локалки)

```bash
# Backend
cd backend
cp .env.example .env
# Заполни POLZA_API_KEY и BOT_TOKEN
npm install
npm run dev

# Mini-app
cd ../mini-app
cp .env.example .env
npm install
npm run dev
# Открой http://localhost:5173 (без TG-контекста увидишь лендинг)
```

Тестирование с реальным Telegram-контекстом — см. DEPLOY.md.

## Ссылки на оригинал

- Исходный RN-проект: `D:\TwinStars\Купидон` — справочник по экранам и контенту
- Reference playbook: `D:\TwinStars\Character Chat\CharacterChatRN\DEPLOY-AEZA-RU.md` — инфра
- Reference playbook: `D:\TwinStars\Character Chat\CharacterChatRN\TMA_PORTING_PLAYBOOK.md` — паттерны
