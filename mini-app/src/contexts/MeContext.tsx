// ═══════════════════════════════════════════════════════════════
// MeContext — глобальный user state: профиль, тир, лимиты.
// Источник истины — /users/me на бэкенде. Клиент только отображает.
//
// Любая мутация (платёж, claim бонуса, обновление профиля) → refresh().
// ═══════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, type MeResponse } from '../api';

interface MeContextValue {
  me: MeResponse['user'] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const MeContext = createContext<MeContextValue | null>(null);

// Diag-beacon — для отладки iOS-зависаний на /me.
function stageBeacon(stage: string, extras: Record<string, any> = {}) {
  try {
    const qs = new URLSearchParams({ stage, ts: String(Date.now()) });
    for (const [k, v] of Object.entries(extras)) {
      qs.append(k, String(v).slice(0, 200));
    }
    const img = new Image();
    img.src = '/api/v1/diag/beacon?' + qs.toString();
  } catch (_) {}
}

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    stageBeacon('me_fetch_start');
    const t0 = Date.now();
    try {
      const res = await getMe();
      setMe(res.user);
      setError(null);
      stageBeacon('me_fetch_ok', { ms: Date.now() - t0, tier: res.user?.tier || 'unknown' });
    } catch (e: any) {
      // На 401/500 — отдаём минимальный free-профиль чтобы UI не падал
      // (грабли §5.16 — /users/me падал → белый экран).
      console.error('[MeContext] failed:', e);
      setError(e.message || String(e));
      stageBeacon('me_fetch_fail', {
        ms: Date.now() - t0,
        err: String(e?.message || e).slice(0, 100),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <MeContext.Provider value={{ me, loading, error, refresh }}>
      {children}
    </MeContext.Provider>
  );
}

export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe must be used inside <MeProvider>');
  return ctx;
}
