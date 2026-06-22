// ═══════════════════════════════════════════════════════════════
// DateScreen — «Свидание». Как себя вести на свидании (НЕ как позвать —
// это date_invite). Чипсы (цель / стадия / формат / бюджет) + «про неё» →
// POST /analysis/date-coach → персональный план: настрой, как одеться,
// о чём говорить, вопросы под неё, чего избегать, логистика, физика;
// для стадии «после» — разбор по ощущениям + второе свидание.
// Слабый интернет / офлайн → статичный плейбук (без AI).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import { useMe } from '../contexts/MeContext';
import { generateDatePlan, ApiError, type DatePlan } from '../api';

const GOAL   = ['отношения', 'флирт', 'общение', 'без обязательств'];
const STAGE  = ['планирую', 'после'];
const FORMAT = ['кафе', 'прогулка', 'бар', 'кино', 'активность', 'у неё/меня'];
const BUDGET = ['эконом', 'средне', 'не важно'];

// Статичный плейбук — мгновенно, без сети. Общие принципы из исследования.
const PLAYBOOK = {
  steps: [
    { t: 'Настрой', d: 'Не «прохожу ли кастинг», а «как мне рядом, хочу ли второй раз». Снизь ставки одной встречи. Тревога и предвкушение - одно и то же, назови это предвкушением.' },
    { t: 'Внешний вид', d: 'Сначала опрятность (душ, ногти, причёска), потом одежда. Посадка важнее бренда. Под место, не выше. В чём комфортно. Парфюм чуть-чуть.' },
    { t: 'Формат', d: 'Лучше активность со встроенным концом (прогулка, кофе+проход), чем ужин лицом-к-лицу. 30-90 минут. Дорого не нужно. Уйти на подъёме.' },
    { t: 'Разговор', d: 'Не интервью: делись о себе по чуть-чуть и слушай, развивая ЕЁ мысль. Открытые вопросы (что/как). Искренний интерес важнее «правильных» тем.' },
    { t: 'Не отпугнуть', d: 'Убери телефон. Без нужды и понтов. Физику веди по её сигналам, при любом отстранении - стоп. Намерения честные и считываемые.' },
    { t: 'После', d: 'Оценивай по ощущениям (энергия, смех, что услышали друг друга), а не по мгновенной искре. Второе свидание - норма. Не заваливай сообщениями.' },
  ],
  questions: [
    'что тебя по-настоящему заряжает вне работы?',
    'как ты вообще оказалась в этом деле/городе?',
    'что из последнего тебя приятно удивило?',
    'ты больше про спонтанность или про план?',
    'какое место в городе ты бы показала тому, кто хочет тебя понять?',
  ],
};

