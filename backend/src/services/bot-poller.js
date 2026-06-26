// ═══════════════════════════════════════════════════════════════
// Long-polling поллер Telegram (альтернатива webhook).
//
// Зачем: webhook принимается через ВНЕШНИЙ релей (TG не достукивается до
// Moscow-IP напрямую). Если релей лёг — апдейты не доходят, /start молчит.
// Поллинг работает в ОБРАТНУЮ сторону: бэкенд сам тянет апдейты у Telegram
// (исходящие соединения из Москвы работают), внешний релей не нужен.
//
// Включается флагом TG_POLLING=1. Использует тот же processUpdate, что и
// webhook, и тот же исходящий путь (bot-api.js → TG_API_PROXY, если задан;
// если пуст — напрямую).
// ═══════════════════════════════════════════════════════════════
import { callBotApi, deleteWebhook } from './bot-api.js';
import { processUpdate } from '../routes/telegram.js';

const ALLOWED_UPDATES = ['message', 'pre_checkout_query', 'successful_payment', 'my_chat_member'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let started = false;

export async function startPolling() {
  if (started) return; // защита от двойного запуска
  started = true;

  // Снимаем webhook — иначе getUpdates запрещён (TG не отдаёт апдейты, пока
  // активен webhook). Pending НЕ дропаем: среди зависших апдейтов может быть
  // successful_payment — его надо до-обработать (хендлер идемпотентен по
  // charge_id, так что повтор безопасен).
  try {
    await deleteWebhook();
    console.log('[poll] webhook снят, переходим на long polling');
  } catch (e) {
    console.error('[poll] deleteWebhook error:', e.message);
  }

  let offset = 0;
  // Бесконечный цикл long-poll. getUpdates с timeout=30 висит до 30с в ожидании
  // апдейтов — это эффективно (не дёргаем API в пустую).
  for (;;) {
    try {
      const updates = await callBotApi('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ALLOWED_UPDATES,
      });
      for (const u of updates) {
        offset = u.update_id + 1; // подтверждаем (ack) даже если обработка упадёт
        try {
          await processUpdate(u);
        } catch (e) {
          console.error('[poll] processUpdate error:', e.message);
        }
      }
    } catch (e) {
      // Сетевая ошибка / TG недоступен — ждём и пробуем снова, не валим процесс.
      console.error('[poll] getUpdates error:', e.message);
      await sleep(3000);
    }
  }
}
