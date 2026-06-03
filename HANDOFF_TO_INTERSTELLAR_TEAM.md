# Handoff: контекст для починки Интерстеллара (без поломки Купидона)

> Этот документ — для **другого AI-агента / разработчика**, который будет
> чинить проект **Интерстеллар** на том же сервере где живёт **Купидон**.
> Обязательно прочитай раздел «🚫 NEVER TOUCH» — иначе сломаешь работающий
> Купидон-проект, и придётся всё переделывать.

---

## 📊 Карта серверов

Два VPS работают вместе:

### Moscow AEZA — `77.110.105.156`

| Что | Юзер | Путь | Порт | Домен | systemd |
|---|---|---|---|---|---|
| **Interstellar backend** (ваш) | `interstellar` | `/home/interstellar/interstellar/` | `3001` | `api.interstellar-app.ru`, `interstellar-app.ru`, `www.interstellar-app.ru` | `interstellar.service` |
| **Cupidon backend** (НЕ ТРОГАТЬ) | `cupidon` | `/home/cupidon/cupidon/` | `3002` | `cupidonai.ru`, `www.cupidonai.ru` | `cupidon.service` |

- **Node**: system (`/usr/bin/node` = v20.20.2 через nodesource — общий для всех)
- **БД Cupidon**: SQLite в `/home/cupidon/cupidon-data/cupidon.sqlite`
- **БД Interstellar**: своя где-то в `/home/interstellar/interstellar/...` (не знаем точно)
- **nginx-сайты в `/etc/nginx/sites-enabled/`**:
  - `cupidon` — server_name cupidonai.ru www.cupidonai.ru → 127.0.0.1:3002
  - `interstellar` — api.interstellar-app.ru → 127.0.0.1:3001
  - `interstellar-frontend` — interstellar-app.ru www.interstellar-app.ru → раздача статики

### Stockholm Hetzner — `176.124.207.161`

| Что | Юзер | Что делает |
|---|---|---|
| **3proxy** (общий) | `cupidon` системный + `interstellar` config-юзер | HTTP-прокси на 3128 для исходящих к api.telegram.org (используют ОБА проекта, креды одинаковые: `interstellar:JXq...28v`) |
| **nginx + SSL для `wh.cupidonai.ru`** | root | **Только для Купидона** — relay для TG webhook (TG не достукивается до Moscow IP). Proxy_pass → `https://77.110.105.156:443` на endpoint `/api/v1/telegram/webhook` |

---

## 🚫 NEVER TOUCH — зона Купидона

Если ты сломаешь эти штуки — Купидон упадёт, мы потеряем платящих юзеров. **Не трогать ни при каких обстоятельствах**:

### Файлы и каталоги
- `/home/cupidon/` (вся папка юзера)
- `/etc/systemd/system/cupidon.service`
- `/etc/nginx/sites-available/cupidon`
- `/etc/nginx/sites-enabled/cupidon`
- `/var/log/cupidon/`
- `/etc/letsencrypt/live/cupidonai.ru/` (SSL Купидона)
- `/etc/letsencrypt/live/wh.cupidonai.ru/` (SSL Stockholm relay)

### systemd-сервисы
```
cupidon.service           — НЕ stop, НЕ restart, НЕ disable
3proxy.service (Stockholm) — НЕ stop, НЕ перезагружать
```

### nginx
- При `nginx reload` — сначала **обязательно `nginx -t`**, иначе можно положить и Cupidon и Interstellar одновременно
- НЕ удалять `/etc/nginx/sites-enabled/cupidon`
- При редактировании `nginx.conf` — НЕ менять глобальные настройки (worker_connections, sendfile и т.п.) — это влияет на оба сайта

### Порты и сеть
- Порт **3002** (cupidon backend) — НЕ занимать другим процессом
- UFW правила 22/80/443/3128/1080 — НЕ удалять
- DNS-записи `cupidonai.ru` и `wh.cupidonai.ru` на reg.ru — НЕ трогать (другой аккаунт)

### Telegram
- Бот `@Cupidon_Ai_Bot` (token `8703...DhKo`) — НЕ менять webhook URL
- Канал `@cupidonAi` — НЕ удалять, не трогать роли

### Stockholm
- Конфиг `/etc/3proxy/3proxy.cfg` — НЕ менять (там креды и пароль)
- Конфиг `/etc/nginx/sites-enabled/cupidon-wh` — НЕ удалять (relay для TG)

