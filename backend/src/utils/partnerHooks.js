// ═══════════════════════════════════════════════════════════════
// Partner program hooks.
//
// Вызывается в трёх местах:
//   1) routes/users.js → /me — first-touch attribution из start_param=p_<code>
//   2) routes/yookassa.js handlePaymentSucceeded — регистрация commission
//      когда юзер с атрибуцией оплачивает basic/premium/day_pass
//   3) routes/telegram.js handleSuccessfulPayment — то же для Stars
//   4) utils/reconcile.js — тик каждые N минут переводит pending→available
//      через releasePendingCommissions(); раз в сутки refreshDailyStats().
//
// Ключевые инварианты:
//   - commission_pct берётся из partners.commission_pct на момент регистрации
//     (не меняется после создания партнёра — см. правила в задаче).
//   - net = gross - ai_cost - yk_fee - tax (всё в копейках).
//   - 14-day hold: pending → available через 14 суток. При refund — удаляем.
//   - First-touch: повторный заход по реф-ссылке существующего юзера НЕ
//     пересоздаёт атрибуцию.
//   - Самореферал блокируется.
// ═══════════════════════════════════════════════════════════════
import db from '../db/index.js';

const AI_COST_BASIC    = (parseInt(process.env.AI_COST_BASIC, 10)    || 90)  * 100;
const AI_COST_PREMIUM  = (parseInt(process.env.AI_COST_PREMIUM, 10)  || 300) * 100;
const AI_COST_DAY_PASS = (parseInt(process.env.AI_COST_DAY_PASS, 10) || 20)  * 100;

const AI_COSTS_KOPECKS = {
  basic:    AI_COST_BASIC,
  premium:  AI_COST_PREMIUM,
  day_pass: AI_COST_DAY_PASS,
};

// ЮКасса комиссия и налог. Default 2.8% (ЮК самозанятый) и 4% (НПД).
const YK_FEE_PCT = parseFloat(process.env.RUB_COMMISSION_PCT_BUFFER || process.env.YK_FEE_PCT || '2.8');
const TAX_PCT    = parseFloat(process.env.TAX_PCT || '4');

const HOLD_DAYS = parseInt(process.env.PARTNER_HOLD_DAYS, 10) || 14;

/**
 * Расчёт распределения: net и commission в копейках.
 *
 * @param {number} grossKopecks — сумма платежа в копейках (29900 для 299₽)
 * @param {string} plan — basic | premium | day_pass
 * @param {number} commissionPct — 10..50
 */
export function calcCommission(grossKopecks, plan, commissionPct) {
  const aiCost = AI_COSTS_KOPECKS[plan] || 0;
  const ykFee = Math.round(grossKopecks * YK_FEE_PCT / 100);
  const tax   = Math.round(grossKopecks * TAX_PCT / 100);
  const net   = Math.max(0, grossKopecks - aiCost - ykFee - tax);
  const commission = Math.round(net * commissionPct / 100);
  return { aiCost, ykFee, tax, net, commission };
}

/**
 * Регистрирует commission по успешному платежу, если у юзера есть активный
 * атрибутированный партнёр. Идемпотентно по payment_id — если уже есть
 * запись с этим payment_id, ничего не делает.
 *
 * @param {number} paymentId — payments.id
 * @param {number} tgUserId — telegram_user_id юзера который оплатил
 * @param {string} plan — basic | premium | day_pass
 * @param {number} grossKopecks — сумма в копейках
 * @returns {number|null} commission_id или null если партнёра нет
 */
