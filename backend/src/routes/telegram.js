// ═══════════════════════════════════════════════════════════════
// Telegram Bot webhook (TMA).
//
// Этот роутер подключается ДО глобального requireInitData — у webhook
// собственная аутентификация через X-Telegram-Bot-Api-Secret-Token (мы сами
// задаём этот секрет при setWebhook, см. scripts/setup-webhook.js).
//
// Обрабатываемые updates:
//   - message с '/start' [start_param] → приветствие со ссылкой на mini app
//   - message с '/paysupport'         → обязательная команда для платных ботов
//   - message с '/help'               → краткая справка
//   - pre_checkout_query              → answerPreCheckoutQuery(ok=true) если payload валиден
//   - successful_payment              → создать запись в payments + активировать subscription
//                                       (идемпотентно по telegram_payment_charge_id)
//
// Идемпотентность платежей — критична (см. §5.19, §5.37 в TMA_PORTING_PLAYBOOK):
//   payments(charge_id) UNIQUE + processed_at: при повторном updates от TG
//   мы видим что charge уже processed и ничего не делаем (но 200 OK для TG).
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import db from '../db/index.js';
import { sendMessage, answerPreCheckoutQuery } from '../services/bot-api.js';
import { registerCommissionFromPayment } from '../utils/partnerHooks.js';

const router = Router();

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const MINIAPP_URL    = process.env.MINIAPP_URL || 'https://t.me/your_bot_username/app';
const BOT_USERNAME   = process.env.BOT_USERNAME || 'your_bot';
// Для inline button web_app — нужен URL самого Mini App (HTTPS), НЕ t.me-ссылка.
// TG отклоняет BUTTON_URL_INVALID если в web_app.url стоит t.me/...
const WEB_APP_URL    = process.env.PUBLIC_BASE_URL || 'https://cupidonai.ru';

const PLAN_DURATION_DAYS = {
  basic:    30,
  premium:  30,
  // day_pass — НЕ создаёт subscription (новая концепция: +N запросов к bonus_quota)
  day_pass: 0,
};

const DAY_PASS_BONUS_QUOTA = parseInt(process.env.DAY_PASS_BONUS_QUOTA, 10) || 100;

/**
 * Constant-time проверка секрета X-Telegram-Bot-Api-Secret-Token.
 * Без неё кто угодно может слать поддельные updates и активировать чужие подписки.
 */
function verifySecret(reqToken) {
  if (!WEBHOOK_SECRET) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET не задан — webhook отклоняет все запросы');
    return false;
  }
  if (typeof reqToken !== 'string') return false;
  const a = Buffer.from(reqToken);
  const b = Buffer.from(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch (_) { return false; }
}

// ── POST /api/v1/telegram/webhook ─────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // 1. Verify secret
  const reqToken = req.header('X-Telegram-Bot-Api-Secret-Token');
  if (!verifySecret(reqToken)) {
    console.warn('[telegram] webhook with invalid secret');
    return res.status(401).json({ ok: false });
  }

  const update = req.body || {};

  // КРИТИЧНО: TG считает webhook успешным по 200 OK. Если мы вернём 5xx —
  // TG будет ретраить, и у нас может получиться дублированная активация.
  // Поэтому ловим любую ошибку и всё равно возвращаем 200.
  try {
    if (update.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query);
    } else if (update.message?.successful_payment) {
      await handleSuccessfulPayment(update.message);
    } else if (update.message?.text) {
      await handleMessage(update.message);
    }
    // my_chat_member, channel_post, edited_message — игнорим (allowed_updates
    // в setWebhook уже отфильтровывает большинство).
  } catch (err) {
    console.error('[telegram/webhook] handler error:', err.message);
    // Не пробрасываем — иначе TG ретраит и можем продублировать платёж.
  }

  res.json({ ok: true });
});

// ── Handlers ─────────────────────────────────────────────────────────────────

