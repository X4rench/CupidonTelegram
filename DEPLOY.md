# Деплой «Купидон» в продакшен (AEZA Moscow + Hetzner + Cloudflare Pages)

> Пошаговый гайд от пустого AEZA-аккаунта до live-бота с платежами и LLM.
> Архитектура: backend в РФ (для 242-ФЗ), прокси к api.telegram.org за рубежом, frontend на Cloudflare Pages.

**Бюджет**: ~1200 ₽/мес (без учёта polza.ai балансом).
**Время**: 1-2 дня с нуля если делаешь по этому документу.

---

## Архитектура

```
┌─────────────────────────┐
│ Cloudflare Pages        │  ← Frontend (mini-app/dist)
│ static React build      │     бесплатно, edge-CDN
│ cupidon.yourdomain.ru   │
└──────────┬──────────────┘
           │ HTTPS API calls
           ▼
┌─────────────────────────┐
│ AEZA Moscow MSKs-1      │  ← Backend (Node.js + SQLite)
│ Россия, ~593₽/мес       │     данные граждан РФ → 242-ФЗ
│ api.cupidon.yourdomain  │
└──────────┬──────────────┘
           │ TG_API_PROXY
           ▼
┌─────────────────────────┐
│ Hetzner CX22 Helsinki   │  ← Прокси к api.telegram.org
│ Финляндия, €5.83/мес    │     устойчив к РКН-блокировкам подсети TG
│ 3proxy (HTTP+SOCKS5)    │
└──────────┬──────────────┘
           ▼
   api.telegram.org (Bot API + Webhook outbound)
```

---

## 0. Что нужно иметь перед началом

- [ ] **GitHub-аккаунт** + приватный репо `cupidon-tma` (запушь `D:\TwinStars\Купидон-TMA`)
- [ ] **Telegram-аккаунт** (от своего номера) для @BotFather, @userinfobot
- [ ] **Банковская карта** для Hetzner — Visa/Mastercard. РФ-карты иногда не проходят (попробуй Тинькофф; если нет — Mevspace.com как альтернатива в Польше)
- [ ] **POLZA_API_KEY** — на polza.ai в личном кабинете, пополнить $10-20
- [ ] **AEZA-аккаунт** на aeza.net (РФ-карты принимают)
- [ ] **Госуслуги с КЭП** — для подачи уведомления в РКН (не блокирует деплой, но обязательно до маркетинга — штраф 100-300к ₽)
- [ ] **Самозанятость или ИП** — для приёма платежей через ЮКассу (Stars работают и без статуса)
- [ ] **Домен** — например `cupidon.ru` через reg.ru (~199 ₽/год)

---

## Часть 1. Hetzner — прокси к api.telegram.org

### 1.1 Регистрация и создание сервера

