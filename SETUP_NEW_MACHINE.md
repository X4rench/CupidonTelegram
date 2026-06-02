# Setup на новом компьютере

> Как перенести проект «Купидон-TMA» на другой ПК и продолжить работу.

---

## 0. TL;DR — что нужно с собой

Весь **код** — в GitHub. Автоматически синхронизируется через `git pull`.

Что НЕ в git и переносится **отдельно**:

| Что | Где хранится сейчас | Как перенести |
|-----|---------------------|---------------|
| `backend/.env` | Только на твоём ПК + на AEZA-сервере | Скопировать вручную |
| `mini-app/.env` | Только на ПК | Скопировать |
| Доступ к GitHub | Логин/2FA или SSH-ключ | Залогиниться |
| Доступ к AEZA VPS | SSH-ключ + панель | Сохранить логин/пароль панели |
| Доступ к Hetzner | Логин + 2FA | Backup-коды |
| Доступ к Cloudflare | Логин + 2FA | Backup-коды |
| Доступ к polza.ai | Логин/пароль | — |
| BotFather | Твой TG-аккаунт | Твой TG-номер |
| Hetzner-прокси пароль | В `.env` на сервере | Скопировать (см. §3) |

База данных SQLite живёт на сервере AEZA. На твоём ПК её нет.

---

## 1. Инструменты на новом ПК

### Windows

1. **Git for Windows**: https://git-scm.com/download/win
2. **Node.js 20 LTS**: https://nodejs.org/en
3. **Claude Code CLI**: `npm install -g @anthropic-ai/claude-code`
4. **VS Code или Cursor** (опционально)
5. **Telegram Desktop** для тестов

Проверка:
```
git --version    # 2.40+
node --version   # v20.x.x
npm --version    # 10.x+
```

### macOS

```bash
brew install git node@20
```

### Linux

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
```

---

## 2. Клонировать репо

```bash
cd ~/Desktop  # или куда хочешь
git clone https://github.com/YOUR_USERNAME/cupidon-tma.git Кyпидон-TMA
cd Купидон-TMA
```

Если приватный — нужен Personal Access Token или SSH-ключ.

После clone:
```
Купидон-TMA/
├── backend/
├── mini-app/
├── DEPLOY.md
├── SETUP_NEW_MACHINE.md  ← этот файл
└── README.md
```

---

## 3. Восстановить `.env` файлы

### 3.1 backend/.env

Создай `backend/.env` (см. `backend/.env.example` за шаблоном):

```ini
POLZA_API_KEY=pza_твой_ключ
POLZA_MODEL=qwen/qwen3-235b-a22b-2507

PORT=3001
NODE_ENV=development
DB_PATH=./data/cupidon.sqlite

BOT_TOKEN=твой_токен
BOT_USERNAME=CupidonAiBot
BOT_APP_NAME=app
TELEGRAM_WEBHOOK_SECRET=любая_строка_для_дев
TG_API_PROXY=http://PROXY_USER:PROXY_PASSWORD@95.217.X.X:3128

DEV_BYPASS_INITDATA=1
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://localhost:5173

ADMIN_TELEGRAM_IDS=твой_telegram_id

LIMITS_ENABLED=0
```

### 3.2 mini-app/.env

```ini
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_BOT_USERNAME=CupidonAiBot
VITE_BUILD_VERSION=dev
```

### 3.3 Где взять текущие значения если потерял

| Секрет | Где взять |
|--------|-----------|
| `POLZA_API_KEY` | polza.ai → ЛК → API → создать новый ключ (старый отзови) |
| `BOT_TOKEN` | @BotFather → `/mybots` → бот → API Token |
| `TELEGRAM_WEBHOOK_SECRET` | На AEZA: `grep WEBHOOK_SECRET /home/cupidon/cupidon/backend/.env` |
| `TG_API_PROXY` | На AEZA в `.env` |
| `PAYOUT_ENCRYPTION_KEY` | На AEZA в `.env`. **Если потерял — PII партнёров расшифровать невозможно!** |

⚠ После переноса лучше **ротировать все ключи** (особенно если старый ПК остался у кого-то).

---

## 4. Запуск проекта локально

### 4.1 Backend (терминал 1)

```bash
cd backend
npm install
mkdir -p data
node src/index.js
```

Должен увидеть:
```
[db] better-sqlite3 connected: ./data/cupidon.sqlite
[Cupidon TMA Backend] Running on :3001
```

### 4.2 Frontend (терминал 2)

```bash
cd mini-app
npm install
npm run dev
```

Vite на `http://localhost:5173`.

