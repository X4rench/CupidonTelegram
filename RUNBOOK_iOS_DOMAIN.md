# RUNBOOK: Купидон не открывается на iPhone (Apple FWW) + переезд домена

> Краткий аварийный справочник. Если iPhone-юзеры жалуются «грузит/не открывается»,
> а Android/ПК работают — читай этот файл, чини по чек-листу. Обновлено 2026-06-14.

---

## TL;DR — диагноз за 30 секунд
- **Симптом:** на iPhone красная плашка «Предупреждение о мошенническом сайте» ИЛИ серая бесконечная загрузка. На Android/ПК всё ок.
- **Причина:** Apple Safari **Fraudulent Website Warning** пометил ДОМЕН (не сервер, не код). Проверка: Interstellar на ТОМ ЖЕ сервере/IP работает → значит блок доменный.
- **Важный парадокс:** Google Safe Browsing часто показывает домен ЧИСТЫМ, а Apple всё равно блочит (у Apple свой залипший кэш, не синхронится с Google). → Гонять Google Search Console / GSB-review **бесполезно**. Нужны: (а) апелляция Apple, (б) переезд на чистый домен.

---

## Текущая рабочая архитектура (после переезда)
- **Сервер:** AEZA Moscow `77.110.105.156`, вход `root@unfortunate-amar` (веб-консоль AEZA).
- **Бэкенд:** user `cupidon`, путь `/home/cupidon/cupidon`, порт **3002**, systemd `cupidon.service`. Отдаёт ТОЛЬКО `/api` + `/health` (**статику НЕ отдаёт** — нет express.static).
- **Фронт:** раздаёт **nginx** из `/home/cupidon/cupidon/mini-app/dist`, проксирует `/api` → `:3002`.
- **Домен Mini App:** `cupidonapp.ru` (чистый, куплен на reg.ru, A → 77.110.105.156). nginx-сайт `/etc/nginx/sites-available/cupidonapp`.
- **Старый домен `cupidonai.ru`:** ОСТАВЛЕН — на нём оферта/Privacy (для ЮКассы), вебхук `wh.cupidonai.ru`, бэкенд. **НЕ выключать, ЮКассу не трогать.**
- **БД:** `/home/cupidon/cupidon-data/cupidon.sqlite` (вне репо).
- Деплой: `sudo -u cupidon bash -c "cd /home/cupidon/cupidon && git pull && cd mini-app && npm run build" && systemctl restart cupidon`

---

## ТРИ места, где задаётся URL Mini App (ВСЕ должны = новый домен)
Если хоть одно осталось на старом домене — будет красный экран.
1. **BotFather → Bot Settings → Menu Button** → `https://cupidonapp.ru/`
2. **BotFather → Configure Mini App** → `https://cupidonapp.ru/` (это открывается по `t.me/Cupidon_Ai_Bot/app`)
3. **backend/.env: `PUBLIC_BASE_URL=https://cupidonapp.ru`** — отсюда кнопка «Открыть Купидон» (web_app в `src/routes/telegram.js`). Дефолт был `cupidonai.ru` — это и давало красноту.
- Фронт: `mini-app/.env: VITE_API_BASE_URL=/api/v1` (относительный → same-origin на любом домене).
- После смены URL — **старые кнопки в чате впечатаны со старым доменом**. Нужен свежий `/start` или меню-кнопка.

---

## Грабли, на которые наступили (и почему так долго)
1. **Сменить только BotFather — мало.** Кнопка бота берёт `PUBLIC_BASE_URL` (env). Не поменяли env → красный экран. Фикс: env + рестарт + свежий `/start`.
2. **nginx proxy-all → 404.** Бэкенд статику не отдаёт. Если новый сайт проксит ВСЁ на `:3002`, то `GET /` → `{"ok":false,"error":"Маршрут GET / не найден"}`. Фикс: конфиг должен раздавать `dist` + проксить только `/api` (= копия `cupidon`).
3. **Тихий редирект ломал вход (петля).** `main.tsx` уводил не-TG трафик на `t.me`, но определял Telegram через `hasInitData()` (требует `user.id`, на iOS бывает пустой при наличии initData) → ложно срабатывал ВНУТРИ Telegram → бесконечная петля. Фикс: определять TG по `Telegram.WebApp.initData` / `platform!=unknown` / хэшу `tgWebApp`.
4. **`git pull` → insufficient permission `.git/objects`.** Раньше делали git под root → объекты root-овские. Фикс: `chown -R cupidon:cupidon /home/cupidon/cupidon`.
5. **Многострочная вставка в AEZA-консоль слипается** (heredoc + комментарии + кириллица теряют переносы). Решение: одна строка, без комментариев/кириллицы; `printf '...\n...' > file` вместо heredoc; для конфигов — `cp` + `sed`.
6. **DNS свежего `.ru` делегируется не сразу** (NXDOMAIN несколько часов, пока реестр `.ru` не опубликует NS). certbot до резолва не запускать.

