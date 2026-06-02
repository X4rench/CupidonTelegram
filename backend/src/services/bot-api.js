// ═══════════════════════════════════════════════════════════════
// Telegram Bot API клиент с опциональной проксификацией.
//
// Если бэкенд хостится в РФ (AEZA Moscow) — РКН периодически блокирует
// подсеть api.telegram.org для российских AS. В этом случае TG_API_PROXY
// должен указывать на Hetzner-прокси (см. DEPLOY-AEZA-RU.md §1).
// Если бэкенд за пределами РФ — TG_API_PROXY можно оставить пустым,
// fetch пойдёт напрямую.
//
// Все исходящие методы Bot API (sendMessage, setWebhook, refundStarPayment,
// answerPreCheckoutQuery и т.д.) ходят через эту функцию.
// ═══════════════════════════════════════════════════════════════
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const TG_API_PROXY = process.env.TG_API_PROXY?.trim();
const BOT_TOKEN    = process.env.BOT_TOKEN;
const BASE = () => `https://api.telegram.org/bot${BOT_TOKEN}`;

let dispatcher = null;
if (TG_API_PROXY) {
  dispatcher = new ProxyAgent({ uri: TG_API_PROXY, requestTls: { rejectUnauthorized: true } });
  console.log(`[bot-api] using proxy: ${maskProxyUri(TG_API_PROXY)}`);
}

function maskProxyUri(uri) {
  return uri.replace(/\/\/[^@]*@/, '//***@');
}

/**
 * Универсальный вызов метода Bot API. Возвращает result или бросает ошибку.
 *
 *   await callBotApi('sendMessage', { chat_id, text })
 *   await callBotApi('setWebhook', { url, secret_token })
 */
export async function callBotApi(method, payload = {}) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN не задан');
  const url = `${BASE()}/${method}`;

  const res = await undiciFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    dispatcher: dispatcher || undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(`Bot API ${method} failed: ${data.description || res.status}`);
    err.code = data.error_code;
    err.response = data;
    throw err;
  }
  return data.result;
}

export async function sendMessage(chatId, text, extra = {}) {
  return callBotApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

export async function setWebhook(url, secretToken, allowedUpdates) {
  return callBotApi('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: allowedUpdates ?? ['message', 'pre_checkout_query', 'successful_payment', 'my_chat_member'],
  });
}

export async function getWebhookInfo() {
  return callBotApi('getWebhookInfo');
}

export async function deleteWebhook() {
  return callBotApi('deleteWebhook', { drop_pending_updates: false });
}

export async function answerPreCheckoutQuery(queryId, ok, errorMessage) {
  return callBotApi('answerPreCheckoutQuery', {
    pre_checkout_query_id: queryId,
    ok,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
}

export async function refundStarPayment(userId, chargeId) {
  return callBotApi('refundStarPayment', {
    user_id: userId,
    telegram_payment_charge_id: chargeId,
  });
}

/** Создать invoice link для Stars (открывается openInvoice на клиенте). */
export async function createInvoiceLink({ title, description, payload, currency = 'XTR', prices }) {
  return callBotApi('createInvoiceLink', {
    title, description, payload, currency, prices,
    provider_token: '', // для Stars — пустой
  });
}
