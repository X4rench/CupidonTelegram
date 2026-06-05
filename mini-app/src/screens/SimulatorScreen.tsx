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
import { pickGirlName } from '../utils/girlNames';

interface SavedSimSession {
  session_id: string;
  messages: { from: 'me' | 'her'; text: string }[];
  difficulty?: number;
  typazh?: string;
  place?: string;
  /** Имя девушки (для нескольких сессий с одним типажом). */
  girl_name?: string;
}

interface ExistingSimInfo {
  storageKey: string;       // 'sim_session_<...>'
  sessionId: string;
  girlName: string | null;
  lastMessage: string;
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
  const [savedSessions, setSavedSessions] = useState<{ key: string; typazh: string; place: string; lastMsg: string; difficulty?: number; sessionId: string; girlName?: string }[]>([]);
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
          girlName: data.girl_name,
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

  // Модалка «у тебя уже есть диалог»
  const [existingDialog, setExistingDialog] = useState<ExistingSimInfo | null>(null);

  /** Найти активную сессию с тем же типажом. Возвращает первую совпавшую. */
  const findExistingSession = (typazhKey: string): ExistingSimInfo | null => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const m = /^cupidon:[^:]+:sim_session_(.+)$/.exec(k);
      if (!m) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const data = JSON.parse(raw) as SavedSimSession;
        if (!data.messages?.length) continue;
        if ((data.typazh || '').toLowerCase() !== typazhKey.toLowerCase()) continue;
        const lastHer = [...data.messages].reverse().find(mm => mm.from === 'her');
        const lastMsg = lastHer?.text || data.messages[data.messages.length - 1]?.text || '';
        return {
          storageKey: `sim_session_${m[1]}`,
          sessionId: data.session_id,
          girlName: data.girl_name || null,
          lastMessage: lastMsg,
        };
      } catch (_) {}
    }
    return null;
  };

  /** Собрать все уже использованные имена девушек — чтобы не дублировать. */
  const collectUsedGirlNames = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^cupidon:[^:]+:sim_session_/.test(k)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(k) || '{}') as SavedSimSession;
        if (data.girl_name) out.push(data.girl_name);
      } catch (_) {}
    }
    return out;
  };

  /** Запустить симуляцию. forceNew=true → пропускает проверку дубля. */
  const start = async (forceNew = false) => {
    if (starting) return;
    setExistingDialog(null);
    setErrMsg(null);

    const isCustom = selectedTypeIdx >= TYPAZHES_SIM.length;
    const typazhKey = isCustom
      ? (selectedType as CustomGirl & { isCustom: true }).typazh || (selectedType as any).name
      : (selectedType as SimTypazh).name;

    // Проверка: если уже есть активная сессия с этим типажом —
    // спросить юзера что делать (если не forceNew).
    if (!forceNew) {
      const existing = findExistingSession(typazhKey);
      if (existing) {
        impactHaptic('light');
        setExistingDialog(existing);
        return;
      }
    }

    setStarting(true);
    try {
      const res = await startSimulator({ typazh: typazhKey, place: finalPlace, difficulty });
      notificationHaptic('success');

      // Если есть другая сессия с тем же типажом без имени — дадим имя обеим:
      // существующей даём имя ретроактивно (чтобы юзер не путался в списке).
      const usedNames = collectUsedGirlNames();
      let girlName: string | undefined;
      if (forceNew) {
        // Это вторая+ сессия — точно даём имя
        girlName = pickGirlName(usedNames);
        // Дать имя и старой сессии если у неё имени не было
        renameLegacySessionsIfNeeded(typazhKey, usedNames);
      }
      // Если это первая сессия — без имени, просто показываем «Стервозная».

      // Уникальный storage key через sessionId — никогда не перетирает чужие.
      const key = `sim_session_${typazhKey}_${finalPlace}_${res.session_id}`;
      storage.set(key, {
        session_id: res.session_id,
        messages: res.opening_message ? [{ from: 'her', text: res.opening_message }] : [],
        difficulty,
        typazh: typazhKey,
        place: finalPlace,
        type_color: (selectedType as SimTypazh).color || 'rgba(168,85,247',
        ...(girlName ? { girl_name: girlName } : {}),
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

  /** Если у legacy-сессий (без girl_name) есть совпадение по typazh —
      дать им имя из пула. Делаем для всех matching без имени.  */
  const renameLegacySessionsIfNeeded = (typazhKey: string, usedNames: string[]) => {
    const namesToUse = [...usedNames];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^cupidon:[^:]+:sim_session_/.test(k)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(k) || '{}') as SavedSimSession;
        if (data.girl_name) continue;
        if ((data.typazh || '').toLowerCase() !== typazhKey.toLowerCase()) continue;
        const name = pickGirlName(namesToUse);
        data.girl_name = name;
        namesToUse.push(name);
        localStorage.setItem(k, JSON.stringify(data));
      } catch (_) {}
    }
  };

  /** Удалить указанную storage-сессию (после подтверждения юзера). */
  const deleteSession = (storageKey: string) => {
    // storageKey формата 'sim_session_<...>' (без префикса cupidon:<tg>:)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.endsWith(':' + storageKey)) {
        try { localStorage.removeItem(k); } catch (_) {}
        return;
      }
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
          <GradientButton onClick={() => start(false)} loading={starting} disabled={starting} full>
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
                    {s.girlName ? `${s.girlName} · ` : ''}{s.typazh} {s.place ? `• ${s.place}` : ''}
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

      {/* Модалка «У тебя уже есть диалог с этим типажом» */}
      {existingDialog && (
        <ExistingDialogModal
          info={existingDialog}
          typazh={(selectedType as any).name}
          onContinue={() => {
            const e = existingDialog;
            setExistingDialog(null);
            if (!e) return;
            nav(`/simulator/chat/${encodeURIComponent(e.sessionId)}?key=${encodeURIComponent(e.storageKey)}`);
          }}
          onNew={() => { setExistingDialog(null); start(true); }}
          onDelete={() => {
            const e = existingDialog;
            if (!e) return;
            if (!window.confirm('Удалить тот диалог и начать новый?')) return;
            deleteSession(e.storageKey);
            setExistingDialog(null);
            start(true);
          }}
          onClose={() => setExistingDialog(null)}
        />
      )}
    </Layout>
  );
}

