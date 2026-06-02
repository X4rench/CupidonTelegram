// ═══════════════════════════════════════════════════════════════
// QuestionnaireForm — переиспользуемая форма анкеты.
// Используется в QuestionnaireScreen (онбординг) и EditProfileScreen.
//
// Структура:
//   1. Имя
//   2. Возраст
//   3. Опыт (карточки)
//   4. Платформы для знакомств (чипы, multi-select)
//
// Mode 'onboarding' — пошаговый wizard. Mode 'edit' — все поля сразу.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import type { UserProfile } from '../api';
import { selectionHaptic } from '../utils/haptics';

const AGES = ['15–17', '18–21', '22–25', '26–30', '30+'];

const EXPERIENCES = [
  { icon: 'shield', label: 'Новичок',  sub: 'Не знаю с чего начать' },
  { icon: 'bolt',   label: 'Есть опыт', sub: 'Хочу стать лучше' },
  { icon: 'target', label: 'Уверенный', sub: 'Ищу тонкие приёмы' },
];

const PLATFORMS = ['Twinby', 'Mamba', 'Pure', 'VK', 'Telegram', 'Instagram', 'Вживую', 'Другое'];

export interface QFormValues {
  name: string;
  age: string;
  experience: string;
  platforms: string[];
}

interface CommonProps {
  initial?: Partial<UserProfile>;
  onSubmit: (values: QFormValues) => Promise<void> | void;
  submitLabel?: string;
  saving?: boolean;
}

export function QuestionnaireForm({
  initial,
  onSubmit,
  mode,
  saving,
  submitLabel,
  onSkip,
}: CommonProps & {
  mode: 'onboarding' | 'edit';
  onSkip?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [age, setAge] = useState<string>(initial?.age ?? '18–21');
  const [experience, setExperience] = useState<number>(() => {
    const idx = EXPERIENCES.findIndex(e => e.label === initial?.experience);
    return idx >= 0 ? idx : 0;
  });
  const [platforms, setPlatforms] = useState<string[]>(initial?.platforms ?? ['Twinby', 'VK']);

  const togglePlatform = (p: string) => {
    selectionHaptic();
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const collect = (): QFormValues => ({
    name: name.trim(),
    age,
    experience: EXPERIENCES[experience].label,
    platforms,
  });

  if (mode === 'edit') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Имя">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Как тебя зовут?"
            style={inputStyle}
          />
        </Field>

        <Field label="Возраст">
          <div style={chipRowStyle}>
            {AGES.map(a => (
              <Chip key={a} active={age === a} onClick={() => { selectionHaptic(); setAge(a); }}>{a}</Chip>
            ))}
          </div>
        </Field>

        <Field label="Опыт">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {EXPERIENCES.map((exp, i) => (
              <ExpRow
                key={i}
                exp={exp}
                active={experience === i}
                onClick={() => { selectionHaptic(); setExperience(i); }}
              />
            ))}
          </div>
        </Field>

        <Field label="Где знакомишься">
          <div style={chipRowStyle}>
            {PLATFORMS.map(p => (
              <Chip key={p} active={platforms.includes(p)} onClick={() => togglePlatform(p)}>{p}</Chip>
            ))}
          </div>
        </Field>

        <GradientButton full loading={saving} onClick={() => onSubmit(collect())}>
          {submitLabel ?? 'Сохранить'}
        </GradientButton>
      </div>
    );
  }

  // mode === 'onboarding' — wizard
  const totalSteps = 4;
  const nextStep = () => {
    if (step < totalSteps) {
      selectionHaptic();
      setStep(step + 1);
    } else {
      onSubmit(collect());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Header: progress + step label */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Шаг {step} из {totalSteps}
          </span>
          {onSkip && (
            <button
              onClick={() => { selectionHaptic(); onSkip(); }}
              style={{ fontSize: 14, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
            >
              Пропустить
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= step ? 'var(--accent-primary)' : 'var(--border-default)',
                transition: 'background 220ms ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {step === 1 && (
          <>
            <h2 style={stepTitle}>Как тебя зовут?</h2>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Имя"
              style={inputStyleStandalone}
              autoFocus
            />
            <GradientButton full onClick={nextStep}>Далее</GradientButton>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={stepTitle}>Сколько тебе лет?</h2>
            <div style={chipRowStyle}>
              {AGES.map(a => (
                <Chip key={a} active={age === a} onClick={() => { selectionHaptic(); setAge(a); }}>{a}</Chip>
              ))}
            </div>
            <GradientButton full onClick={nextStep}>Далее</GradientButton>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={stepTitle}>Твой опыт в знакомствах</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {EXPERIENCES.map((exp, i) => (
                <ExpRow
                  key={i}
                  exp={exp}
                  active={experience === i}
                  onClick={() => { selectionHaptic(); setExperience(i); }}
                />
              ))}
            </div>
            <GradientButton full onClick={nextStep}>Далее</GradientButton>
          </>
        )}

        {step === 4 && (
          <>
            <h2 style={stepTitle}>Где обычно знакомишься?</h2>
            <div style={chipRowStyle}>
              {PLATFORMS.map(p => (
                <Chip key={p} active={platforms.includes(p)} onClick={() => togglePlatform(p)}>{p}</Chip>
              ))}
            </div>
            <GradientButton full loading={saving} onClick={nextStep}>
              {submitLabel ?? 'Готово'}
            </GradientButton>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</div>
      {children}
    </div>
  );
}

function ExpRow({ exp, active, onClick }: { exp: typeof EXPERIENCES[number]; active: boolean; onClick: () => void }) {
  const color = active ? 'var(--accent-primary)' : 'var(--text-secondary)';
  return (
    <Card
      accent={active}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        background: active ? 'var(--accent-soft)' : 'var(--bg-card)',
      }}
    >
      <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
        {exp.icon === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
        {exp.icon === 'bolt'   && <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />}
        {exp.icon === 'target' && (<>
          <circle cx={12} cy={12} r={10} />
          <circle cx={12} cy={12} r={6} />
          <circle cx={12} cy={12} r={2} />
        </>)}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{exp.label}</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{exp.sub}</span>
      </div>
    </Card>
  );
}

const stepTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: 0,
};

const inputStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  padding: '14px 16px',
  width: '100%',
};

const inputStyleStandalone: CSSProperties = {
  ...inputStyle,
  background: 'var(--bg-card)',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};
