// ═══════════════════════════════════════════════════════════════
// Haptic feedback wrapper.
// Все вызовы обёрнуты в try/catch — вне TG WebView (например, в обычном
// браузере) объекта window.Telegram нет, и неуспех должен быть тихим.
// ═══════════════════════════════════════════════════════════════

type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type Notification = 'error' | 'success' | 'warning';

function hf(): any {
  return (window as any)?.Telegram?.WebApp?.HapticFeedback;
}

export function impactHaptic(style: Impact = 'light') {
  try { hf()?.impactOccurred?.(style); } catch (_) {}
}

export function notificationHaptic(type: Notification = 'success') {
  try { hf()?.notificationOccurred?.(type); } catch (_) {}
}

export function selectionHaptic() {
  try { hf()?.selectionChanged?.(); } catch (_) {}
}
