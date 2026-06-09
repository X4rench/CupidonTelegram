// ═══════════════════════════════════════════════════════════════
// Кастомные AI-девушки — созданные пользователем в CreateGirl.
// Хранятся в localStorage по ключу `custom_girls` (per-tg-user, через
// utils/storage.ts). НЕ контакты — это AI-симуляции.
// Фото хранится в IndexedDB по photoBlobId; blob:URL re-resolve на mount
// (грабли §5.1).
// ═══════════════════════════════════════════════════════════════
import { storage } from './storage';

export interface CustomGirl {
  id: string;
  name: string;
  typazh?: string | null;          // CSV ru-имён (для AI prompt)
  typazhes?: string[];
  hobbies?: string[];
  character?: string | null;
  commStyle?: string | null;
  description?: string;
  color?: string;
  photoBlobId?: string | null;     // ключ в IndexedDB (re-resolve в URL.createObjectURL на mount)
  /** Сложность 1..10 — передаётся в startSimulator при старте чата.
      Default 5 если не задано (legacy девушки без поля). */
  difficulty?: number;
}

const KEY = 'custom_girls';

export function loadCustomGirls(): CustomGirl[] {
  const list = storage.get<CustomGirl[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveCustomGirls(list: CustomGirl[]): void {
  storage.set(KEY, list);
}

/**
 * Добавляет девушку в storage. Возвращает обновлённый список.
 * Если запись не прошла верификацию (storage переполнен и т.п.) — бросает
 * Error с понятным сообщением, чтобы UI мог показать его юзеру.
 */
export function addCustomGirl(g: CustomGirl): CustomGirl[] {
  const list = loadCustomGirls();
  const next = [...list, g];
  saveCustomGirls(next);
  // Верификация: storage.set может молча упасть (QuotaExceeded и т.п.).
  // Перечитываем — если новая девушка не нашлась, говорим юзеру.
  const verify = loadCustomGirls();
  if (!verify.some(x => x.id === g.id)) {
    throw new Error(
      'Не удалось сохранить девушку — память Mini App переполнена. ' +
      'Очисти кэш Telegram (Settings → Storage → Clear Cache) и попробуй снова.'
    );
  }
  return next;
}

export function removeCustomGirl(id: string): CustomGirl[] {
  const list = loadCustomGirls().filter(g => g.id !== id);
  saveCustomGirls(list);
  return list;
}

export function findCustomGirl(id: string): CustomGirl | undefined {
  return loadCustomGirls().find(g => g.id === id);
}
