// ═══════════════════════════════════════════════════════════════
// RejectionScreen — разбор отказа.
// POST /analysis/rejection → result: { score, errors, principles, summary }
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { IOSPasteHint } from '../components/IOSPasteHint';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { analyzeRejection, ApiError } from '../api';

interface RejectionResult {
  score?: number;
  errors?: Array<string | { text?: string }>;
  principles?: Array<string | { text?: string }>;
  summary?: string;
}

export function RejectionScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RejectionResult | null>(null);

  const handleSubmit = async () => {
    if (loading) return;
    const trimmed = text.trim();
    if (trimmed.length < 30) {
      setError('Опиши переписку подробнее — минимум 30 символов.');
      return;
    }
    impactHaptic('medium');
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyzeRejection({ text: trimmed });
      setResult(res.result || {});
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        nav('/paywall', { state: { reason: 'limit' } });
        return;
      }
      setError(e?.message || 'Не удалось разобрать. Попробуй ещё.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const toStr = (x: string | { text?: string }) =>
    typeof x === 'string' ? x : (x?.text || '');

  const scoreColor = (s: number) => s >= 6.5 ? 'var(--status-positive)' : s >= 4 ? 'var(--status-warning)' : 'var(--status-negative)';

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Разбор отказа</h1>
        <p style={styles.intro}>
          Вставь переписку которая привела к слому диалога. AI скажет где ты сорвался, что можно было сделать иначе, и насколько близко был к успеху.
        </p>

        <label style={styles.label}>Переписка</label>
        <AutoGrowTextarea
          value={text}
          onChange={setText}
          placeholder="Я: Привет, как дела?&#10;Она: Норм. А ты что хочешь?&#10;Я: …"
          maxHeight={300}
          style={{ minHeight: 140 }}
        />
        <IOSPasteHint />

        <div style={{ marginTop: 16 }}>
          <GradientButton full loading={loading} onClick={handleSubmit}>
            {loading ? 'AI разбирает…' : 'Разобрать'}
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

        {result && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {typeof result.score === 'number' && (
              <Card accent style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  ...styles.scoreCircle,
                  color: scoreColor(result.score),
                  borderColor: scoreColor(result.score),
                }}>
                  {result.score.toFixed(1)}
                </div>
                <div>
                  <div style={styles.scoreLabel}>Насколько был близок</div>
                  <div style={styles.scoreSub}>из 10 возможных</div>
                </div>
              </Card>
            )}

            {result.errors && result.errors.length > 0 && (
              <Card>
                <div style={styles.sectionTitle}>❌ Где сорвалось</div>
                <ul style={styles.list}>
                  {result.errors.map((e, i) => (
                    <li key={i} style={styles.listItem}>{toStr(e)}</li>
                  ))}
                </ul>
              </Card>
            )}

            {result.principles && result.principles.length > 0 && (
              <Card>
                <div style={styles.sectionTitle}>✅ Принципы</div>
                <ul style={styles.list}>
                  {result.principles.map((p, i) => (
                    <li key={i} style={styles.listItem}>{toStr(p)}</li>
                  ))}
                </ul>
              </Card>
            )}

            {result.summary && (
              <Card>
                <div style={styles.sectionTitle}>Итог</div>
                <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5 }}>{result.summary}</p>
              </Card>
            )}
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
  scoreCircle:  { width: 56, height: 56, borderRadius: '50%', border: '3px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 },
  scoreLabel:   { fontSize: 14, fontWeight: 600 },
  scoreSub:     { fontSize: 12, color: 'var(--text-muted)' },
  sectionTitle: { fontSize: 14, fontWeight: 600 },
  list:         { margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 },
  listItem:     { fontSize: 14, lineHeight: 1.5 },
};
