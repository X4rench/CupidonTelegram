// ═══════════════════════════════════════════════════════════════
// Telegram auth layer (frontend).
//
// initData — подписанный HMAC-блок от TG-клиента. Шлётся в каждом
// запросе в header `Authorization: tma <initDataRaw>`. На сервере
// проверяется через crypto.timingSafeEqual.
//
// SDK инициализируется один раз при загрузке. retrieveLaunchParams()
// сам берёт initData из URL hash или из window.Telegram.WebApp.initData.
// ═══════════════════════════════════════════════════════════════
import {
  retrieveLaunchParams,
  init as sdkInit,
  expandViewport,
  setMiniAppHeaderColor,
  setMiniAppBackgroundColor,
  postEvent,
} from '@telegram-apps/sdk-react';

let _initDataRaw: string | null = null;
let _tgUser: any = null;

export async function initTelegram() {
  // SDK init — безопасно вызывать вне TG (молча no-op для большинства методов).
  try {
    sdkInit();
  } catch (_) {
    // вне TG — ок
  }

  try {
    const lp = retrieveLaunchParams();
    // lp.tgWebAppData в новой версии SDK; raw — original строка для Authorization header.
    _initDataRaw = (lp as any).initDataRaw ?? (lp as any).tgWebAppData ?? null;
    _tgUser = (lp as any).initData?.user ?? null;
  } catch (_) {
    _initDataRaw = null;
    _tgUser = null;
  }

  // UI-tweaks для нативного ощущения
  try { expandViewport(); } catch (_) {}
  try { setMiniAppHeaderColor('bg_color'); } catch (_) {}
  try { setMiniAppBackgroundColor('#0f0f12'); } catch (_) {}

  // Дополнительно — отключаем вертикальные свайпы (мешают листать чат)
  try { postEvent('web_app_setup_swipe_behavior', { allow_vertical_swipe: false }); } catch (_) {}

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
