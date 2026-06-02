// ═══════════════════════════════════════════════════════════════
// ThemeContext — выбор активной темы (8 штук).
//
// Идиоматичный для веба путь: переключаем data-theme="X" на <html>,
// а сами цвета живут в CSS-переменных в theme.css. Никаких JS-объектов
// с цветами не таскаем — react-у нечего пере-рендеривать при смене темы.
//
// Persistence: storage.setGlobal — тема общая для устройства, не делится
// на per-tg-user (если на одном устройстве два TG-аккаунта, тема одна).
// ═══════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from '../utils/storage';

export type ThemeId =
  | 'dark'
  | 'light'
  | 'velvet'
  | 'midnight'
  | 'rose'
  | 'forest'
  | 'aurora'
  | 'carbon';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  icon: 'moon' | 'sun' | 'star' | 'zap' | 'heart' | 'leaf' | 'sparkles' | 'cpu';
  /** Preview accent color (для swatch'а в списке). */
  accent: string;
  /** Preview background (для swatch'а). */
  bg: string;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  dark:     { id: 'dark',     name: 'Тёмная',   icon: 'moon',     accent: '#F43F5E', bg: '#09090B' },
  light:    { id: 'light',    name: 'Светлая',  icon: 'sun',      accent: '#E8384F', bg: '#FAF8F4' },
  velvet:   { id: 'velvet',   name: 'Золото',   icon: 'star',     accent: '#D4A843', bg: '#0E0A04' },
  midnight: { id: 'midnight', name: 'Полночь',  icon: 'zap',      accent: '#3B82F6', bg: '#04060F' },
  rose:     { id: 'rose',     name: 'Роза',     icon: 'heart',    accent: '#EC4899', bg: '#0F0810' },
  forest:   { id: 'forest',   name: 'Лес',      icon: 'leaf',     accent: '#10B981', bg: '#040C07' },
  aurora:   { id: 'aurora',   name: 'Аврора',   icon: 'sparkles', accent: '#8B5CF6', bg: '#07050F' },
  carbon:   { id: 'carbon',   name: 'Карбон',   icon: 'cpu',      accent: '#06B6D4', bg: '#050505' },
};

const THEME_KEY = 'theme.id';
const DEFAULT_THEME: ThemeId = 'dark';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeMeta;
  themes: Record<ThemeId, ThemeMeta>;
  switchTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDocTheme(id: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', id);
  // Также красим meta theme-color (TG WebView читает её для статус-бара)
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (meta) meta.content = THEMES[id].bg;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = storage.getGlobal<ThemeId | null>(THEME_KEY, null);
    return saved && THEMES[saved] ? saved : DEFAULT_THEME;
  });

  // На первый рендер выставляем data-theme сразу (избегаем мигания)
  useEffect(() => {
    applyDocTheme(themeId);
  }, [themeId]);

  const switchTheme = useCallback((id: ThemeId) => {
    if (!THEMES[id]) return;
    setThemeId(id);
    storage.setGlobal(THEME_KEY, id);
    applyDocTheme(id);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    themeId,
    theme: THEMES[themeId],
    themes: THEMES,
    switchTheme,
  }), [themeId, switchTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Fallback на dark если провайдер не подключён (например, в тестах).
  return {
    themeId: DEFAULT_THEME,
    theme: THEMES[DEFAULT_THEME],
    themes: THEMES,
    switchTheme: () => {},
  };
}
