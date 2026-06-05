// ═══════════════════════════════════════════════════════════════
// FirstMessageScreen — генерация первого сообщения.
// POST /first-message/generate → 3 варианта.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
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
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { generateFirstMessage, ApiError } from '../api';

const SUGGESTED_TAGS = [
  'спорт', 'музыка', 'путешествия', 'кино', 'книги',
  'кофе', 'еда', 'животные', 'танцы', 'арт',
  'фотография', 'природа', 'мода',
];

export function FirstMessageScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [girlName, setGirlName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [profile, setProfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);

  const toggleTag = (t: string) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSubmit = async () => {
    if (loading) return;
    impactHaptic('medium');
    setLoading(true);
    setError(null);
    setResults([]);
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
    } catch (_) {}
  };

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Первое сообщение</h1>
        <p style={styles.intro}>
          Скажи что знаешь о ней — её увлечения, что было в профиле. AI напишет 3 варианта, на которые трудно не ответить.
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
        <IOSPasteHint />

        <div style={{ marginTop: 16 }}>
          <GradientButton full loading={loading} onClick={handleSubmit}>
            {loading ? 'AI думает…' : 'Сгенерировать'}
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
            <div style={styles.resultsTitle}>Варианты</div>
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
  resultsTitle: { fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 },
  resultText:   { margin: 0, fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  copyBtn:      { marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--text-accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
};
