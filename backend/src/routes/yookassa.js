// ═══════════════════════════════════════════════════════════════
// YooKassa webhook (Phase I — оплата картой через ЮКассу).
//
// Подключается в index.js ДО глобального requireInitData — webhook
// приходит ОТ ЮКассы, не от Mini App, у него своя авторизация:
//   - secret-token в header X-YK-Webhook-Token (мы задаём при создании
//     webhook в ЛК ЮКассы) — простая константа, сверяем timing-safely.
//   - Альтернатива: IP allowlist 185.71.76.0/27 и др. (см. docs).
//
// Обрабатываемые события:
//   - payment.succeeded → активировать подписку (idempotent по payment.id)
//   - payment.canceled  → пометить запись как failed (не критично)
//   - refund.succeeded  → пометить как refunded
//
// Идемпотентность критична: ЮКасса ретраит на 5xx. Возвращаем 200 даже
// при ошибках (только лог) — иначе будут дубли активации.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import db from '../db/index.js';

const router = Router();

const YK_WEBHOOK_SECRET = process.env.YK_WEBHOOK_SECRET;

const PLAN_DURATION_DAYS = {
  basic:    30,
  premium:  30,
  // day_pass — НЕ создаёт subscription, см. handlePaymentSucceeded.
  // Оставлен в map чтобы plan-валидация не отвергала day_pass-webhook'и.
  day_pass: 0,
};

// Day Pass — пополнение запасной квоты на +N запросов (новая концепция).
// См. routes/yookassa.js, routes/telegram.js, utils/reconcile.js — все три места
// должны быть синхронизированы.
const DAY_PASS_BONUS_QUOTA = parseInt(process.env.DAY_PASS_BONUS_QUOTA, 10) || 100;

/**
 * Опциональная constant-time проверка секрета.
 *
 * Если YK_WEBHOOK_SECRET задан И в запросе есть X-YK-Webhook-Token — сверяем
 * через timingSafeEqual. Если они не совпадают → 401.
 *
 * Если header в запросе ОТСУТСТВУЕТ (ЛК ЮКассы не всегда даёт настройку
 * "Дополнительный заголовок") — пропускаем с warning. Защита тогда через
 * IP allowlist ЮКассы (185.71.76.0/27 и др. в nginx).
 *
 * Если YK_WEBHOOK_SECRET вообще не задан в .env → пропускаем с warning.
 */
function verifySecret(reqToken) {
  if (!YK_WEBHOOK_SECRET) {
    console.warn('[yookassa] YK_WEBHOOK_SECRET не задан в .env — пропускаем без проверки токена');
    return true; // не блочим — защита через IP allowlist на nginx
  }
  if (typeof reqToken !== 'string' || reqToken.length === 0) {
    console.warn('[yookassa] webhook без X-YK-Webhook-Token header — пропускаем (ЛК ЮКассы не настроил доп.заголовок)');
    return true; // не блочим — ЛК ЮКассы может не поддерживать кастомные headers
  }
  // Если header есть — сверяем строго
  const a = Buffer.from(reqToken);
  const b = Buffer.from(YK_WEBHOOK_SECRET);
  if (a.length !== b.length) {
    console.warn('[yookassa] webhook с НЕВЕРНЫМ X-YK-Webhook-Token — отклоняем');
    return false;
  }
  try {
    const ok = timingSafeEqual(a, b);
    if (!ok) console.warn('[yookassa] webhook с НЕВЕРНЫМ X-YK-Webhook-Token (length match) — отклоняем');
    return ok;
  } catch (_) { return false; }
}

// ── POST /api/v1/yookassa/webhook ─────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  const reqToken = req.header('X-YK-Webhook-Token');
  if (!verifySecret(reqToken)) {
    return res.status(401).json({ ok: false });
  }

  const event = req.body?.event;
  const payment = req.body?.object;

  // КРИТИЧНО: возвращаем 200 даже при ошибках. ЮКасса ретраит на 5xx
  // и можем получить дубль активации.
  try {
    if (event === 'payment.succeeded' && payment?.status === 'succeeded') {
      await handlePaymentSucceeded(payment);
    } else if (event === 'payment.canceled') {
      await handlePaymentCanceled(payment);
    } else if (event === 'refund.succeeded') {
      await handleRefund(payment);
    }
  } catch (err) {
    console.error('[yookassa/webhook] handler error:', err?.message || err);
  }
  res.json({ ok: true });
});

// ── Internal handlers ────────────────────────────────────────────────────────

/**
 * payment.succeeded — основной случай. Активируем подписку идемпотентно.
 * Race-safe: UNIQUE(charge_id) гарантирует что повторный webhook не создаст
 * вторую subscription.
 */