// M5 — экранируем HTML в полях из user input (first_name) перед интерполяцией
// в sendMessage с parse_mode: 'HTML'. Если юзер ставит first_name = '<b>x</b>',
// без escape это пройдёт парсингом и может содержать phishing-ссылки.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  if (!chatId) return;
  const text = String(msg.text || '').trim();

  if (text.startsWith('/start')) {
    // start с параметром: "/start abc123" → start_param = 'abc123' (реф-код).
    // На фронте он придёт в initData.start_param, мы его уже храним в users.
    const greeting = `Привет, ${escapeHtml(msg.from?.first_name || 'друг')}!\n\n` +
      `Купидон — твой AI-коуч по знакомствам и переписке. ` +
      `Разбираем чаты, прогоняем диалоги в симуляторе, учим возвращать после слива.\n\n` +
      `Открой Mini App, чтобы начать.`;
    await sendMessage(chatId, greeting, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Открыть Купидон', web_app: { url: WEB_APP_URL } },
        ]],
      },
    });
    return;
  }

  if (text.startsWith('/paysupport')) {
    // Обязательная команда для платных ботов (Telegram Stars).
    // Без неё TG отклоняет добавление монетизации.
    const supportText = `Возврат за Telegram Stars автоматически невозможен — каждый случай рассматриваем индивидуально.\n\n` +
      `Если у тебя проблема с оплатой:\n` +
      `1. Опиши ситуацию в этот чат\n` +
      `2. Приложи время покупки и план (basic / premium / day_pass)\n\n` +
      `Свяжемся с тобой в течение 48 часов.`;
    await sendMessage(chatId, supportText);
    return;
  }

  if (text.startsWith('/help')) {
    await sendMessage(chatId,
      `Команды:\n/start — открыть Mini App\n/paysupport — поддержка по оплате\n\n` +
      `Всё остальное — в Mini App.`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Открыть Купидон', web_app: { url: WEB_APP_URL } },
          ]],
        },
      },
    );
    return;
  }

  // Любое другое сообщение — отвечаем тем же приветствием с кнопкой
  await sendMessage(chatId,
    `Я отвечаю только в Mini App. Открой его кнопкой ниже:`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Открыть Купидон', web_app: { url: WEB_APP_URL } },
        ]],
      },
    },
  );
}

/**
 * pre_checkout_query — Telegram спрашивает «можно ли провести оплату».
 * Мы валидируем payload и отвечаем ok=true. Если ответить с задержкой >10с —
 * TG отменит платёж. Поэтому минимум IO здесь.
 */
async function handlePreCheckout(query) {
  let payload;
  try { payload = JSON.parse(query.invoice_payload || '{}'); }
  catch (_) { payload = null; }

  // Валидация: plan известен, tg_user_id совпадает с from.id
  const validPlan  = payload && (payload.plan in PLAN_DURATION_DAYS);
  const validUser  = payload && payload.tg_user_id === query.from?.id;

  if (!validPlan || !validUser) {
    await answerPreCheckoutQuery(query.id, false, 'Платёж не может быть проведён. Попробуйте создать новый счёт.');
    return;
  }

  await answerPreCheckoutQuery(query.id, true);
}

/**
 * successful_payment — Telegram уже списал Stars у юзера. Наша задача —
 * атомарно создать payment + subscription. Идемпотентность по charge_id:
 * если уже processed_at IS NOT NULL — ничего не делаем (TG ретрайнул).
 */
