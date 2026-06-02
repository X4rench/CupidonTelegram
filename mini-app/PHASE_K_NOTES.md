# Phase K — CloudStorage sync + IndexedDB для фото

> Кросс-устройственная синхронизация лёгких данных (профиль, кастомные контакты, настройки) через Telegram CloudStorage. Тяжёлые бинарники (фото) — IndexedDB локально на каждом устройстве.

## Что создано

| Файл | Назначение |
|---|---|
| `mini-app/src/utils/cloudSync.ts` | Низкоуровневая обёртка над `window.Telegram.WebApp.CloudStorage` + helpers для предметной области (profile, contacts) |
| `mini-app/src/hooks/usePersistedState.ts` | Хук: useState + автозапись в localStorage + опциональный pull/push в CloudStorage |
| `mini-app/src/utils/indexedDB.ts` | Обёртка над IndexedDB для blob'ов (фото контактов) |

## Архитектурное разделение по слоям

| Тип данных | Где живёт | Синкается между устройствами? |
|---|---|---|
| Подписка / тарифы / лимиты | SQLite на сервере | ✅ (источник истины — сервер) |
| user_profile (анкета) | localStorage + CloudStorage | ✅ (cloud-pull на mount) |
| Кастомные контакты metadata | localStorage + CloudStorage | ✅ |
| Фото контактов (blob) | IndexedDB локально | ❌ (см. ниже) |
| История чатов с AI | localStorage | ❌ (privacy, 152-ФЗ — не дублируем переписку на сервер) |
| Настройки темы/нотифов | localStorage + CloudStorage | ✅ |
| Незавершённые черновики симуляции | localStorage | ❌ |

## Почему фото — только IndexedDB

CloudStorage в TG ограничен 4096 байт на значение. JPEG-фото даже сильно сжатое — 30-100 KB. Поэтому:
- Фото загружаем через `<input type="file" accept="image/*">` → resize в canvas до 512×512 → toBlob('image/jpeg', 0.85) → IndexedDB
- В CloudStorage синкаем только `avatar_ref: string | null` (id из IndexedDB) внутри `CloudContactMeta`
- При открытии контакта на другом устройстве: метаданные приходят из CloudStorage, фото — placeholder с инициалами имени

Это осознанный trade-off: чтобы получить фото на втором устройстве, нужно его пере-загрузить там. Альтернатива — хранить фото на бэкенде (S3/R2 + endpoint /photos), но это +инфра, +PII (152-ФЗ требует хранения в РФ), +трафик на каждый запрос. Поэтому отложили на потом.

## Шаблон использования в экранах

### Profile sync (для QuestionnaireScreen, EditProfileScreen)

```ts
import { usePersistedState } from '../hooks/usePersistedState';

const [profile, setProfile] = usePersistedState('user_profile', null, { cloud: true });
// На mount: 1) синхронно читаем localStorage 2) асинхронно подтягиваем cloud
// setProfile({...}) → пишет в LS + fire-and-forget в cloud
```

### Сохранение/чтение кастомных контактов

```ts
import { cloudGetAllContacts, cloudSetContact, cloudRemoveContact } from '../utils/cloudSync';
import { idbPutPhoto, idbGetPhotoUrl, idbDeletePhoto } from '../utils/indexedDB';

// При создании контакта
const photoId = file ? await idbPutPhoto(file) : null;
const contact = { id: makeId(), name, typazh, avatar_ref: photoId };
await cloudSetContact(contact);  // metadata — в облако
// fire-and-forget безопасен; если cloud недоступен — данные останутся в LS

// При отображении на любом устройстве
const contacts = await cloudGetAllContacts();
for (const c of contacts) {
  // Re-resolve photo на mount компонента (грабли §5.1 — blob:URL не сохраняется!)
  const url = c.avatar_ref ? await idbGetPhotoUrl(c.avatar_ref) : null;
  // Если url=null на этом устройстве — показываем инициалы (фото не синкается)
}

// При удалении
await cloudRemoveContact(id);
if (avatar_ref) await idbDeletePhoto(avatar_ref);  // СРАЗУ в оба слоя (грабли §5.42)
```

## Edge-cases предусмотренные

- **Вне TG (локальная разработка)** — все cloud-методы возвращают null/false, никаких ошибок. Локально хранится только в localStorage.
- **Переключение TG-аккаунтов на одном устройстве** — `storage.ts` префиксует ключи `tg_user_id`. CloudStorage привязан к TG-аккаунту → автоматически разделён.
- **Race на mount** — `cloudPulledRef` предотвращает повторный pull в strict-mode и при ре-рендерах.
- **Cloud > 4096 bytes** — `cloudSet` пишет warning и возвращает false, не бросает исключение. Локально данные сохранятся.
- **Удаление в одном слое возвращает призраков** — `cloudRemoveContact` вызывается СИНХРОННО с удалением из state (грабли §5.42 — pull-эффект мог вернуть удалённую запись).

## TODO для следующих фаз

- **Conflict resolution** при одновременной правке профиля с двух устройств — сейчас побеждает то что cloud вернул на mount. Если нужно — добавь `updated_at` timestamp и берёт более свежее.
- **Cleanup orphans** — после удаления контактов вызывать `idbCleanupOrphans(activeIds)` периодически. Сейчас orphan-фото живут в IndexedDB вечно.
- **Quota check** — `cloudKeys()` может вернуть >1000 ключей, тогда `setItem` начнёт фейлить. Phase J — добавить мониторинг.

## Подключение к существующим экранам (Phase E уже портирован)

В `QuestionnaireScreen.tsx` и `EditProfileScreen.tsx` сейчас работа с профилем через API (PUT /users/me). Чтобы добавить cloud-синк:

1. На submit формы — параллельно с `updateMe()` вызвать `cloudSetProfile(profileObj)`.
2. На mount — параллельно с `useMe()` хуком вызвать `cloudGetProfile()` и если облачная копия свежее — задать в форму.

Это работа Phase E-Refinement (или Phase H после Paywall). Сейчас экраны работают через API → автоматическая cross-device синхронизация уже есть через серверную БД. CloudStorage нужен для тех данных которых на сервере НЕТ (кастомные контакты, история диалогов, настройки темы).