export function DateScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));
  const { me } = useMe();

  const [goal, setGoal] = useState('отношения');
  const [stage, setStage] = useState('планирую');
  const [format, setFormat] = useState('');
  const [budget, setBudget] = useState('эконом');
  const [details, setDetails] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<DatePlan | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);

  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const copyLine = (text: string, key: string) => async () => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
      setCopied(key);
      setTimeout(() => setCopied(prev => (prev === key ? null : prev)), 1400);
    } catch (_) {}
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!online) { setShowPlaybook(true); return; }
    impactHaptic('medium');
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await generateDatePlan({
        goal, stage, format, budget,
        details: details.trim().slice(0, 200),
        user_profile: me?.user_profile ?? null,
      });
      setPlan(res.plan);
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) { setLimitSheet('limit'); setLoading(false); return; }
      setError(e?.message || 'Не удалось собрать план. Попробуй ещё.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const resetToInput = () => { selectionHaptic(); setPlan(null); setError(null); };

  const chipRow = (label: string, options: string[], value: string, setValue: (v: string) => void, clearable = true) => (
    <div style={{ marginTop: 14 }}>
      <div style={styles.subLabel}>{label}</div>
      <div style={styles.tagsRow}>
        {options.map(o => (
          <Chip key={o} active={value === o} onClick={() => { selectionHaptic(); setValue(clearable && value === o ? '' : o); }}>
            {o}
          </Chip>
        ))}
      </div>
    </div>
  );

  const copyRow = (text: string, key: string) => (
    <div key={key} style={styles.responseItem}>
      <button onClick={copyLine(text, key)} style={styles.copyBtn} aria-label="Скопировать">
        {copied === key ? (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--status-positive)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12" /></svg>
        ) : (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}><rect x={9} y={9} width={13} height={13} rx={2} /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        )}
      </button>
      <p style={styles.responseText}>{text}</p>
    </div>
  );

  const sectionLabel = (text: string) => <div style={styles.sectionLabel}>{text}</div>;

  const bulletList = (label: string, items: string[], keyPrefix: string) => (
    items.length > 0 ? (
      <>
        {sectionLabel(label)}
        <Card style={styles.listCard}>
          {items.map((t, i) => (
            <div key={`${keyPrefix}-${i}`} style={styles.bulletRow}>
              <span style={styles.bulletDot}>•</span>
              <span style={styles.bulletText}>{t}</span>
            </div>
          ))}
        </Card>
      </>
    ) : null
  );

  // ─── Плейбук (офлайн / слабый сигнал) ───────────────────────────────────────
  if (showPlaybook) {
    return (
      <Layout>
        <div style={styles.container}>
          <h1 style={styles.h1}>Базовый плейбук</h1>
          <p style={styles.intro}>Работает без интернета. Когда будет сеть — соберу план под твою цель и эту девушку.</p>
          {PLAYBOOK.steps.map((s, i) => (
            <Card key={i} style={{ marginTop: 10, padding: '12px 14px' }}>
              <div style={styles.stepTitle}>{i + 1}. {s.t}</div>
              <div style={styles.stepBody}>{s.d}</div>
            </Card>
          ))}
          {sectionLabel('Вопросы, чтобы её разговорить')}
          {PLAYBOOK.questions.map((t, i) => copyRow(t, `pb-q-${i}`))}
          <div style={{ marginTop: 20 }}>
            <SecondaryButton onClick={() => { selectionHaptic(); setShowPlaybook(false); }}>Назад к описанию</SecondaryButton>
          </div>
        </div>
      </Layout>
    );
  }

  // ─── Результат: план ─────────────────────────────────────────────────────────
  if (plan) {
    const afterStage = plan.debrief.length > 0 || plan.next_steps.length > 0;
    return (
      <Layout>
        <div style={styles.container}>
          <h1 style={styles.h1}>{afterStage ? 'Разбор свидания' : 'План на свидание'}</h1>
          {plan.read && <p style={styles.intro}>{plan.read}</p>}

          {/* Стадия «планирую» */}
          {bulletList('Настрой', plan.mindset, 'ms')}
          {bulletList('Как одеться', plan.outfit, 'of')}
          {bulletList('О чём говорить', plan.topics, 'tp')}
          {plan.questions.length > 0 && (<>{sectionLabel('Вопросы под неё')}{plan.questions.map((t, i) => copyRow(t, `q-${i}`))}</>)}
          {bulletList('Чего избегать', plan.avoid, 'av')}
          {bulletList('Формат и логистика', plan.logistics, 'lg')}
          {plan.escalation && (<>{sectionLabel('Физика — только по её сигналам')}<p style={styles.tip}>{plan.escalation}</p></>)}

          {/* Стадия «после» */}
          {bulletList('Как оценить встречу', plan.debrief, 'db')}
          {bulletList('Что дальше', plan.next_steps, 'ns')}

          <div style={{ marginTop: 20 }}>
            <SecondaryButton onClick={resetToInput}>Другое свидание</SecondaryButton>
          </div>
        </div>
        <LimitReachedSheet open={limitSheet != null} reason={limitSheet || 'limit'} onClose={() => setLimitSheet(null)} />
      </Layout>
    );
  }

  // ─── Ввод ───────────────────────────────────────────────────────────────────
  const planning = stage !== 'после';
  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Свидание</h1>
        <p style={styles.intro}>Соберу план под твою цель и эту девушку: как настроиться, одеться, о чём говорить и чего не делать. Тапай, что подходит.</p>

        {chipRow('Цель', GOAL, goal, setGoal, false)}
        {chipRow('Стадия', STAGE, stage, setStage, false)}
        {planning && chipRow('Формат / где', FORMAT, format, setFormat)}
        {planning && chipRow('Бюджет', BUDGET, budget, setBudget, false)}

        <div style={{ marginTop: 14 }}>
          <div style={styles.subLabel}>Про неё / контекст (необязательно)</div>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value.slice(0, 200))}
            placeholder={planning ? 'что знаешь о ней, как познакомились, нюанс, город' : 'как прошло свидание, что было, что чувствуешь'}
            rows={3}
            maxLength={200}
            style={styles.input}
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <GradientButton full loading={loading} onClick={handleSubmit}>
            {loading ? 'Собираю план…' : online ? 'Собрать план' : 'Открыть базовый плейбук'}
          </GradientButton>
        </div>
        <button onClick={() => { selectionHaptic(); setShowPlaybook(true); }} style={styles.playbookLink}>
          {online ? 'слабый интернет? открыть базовый плейбук' : 'нет сети — базовый плейбук готов'}
        </button>

        {error && (
          <Card style={{ marginTop: 16, borderColor: 'var(--status-negative)' }}>
            <p style={{ margin: 0, color: 'var(--status-negative)', fontSize: 14 }}>{error}</p>
            <div style={{ marginTop: 12 }}><SecondaryButton onClick={handleSubmit}>Попробовать ещё</SecondaryButton></div>
          </Card>
        )}
      </div>
      <LimitReachedSheet open={limitSheet != null} reason={limitSheet || 'limit'} onClose={() => setLimitSheet(null)} />
    </Layout>
  );
}

const styles: Record<string, CSSProperties> = {
  container:  { padding: '24px 20px' },
  h1:         { margin: 0, fontSize: 24, fontWeight: 700 },
  intro:      { marginTop: 8, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 },
  subLabel:   { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 },
  tagsRow:    { display: 'flex', flexWrap: 'wrap', gap: 8 },
  input:      { width: '100%', boxSizing: 'border-box', resize: 'none', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.4, fontFamily: 'inherit', outline: 'none' },
  playbookLink: {
    display: 'block', width: '100%', marginTop: 10,
    background: 'transparent', border: 0, cursor: 'pointer',
    color: 'var(--text-accent)', fontSize: 12, textAlign: 'center',
  },
  sectionLabel: { marginTop: 18, marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  stepTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  stepBody: { marginTop: 4, fontSize: 14, lineHeight: '20px', color: 'var(--text-secondary)' },
  tip: { margin: '4px 2px 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: '21px' },
  listCard: { padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  bulletRow: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  bulletDot: { color: 'var(--text-accent)', fontSize: 15, lineHeight: '21px', flexShrink: 0 },
  bulletText: { fontSize: 14, lineHeight: '21px', color: 'var(--text-primary)' },
  responseItem: {
    position: 'relative', marginTop: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, padding: 12, paddingRight: 36,
  },
  copyBtn: { position: 'absolute', top: 10, right: 10, padding: 4, background: 'transparent', cursor: 'pointer', border: 0 },
  responseText: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-primary)' },
};
