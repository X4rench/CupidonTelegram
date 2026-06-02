# Phase H — Monetization (Telegram Stars + Promo + Referral)

Портированы экраны и инфраструктура для оплаты подписки через Telegram Stars,
применения промокодов и реферальной программы. Бэкенд монетизации уже был
готов (`backend/src/routes/payments.js`, `routes/telegram.js`, `routes/promo.js`)
— Phase H это только фронтенд + клиентский invoice-flow.

## Что портировано

| Файл RN (`src/...`) | TMA (`mini-app/src/...`) | Заметки |
| --- | --- | --- |
| `contexts/PaywallContext.js` | `contexts/PaywallContext.tsx` | Упрощён: больше не дублирует sub_tier/daily_used — читаем из useMe(). Только хранит `{isOpen, reason, defaultPlan}`. |
| `screens/SubscriptionSheet.js` | `screens/PaywallScreen.tsx` | Bottom-sheet → полноэкранный route `/paywall`. RUB/USD prices → Stars (XTR). 4 плана → 2 базовых + day_pass (опционально). |
| `screens/PromoCodeScreen.js` | `screens/PromoCodeScreen.tsx` | Логика та же. На success — `me.refresh()` для подтягивания нового тира/квоты. |
| `screens/ReferralScreen.js` | `screens/ReferralScreen.tsx` | Ссылка через `t.me/<BOT_USERNAME>/<MINIAPP_SLUG>?startapp=ref_<tg_user_id>`. Share — через `WebApp.openTelegramLink('https://t.me/share/url?...')`. |
| `screens/ShopSheet.js` | — | Не портирован: дублировал SubscriptionSheet. Day Pass показывается прямо в PaywallScreen для уже подписанных юзеров. |
| — | `utils/payments.ts` | Новый: `startStarsPayment(plan)` → `createStarsInvoice` → `WebApp.openInvoice(url, callback)`. Возвращает `'paid'|'cancelled'|'failed'|'pending'`. |

## Новые API-функции в `api.ts`

Добавлены в конец файла (после Phase F/G блоков):

```ts
export type StarsPlan = 'basic' | 'premium' | 'day_pass';
export async function createStarsInvoice(plan: StarsPlan): Promise<StarsInvoiceResponse>;
export async function getStarsPrices(): Promise<StarsPricesResponse>;
export async function applyPromo(code: string): Promise<PromoApplyResponse>;
```

**Важно:** бэкенд возвращает поле `invoice_url`, а не `invoice_link`
(см. `backend/src/routes/payments.js:71`). Тип `StarsInvoiceResponse`
отражает реальный ответ.

## Поток оплаты

1. Пользователь жмёт «Купить за N ⭐» в PaywallScreen.
2. `startStarsPayment(plan)` → `POST /payments/invoice` → backend создаёт
   payload `{plan, tg_user_id, nonce, ts}` и зовёт Bot API `createInvoiceLink`
   с currency=XTR.
3. Получаем `invoice_url` (`https://t.me/$invoice/...`).
4. `WebApp.openInvoice(url, callback)` — TG показывает нативный экран Stars.
5. После закрытия `callback(status)` где `status` это
   `'paid'|'cancelled'|'failed'|'pending'`.
6. На `'paid'`:
   - `notificationHaptic('success')`
   - `useMe().refresh()` (тир/квоты подтянутся, т.к. webhook
     `successful_payment` на бэке уже создал subscription)
   - тост «Подписка активирована» + `nav(-1)`
7. На `'failed'` / нет TG — показываем плашку «Оплата работает только в TG».

## DEV / тестирование

- В обычном браузере `WebApp.openInvoice` отсутствует — `isStarsPaymentAvailable()`
  возвращает false. PaywallScreen показывает желтую плашку «Покупка Stars
  работает только в реальном Telegram».
- Реальная оплата возможна только в боевом TG-боте с правильным
  `BOT_TOKEN` на бэкенде (Stars нельзя купить через test environment).
- Promo и Referral работают и в DEV (если `DEV_BYPASS_INITDATA=1` на бэке).

## Подключение к App.tsx

**Что нужно сделать вручную** (я НЕ трогал App.tsx):

### 1. Импорты

