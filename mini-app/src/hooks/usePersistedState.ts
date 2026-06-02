// ═══════════════════════════════════════════════════════════════
// usePersistedState — useState + автоматическая запись в localStorage,
// опционально с pull/push в TG CloudStorage для cross-device sync.
//
// Использование:
//   const [profile, setProfile] = usePersistedState('user_profile', null);
//   // — только localStorage, не синкается между устройствами
//
//   const [profile, setProfile] = usePersistedState('user_profile', null, { cloud: true });
//   // — на mount подтянет облачную копию (если есть), merge в state.
//   // — setProfile() пишет в LS + fire-and-forget в cloud.
//
// Принципы:
//   1. Mount: синхронно читаем LS. Это значение видно с первого рендера.
//   2. Через тик: асинхронно тянем cloud → если != LS → обновляем state + LS.
//      Cloud "побеждает" по дефолту (cross-device дороже чем local-edit).
//   3. Mutation: setValue → LS + fire-and-forget cloud (НЕ ждём resolve).
//   4. cloud pull выполняется ОДИН раз за жизнь компонента (через useRef).
//      Это защищает от race-condition с локальными правками юзера.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { storage } from '../utils/storage';
import { cloudGet, cloudSet, isCloudAvailable } from '../utils/cloudSync';

interface Options {
  /** Если true — синкать значение в TG CloudStorage. По умолчанию — только LS. */
  cloud?: boolean;
  /** Префикс ключа в CloudStorage. По умолчанию `cup_`. Ключ должен влезть в [A-Za-z0-9_-]{1,128}. */
  cloudPrefix?: string;
  /** Кастомный merge cloud↔local. По умолчанию cloud побеждает. */
  merge?: <T>(local: T, cloud: T) => T;
}

export function usePersistedState<T>(
  key: string,
  initial: T,
  opts: Options = {},
): [T, (next: T | ((prev: T) => T)) => void] {
  // Синхронное чтение LS при первом рендере
  const [value, setValue] = useState<T>(() => storage.get(key, initial));
  const cloudPulledRef = useRef(false);
  const latestRef = useRef(value);
  latestRef.current = value;

  // Один раз после mount — попытаться подтянуть из cloud
  useEffect(() => {
    if (!opts.cloud || cloudPulledRef.current || !isCloudAvailable()) return;
    cloudPulledRef.current = true;

    const cloudKey = `${opts.cloudPrefix ?? 'cup_'}${key}`;
    cloudGet(cloudKey).then(raw => {
      if (!raw) return;
      try {
        const cloudValue = JSON.parse(raw) as T;
        const merged = opts.merge
          ? opts.merge(latestRef.current, cloudValue)
          : cloudValue;
        setValue(merged);
        storage.set(key, merged);
      } catch (_) { /* мусор в cloud — игнорируем */ }
    });
  }, [key, opts.cloud, opts.cloudPrefix, opts.merge]);

  const update = (next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      storage.set(key, v);
      if (opts.cloud && isCloudAvailable()) {
        const cloudKey = `${opts.cloudPrefix ?? 'cup_'}${key}`;
        try {
          cloudSet(cloudKey, JSON.stringify(v)).catch(() => {});
        } catch (_) { /* circular JSON или подобное — fall through */ }
      }
      return v;
    });
  };

  return [value, update];
}
