// ═══════════════════════════════════════════════════════════════
// CloudStorage sync — обёртка над window.Telegram.WebApp.CloudStorage.
//
// CloudStorage — единственный способ синкать данные между устройствами
// одного TG-аккаунта без своего бэкенда (тарифы хранятся в БД на сервере,
// но user_profile, кастомные контакты, избранное — мелкие данные, удобно
// синкать через CloudStorage без нагрузки на бэк).
//
// Лимиты Telegram CloudStorage:
//   - Ключ: [A-Za-z0-9_-]{1,128}
//   - Значение: до 4096 байт
//   - Не более 1024 ключей на пользователя
//
// Вне TG (обычный браузер, локальная разработка) — все методы no-op.
// Это позволяет коду работать одинаково в TMA и в браузере без проверок.
//
// Подход к синку (из TMA_PORTING_PLAYBOOK §6.3):
//   - Mutating-setter → пишет в localStorage + fire-and-forget в cloud.
//   - Mount-эффект → один раз тянет из cloud и мерджит. Облачное значение
//     "побеждает" локальное (cross-device дороже чем local-edit).
//   - Удаление → сразу удаляет из ОБОИХ слоёв (грабли §5.42).
//
// ВАЖНО (security audit M9): данные в CloudStorage хранятся PLAIN TEXT.
// TG enforces namespace per-TG-account на своих серверах — cross-user leak
// технически невозможен. Шифровать тут смысла нет:
//   - ключ для шифрования всё равно пришлось бы хранить рядом (на устройстве)
//   - угроза = компрометация TG-аккаунта; в этом случае атакующий и так
//     получает initData и доступ ко всему.
// Если в будущем понадобится зашифровать (например, медицинские данные),
// делать AES-256-GCM с ключом, выводимым из bot-secret через server-side
// endpoint, а не хранить ключ на клиенте.
// ═══════════════════════════════════════════════════════════════

const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_VALUE_BYTES = 4096;

type CloudStorage = {
  getItem(key: string, cb: (err: string | null, value: string) => void): void;
  setItem(key: string, value: string, cb?: (err: string | null, ok: boolean) => void): void;
  removeItem(key: string, cb?: (err: string | null, ok: boolean) => void): void;
  removeItems(keys: string[], cb?: (err: string | null, ok: boolean) => void): void;
  getItems(keys: string[], cb: (err: string | null, values: Record<string, string>) => void): void;
  getKeys(cb: (err: string | null, keys: string[]) => void): void;
};

function getCS(): CloudStorage | null {
  try {
    const cs = (window as any)?.Telegram?.WebApp?.CloudStorage;
    if (!cs || typeof cs.getItem !== 'function') return null;
    return cs as CloudStorage;
  } catch (_) {
    return null;
  }
}

/** true если код выполняется в TG WebView с доступом к CloudStorage. */
export function isCloudAvailable(): boolean {
  return getCS() !== null;
}

/** Получить значение по ключу. Возвращает null если ключа нет или вне TG. */
export function cloudGet(key: string): Promise<string | null> {
  if (!KEY_RE.test(key)) return Promise.resolve(null);
  const cs = getCS();
  if (!cs) return Promise.resolve(null);
  return new Promise(resolve => {
    cs.getItem(key, (err, value) => {
      if (err) return resolve(null);
      resolve(value || null);
    });
  });
}

/** Записать строку (не более 4096 байт). Fire-and-forget безопасен. */
export function cloudSet(key: string, value: string): Promise<boolean> {
  if (!KEY_RE.test(key)) return Promise.resolve(false);
  const byteLen = new Blob([value]).size;
  if (byteLen > MAX_VALUE_BYTES) {
    console.warn(`[cloudSync] value too long for "${key}": ${byteLen} > ${MAX_VALUE_BYTES} bytes`);
    return Promise.resolve(false);
  }
  const cs = getCS();
  if (!cs) return Promise.resolve(false);
  return new Promise(resolve => {
    cs.setItem(key, value, (err, ok) => {
      if (err) {
        console.warn(`[cloudSync] setItem("${key}") failed:`, err);
        return resolve(false);
      }
      resolve(!!ok);
    });
  });
}

