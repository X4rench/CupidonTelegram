// ═══════════════════════════════════════════════════════════════
// Telegram Stars payments helper.
//
// 1. Просим бэкенд создать invoice link (POST /payments/invoice).
// 2. Открываем его через WebApp.openInvoice(url, callback).
// 3. Telegram сам показывает нативный экран оплаты.
// 4. После закрытия экрана callback получает status:
//      'paid'      — успешная оплата, бэкенд получит webhook
//                    `successful_payment` и проставит подписку
//      'cancelled' — пользователь закрыл окно оплаты
//      'failed'    — TG отверг платёж (не хватило Stars, и т.п.)
//      'pending'   — ожидание подтверждения (редко)
//
// Реальная оплата работает только в реальном Telegram-клиенте.
// Вне TG (обычный браузер) openInvoice недоступен → возвращаем 'failed'
// и оставляем PaywallScreen открытым, чтобы пользователь видел
// объяснение «Оплата работает только в реальном Telegram».
// ═══════════════════════════════════════════════════════════════
import { createStarsInvoice, type StarsPlan } from '../api';

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

/**
 * Запустить оплату подписки за Telegram Stars.
 *
 * @param plan — 'basic' | 'premium' | 'day_pass'
 * @returns статус закрытия экрана оплаты Telegram
 */
export async function startStarsPayment(plan: StarsPlan): Promise<InvoiceStatus> {
  const tg = (window as any)?.Telegram?.WebApp;

  // Сначала проверяем что openInvoice вообще доступен — иначе можно
  // сэкономить запрос к бэкенду.
  if (!tg?.openInvoice) {
    console.warn('[payments] WebApp.openInvoice недоступен (запущено вне Telegram)');
    return 'failed';
  }

  let invoiceUrl: string;
  try {
    const res = await createStarsInvoice(plan);
    if (!res.ok || !res.invoice_url) {
      console.error('[payments] backend не вернул invoice_url:', res);
      return 'failed';
    }
    invoiceUrl = res.invoice_url;
  } catch (err) {
    console.error('[payments] createStarsInvoice failed:', err);
    return 'failed';
  }

  return new Promise<InvoiceStatus>((resolve) => {
    try {
      tg.openInvoice(invoiceUrl, (status: string) => {
        const normalized: InvoiceStatus =
          status === 'paid' || status === 'cancelled' || status === 'failed' || status === 'pending'
            ? (status as InvoiceStatus)
            : 'failed';
        resolve(normalized);
      });
    } catch (err) {
      console.error('[payments] openInvoice throw:', err);
      resolve('failed');
    }
  });
}

/** Проверка что Stars-оплата реально доступна (для DEV-баннера в Paywall). */
export function isStarsPaymentAvailable(): boolean {
  return !!(window as any)?.Telegram?.WebApp?.openInvoice;
}
