// ═══════════════════════════════════════════════════════════════
// CommunityScreen — фид сообщества с реальным backend.
//
// GET /community/feed — список approved постов
// POST/DELETE /community/posts/:id/like — toggle лайка
//
// Юзер из SimulatorResultScreen может «Поделиться в ленту». Пост идёт
// в pending, админ approve/reject в Admin → таб «Модерация».
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, selectionHaptic } from '../utils/haptics';
import { communityApi, type CommunityFeedPost, type CommunityFullPost } from '../api';

export function CommunityScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [posts, setPosts] = useState<CommunityFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [fullPosts, setFullPosts] = useState<Record<number, CommunityFullPost>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    communityApi.feed(30, 0)
      .then(res => { if (!cancelled && res.ok) setPosts(res.posts || []); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Не удалось загрузить ленту'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleOpen = async (id: number) => {
    selectionHaptic();
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    // Подгружаем полный диалог если ещё не загружен
    if (!fullPosts[id]) {
      try {
        const res = await communityApi.getPost(id);
        if (res.ok) setFullPosts(prev => ({ ...prev, [id]: res.post }));
      } catch (_) {}
    }
  };

  const toggleLike = async (id: number) => {
    impactHaptic('light');
    const post = posts.find(p => p.id === id);
    if (!post) return;
    // Оптимистичный update
    setPosts(prev => prev.map(p => p.id === id
      ? { ...p, liked: !p.liked, likes_count: p.likes_count + (p.liked ? -1 : 1) }
      : p));
    try {
      const res = post.liked
        ? await communityApi.unlike(id)
        : await communityApi.like(id);
      if (res.ok) {
        setPosts(prev => prev.map(p => p.id === id
          ? { ...p, liked: res.liked, likes_count: res.likes_count }
          : p));
      }
    } catch (_) {
      // Откатываем оптимистичный update при ошибке
      setPosts(prev => prev.map(p => p.id === id
        ? { ...p, liked: post.liked, likes_count: post.likes_count }
        : p));
    }
  };

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Сообщество</h1>
        <p style={styles.intro}>
          Реальные диалоги юзеров с разбором. Учись на чужом опыте,
          лайкай интересные кейсы.
        </p>

        {loading && (
          <div style={styles.note}>Загружаем…</div>
        )}

        {error && !loading && (
          <Card style={{ padding: 16, textAlign: 'center', color: 'var(--status-negative)' }}>
            {error}
          </Card>
        )}

        {!loading && !error && posts.length === 0 && (
          <Card style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Пока пусто
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Заверши симуляцию и поделись первым кейсом!
            </div>
          </Card>
        )}

        {!loading && !error && posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => (
              <FeedCard
                key={post.id}
                post={post}
                full={fullPosts[post.id]}
                open={openId === post.id}
                onToggle={() => toggleOpen(post.id)}
                onLike={() => toggleLike(post.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

interface FeedCardProps {
  post: CommunityFeedPost;
  full?: CommunityFullPost;
  open: boolean;
  onToggle: () => void;
  onLike: () => void;
}

function FeedCard({ post, full, open, onToggle, onLike }: FeedCardProps) {
  const messages = open && full ? full.messages : post.preview;
  const analysis = open ? full?.analysis : null;
  const showMoreCount = !open && post.messages_count > post.preview.length
    ? (post.messages_count - post.preview.length)
    : 0;

  const initial = (post.author_name || '?').trim().slice(0, 1).toUpperCase();
  const fullLabel = post.girl_name
    ? `${post.girl_name} · ${post.typazh}`
    : post.typazh;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={styles.cardHead}>
        <div style={styles.avatar}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.author}>{post.author_name}</div>
          <div style={styles.meta}>{fullLabel} · {formatRelative(post.created_at)}</div>
        </div>
        {post.score != null && (
          <div style={styles.scoreBadge}>{post.score.toFixed ? post.score.toFixed(1) : post.score} / 10</div>
        )}
      </div>

      {/* Messages */}
      <div style={styles.bubbles}>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.from}>{m.text}</Bubble>
        ))}
      </div>

      {/* Toggle / Show analysis */}
      <button onClick={onToggle} style={styles.toggleBtn}>
        {open ? 'Свернуть' : showMoreCount > 0 ? `Показать всё (+${showMoreCount} сообщ.) и разбор` : 'Открыть разбор'}
      </button>

      {/* Analysis (только когда открыто) */}
      {open && analysis && (
        <div style={styles.analysisBox}>
          {typeof analysis.summary === 'string' && (
            <div style={styles.analysisRow}>
              <span style={styles.analysisLabel}>Итог</span>
              <span style={styles.analysisText}>{analysis.summary}</span>
            </div>
          )}
          {typeof analysis.tip === 'string' && (
            <div style={styles.analysisRow}>
              <span style={styles.analysisLabel}>Совет</span>
              <span style={styles.analysisText}>{analysis.tip}</span>
            </div>
          )}
          {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 && (
            <div style={styles.analysisRow}>
              <span style={styles.analysisLabel}>Плюсы</span>
              <span style={styles.analysisText}>{analysis.strengths.join('; ')}</span>
            </div>
          )}
          {Array.isArray(analysis.improvements) && analysis.improvements.length > 0 && (
            <div style={styles.analysisRow}>
              <span style={styles.analysisLabel}>Минусы</span>
              <span style={styles.analysisText}>{analysis.improvements.join('; ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer — лайк */}
      <div style={styles.cardFooter}>
        <button onClick={onLike} style={styles.likeBtn}>
          <svg width={16} height={16} viewBox="0 0 24 24"
               fill={post.liked ? 'var(--accent-primary)' : 'none'}
               stroke={post.liked ? 'var(--accent-primary)' : 'var(--text-muted)'}
               strokeWidth={2}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          <span style={{ color: post.liked ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
            {post.likes_count}
          </span>
        </button>
      </div>
    </Card>
  );
}

function Bubble({ role, children }: { role: 'me' | 'her'; children: any }) {
  const isMe = role === 'me';
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '85%',
        padding: '7px 11px',
        borderRadius: 14,
        borderBottomRightRadius: isMe ? 4 : 14,
        borderBottomLeftRadius: isMe ? 14 : 4,
        background: isMe ? 'var(--gradient-accent)' : 'var(--bg-elevated)',
        color: isMe ? '#fff' : 'var(--text-primary)',
        fontSize: 13, lineHeight: '18px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {children}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} д назад`;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

const styles: Record<string, CSSProperties> = {
  container: { padding: '12px 16px 24px' },
  h1: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
  intro: {
    margin: '6px 0 16px', fontSize: 13, lineHeight: '18px',
    color: 'var(--text-secondary)',
  },
  note: {
    padding: 30, textAlign: 'center',
    color: 'var(--text-muted)', fontSize: 14,
  },
  cardHead: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    background: 'var(--gradient-accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: 14,
    flexShrink: 0,
  },
  author: {
    fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
  },
  meta: {
    fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  scoreBadge: {
    fontSize: 12, fontWeight: 700,
    padding: '4px 8px',
    borderRadius: 8,
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    flexShrink: 0,
  },
  bubbles: {
    display: 'flex', flexDirection: 'column', gap: 5,
  },
  toggleBtn: {
    alignSelf: 'flex-start',
    background: 'transparent', border: 0,
    color: 'var(--text-accent)', fontSize: 13, fontWeight: 600,
    padding: 4, cursor: 'pointer',
  },
  analysisBox: {
    padding: 10,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  analysisRow: { display: 'flex', flexDirection: 'column', gap: 2 },
  analysisLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  analysisText: {
    fontSize: 13, color: 'var(--text-secondary)', lineHeight: '18px',
  },
  cardFooter: {
    display: 'flex', alignItems: 'center', gap: 12,
    paddingTop: 6,
    borderTop: '1px solid var(--border-subtle)',
  },
  likeBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: 0,
    padding: 4, cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
  },
};
