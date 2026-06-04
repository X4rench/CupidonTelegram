// ═══════════════════════════════════════════════════════════════
// Payments router (TMA).
//
// POST /payments/invoice → создаёт invoice link для Telegram Stars.
// Фронт открывает его через WebApp.openInvoice(url).
// После оплаты Telegram шлёт `successful_payment` в webhook (routes/telegram.js),
// там идёт идемпотентное создание subscription по charge_id.
//
// Цены в Stars (XTR) — фиксированно из env:
//   STARS_PRICE_BASIC    (default 199 — месяц basic)
//   STARS_PRICE_PREMIUM  (default 499 — месяц premium)
//   STARS_PRICE_DAY_PASS (default 50  — день любого тира)
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import crypto from 'node:crypto';
import { createInvoiceLink } from '../services/bot-api.js';
import db from '../db/index.js';

const router = Router();

const PRICES = {
  basic:    parseInt(process.env.STARS_PRICE_BASIC, 10)    || 199,
  premium:  parseInt(process.env.STARS_PRICE_PREMIUM, 10)  || 499,
  day_pass: parseInt(process.env.STARS_PRICE_DAY_PASS, 10) || 50,
};

const PLAN_TITLES = {
  basic:    'Купидон — Basic (30 дней)',
  premium:  'Купидон — Premium (30 дней)',
  day_pass: 'Купидон — +100 запросов',
};

const PLAN_DESCRIPTIONS = {
  basic:    'Basic подписка: 30 запросов в день, все режимы. Действует 30 дней.',
  premium:  'Premium подписка: 100 запросов в день, приоритет, расширенный лимит истории. Действует 30 дней.',
  day_pass: 'Пополнение баланса на +100 запросов. Не сгорают, тратятся по 1 за запрос.',
};

// ── POST /api/v1/payments/invoice ────────────────────────────────────────────
// body: { plan: 'basic' | 'premium' | 'day_pass' }
// returns: { ok, invoice_url }
router.post('/invoice', async (req, res) => {
  const { plan } = req.body;
  if (!plan || !PRICES[plan]) {
    return res.status(400).json({ ok: false, error: `plan должен быть один из: ${Object.keys(PRICES).join(', ')}` });
  }

  const amount = PRICES[plan];
  // payload = непрозрачная строка для нас: возвращается в pre_checkout_query и
  // successful_payment. Содержит plan + tg_user_id + nonce — чтобы мы знали кому/чему засчитать.
  // Длина <= 128 байт (требование TG).
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = JSON.stringify({
    plan,
    tg_user_id: req.tgUser.id,
    nonce,
    ts: Math.floor(Date.now() / 1000),
  });
  if (payload.length > 128) {
    // Если username очень длинный — сделаем короче (но обычно <128)
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка: payload слишком длинный' });
  }

  try {
    const invoiceUrl = await createInvoiceLink({
      title:       PLAN_TITLES[plan],
      description: PLAN_DESCRIPTIONS[plan],
      payload,
      currency:    'XTR',
      prices:      [{ label: PLAN_TITLES[plan], amount }],
    });
    res.json({ ok: true, invoice_url: invoiceUrl, plan, amount });
  } catch (err) {
    console.error('[payments/invoice]', err.message);
    res.status(500).json({ ok: false, error: 'Не удалось создать счёт. Попробуй позже.' });
  }
});

// ── GET /api/v1/payments/prices ──────────────────────────────────────────────
// Публичные цены для отображения на экране подписки.
router.get('/prices', (req, res) => {
  res.json({
    ok: true,
    currency: 'XTR',
    prices: PRICES,
    titles: PLAN_TITLES,
    descriptions: PLAN_DESCRIPTIONS,
  });
});

// ── POST /api/v1/payments/yookassa/invoice (Phase I — ЮКасса) ────────────────
// Создаёт платёж в ЮКассе и возвращает confirmation_url для перенаправления.
// Юзер открывает этот URL, оплачивает картой → ЮКасса шлёт webhook на
// /api/v1/yookassa/webhook, который активирует подписку идемпотентно.
//
// Цены в рублях — фиксированно из env (YK_PRICE_BASIC и т.д.).
//
// Если YK_SHOP_ID/YK_SECRET_KEY не заданы — возвращаем 503 «не настроено».
const YK_PRICES_RUB = {
  basic:    parseInt(process.env.YK_PRICE_BASIC, 10)    || 280,
  premium:  parseInt(process.env.YK_PRICE_PREMIUM, 10)  || 700,
  day_pass: parseInt(process.env.YK_PRICE_DAY_PASS, 10) || 70,
};

router.post('/yookassa/invoice', async (req, res) => {
  const YK_SHOP_ID = process.env.YK_SHOP_ID;
  const YK_SECRET_KEY = process.env.YK_SECRET_KEY;

  if (!YK_SHOP_ID || !YK_SECRET_KEY) {
    return res.status(503).json({ ok: false, error: 'Оплата картой временно недоступна. Используй Telegram Stars.' });
  }

  const { plan } = req.body || {};
  if (!plan || !YK_PRICES_RUB[plan]) {
    return res.status(400).json({ ok: false, error: `plan должен быть один из: ${Object.keys(YK_PRICES_RUB).join(', ')}` });
  }

  const amountRub = YK_PRICES_RUB[plan];
  const idempotenceKey = crypto.randomBytes(16).toString('hex');
  const botUsername = process.env.BOT_USERNAME || 'CupidonAppBot';
  const botAppName  = process.env.BOT_APP_NAME  || 'app';
  const returnUrl = `https://t.me/${botUsername}/${botAppName}`;

  let data;
  try {
    const apiRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Idempotence-Key': idempotenceKey,
        'Authorization': 'Basic ' + Buffer.from(`${YK_SHOP_ID}:${YK_SECRET_KEY}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { value: amountRub.toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: returnUrl,
        },
        description: `Купидон — ${plan}`,
        metadata: {
          plan,
          tg_user_id: String(req.tgUser.id),
        },
      }),
    });
    data = await apiRes.json();
    if (!apiRes.ok || !data?.confirmation?.confirmation_url) {
      console.error('[payments/yookassa/invoice] YK API error:', apiRes.status, data);
      return res.status(502).json({ ok: false, error: 'Не удалось создать платёж ЮКассы', detail: data });
    }
  } catch (err) {
    console.error('[payments/yookassa/invoice] fetch failed:', err?.message || err);
    return res.status(502).json({ ok: false, error: 'Сервис оплаты недоступен. Попробуй позже.' });
  }

  // Сохраним pending запись для матчинга вебхуком + reconciliation
  try {
    db.run(
      `INSERT OR IGNORE INTO payments (telegram_user_id, charge_id, provider, plan, amount_minor, currency, status, raw)
       VALUES (?, ?, 'yookassa', ?, ?, 'RUB', 'pending', ?)`,
      req.tgUser.id, data.id, plan, amountRub * 100, JSON.stringify(data).slice(0, 8000)
    );
  } catch (err) {
    console.warn('[payments/yookassa/invoice] db insert failed:', err?.message);
  }

  res.json({
    ok: true,
    confirmation_url: data.confirmation.confirmation_url,
    payment_id: data.id,
    amount_rub: amountRub,
  });
});

export default router;
