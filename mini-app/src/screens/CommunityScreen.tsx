// ═══════════════════════════════════════════════════════════════
// CommunityScreen — фид сообщества (MOCK_FEED из utils/communityFeed.ts).
// Phase F: backend нет (статика). На каждой карточке — превью переписки,
// тип девушки, score-badge. Тап → раскрытие полной переписки в той же карточке.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, selectionHaptic } from '../utils/haptics';
import { MOCK_FEED, type FeedPost, type FeedMsg } from '../utils/communityFeed';

export function CommunityScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [openId, setOpenId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set(MOCK_FEED.filter(p => p.liked).map(p => p.id)));

  const toggleLike = (id: string) => {
    impactHaptic('light');
    setLiked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleOpen = (id: string) => {
    selectionHaptic();
    setOpenId(prev => prev === id ? null : id);
  };

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Сообщество 💞</h1>
        <p style={styles.intro}>
          Реальные диалоги других пользователей с разбором. Учись на чужом опыте.
        </p>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MOCK_FEED.map(post => (
            <FeedCard
              key={post.id}
              post={post}
              open={openId === post.id}
              liked={liked.has(post.id)}
              onToggle={() => toggleOpen(post.id)}
              onLike={() => toggleLike(post.id)}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}

interface FeedCardProps {
  post: FeedPost;
  open: boolean;
  liked: boolean;
  onToggle: () => void;
  onLike: () => void;
}

function FeedCard({ post, open, liked, onToggle, onLike }: FeedCardProps) {
  const visibleMsgs = open ? post.messages : post.preview;
  return (
    <Card>
      <div style={styles.feedHeader}>
        <div style={{
          ...styles.avatar,
          background: `linear-gradient(135deg, ${post.avatarColors[0]}, ${post.avatarColors[1]})`,
        }}>
          {post.user[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.username}>@{post.user}</div>
          <div style={styles.subline}>
            <span style={{ color: post.typeColor }}>{post.typeName}</span>
            <span style={{ color: 'var(--text-muted)' }}> · {post.time}</span>
          </div>
        </div>
        <div style={styles.scoreBadge}>{post.score}</div>
      </div>

      <div style={styles.chat}>
        {visibleMsgs.map((m, i) => (
          <ChatLine key={i} msg={m} />
        ))}
      </div>

      {!open && post.messages.length > post.preview.length && (
        <button onClick={onToggle} style={styles.expandBtn}>
          Показать всю переписку ({post.messages.length} сообщений)
        </button>
      )}
      {open && (
        <>
          <div style={styles.divider} />
          <div style={styles.sectionLabel}>Разбор</div>
          {post.analysis.map(a => (
            <div key={a.label} style={styles.analysisRow}>
              <span style={{ fontSize: 13 }}>{a.label}</span>
              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${a.value}%`, background: a.color }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 30, textAlign: 'right' }}>
                {a.value}%
              </span>
            </div>
          ))}
          <div style={styles.tipBox}>
            <span style={{ marginRight: 6 }}>💡</span>{post.tip}
          </div>
        </>
      )}

      <div style={styles.footer}>
        <button onClick={onLike} style={styles.likeBtn} aria-label="лайк">
          <span style={{ fontSize: 16, color: liked ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
            {liked ? '❤' : '♡'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {post.likes + (liked && !post.liked ? 1 : 0)}
          </span>
        </button>
      </div>
    </Card>
  );
}

function ChatLine({ msg }: { msg: FeedMsg }) {
  const isMe = msg.role === 'me';
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      <div style={{
        ...styles.bubble,
        background: isMe ? 'var(--accent-primary)' : 'var(--bg-elevated)',
        color: isMe ? '#fff' : 'var(--text-primary)',
        borderBottomRightRadius: isMe ? 4 : 14,
        borderBottomLeftRadius:  isMe ? 14 : 4,
      }}>
        {msg.text}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container:    { padding: '24px 20px' },
  h1:           { margin: 0, fontSize: 24, fontWeight: 700 },
  intro:        { marginTop: 8, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 },
  feedHeader:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  avatar:       { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 },
  username:     { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  subline:      { fontSize: 12 },
  scoreBadge:   { padding: '4px 10px', borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--text-accent)', fontSize: 13, fontWeight: 600 },
  chat:         { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 },
  bubble:       { maxWidth: '80%', padding: '8px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  expandBtn:    { marginTop: 12, padding: '10px 14px', width: '100%', borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  divider:      { height: 1, background: 'var(--border-subtle)', margin: '16px 0' },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  analysisRow:  { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 },
  barTrack:     { flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: 3, transition: 'width 0.3s ease' },
  tipBox:       { marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.1)', fontSize: 13, lineHeight: 1.5 },
  footer:       { display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' },
  likeBtn:      { display: 'flex', alignItems: 'center', gap: 6, padding: 4 },
};