export function registerCommissionFromPayment(paymentId, tgUserId, plan, grossKopecks) {
  try {
    const referral = db.get(
      `SELECT pr.partner_id, p.commission_pct, p.status
       FROM partner_referrals pr
       JOIN partners p ON p.id = pr.partner_id
       WHERE pr.telegram_user_id = ?`,
      tgUserId
    );

    if (!referral || referral.status !== 'active') return null;

    // Идемпотентность по payment_id
    const existing = db.get('SELECT id FROM partner_commissions WHERE payment_id = ?', paymentId);
    if (existing) return existing.id;

    const { aiCost, ykFee, tax, net, commission } = calcCommission(grossKopecks, plan, referral.commission_pct);

    if (commission <= 0) {
      console.log(`[partner] zero commission for payment ${paymentId} (plan=${plan}, gross=${grossKopecks/100}₽) — skipping`);
      return null;
    }

    const availableAt = new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString();

    const result = db.run(
      `INSERT INTO partner_commissions
         (partner_id, payment_id, telegram_user_id, gross_amount, ai_cost, yk_fee, tax, net_amount,
          commission_pct, commission_amount, status, available_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      referral.partner_id, paymentId, tgUserId, grossKopecks, aiCost, ykFee, tax, net,
      referral.commission_pct, commission, availableAt
    );

    console.log(`[partner] commission ${commission/100}₽ → partner ${referral.partner_id} (payment=${paymentId}, hold until ${availableAt})`);
    return result.lastInsertRowid;
  } catch (err) {
    console.error('[partner] registerCommissionFromPayment failed:', err?.message || err);
    return null;
  }
}

/**
 * Удаляет commission при refund. Только если он ещё в pending (hold не истёк) —
 * available/paid commissions не трогаем (юзер уже мог получить деньги).
 *
 * @param {string} chargeId — yookassa payment.id
 */
export function cancelCommissionOnRefund(chargeId) {
  try {
    const payment = db.get('SELECT id FROM payments WHERE charge_id = ?', chargeId);
    if (!payment) return;
    const result = db.run(
      `DELETE FROM partner_commissions
       WHERE payment_id = ? AND status = 'pending'`,
      payment.id
    );
    if (result.changes > 0) {
      console.log(`[partner] cancelled ${result.changes} pending commissions on refund (payment=${payment.id})`);
    }
  } catch (err) {
    console.error('[partner] cancelCommissionOnRefund failed:', err?.message || err);
  }
}

/**
 * First-touch attribution. Вызывается из /users/me когда юзер впервые открывает
 * Mini App через deep-link t.me/Cupidon_Ai_Bot/app?startapp=p_<code>.
 *
 * Правила:
 *   - Юзер уже имеет атрибуцию → ничего не делаем (organic protection).
 *   - Партнёр не существует / status != 'active' → не атрибутируем.
 *   - Self-referral (партнёр сам открыл свою ссылку) → не атрибутируем.
 *
 * @returns {number|null} partner_id или null
 */
export function attributePartnerReferral(tgUserId, startParam) {
  try {
    if (!startParam || typeof startParam !== 'string') return null;
    if (!startParam.startsWith('p_')) return null;
    const code = startParam.slice(2).toLowerCase().slice(0, 64);
    if (!code) return null;

    // First-touch: уже атрибутирован — не пересоздаём
    const existing = db.get('SELECT id FROM partner_referrals WHERE telegram_user_id = ?', tgUserId);
    if (existing) return null;

    const partner = db.get(
      `SELECT id, telegram_user_id FROM partners WHERE lower(code) = ? AND status = 'active'`,
      code
    );
    if (!partner) return null;

    // Self-referral block
    if (partner.telegram_user_id === tgUserId) {
      console.log(`[partner] self-referral blocked: tg=${tgUserId} code=${code}`);
      return null;
    }

    db.run(
      'INSERT INTO partner_referrals (partner_id, telegram_user_id) VALUES (?, ?)',
      partner.id, tgUserId
    );
    console.log(`[partner] new referral: tg=${tgUserId} → partner=${partner.id} (code=${code})`);
    return partner.id;
  } catch (err) {
    // UNIQUE constraint race — не критично
    if (!/UNIQUE/.test(err?.message || '')) {
      console.error('[partner] attributePartnerReferral failed:', err?.message || err);
    }
    return null;
  }
}

/**
 * Cron: переводит pending → available если available_at <= now.
 * Вызывается из reconcile.js каждые N минут.
 */
export function releasePendingCommissions() {
  try {
    const result = db.run(`
      UPDATE partner_commissions
      SET status = 'available'
      WHERE status = 'pending' AND datetime(available_at) <= datetime('now')
    `);
    if (result.changes > 0) {
      console.log(`[partner] released ${result.changes} commissions to 'available'`);
    }
  } catch (err) {
    console.error('[partner] releasePendingCommissions failed:', err?.message || err);
  }
}

/**
 * Cron: ежедневная статистика. Считает данные за вчерашний UTC-день и
 * upsert'ит в partner_daily_stats. Защита от двойного выполнения через
 * INSERT OR REPLACE (PK = partner_id+date).
 */
export function refreshDailyStats() {
  try {
    // Вчерашний UTC-день
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${day}`;
    const dayStart = `${dateKey} 00:00:00`;
    const dayEnd   = `${dateKey} 23:59:59`;

    // Новые рефералы за этот день
    const referralRows = db.all(
      `SELECT partner_id, COUNT(*) as cnt FROM partner_referrals
       WHERE datetime(attributed_at) BETWEEN datetime(?) AND datetime(?)
       GROUP BY partner_id`,
      dayStart, dayEnd
    );

    // Платежи через рефералку за день (gross + commission)
    const commissionRows = db.all(
      `SELECT partner_id,
              COUNT(DISTINCT telegram_user_id) as paid_users,
              SUM(gross_amount) as gross,
              SUM(commission_amount) as commission
       FROM partner_commissions
       WHERE datetime(created_at) BETWEEN datetime(?) AND datetime(?)
       GROUP BY partner_id`,
      dayStart, dayEnd
    );

    const merged = new Map();
    for (const r of referralRows) {
      merged.set(r.partner_id, { new_referrals: r.cnt, paid_users: 0, gross: 0, commission: 0 });
    }
    for (const c of commissionRows) {
      const cur = merged.get(c.partner_id) || { new_referrals: 0, paid_users: 0, gross: 0, commission: 0 };
      cur.paid_users = c.paid_users || 0;
      cur.gross = c.gross || 0;
      cur.commission = c.commission || 0;
      merged.set(c.partner_id, cur);
    }

    let n = 0;
    for (const [partnerId, vals] of merged.entries()) {
      db.run(
        `INSERT OR REPLACE INTO partner_daily_stats
           (partner_id, date, new_referrals, paid_users, gross_revenue, commission_earned)
         VALUES (?, ?, ?, ?, ?, ?)`,
        partnerId, dateKey, vals.new_referrals, vals.paid_users, vals.gross, vals.commission
      );
      n++;
    }
    if (n > 0) console.log(`[partner] refreshed daily stats for ${n} partners (${dateKey})`);
  } catch (err) {
    console.error('[partner] refreshDailyStats failed:', err?.message || err);
  }
}

/**
 * Возвращает true если у tg-юзера есть запись в partners.
 * Используется в buildUserResponse для флага is_partner.
 */
export function isPartner(tgUserId) {
  try {
    const row = db.get(`SELECT id FROM partners WHERE telegram_user_id = ? AND status = 'active'`, tgUserId);
    return !!row;
  } catch (_) {
    return false;
  }
}
