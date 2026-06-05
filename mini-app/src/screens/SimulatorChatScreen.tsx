// ═══════════════════════════════════════════════════════════════
// SimulatorChatScreen — чат с AI-девушкой.
// Route: /simulator/chat/:id?key=sim_session_<typazh>_<place>
//
// Состояние сообщений хранится в storage по `key` (передаём через query)
// — для восстановления после reload (грабли §5.22).
//
// Header: BackButton (через useBackButton) + название + место + кнопки
//   • «Подсказка» (модалка с /simulator/hints)
//   • «Завершить» → /simulator/finish → nav в /simulator/result
//
// Input — AutoGrowTextarea, кнопка send disabled пока aiLoading.
// AI пишет → typing-индикатор (§5.26).
// 429 LIMIT_EXCEEDED → /paywall.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { ChatBubble } from '../components/ChatBubble';
import { AutoGrowTextarea, type AutoGrowTextareaHandle } from '../components/AutoGrowTextarea';
import { SecondaryButton } from '../components/SecondaryButton';
import {
  sendSimulatorMessage,
  getSimulatorHints,
  finishSimulator,
  analyzeSimulator,
  ApiError,
} from '../api';
import { storage } from '../utils/storage';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { findSimTypazhByName, cleanTypazhName } from '../utils/typazhes';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { useMe } from '../contexts/MeContext';

interface ChatMsg { from: 'me' | 'her'; text: string }
interface StoredSession {
  session_id: string;
  messages: ChatMsg[];
  difficulty?: number;
  typazh?: string;
  place?: string;
  type_color?: string;
  girl_name?: string;
}

