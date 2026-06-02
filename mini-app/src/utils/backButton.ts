// ═══════════════════════════════════════════════════════════════
// useBackButton — хук для подключения TG BackButton к экрану.
// При монтировании показывает кнопку, при клике вызывает onBack,
// при размонтировании прячет.
//
// SDK init может быть не выполнен (открыто в обычном браузере) — тогда
// все вызовы тихо no-op.
// ═══════════════════════════════════════════════════════════════
import { useEffect } from 'react';

function tgBackButton(): any {
  // Используем «сырой» Telegram.WebApp API. В новой версии @telegram-apps/sdk-react
  // импорт может ломать SSR/тесты, поэтому держим интерфейс простым.
  return (window as any)?.Telegram?.WebApp?.BackButton;
}

export function useBackButton(onBack: () => void) {
  useEffect(() => {
    const bb = tgBackButton();
    if (!bb) return;
    try {
      bb.show?.();
      bb.onClick?.(onBack);
    } catch (_) {}
    return () => {
      try {
        bb.offClick?.(onBack);
        bb.hide?.();
      } catch (_) {}
    };
  }, [onBack]);
}