/** Удалить ключ. Используй СРАЗУ после удаления локально (грабли §5.42). */
export function cloudRemove(key: string): Promise<boolean> {
  if (!KEY_RE.test(key)) return Promise.resolve(false);
  const cs = getCS();
  if (!cs) return Promise.resolve(false);
  return new Promise(resolve => {
    cs.removeItem(key, (err, ok) => resolve(!err && !!ok));
  });
}

export function cloudRemoveMany(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return Promise.resolve(true);
  const cs = getCS();
  if (!cs) return Promise.resolve(false);
  return new Promise(resolve => {
    cs.removeItems(keys, (err, ok) => resolve(!err && !!ok));
  });
}

/** Получить все ключи юзера в CloudStorage (для перечисления коллекций). */
export function cloudKeys(): Promise<string[]> {
  const cs = getCS();
  if (!cs) return Promise.resolve([]);
  return new Promise(resolve => {
    cs.getKeys((err, keys) => resolve(err ? [] : (keys || [])));
  });
}

/** Получить набор значений батчем (эффективнее чем N раз getItem). */
export function cloudGetMany(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return Promise.resolve({});
  const cs = getCS();
  if (!cs) return Promise.resolve({});
  return new Promise(resolve => {
    cs.getItems(keys, (err, values) => resolve(err ? {} : (values || {})));
  });
}

// ── Высокоуровневые ключи для предметной области ─────────────────────────────

// Префиксы (короткие, чтобы влезть в 128 символов ключа):
// - cup_profile          — user_profile (пол, возраст, опыт, цели)
// - cup_favs             — массив избранных типажей
// - cc_<contact_id>      — каждая карточка кастомного контакта (metadata; фото остаётся в IndexedDB локально, грабли §5.1)
// - cup_settings         — настройки темы/нотифов/etc

export const CLOUD_KEYS = {
  PROFILE: 'cup_profile',
  FAVS: 'cup_favs',
  SETTINGS: 'cup_settings',
  CONTACT_PREFIX: 'cc_',
} as const;

/** Получить user_profile из CloudStorage. Используй на старте чтобы подтянуть с другого устройства. */
export async function cloudGetProfile<T = unknown>(): Promise<T | null> {
  const raw = await cloudGet(CLOUD_KEYS.PROFILE);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch (_) { return null; }
}

export async function cloudSetProfile(profile: unknown): Promise<boolean> {
  try {
    const raw = JSON.stringify(profile);
    return await cloudSet(CLOUD_KEYS.PROFILE, raw);
  } catch (_) {
    return false;
  }
}

export interface CloudContactMeta {
  id: string;
  name: string;
  typazh?: string;
  notes?: string;
  is_pinned?: boolean;
  // НЕ храним фото-base64 в CloudStorage — 4 KB маловато. Photo живёт в IndexedDB
  // локально на каждом устройстве. avatarUri — это id для IndexedDB lookup,
  // или null если фото не загружено.
  avatar_ref?: string | null;
  created_at?: string;
}

/** Все кастомные контакты из CloudStorage. */
export async function cloudGetAllContacts(): Promise<CloudContactMeta[]> {
  const keys = await cloudKeys();
  const contactKeys = keys.filter(k => k.startsWith(CLOUD_KEYS.CONTACT_PREFIX));
  if (contactKeys.length === 0) return [];
  const values = await cloudGetMany(contactKeys);
  const out: CloudContactMeta[] = [];
  for (const raw of Object.values(values)) {
    if (!raw) continue;
    try { out.push(JSON.parse(raw) as CloudContactMeta); } catch (_) {}
  }
  return out;
}

export async function cloudSetContact(c: CloudContactMeta): Promise<boolean> {
  if (!c.id) return false;
  try {
    return await cloudSet(`${CLOUD_KEYS.CONTACT_PREFIX}${c.id}`, JSON.stringify(c));
  } catch (_) {
    return false;
  }
}

export async function cloudRemoveContact(id: string): Promise<boolean> {
  return cloudRemove(`${CLOUD_KEYS.CONTACT_PREFIX}${id}`);
}