export function SimulatorChatScreen() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const storageKey = search.get('key') || '';

  const sessionId = id ? decodeURIComponent(id) : '';

  const initial = storage.get<StoredSession | null>(storageKey, null);
  const [messages, setMessages] = useState<ChatMsg[]>(initial?.messages || []);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const typingTimerRef = useRef<number | null>(null);
  const inputRef = useRef<AutoGrowTextareaHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { refresh: refreshMe } = useMe();
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);

  const [hintsOpen, setHintsOpen] = useState(false);
  const [hints, setHints] = useState<{ type: string; text: string }[]>([]);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [hintsMsgCount, setHintsMsgCount] = useState(-1);

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMsgCount, setAnalysisMsgCount] = useState(-1);

  const typazhName = cleanTypazhName(initial?.typazh);
  const girlName = initial?.girl_name || '';
  // Имя в шапке: если есть girl_name → «Алиса · Стервозная», иначе просто типаж.
  const headerLabel = girlName ? `${girlName}` : typazhName;
  const headerSubLabel = girlName ? typazhName : '';
  const placeName = initial?.place || '';
  const typazhInfo = findSimTypazhByName(typazhName);
  const typeColor = initial?.type_color || typazhInfo?.color || 'rgba(168,85,247';

  // Auto-scroll к низу при новом сообщении
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, showTyping]);

  // Сохраняем messages в storage (для восстановления после reload)
  useEffect(() => {
    if (!storageKey) return;
    const stored = storage.get<StoredSession | null>(storageKey, null);
    storage.set(storageKey, {
      ...(stored || {}),
      session_id: sessionId,
      messages,
      difficulty: stored?.difficulty,
      typazh: stored?.typazh || typazhName,
      place: stored?.place || placeName,
      type_color: stored?.type_color || typeColor,
    });
  }, [messages, storageKey, sessionId, typazhName, placeName, typeColor]);

  // BackButton — подтверждение
  const onBack = useCallback(() => {
    if (aiLoading) return;
    if (messages.length > 0) {
      if (!confirm('Выйти из чата? Прогресс сохранится.')) return;
    }
    nav(-1);
  }, [aiLoading, messages.length, nav]);
  useBackButton(onBack);

  const send = async () => {
    const text = input.trim();
    if (!text || aiLoading || !sessionId) return;

    impactHaptic('light');
    setInput('');
    setMessages(prev => [...prev, { from: 'me', text }]);
    setAiLoading(true);
    typingTimerRef.current = window.setTimeout(() => setShowTyping(true), 700);

    try {
      const res = await sendSimulatorMessage({ sessionId, message: text });
      setMessages(prev => [...prev, { from: 'her', text: res.response }]);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        // Откатим только что добавленное сообщение «from: me» — иначе после
        // апгрейда история окажется с дубликатом.
        setMessages(prev => prev.slice(0, -1));
        setInput(text); // вернём текст в поле ввода
        if (e.code === 'SIM_LIMIT_EXCEEDED') {
          setLimitSheet('sim_limit');
        } else {
          setLimitSheet('limit');
        }
        await refreshMe();
        return;
      }
      setMessages(prev => [...prev, { from: 'her', text: 'Что-то меня сбило, повтори?' }]);
    } finally {
      if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      setShowTyping(false);
      setAiLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const openHints = async () => {
    setHintsOpen(true);
    if (hints.length > 0 && messages.length === hintsMsgCount) return;
    if (!sessionId || messages.length === 0) {
      setHints([
        { type: 'юмор', text: 'Звучит как начало детективной истории, продолжай' },
        { type: 'переход', text: 'А ты как вообще проводишь свободное время?' },
        { type: 'интерес', text: 'А что тебе в этом нравится больше всего?' },
      ]);
      setHintsMsgCount(messages.length);
      return;
    }
    setHintsLoading(true);
    try {
      const res = await getSimulatorHints({ sessionId });
      if (res.hints?.length) {
        setHints(res.hints);
        setHintsMsgCount(messages.length);
      }
    } catch (_) {} finally {
      setHintsLoading(false);
    }
  };

  const useHint = (text: string) => {
    impactHaptic('light');
    setInput(text);
    setHintsOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const openAnalysis = async () => {
    setAnalysisOpen(true);
    if (analysisData && messages.length === analysisMsgCount) return;
    if (!sessionId || messages.length < 2) return;
    setAnalysisLoading(true);
    try {
      const res = await analyzeSimulator({ sessionId });
      if (res.result) {
        setAnalysisData(res.result);
        setAnalysisMsgCount(messages.length);
      }
    } catch (_) {} finally {
      setAnalysisLoading(false);
    }
  };

  const finish = async () => {
    if (!sessionId || aiLoading) return;
    notificationHaptic('success');
    // Сохраним последний снимок
    if (storageKey) {
      const stored = storage.get<StoredSession | null>(storageKey, null);
      storage.set(storageKey, { ...(stored || {}), session_id: sessionId, messages });
    }
    nav(`/simulator/result/${encodeURIComponent(sessionId)}?key=${encodeURIComponent(storageKey)}`);
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.headerBtn} aria-label="Назад">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2}>
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div style={{ ...styles.avatar, background: `${typeColor},0.18)` }}>
          <svg width={26} height={32} viewBox="0 0 48 64">
            <ellipse cx={24} cy={20} rx={12} ry={14} fill={`${typeColor},0.4)`} stroke={`${typeColor},0.6)`} strokeWidth={1.5} />
            <ellipse cx={24} cy={50} rx={16} ry={14} fill={`${typeColor},0.3)`} stroke={`${typeColor},0.6)`} strokeWidth={1.5} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.headerName}>{headerLabel}</div>
          <div style={styles.headerSub}>
            {headerSubLabel ? `${headerSubLabel} • ` : ''}
            {placeName ? `${placeName} • ` : ''}AI-симуляция
          </div>
        </div>
        <button onClick={openAnalysis} style={styles.analyzeBtn}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={2}>
            <circle cx={11} cy={11} r={8} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <span>Разбор</span>
        </button>
      </div>

      {/* Messages */}
      <div style={styles.messagesArea}>
        {messages.length === 0 && !showTyping && (
          <div style={styles.emptyHint}>
            Напиши первое сообщение — задай тон и спроси что-то конкретное
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} from={m.from}>{m.text}</ChatBubble>
        ))}
        {showTyping && <ChatBubble from="her" typing />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={styles.inputArea}>
        <div style={styles.inputRow}>
          <div style={styles.inputWrap}>
            <AutoGrowTextarea
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={send}
              placeholder="Напиши сообщение..."
              disabled={aiLoading}
              maxHeight={100}
            />
          </div>
          <button onClick={openHints} style={styles.hintBtn} aria-label="Подсказка">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={2}>
              <path d="M9 18h6" /><path d="M10 22h4" />
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" />
            </svg>
          </button>
          <button
            onClick={send}
            disabled={!input.trim() || aiLoading}
            style={{ ...styles.sendBtn, opacity: !input.trim() || aiLoading ? 0.5 : 1 }}
            aria-label="Отправить"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
              <line x1={22} y1={2} x2={11} y2={13} />
              <polygon points="22,2 15,22 11,13 2,9 22,2" />
            </svg>
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <SecondaryButton onClick={finish} disabled={aiLoading} full>
            Завершить и разобрать
          </SecondaryButton>
        </div>
      </div>

      {/* Hints sheet */}
      {hintsOpen && (
        <BottomSheet title="Подсказки" subtitle="Тапни вариант — он подставится в инпут" onClose={() => setHintsOpen(false)}>
          {hintsLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Генерирую варианты...</div>
          ) : hints.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Напиши хотя бы одно сообщение — и я предложу варианты ответа на её ход.
            </div>
          ) : (
            hints.map((h, i) => (
              <button key={i} onClick={() => useHint(h.text)} style={styles.hintOption}>
                <span style={styles.hintBadge}>{h.type}</span>
                <span style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: '21px' }}>{h.text}</span>
              </button>
            ))
          )}
        </BottomSheet>
      )}

      {/* Analysis sheet */}
      {analysisOpen && (
        <BottomSheet
          title="Промежуточный разбор"
          subtitle={`По ${messages.length} сообщениям`}
          onClose={() => setAnalysisOpen(false)}
        >
          {analysisLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Анализирую диалог...</div>
          ) : messages.length < 2 ? (
            <Card>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                Нужно минимум 2 сообщения, чтобы оценить динамику.
              </p>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Её вовлечённость', value: analysisData?.engagement ?? 0, color: 'var(--status-positive)' },
                { label: 'Темп диалога',     value: analysisData?.interest    ?? 0, color: 'var(--status-warning)' },
                { label: 'Качество твоей игры', value: analysisData?.quality   ?? 0, color: 'var(--status-positive)' },
              ].map((it, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{it.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: it.color }}>{it.value}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <div style={{ width: `${it.value}%`, height: '100%', background: it.color, transition: 'width 240ms' }} />
                  </div>
                </div>
              ))}
              {analysisData?.recommendation && (
                <Card style={{ background: 'var(--bg-elevated)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', marginBottom: 4 }}>Рекомендация</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: '19px' }}>{analysisData.recommendation}</div>
                </Card>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      <LimitReachedSheet
        open={limitSheet != null}
        reason={limitSheet || 'limit'}
        onClose={() => setLimitSheet(null)}
      />
    </div>
  );
}

