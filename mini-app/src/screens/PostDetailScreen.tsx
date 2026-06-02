// ═══════════════════════════════════════════════════════════════
// PostDetailScreen — полная статья из POSTS (utils/posts.ts).
// Роут /post/:slug. Если slug не найден — редирект на /community.
// Рендерит markdown-lite blocks (h2/p/ul/ol/callout/quote/divider).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useBackButton } from '../utils/backButton';
import { POSTS, type Post, type PostBlock } from '../utils/posts';

export function PostDetailScreen() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const post = useMemo<Post | undefined>(
    () => POSTS.find(p => p.slug === slug),
    [slug],
  );

  // Грабли §5.27 — на несуществующий slug редиректим, не показываем белый экран
  useEffect(() => {
    if (slug && !post) nav('/community', { replace: true });
  }, [slug, post, nav]);

  if (!post) return null;

  return (
    <Layout>
      <article style={styles.article}>
        {post.image && (
          <div style={{
            ...styles.hero,
            backgroundImage: `url(${post.image})`,
          }} />
        )}

        <div style={styles.content}>
          <div style={styles.metaRow}>
            <span style={styles.tag}>{post.tag}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{post.readTime}</span>
          </div>

          <h1 style={styles.title}>{post.title}</h1>
          <p style={styles.idea}>{post.idea}</p>

          {post.intro && (
            <p style={styles.intro}>{post.intro}</p>
          )}

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {post.sections.map((block, i) => <Block key={i} block={block} />)}
          </div>
        </div>
      </article>
    </Layout>
  );
}

function Block({ block }: { block: PostBlock }) {
  switch (block.type) {
    case 'h2':
      return <h2 style={styles.h2}>{block.text}</h2>;
    case 'p':
      return <p style={styles.p}>{block.text}</p>;
    case 'ul':
      return (
        <ul style={styles.list}>
          {block.items.map((item, i) => <li key={i} style={styles.li}>{item}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol style={styles.list}>
          {block.items.map((item, i) => <li key={i} style={styles.li}>{item}</li>)}
        </ol>
      );
    case 'callout':
      return (
        <div style={{
          ...styles.callout,
          background: block.tone === 'warn' ? 'rgba(239,68,68,0.1)'
                    : block.tone === 'tip'  ? 'rgba(34,197,94,0.1)'
                    : 'rgba(245,158,11,0.1)',
          borderColor:  block.tone === 'warn' ? 'var(--status-negative)'
                      : block.tone === 'tip'  ? 'var(--status-positive)'
                      : 'var(--status-warning)',
        }}>
          <span style={{ marginRight: 8 }}>
            {block.tone === 'warn' ? '⚠️' : block.tone === 'tip' ? '✅' : '💡'}
          </span>
          {block.text}
        </div>
      );
    case 'quote':
      return <blockquote style={styles.quote}>{block.text}</blockquote>;
    case 'divider':
      return <hr style={styles.divider} />;
    default:
      return null;
  }
}

const styles: Record<string, CSSProperties> = {
  article:   { paddingBottom: 32 },
  hero:      { height: 220, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'var(--bg-elevated)' },
  content:   { padding: '24px 20px' },
  metaRow:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  tag:       { padding: '4px 10px', borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--text-accent)', fontSize: 12, fontWeight: 500 },
  title:     { margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.2 },
  idea:      { marginTop: 8, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.5 },
  intro:     { marginTop: 16, fontSize: 15, lineHeight: 1.6 },
  h2:        { margin: '12px 0 4px', fontSize: 18, fontWeight: 700 },
  p:         { margin: 0, fontSize: 15, lineHeight: 1.6 },
  list:      { margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 },
  li:        { fontSize: 15, lineHeight: 1.6 },
  callout:   { padding: 14, borderRadius: 12, borderLeft: '3px solid', fontSize: 14, lineHeight: 1.5 },
  quote:     { margin: 0, padding: '12px 0 12px 16px', borderLeft: '3px solid var(--accent-primary)', fontSize: 16, fontStyle: 'italic', color: 'var(--text-secondary)' },
  divider:   { border: 0, height: 1, background: 'var(--border-subtle)', margin: '12px 0' },
};