### Системные изменения
- `apt remove`, `apt purge`, `apt upgrade -y` — **запрашивать подтверждение** у заказчика. Любой пакет может зацепить общую зависимость
- `npm install` глобально — не делать (только локально в `/home/interstellar/.../`)
- НЕ удалять / переустанавливать `nodejs`, `nginx`, `certbot`, `sqlite3`, `ufw`

---

## ✅ SAFE ZONE — что вы можете делать с Интерстелларом

- `sudo -u interstellar` команды от его имени
- Редактировать что угодно в `/home/interstellar/interstellar/`
- `systemctl restart interstellar` (после `sudo systemctl status interstellar --no-pager` для уверенности что вы рестартите правильный сервис)
- Менять `/etc/nginx/sites-available/interstellar` и `interstellar-frontend` (НЕ `cupidon`!)
- `certbot renew` на `api.interstellar-app.ru` или `interstellar-app.ru` (НЕ на cupidonai.ru!)
- Менять Telegram-настройки бота `@InterstellarChatBot` (или какой у него username) через @BotFather
- Перезапускать **только** `interstellar.service`, не cupidon

---

## 🔍 Текущая проблема Интерстеллара (симптомы)

**Mini App открывается** в Telegram, но:
- Не приходят ответы от сервера
- Сообщение «Нет соединения с сервером. Проверь интернет. (NETWORK)»
- Данные о подписке не загружаются
- При отправке сообщения «привет» Зигмунду Фрейду → «Не удалось получить ответ. Проверьте интернет и попробуйте снова.»

**Бэкенд физически жив** (проверено):
```bash
systemctl status interstellar --no-pager
# Active: active (running) since Wed 2026-05-27 — работает 6+ дней без падений
# Main PID: 224220, /home/interstellar/.nvm/versions/node/v20.20.2/bin/node server.js

curl https://api.interstellar-app.ru/health
# {"ok":true,"model":"qwen/qwen3-235b-a22b-2507","auth":"bot-token"}
```

То есть **HTTPS отвечает, backend работает**. Симптом — между Mini App и backend что-то ломает связь.

### Гипотезы причин (приоритет от вероятного к менее)

#### 1. CORS — самое вероятное

Mini App в TG WebView имеет origin типа `https://web.telegram.org` или `null` (зависит от версии TG). Если backend строго проверяет `Origin` header и whitelist устарел — preflight OPTIONS вернёт ошибку → fetch видит "NETWORK error" (не HTTP-код).

**Проверить**:
```bash
sudo -u interstellar grep -rEi "CORS|origin|allowed" /home/interstellar/interstellar/backend/ 2>/dev/null | head -30
```

Если найдёте `cors({ origin: [...] })` или ручной `Access-Control-Allow-Origin` — попробуйте поставить `origin: '*'` или `origin: true` (с credentials: false) и рестартнуть `interstellar.service`. Если поможет — значит проблема была в CORS.

#### 2. Mini App грузит JS с CDN который недоступен из РФ

Если фронт грузит `react`, `@sentry/`, `@telegram-apps/sdk-react` или подобное **с unpkg.com / jsdelivr.net** — РКН местами их блочит. Браузер юзера в РФ просто не может скачать.

**Проверить**:
- В Telegram Desktop открыть Interstellar Mini App → правый клик → «Inspect Element» (если доступно) → Network tab → посмотреть **красные failed requests**
- Или посмотреть `/home/interstellar/interstellar/mini-app/dist/index.html` — есть ли там `<script src="https://...">` на внешний CDN

**Фикс**: bundle всё локально через Vite (`npm run build` уже это делает обычно). Если есть прямые `<script>` ссылки на CDN — заменить на self-hosted.

#### 3. Сертификат истёк

```bash
echo | openssl s_client -servername api.interstellar-app.ru -connect api.interstellar-app.ru:443 2>/dev/null | openssl x509 -noout -dates
# notAfter=...
```

Если `notAfter` уже прошёл — certbot не обновил серт автоматически.

**Фикс**: `sudo certbot renew --nginx --cert-name api.interstellar-app.ru` (НЕ трогать `--all`!).

#### 4. polza.ai key закончился / запросы фейлят

Если backend Interstellar вызывает polza.ai и получает 401/402/5xx — это **должно** возвращаться как HTTP 500/503 в Mini App, не как "NETWORK". Но если фронт это плохо обрабатывает — может показывать "NETWORK" на любую не-200.

**Проверить**:
```bash
sudo tail -50 /home/interstellar/interstellar/backend/*.log 2>/dev/null  # или путь к их логам
sudo journalctl -u interstellar -n 100 --no-pager | grep -iE "polza|error|fail"
```

#### 5. CSP режет fetch к собственному API

