// ═══════════════════════════════════════════════════════════════
// OnboardingScreen — 3 слайда:
//   1. Анализ переписки
//   2. Симулятор знакомств
//   3. AI-собеседник для практики
//
// Переключение — кнопкой / тапом по точкам. Анимация — CSS transition на opacity/translate.
// На последнем слайде кнопка «Начать» → PUT /users/me { onboarding_done: true } → /questionnaire.
// «Пропустить» — то же самое.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradientButton } from '../components/GradientButton';
import { updateMe } from '../api';
import { useMe } from '../contexts/MeContext';
import { selectionHaptic, notificationHaptic } from '../utils/haptics';

interface Slide {
  title: string;
  sub: string;
  illustration: ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: 'Стрела — твой ассистент в переписке',
    sub: 'Покажи скрин или вставь текст — Купидон проанализирует диалог и предложит, что ответить.',
    illustration: <SlideIllustration1 />,
  },
  {
    title: 'Симулятор реальных ситуаций',
    sub: 'Тренируйся знакомиться с AI-девушками. Прокачивай уверенность без страха провала.',
    illustration: <SlideIllustration2 />,
  },
  {
    title: 'Создавай свою девушку',
    sub: 'Опиши характер, фото и интересы — Купидон сгенерит собеседницу для долгой переписки.',
    illustration: <SlideIllustration3 />,
  },
];

function SlideIllustration1() {
  return (
    <svg width={260} height={200} viewBox="0 0 260 200">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <rect x={30} y={10} width={85} height={160} rx={14} fill="#1E1E22" stroke="url(#g1)" strokeWidth={1.5} />
      <rect x={40} y={35} width={65} height={8} rx={4} fill="#3F3F46" />
      <rect x={40} y={50} width={50} height={8} rx={4} fill="#3F3F46" />
      <rect x={40} y={65} width={55} height={8} rx={4} fill="#F43F5E" opacity={0.8} />
      <rect x={40} y={80} width={40} height={8} rx={4} fill="#3F3F46" />
      <rect x={135} y={30} width={100} height={32} rx={12} fill="#1E1E22" stroke="rgba(244,63,94,0.3)" strokeWidth={1} />
      <rect x={145} y={40} width={60} height={6} rx={3} fill="#52525B" />
      <rect x={145} y={50} width={40} height={4} rx={2} fill="#3F3F46" />
      <rect x={150} y={80} width={90} height={32} rx={12} fill="url(#g1)" opacity={0.9} />
      <rect x={160} y={90} width={55} height={6} rx={3} fill="rgba(255,255,255,0.8)" />
      <rect x={135} y={130} width={95} height={32} rx={12} fill="#1E1E22" stroke="rgba(168,85,247,0.3)" strokeWidth={1} />
      <rect x={145} y={140} width={65} height={6} rx={3} fill="#52525B" />
      <path d="M215 22 C215 18 211 14 207 18 C203 14 199 18 199 22 C199 28 207 34 207 34 C207 34 215 28 215 22Z" fill="#F43F5E" opacity={0.9} />
    </svg>
  );
}

function SlideIllustration2() {
  return (
    <svg width={260} height={200} viewBox="0 0 260 200">
      <defs>
        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path d="M130 20 C130 20 180 30 180 30 L180 100 C180 130 130 160 130 160 C130 160 80 130 80 100 L80 30 C80 30 130 20 130 20Z"
            fill="none" stroke="url(#g2)" strokeWidth={2} />
      <path d="M130 40 C130 40 165 48 165 48 L165 95 C165 118 130 140 130 140 C130 140 95 118 95 95 L95 48 C95 48 130 40 130 40Z"
            fill="rgba(244,63,94,0.08)" />
      <path d="M110 90 L125 105 L155 75" stroke="#F43F5E" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={40} cy={50} r={20} fill="rgba(168,85,247,0.1)" stroke="rgba(168,85,247,0.3)" strokeWidth={1} />
      <path d="M35 50 L38 53 L45 46" stroke="#A855F7" strokeWidth={2} fill="none" />
      <circle cx={220} cy={60} r={18} fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.3)" strokeWidth={1} />
      <path d="M214 60 L218 64 L226 56" stroke="#22C55E" strokeWidth={2} fill="none" />
      <circle cx={50} cy={150} r={15} fill="rgba(236,72,153,0.1)" stroke="rgba(236,72,153,0.3)" strokeWidth={1} />
      <path d="M45 150 L48 153 L55 146" stroke="#EC4899" strokeWidth={2} fill="none" />
    </svg>
  );
}