async function handleSuccessfulPayment(msg) {
  const sp = msg.successful_payment;
  if (!sp) return;
  const chargeId = sp.telegram_payment_charge_id;
  const tgUserId = msg.from?.id;
  if (!chargeId || !tgUserId) {
    console.warn('[telegram] successful_payment missing charge_id or from.id', sp);
    return;
  }

  let payload;
  try { payload = JSON.parse(sp.invoice_payload || '{}'); }
  catch (_) { payload = null; }

  const plan = payload?.plan;
  if (!plan || !(plan in PLAN_DURATION_DAYS)) {
    console.error('[telegram] successful_payment with unknown plan in payload', { chargeId, payload });
    return;
  }

  // Все мутации — в одной транзакции для атомарности.
  // Защита от race: INSERT OR IGNORE на UNIQUE(charge_id) — повторный update
  // от TG не создаст вторую subscription.
  db.transaction(() => {
    // 1. Идемпотентное создание payment-строки
    const ins = db.run(
      `INSERT OR IGNORE INTO payments
         (telegram_user_id, charge_id, provider, plan, amount_minor, currency, status, raw)
       VALUES (?, ?, 'stars', ?, ?, ?, 'pending', ?)`,
      tgUserId, chargeId, plan, sp.total_amount, sp.currency, JSON.stringify(sp).slice(0, 8000)
    );

    if (ins.changes === 0) {
      // Этот charge уже был обработан — выходим без ошибки (TG доволен 200 OK).
      console.log(`[telegram] duplicate successful_payment for charge ${chargeId} — already processed`);
      return;
    }

    if (plan === 'day_pass') {
      // НОВАЯ концепция day_pass — +N запросов к bonus_quota, без subscription
      db.run(
        `UPDATE users
           SET tg_bonus_quota = COALESCE(tg_bonus_quota, 0) + ?
         WHERE telegram_user_id = ?`,
        DAY_PASS_BONUS_QUOTA, tgUserId
      );
      db.run(
        `UPDATE payments SET status = 'succeeded', processed_at = datetime('now') WHERE charge_id = ?`,
        chargeId
      );
      console.log(`[telegram] day_pass +${DAY_PASS_BONUS_QUOTA} quota: tg_user=${tgUserId} amount=${sp.total_amount} XTR charge=${chargeId}`);
      return;
    }

    // 2. Создать/продлить subscription (basic/premium)
    const days = PLAN_DURATION_DAYS[plan];
    const existing = db.get(
      `SELECT expires_at FROM subscriptions
       WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
       ORDER BY datetime(expires_at) DESC LIMIT 1`,
      tgUserId
    );
    const base = existing?.expires_at && new Date(existing.expires_at) > new Date()
      ? new Date(existing.expires_at)
      : new Date();
    const newExpires = new Date(base.getTime() + days * 86_400_000).toISOString();

    db.run(
      `INSERT INTO subscriptions (telegram_user_id, plan, source, started_at, expires_at, is_trial, auto_renew)
       VALUES (?, ?, 'stars', datetime('now'), ?, 0, 0)`,
      tgUserId, plan, newExpires
    );

    // 3. Пометить payment как succeeded
    db.run(
      `UPDATE payments SET status = 'succeeded', processed_at = datetime('now') WHERE charge_id = ?`,
      chargeId
    );

    // 4. Обновить кеш sub_tier на user-row (для быстрых проверок)
    db.run(
      `UPDATE users SET sub_tier = ?, sub_expires_at = ? WHERE telegram_user_id = ?`,
      plan === 'premium' ? 'premium' : 'basic',
      newExpires,
      tgUserId
    );

    console.log(`[telegram] payment OK: tg_user=${tgUserId} plan=${plan} amount=${sp.total_amount} XTR expires=${newExpires}`);
  })();

  // Best-effort thank-you message (failure не критична — подписка уже есть в БД)
  try {
    const successText = plan === 'day_pass'
      ? `Оплата прошла. Спасибо!\n\nНа баланс добавлено +${DAY_PASS_BONUS_QUOTA} запросов. Они не сгорают и тратятся по 1 за запрос.`
      : `Оплата прошла. Спасибо!\n\nТвой ${plan === 'premium' ? 'Premium' : 'Basic'} активирован. Возвращайся в Mini App.`;
    await sendMessage(tgUserId,
      successText,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Открыть Купидон', web_app: { url: WEB_APP_URL } },
          ]],
        },
      },
    );
  } catch (err) {
    console.warn('[telegram] failed to send thank-you message:', err.message);
  }
}

export default router;