interface ExistingDialogModalProps {
  info: ExistingSimInfo;
  typazh: string;
  onContinue: () => void;
  onNew: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ExistingDialogModal({ info, typazh, onContinue, onNew, onDelete, onClose }: ExistingDialogModalProps) {
  const label = info.girlName ? `${info.girlName} (${typazh})` : typazh;
  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.title}>У тебя уже есть диалог</div>
        <div style={modalStyles.sub}>
          <b>{label}</b>
          {info.lastMessage && (
            <div style={modalStyles.preview}>
              «{info.lastMessage.length > 80 ? info.lastMessage.slice(0, 80) + '…' : info.lastMessage}»
            </div>
          )}
        </div>
        <button onClick={onContinue} style={modalStyles.primaryBtn}>
          Продолжить с ней
        </button>
        <button onClick={onNew} style={modalStyles.secondaryBtn}>
          Новая девушка с тем же типажом
        </button>
        <button onClick={onDelete} style={modalStyles.dangerBtn}>
          Удалить тот диалог и начать заново
        </button>
        <button onClick={onClose} style={modalStyles.cancelBtn}>
          Отмена
        </button>
      </div>
    </div>
  );
}

const modalStyles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  },
  sheet: {
    width: '100%', maxWidth: 480,
    background: 'var(--bg-card)',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 'calc(20px + var(--safe-bottom))',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  title: {
    fontSize: 18, fontWeight: 700,
    color: 'var(--text-primary)',
  },
  sub: {
    fontSize: 13, lineHeight: '18px',
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  preview: {
    marginTop: 6,
    padding: '6px 10px',
    background: 'var(--bg-elevated)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  primaryBtn: {
    padding: '14px',
    borderRadius: 12,
    background: 'var(--gradient-accent)',
    color: '#fff',
    border: 0,
    fontSize: 14, fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '14px',
    borderRadius: 12,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '14px',
    borderRadius: 12,
    background: 'transparent',
    color: 'var(--status-negative)',
    border: '1px solid rgba(239,68,68,0.3)',
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '10px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: 0,
    fontSize: 13,
    cursor: 'pointer',
  },
};

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