function SlideIllustration3() {
  return (
    <svg width={260} height={200} viewBox="0 0 260 200">
      <defs>
        <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <ellipse cx={100} cy={60} rx={22} ry={26} fill="rgba(244,63,94,0.15)" stroke="url(#g3)" strokeWidth={1.5} />
      <ellipse cx={100} cy={130} rx={30} ry={28} fill="rgba(244,63,94,0.1)" stroke="url(#g3)" strokeWidth={1.5} />
      <rect x={145} y={40} width={90} height={28} rx={10} fill="#1E1E22" stroke="rgba(168,85,247,0.3)" strokeWidth={1} />
      <rect x={155} y={50} width={50} height={5} rx={2.5} fill="#52525B" />
      <rect x={155} y={58} width={35} height={4} rx={2} fill="#3F3F46" />
      <rect x={150} y={82} width={85} height={28} rx={10} fill="url(#g3)" opacity={0.85} />
      <rect x={160} y={92} width={45} height={5} rx={2.5} fill="rgba(255,255,255,0.8)" />
      <rect x={145} y={124} width={95} height={28} rx={10} fill="#1E1E22" stroke="rgba(236,72,153,0.3)" strokeWidth={1} />
      <rect x={155} y={134} width={60} height={5} rx={2.5} fill="#52525B" />
      <rect x={155} y={143} width={40} height={4} rx={2} fill="#3F3F46" />
    </svg>
  );
}

export function OnboardingScreen() {
  const nav = useNavigate();
  const { refresh } = useMe();
  const [slide, setSlide] = useState(0);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateMe({ onboarding_done: true });
      await refresh();
      notificationHaptic('success');
      nav('/questionnaire', { replace: true });
    } catch (e: any) {
      // Если backend упал — продолжаем дальше, не блокируем юзера
      console.warn('[onboarding] save failed:', e);
      nav('/questionnaire', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const isLast = slide === SLIDES.length - 1;
  const cur = SLIDES[slide];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div />
        <button
          onClick={() => { selectionHaptic(); finish(); }}
          style={styles.skipBtn}
        >
          Пропустить
        </button>
      </div>

      <div style={styles.content}>
        <div key={`ill-${slide}`} style={styles.illustration}>
          {cur.illustration}
        </div>
        <div key={`txt-${slide}`} style={styles.text}>
          <div style={styles.title}>{cur.title}</div>
          <div style={styles.subtitle}>{cur.sub}</div>
        </div>
      </div>

      <div style={styles.footer}>
        <div style={styles.dots}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => { selectionHaptic(); setSlide(i); }}
              style={{
                ...styles.dot,
                ...(i === slide ? styles.dotActive : {}),
              }}
              aria-label={`Слайд ${i + 1}`}
            />
          ))}
        </div>
        <div style={styles.buttons}>
          {slide > 0 && (
            <button
              onClick={() => { selectionHaptic(); setSlide(slide - 1); }}
              style={styles.backBtn}
              aria-label="Назад"
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
          )}
          <div style={{ flex: 1 }}>
            <GradientButton
              full
              loading={saving && isLast}
              onClick={() => {
                if (isLast) {
                  finish();
                } else {
                  selectionHaptic();
                  setSlide(slide + 1);
                }
              }}
            >
              {isLast ? 'Начать' : 'Далее'}
            </GradientButton>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes onbFadeIn {
          0%   { opacity: 0; transform: translateY(8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 'var(--safe-top)',
    paddingBottom: 'var(--safe-bottom)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
  },
  skipBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '6px 10px',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 24px',
    gap: 40,
  },
  illustration: {
    width: 280,
    height: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'onbFadeIn 280ms ease-out',
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    textAlign: 'center',
    animation: 'onbFadeIn 320ms ease-out 60ms backwards',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: '24px',
    maxWidth: 360,
  },
  footer: {
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  dots: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    background: 'var(--border-default)',
    transition: 'all 220ms ease',
    cursor: 'pointer',
    padding: 0,
  },
  dotActive: {
    width: 20,
    background: 'var(--accent-primary)',
  },
  buttons: {
    display: 'flex',
    gap: 12,
    width: '100%',
    alignItems: 'center',
  },
  backBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.15))',
    border: '1px solid rgba(244,63,94,0.25)',
    cursor: 'pointer',
    flexShrink: 0,
  },
};