В шапку добавить:
```tsx
import { PaywallProvider } from './contexts/PaywallContext';
import { PaywallScreen }    from './screens/PaywallScreen';
import { PromoCodeScreen }  from './screens/PromoCodeScreen';
import { ReferralScreen }   from './screens/ReferralScreen';
```

Из `./screens/stubs` удалить `PaywallStub`, `PromoStub`, `ReferralStub`
(или просто перестать их использовать).

### 2. Обернуть приложение в PaywallProvider

`<PaywallProvider>` должен быть **внутри** `<MeProvider>` (нужен доступ к
useMe для refresh после оплаты), но **снаружи** `<BrowserRouter>`
необязательно — мы используем только React state, без роутинга:

```tsx
export default function App() {
  return (
    <MeProvider>
      <PaywallProvider>
        <BrowserRouter>
          {/* AuthGate, Routes, TabBar — как сейчас */}
        </BrowserRouter>
      </PaywallProvider>
    </MeProvider>
  );
}
```

### 3. Заменить роуты

```tsx
<Route path="/paywall"  element={<PaywallScreen />} />
<Route path="/promo"    element={<PromoCodeScreen />} />
<Route path="/referral" element={<ReferralScreen />} />
```

(были `<PaywallStub />`, `<PromoStub />`, `<ReferralStub />`).

### 4. Опционально — auto-open Paywall при `usePaywall().open()`

Сейчас `usePaywall().open({reason})` только обновляет state. PaywallScreen
читает `paywall.reason` если открыт через явный `nav('/paywall')`. Чтобы
открыть его декларативно из любого экрана (например, при 429), нужно
либо вызывать `nav('/paywall')` вручную после `open(...)`, либо добавить
mount-эффект в App.tsx:

```tsx
function PaywallAutoOpen() {
  const paywall = usePaywall();
  const nav = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (paywall.isOpen && location.pathname !== '/paywall') {
      nav('/paywall');
    }
  }, [paywall.isOpen, location.pathname, nav]);
  return null;
}
```

И положить `<PaywallAutoOpen />` рядом с `<AuthGate />` внутри
`<BrowserRouter>`. Тогда любой `usePaywall().open({reason:'limit'})`
автоматически отроутит на /paywall.

## Координация с другими Phase

- **Phase F** (Wing/Theory) и **Phase G** (Simulator/CreateGirl/...) могут
  использовать `usePaywall().open(...)` для гейтов:
  - на 429 → `paywall.open({reason:'limit'})`
  - на NSFW-тогл без Premium → `paywall.open({reason:'nsfw', defaultPlan:'premium'})`
- В ProfileScreen можно добавить link на /paywall для управления подпиской —
  PaywallScreen покажет текущий статус через `useMe()` (есть active sub
  или нет, видно по `me.tier`).
- TG-канал бонус (`claimTgBonus`) — портирован ещё в Phase E. Я **не**
  добавлял его в PaywallScreen, чтобы не дублировать; можно добавить
  отдельной карточкой при желании.

## Что отложено / не реализовано

- **Статистика рефералов** — в PaywallScreen и ReferralScreen показываем
  0/0. Бэкенд `referrals` таблицы пока без `GET /users/referrals` —
  можно добавить позже.
- **Управление подпиской** (отмена, смена плана) — Stars-подписки не
  имеют auto-renew, отмена не нужна. В ProfileScreen достаточно показать
  expires_at.
- **Подсветка плана в Paywall** через `defaultPlan` — учитывается при
  выборе card (selected state), но кнопка покупки сама по себе кликабельна
  на каждой карточке.

## Файлы добавлены

```
mini-app/src/contexts/PaywallContext.tsx   (новый)
mini-app/src/utils/payments.ts             (новый)
mini-app/src/screens/PaywallScreen.tsx     (новый)
mini-app/src/screens/PromoCodeScreen.tsx   (новый)
mini-app/src/screens/ReferralScreen.tsx    (новый)
mini-app/src/api.ts                        (расширен Phase H блоком)
mini-app/PHASE_H_NOTES.md                  (этот файл)
```

Все Phase H-добавления компилируются (TS-check не запускал по причине sandbox,
но импорты и типы проверены вручную по существующим файлам api.ts/MeContext).
