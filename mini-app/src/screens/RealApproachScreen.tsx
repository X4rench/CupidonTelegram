// ═══════════════════════════════════════════════════════════════
// RealApproachScreen — «Реальное знакомство». Подход к девушке вживую.
// Ввод-чипсы (где/с кем/что делает/сидит-уходит/вайб/взгляд) → POST
// /analysis/real-approach → адаптивный сценарий (дерево): настрой, взгляд,
// ветки по её реакции (включилась/сдержанно/закрылась) с заходами, взять
// контакт, выйти красиво. Два вида: пошагово / быстро (она уходит).
// Слабый интернет / офлайн → мгновенный статичный плейбук (без AI).
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
import { generateRealApproach, ApiError, type RealApproachScenario } from '../api';

const WHERE    = ['кафе', 'улица', 'транспорт', 'зал', 'ТЦ', 'парк'];
const COMPANY  = ['одна', 'с подругой', 'компания', 'с собакой'];
const DOING    = ['в телефоне', 'пьёт кофе', 'ждёт кого-то', 'идёт мимо', 'отдыхает', 'работает'];
const POSITION = ['сидит', 'уходит'];
const VIBE     = ['спортивная', 'гламур', 'скромная', 'деловая', 'творческая'];
const EYE      = ['она смотрела', 'переглянулись', 'нет'];
const GOAL     = ['свидание', 'флирт', 'общение', 'практика'];

type BranchKey = 'in' | 'neutral' | 'closed';
const BRANCHES: { key: BranchKey; label: string; hint: string; color: string }[] = [
  { key: 'in',      label: 'Включилась', hint: 'улыбнулась, держит взгляд', color: 'var(--status-positive)' },
  { key: 'neutral', label: 'Сдержанно',  hint: 'нейтрально, прощупывает',   color: 'var(--status-warning)' },
  { key: 'closed',  label: 'Закрылась',  hint: 'отвела, напряглась',        color: 'var(--status-negative)' },
];

// Статичный плейбук — мгновенно, без сети (слабый сигнал). Из отобранного вкуса.
const PLAYBOOK = {
  steps: [
    { t: 'Настройся', d: 'Выдохни, расправь плечи, не спеши. Ты просто хочешь познакомиться — это нормально.' },
    { t: 'Взгляд', d: 'Поймай её взгляд, держи 1-2 секунды, легко улыбнись, отведи первым. Не пялься.' },
    { t: 'Подойди', d: 'Спокойно, сбоку или спереди, на расстоянии вытянутой руки. Не нависай, руки видны.' },
    { t: 'Скажи', d: 'Коротко и по-человечески: тёплый-прямой заход, наблюдение или лёгкая игра. Без надменности.' },
    { t: 'Поговори чуть', d: 'Если завязалось — пара минут лёгкого разговора по ситуации (собака, кофе, вайб), поймай искру. Коротко, не интервью.' },
    { t: 'Возьми контакт', d: 'На высокой ноте: «мне пора, но было бы здорово увидеться - давай номер». Веди, не выпрашивай. Закрылась — один тёплый заход и достойно выйди.' },
  ],
  openers: [
    'привет. увидел тебя и решил подойти - так лучше, чем потом жалеть',
    'у тебя кофе небось уже остыл, а ты и не заметила. в телефоне интереснее чем тут?',
    'у меня к тебе спор: ставлю, что не угадаешь, зачем я подошёл',
    'привет) ты улыбнулась, когда я посмотрел, и я решил подойти',
    'репетировал заход, но всё забыл. так что просто привет',
  ],
  contact: [
    'ты слишком интересная, чтобы просто разойтись. телега есть?',
    'давай так: телега, и я напишу что-то, после чего ты улыбнёшься',
  ],
  push: [
    'я и не знакомлюсь обычно) подошёл сказать одно и уйти - на это есть 10 секунд?',
    'расслабься, замуж не зову. просто стоять рядом и молчать было бы глупо',
    'честно? ждал, что отошьёшь. но было бы тупо не попробовать',
  ],
  exit: [
    'ладно, не буду красть твоё время. рад, что подошёл',
    'всё, ухожу, пока не начал нравиться слишком сильно)',
    'понял, не моё время) хорошего дня',
  ],
};

