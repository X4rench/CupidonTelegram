// ═══════════════════════════════════════════════════════════════
// Cupidon TMA — Frontend entrypoint
//
// Архитектура запуска:
//   0. Phase J: initSentry() ДО createRoot — чтобы поймать ошибки рендера.
//   1. Инициализируем @telegram-apps/sdk-react (init() + retrieveLaunchParams).
//   2. Если initData нет (открыт в обычном браузере без TG-контекста) —
//      показываем публичный лендинг с роутингом для /privacy, /terms
//      (важно для модератора ЮКассы — он должен увидеть legal-страницы).
//   3. Иначе — рендерим <App /> внутри <ThemeProvider> (Phase J).
// ═══════════════════════════════════════════════════════════════
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { initTelegram, hasInitData } from './auth';
import { Landing } from './screens/Landing';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { TermsScreen } from './screens/TermsScreen';
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
    // Публичный режим — Landing + legal-страницы. Доступны через прямые URL
    // без авторизации в TG: https://cupidonai.ru/privacy и /terms.
    root.render(
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/privacy" element={<PrivacyScreen />} />
            <Route path="/terms"   element={<TermsScreen />} />
            <Route path="*"        element={<Landing />} />
          </Routes>
        </BrowserRouter>
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
