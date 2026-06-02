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

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMe();
      setMe(res.user);
      setError(null);
    } catch (e: any) {
      // На 401/500 — отдаём минимальный free-профиль чтобы UI не падал
      // (грабли §5.16 — /users/me падал → белый экран).
      console.error('[MeContext] failed:', e);
      setError(e.message || String(e));
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