// ── Bottom-sheet helper (для hints/analysis) ──────────────────────────────────
function BottomSheet({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: any;
}) {
  return (
    <div style={styles.sheetOverlay} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.sheetDrag} />
        <div style={styles.sheetHeader}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Закрыть" style={{ padding: 4 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
              <line x1={18} y1={6} x2={6} y2={18} />
              <line x1={6} y1={6} x2={18} y2={18} />
            </svg>
          </button>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{subtitle}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    paddingTop: 'var(--safe-top)',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  headerBtn: { padding: 4, cursor: 'pointer' },
  avatar: { width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerSub:  { fontSize: 11, color: 'var(--text-muted)' },
  analyzeBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px',
    border: '1px solid var(--border-accent)',
    borderRadius: 10,
    background: 'var(--accent-soft)',
    fontSize: 12, color: 'var(--text-accent)',
    cursor: 'pointer',
  },

  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  emptyHint: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
    padding: '32px 16px',
  },

  inputArea: {
    padding: '12px 16px',
    paddingBottom: `calc(var(--safe-bottom) + 16px)`,
    background: 'var(--bg-card)',
    borderTop: '1px solid var(--border-subtle)',
  },
  inputRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  inputWrap: {
    flex: 1,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  hintBtn: {
    width: 40, height: 40,
    border: '1px solid var(--border-accent)',
    borderRadius: 12,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    background: 'transparent',
  },
  sendBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    background: 'var(--gradient-accent)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },

  sheetOverlay: {
    position: 'fixed', inset: 0,
    background: 'var(--modal-overlay)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    background: 'var(--bg-card)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: '12px 20px 40px',
    maxHeight: '85vh',
    overflowY: 'auto',
  },
  sheetDrag: { width: 36, height: 4, borderRadius: 2, background: 'var(--border-default)', margin: '0 auto 8px' },
  sheetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },

  hintOption: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
  },
  hintBadge: {
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-accent)',
    background: 'var(--accent-soft)',
    borderRadius: 8,
    marginTop: 1,
    flexShrink: 0,
  },
};
