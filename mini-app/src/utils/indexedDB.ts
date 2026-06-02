// ═══════════════════════════════════════════════════════════════
// IndexedDB обёртка для хранения бинарных blob'ов (фото кастомных
// контактов). НЕ синкается между устройствами (специально — фото
// тяжёлые, в CloudStorage не лезут).
//
// Используется так:
//   const id = await idbPutPhoto(blob);  // вернёт уникальный id
//   // Сохрани id в metadata (cc_<contact_id> в CloudStorage)
//
//   const url = await idbGetPhotoUrl(id);  // вернёт blob:URL для <img src>
//   // ВАЖНО (грабли §5.1): blob:URL живёт только в текущей сессии страницы.
//   // После reload — re-resolve через idbGetPhotoUrl(id), не сериализуй URL!
//
//   await idbDeletePhoto(id);
// ═══════════════════════════════════════════════════════════════

const DB_VERSION = 1;
const STORE = 'photos';

// L7 — DB_NAME префиксуется telegram_user_id, чтобы при смене TG-аккаунта
// на одном устройстве фото юзера A не оставались в IndexedDB и не подтягивались
// в профиль юзера B через avatar_ref в CloudStorage.
function getDbName(): string {
  try {
    const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tg) return `cupidon-photos-${tg}`;
  } catch (_) { /* fall through */ }
  return 'cupidon-photos-anon';
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(getDbName(), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function makeId(): string {
  // Простой случайный идентификатор. UUID не критичен — главное уникальность
  // в рамках одного устройства одного пользователя.
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Сохранить blob → вернуть id. */
export async function idbPutPhoto(blob: Blob): Promise<string> {
  const db = await openDb();
  const id = makeId();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, blob, created_at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

/** Получить blob по id (null если не найден). */
export async function idbGetPhotoBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => resolve(null);
  });
}

/** Получить blob:URL для <img src>. Re-resolve на mount каждого компонента! */
export async function idbGetPhotoUrl(id: string): Promise<string | null> {
  const blob = await idbGetPhotoBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** Удалить фото из IndexedDB. */
export async function idbDeletePhoto(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Полный список id для очистки orphans. */
export async function idbListPhotoIds(): Promise<string[]> {
  const db = await openDb();
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => resolve([]);
  });
}

/** Удалить orphans — фото которые не привязаны ни к какому контакту. */
export async function idbCleanupOrphans(activeIds: Set<string>): Promise<number> {
  const all = await idbListPhotoIds();
  let removed = 0;
  for (const id of all) {
    if (!activeIds.has(id)) {
      await idbDeletePhoto(id);
      removed++;
    }
  }
  return removed;
}

/** Canvas-resize загруженного File → Blob (JPEG).
 *  maxSide ограничивает обе оси; quality — 0..1. */
export async function resizeImage(file: File, maxSide = 512, quality = 0.78): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
  );
}
