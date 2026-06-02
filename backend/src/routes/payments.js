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

const router = Router();

const PRICES = {
  basic:    parseInt(process.env.STARS_PRICE_BASIC, 10)    || 199,
  premium:  parseInt(process.env.STARS_PRICE_PREMIUM, 10)  || 499,
  day_pass: parseInt(process.env.STARS_PRICE_DAY_PASS, 10) || 50,
};

const PLAN_TITLES = {
  basic:    'Купидон — Basic (30 дней)',
  premium:  'Купидон — Premium (30 дней)',
  day_pass: 'Купидон — Дневной пропуск',
};

const PLAN_DESCRIPTIONS = {
  basic:    'Basic подписка: 30 запросов в день, все режимы. Действует 30 дней.',
  premium:  'Premium подписка: 100 запросов в день, приоритет, расширенный лимит истории. Действует 30 дней.',
  day_pass: 'Дневной пропуск: 30 запросов в день в течение 24 часов.',
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

export default router;
