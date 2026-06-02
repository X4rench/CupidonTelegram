// ═══════════════════════════════════════════════════════════════
// Telegram auth layer (frontend).
//
// initData — подписанный HMAC-блок от TG-клиента. Шлётся в каждом
// запросе в header `Authorization: tma <initDataRaw>`. На сервере
// проверяется через crypto.timingSafeEqual.
//
// Стратегия получения initData (порядок надёжности):
//   1. window.Telegram.WebApp.initData — стандартное API TG WebApp,
//      работает во всех TG-клиентах (Desktop, Mobile, Web).
//      Это РАБОЧИЙ путь — раньше пытались через retrieveLaunchParams()
//      из @telegram-apps/sdk-react 3.x, но там API в новой версии
//      возвращает не то что было в 2.x (нет initDataRaw поля).
//   2. URL hash (`#tgWebAppData=...`) — fallback на случай если
//      telegram-web-app.js не подгрузился.
// ═══════════════════════════════════════════════════════════════
import { init as sdkInit, expandViewport, postEvent } from '@telegram-apps/sdk-react';

let _initDataRaw: string | null = null;
let _tgUser: any = null;
let _debugInfo: Record<string, any> = {};

export async function initTelegram() {
  // 1. Прямой путь — window.Telegram.WebApp
  try {
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg?.initData) {
      _initDataRaw = String(tg.initData);
      _tgUser = tg.initDataUnsafe?.user || null;
      _debugInfo.source = 'window.Telegram.WebApp';
      _debugInfo.has_tg = true;
      _debugInfo.initData_len = _initDataRaw.length;
      _debugInfo.user_id = _tgUser?.id;
    } else {
      _debugInfo.source = 'none';
      _debugInfo.has_tg = !!tg;
      _debugInfo.has_initData = !!tg?.initData;
    }
  } catch (e: any) {
    _debugInfo.tg_err = e?.message || String(e);
  }

  // 2. Fallback — URL hash (на случай если telegram-web-app.js не загрузился)
  if (!_initDataRaw) {
    try {
      const hash = window.location.hash || '';
      // hash формата #tgWebAppData=...&tgWebAppPlatform=...&...
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const fromHash = params.get('tgWebAppData');
      if (fromHash) {
        _initDataRaw = decodeURIComponent(fromHash);
        // Парсим user из initData
        try {
          const idp = new URLSearchParams(_initDataRaw);
          const userJson = idp.get('user');
          if (userJson) {
            _tgUser = JSON.parse(userJson);
          }
        } catch (_) {}
        _debugInfo.source = 'url-hash';
        _debugInfo.initData_len = _initDataRaw.length;
        _debugInfo.user_id = _tgUser?.id;
      }
    } catch (e: any) {
      _debugInfo.hash_err = e?.message || String(e);
    }
  }

  // 3. SDK init (для viewport/theme — не критично)
  try {
    sdkInit();
  } catch (_) {}

  // UI-tweaks для нативного ощущения
  try { expandViewport(); } catch (_) {}
  try { postEvent('web_app_setup_swipe_behavior', { allow_vertical_swipe: false }); } catch (_) {}

  // Лог в консоль (видно в TG WebView DevTools если открыть)
  try {
    // eslint-disable-next-line no-console
    console.log('[auth] init result:', _debugInfo);
  } catch (_) {}

  return { initDataRaw: _initDataRaw, tgUser: _tgUser };
}

export function getInitDataRaw(): string | null {
  return _initDataRaw;
}

export function getTgUser(): any {
  return _tgUser;
}

export function hasInitData(): boolean {
  return !!_initDataRaw && !!_tgUser?.id;
}

/** Debug-инфо для Landing — показать на экране что не сработало. */
export function getAuthDebugInfo(): Record<string, any> {
  return { ..._debugInfo };
}
