// ═══════════════════════════════════════════════════════════════
// WingScreen — Стрела (главный AI-инструмент).
// Анализ переписки → score (0-10), mood, бары engagement/sentiment/trust,
// 9 вариантов ответов (3 страницы × 3 категории), signals и strategy.
//
// Источник: src/screens/WingScreen.js (RN-версия). Здесь — упрощённый
// порт без long-press menu и swipe-навигации (Phase F MVP).
// Контакты, hint типажа, контекст — сохранены как ключевые UX-фичи.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { IOSPasteHint } from '../components/IOSPasteHint';
import { AcquaintanceSlider } from '../components/AcquaintanceSlider';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { deleteWingContact } from '../utils/dialogActions';
import { storage } from '../utils/storage';

const WING_STORAGE_KEY = 'wing_per_girl_state';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import {
  analyzeWing, contactsApi, getAnalysisHistory,
  ApiError,
  type Contact, type WingResult, type HistorySession,
} from '../api';
import { useMe } from '../contexts/MeContext';
import { TYPAZHES, MAX_TYPAZHES, csvToList, listToCsv } from '../utils/typazhes';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Тон ответа → индекс категории (5 тонов: дружелюбный/игривый/флирт/
// уверенный/универсальный). Бэкенд кладёт тон в badge.
function categoryIdx(r: { badge?: string }): number {
  const b = String(r?.badge || '').trim().toLowerCase();
  if (b.startsWith('дружел')) return 0;
  if (b.startsWith('игрив'))  return 1;
  if (b.startsWith('флирт'))  return 2;
  if (b.startsWith('увер'))   return 3;
  if (b.startsWith('универ') || b.startsWith('комбин')) return 4;
  return -1;
}

// Round-robin по тонам → на каждой странице (3 шт) разные тоны, а не
// два одинаковых подряд. Состав всегда 2/2/2/2/1 = 9.
function interleaveResponses<T extends { badge?: string }>(responses: T[]): T[] {
  if (!Array.isArray(responses) || responses.length === 0) return [];
  const buckets: T[][] = [[], [], [], [], []];
  const others: T[] = [];
  for (const r of responses) {
    const c = categoryIdx(r);
    if (c >= 0) buckets[c].push(r);
    else others.push(r);
  }
  if (buckets.every(b => b.length === 0)) return responses;
  const out: T[] = [];
  const maxLen = Math.max(...buckets.map(b => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (let c = 0; c < buckets.length; c++) if (buckets[c][i]) out.push(buckets[c][i]);
  }
  return out.concat(others);
}

// Подпись тона под ответом: ярлык + короткое описание + цвет.
const TONE_META: Record<string, { label: string; desc: string; color: string }> = {
  дружелюбный:   { label: 'Дружелюбный',  desc: 'тёплое общение, без флирта',        color: '#22C55E' },
  игривый:       { label: 'Игривый',      desc: 'лёгкий тиз и ирония',               color: '#F59E0B' },
  флирт:         { label: 'Флирт',        desc: 'явный интерес и намёк',             color: '#F43F5E' },
  уверенный:     { label: 'Уверенный',    desc: 'инициатива, лидерская рамка',       color: '#6366F1' },
  универсальный: { label: 'Универсальный',desc: 'заходит почти всегда',              color: '#A1A1AA' },
};
function toneMeta(badge?: string) {
  const b = String(badge || '').trim().toLowerCase();
  if (b.startsWith('дружел')) return TONE_META.дружелюбный;
  if (b.startsWith('игрив'))  return TONE_META.игривый;
  if (b.startsWith('флирт'))  return TONE_META.флирт;
  if (b.startsWith('увер'))   return TONE_META.уверенный;
  return TONE_META.универсальный;
}

function barColor(val: number): string {
  if (val < 33) return 'var(--status-negative)';
  if (val < 66) return 'var(--status-warning)';
  return 'var(--status-positive)';
}

function scoreColor(s: number): string {
  if (s >= 6.5) return 'var(--status-positive)';
  if (s >= 4.0) return 'var(--status-warning)';
  return 'var(--status-negative)';
}

// ── AI loading banner ───────────────────────────────────────────────────────

const AI_LOADING_TEXTS = [
  'Стрела думает…',
  'AI анализирует переписку…',
  'Проверяет твой стиль…',
  'Подбирает варианты ответов…',
  'Читает её сигналы…',
];

function AIThinkingBanner({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setIdx(i => (i + 1) % AI_LOADING_TEXTS.length), 2000);
    return () => clearInterval(t);
  }, [visible]);
  if (!visible) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <span className="wingDot" style={{ animationDelay: '0s' }} />
        <span className="wingDot" style={{ animationDelay: '0.18s' }} />
        <span className="wingDot" style={{ animationDelay: '0.36s' }} />
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{AI_LOADING_TEXTS[idx]}</span>
      <style>{`
        .wingDot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--accent-primary);
          opacity: 0.4;
          animation: wingBounce 0.78s ease-in-out infinite;
        }
        @keyframes wingBounce {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50%      { opacity: 1;   transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

// ── Tone — стиль ответов AI ─────────────────────────────────────────────────
// Тон ответов больше НЕ выбирается: AI всегда выдаёт фиксированный набор
// (2 дружелюбных, 2 игривых, 2 флирт, 2 уверенных, 1 универсальный),
// тон каждого подписан под ответом (см. TONE_META).

// ── Per-girl analysis state ─────────────────────────────────────────────────

interface GirlAnalysis {
  text: string;
  showResult: boolean;
  result?: WingResult;
  responsePage: number;
  regenCount: number;
  lastAnalyzedText?: string;
  lastAnalyzedContext?: boolean;
  lastAnalyzedHint?: string | null;
  lastAnalyzedAt?: string;
  lastMsgCount?: number;
  lastMood?: string | null;
  // Слайдер «сколько знакомы» (индекс ACQ_BUCKETS) + режим «без анализа» + цель.
  acqIdx?: number;
  noAnalysis?: boolean;
  goal?: string;
  lastAnalyzedAcq?: number;
  lastAnalyzedNoAnalysis?: boolean;
  lastAnalyzedGoal?: string;
}

const emptyAnalysis = (): GirlAnalysis => ({
  text: '',
  showResult: false,
  responsePage: 0,
  regenCount: 0,
  acqIdx: 2,
  noAnalysis: false,
  goal: 'chat',
});

// Слайдер давности знакомства: индекс → label (UI) + code (бэк калибрует тон ответов).
const ACQ_BUCKETS = [
  { label: '≈30 минут',    code: 'min30' },
  { label: '≈2 часа',      code: 'h2' },
  { label: 'сегодня',      code: 'today' },
  { label: 'пару дней',    code: 'days' },
  { label: 'около недели', code: 'week' },
  { label: '2-3 недели',   code: 'weeks' },
  { label: 'месяц+',       code: 'month' },
];
const ACQ_LABELS = ACQ_BUCKETS.map(b => b.label);

// Цель на девушку — стратегическая рамка (бэк калибрует все ответы под неё).
const GOALS = [
  { code: 'chat',         label: 'Просто общение' },
  { code: 'friends',      label: 'По-дружески' },
  { code: 'flirt',        label: 'Флирт' },
  { code: 'closer',       label: 'Сблизиться' },
  { code: 'date',         label: 'Позвать на свидание' },
  { code: 'relationship', label: 'Отношения' },
];

const REGEN_LIMIT = 2;
const NO_CONTACT_ID = '__none__'; // ключ для случая «без выбранного контакта»

export function WingScreen() {
  const nav = useNavigate();
  const { me } = useMe();
  const onBack = useCallback(() => nav('/'), [nav]);
  useBackButton(onBack);

  // Используем локальный тип с id:string (для удобства как ключа в perGirl).
  // В API Contact.id = number, но конвертируем через String() при загрузке.
  const [contacts, setContacts] = useState<Array<Omit<Contact, 'id'> & { id: string }>>([]);
  const [activeContactId, setActiveContactId] = useState<string>(NO_CONTACT_ID);
  // Восстанавливаем per-contact state из localStorage — чтобы анализ
  // не терялся при переходе на другие экраны и возврате в Стрелу.
  const [perGirl, setPerGirl] = useState<Record<string, GirlAnalysis>>(() => {
    const saved = storage.get<Record<string, GirlAnalysis> | null>(WING_STORAGE_KEY, null);
    if (saved && typeof saved === 'object') return saved;
    return { [NO_CONTACT_ID]: emptyAnalysis() };
  });
  const [analysisTypazhes, setAnalysisTypazhes] = useState<Record<string, string[]>>({});
  const [typazhExpanded, setTypazhExpanded] = useState(false);

  const [contextEnabled, setContextEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [_history, setHistory] = useState<HistorySession[]>([]);

  // Add Contact modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTypazhes, setNewTypazhes] = useState<string[]>([]);

  // ── load contacts + history ─────────────────────────────────────────────
  useEffect(() => {
    contactsApi.getAll()
      .then(res => {
        if (res?.ok && Array.isArray(res.contacts)) {
          const list = res.contacts.map(c => ({ ...c, id: String(c.id) }));
          setContacts(list);
        }
      })
      .catch(() => {});
    getAnalysisHistory()
      .then(r => { if (r.ok) setHistory(r.sessions || []); })
      .catch(() => {});
  }, []);

  // Сохраняем perGirl в localStorage при каждом изменении — чтобы при
  // переходе на главную/симулятор и возврате анализ был на месте.
  useEffect(() => {
    storage.set(WING_STORAGE_KEY, perGirl);
  }, [perGirl]);

  // Initialize per-contact analysis state on first switch
  useEffect(() => {
    setPerGirl(prev => prev[activeContactId] ? prev : { ...prev, [activeContactId]: emptyAnalysis() });
    setAnalysisTypazhes(prev => {
      if (prev[activeContactId] !== undefined) return prev;
      if (activeContactId === NO_CONTACT_ID) return { ...prev, [activeContactId]: [] };
      const c = contacts.find(c => String(c.id) === activeContactId);
      const fromCard = c?.typazh ? csvToList(c.typazh).slice(0, MAX_TYPAZHES) : [];
      return { ...prev, [activeContactId]: fromCard };
    });
  }, [activeContactId, contacts]);

  const cur = perGirl[activeContactId] || emptyAnalysis();
  const curHint = analysisTypazhes[activeContactId] || [];

  const updateCur = (patch: Partial<GirlAnalysis>) => {
    setPerGirl(prev => ({ ...prev, [activeContactId]: { ...(prev[activeContactId] || emptyAnalysis()), ...patch } }));
  };

  const sortedContacts = useMemo(() => {
    const pinned = contacts.filter(c => c.is_pinned);
    const rest = contacts.filter(c => !c.is_pinned);
    return [...pinned, ...rest];
  }, [contacts]);

  const toggleAnalysisTypazh = (t: string) => {
    setAnalysisTypazhes(prev => {
      const list = prev[activeContactId] || [];
      let next: string[];
      if (list.includes(t)) next = list.filter(x => x !== t);
      else if (list.length >= MAX_TYPAZHES) next = list;
      else next = [...list, t];
      return { ...prev, [activeContactId]: next };
    });
    selectionHaptic();
  };

  // Disable analyze button if same text/context/hint were analyzed already
  const sortedCsv = (s: string | null | undefined) =>
    !s ? '' : s.split(',').map(x => x.trim()).filter(Boolean).sort().join(',');
  const curHintCsv = curHint.length ? curHint.slice().sort().join(',') : '';
  const lastHintCsv = sortedCsv(cur.lastAnalyzedHint);
  const text = cur.text;
  const acqIdx = cur.acqIdx ?? 2;
  const noAnalysis = !!cur.noAnalysis;
  const goal = cur.goal ?? 'chat';
  const analyzeDisabled =
    !text.trim() ||
    loading ||
    (
      cur.showResult &&
      text.trim() === cur.lastAnalyzedText &&
      contextEnabled === !!cur.lastAnalyzedContext &&
      curHintCsv === lastHintCsv &&
      acqIdx === (cur.lastAnalyzedAcq ?? 2) &&
      noAnalysis === !!cur.lastAnalyzedNoAnalysis &&
      goal === (cur.lastAnalyzedGoal ?? 'chat')
    );

  const hasPrevCtx = !!cur.lastAnalyzedText;

  // ── Run analysis ────────────────────────────────────────────────────────
  const runAnalyze = async () => {
    if (analyzeDisabled || loading) return;
    const analyzedText = text.trim();
    const analyzedCtx = contextEnabled;
    const analyzingContactId = activeContactId === NO_CONTACT_ID ? null : activeContactId;
    const hintList = analysisTypazhes[activeContactId] || [];
    const hintCsv = listToCsv(hintList);

    setLoading(true);
    setApiError(null);
    try {
      const res = await analyzeWing({
        text: analyzedText,
        withContext: analyzedCtx,
        contactId: analyzingContactId,
        typazhHint: hintCsv,
        user_profile: me?.user_profile ?? null,
        acquaintance: ACQ_BUCKETS[acqIdx]?.code ?? 'today',
        goal,
        noAnalysis,
      });
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const msgCount = analyzedText.split('\n').filter(l => l.trim()).length;
      updateCur({
        showResult: true,
        result: res.result,
        responsePage: 0,
        regenCount: 0,
        lastAnalyzedText: analyzedText,
        lastAnalyzedContext: analyzedCtx,
        lastAnalyzedAt: timeStr,
        lastMsgCount: msgCount,
        lastMood: res.result.mood,
        lastAnalyzedHint: hintCsv ?? undefined,
        lastAnalyzedAcq: acqIdx,
        lastAnalyzedNoAnalysis: noAnalysis,
        lastAnalyzedGoal: goal,
      });
      notificationHaptic('success');
      getAnalysisHistory().then(r => { if (r.ok) setHistory(r.sessions || []); }).catch(() => {});
    } catch (e: any) {
      // 429 LIMIT_EXCEEDED → bottom-sheet баннер с опциями апгрейда
      if (e instanceof ApiError && e.status === 429) {
        setLimitSheet('limit');
        setLoading(false);
        return;
      }
      setApiError(e?.message || 'Не удалось проанализировать');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const refreshResponses = () => {
    if (cur.regenCount >= REGEN_LIMIT) return;
    impactHaptic('light');
    updateCur({
      responsePage: (cur.responsePage || 0) + 1,
      regenCount: (cur.regenCount || 0) + 1,
    });
  };

  const goToResponsePage = (page: number) => {
    if (page === cur.responsePage) return;
    selectionHaptic();
    updateCur({ responsePage: page });
  };

  // ── Add Contact ─────────────────────────────────────────────────────────
  const submitAddContact = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await contactsApi.create({
        name,
        typazh: listToCsv(newTypazhes),
      });
      if (res?.ok && res.contact) {
        const c = { ...res.contact, id: String(res.contact.id) };
        setContacts(prev => [...prev, c]);
        setActiveContactId(c.id);
        notificationHaptic('success');
      }
    } catch (_) {
      notificationHaptic('error');
    }
    setNewName('');
    setNewTypazhes([]);
    setAddModalOpen(false);
  };

  const copyText = async (s: string) => {
    try {
      await navigator.clipboard?.writeText(s);
      notificationHaptic('success');
    } catch (_) {}
  };

  // ── responses rendering ─────────────────────────────────────────────────
  const allResponses = cur.result?.responses || [];
  const orderedResponses = useMemo(() => interleaveResponses(allResponses), [allResponses]);
  const responsePage = cur.responsePage || 0;
  const totalResponsePages = (cur.regenCount || 0) + 1;
  const displayed = orderedResponses.slice(responsePage * 3, responsePage * 3 + 3);

  return (
    <Layout withTabBar>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          {/* SVG-стрела вместо эмодзи: красивая закруглённая иконка
              с лёгким градиентом в тон бренду */}
          <span style={styles.titleIcon}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none"
                 stroke="url(#cupidonArrow)" strokeWidth={2.2}
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <defs>
                <linearGradient id="cupidonArrow" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor="#F43F5E" />
                  <stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              {/* стержень + наконечник */}
              <line x1="3"  y1="21" x2="20" y2="4" />
              <polyline points="20,12 20,4 12,4" />
              {/* оперение */}
              <line x1="3"  y1="21" x2="7"  y2="20" />
              <line x1="3"  y1="21" x2="4"  y2="17" />
            </svg>
          </span>
          <h1 style={styles.title}>Стрела</h1>
        </div>

        {/* Contact tabs */}
        <div style={styles.tabsScroll}>
          <button
            onClick={() => { selectionHaptic(); setActiveContactId(NO_CONTACT_ID); }}
            style={{
              ...styles.tab,
              ...(activeContactId === NO_CONTACT_ID ? styles.tabActive : {}),
            }}
          >
            {activeContactId === NO_CONTACT_ID
              ? <span style={styles.tabActiveText}>Без контакта</span>
              : <span style={styles.tabText}>Без контакта</span>}
          </button>
          {sortedContacts.map(c => {
            const id = String(c.id);
            const active = activeContactId === id;
            const onDeleteContact = async (e: React.MouseEvent | React.PointerEvent) => {
              e.stopPropagation();
              e.preventDefault();
              if (!window.confirm(`Удалить контакт «${c.name}»? Анализ переписки тоже удалится.`)) return;
              impactHaptic('medium');
              const ok = await deleteWingContact(id);
              if (ok) {
                setContacts(prev => prev.filter(x => String(x.id) !== id));
                // Если удалили активный — переключаемся на «Без контакта»
                if (active) setActiveContactId(NO_CONTACT_ID);
              }
            };
            return (
              <button
                key={id}
                onClick={() => { selectionHaptic(); setActiveContactId(id); }}
                style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
              >
                {/* !! важно: c.is_pinned приходит из SQLite как 0|1 (число).
                    Чистый `c.is_pinned && <X/>` рендерит «0» в DOM при is_pinned=0
                    — это и был «0 перед именем» в табах контактов Стрелы. */}
                {c.is_pinned ? <PinIcon size={10} color={active ? '#fff' : 'var(--text-accent)'} /> : null}
                <span style={active ? styles.tabActiveText : styles.tabText}>{c.name}</span>
                {/* Маленький крестик — span с onClick (нельзя button-в-button).
                    stopPropagation чтобы тап не открывал контакт. */}
                <span
                  role="button"
                  aria-label="Удалить контакт"
                  onClick={onDeleteContact}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    ...styles.tabCloseBtn,
                    color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
                  }}
                >
                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
                    <line x1={5} y1={5} x2={19} y2={19} />
                    <line x1={19} y1={5} x2={5} y2={19} />
                  </svg>
                </span>
              </button>
            );
          })}
          <button onClick={() => setAddModalOpen(true)} style={styles.addTab}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth={2.5} strokeLinecap="round">
              <line x1={12} y1={5} x2={12} y2={19} />
              <line x1={5} y1={12} x2={19} y2={12} />
            </svg>
            <span style={styles.tabText}>Новая</span>
          </button>
        </div>

        {/* Input Card */}
        <div style={styles.section}>
          <Card>
            {/* Hint типажа */}
            <div style={styles.hintHeader}>
              <div style={{ flex: 1 }}>
                <span style={styles.hintLabel}>
                  Какой ты её ощущаешь?{' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {curHint.length === 0
                      ? '— не выбрано, AI определит сам'
                      : `— ${curHint.join(' + ')}`}
                  </span>
                </span>
              </div>
              <button
                onClick={() => { selectionHaptic(); setTypazhExpanded(v => !v); }}
                style={styles.hintToggle}
              >
                {typazhExpanded ? 'Свернуть' : (curHint.length ? 'Изменить' : 'Развернуть')}
              </button>
            </div>
            {typazhExpanded && (
              <div style={styles.hintBox}>
                <div style={styles.chipRow}>
                  {TYPAZHES.map(t => {
                    const isSel = curHint.includes(t);
                    const disabled = !isSel && curHint.length >= MAX_TYPAZHES;
                    return (
                      <div key={t} style={{ opacity: disabled ? 0.4 : 1 }}>
                        <Chip
                          active={isSel}
                          onClick={() => !disabled && toggleAnalysisTypazh(t)}
                        >
                          {t}
                        </Chip>
                      </div>
                    );
                  })}
                </div>
                <div style={styles.hintFooter}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                    {curHint.length > 0
                      ? `Выбрано: ${curHint.length} из ${MAX_TYPAZHES}`
                      : 'Не выбрано'}
                  </span>
                  {curHint.length > 0 && (
                    <button
                      onClick={() => {
                        selectionHaptic();
                        setAnalysisTypazhes(p => ({ ...p, [activeContactId]: [] }));
                      }}
                      style={styles.linkBtn}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
            )}
            <div style={styles.divider} />

            {/* Тон не выбирается: AI всегда даёт набор тонов, подписанный
                под каждым ответом (2 дружелюбных, 2 игривых, 2 флирт,
                2 уверенных, 1 универсальный). */}
            <div style={styles.toneHint}>
              ответы придут в разных тонах — дружелюбный · игривый · флирт · уверенный. тон подписан под каждым
            </div>

            <div style={styles.divider} />

            <AutoGrowTextarea
              value={text}
              onChange={(v) => updateCur({ text: v })}
              placeholder={'Вставь сюда переписку с ней.\nКаждое сообщение — с новой строки.\n\nЯ: привет\nОна: привет, как сам?'}
              maxHeight={400}
              style={{
                padding: '12px 4px',
                minHeight: 140,
                lineHeight: '22px',
                fontSize: 15,
              }}
            />
            <IOSPasteHint />
            {/* Чекбокс «использовать прошлый контекст» убран по запросу клиента.
                Возможность вернуть — флаг contextEnabled остаётся в state, но
                теперь всегда false (AI анализирует только текущий текст). */}
          </Card>

          {/* Давность знакомства (калибрует тон ответов) + режим без анализа */}
          <Card style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Цель с ней</span>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
              {GOALS.map(g => {
                const active = goal === g.code;
                return (
                  <button
                    key={g.code}
                    onClick={() => { selectionHaptic(); updateCur({ goal: g.code }); }}
                    style={{
                      flexShrink: 0, padding: '6px 12px', borderRadius: 14, cursor: 'pointer',
                      fontSize: 13, whiteSpace: 'nowrap',
                      border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      background: active ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Сколько знаком с девушкой</span>
            <AcquaintanceSlider
              value={acqIdx}
              buckets={ACQ_LABELS}
              onChange={(i) => updateCur({ acqIdx: i })}
            />
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
            <button
              onClick={() => { selectionHaptic(); updateCur({ noAnalysis: !noAnalysis }); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
              aria-pressed={noAnalysis}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: noAnalysis ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                background: noAnalysis ? 'var(--accent-primary)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {noAnalysis && (
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Отвечать без анализа
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--status-positive)', background: 'rgba(34,197,94,0.15)', padding: '1px 7px', borderRadius: 8 }}>быстрее</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>сразу 9 ответов, без оценки и сигналов</span>
              </span>
            </button>
          </Card>

          <AIThinkingBanner visible={loading} />

          <div style={{ marginTop: 12 }}>
            <GradientButton
              onClick={runAnalyze}
              disabled={analyzeDisabled}
              loading={loading}
              full
              icon={
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={11} cy={11} r={8} />
                  <line x1={21} y1={21} x2={16.65} y2={16.65} />
                </svg>
              }
            >
              Анализировать
            </GradientButton>
          </div>

          {apiError && (
            <Card style={styles.errorCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--status-negative)', fontSize: 13, flex: 1 }}>
                  Ошибка: {apiError}
                </span>
                <SecondaryButton onClick={() => { setApiError(null); runAnalyze(); }}>
                  Повторить
                </SecondaryButton>
              </div>
            </Card>
          )}

          {/* Результат */}
          {cur.showResult && cur.result && (
            <Card style={styles.resultCard}>
              {cur.lastAnalyzedContext && (
                <div style={styles.ctxTag}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                    stroke="var(--text-accent)" strokeWidth={2.5} strokeLinecap="round">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                  <span style={styles.ctxTagText}>анализ с контекстом</span>
                </div>
              )}
              <span style={styles.resultTitle}>Результат</span>

              {cur.result.score != null && (
                <ScoreBar
                  label="Общий балл"
                  value={cur.result.score}
                  max={10}
                  color={scoreColor(cur.result.score)}
                />
              )}

              {cur.result.summary && (
                <p style={styles.summary}>{cur.result.summary}</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cur.result.engagement != null && (
                  <PercentBar label="Вовлечённость" value={cur.result.engagement} />
                )}
                {cur.result.sentiment != null && (
                  <PercentBar label="Настрой" value={cur.result.sentiment} />
                )}
                {cur.result.trust != null && (
                  <PercentBar label="Доверие" value={cur.result.trust} />
                )}
              </div>

              {cur.result.signals && cur.result.signals.length > 0 && (
                <>
                  <div style={styles.divider} />
                  <span style={styles.sectionLabel}>Сигналы</span>
                  {cur.result.signals.map((s, i) => (
                    <div key={i} style={styles.signalRow}>
                      <SignalIcon type={s.type} />
                      <span style={styles.signalText}>{s.text}</span>
                    </div>
                  ))}
                </>
              )}

              {cur.result.girl_typazh_description && (
                <>
                  <div style={styles.divider} />
                  <span style={styles.sectionLabel}>Как она общается</span>
                  <p style={styles.strategy}>{cur.result.girl_typazh_description}</p>
                </>
              )}

              {cur.result.strategy && (
                <>
                  <div style={styles.divider} />
                  <span style={styles.sectionLabel}>Стратегия</span>
                  <p style={styles.strategy}>{cur.result.strategy}</p>
                </>
              )}

              {cur.result.media_hint?.type && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.mediaHint}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-accent)" strokeWidth={2} strokeLinecap="round">
                        <circle cx={12} cy={12} r={10} />
                      </svg>
                      <span style={styles.mediaHintTitle}>
                        {cur.result.media_hint.type === 'circle' ? 'Кружок' : 'Голосовое'}
                      </span>
                    </div>
                    {cur.result.media_hint.reason && (
                      <p style={styles.mediaHintReason}>{cur.result.media_hint.reason}</p>
                    )}
                    {cur.result.media_hint.what_to_say && (
                      <p style={styles.mediaHintBody}>{cur.result.media_hint.what_to_say}</p>
                    )}
                  </div>
                </>
              )}

              {displayed.length > 0 && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.responsesHeader}>
                    <span style={styles.sectionLabel}>
                      Варианты {responsePage + 1} / {totalResponsePages}
                    </span>
                    <button
                      onClick={refreshResponses}
                      disabled={cur.regenCount >= REGEN_LIMIT || loading}
                      style={{
                        ...styles.refreshBtn,
                        opacity: cur.regenCount >= REGEN_LIMIT ? 0.5 : 1,
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke={cur.regenCount >= REGEN_LIMIT ? 'var(--text-muted)' : 'var(--text-accent)'}
                        strokeWidth={2} strokeLinecap="round">
                        <path d="M23 4v6h-6" />
                        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                      </svg>
                      <span
                        style={{
                          fontSize: 12,
                          color: cur.regenCount >= REGEN_LIMIT ? 'var(--text-muted)' : 'var(--text-accent)',
                        }}
                      >
                        {cur.regenCount >= REGEN_LIMIT ? 'Лимит' : `Ещё ${REGEN_LIMIT - cur.regenCount}`}
                      </span>
                    </button>
                  </div>
                  <div style={styles.pagination}>
                    {Array.from({ length: totalResponsePages }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => goToResponsePage(i)}
                        style={{
                          ...styles.paginationDot,
                          background: i === responsePage ? 'var(--accent-primary)' : 'var(--border-subtle)',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {displayed.map((r, i) => {
                      const tm = toneMeta(r.badge);
                      const parts = String(r.text || '').split('\n').map(s => s.trim()).filter(Boolean);
                      const multi = parts.length > 1;
                      return (
                        <div key={i} style={styles.responseItem}>
                          <button
                            onClick={() => copyText(r.text)}
                            style={styles.copyBtn}
                            aria-label="Скопировать всё"
                          >
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                              stroke="var(--text-muted)" strokeWidth={2}>
                              <rect x={9} y={9} width={13} height={13} rx={2} />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </button>
                          <span style={{ ...styles.toneBadge, color: tm.color, borderColor: tm.color }}>
                            {tm.label}{multi ? ` · ${parts.length} сообщения` : ''}
                          </span>
                          {multi ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {parts.map((p, j) => (
                                <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--bg-card)', borderRadius: 10, padding: '8px 10px' }}>
                                  <span style={{ flex: 1, fontSize: 14, lineHeight: '20px', color: 'var(--text-primary)' }}>{p}</span>
                                  <button
                                    onClick={() => copyText(p)}
                                    style={{ flexShrink: 0, background: 'none', border: 0, cursor: 'pointer', padding: 2 }}
                                    aria-label={`Скопировать сообщение ${j + 1}`}
                                  >
                                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                                      <rect x={9} y={9} width={13} height={13} rx={2} />
                                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={styles.responseText}>{r.text}</p>
                          )}
                          <p style={styles.responseWhy}>
                            {tm.desc}{r.why ? ` · ${r.why}` : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Add Contact Sheet */}
      {addModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setAddModalOpen(false)}>
          <div style={styles.modalSheet} onClick={e => e.stopPropagation()}>
            <div style={styles.modalDragger} />
            <h2 style={styles.modalTitle}>Новый диалог</h2>
            <p style={styles.modalSub}>Имя — для тебя. AI не знает её настоящего имени.</p>

            <div style={styles.modalInput}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Как её зовут?"
                style={{
                  width: '100%',
                  fontSize: 16,
                  color: 'var(--text-primary)',
                  background: 'transparent',
                  border: 0,
                  outline: 0,
                }}
              />
            </div>

            <div style={styles.modalLabel}>ТИПАЖ (до {MAX_TYPAZHES})</div>
            <div style={styles.chipRow}>
              {TYPAZHES.map(t => {
                const isSel = newTypazhes.includes(t);
                const disabled = !isSel && newTypazhes.length >= MAX_TYPAZHES;
                return (
                  <div key={t} style={{ opacity: disabled ? 0.4 : 1 }}>
                    <Chip
                      active={isSel}
                      onClick={() => {
                        if (disabled) return;
                        selectionHaptic();
                        setNewTypazhes(prev =>
                          prev.includes(t)
                            ? prev.filter(x => x !== t)
                            : [...prev, t]
                        );
                      }}
                    >
                      {t}
                    </Chip>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 16 }}>
              <GradientButton
                onClick={submitAddContact}
                disabled={!newName.trim()}
                full
              >
                Добавить
              </GradientButton>
            </div>
          </div>
        </div>
      )}

      <LimitReachedSheet
        open={limitSheet != null}
        reason={limitSheet || 'limit'}
        onClose={() => setLimitSheet(null)}
      />
    </Layout>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={styles.scaleLabel}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color }}>
          {value.toFixed(1)} / {max}
        </span>
      </div>
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function PercentBar({ label, value }: { label: string; value: number }) {
  const color = barColor(value);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={styles.scaleLabel}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}%</span>
      </div>
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function SignalIcon({ type }: { type: 'positive' | 'warning' | 'negative' }) {
  if (type === 'positive') {
    return (
      <svg width={16} height={16} viewBox="0 0 24 24">
        <circle cx={12} cy={12} r={10} fill="rgba(34,197,94,0.18)" />
        <polyline points="9,12 11,14 15,10" stroke="var(--status-positive)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg width={16} height={16} viewBox="0 0 24 24">
        <polygon points="12,2 2,22 22,22" fill="rgba(245,158,11,0.18)" />
        <line x1={12} y1={9} x2={12} y2={14} stroke="var(--status-warning)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={12} cy={18} r={1} fill="var(--status-warning)" />
      </svg>
    );
  }
  return (
    <svg width={16} height={16} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={10} fill="rgba(239,68,68,0.18)" />
      <line x1={8} y1={8} x2={16} y2={16} stroke="var(--status-negative)" strokeWidth={2} strokeLinecap="round" />
      <line x1={16} y1={8} x2={8} y2={16} stroke="var(--status-negative)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function PinIcon({ size = 10, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={2} strokeLinecap="round">
      <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
    </svg>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: { paddingTop: 8 },
  header: {
    padding: '16px 20px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  titleIcon: { display: 'inline-flex', alignItems: 'center', lineHeight: 0 },
  title: { margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' },

  tabsScroll: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    padding: '4px 16px 12px',
    scrollbarWidth: 'none',
  },
  tab: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 14px',
    borderRadius: 20,
    background: 'var(--bg-elevated)',
    cursor: 'pointer',
  },
  tabActive: {
    background: 'var(--gradient-accent)',
  },
  tabText: { fontSize: 13, color: 'var(--text-secondary)' },
  tabActiveText: { fontSize: 13, color: '#fff', fontWeight: 600 },
  // Маленький крестик удаления контакта. inline-flex span (button-в-button нельзя).
  // Только визуальная зона тапа ~18×18, иконка 9×9. Не агрессивный, серый.
  tabCloseBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16,
    marginLeft: 4, marginRight: -4,
    borderRadius: 8,
    cursor: 'pointer',
    opacity: 0.65,
  },
  addTab: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 14px',
    borderRadius: 20,
    background: 'var(--bg-elevated)',
    border: '1px dashed var(--border-subtle)',
    cursor: 'pointer',
  },

  section: { padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 },

  // ── Подсказка про тоны + ярлык тона на ответе ────────────────────────────
  toneHint: { fontSize: 12, color: 'var(--text-muted)', lineHeight: '17px' },
  toneBadge: {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 7,
    border: '1px solid',
    background: 'transparent',
    marginBottom: 6,
  },

  hintHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hintLabel: { fontSize: 13, color: 'var(--text-muted)' },
  hintToggle: { fontSize: 12, color: 'var(--text-accent)', fontWeight: 600, background: 'transparent', cursor: 'pointer' },
  hintBox: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  hintFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  divider: { height: 1, background: 'var(--border-subtle)', margin: '12px 0' },

  checkRow: { display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', width: '100%', textAlign: 'left' },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderStyle: 'solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkLabel: { fontSize: 13, flex: 1 },

  ctxBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  ctxBannerTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', marginBottom: 1 },
  ctxBannerSub: { fontSize: 11, color: 'var(--text-muted)', lineHeight: '16px' },

  errorCard: {
    padding: 12,
    border: '1px solid rgba(239,68,68,0.4)',
    background: 'rgba(239,68,68,0.08)',
  },

  resultCard: { display: 'flex', flexDirection: 'column', gap: 16 },
  resultTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-accent)' },
  ctxTag: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    borderRadius: 8,
    padding: '6px 10px',
  },
  ctxTagText: { fontSize: 12, fontWeight: 500, color: 'var(--text-accent)' },
  scaleLabel: { fontSize: 13, color: 'var(--text-secondary)' },
  summary: { margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: '19px' },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    background: 'var(--bg-elevated)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 400ms ease-out',
  },

  sectionLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, display: 'block' },
  signalRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' },
  signalText: { fontSize: 14, color: 'var(--text-secondary)', flex: 1 },
  strategy: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--text-secondary)' },

  mediaHint: {
    border: '1px solid var(--border-accent)',
    background: 'var(--accent-soft)',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  mediaHintTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-accent)' },
  mediaHintReason: { margin: 0, fontSize: 12, lineHeight: '17px', color: 'var(--text-secondary)' },
  mediaHintBody: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--text-primary)' },

  responsesHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  refreshBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', cursor: 'pointer' },

  pagination: { display: 'flex', gap: 4, marginBottom: 8 },
  paginationDot: { flex: 1, height: 3, borderRadius: 2, border: 0, cursor: 'pointer' },

  responseItem: {
    position: 'relative',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    padding: 12,
    paddingRight: 36,
  },
  copyBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
    background: 'transparent',
    cursor: 'pointer',
  },
  responseText: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-primary)' },
  responseWhy: { margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' },

  // Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--modal-overlay)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalSheet: {
    background: 'var(--bg-card)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: '12px 24px calc(var(--safe-bottom) + 32px)',
    width: '100%',
    maxWidth: 520,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalDragger: { width: 36, height: 4, borderRadius: 2, background: 'var(--border-default)', alignSelf: 'center', marginBottom: 8 },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  modalSub: { margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--text-muted)' },
  modalInput: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '12px 14px',
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-muted)',
    marginTop: 4,
  },

  linkBtn: { fontSize: 12, color: 'var(--text-accent)', background: 'transparent', cursor: 'pointer' },
};
