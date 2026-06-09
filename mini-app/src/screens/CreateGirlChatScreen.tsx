// ═══════════════════════════════════════════════════════════════
// CreateGirlChatScreen — чат с созданной AI-девушкой.
// Route: /create-girl/chat/:girlId
//
// Профиль девушки берём из storage `custom_girls` по girlId.
// Стартуем session через /simulator/start, отвечает через /simulator/ai-girl.
// Сохраняем messages по storage-key `girl_chat_<girlId>` (восстановление
// после reload — грабли §5.22).
// Фото — re-resolve blob:URL через IndexedDB (§5.1).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { ChatBubble } from '../components/ChatBubble';
import { AutoGrowTextarea, type AutoGrowTextareaHandle } from '../components/AutoGrowTextarea';
import { SecondaryButton } from '../components/SecondaryButton';
import {
  startSimulator,
  sendAiGirlMessage,
  analyzeSimulator,
  clientDiag,
  ApiError,
} from '../api';
import { storage } from '../utils/storage';
import { findCustomGirl, loadCustomGirls } from '../utils/customGirls';
import { idbGetPhotoUrl } from '../utils/indexedDB';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';

interface ChatMsg { from: 'me' | 'her'; text: string }
interface Stored {
  session_id: string;
  messages: ChatMsg[];
}

