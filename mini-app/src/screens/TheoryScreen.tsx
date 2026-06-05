// ═══════════════════════════════════════════════════════════════
// TheoryScreen — теория знакомств: карточки + лента + посты.
// Tabs:
//   1) «Карточки»     — 40+ концепций, фильтр по категориям.
//   2) «Лента»        — пример диалога + опрос дня (бэк /polls/today).
//   3) «Посты»        — статические длинные посты (см. utils/posts).
//
// Источник: src/screens/TheoryScreen.js (RN-версия).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { impactHaptic, selectionHaptic, notificationHaptic } from '../utils/haptics';
import { THEORY_CARDS, THEORY_CATEGORIES, type TheoryCard } from '../utils/theoryCards';
import { POSTS } from '../utils/posts';
import { getDailyPoll, votePoll, type DailyPoll } from '../api';

type Tab = 1 | 2 | 3;

const POLL_SLOTS = [
  { color: '#22C55E', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)' },
  { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)' },
];

function formatVotes(n: number | null | undefined): string {
  if (n == null) return '';
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} голосов`;
  if (last === 1) return `${n} голос`;
  if (last >= 2 && last <= 4) return `${n} голоса`;
  return `${n} голосов`;
}

export function TheoryScreen() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>(1);
  const [activeCat, setActiveCat] = useState('Все');
  const [expandedIdx, setExpandedIdx] = useState<number>(-1);

  // Poll
  const [poll, setPoll] = useState<DailyPoll | null>(null);
  const [pollChoice, setPollChoice] = useState<0 | 1 | null>(null);
  const [pollVotes, setPollVotes] = useState<{ a: number; b: number } | null>(null);
  const [pollResults, setPollResults] = useState<{ a: string; b: string } | null>(null);
  const [pollLoading, setPollLoading] = useState(false);

  const filtered = useMemo(() => {
    if (activeCat === 'Все') return THEORY_CARDS;
    return THEORY_CARDS.filter(c => c.category === activeCat);
  }, [activeCat]);

  // Fetch poll on tab 2 open
  useEffect(() => {
    if (tab !== 2 || poll) return;
    fetchPoll();
  }, [tab]);

  const fetchPoll = async () => {
    try {
      const res = await getDailyPoll();
      if (!res?.ok || !res.poll) return;
      setPoll(res.poll);
      if (res.user_vote === 0 || res.user_vote === 1) {
        setPollChoice(res.user_vote);
        // re-vote to get cached result_a/result_b
        const v = await votePoll(res.poll.id, res.user_vote);
        if (v.ok) {
          setPollVotes(v.votes);
          setPollResults(v.result || { a: v.result_a ?? '', b: v.result_b ?? '' });
        }
      }
    } catch (_) {}
  };

  const selectPoll = async (idx: 0 | 1) => {
    if (!poll || pollChoice === idx || pollLoading) return;
    selectionHaptic();
    setPollChoice(idx);
    setPollLoading(true);
    try {
      const res = await votePoll(poll.id, idx);
      if (res.ok) {
        setPollVotes(res.votes);
        setPollResults(res.result || { a: res.result_a ?? '', b: res.result_b ?? '' });
      }
    } catch (_) {} finally {
      setPollLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    if (tab === t) return;
    selectionHaptic();
    setExpandedIdx(-1);
    setTab(t);
  };

  const selectCategory = (cat: string) => {
    if (cat === activeCat) return;
    selectionHaptic();
    setExpandedIdx(-1);
    setActiveCat(cat);
  };

  const toggleCard = (i: number) => {
    selectionHaptic();
    setExpandedIdx(prev => (prev === i ? -1 : i));
  };

  const openPost = (slug: string) => {
    impactHaptic('light');
    nav(`/post/${slug}`);
  };

  return (
    <Layout withTabBar>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Теория</h1>
        </div>

        <div style={styles.tabs}>
          <TabBtn active={tab === 1} pos="left" onClick={() => switchTab(1)}>Карточки</TabBtn>
          <TabBtn active={tab === 2} pos="middle" onClick={() => switchTab(2)}>Лента</TabBtn>
          <TabBtn active={tab === 3} pos="right" onClick={() => switchTab(3)}>Посты</TabBtn>
        </div>

        {tab === 1 && (
          <>
            <div style={styles.catRow}>
              {THEORY_CATEGORIES.map(cat => (
                <Chip key={cat} active={cat === activeCat} onClick={() => selectCategory(cat)}>
                  {cat}
                </Chip>
              ))}
            </div>
            <div style={styles.catCount}>{filtered.length} карточек</div>
            <div style={styles.section}>
              {filtered.map((c, i) => (
                <TheoryItem
                  key={`${c.category}-${c.title}`}
                  card={c}
                  expanded={expandedIdx === i}
                  onToggle={() => toggleCard(i)}
                />
              ))}
            </div>
          </>
        )}

        {tab === 2 && (
          <div style={styles.section}>
            {/* Пример диалога */}
            <div onClick={() => { impactHaptic('light'); nav('/community'); }}>
              <Card style={{ cursor: 'pointer', border: '1px solid var(--border-accent)' }}>
                <div style={styles.bubblesBox}>
                  <Bubble role="her">а ты часто пишешь первым?</Bubble>
                  <Bubble role="me">только когда есть что сказать. Сегодня — есть)</Bubble>
                  <Bubble role="her">ого, интригуешь</Bubble>
                </div>
                <span style={styles.feedTitle}>Пример лучших диалогов</span>
                <p style={styles.feedSub}>Посмотри, как другие парни ведут переписку, и оцени стиль.</p>
              </Card>
            </div>

            {/* Опрос дня */}
            {poll && (
              <Card style={{ marginTop: 12 }}>
                <p style={{ ...styles.feedTitle, marginBottom: 12 }}>{poll.question}</p>
                <div style={styles.pollRow}>
                  {[poll.option_a, poll.option_b].map((txt, i) => {
                    const slot = POLL_SLOTS[i];
                    const selected = pollChoice === i;
                    const votes = pollVotes ? (i === 0 ? pollVotes.a : pollVotes.b) : null;
                    return (
                      <button
                        key={i}
                        onClick={() => selectPoll(i as 0 | 1)}
                        style={{
                          ...styles.pollOption,
                          background: slot.bg,
                          borderColor: selected ? slot.color : slot.border,
                          borderWidth: selected ? 2 : 1,
                        }}
                      >
                        {selected && (
                          <span style={{ ...styles.pollCheck, background: slot.color }}>
                            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20,6 9,17 4,12" />
                            </svg>
                          </span>
                        )}
                        <span style={{ ...styles.pollText, fontWeight: selected ? 700 : 500 }}>{txt}</span>
                        {votes != null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: slot.color }}>
                            {formatVotes(votes)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {pollChoice !== null && pollResults && (
                  <>
                    <p style={styles.pollResult}>
                      {pollChoice === 0 ? pollResults.a : pollResults.b}
                    </p>
                    <p style={styles.pollHintMuted}>
                      Передумал? Нажми на другой вариант — голос обновится.
                    </p>
                  </>
                )}
                {pollChoice === null && (
                  <p style={styles.pollHint}>Выбери вариант и я покажу анализ обоих.</p>
                )}
              </Card>
            )}

            {/* Цитата */}
            <Card style={{ marginTop: 12, padding: 24, textAlign: 'center' }}>
              <p style={styles.quote}>«Привлекательность — это не то, что ты говоришь, а то, как ты слушаешь».</p>
              <span style={styles.quoteMeta}>Цитата дня</span>
            </Card>
          </div>
        )}

        {tab === 3 && (
          <div style={styles.section}>
            <p style={styles.postsHint}>
              Длинные разборы концепций, антипатернов и пошаговых алгоритмов.
            </p>
            {POSTS.map(post => (
              <PostPreview key={post.id} post={post} onClick={() => openPost(post.slug)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TabBtn({ children, active, pos, onClick }: { children: React.ReactNode; active: boolean; pos: 'left' | 'middle' | 'right'; onClick: () => void }) {
  const radius = pos === 'left' ? { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 }
    : pos === 'right' ? { borderTopRightRadius: 10, borderBottomRightRadius: 10 }
    : {};
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 0',
        textAlign: 'center',
        background: active ? 'var(--gradient-accent)' : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--text-muted)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        ...radius,
      }}
    >
      {children}
    </button>
  );
}

function TheoryItem({ card, expanded, onToggle }: { card: TheoryCard; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <Card onClick={onToggle}>
        <div style={styles.cardRow}>
          <span style={styles.cardCat}>{card.category}</span>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points={expanded ? '18,15 12,9 6,15' : '6,9 12,15 18,9'} />
          </svg>
        </div>
        <p style={styles.cardTitle}>{card.title}</p>
        <p style={styles.cardSub}>{card.sub}</p>
        {expanded && (
          <div style={styles.cardDetail}>
            <p style={styles.cardDetailText}>{card.detail}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Bubble({ role, children }: { role: 'her' | 'me'; children: React.ReactNode }) {
  const isMe = role === 'me';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isMe ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '6px 12px',
        borderRadius: 14,
        background: isMe ? 'var(--accent-primary)' : 'var(--bg-card)',
        color: isMe ? '#fff' : 'var(--text-primary)',
        fontSize: 13,
        lineHeight: '18px',
      }}>
        {children}
      </div>
    </div>
  );
}

function PostPreview({ post, onClick }: { post: typeof POSTS[number]; onClick: () => void }) {
  return (
    <button onClick={onClick} style={styles.postBtn}>
      <Card style={{ padding: 12, overflow: 'hidden' }}>
        <div style={styles.postThumbWrap}>
          <img src={post.image} alt="" style={styles.postThumb} />
          <div style={styles.postThumbOverlay} />
          <div style={styles.postTagWrap}>
            <span style={styles.postTag}>{post.tag}</span>
          </div>
          <div style={styles.postReadTime}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}>
              <circle cx={12} cy={12} r={10} />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <span style={styles.postReadTimeText}>{post.readTime}</span>
          </div>
        </div>
        <div style={styles.postBody}>
          <p style={styles.postTitle}>{post.title}</p>
          <p style={styles.postExcerpt}>{post.excerpt}</p>
          <div style={styles.postMore}>
            <span style={styles.postMoreText}>Читать дальше</span>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={2.4} strokeLinecap="round">
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </div>
        </div>
      </Card>
    </button>
  );
}

// silence unused notificationHaptic import warning if not needed elsewhere
void notificationHaptic;

const styles: Record<string, CSSProperties> = {
  container: { paddingTop: 8 },
  header: { padding: '16px 20px 12px', display: 'flex', justifyContent: 'center' },
  title: { margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' },
  tabs: { display: 'flex', padding: '0 16px 16px', gap: 0 },
  catRow: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 8px' },
  catCount: { fontSize: 11, color: 'var(--text-muted)', padding: '0 16px 12px' },
  section: { padding: '0 16px 16px' },

  cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardCat: {
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--text-accent)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' },
  cardSub: { margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' },
  cardDetail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' },
  cardDetailText: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-secondary)' },

  bubblesBox: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  feedTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'block' },
  feedSub: { margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' },

  pollRow: { display: 'flex', gap: 8 },
  pollOption: {
    flex: 1,
    position: 'relative',
    border: '1px solid',
    borderRadius: 12,
    padding: '28px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    minHeight: 90,
  },
  pollCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  pollText: { fontSize: 13, color: 'var(--text-primary)', textAlign: 'center' },
  pollResult: { margin: '12px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--text-muted)' },
  pollHint: { margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' },
  pollHintMuted: { margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 },

  quote: { margin: 0, fontSize: 18, fontWeight: 700, lineHeight: '25px', color: 'var(--text-primary)', marginBottom: 8 },
  quoteMeta: { fontSize: 12, color: 'var(--text-muted)' },

  postsHint: { fontSize: 13, color: 'var(--text-muted)', lineHeight: '19px', marginBottom: 14 },
  postBtn: { display: 'block', width: '100%', background: 'transparent', padding: 0, marginBottom: 12, textAlign: 'left', cursor: 'pointer' },
  postThumbWrap: {
    width: '100%',
    aspectRatio: '16 / 11',
    position: 'relative',
    background: 'var(--bg-elevated)',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
  },
  postThumb: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
  postThumbOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '55%',
    background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
  },
  postTagWrap: { position: 'absolute', top: 10, left: 10 },
  postTag: {
    padding: '4px 9px',
    borderRadius: 999,
    background: 'var(--gradient-accent)',
    color: '#fff',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  postReadTime: {
    position: 'absolute',
    top: 10,
    right: 10,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(0,0,0,0.45)',
    padding: '3px 7px',
    borderRadius: 999,
  },
  postReadTimeText: { color: '#fff', fontSize: 10.5, fontWeight: 600 },
  postBody: { padding: '10px 4px 4px' },
  postTitle: { margin: 0, fontSize: 16, fontWeight: 700, lineHeight: '21px', color: 'var(--text-primary)' },
  postExcerpt: { margin: '6px 0 0', fontSize: 13, lineHeight: '19px', color: 'var(--text-secondary)' },
  postMore: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 },
  postMoreText: { fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)' },
};