export function RealApproachScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));
  const { me } = useMe();

  const [where, setWhere] = useState('');
  const [company, setCompany] = useState('');
  const [doing, setDoing] = useState('');
  const [position, setPosition] = useState('');
  const [vibe, setVibe] = useState('');
  const [eye, setEye] = useState('');
  const [goal, setGoal] = useState('свидание');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<RealApproachScenario | null>(null);
  const [view, setView] = useState<'steps' | 'quick'>('steps');
  const [branch, setBranch] = useState<BranchKey | null>(null);
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
    setScenario(null);
    setBranch(null);
    try {
      const res = await generateRealApproach({
        where, company, doing, position, vibe, eye_contact: eye, goal,
        user_profile: me?.user_profile ?? null,
      });
      setScenario(res.scenario);
      setView(position === 'уходит' ? 'quick' : 'steps');
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) { setLimitSheet('limit'); setLoading(false); return; }
      setError(e?.message || 'Не удалось собрать сценарий. Попробуй ещё.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const resetToInput = () => { selectionHaptic(); setScenario(null); setBranch(null); setError(null); };

  const chipRow = (label: string, options: string[], value: string, setValue: (v: string) => void) => (
    <div style={{ marginTop: 14 }}>
      <div style={styles.subLabel}>{label}</div>
      <div style={styles.tagsRow}>
        {options.map(o => (
          <Chip key={o} active={value === o} onClick={() => { selectionHaptic(); setValue(value === o ? '' : o); }}>
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

  // ─── Плейбук (офлайн / слабый сигнал) ───────────────────────────────────────
  if (showPlaybook) {
    return (
      <Layout>
        <div style={styles.container}>
          <h1 style={styles.h1}>Базовый плейбук</h1>
          <p style={styles.intro}>Работает без интернета. Когда будет сеть — собери план под конкретную девушку.</p>
          {PLAYBOOK.steps.map((s, i) => (
            <Card key={i} style={{ marginTop: 10, padding: '12px 14px' }}>
              <div style={styles.stepTitle}>{i + 1}. {s.t}</div>
              <div style={styles.stepBody}>{s.d}</div>
            </Card>
          ))}
          {sectionLabel('Заходы')}
          {PLAYBOOK.openers.map((t, i) => copyRow(t, `pb-o-${i}`))}
          {sectionLabel('Если теплеет — взять контакт')}
          {PLAYBOOK.contact.map((t, i) => copyRow(t, `pb-c-${i}`))}
          {sectionLabel('Если отшивает — дожать (1 раз)')}
          {PLAYBOOK.push.map((t, i) => copyRow(t, `pb-p-${i}`))}
          {sectionLabel('Если глухо — выйти достойно')}
          {PLAYBOOK.exit.map((t, i) => copyRow(t, `pb-e-${i}`))}
          <div style={{ marginTop: 20 }}>
            <SecondaryButton onClick={() => { selectionHaptic(); setShowPlaybook(false); }}>Назад к описанию</SecondaryButton>
          </div>
        </div>
      </Layout>
    );
  }

  // ─── Результат: сценарий ────────────────────────────────────────────────────
  if (scenario) {
    const br = branch ? scenario.branches[branch] : null;
    return (
      <Layout>
        <div style={styles.container}>
          <div style={styles.resultsHeader}>
            <h1 style={styles.h1}>Сценарий</h1>
            <div style={styles.toggle}>
              <button onClick={() => { selectionHaptic(); setView('steps'); }} style={{ ...styles.toggleBtn, ...(view === 'steps' ? styles.toggleOn : {}) }}>пошагово</button>
              <button onClick={() => { selectionHaptic(); setView('quick'); }} style={{ ...styles.toggleBtn, ...(view === 'quick' ? styles.toggleOn : {}) }}>быстро</button>
            </div>
          </div>
          {scenario.read && <p style={styles.intro}>{scenario.read}</p>}

          {view === 'quick' ? (
            <>
              {sectionLabel('Если времени нет / она уходит')}
              {scenario.quick?.opener && copyRow(scenario.quick.opener, 'q-op')}
              {scenario.quick?.next && <p style={styles.tip}>дальше: {scenario.quick.next}</p>}
              {scenario.quick?.contact && (<>{sectionLabel('Сразу взять контакт')}{copyRow(scenario.quick.contact, 'q-gc')}</>)}
            </>
          ) : (
            <>
              {scenario.prep && (<Card style={styles.stepCard}><div style={styles.stepTitle}>1. Настройся</div><div style={styles.stepBody}>{scenario.prep}</div></Card>)}
              {scenario.eye_contact && (<Card style={styles.stepCard}><div style={styles.stepTitle}>2. Взгляд</div><div style={styles.stepBody}>{scenario.eye_contact}</div></Card>)}

              <Card style={styles.stepCard}>
                <div style={styles.stepTitle}>3. Как она реагирует?</div>
                <div style={styles.branchRow}>
                  {BRANCHES.map(b => (
                    <button key={b.key} onClick={() => { selectionHaptic(); setBranch(b.key); }}
                      style={{ ...styles.branchBtn, ...(branch === b.key ? { borderColor: b.color, background: 'var(--bg-elevated)' } : {}) }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: branch === b.key ? b.color : 'var(--text-primary)' }}>{b.label}</span>
                      <span style={styles.branchHint}>{b.hint}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {br && (
                <>
                  {sectionLabel('4. Что сказать')}
                  {br.openers.map((t, i) => copyRow(t, `op-${branch}-${i}`))}
                  {br.behavior && <p style={styles.tip}>как держаться: {br.behavior}</p>}
                  {branch !== 'closed' && scenario.talk.length > 0 && (<>{sectionLabel('Если завязалось — короткий разговор → потом номер')}{scenario.talk.map((t, i) => copyRow(t, `talk-${i}`))}</>)}
                  {br.get_contact.length > 0 && (<>{sectionLabel('Если теплеет — взять контакт')}{br.get_contact.map((t, i) => copyRow(t, `gc-${branch}-${i}`))}</>)}
                  {br.push.length > 0 && (<>{sectionLabel('Если отшивает — дожать (1 раз)')}{br.push.map((t, i) => copyRow(t, `pu-${branch}-${i}`))}</>)}
                  {br.exit.length > 0 && (<>{sectionLabel('Если глухо — выйти достойно')}{br.exit.map((t, i) => copyRow(t, `ex-${branch}-${i}`))}</>)}
                </>
              )}
            </>
          )}

          <div style={{ marginTop: 20 }}>
            <SecondaryButton onClick={resetToInput}>Другая ситуация</SecondaryButton>
          </div>
        </div>
        <LimitReachedSheet open={limitSheet != null} reason={limitSheet || 'limit'} onClose={() => setLimitSheet(null)} />
      </Layout>
    );
  }

  // ─── Ввод ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Реальное знакомство</h1>
        <p style={styles.intro}>Опиши, кого видишь — соберу заход под ситуацию и её реакцию. Тапай, что подходит (можно не всё).</p>

        {chipRow('Где', WHERE, where, setWhere)}
        {chipRow('Одна или с кем', COMPANY, company, setCompany)}
        {chipRow('Что делает', DOING, doing, setDoing)}
        {chipRow('Сейчас', POSITION, position, setPosition)}
        {chipRow('Вайб', VIBE, vibe, setVibe)}
        {chipRow('Контакт глазами', EYE, eye, setEye)}
        {chipRow('Зачем (цель)', GOAL, goal, setGoal)}

        <div style={{ marginTop: 20 }}>
          <GradientButton full loading={loading} onClick={handleSubmit}>
            {loading ? 'Собираю план…' : online ? 'Составить план' : 'Открыть базовый плейбук'}
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
  playbookLink: {
    display: 'block', width: '100%', marginTop: 10,
    background: 'transparent', border: 0, cursor: 'pointer',
    color: 'var(--text-accent)', fontSize: 12, textAlign: 'center',
  },
  resultsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  toggle: { display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: 999, overflow: 'hidden', flexShrink: 0 },
  toggleBtn: { padding: '5px 12px', fontSize: 12, background: 'transparent', border: 0, color: 'var(--text-secondary)', cursor: 'pointer' },
  toggleOn: { background: 'var(--accent-primary)', color: '#fff' },
  sectionLabel: { marginTop: 18, marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  stepCard: { marginTop: 10, padding: '12px 14px' },
  stepTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  stepBody: { marginTop: 4, fontSize: 14, lineHeight: '20px', color: 'var(--text-secondary)' },
  branchRow: { display: 'flex', gap: 6, marginTop: 10 },
  branchBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
    padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
    border: '1px solid var(--border-subtle)', background: 'transparent', textAlign: 'left',
  },
  branchHint: { fontSize: 10, color: 'var(--text-muted)', lineHeight: '13px' },
  tip: { margin: '8px 2px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: '17px' },
  responseItem: {
    position: 'relative', marginTop: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, padding: 12, paddingRight: 36,
  },
  copyBtn: { position: 'absolute', top: 10, right: 10, padding: 4, background: 'transparent', cursor: 'pointer', border: 0 },
  responseText: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-primary)' },
};
