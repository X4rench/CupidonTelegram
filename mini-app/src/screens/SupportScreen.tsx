// ═══════════════════════════════════════════════════════════════
// SupportScreen — «Поддержи её». Сгенерировать поддерживающие сообщения.
// POST /analysis/support → responses[] (текст вариантов поддержки)
// ═══════════════════════════════════════════════════════════════
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { IOSPasteHint } from '../components/IOSPasteHint';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import { generateSupport, ApiError } from '../api';

const PAGE_SIZE = 3;
const REGEN_LIMIT = 2; // итого 3 страницы (если AI вернёт 9+)

const SUPPORT_TAGS = [
  'грусть', 'обида', 'злость', 'усталость', 'болезнь',
  'тревога', 'ссора с близкими', 'неуверенность', 'выгорание',
];

export function SupportScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [situation, setSituation] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ResultItem хранит text + level — точно как в Стреле text+why.
  type ResultItem = { text: string; level?: string };
  const [results, setResults] = useState<ResultItem[]>([]);
  const [page, setPage] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);

  const toggleTag = (t: string) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSubmit = async () => {
    if (loading) return;
    const trimmed = situation.trim();
    if (trimmed.length < 10) {
      setError('Опиши ситуацию подробнее.');
      return;
    }
    impactHaptic('medium');
    setLoading(true);
    setError(null);
    setResults([]);
    setPage(0);
    setCopiedIdx(null);
    try {
      const res = await generateSupport({ situationText: trimmed, tags, withContext: false });
      const items: ResultItem[] = Array.isArray((res as any).responses)
        ? (res as any).responses.map((r: any) => {
            if (typeof r === 'string') return { text: r };
            return { text: r?.text || '', level: r?.level };
          }).filter((r: ResultItem) => r.text)
        : [];
      setResults(items);
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        setLimitSheet('limit');
        setLoading(false);
        return;
      }
      setError(e?.message || 'Не удалось сгенерировать. Попробуй ещё.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  // Человекочитаемый level → подсказка под текстом (как why в Стреле)
  const levelHint = (level?: string): string => {
    if (!level) return '';
    const L = level.toUpperCase();
    if (L === 'ЛЁГКИЙ')    return 'лёгкая поддержка — снимает напряжение, без давления';
    if (L === 'УВЕРЕННЫЙ') return 'уверенная поддержка — даёт ощущение опоры';
    if (L === 'ДЕРЗКИЙ')   return 'дерзкая поддержка — выдёргивает из переживаний с улыбкой';
    return level.toLowerCase();
  };

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1400);
    } catch (_) {}
  };

  const onRegenerate = () => {
    if (page >= REGEN_LIMIT) return;
    impactHaptic('light');
    setPage(p => Math.min(p + 1, REGEN_LIMIT));
    setCopiedIdx(null);
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
        <h1 style={styles.h1}>Поддержи её 💜</h1>
        <p style={styles.intro}>
          Опиши что у неё происходит. AI напишет 3-5 вариантов поддержки которые звучат искренне, а не как шаблон из мессенджера.
        </p>

        <label style={styles.label}>Что случилось</label>
        <Card style={styles.inputCard}>
          <AutoGrowTextarea
            value={situation}
            onChange={setSituation}
            placeholder="Например: у неё умер кот, она пишет «я не могу», уже два дня не отвечает на звонки"
            maxHeight={220}
            style={{ minHeight: 100, padding: 0 }}
          />
        </Card>
        <IOSPasteHint />

        <label style={styles.label}>Что она сейчас чувствует (опц.)</label>
        <div style={styles.tagsRow}>
          {SUPPORT_TAGS.map(t => (
            <Chip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
        </div>

        {/* Кнопка «Сгенерировать» прячется после успеха — далее
            используем «Ещё» в блоке результатов (как в Стреле). */}
        {!hasResults && (
          <div style={{ marginTop: 16 }}>
            <GradientButton full loading={loading} onClick={handleSubmit}>
              {loading ? 'AI пишет…' : 'Сгенерировать'}
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
                  {page >= REGEN_LIMIT ? 'Лимит' : 'Ещё'}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleResults.map((r, i) => (
                <div key={`p${page}-${i}`} style={styles.responseItem}>
                  <button
                    onClick={() => copyText(r.text, i)}
                    style={styles.copyBtn}
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
                  <p style={styles.responseText}>{r.text}</p>
                  {r.level && (
                    <p style={styles.responseWhy}>{levelHint(r.level)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
  inputCard:    { padding: '8px 12px' },
  tagsRow:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
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
    border: 0, cursor: 'pointer', padding: 0,
  },
  // Стрело-аналогичный responseItem — bg-elevated div, не Card.
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
    top: 10, right: 10,
    padding: 4,
    background: 'transparent',
    cursor: 'pointer',
    border: 0,
  },
  responseText: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-primary)' },
  responseWhy:  { margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: '15px' },
};
