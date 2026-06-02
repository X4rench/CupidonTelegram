// ═══════════════════════════════════════════════════════════════
// Cupidon TMA — Frontend entrypoint
//
// Архитектура запуска:
//   0. Phase J: initSentry() ДО createRoot — чтобы поймать ошибки рендера.
//   1. Инициализируем @telegram-apps/sdk-react (init() + retrieveLaunchParams).
//   2. Если initData нет (открыт в обычном браузере без TG-контекста) —
//      показываем лендинг с кнопкой «Открыть в Telegram».
//   3. Иначе — рендерим <App /> внутри <ThemeProvider> (Phase J).
// ═══════════════════════════════════════════════════════════════
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTelegram, hasInitData } from './auth';
import { Landing } from './screens/Landing';
import { ThemeProvider } from './contexts/ThemeContext';
import { initSentry } from './sentry';
import './theme.css';

// Phase J: Sentry — самым первым, чтобы поймать ошибки в TG SDK init.
initSentry();

const root = createRoot(document.getElementById('root')!);

(async () => {
  try {
    await initTelegram();
  } catch (err) {
    console.warn('[main] Telegram SDK init failed:', err);
  }

  if (!hasInitData()) {
    root.render(
      <ThemeProvider>
        <Landing />
      </ThemeProvider>
    );
    return;
  }

  root.render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
})();
