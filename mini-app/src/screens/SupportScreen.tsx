// ═══════════════════════════════════════════════════════════════
// SupportScreen — «Поддержи её». Сгенерировать поддерживающие сообщения.
// POST /analysis/support → responses[] (текст вариантов поддержки)
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { generateSupport, ApiError } from '../api';

const SUPPORT_TAGS = [
  'грусть', 'обида', 'злость', 'усталость', 'болезнь',
  'тревога', 'ссора с близкими', 'неуверенность', 'выгорание',
];

export function SupportScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [situation, setSituation] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [withContext, setWithContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);

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
    try {
      const res = await generateSupport({ situationText: trimmed, tags, withContext });
      const msgs: string[] = Array.isArray((res as any).responses)
        ? (res as any).responses.map((r: any) => typeof r === 'string' ? r : (r?.text || ''))
        : [];
      setResults(msgs.filter(Boolean));
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        nav('/paywall', { state: { reason: 'limit' } });
        return;
      }
      setError(e?.message || 'Не удалось сгенерировать. Попробуй ещё.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
    } catch (_) {}
  };

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Поддержи её 💜</h1>
        <p style={styles.intro}>
          Опиши что у неё происходит. AI напишет 3-5 вариантов поддержки которые звучат искренне, а не как шаблон из мессенджера.
        </p>

        <label style={styles.label}>Что случилось</label>
        <AutoGrowTextarea
          value={situation}
          onChange={setSituation}
          placeholder="Например: у неё умер кот, она пишет «я не могу», уже два дня не отвечает на звонки"
          maxHeight={220}
          pasteButton
          pasteButtonLabel="Вставить из буфера"
          style={{ minHeight: 100 }}
        />

        <label style={styles.label}>Что у неё (опц.)</label>
        <div style={styles.tagsRow}>
          {SUPPORT_TAGS.map(t => (
            <Chip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
        </div>

        <label style={styles.toggleRow} onClick={() => setWithContext(v => !v)}>
          <input
            type="checkbox"
            checked={withContext}
            onChange={e => setWithContext(e.target.checked)}
            style={styles.checkbox}
          />
          <span style={{ fontSize: 14 }}>Учитывать историю общения (если вы уже близки)</span>
        </label>

        <div style={{ marginTop: 16 }}>
          <GradientButton full loading={loading} onClick={handleSubmit}>
            {loading ? 'AI пишет…' : 'Сгенерировать'}
          </GradientButton>
        </div>

        {error && (
          <Card style={{ marginTop: 16, borderColor: 'var(--status-negative)' }}>
            <p style={{ margin: 0, color: 'var(--status-negative)', fontSize: 14 }}>{error}</p>
            <div style={{ marginTop: 12 }}>
              <SecondaryButton onClick={handleSubmit}>Попробовать ещё</SecondaryButton>
            </div>
          </Card>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={styles.resultsTitle}>Варианты поддержки</div>
            {results.map((text, i) => (
              <Card key={i}>
                <p style={styles.resultText}>{text}</p>
                <button onClick={() => copyToClipboard(text)} style={styles.copyBtn}>
                  Скопировать
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

const styles: Record<string, CSSProperties> = {
  container:    { padding: '24px 20px' },
  h1:           { margin: 0, fontSize: 24, fontWeight: 700 },
  intro:        { marginTop: 8, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 },
  label:        { display: 'block', marginTop: 20, marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' },
  tagsRow:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  toggleRow:    { display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, color: 'var(--text-primary)', cursor: 'pointer' },
  checkbox:     { width: 18, height: 18, accentColor: 'var(--accent-primary)' },
  resultsTitle: { fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultText:   { margin: 0, fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  copyBtn:      { marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--text-accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
};