---

## Быстрая диагностика
```bash
# бэкенд жив?
curl -s https://cupidonapp.ru/health        # ждём {"ok":true,...}
curl -sI https://cupidonapp.ru/ | head -5    # ждём HTTP/2 200 + content-type: text/html (НЕ json/404)
# nginx ок?
nginx -t
# сервисы (оба не должны падать)
systemctl status cupidon --no-pager | head -3
```
DNS-резолв (с ПК): `nslookup cupidonapp.ru 8.8.8.8` → должен дать `77.110.105.156`.
Google Safe Browsing: открыть `https://transparencyreport.google.com/safe-browsing/search?url=ДОМЕН`.

---

## Чек-лист «опять не открывается на iPhone»
1. Это красная плашка или серая загрузка/белый экран?
   - 🔴 красная → грузится помеченный домен. Иди в п.2.
   - ⬜ серая/белый → код/редирект/nginx. Иди в п.4.
2. Какой URL реально открывается? Проверь ВСЕ ТРИ точки входа (BotFather Menu, Configure Mini App, `PUBLIC_BASE_URL`). Хоть одна на старом домене → красный экран.
3. Тестируй через **свежий `/start`** или меню-кнопку (старые кнопки впечатаны со старым URL). Перед тестом **полностью закрой Telegram** (кэш).
4. `curl -sI https://НОВЫЙ/` отдаёт `text/html 200`? Если `json/404` → nginx проксит всё на бэкенд, надо раздавать `dist` (см. грабли #2).
5. Чистый ли новый домен в Google SB? Если новый домен ВДРУГ тоже залетел → нужен ещё один чистый домен (см. рецепт ниже).
6. Апелляция Apple на помеченный домен: **websitereview.apple.com**.

---

## Рецепт: поднять Mini App на новом чистом домене (если текущий залетит)
```bash
# 0) reg.ru: купить домен, добавить A @ и www → 77.110.105.156. Дождаться nslookup (часы).
# 1) nginx-сайт = копия рабочего, поменять домен (cert-папку certbot создаст сам):
cp /etc/nginx/sites-available/cupidonapp /etc/nginx/sites-available/НОВЫЙ
sed -i 's/cupidonapp\.ru/НОВЫЙ.ru/g' /etc/nginx/sites-available/НОВЫЙ
# временно убрать ssl-строки для первого выпуска, ИЛИ сначала отдать как proxy-all на :80, затем certbot.
# Проще: оставить только server{ server_name НОВЫЙ.ru; listen 80; root .../dist; location /api/{...}; location /{try_files...} }
ln -sf /etc/nginx/sites-available/НОВЫЙ /etc/nginx/sites-enabled/НОВЫЙ
nginx -t && systemctl reload nginx
# 2) сертификат:
certbot --nginx -d НОВЫЙ.ru -d www.НОВЫЙ.ru --redirect
# 3) проверка:
curl -sI https://НОВЫЙ.ru/ | head -5     # HTTP/2 200 + text/html
# 4) переключить ТРИ точки входа на НОВЫЙ.ru (BotFather Menu, Configure Mini App, PUBLIC_BASE_URL env + рестарт)
# 5) тест в Safari на iPhone: открыть https://НОВЫЙ.ru/health — нет красной плашки = домен чистый.
```
«Тихий режим» (main.tsx) уже редиректит не-TG трафик нового домена в бота, чтобы краулеры не видели платёжный лендинг → меньше шанс попасть под фрод-флаг снова. Если домен меняется — поправить хост в условии редиректа (`endsWith('cupidonapp.ru')`).

---

## Что НЕ помогает / не трогать
- Google Search Console / GSB-review — если Google уже чист, это ничего не даёт (флаг у Apple).
- Просить юзеров отключать Fraudulent Website Warning — не масштабируется.
- Выключать `cupidonai.ru` — там оферта ЮКассы + вебхук. Оставить.
- Менять домен в кабинете ЮКассы — НЕ требуется (витрина-оферта остаётся на cupidonai.ru, платежи идут через бэкенд + хостед-страницу ЮКассы).
