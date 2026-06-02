// ═══════════════════════════════════════════════════════════════
// PaywallContext — глобальный state открытия Paywall.
//
// Любой компонент может вызвать usePaywall().open({reason: 'limit'})
// — и поверх текущего экрана покажется PaywallScreen (роут /paywall).
// Подходит для:
//   - 429 от бэкенда (исчерпан daily_used)        → reason='limit'
//   - попытка NSFW без Premium тира               → reason='nsfw'
//   - ручное открытие из Profile/HomeScreen/etc.  → reason='manual'
//
// State не дублирует /users/me — для тира/лимитов читаем useMe().
// Сохраняем только что/почему открыто + какой план подсветить.
//
// Используется вместе с MeContext (must be inside MeProvider).
// ═══════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StarsPlan } from '../api';
import type { MeResponse } from '../api';

export type PaywallReason = 'limit' | 'nsfw' | 'manual';

export interface PaywallState {
  isOpen: boolean;
  reason: PaywallReason | null;
  defaultPlan?: StarsPlan;
}

interface OpenOptions {
  reason: PaywallReason;
  defaultPlan?: StarsPlan;
}

interface PaywallContextValue extends PaywallState {
  open: (opts: OpenOptions) => void;
  close: () => void;
  /**
   * Вызывается из App после первой загрузки /users/me — нужно для совместимости
   * с архитектурой RN-версии (PaywallContext там хранил локальный snapshot
   * sub_tier/daily_used). В TMA мы читаем то же напрямую через useMe(),
   * но метод оставлен для миграции — он no-op-ит при отсутствии необходимости.
   */
  initFromIdentify: (me: MeResponse) => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PaywallState>({
    isOpen: false,
    reason: null,
    defaultPlan: undefined,
  });

  const open = useCallback((opts: OpenOptions) => {
    setState({
      isOpen: true,
      reason: opts.reason,
      defaultPlan: opts.defaultPlan,
    });
  }, []);

  const close = useCallback(() => {
    setState({ isOpen: false, reason: null, defaultPlan: undefined });
  }, []);

  // No-op в TMA — все данные тир/лимитов берутся из useMe().
  // Сохраняем сигнатуру для совместимости с PHASE_H_NOTES.md.
  const initFromIdentify = useCallback((_me: MeResponse) => {
    // intentionally empty
  }, []);

  const value = useMemo<PaywallContextValue>(() => ({
    ...state,
    open,
    close,
    initFromIdentify,
  }), [state, open, close, initFromIdentify]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error('usePaywall must be used inside <PaywallProvider>');
  return ctx;
}
