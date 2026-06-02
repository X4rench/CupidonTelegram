// ═══════════════════════════════════════════════════════════════
// Telegram initData auth middleware.
//
// Идентичность пользователя в TMA приходит ТОЛЬКО из Telegram-клиента
// через initData — подписанную HMAC-SHA256(BOT_TOKEN) строку. Клиент
// шлёт её в каждом запросе: `Authorization: tma <initDataRaw>`.
//
// Что проверяется:
//   1. HMAC-подпись initData (constant-time через timingSafeEqual)
//   2. TTL — initData выпущен не более TTL_SEC секунд назад
//   3. user{} в initData существует
//
// DEV-режим: NODE_ENV != 'production' + DEV_BYPASS_INITDATA=1 → парсит
// initData unsafe (без HMAC) — удобно для локалки без BOT_TOKEN.
//
// После успеха в req.tgUser лежит { id, first_name, last_name, username,
// language_code, photo_url, start_param }.
// ═══════════════════════════════════════════════════════════════
import { createHmac, timingSafeEqual } from 'crypto';

// TTL initData. По стандарту TG — 24 часа. Раньше было 7 дней (Desktop
// переиспользует initData до перезапуска клиента), но в случае XSS/clipboard-кражи
// 7 дней слишком большое окно. Telegram WebApp при reload получает свежий initData,
// поэтому 24 часа — баланс между UX и безопасностью.
const TTL_SEC = parseInt(process.env.INITDATA_TTL_SEC, 10) || 60 * 60 * 24;

const BOT_TOKEN  = process.env.BOT_TOKEN;
const DEV_BYPASS = process.env.DEV_BYPASS_INITDATA === '1' && process.env.NODE_ENV !== 'production';

// Sanity warning — продакшен без BOT_TOKEN это критично.
if (process.env.NODE_ENV === 'production' && !BOT_TOKEN) {
  console.error('\x1b[31m[FATAL] BOT_TOKEN не задан в production!\x1b[0m');
}
if (process.env.NODE_ENV === 'production' && process.env.DEV_BYPASS_INITDATA === '1') {
  console.error('\x1b[31m[FATAL] DEV_BYPASS_INITDATA=1 в NODE_ENV=production! Эта конфигурация позволяет любому подделать аутентификацию.\x1b[0m');
  process.exit(1);
}

/**
 * Парсит initData в объект { hash, auth_date, user, start_param, ... }
 * без проверки подписи. Используется внутри validate и в DEV-bypass.
 */
function parseInitData(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;

  if (out.user) {
    try { out.user = JSON.parse(out.user); } catch (_) { out.user = null; }
  }
  return out;
}

/**
 * Проверяет HMAC initData. Возвращает true/false (без выбрасывания).
 * Алгоритм TG (Web App): https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *   secret_key = HMAC_SHA256(bot_token, "WebAppData")
 *   data_check_string = key1=val1\nkey2=val2\n... (отсортировано, без hash)
 *   expected = HMAC_SHA256(data_check_string, secret_key) hex
 *   match expected === hash
 */
function verifyInitDataHmac(rawInitData, botToken) {
  const params = new URLSearchParams(rawInitData);
  const hash = params.get('hash');
  if (!hash) {
    console.warn('[auth-debug] no hash in initData; keys:', [...params.keys()].join(','));
    return false;
  }
  params.delete('hash');
  // signature — не часть проверки, удаляем если есть (TDesktop иногда шлёт)
  params.delete('signature');

  const dataCheckArr = [];
  for (const [k, v] of params.entries()) dataCheckArr.push(`${k}=${v}`);
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(hash), 'hex');
  const ok = (a.length === b.length) && (() => { try { return timingSafeEqual(a, b); } catch (_) { return false; } })();

  if (!ok) {
    // DEBUG: при FAILED HMAC логируем структуру (без PII значений) —
    // помогает понять появилось ли в initData новое поле, или токен не тот.
    const keys = [...params.keys()].sort().join(',');
    console.warn('[auth-debug] HMAC mismatch',
      'keys=' + keys,
      'dcs_len=' + dataCheckString.length,
      'expected_prefix=' + expected.slice(0, 12),
      'got_prefix=' + String(hash).slice(0, 12),
      'token_prefix=' + String(botToken).slice(0, 12),
      'raw_len=' + rawInitData.length,
    );
  }

  return ok;
}

/**
 * Главный middleware. На успехе кладёт req.tgUser и пропускает дальше;
 * на провале — отвечает 401 с структурированным error.code.
 */
export function requireInitData(req, res, next) {
  const authHeader = req.header('Authorization') || '';
  const m = /^tma\s+(.+)$/i.exec(authHeader);
  if (!m) {
    return res.status(401).json({ ok: false, error: 'Не авторизован — Mini App открыт вне Telegram', code: 'NO_INIT_DATA' });
  }
  const rawInitData = m[1].trim();

  let parsed;

  if (DEV_BYPASS) {
    // DEV: без HMAC — только parse. Удобно для тестирования с обычного браузера.
    parsed = parseInitData(rawInitData);
  } else {
    if (!BOT_TOKEN) {
      return res.status(500).json({ ok: false, error: 'BOT_TOKEN не задан на сервере', code: 'SERVER_MISCONFIGURED' });
    }
    if (!verifyInitDataHmac(rawInitData, BOT_TOKEN)) {
      return res.status(401).json({ ok: false, error: 'Подпись initData недействительна', code: 'INVALID_HMAC' });
    }
    parsed = parseInitData(rawInitData);
  }

  // TTL — auth_date в секундах
  const authDate = parseInt(parsed.auth_date, 10);
  if (Number.isFinite(authDate)) {
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > TTL_SEC) {
      return res.status(401).json({ ok: false, error: 'initData истёк — перезапусти Mini App', code: 'STALE_INIT_DATA' });
    }
  }

  if (!parsed.user || typeof parsed.user.id !== 'number') {
    return res.status(401).json({ ok: false, error: 'initData не содержит user', code: 'NO_USER' });
  }

  req.tgUser = parsed.user;             // { id, first_name, last_name, username, language_code, photo_url }
  req.startParam = parsed.start_param || null;
  next();
}

/** RBAC: только для админов (ADMIN_TELEGRAM_IDS в env через запятую). */
export function requireAdminTg(req, res, next) {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
  if (!req.tgUser?.id || !adminIds.includes(req.tgUser.id)) {
    return res.status(403).json({ ok: false, error: 'Доступ запрещён', code: 'NOT_ADMIN' });
  }
  next();
}

/** Список админских telegram_user_id из env. */
export function getAdminIds() {
  return (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
}