async function handlePaymentSucceeded(payment) {
  const chargeId = payment?.id;
  if (!chargeId) {
    console.warn('[yookassa] payment.succeeded missing id');
    return;
  }
  const metadata = payment.metadata || {};
  const plan = metadata.plan;
  const tgUserId = parseInt(metadata.tg_user_id, 10);

  if (!plan || !(plan in PLAN_DURATION_DAYS)) {
    console.error('[yookassa] payment.succeeded with unknown plan', { chargeId, plan });
    return;
  }
  if (!tgUserId || Number.isNaN(tgUserId)) {
    console.error('[yookassa] payment.succeeded with bad tg_user_id', { chargeId, tg_user_id: metadata.tg_user_id });
    return;
  }

  // Проверка идемпотентности — уже processed?
  const existing = db.get(`SELECT status FROM payments WHERE charge_id = ?`, chargeId);
  if (existing?.status === 'succeeded') {
    console.log(`[yookassa] duplicate payment.succeeded for ${chargeId} — already processed`);
    return;
  }

  const amountMinor = Math.round(parseFloat(payment.amount?.value || '0') * 100);
  const currency = payment.amount?.currency || 'RUB';
  const rawJson = JSON.stringify(payment).slice(0, 8000);

  if (plan === 'day_pass') {
    // ── НОВАЯ концепция day_pass — +N запросов к tg_bonus_quota ────────────
    // Никакой subscription/tier-change. Просто пополнение bonus quota,
    // которая тратится по 1 за запрос через tryConsumeBonus в utils/limits.js.
    db.transaction(() => {
      if (existing) {
        db.run(
          `UPDATE payments
             SET status = 'succeeded',
                 processed_at = datetime('now'),
                 amount_minor = ?,
                 currency = ?,
                 raw = ?
           WHERE charge_id = ?`,
          amountMinor, currency, rawJson, chargeId
        );
      } else {
        const ins = db.run(
          `INSERT OR IGNORE INTO payments
             (telegram_user_id, charge_id, provider, plan, amount_minor, currency, status, processed_at, raw)
           VALUES (?, ?, 'yookassa', ?, ?, ?, 'succeeded', datetime('now'), ?)`,
          tgUserId, chargeId, plan, amountMinor, currency, rawJson
        );
        if (ins.changes === 0) {
          // Race: другой инстанс webhook'а только что вставил — выходим
          console.log(`[yookassa] day_pass duplicate (race) for ${chargeId} — skip`);
          return;
        }
      }

      db.run(
        `UPDATE users
           SET tg_bonus_quota = COALESCE(tg_bonus_quota, 0) + ?
         WHERE telegram_user_id = ?`,
        DAY_PASS_BONUS_QUOTA, tgUserId
      );
    })();

    console.log(`[yookassa] day_pass +${DAY_PASS_BONUS_QUOTA} quota: tg_user=${tgUserId} amount=${amountMinor/100} ${currency} charge=${chargeId}`);
    return;
  }

  // ── СТАРАЯ логика basic/premium — создаём/продлеваем subscription ────────
  db.transaction(() => {
    // 1. Upsert payment record (могли создать pending при /yookassa/invoice;
    //    либо webhook пришёл раньше нашего ответа — тогда создаём с нуля)
    if (existing) {
      db.run(
        `UPDATE payments
           SET status = 'succeeded',
               processed_at = datetime('now'),
               amount_minor = ?,
               currency = ?,
               raw = ?
         WHERE charge_id = ?`,
        amountMinor, currency, rawJson, chargeId
      );
    } else {
      db.run(
        `INSERT INTO payments
           (telegram_user_id, charge_id, provider, plan, amount_minor, currency, status, processed_at, raw)
         VALUES (?, ?, 'yookassa', ?, ?, ?, 'succeeded', datetime('now'), ?)`,
        tgUserId, chargeId, plan, amountMinor, currency, rawJson
      );
    }

    // 2. Активируем подписку (продление от max(now, current expires))
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

    // 3. Обновим кеш sub_tier на user-row
    db.run(
      `UPDATE users SET sub_tier = ?, sub_expires_at = ? WHERE telegram_user_id = ?`,
      plan === 'premium' ? 'premium' : 'basic',
      newExpires,
      tgUserId
    );
  })();

  console.log(`[yookassa] payment OK: tg_user=${tgUserId} plan=${plan} amount=${amountMinor/100} ${currency} charge=${chargeId}`);
}

async function handlePaymentCanceled(payment) {
  const chargeId = payment?.id;
  if (!chargeId) return;
  db.run(
    `UPDATE payments SET status = 'failed', processed_at = datetime('now') WHERE charge_id = ? AND status = 'pending'`,
    chargeId
  );
  console.log(`[yookassa] payment cancelled: charge=${chargeId}`);
}

async function handleRefund(refund) {
  // refund.payment_id — id оригинального платежа
  const originalChargeId = refund?.payment_id;
  if (!originalChargeId) return;
  db.run(
    `UPDATE payments SET status = 'refunded' WHERE charge_id = ?`,
    originalChargeId
  );
  console.log(`[yookassa] payment refunded: charge=${originalChargeId}`);
}

export default router;