1. [hetzner.com/cloud](https://www.hetzner.com/cloud) → Sign up → подтверди email
2. Billing-данные: имя/фамилия латиницей (как в паспорте), адрес можно домашний РФ
3. Карта Visa/Mastercard → если РФ-карта не проходит, см. README §0
4. **Cloud → Add Server**:
   - Location: **Helsinki** (низкий latency до РФ)
   - Image: **Ubuntu 22.04**
   - Type: **CX22** (€5.83/мес — 2 vCPU, 4 GB RAM)
   - SSH Keys: добавь свой `~/.ssh/id_ed25519.pub` (или сгенерируй `ssh-keygen -t ed25519`)
   - Name: `cupidon-proxy`
5. Запиши **публичный IP** (вид `95.217.X.X`)

### 1.2 Базовая настройка

```bash
ssh root@95.217.X.X

apt update && apt upgrade -y
apt install -y curl wget htop nano ufw fail2ban build-essential

# Юзер для прокси-сервиса
adduser cupidon
usermod -aG sudo cupidon
mkdir -p /home/cupidon/.ssh
cp ~/.ssh/authorized_keys /home/cupidon/.ssh/
chown -R cupidon:cupidon /home/cupidon/.ssh
chmod 700 /home/cupidon/.ssh
chmod 600 /home/cupidon/.ssh/authorized_keys

# Отключить root SSH
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable
```

Открой новое окно (не закрывая текущее на случай ошибки):
```bash
ssh cupidon@95.217.X.X    # должно зайти
```

### 1.3 Установка 3proxy

```bash
# От cupidon
cd /tmp
wget https://github.com/3proxy/3proxy/archive/refs/tags/0.9.4.tar.gz
tar xzf 0.9.4.tar.gz
cd 3proxy-0.9.4
make -f Makefile.Linux
sudo make -f Makefile.Linux install

# Конфиг
sudo mkdir -p /etc/3proxy
sudo tee /etc/3proxy/3proxy.cfg >/dev/null <<'EOF'
nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60

log /var/log/3proxy/3proxy.log D
logformat "L%d-%m-%Y %H:%M:%S %z %N.%p %E %U %C:%c %R:%r %O %I %h %T"
rotate 30

auth strong
users PROXY_USER:CL:PROXY_PASSWORD_HERE

proxy -p3128 -i0.0.0.0 -e0.0.0.0
socks -p1080 -i0.0.0.0 -e0.0.0.0
EOF

# СГЕНЕРИРУЙ пароль и подставь:
openssl rand -base64 24

# Замени STRONG_PASSWORD_HERE на сгенерированный (sed или вручную)
sudo nano /etc/3proxy/3proxy.cfg

sudo mkdir -p /var/log/3proxy
sudo chown nobody:nogroup /var/log/3proxy

# systemd
sudo tee /etc/systemd/system/3proxy.service >/dev/null <<'EOF'
[Unit]
Description=3proxy HTTP/SOCKS5 proxy
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/3proxy /etc/3proxy/3proxy.cfg
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable 3proxy
sudo systemctl start 3proxy
sudo systemctl status 3proxy

sudo ufw allow 3128/tcp
sudo ufw allow 1080/tcp
```

### 1.4 Тест прокси

С локальной машины:
```bash
# Должен вернуть 401 Unauthorized — это значит прокси работает, токен фейковый
curl -x http://PROXY_USER:PROXY_PASSWORD@95.217.X.X:3128 \
  https://api.telegram.org/bot123:fake/getMe
```

✅ Сохрани:
- IP: `95.217.X.X`
- Логин: `PROXY_USER`
- Пароль: `PROXY_PASSWORD`
- HTTP-порт: `3128`

URL для `.env` бэкенда: `http://PROXY_USER:PROXY_PASSWORD@95.217.X.X:3128`

---

## Часть 2. AEZA Moscow — Backend

### 2.1 Заказ VPS

В панели AEZA:
- Тариф: **MSKs-1** (~593 ₽/мес — 2 vCPU, 2 GB RAM, NVMe 30 GB)
- Location: Moscow
- OS: Ubuntu 24.04 LTS
- root SSH — добавь свой публичный ключ

⚠ **Грабли #1 (из RN-опыта)**: AEZA часто блокирует SSH (порт 22) с международных IP. Если `ssh root@...` таймаутится — настройка через **VNC-консоль** в панели AEZA. Если работает — продолжай по SSH.

### 2.2 Базовая настройка через SSH (или VNC)

```bash
apt update && apt upgrade -y
apt install -y curl wget git nano ufw build-essential certbot python3-certbot-nginx nginx sqlite3

# Юзер
adduser cupidon
usermod -aG sudo cupidon
mkdir -p /home/cupidon/.ssh
cp ~/.ssh/authorized_keys /home/cupidon/.ssh/ 2>/dev/null || true
chown -R cupidon:cupidon /home/cupidon/.ssh
chmod 700 /home/cupidon/.ssh
chmod 600 /home/cupidon/.ssh/authorized_keys 2>/dev/null || true

# Отключить root SSH (если работает)
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 2.3 Node.js 20 LTS через nvm

```bash
ssh cupidon@185.X.X.X

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc

nvm install 20
nvm use 20
nvm alias default 20

node --version   # v20.x.x
```

### 2.4 Клонирование репо

```bash
cd ~
# Если репо приватный — нужен Personal Access Token из github.com/settings/tokens (scope: repo)
git clone https://YOUR_PAT@github.com/YOUR_USERNAME/cupidon-tma.git cupidon
cd cupidon/backend
npm install
```

### 2.5 .env конфигурация

```bash
cp .env.example .env
nano .env
```

Критичные поля для прода:
```ini
POLZA_API_KEY=твой_pza_ключ
POLZA_MODEL=qwen/qwen3-235b-a22b-2507

PORT=3001
NODE_ENV=production
TRUST_PROXY_HOPS=1
DB_PATH=/home/cupidon/cupidon-data/cupidon.sqlite

BOT_TOKEN=твой_токен_от_BotFather
BOT_USERNAME=CupidonAiBot
BOT_APP_NAME=app
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
PUBLIC_BASE_URL=https://api.cupidon.yourdomain.ru
MINIAPP_URL=https://t.me/CupidonAiBot/app

# Hetzner-прокси из части 1
TG_API_PROXY=http://PROXY_USER:PROXY_PASSWORD@95.217.X.X:3128

DEV_BYPASS_INITDATA=0

CORS_ALLOWED_ORIGINS=https://cupidon.yourdomain.ru

ADMIN_TELEGRAM_IDS=твой_telegram_id_от_userinfobot
ADMIN_SECRET=$(openssl rand -base64 32)

PAYOUT_ENCRYPTION_KEY=$(openssl rand -base64 32)

LIMITS_ENABLED=1
FREE_DAILY_LIMIT=3
BASIC_DAILY_LIMIT=30
PREMIUM_DAILY_LIMIT=100

STAR_PRICE_BASIC=199
STAR_PRICE_PREMIUM=499
STAR_PRICE_DAY_PASS=50

BUSINESS_INN=твой_ИНН
BUSINESS_NAME=Купидон
```

Создай папку данных вне репо:
```bash
mkdir -p ~/cupidon-data
```

### 2.6 Smoke-test

```bash
cd ~/cupidon/backend
node src/index.js
```

Должен вывести:
```
[db] better-sqlite3 connected: /home/cupidon/cupidon-data/cupidon.sqlite
[bot-api] using proxy: http://***@95.217.X.X:3128

╔══════════════════════════════════════════╗
║      Cupidon TMA Backend — Running       ║
╠══════════════════════════════════════════╣
║  Port:   3001                            ║
║  Env:    production                      ║
║  Model:  qwen/qwen3-235b-a22b-2507       ║
║  Auth:   tg-initdata                     ║
║  Proxy:  configured                      ║
╚══════════════════════════════════════════╝
```

Ctrl+C для остановки.

### 2.7 systemd service

```bash
sudo nano /etc/systemd/system/cupidon.service
```

```ini
[Unit]
Description=Cupidon TMA Backend
After=network.target

[Service]
Type=simple
User=cupidon
WorkingDirectory=/home/cupidon/cupidon/backend
ExecStart=/home/cupidon/.nvm/versions/node/v20.18.0/bin/node src/index.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/cupidon/backend.log
StandardError=append:/var/log/cupidon/backend.err.log
EnvironmentFile=/home/cupidon/cupidon/backend/.env

[Install]
WantedBy=multi-user.target
```

⚠ Замени `v20.18.0` на свою версию: `ls ~/.nvm/versions/node/`

```bash
sudo mkdir -p /var/log/cupidon
sudo chown cupidon:cupidon /var/log/cupidon

sudo systemctl daemon-reload
sudo systemctl enable cupidon
sudo systemctl start cupidon
sudo systemctl status cupidon --no-pager   # должно быть active (running)

sudo tail -f /var/log/cupidon/backend.log
```

### 2.8 nginx + Let's Encrypt SSL

Допустим домен: `api.cupidon.yourdomain.ru` (A-запись на IP AEZA).

```bash
sudo nano /etc/nginx/sites-available/cupidon
```

```nginx
server {
    server_name api.cupidon.yourdomain.ru;
    listen 80;

    # ВАЖНО: TG webhook header — без явного pass-through nginx его глотает
    # (грабли §5.24 в TMA_PORTING_PLAYBOOK).
    location /api/v1/telegram/webhook {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Telegram-Bot-Api-Secret-Token $http_x_telegram_bot_api_secret_token;
        client_max_body_size 1m;
    }

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cupidon /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d api.cupidon.yourdomain.ru
# Выбери redirect HTTP→HTTPS

curl https://api.cupidon.yourdomain.ru/health
# → {"ok":true,"service":"cupidon-tma-backend",...}
```

---

## Часть 3. Cloudflare Pages — Frontend

### 3.1 Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**
2. Подключи GitHub → выбери репо `cupidon-tma` → ветка `main`/`master`
3. **Build settings**:
   - Framework: **Vite**
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Root directory: `mini-app`
4. **Environment variables (Production)**:
   - `VITE_API_BASE_URL` = `https://api.cupidon.yourdomain.ru/api/v1`
   - `VITE_BOT_USERNAME` = `CupidonAiBot`
   - `VITE_BUILD_VERSION` = `1.0.0` (или из git: `${CF_PAGES_COMMIT_SHA:0:7}`)
5. **Save and Deploy** → через ~3 мин получишь URL `https://cupidon-xxx.pages.dev`

### 3.2 Обновить CORS на бэкенде

```bash
ssh cupidon@185.X.X.X
nano ~/cupidon/backend/.env
# CORS_ALLOWED_ORIGINS=https://cupidon-xxx.pages.dev
sudo systemctl restart cupidon
```

### 3.3 Кастомный домен (опционально)

В Pages → Custom domains → добавь `cupidon.yourdomain.ru` → создаст CNAME в Cloudflare DNS автоматически.

⚠ **Грабли §5.15**: Cloudflare кеширует `index.html` → после деплоя юзеры видят старый HTML с битыми ссылками на удалённые hashed-ассеты. Уже исправлено в `public/_headers`: `index.html` → `no-cache, must-revalidate`. Hashed-`/assets/*` — `immutable, max-age=31536000`.

---

## Часть 4. Telegram Bot setup

### 4.1 Создать бота

В @BotFather:
```
/newbot
→ имя: Купидон
→ username: CupidonAiBot (или любой свободный, оканчивающийся на bot)
```

Запиши **BOT_TOKEN** → в `.env` на AEZA.

В @userinfobot → `/start` → получи свой telegram_user_id → в `ADMIN_TELEGRAM_IDS` на AEZA.

### 4.2 Регистрация webhook

```bash
ssh cupidon@185.X.X.X
cd ~/cupidon/backend
PUBLIC_BASE_URL=https://api.cupidon.yourdomain.ru node scripts/setup-webhook.js
```

Должно вывести `✅ Webhook is configured correctly`.

### 4.3 Подключить Mini App в @BotFather

```
/newapp
→ выбери CupidonAiBot
→ Title: Купидон
→ Description: AI-коуч по знакомствам и флирту
→ Photo: 640x360 PNG логотипа
→ Web App URL: https://cupidon.yourdomain.ru (или pages.dev URL)
→ Short name: app   (совпадает с BOT_APP_NAME в .env)
```

### 4.4 Menu Button

```
/mybots → CupidonAiBot → Bot Settings → Menu Button → Configure menu button
→ Text: 💘 Открыть Купидон
→ URL: https://t.me/CupidonAiBot/app
```

### 4.5 Privacy Policy URL (обязательно для TG)

```
/mybots → CupidonAiBot → Bot Settings → Configure Mini App → Privacy Policy URL
→ https://cupidon.yourdomain.ru/privacy
```

---

## Часть 5. Smoke-test

1. **Открой бота** в TG через поиск → нажми Menu Button
2. **Mini App открылся** — видишь приветствие с твоим именем
3. **/users/me работает** — в Profile видишь свой TG-аватар, имя
4. **Админка доступна** — Profile → Админка (твой ID в ADMIN_TELEGRAM_IDS)
5. **Бесплатный лимит** — отправь 3 запроса на «Стрелу». 4-й → Paywall с кнопкой «Купить Basic 199 ⭐»
6. **Покупка через Stars**:
   - Нажми «Купить за 199 ⭐»
   - Откроется invoice (купи Stars через @PremiumBot если нет)
   - После оплаты — в `journalctl -u cupidon -f` появится `payment OK: tg_user=... plan=basic ...`
7. **/paysupport работает** — напиши боту `/paysupport` → ответит про условия возврата

---

## Часть 6. Уведомление в РКН (отдельно от деплоя)

🚨 **Обязательно перед маркетингом**. Штраф 100-300к ₽.

1. [Госуслуги](https://www.gosuslugi.ru/600178/1/form) — «Уведомление об обработке персональных данных»
2. КЭП — если нет, оформи у аккредитованного УЦ (1500-3000 ₽, 1-3 дня)
3. Форма:
   - Оператор: ты (ФИО, ИНН, статус самозанятого/ИП)
   - Цель: «Информационно-развлекательный сервис на основе ИИ — обучение коммуникации»
   - Категории субъектов: пользователи Telegram
   - Категории ПДн: технические идентификаторы Telegram (telegram_user_id, username, first_name), тексты переписок (для AI-анализа)
   - Меры безопасности: HMAC-валидация initData, HTTPS, шифрование PII при выплатах партнёрам (AES-256-GCM), data minimization в логах
   - Срок: до отзыва согласия
4. Подпиши КЭП и отправь. РКН рассматривает 30 дней, обработку можно начать с момента подачи.

---

## Часть 7. Дальнейшие шаги

После запуска:

- [ ] **Backup SQLite** — автоматический бэкап `~/cupidon-data/cupidon.sqlite` в S3/R2 каждые 6 часов. Скрипт через `rclone` + cron.
- [ ] **Sentry** — error-tracking. Free-tier хватит для старта. См. `mini-app/src/sentry.ts` (Phase J).
- [ ] **UptimeRobot** — пинг `/health` каждые 5 минут (бесплатно).
- [ ] **Юр. pre-launch review** — lawvine.ru / digital-rights.center (~15-30к ₽).
- [ ] **ЮКасса** — Phase I. Договор подписывается ~неделя.
- [ ] **CSP/CSAM фильтры на LLM** — критично для РФ. См. `DEPLOYMENT_PLAYBOOK §44`.

---

## Команды для ежедневной работы

```bash
# Backend logs
sudo journalctl -u cupidon -f
sudo tail -f /var/log/cupidon/backend.log

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Прокси (на Hetzner)
sudo tail -f /var/log/3proxy/3proxy.log

# Деплой нового кода
cd ~/cupidon
git pull
cd backend
npm ci
sudo systemctl restart cupidon
sudo systemctl status cupidon --no-pager   # ВАЖНО: всегда status после restart (грабли §5.8)

# Frontend — пересобирается автоматически на git push (CF Pages)

# Бэкап БД
sqlite3 ~/cupidon-data/cupidon.sqlite ".backup ~/backup-$(date +%Y%m%d-%H%M).sqlite"

# Webhook info
curl https://api.cupidon.yourdomain.ru/health
# Через прокси (если api.telegram.org заблокирован напрямую):
curl -x http://PROXY_USER:PROXY_PASSWORD@95.217.X.X:3128 \
  "https://api.telegram.org/botBOT_TOKEN/getWebhookInfo" | jq
```

---

## Расходы

| Что | Где | Цена/мес |
|---|---|---|
| Backend VPS | AEZA Moscow MSKs-1 | ~593 ₽ |
| Прокси VPS | Hetzner CX22 Helsinki | €5.83 ≈ 580 ₽ |
| Frontend | Cloudflare Pages | 0 ₽ |
| Домен `.ru` | reg.ru | ~17 ₽/мес |
| SSL | Let's Encrypt | 0 ₽ |
| polza.ai LLM | OpenRouter mirror | $5-50 (от MAU) |
| **Итого инфра** | | **~1190 ₽/мес** + LLM |

Дополнительно one-time:
- КЭП (если нет): 1500-3000 ₽
- Юр. ревью: 15-30к ₽ (опционально, но рекомендую)
- ЮКасса setup: 0 ₽ (но договор и проверка ИП/самозанятого ~неделя)

---

## Troubleshooting

См. `D:\TwinStars\Character Chat\CharacterChatRN\DEPLOYMENT_PLAYBOOK.md` (главу 28 — типовые проблемы) и `TMA_PORTING_PLAYBOOK.md` (раздел 5 — каталог граблей).