export function CreateGirlChatScreen() {
  const nav = useNavigate();
  const { girlId } = useParams<{ girlId: string }>();
  const decodedId = girlId ? decodeURIComponent(girlId) : '';

  const girl = decodedId ? findCustomGirl(decodedId) : null;
  const storageKey = `girl_chat_${decodedId}`;

  const initial = storage.get<Stored | null>(storageKey, null);
  const [sessionId, setSessionId] = useState<string>(initial?.session_id || '');
  const [messages, setMessages] = useState<ChatMsg[]>(initial?.messages || []);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const typingTimer = useRef<number | null>(null);
  const inputRef = useRef<AutoGrowTextareaHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Re-resolve blob:URL (§5.1)
  useEffect(() => {
    if (!girl?.photoBlobId) return;
    let revoke = '';
    idbGetPhotoUrl(girl.photoBlobId).then(url => { if (url) { setPhotoUrl(url); revoke = url; } });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [girl?.photoBlobId]);

  // Стартуем сессию если ещё нет
  useEffect(() => {
    if (!girl || sessionId) return;
    startSimulator({
      typazh: girl.typazh || girl.typazhes?.[0] || 'AI',
      place: 'Переписка',
      difficulty: girl.difficulty ?? 5,
    })
      .then(res => {
        setSessionId(res.session_id);
        storage.set(storageKey, { session_id: res.session_id, messages });
      })
      .catch((e: any) => {
        if (e instanceof ApiError && e.status === 429 && e.code === 'LIMIT_EXCEEDED') {
          nav('/paywall');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [girl, sessionId, storageKey]);

  // Save messages
  useEffect(() => {
    if (!sessionId) return;
    storage.set(storageKey, { session_id: sessionId, messages });
  }, [messages, sessionId, storageKey]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, showTyping]);

  // BackButton
  const onBack = useCallback(() => {
    if (aiLoading) return;
    nav(-1);
  }, [aiLoading, nav]);
  useBackButton(onBack);

  // Диагностика: если девушка не нашлась — собираем подробный context
  // и шлём в /diag/client-log. Так мы (админ) увидим какие girls есть
  // в storage юзера и почему искомый id не нашёлся. Делаем 1 раз через
  // ref-flag чтобы не спамить при каждом render.
  const diagSentRef = useRef(false);
  useEffect(() => {
    if (girl || diagSentRef.current || !decodedId) return;
    diagSentRef.current = true;
    try {
      const tg: any = (window as any)?.Telegram?.WebApp;
      const all = loadCustomGirls();
      const lsKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /custom_girls/.test(k)) lsKeys.push(k);
      }
      clientDiag('create_girl_not_found', {
        requested_id: decodedId,
        url_param_raw: girlId,
        stored_count: all.length,
        stored_ids: all.map(g => g.id).slice(0, 10),
        stored_names: all.map(g => g.name).slice(0, 10),
        ls_keys_matching_custom_girls: lsKeys,
        ls_total_keys: localStorage.length,
        tg_init_user_id: tg?.initDataUnsafe?.user?.id || null,
        tg_platform: tg?.platform || null,
        tg_version: tg?.version || null,
        path: window.location.pathname,
      });
    } catch (_) {}
  }, [girl, decodedId, girlId]);

  if (!girl) {
    return (
      <div style={{ padding: 24 }}>
        <Card style={{ borderColor: 'var(--status-negative)' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
            Девушка не найдена. Создай новую.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            ID в URL: <code style={{ fontFamily: 'ui-monospace, monospace' }}>{decodedId || '(пусто)'}</code>
          </p>
        </Card>
        <div style={{ marginTop: 12 }}>
          <SecondaryButton onClick={() => nav('/create-girl')} full>← К созданию</SecondaryButton>
        </div>
      </div>
    );
  }

  const send = async () => {
    const text = input.trim();
    if (!text || aiLoading || !sessionId) return;
    impactHaptic('light');
    setInput('');
    setMessages(prev => [...prev, { from: 'me', text }]);
    setAiLoading(true);
    typingTimer.current = window.setTimeout(() => setShowTyping(true), 700);
    try {
      const res = await sendAiGirlMessage({
        sessionId,
        message: text,
        girlProfile: {
          name: girl.name,
          typazh: girl.typazh,
          character: girl.character,
          comm_style: girl.commStyle,
          hobbies: girl.hobbies || [],
          description: girl.description || '',
        },
      });
      setMessages(prev => [...prev, { from: 'her', text: res.response }]);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429 && e.code === 'LIMIT_EXCEEDED') {
        nav('/paywall');
        return;
      }
      setMessages(prev => [...prev, { from: 'her', text: 'Не услышала тебя, попробуй ещё раз?' }]);
    } finally {
      if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
      setShowTyping(false);
      setAiLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const finish = () => {
    if (!sessionId || aiLoading) return;
    notificationHaptic('success');
    nav(`/simulator/result/${encodeURIComponent(sessionId)}?key=${encodeURIComponent(storageKey)}`);
  };

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMsgCount, setAnalysisMsgCount] = useState(-1);

  const openAnalysis = async () => {
    setAnalysisOpen(true);
    if (analysisData && messages.length === analysisMsgCount) return;
    if (!sessionId || messages.length < 2) return;
    setAnalysisLoading(true);
    try {
      const res = await analyzeSimulator({ sessionId });
      if (res.result) { setAnalysisData(res.result); setAnalysisMsgCount(messages.length); }
    } catch (_) {} finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.headerBtn} aria-label="Назад">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2}>
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div style={styles.avatar}>
          {photoUrl ? (
            <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700 }}>{(girl.name || '?').slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.headerName}>{girl.name}</div>
          <div style={styles.headerSub}>{girl.typazhes?.[0] || girl.typazh || 'AI-девушка'} • симуляция</div>
        </div>
        <button onClick={openAnalysis} style={styles.analyzeBtn}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={2}>
            <circle cx={11} cy={11} r={8} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <span>Разбор</span>
        </button>
      </div>

      <div style={styles.messagesArea}>
        {messages.length === 0 && !showTyping && (
          <div style={styles.emptyHint}>
            Напиши первое сообщение — задай тон. {girl.name} ответит в характере, который ты задал.
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} from={m.from}>{m.text}</ChatBubble>
        ))}
        {showTyping && <ChatBubble from="her" typing />}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputArea}>
        <div style={styles.inputRow}>
          <div style={styles.inputWrap}>
            <AutoGrowTextarea
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSubmit={send}
              placeholder="Напиши сообщение..."
              disabled={aiLoading || !sessionId}
              maxHeight={100}
            />
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || aiLoading || !sessionId}
            style={{ ...styles.sendBtn, opacity: !input.trim() || aiLoading || !sessionId ? 0.5 : 1 }}
            aria-label="Отправить"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
              <line x1={22} y1={2} x2={11} y2={13} />
              <polygon points="22,2 15,22 11,13 2,9 22,2" />
            </svg>
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <SecondaryButton onClick={finish} disabled={aiLoading} full>Завершить и разобрать</SecondaryButton>
        </div>
      </div>

      {analysisOpen && (
        <div style={styles.sheetOverlay} onClick={() => setAnalysisOpen(false)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetDrag} />
            <div style={styles.sheetHeader}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Промежуточный разбор</h3>
              <button onClick={() => setAnalysisOpen(false)} aria-label="Закрыть">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                  <line x1={18} y1={6} x2={6} y2={18} />
                  <line x1={6} y1={6} x2={18} y2={18} />
                </svg>
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>По {messages.length} сообщениям</div>
            {analysisLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Анализирую...</div>
            ) : messages.length < 2 ? (
              <Card><p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Минимум 2 сообщения для разбора.</p></Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Вовлечённость', value: analysisData?.engagement ?? 0, color: 'var(--status-positive)' },
                  { label: 'Темп',          value: analysisData?.interest    ?? 0, color: 'var(--status-warning)' },
                  { label: 'Качество',      value: analysisData?.quality     ?? 0, color: 'var(--status-positive)' },
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
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingTop: 'var(--safe-top)', background: 'var(--bg-primary)' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' },
  headerBtn: { padding: 4, cursor: 'pointer' },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    background: 'linear-gradient(135deg, #EC4899, #A855F7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerSub: { fontSize: 11, color: 'var(--text-muted)' },
  analyzeBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px',
    border: '1px solid var(--border-accent)',
    borderRadius: 10,
    background: 'var(--accent-soft)',
    fontSize: 12, color: 'var(--text-accent)',
    cursor: 'pointer',
  },
  messagesArea: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 },
  emptyHint: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '32px 16px' },
  inputArea: { padding: '12px 16px', paddingBottom: 'calc(var(--safe-bottom) + 16px)', background: 'var(--bg-card)', borderTop: '1px solid var(--border-subtle)' },
  inputRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  inputWrap: { flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden' },
  sendBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'var(--gradient-accent)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  sheetOverlay: { position: 'fixed', inset: 0, background: 'var(--modal-overlay)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  sheet: { width: '100%', maxWidth: 520, background: 'var(--bg-card)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '12px 20px 40px', maxHeight: '85vh', overflowY: 'auto' },
  sheetDrag: { width: 36, height: 4, borderRadius: 2, background: 'var(--border-default)', margin: '0 auto 8px' },
  sheetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
};