Если у Interstellar есть Content-Security-Policy в `mini-app/public/_headers` или в nginx — `connect-src` мог не включать новый origin. Тогда fetch к `api.interstellar-app.ru` блокирует браузер.

**Проверить**:
```bash
curl -I https://interstellar-app.ru | grep -i "content-security"
```

Если CSP есть и в нём НЕТ `connect-src` с `api.interstellar-app.ru` — это причина.

#### 6. initData expired

Если их auth-валидация требует свежий initData каждый раз (TTL 1 час), а TG в Desktop не обновляет — все запросы 401. Но `me.is_admin` бы тоже не загрузился — это бы и был "NETWORK" в их обработке.

---

## 🛠 Команды диагностики Интерстеллара (запускать как root)

Все безопасны для Купидона:

```bash
# 1. Статус сервиса (не должно влиять на Cupidon)
systemctl status interstellar --no-pager | head -15

# 2. Свежие логи backend
journalctl -u interstellar -n 100 --no-pager | tail -50

# 3. Проверка HTTPS health
curl -i https://api.interstellar-app.ru/health
curl -i https://interstellar-app.ru/  # фронт

# 4. Проверка CORS preflight
curl -i -X OPTIONS https://api.interstellar-app.ru/api/v1/some-endpoint \
  -H "Origin: https://web.telegram.org" \
  -H "Access-Control-Request-Method: POST"
# Должны быть Access-Control-Allow-* headers

# 5. SSL expiry
echo | openssl s_client -servername api.interstellar-app.ru -connect api.interstellar-app.ru:443 2>/dev/null \
  | openssl x509 -noout -dates

# 6. Где Interstellar mini-app
sudo -u interstellar ls -la /home/interstellar/interstellar/mini-app/dist/

# 7. Nginx config Interstellar (без касания cupidon!)
cat /etc/nginx/sites-enabled/interstellar
cat /etc/nginx/sites-enabled/interstellar-frontend

# 8. Cupidon должен НЕ пострадать после ваших действий — проверка
curl -s https://cupidonai.ru/health
systemctl status cupidon --no-pager | head -5
```

---

## 🔁 После любых изменений — обязательная проверка обоих

```bash
echo "=== INTERSTELLAR ==="
systemctl status interstellar --no-pager | head -3
curl -s https://api.interstellar-app.ru/health

echo "=== CUPIDON (должен быть нетронут) ==="
systemctl status cupidon --no-pager | head -3
curl -s https://cupidonai.ru/health
```

Оба должны отдавать `Active: running` + `{"ok":true,...}`.

---

## 📞 Если случайно сломали Купидон

Признаки: `cupidon.service` failed, `https://cupidonai.ru/health` не отвечает, или nginx падает с syntax error.

1. **Сразу скажите заказчику** — у Купидона есть платящие юзеры
2. **Не паниковать** — Cupidon полностью в git, восстанавливается:
   ```bash
   sudo -u cupidon bash -c "cd /home/cupidon/cupidon && git status && git stash && git pull origin main && cd backend && npm install && cd ../mini-app && npm install && npm run build"
   systemctl restart cupidon
   systemctl status cupidon --no-pager
   ```
3. nginx-конфиг Купидона — в `paste.rs/EkfmO` (если потерян)

---

## 🎯 Что ВЕРОЯТНО починит Interstellar (вне моих гипотез)

Если хотите быстро:

1. **Открыть Interstellar Mini App в Telegram Desktop**
2. **Открыть DevTools**: View → Open DevTools (или F12 если работает)
3. **Network tab** → отправить сообщение в Mini App → посмотреть **какой именно запрос красный** (failed)
4. **Console tab** → посмотреть **точное сообщение об ошибке** (не «NETWORK», а реальную trace)
5. По этим данным проблема обычно идентифицируется за минуту

---

## 🤖 Промпт для AI-агента в новом чате

> Я — заказчик. У меня два проекта на одном сервере: **Купидон** (работает,
> не трогать) и **Интерстеллар** (сломан, надо чинить). Прочитай файл
> `HANDOFF_TO_INTERSTELLAR_TEAM.md` из репо `X4rench/CupidonTelegram` (raw:
> `https://raw.githubusercontent.com/X4rench/CupidonTelegram/main/HANDOFF_TO_INTERSTELLAR_TEAM.md`).
> Там вся карта сервера + список запретов + диагностика Интерстеллара.
> Делай ТОЛЬКО действия из раздела «SAFE ZONE». После каждого изменения
> обязательно проверь что Купидон не пострадал.

---

**Версия**: 2026-06-03
**Последняя сверка**: оба проекта работают, Купидон в production с платящими юзерами
