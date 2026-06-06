// ═══════════════════════════════════════════════════════════════
// FirstMessageScreen — генерация первого сообщения.
//
// POST /first-message/generate возвращает 9 вариантов. Показываем по 3
// за раз. «Перегенерировать» × 2 — переключаем страницу. После 3-й
// страницы кнопка disabled (лимит исчерпан).
//
// «Что её интересует» — теги из SUGGESTED_TAGS + кнопка «➕ своё»
// (модалка с инпутом, как имя контакта в Стреле).
// ═══════════════════════════════════════════════════════════════
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import { generateFirstMessage, ApiError } from '../api';

const SUGGESTED_TAGS = [
  'спорт', 'музыка', 'путешествия', 'кино', 'книги',
  'кофе', 'еда', 'животные', 'танцы', 'арт',
  'фотография', 'природа', 'мода',
];

const PAGE_SIZE = 3;
const REGEN_LIMIT = 2; // 3 страницы × 3 варианта = 9 на запрос всего

export function FirstMessageScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [girlName, setGirlName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTagModalOpen, setCustomTagModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [profile, setProfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [page, setPage] = useState(0);   // текущая страница (0..REGEN_LIMIT)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const toggleTag = (t: string) => {
    selectionHaptic();
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const addCustomTag = () => {
    const v = newTagInput.trim().toLowerCase().slice(0, 24);
    if (!v) { setCustomTagModalOpen(false); return; }
    if (!tags.includes(v)) {
      setTags(prev => [...prev, v]);
      notificationHaptic('success');
    }
    setNewTagInput('');
    setCustomTagModalOpen(false);
  };

  const handleSubmit = async () => {
    if (loading) return;
    impactHaptic('medium');
    setLoading(true);
    setError(null);
    setResults([]);
    setPage(0);
    setCopiedIdx(null);
    try {
      const res = await generateFirstMessage({
        girlName: girlName.trim() || undefined,
        tags,
        profileText: profile.trim(),
      });
      const msgs: string[] = Array.isArray((res as any).messages)
        ? (res as any).messages.map((m: any) => typeof m === 'string' ? m : (m?.text || ''))
        : [];
      setResults(msgs.filter(Boolean));
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        setLimitSheet('limit');
        setLoading(false);
        return;
      }
      setError(e?.message || 'Не удалось сгенерировать. Попробуй ещё раз.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const onRegenerate = () => {
    if (page >= REGEN_LIMIT) return;
    impactHaptic('light');
    setPage(p => Math.min(p + 1, REGEN_LIMIT));
    setCopiedIdx(null);
  };

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1400);
    } catch (_) {}
  };

  const visibleResults = useMemo(
    () => results.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [results, page],
  );

  const hasResults = results.length > 0;
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Первое сообщение</h1>
        <p style={styles.intro}>
          Скажи что знаешь о ней — её увлечения, что было в профиле.
          AI напишет 3 варианта, на которые трудно не ответить.
        </p>

        <label style={styles.label}>Её имя (опц.)</label>
        <input
          value={girlName}
          onChange={e => setGirlName(e.target.value)}
          placeholder="Например, Аня"
          style={styles.input}
          maxLength={30}
        />

        <label style={styles.label}>Что её интересует</label>
        <div style={styles.tagsRow}>
          {SUGGESTED_TAGS.map(t => (
            <Chip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
          {/* Кастомные теги юзера (если есть и не в SUGGESTED) */}
          {tags.filter(t => !SUGGESTED_TAGS.includes(t)).map(t => (
            <Chip key={`u-${t}`} active onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
          {/* Кнопка «➕ своё» — как обычный chip */}
          <button
            onClick={() => { selectionHaptic(); setCustomTagModalOpen(true); }}
            style={styles.addChip}
            aria-label="Добавить своё"
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span>своё</span>
          </button>
        </div>

        <label style={styles.label}>Что у неё в профиле (опц.)</label>
        <Card style={{ padding: '8px 12px' }}>
          <AutoGrowTextarea
            value={profile}
            onChange={setProfile}
            placeholder="Например: лет 25, учится на дизайнера, любит кофейни, котов и хайкинг…"
            maxHeight={180}
            style={{ minHeight: 80, padding: 0 }}
          />
        </Card>

        {/* Кнопка «Сгенерировать» прячется после успешной генерации —
            юзер дальше использует «Перегенерировать» в блоке результатов */}
        {!hasResults && (
          <div style={{ marginTop: 16 }}>
            <GradientButton full loading={loading} onClick={handleSubmit}>
              {loading ? 'AI думает…' : 'Сгенерировать'}
            </GradientButton>
          </div>
        )}

        {error && (
          <Card style={{ marginTop: 16, borderColor: 'var(--status-negative)' }}>
            <p style={{ margin: 0, color: 'var(--status-negative)', fontSize: 14 }}>{error}</p>
            <div style={{ marginTop: 12 }}>
              <SecondaryButton onClick={handleSubmit}>Попробовать ещё</SecondaryButton>
            </div>
          </Card>
        )}

        {hasResults && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={styles.resultsHeader}>
              <span style={styles.resultsTitle}>
                Варианты {page + 1} / {totalPages}
              </span>
              <button
                onClick={onRegenerate}
                disabled={page >= REGEN_LIMIT || loading}
                style={{
                  ...styles.regenBtn,
                  opacity: page >= REGEN_LIMIT ? 0.5 : 1,
                  cursor: page >= REGEN_LIMIT ? 'default' : 'pointer',
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                     stroke={page >= REGEN_LIMIT ? 'var(--text-muted)' : 'var(--text-accent)'}
                     strokeWidth={2} strokeLinecap="round">
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                <span style={{
                  fontSize: 12,
                  color: page >= REGEN_LIMIT ? 'var(--text-muted)' : 'var(--text-accent)',
                }}>
                  {page >= REGEN_LIMIT ? 'Лимит' : `Ещё ${REGEN_LIMIT - page}`}
                </span>
              </button>
            </div>

            <div style={styles.pagination}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => { selectionHaptic(); setPage(i); setCopiedIdx(null); }}
                  style={{
                    ...styles.paginationDot,
                    background: i === page ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                  aria-label={`Страница ${i + 1}`}
                />
              ))}
            </div>

            {visibleResults.map((text, i) => (
              <Card key={`p${page}-${i}`} style={styles.responseCard}>
                <button
                  onClick={() => copyText(text, i)}
                  style={styles.copyIconBtn}
                  aria-label="Скопировать"
                >
                  {copiedIdx === i ? (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                         stroke="var(--status-positive)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                  ) : (
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                         stroke="var(--text-muted)" strokeWidth={2}>
                      <rect x={9} y={9} width={13} height={13} rx={2} />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
                <p style={styles.responseText}>{text}</p>
              </Card>
            ))}

            {/* Кнопка «Сгенерировать заново» снизу — для случая когда юзер
                поменял теги/имя/профиль и хочет полный новый запрос */}
            <div style={{ marginTop: 8 }}>
              <SecondaryButton onClick={handleSubmit} loading={loading} full>
                Сгенерировать новые с другими параметрами
              </SecondaryButton>
            </div>
          </div>
        )}
      </div>

      {/* Модалка ввода кастомного тега */}
      {customTagModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setCustomTagModalOpen(false)}>
          <div style={styles.modalSheet} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHandle} />
            <div style={styles.modalTitle}>Что её интересует</div>
            <div style={styles.modalSub}>
              Напиши одно слово или короткую фразу. Например: «йога», «настолки», «киноклассика».
            </div>
            <input
              autoFocus
              value={newTagInput}
              onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); }}
              placeholder="…"
              maxLength={24}
              style={styles.modalInput}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setCustomTagModalOpen(false); setNewTagInput(''); }}
                style={styles.modalCancel}
              >Отмена</button>
              <GradientButton onClick={addCustomTag} disabled={!newTagInput.trim()} full>
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

const styles: Record<string, CSSProperties> = {
  container:    { padding: '24px 20px' },
  h1:           { margin: 0, fontSize: 24, fontWeight: 700 },
  intro:        { marginTop: 8, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 },
  label:        { display: 'block', marginTop: 20, marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' },
  input:        { width: '100%', padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' },
  tagsRow:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  addChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 12px',
    border: '1px dashed var(--border-accent)',
    background: 'transparent',
    color: 'var(--text-accent)',
    borderRadius: 16,
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
  },

  resultsHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  resultsTitle: {
    fontSize: 13, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700,
  },
  regenBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px',
    border: '1px solid var(--border-accent)',
    background: 'var(--accent-soft)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex', gap: 6, justifyContent: 'center',
  },
  paginationDot: {
    width: 24, height: 4, borderRadius: 2,
    border: 0,
    cursor: 'pointer',
    padding: 0,
  },

  responseCard: {
    position: 'relative',
    paddingRight: 40,
  },
  copyIconBtn: {
    position: 'absolute',
    top: 10, right: 10,
    width: 28, height: 28,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 0, borderRadius: 8,
    background: 'var(--bg-elevated)',
    cursor: 'pointer',
  },
  responseText: {
    margin: 0,
    fontSize: 15, lineHeight: '21px',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
  },

  // Модалка
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  },
  modalSheet: {
    width: '100%', maxWidth: 520,
    background: 'var(--bg-card)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: '14px 18px',
    paddingBottom: 'calc(18px + var(--safe-bottom))',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalHandle: {
    width: 38, height: 4,
    background: 'var(--border-default)',
    borderRadius: 2, margin: '0 auto 4px',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  modalSub: {
    fontSize: 13, color: 'var(--text-secondary)', lineHeight: '18px',
  },
  modalInput: {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: 15,
  },
  modalCancel: {
    flex: 1,
    padding: 12, borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
  },
};
