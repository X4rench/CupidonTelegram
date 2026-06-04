// ═══════════════════════════════════════════════════════════════
// SimulatorScreen — выбор параметров тренировки чата с AI:
//   • Типаж (15 встроенных + кастомные из storage @custom_girls)
//   • Место (Twinby/Mamba/Pure/VK/Instagram + локальные + custom)
//   • Сложность (1..10 — слайдер)
//   • Кнопка «Начать диалог» → /simulator/start → nav в чат
// + список незавершённых сессий внизу (из storage по ключу sim_session_*)
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { DifficultySlider } from '../components/DifficultySlider';
import { startSimulator, ApiError } from '../api';
import { storage } from '../utils/storage';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import {
  TYPAZHES_SIM,
  PLACES_DEFAULT,
  CUSTOM_PLACE_ID,
  cleanTypazhName,
  type SimTypazh,
} from '../utils/typazhes';
import { loadCustomGirls, removeCustomGirl, type CustomGirl } from '../utils/customGirls';

interface SavedSimSession {
  session_id: string;
  messages: { from: 'me' | 'her'; text: string }[];
  difficulty?: number;
  typazh?: string;
  place?: string;
}

export function SimulatorScreen() {
  const nav = useNavigate();

  const [customGirls, setCustomGirls] = useState<CustomGirl[]>([]);
  const [selectedTypeIdx, setSelectedTypeIdx] = useState(0);
  const [selectedPlace, setSelectedPlace] = useState<string>('Twinby');
  const [customPlace, setCustomPlace] = useState('');
  const [difficulty, setDifficulty] = useState(3);
  const [starting, setStarting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    setCustomGirls(loadCustomGirls());
  }, []);

  const allTypes: (SimTypazh | (CustomGirl & { isCustom: true }))[] = useMemo(() => {
    return [
      ...TYPAZHES_SIM,
      ...customGirls.map(g => ({ ...g, isCustom: true as const })),
    ];
  }, [customGirls]);

  const selectedType = allTypes[selectedTypeIdx] ?? allTypes[0];
  const isCustomPlace = selectedPlace === CUSTOM_PLACE_ID;
  const finalPlace = isCustomPlace ? (customPlace.trim() || 'другое место') : selectedPlace;

  // Список незавершённых сессий
  const [savedSessions, setSavedSessions] = useState<{ key: string; typazh: string; place: string; lastMsg: string; difficulty?: number; sessionId: string }[]>([]);
  useEffect(() => {
    const out: typeof savedSessions = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const match = /^cupidon:[^:]+:sim_session_(.+)$/.exec(k);
      if (!match) continue;
      const suffix = match[1];
      const underIdx = suffix.indexOf('_');
      const typazhRaw = underIdx > 0 ? suffix.slice(0, underIdx) : suffix;
      const place = underIdx > 0 ? suffix.slice(underIdx + 1) : '';
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const data = JSON.parse(raw) as SavedSimSession;
        const msgs = data.messages || [];
        if (!msgs.length) continue;
        const lastHer = [...msgs].reverse().find(m => m.from === 'her');
        // Имя: предпочитаем data.typazh (правильно при свежем сохранении),
        // fallback на префикс ключа. Чистим от лидирующих цифр/мусора.
        const typazh = cleanTypazhName(data.typazh || typazhRaw);
        out.push({
          key: `sim_session_${suffix}`,
          typazh,
          place,
          lastMsg: lastHer?.text || msgs[msgs.length - 1]?.text || '',
          difficulty: data.difficulty,
          sessionId: data.session_id,
        });
      } catch (_) {}
    }
    setSavedSessions(out.slice(0, 5));
  }, []);

  const deleteCustomGirl = (girlId: string) => {
    impactHaptic('medium');
    setCustomGirls(removeCustomGirl(girlId));
    if (selectedTypeIdx >= TYPAZHES_SIM.length) setSelectedTypeIdx(0);
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setErrMsg(null);
    try {
      const isCustom = selectedTypeIdx >= TYPAZHES_SIM.length;
      const typazhKey = isCustom
        ? (selectedType as CustomGirl & { isCustom: true }).typazh || (selectedType as any).name
        : (selectedType as SimTypazh).name;

      const res = await startSimulator({ typazh: typazhKey, place: finalPlace, difficulty });
      notificationHaptic('success');

      // Сохраним стартовые параметры в storage — экран чата подхватит
      const key = `sim_session_${typazhKey}_${finalPlace}`;
      storage.set(key, {
        session_id: res.session_id,
        messages: res.opening_message ? [{ from: 'her', text: res.opening_message }] : [],
        difficulty,
        typazh: typazhKey,
        place: finalPlace,
        type_color: (selectedType as SimTypazh).color || 'rgba(168,85,247',
      });

      nav(`/simulator/chat/${encodeURIComponent(res.session_id)}?key=${encodeURIComponent(key)}`);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429 && e.code === 'LIMIT_EXCEEDED') {
        nav('/paywall');
        return;
      }
      setErrMsg(e?.message || 'Не удалось стартовать симуляцию');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Layout withTabBar>
      <div style={{ padding: '24px 16px 0' }}>
        <h1 style={styles.title}>Симулятор</h1>

        {/* Типаж */}
        <Section title="Выбери типаж">
          <div style={styles.typesScroll}>
            {/* Карточка добавления своей девушки — всегда первая в скролле */}
            <button
              onClick={() => { impactHaptic('light'); nav('/create-girl'); }}
              style={{
                ...styles.typeCard,
                borderStyle: 'dashed',
                borderColor: 'var(--border-accent)',
                background: 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(168,85,247,0.08))',
              }}
              aria-label="Добавить свою девушку"
            >
              <div style={{
                ...styles.typeAvatar,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={36} height={36} viewBox="0 0 24 24" fill="none"
                  stroke="var(--text-accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={12} cy={12} r={10} />
                  <line x1={12} y1={8}  x2={12} y2={16} />
                  <line x1={8}  y1={12} x2={16} y2={12} />
                </svg>
              </div>
              <div style={{ ...styles.typeName, color: 'var(--text-accent)' }}>Своя</div>
              <div style={styles.typeSub}>Создать новую</div>
            </button>

            {allTypes.map((t, i) => {
              const sel = i === selectedTypeIdx;
              const isCustom = i >= TYPAZHES_SIM.length;
              const color = (t as SimTypazh).color || 'rgba(236,72,153';
              return (
                <button
                  key={i}
                  onClick={() => { impactHaptic('light'); setSelectedTypeIdx(i); }}
                  style={{
                    ...styles.typeCard,
                    borderColor: sel ? 'var(--border-accent)' : 'var(--border-subtle)',
                    background: sel ? `${color},0.08)` : 'var(--bg-card)',
                  }}
                >
                  <div style={styles.typeAvatar}>
                    <svg width={36} height={48} viewBox="0 0 48 64">
                      <ellipse cx={24} cy={20} rx={12} ry={14} fill={`${color},0.3)`} stroke={`${color},0.5)`} strokeWidth={1.5} />
                      <ellipse cx={24} cy={50} rx={16} ry={14} fill={`${color},0.2)`} stroke={`${color},0.5)`} strokeWidth={1.5} />
                    </svg>
                  </div>
                  <div style={styles.typeName}>{(t as any).name}</div>
                  <div style={styles.typeSub}>{(t as SimTypazh).sub || (t as CustomGirl).typazh || 'AI-девушка'}</div>
                  {isCustom && (
                    <>
                      <div style={styles.customBadge}>своя</div>
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm(`Удалить "${(t as any).name}"?`)) deleteCustomGirl((t as CustomGirl).id); }}
                        style={styles.deleteBtn}
                        aria-label="Удалить"
                      >
                        ×
                      </button>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Место */}
        <Section title="Где знакомитесь">
          <div style={styles.chips}>
            {PLACES_DEFAULT.map(p => (
              <Chip key={p.id} active={selectedPlace === p.id} onClick={() => { impactHaptic('light'); setSelectedPlace(p.id); }}>
                {p.label}
              </Chip>
            ))}
          </div>
          {isCustomPlace && (
            <input
              value={customPlace}
              onChange={e => setCustomPlace(e.target.value)}
              maxLength={50}
              placeholder="Где познакомились? (концерт, парк, метро…)"
              style={styles.placeInput}
            />
          )}
        </Section>

        {/* Сложность */}
        <Section title="Сложность">
          <DifficultySlider value={difficulty} onChange={setDifficulty} min={1} max={10} />
        </Section>

        {errMsg && (
          <Card style={{ marginTop: 8, borderColor: 'var(--status-negative)' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--status-negative)' }}>{errMsg}</p>
          </Card>
        )}

        <div style={{ marginTop: 16 }}>
          <GradientButton onClick={start} loading={starting} disabled={starting} full>
            Начать диалог
          </GradientButton>
        </div>

        {savedSessions.length > 0 && (
          <Section title="Незавершённые">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedSessions.map(s => (
                <Card
                  key={s.key}
                  onClick={() => nav(`/simulator/chat/${encodeURIComponent(s.sessionId)}?key=${encodeURIComponent(s.key)}`)}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {s.typazh} {s.place ? `• ${s.place}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.lastMsg}
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        )}

        <div style={{ height: 24 }} />
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
  sectionTitle: { margin: '0 0 10px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },

  typesScroll: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    paddingBottom: 4,
  },
  typeCard: {
    position: 'relative',
    flexShrink: 0,
    minWidth: 120,
    padding: 14,
    borderRadius: 16,
    border: '1px solid',
    background: 'var(--bg-card)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  typeAvatar: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  typeName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' },
  typeSub: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' },
  customBadge: {
    marginTop: 2,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-accent)',
    background: 'var(--accent-soft)',
    borderRadius: 8,
  },
  deleteBtn: {
    position: 'absolute',
    top: 6, right: 6,
    width: 20, height: 20,
    borderRadius: '50%',
    background: 'rgba(239,68,68,0.2)',
    color: '#fff',
    fontSize: 14,
    lineHeight: '18px',
    fontWeight: 700,
    cursor: 'pointer',
  },

  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },

  placeInput: {
    marginTop: 12,
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    color: 'var(--text-primary)',
    outline: 0,
  },

};
