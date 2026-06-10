// ═══════════════════════════════════════════════════════════════
// SplashScreen — показывается пока грузится MeContext, и редиректит
// юзера в нужное место:
//   - onboarding_done + questionnaire_done → /
//   - onboarding_done && !questionnaire_done → /questionnaire
//   - иначе → /onboarding
//
// Минимальная задержка 800 мс чтобы splash не моргал.
// Анимация — CSS pulse у градиент-сердца + лоадер-полоса.
// ═══════════════════════════════════════════════════════════════
import { useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';

const MIN_SPLASH_MS = 800;
// Жёсткий failsafe — если /me не отдал ответ за это время, всё равно
// выпускаем юзера в UI (на onboarding). Раньше на медленном iOS-network
// можно было висеть на splash до 3 минут (60s timeout × 3 retries).
const MAX_SPLASH_MS = 12_000;

export function SplashScreen() {
  const { me, loading } = useMe();
  const nav = useNavigate();

  useEffect(() => {
    const startedAt = Date.now();

    let cancelled = false;
    function tryRedirect() {
      if (cancelled) return;
      if (loading) return; // подождём
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);

      setTimeout(() => {
        if (cancelled) return;
        if (!me) {
          // не смогли получить /me — отправим на онбординг чтобы UI не падал
          nav('/onboarding', { replace: true });
          return;
        }
        if (me.onboarding_done && me.questionnaire_done) {
          nav('/', { replace: true });
        } else if (me.onboarding_done) {
          nav('/questionnaire', { replace: true });
        } else {
          nav('/onboarding', { replace: true });
        }
      }, wait);
    }

    tryRedirect();

    // Failsafe: даже если loading навсегда true (заглохший fetch на iOS
    // и т.п.) — через MAX_SPLASH_MS форсим переход на onboarding.
    // Лучше показать пустой онбординг чем бесконечный splash.
    const failsafe = setTimeout(() => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.warn('[Splash] failsafe fired — loading hung, forcing /onboarding');
      nav('/onboarding', { replace: true });
    }, MAX_SPLASH_MS);

    return () => {
      cancelled = true;
      clearTimeout(failsafe);
    };
  }, [loading, me, nav]);

  return (
    <div style={styles.container}>
      <div style={styles.glow} />
      <div style={styles.logoWrap}>
        <svg width={160} height={160} viewBox="0 0 80 80" style={styles.logo}>
          <defs>
            <linearGradient id="spGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F43F5E" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
          </defs>
          {/* Свечение */}
          <path
            d="M40 63 C40 63,15 47,15 31 C15 21,25 14,33 19 C37 21,39 27,40 31 C41 27,43 21,47 19 C55 14,65 21,65 31 C65 47,40 63,40 63Z"
            fill="none" stroke="url(#spGrad)" strokeWidth={14} opacity={0.07}
          />
          <path
            d="M40 63 C40 63,15 47,15 31 C15 21,25 14,33 19 C37 21,39 27,40 31 C41 27,43 21,47 19 C55 14,65 21,65 31 C65 47,40 63,40 63Z"
            fill="none" stroke="url(#spGrad)" strokeWidth={7} opacity={0.15}
          />
          {/* Контур + лёгкая заливка */}
          <path
            d="M40 63 C40 63,15 47,15 31 C15 21,25 14,33 19 C37 21,39 27,40 31 C41 27,43 21,47 19 C55 14,65 21,65 31 C65 47,40 63,40 63Z"
            fill="#F43F5E" fillOpacity={0.06} stroke="url(#spGrad)" strokeWidth={2.5}
          />
          {/* Стрела */}
          <line x1={10} y1={70} x2={30} y2={50} stroke="url(#spGrad)" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={10} cy={70} r={3} fill="url(#spGrad)" />
          <line x1={50} y1={30} x2={70} y2={10} stroke="url(#spGrad)" strokeWidth={2.5} strokeLinecap="round" />
          <polygon points="74,6 71,16 65,10" fill="url(#spGrad)" />
        </svg>
        <div style={styles.title}>Купидон</div>
        <div style={styles.subtitle}>AI-коуч по знакомствам</div>
      </div>

      <div style={styles.loader}>
        <div style={styles.loaderFill} />
      </div>

      <style>{`
        @keyframes spPulse {
          0%, 100% { transform: scale(0.92); opacity: 0.45; }
          50%      { transform: scale(1.12); opacity: 0.8;  }
        }
        @keyframes spLoaderSlide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%);  }
        }
        @keyframes spLogoIn {
          0%   { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    position: 'relative',
    overflow: 'hidden',
    padding: 24,
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    background: 'rgba(244, 63, 94, 0.18)',
    filter: 'blur(40px)',
    animation: 'spPulse 2.4s ease-in-out infinite',
  },
  logoWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 1,
    animation: 'spLogoIn 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  logo: { display: 'block' },
  title: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: 3,
    color: '#F43F5E',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
  loader: {
    position: 'absolute',
    bottom: 'calc(60px + var(--safe-bottom))',
    width: 80,
    height: 2,
    background: 'var(--border-subtle)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loaderFill: {
    width: '50%',
    height: '100%',
    background: 'var(--gradient-accent)',
    borderRadius: 1,
    animation: 'spLoaderSlide 1.2s ease-in-out infinite',
  },
};
