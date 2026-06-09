// ═══════════════════════════════════════════════════════════════
// Локальный storage wrapper.
// Хранит данные в localStorage (per-устройство, не синкается между TG-клиентами).
// Для cross-device sync — см. cloudSync.ts (CloudStorage API, Phase K).
//
// Ключи префиксуются tg_user_id чтобы переключение TG-аккаунтов на одном
// устройстве не пересекало данные (грабли §5.43 в TMA_PORTING_PLAYBOOK).
// ═══════════════════════════════════════════════════════════════

import { getTgUser } from '../auth';

function key(name: string): string {
  const tgId = getTgUser()?.id ?? 'anon';
  return `cupidon:${tgId}:${name}`;
}

export const storage = {
  get<T>(name: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key(name));
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch (_) {
      return fallback;
    }
  },

  set(name: string, value: unknown): void {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
    } catch (e: any) {
      // QuotaExceeded или приватный режим — раньше игнорировали молча,
      // что приводило к багам типа «создал девушку → её нет». Теперь
      // логируем, чтобы потом в console можно было увидеть причину.
      // Caller (например addCustomGirl) сам делает verify и бросает Error.
      try {
        console.error('[storage] setItem failed:', name, e?.name || '', e?.message || '');
      } catch (_) {}
    }
  },

  remove(name: string): void {
    try {
      localStorage.removeItem(key(name));
    } catch (_) {}
  },

  // Для случаев когда ключ должен быть глобальным (без tg_user_id префикса)
  getGlobal<T>(name: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`cupidon:global:${name}`);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch (_) {
      return fallback;
    }
  },

  setGlobal(name: string, value: unknown): void {
    try {
      localStorage.setItem(`cupidon:global:${name}`, JSON.stringify(value));
    } catch (_) {}
  },
};
