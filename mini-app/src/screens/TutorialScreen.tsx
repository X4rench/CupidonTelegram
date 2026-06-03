// ═══════════════════════════════════════════════════════════════
// TutorialScreen — пошаговый туториал по фичам приложения.
// 5 слайдов с описанием инструментов. Показывается ОДИН раз —
// после онбординга+анкеты (см. AuthGate в App.tsx). При «Готово»
// или «Пропустить» — updateMe({tutorial_done: true}) → / .
//
// Дизайн:
//   - Полноэкранный hero: верхняя половина — большой emoji на фоне
//     градиентного blur-круга 300×300, нижняя — заголовок + текст.
//   - Pagination сверху — progress bar (1/5 → 5/5), а не точки.
//   - Плавная смена слайдов: translate-X + transition 280ms.
//   - Внизу: Назад (secondary) | Дальше/Начать (gradient primary).
//   - Top-right: «Пропустить» (text-only, мелкий).
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic, impactHaptic } from '../utils/haptics';
import { useMe } from '../contexts/MeContext';
import { updateMe } from '../api';

interface Slide {
  emoji: string;
  title: string;
  text: string;
  accent: string;    // основной цвет для blur-круга
  accent2: string;   // вторичный цвет для градиента
}

const SLIDES: Slide[] = [
  {
    emoji: '🎯',
    title: 'Стрела — анализ переписки',
    text: 'Вставь свой чат с ней — AI скажет где ты теряешь интерес, какой её тип, и даст варианты ответа.',
    accent: 'rgba(244,63,94,0.55)',
    accent2: 'rgba(168,85,247,0.45)',
  },
  {
    emoji: '💬',
    title: 'Симулятор знакомства',
    text: 'Выбери типаж и место — AI отыграет роль девушки. В конце — разбор где ты молодец и где зашёл слишком далеко.',
    accent: 'rgba(168,85,247,0.55)',
    accent2: 'rgba(99,102,241,0.45)',
  },
  {
    emoji: '✨',
    title: 'Первое сообщение',
    text: 'Скажи что знаешь о ней — AI напишет 3 варианта первого сообщения, которые не выглядят как «привет, как дела».',
    accent: 'rgba(236,72,153,0.55)',
    accent2: 'rgba(244,63,94,0.45)',
  },
  {
    emoji: '🛡️',
    title: 'Разбор отказа',
    text: 'Откатилось? Покажи переписку — AI разберёт где именно ты сорвался и какие принципы стоит запомнить.',
    accent: 'rgba(99,102,241,0.55)',
    accent2: 'rgba(59,130,246,0.45)',
  },
  {
    emoji: '📚',
    title: 'Теория и сообщество',
    text: 'Короткие принципы + ежедневный опрос + лента диалогов других ребят с разборами.',
    accent: 'rgba(168,85,247,0.55)',
    accent2: 'rgba(236,72,153,0.45)',
  },
];

export function TutorialScreen() {
  const nav = useNavigate();
  const { refresh } = useMe();
  useBackButton(() => nav(-1));

  const [idx, setIdx] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const isLast = idx === SLIDES.length - 1;
  const progress = ((idx + 1) / SLIDES.length) * 100;

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    impactHaptic('medium');
    try {
      await updateMe({ tutorial_done: true });
      await refresh();
    } catch (_) {
      // Игнорим — если бэк недоступен, всё равно даём пройти. При следующем
      // открытии туториал может повториться (но это не критично).
    }
    nav('/', { replace: true });
  };

  // Lock: блокируем повторные клики во время CSS-transition (280ms).
  // Без этого на медленных TG WebView один тап может зарегистрироваться
  // несколько раз → idx прыгает через все слайды → чёрный экран.
  const [locked, setLocked] = useState(false);
  const guard = (fn: () => void) => () => {
    if (locked || finishing) return;
    setLocked(true);
    fn();
    setTimeout(() => setLocked(false), 320);
  };

  const next = guard(() => {
    selectionHaptic();
    if (isLast) {
      finish();
    } else {
      // Math.min — двойная защита от перепрыгивания за пределы массива
      setIdx(i => Math.min(i + 1, SLIDES.length - 1));
    }
  });

  const back = guard(() => {
    if (idx === 0) return;
    selectionHaptic();
    setIdx(i => Math.max(i - 1, 0));
  });

  return (
    <div style={styles.container}>
      {/* Прогресс-бар сверху + Skip */}
      <div style={styles.topRow}>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
        <button onClick={finish} style={styles.skip} disabled={finishing}>
          Пропустить
        </button>
      </div>

      {/* Слайды — translate-X. clampedIdx защищает от чёрного экрана если
          где-то проскочит idx > SLIDES.length-1. */}
      <div style={styles.viewport}>
        <div
          style={{
            ...styles.track,
            transform: `translateX(-${Math.max(0, Math.min(idx, SLIDES.length - 1)) * (100 / SLIDES.length)}%)`,
            width: `${SLIDES.length * 100}%`,
          }}
        >
          {SLIDES.map((s, i) => (
            <SlideView key={i} slide={s} />
          ))}
        </div>
      </div>

      {/* Step counter */}
      <div style={styles.counter}>
        {idx + 1} / {SLIDES.length}
      </div>

      {/* Bottom actions */}
      <div style={styles.actions}>
        {idx > 0 ? (
          <SecondaryButton onClick={back} style={{ flex: 1 }}>
            Назад
          </SecondaryButton>
        ) : <div style={{ flex: 1 }} />}
        <div style={{ flex: 1.4 }}>
          <GradientButton full onClick={next} loading={finishing} disabled={finishing}>
            {isLast ? 'Начать' : 'Дальше'}
          </GradientButton>
        </div>
      </div>
    </div>
  );
}

function SlideView({ slide }: { slide: Slide }): ReactNode {
  return (
    <div style={styles.slide}>
      <div style={styles.heroWrap}>
        {/* Большой blur-круг под emoji */}
        <div
          style={{
            ...styles.blurCircle,
            background: `radial-gradient(circle at center, ${slide.accent} 0%, ${slide.accent2} 45%, transparent 70%)`,
          }}
        />
        <div style={styles.emoji}>{slide.emoji}</div>
      </div>

      <div style={styles.textBlock}>
        <h1 style={styles.title}>{slide.title}</h1>
        <p style={styles.text}>{slide.text}</p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 12px)',
    paddingBottom: 'calc(var(--safe-bottom) + 16px)',
    overflow: 'hidden',
  },

  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 20px',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: 'var(--bg-elevated)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--gradient-accent)',
    borderRadius: 2,
    transition: 'width 280ms ease',
  },
  skip: {
    fontSize: 13,
    color: 'var(--text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    flexShrink: 0,
  },

  viewport: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  track: {
    display: 'flex',
    height: '100%',
    transition: 'transform 280ms ease',
  },

  slide: {
    width: `${100 / 5}%`,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '24px 28px',
    boxSizing: 'border-box',
  },

  heroWrap: {
    position: 'relative',
    width: '100%',
    minHeight: 280,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  blurCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: '50%',
    filter: 'blur(40px)',
    opacity: 0.9,
    pointerEvents: 'none',
  },
  emoji: {
    fontSize: 88,
    lineHeight: 1,
    position: 'relative',
    zIndex: 2,
    filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.25))',
  },

  textBlock: {
    marginTop: 24,
    textAlign: 'center',
    maxWidth: 360,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  text: {
    margin: '14px 0 0',
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },

  counter: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-muted)',
    letterSpacing: 0.5,
    margin: '8px 0 16px',
  },

  actions: {
    display: 'flex',
    gap: 10,
    padding: '0 20px',
  },
};
