// ═══════════════════════════════════════════════════════════════
// YooKassa reconciliation — safety net на случай если webhook потерялся.
//
// Каждые RECONCILE_INTERVAL_MIN минут (default 5) пробегаемся по записям
// payments(provider='yookassa', status='pending') младше 24ч и проверяем
// их актуальный статус в ЮКассе. Если succeeded — активируем подписку
// тем же кодом что и webhook.
//
// Идемпотентность: handlePaymentSucceeded из routes/yookassa.js — race-safe
// (UNIQUE charge_id, проверка status='succeeded' до обновления). Так что
// даже если webhook И reconciliation сработают одновременно — только один
// из них успеет создать subscription.
//
// Если YK_SHOP_ID/YK_SECRET_KEY не заданы — reconciliation no-op (логируем
// предупреждение раз в N минут).
// ═══════════════════════════════════════════════════════════════
import db from '../db/index.js';

const PLAN_DURATION_DAYS = {
  basic:    30,
  premium:  30,
  day_pass: 1,
};

let timer = null;

/**
 * Опрашиваем ЮКассу по одному pending платежу. Если он succeeded — активируем
 * подписку через тот же transaction-pattern что и в webhook.
 */
async function reconcileOnePayment(record, auth) {
  const chargeId = record.charge_id;
  let yk;
  try {
    const apiRes = await fetch(`https://api.yookassa.ru/v3/payments/${chargeId}`, {
      method: 'GET',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
    });
    yk = await apiRes.json();
    if (!apiRes.ok) {
      console.warn(`[reconcile] YK API ${apiRes.status} for ${chargeId}:`, yk);
      return;
    }
  } catch (err) {
    console.warn(`[reconcile] fetch failed for ${chargeId}:`, err?.message);
    return;
  }

  if (yk?.status !== 'succeeded') {
    // Если payment отменён/expired — пометим в БД (необязательно)
    if (yk?.status === 'canceled') {
      db.run(`UPDATE payments SET status = 'failed', processed_at = datetime('now') WHERE charge_id = ?`, chargeId);
    }
    return;
  }

  // succeeded — активируем подписку
  const metadata = yk.metadata || {};
  const plan = metadata.plan;
  const tgUserId = parseInt(metadata.tg_user_id, 10);
  if (!plan || !PLAN_DURATION_DAYS[plan] || !tgUserId) {
    console.error('[reconcile] bad metadata in succeeded payment', { chargeId, metadata });
    return;
  }

  const existing = db.get(`SELECT status FROM payments WHERE charge_id = ?`, chargeId);
  if (existing?.status === 'succeeded') {
    // Уже обработан вебхуком за это время — выходим
    return;
  }

  const amountMinor = Math.round(parseFloat(yk.amount?.value || '0') * 100);
  const currency = yk.amount?.currency || 'RUB';

  db.transaction(() => {
    db.run(
      `UPDATE payments
         SET status = 'succeeded',
             processed_at = datetime('now'),
             amount_minor = ?,
             currency = ?,
             raw = ?
       WHERE charge_id = ?`,
      amountMinor, currency, JSON.stringify(yk).slice(0, 8000), chargeId
    );

    const days = PLAN_DURATION_DAYS[plan];
    const current = db.get(
      `SELECT expires_at FROM subscriptions
       WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
       ORDER BY datetime(expires_at) DESC LIMIT 1`,
      tgUserId
    );
    const base = current?.expires_at && new Date(current.expires_at) > new Date()
      ? new Date(current.expires_at)
      : new Date();
    const newExpires = new Date(base.getTime() + days * 86_400_000).toISOString();

    db.run(
      `INSERT INTO subscriptions (telegram_user_id, plan, source, started_at, expires_at, is_trial, auto_renew)
       VALUES (?, ?, 'yookassa', datetime('now'), ?, 0, 0)`,
      tgUserId, plan, newExpires
    );

    db.run(
      `UPDATE users SET sub_tier = ?, sub_expires_at = ? WHERE telegram_user_id = ?`,
      plan === 'premium' ? 'premium' : 'basic',
      newExpires,
      tgUserId
    );
  })();

  console.log(`[reconcile] activated via cron: tg_user=${tgUserId} plan=${plan} charge=${chargeId}`);
}

async function reconcileTick() {
  const YK_SHOP_ID = process.env.YK_SHOP_ID;
  const YK_SECRET_KEY = process.env.YK_SECRET_KEY;
  if (!YK_SHOP_ID || !YK_SECRET_KEY) return; // no-op без ключей

  // Берём pending платежи последних 24ч (limit 50 — за тик)
  const records = db.all(
    `SELECT charge_id FROM payments
     WHERE provider = 'yookassa' AND status = 'pending'
       AND datetime(created_at) > datetime('now', '-1 day')
     LIMIT 50`
  );
  if (!records.length) return;

  const auth = 'Basic ' + Buffer.from(`${YK_SHOP_ID}:${YK_SECRET_KEY}`).toString('base64');
  for (const r of records) {
    try {
      await reconcileOnePayment(r, auth);
    } catch (err) {
      console.error('[reconcile] one-payment error:', err?.message || err);
    }
  }
}

export function startReconciliation() {
  if (timer) return;
  const minutes = parseInt(process.env.RECONCILE_INTERVAL_MIN, 10) || 5;
  const ms = Math.max(1, minutes) * 60 * 1000;
  // Первый запуск с задержкой 60с — чтоб не блокировать startup
  setTimeout(() => {
    reconcileTick().catch(err => console.error('[reconcile] tick failed:', err?.message));
    timer = setInterval(() => {
      reconcileTick().catch(err => console.error('[reconcile] tick failed:', err?.message));
    }, ms);
  }, 60_000);
  console.log(`[reconcile] scheduled every ${minutes} min`);
}

export function stopReconciliation() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