### 4.3 Открыть в браузере

`http://localhost:5173` — без TG-контекста увидишь Landing с кнопкой «Открыть в Telegram».

Чтобы тестировать с TG-контекстом:
- В `backend/.env` `DEV_BYPASS_INITDATA=1` пропускает HMAC
- Открой через Eruda (включается автоматически в DEV)

### 4.4 Тестировать с реальным Telegram

`git push` → CF Pages автоматически пересобирает фронт через ~2 мин. Бэк надо рестартить руками.

Открой бота в TG → Menu Button.

---

## 5. Деплой backend на сервер

```bash
ssh cupidon@AEZA_IP
cd ~/cupidon
git pull
cd backend
npm ci
sudo systemctl restart cupidon
sudo systemctl status cupidon --no-pager
```

См. `DEPLOY.md` § «Команды для ежедневной работы».

---

## 6. Продолжить разговор с Claude на новом ПК

### 6.1 Claude Code CLI

```bash
cd ~/Desktop/Купидон-TMA
claude
```

### 6.2 Накормить Claude контекстом

Claude НЕ помнит предыдущие сессии. В первом сообщении напиши:

```
Контекст: я работаю над TMA-портом приложения «Купидон» — AI-коуч по
знакомствам и флирту. Стек: Node 20 + Express + better-sqlite3 в backend,
Vite/React + @telegram-apps/sdk-react в mini-app. Деплой: AEZA Moscow VPS
+ Hetzner-прокси + Cloudflare Pages.

Полная карта проекта — в README.md. План фаз A-L:
- A-D — готово (scaffold, auth, роуты, mini-app router)
- E — текущая работа (онбординг/профиль/настройки)
- F-L — впереди

Прочитай README.md, PHASE_C_NOTES.md, PHASE_E_NOTES.md прежде чем
действовать. Reference playbook'и — в D:\TwinStars\Character Chat\
CharacterChatRN\DEPLOY-AEZA-RU.md и TMA_PORTING_PLAYBOOK.md.
```

---

## 7. Чек-лист переноса

Перед уходом со старого ПК:
- [ ] Закоммитил всё: `git status` чистый
- [ ] Запушил: `git push`
- [ ] Скопировал `backend/.env` и `mini-app/.env` в password manager (1Password / Bitwarden)
- [ ] Записал креды: GitHub, AEZA, Hetzner, Cloudflare, polza.ai, BotFather TG-номер
- [ ] Сделал бэкап БД сервера

На новом ПК:
- [ ] Node 20 + Git + Claude Code установлены
- [ ] `git clone` сделан
- [ ] `.env` файлы созданы из копии
- [ ] `npm install` в обеих папках
- [ ] `node src/index.js` стартует backend
- [ ] `npm run dev` стартует frontend
- [ ] Claude Code накормлен контекстом

---

## 8. Безопасное хранение секретов

**НЕ делай**:
- ❌ Секреты в `secrets.txt` в проекте — случайно закоммитишь
- ❌ Скриншоты ЛК с видимыми ключами
- ❌ Секреты в Telegram-чатах — там сохраняются

**Делай**:
- ✅ Password manager (1Password, Bitwarden, KeePass)
- ✅ 2FA backup-коды распечатать и хранить отдельно
- ✅ После «засветившегося» ключа — **сразу** ротируй

---

## 9. Если что-то пошло не так

| Проблема | Решение |
|----------|---------|
| `git clone` — Repository not found | Проверь GitHub login, доступ к репо |
| `npm install` падает на `better-sqlite3` | На macOS: `xcode-select --install`. На Linux: `apt install build-essential python3`. На Windows: `npm install --global windows-build-tools` |
| Backend стартует но `[fatal] POLZA_API_KEY is not set` | `.env` не подхватился — UTF-8 без BOM, проверь путь |
| Frontend стартует но не подключается к API | `mini-app/.env` → `VITE_API_BASE_URL` правильный? Backend запущен? |
| Не помнишь нужный ключ | См. §3.3 — где брать каждый ключ заново |
