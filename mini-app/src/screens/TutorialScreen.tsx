// ═══════════════════════════════════════════════════════════════
// TutorialScreen — пошаговый туториал по фичам приложения.
// 5 слайдов с описанием инструментов + CTA «Попробовать» → нужный экран.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic } from '../utils/haptics';

interface Slide {
  emoji: string;
  title: string;
  text: string;
  cta: string;
  to: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '🎯',
    title: 'Стрела — анализ переписки',
    text: 'Вставь свой чат с ней — AI скажет где ты теряешь интерес, какой её тип, и даст 9 вариантов ответа.',
    cta: 'Открыть Стрелу',
    to: '/wing',
  },
  {
    emoji: '💬',
    title: 'Симулятор знакомства',
    text: 'Выбери типаж и место — AI отыграет роль девушки, ты тренируешься в безопасной среде. В конце — разбор где ты молодец и где зашёл слишком далеко.',
    cta: 'Попробовать симулятор',
    to: '/simulator',
  },
  {
    emoji: '✨',
    title: 'Первое сообщение',
    text: 'Скажи что знаешь о ней — AI напишет 3 варианта первого сообщения которые не выглядят как «привет, как дела».',
    cta: 'Сгенерировать',
    to: '/first-message',
  },
  {
    emoji: '🛡️',
    title: 'Разбор отказа',
    text: 'Откатилось? Покажи переписку — AI разберёт где именно ты сорвался и какие принципы стоит запомнить.',
    cta: 'Открыть разбор',
    to: '/rejection',
  },
  {
    emoji: '📚',
    title: 'Теория и сообщество',
    text: 'Карточки с короткими принципами + ежедневный опрос + лента диалогов других ребят с разборами.',
    cta: 'Перейти в Теорию',
    to: '/theory',
  },
];

export function TutorialScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  const next = () => {
    selectionHaptic();
    if (isLast) {
      nav('/', { replace: true });
    } else {
      setIdx(i => i + 1);
    }
  };

  const back = () => {
    selectionHaptic();
    if (idx === 0) {
      nav(-1);
    } else {
      setIdx(i => i - 1);
    }
  };

  const tryIt = () => {
    nav(slide.to);
  };

  return (
    <Layout>
      <div style={styles.container}>
        <div style={styles.skipRow}>
          <button onClick={() => nav('/', { replace: true })} style={styles.skip}>
            Пропустить
          </button>
        </div>

        <div style={styles.slide}>
          <div style={styles.emoji}>{slide.emoji}</div>
          <h1 style={styles.title}>{slide.title}</h1>
          <p style={styles.text}>{slide.text}</p>
        </div>

        <div style={styles.dots}>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              onClick={() => { selectionHaptic(); setIdx(i); }}
              style={{
                ...styles.dot,
                background: i === idx ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                width: i === idx ? 22 : 8,
              }}
            />
          ))}
        </div>

        <div style={styles.actions}>
          <GradientButton full onClick={tryIt}>{slide.cta}</GradientButton>
          <div style={styles.navRow}>
            <SecondaryButton onClick={back} style={{ flex: 1 }}>
              {idx === 0 ? 'Назад' : '← Предыдущий'}
            </SecondaryButton>
            <SecondaryButton onClick={next} style={{ flex: 1 }}>
              {isLast ? 'Готово' : 'Следующий →'}
            </SecondaryButton>
          </div>
        </div>
      </div>
    </Layout>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: '24px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  skipRow:   { display: 'flex', justifyContent: 'flex-end' },
  skip:      { padding: 8, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' },
  slide:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 0' },
  emoji:     { fontSize: 64, marginBottom: 24 },
  title:     { margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.2 },
  text:      { margin: '16px 0 0', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 320 },
  dots:      { display: 'flex', justifyContent: 'center', gap: 8, margin: '24px 0' },
  dot:       { height: 8, borderRadius: 4, transition: 'all 0.25s ease', cursor: 'pointer' },
  actions:   { display: 'flex', flexDirection: 'column', gap: 10 },
  navRow:    { display: 'flex', gap: 10 },
};
