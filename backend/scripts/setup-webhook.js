// ═══════════════════════════════════════════════════════════════
// Регистрация Telegram-webhook на бэкенде.
// Запуск: PUBLIC_BASE_URL=https://api.cupidon.ru node scripts/setup-webhook.js
//
// Использует TG_API_PROXY из .env (если задан) — критично для РФ-хоста.
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import { setWebhook, getWebhookInfo } from '../src/services/bot-api.js';

const BASE = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!BASE) {
  console.error('PUBLIC_BASE_URL не задан. Пример: PUBLIC_BASE_URL=https://api.cupidon.ru node scripts/setup-webhook.js');
  process.exit(1);
}
if (!SECRET) {
  console.error('TELEGRAM_WEBHOOK_SECRET не задан. Сгенерируй: openssl rand -hex 32');
  process.exit(1);
}

const url = `${BASE}/api/v1/telegram/webhook`;

console.log(`Setting webhook → ${url}`);

try {
  await setWebhook(url, SECRET);
  const info = await getWebhookInfo();
  if (info.url === url && info.has_custom_certificate === false) {
    console.log('✅ Webhook is configured correctly');
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.error('⚠ Webhook info mismatch:', info);
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Failed:', err.message, err.response || '');
  process.exit(1);
}
