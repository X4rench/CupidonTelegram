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

// Beacon-логирование стадий загрузки — для отладки iOS-зависаний.
// Использует <img>.src вместо fetch, чтобы работать даже без initData
// и не зависеть от React. URL → backend /api/v1/diag/beacon → файловый лог.
function stageBeacon(stage: string, extras: Record<string, any> = {}) {
  try {
    const qs = new URLSearchParams({ stage, ts: String(Date.now()) });
    for (const [k, v] of Object.entries(extras)) {
      qs.append(k, String(v).slice(0, 200));
    }
    const img = new Image();
    img.src = '/api/v1/diag/beacon?' + qs.toString();
  } catch (_) { /* ignore */ }
}

stageBeacon('main_started');

// Phase J: Sentry — самым первым, чтобы поймать ошибки в TG SDK init.
initSentry();
stageBeacon('sentry_init_done');

const root = createRoot(document.getElementById('root')!);
stageBeacon('react_root_created');

(async () => {
  try {
    await initTelegram();
    stageBeacon('init_tg_done', { hasInitData: hasInitData() ? 1 : 0 });
  } catch (err: any) {
    console.warn('[main] Telegram SDK init failed:', err);
    stageBeacon('init_tg_failed', { err: String(err?.message || err).slice(0, 100) });
  }

  // ЧИСТЫЙ ДОМЕН (cupidonapp.ru) — вход в Mini App ТОЛЬКО для Telegram.
  // Не-Telegram трафик (краулеры Safe Browsing, случайные посетители) уводим
  // в бота, чтобы на новом домене НЕ светился платёжный лендинг — иначе он
  // со временем попадёт под тот же фрод-флаг, что cupidonai.ru. Лендинг,
  // оферта и Privacy остаются на cupidonai.ru (его не выключаем).
  if (window.location.hostname.endsWith('cupidonapp.ru') && !hasInitData()) {
    stageBeacon('clean_host_bounce');
    window.location.replace('https://t.me/Cupidon_Ai_Bot/app');
    return;
  }

  if (!hasInitData()) {
    // Публичный режим — Landing + legal-страницы. Доступны через прямые URL
    // без авторизации в TG: https://cupidonai.ru/privacy и /terms.
    stageBeacon('render_landing');
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

  stageBeacon('render_app');
  root.render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
})();

// Глобальный onerror — чтобы поймать любые runtime-ошибки, которые
// мог пропустить React/Sentry. Особенно полезно на iOS WebKit.
window.addEventListener('error', (ev) => {
  stageBeacon('window_error', {
    msg: String(ev?.message || '').slice(0, 150),
    src: String(ev?.filename || '').slice(0, 100),
    line: String(ev?.lineno || ''),
  });
});
window.addEventListener('unhandledrejection', (ev) => {
  stageBeacon('unhandled_rejection', {
    reason: String(ev?.reason?.message || ev?.reason || '').slice(0, 150),
  });
});
