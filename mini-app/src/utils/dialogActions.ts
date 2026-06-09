// ═══════════════════════════════════════════════════════════════
// Универсальное удаление диалогов из всех мест где они появляются:
//   - AllDialogsScreen (список)
//   - SimulatorScreen «Незавершённые»
//   - HomeScreen «Активные диалоги»
//
// Wing-контакты живут на backend (contacts table) → DELETE /contacts/:id.
// Sim-сессии живут в localStorage → удаление по storage-key.
// При удалении Wing-контакта также чистим связанный анализ из
// wing_per_girl_state (localStorage), чтобы юзер потом не увидел старый
// результат «после возврата на экран».
// ═══════════════════════════════════════════════════════════════
import { contactsApi } from '../api';
import { storage } from './storage';

const WING_STORAGE_KEY = 'wing_per_girl_state';

/**
 * Удалить Wing-контакт целиком: с бэка + почистить локальный perGirl-state.
 * @returns true если успешно, false если backend упал
 */
export async function deleteWingContact(contactId: string | number): Promise<boolean> {
  const numId = typeof contactId === 'string' ? parseInt(contactId, 10) : contactId;
  if (!Number.isFinite(numId)) return false;
  try {
    const res = await contactsApi.delete(numId);
    if (!res?.ok) return false;
  } catch (_) {
    return false;
  }
  // Cleanup: удалить анализ из wing_per_girl_state
  try {
    const state = storage.get<Record<string, any> | null>(WING_STORAGE_KEY, null);
    if (state && typeof state === 'object') {
      const key = String(contactId);
      if (key in state) {
        const next = { ...state };
        delete next[key];
        storage.set(WING_STORAGE_KEY, next);
      }
    }
  } catch (_) {}
  return true;
}

/**
 * Удалить симуляторную сессию из localStorage.
 * @param storageKey — `sim_session_<typazh>_<place>` или с _sessionId-суффиксом
 * @returns true если key реально удалён
 */
export function deleteSimSession(storageKey: string): boolean {
  if (!storageKey) return false;
  // storage.remove использует префикс tgId, но мы пробежимся по всем localStorage
  // ключам с этим суффиксом — на случай legacy записей под `anon` или под другим tgId.
  let removed = false;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.endsWith(':' + storageKey) || k === storageKey) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    try { localStorage.removeItem(k); removed = true; } catch (_) {}
  }
  return removed;
}
