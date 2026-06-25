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
import { communityApi, communityAdminApi, type CommunityFeedPost, type CommunityFullPost, type CommunityMsg } from '../api';
import { useMe } from '../contexts/MeContext';

export function CommunityScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [posts, setPosts] = useState<CommunityFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [fullPosts, setFullPosts] = useState<Record<number, CommunityFullPost>>({});
  const { me } = useMe();
  const isAdmin = !!me?.is_admin;
  const [editing, setEditing] = useState<CommunityFullPost | null>(null);

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

  // ── Админ: удаление / редактирование ──────────────────────────────────
  const handleDelete = async (id: number) => {
    const ok = await confirmDialog('Удалить пост из ленты? Это необратимо.');
    if (!ok) return;
    try {
      await communityAdminApi.remove(id);
      setPosts(prev => prev.filter(p => p.id !== id));
      setFullPosts(prev => { const n = { ...prev }; delete n[id]; return n; });
      if (openId === id) setOpenId(null);
    } catch (e: any) {
      tgAlert(e?.message || 'Не удалось удалить пост');
    }
  };

  const handleEditOpen = async (id: number) => {
    let full = fullPosts[id];
    if (!full) {
      try {
        const res = await communityApi.getPost(id);
        if (res.ok) { full = res.post; setFullPosts(prev => ({ ...prev, [id]: res.post })); }
      } catch (_) {}
    }
    if (full) setEditing(full);
    else tgAlert('Не удалось загрузить пост для редактирования');
  };

  const handleEditSaved = (updated: CommunityFullPost) => {
    setPosts(prev => prev.map(p => p.id === updated.id ? {
      ...p,
      girl_name: updated.girl_name,
      typazh: updated.typazh,
      score: updated.score,
      preview: updated.messages.slice(0, 3),
      messages_count: updated.messages.length,
      has_analysis: !!updated.analysis,
    } : p));
    setFullPosts(prev => ({ ...prev, [updated.id]: updated }));
    setEditing(null);
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
                isAdmin={isAdmin}
                onToggle={() => toggleOpen(post.id)}
                onLike={() => toggleLike(post.id)}
                onEdit={() => handleEditOpen(post.id)}
                onDelete={() => handleDelete(post.id)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditPostOverlay
          post={editing}
          onClose={() => setEditing(null)}
          onSaved={handleEditSaved}
        />
      )}
    </Layout>
  );
}

interface FeedCardProps {
  post: CommunityFeedPost;
  full?: CommunityFullPost;
  open: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onLike: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function FeedCard({ post, full, open, isAdmin, onToggle, onLike, onEdit, onDelete }: FeedCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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
      {/* Header. Кружок + имя автора видны ТОЛЬКО админам. */}
      <div style={styles.cardHead}>
        {isAdmin && <div style={styles.avatar}>{initial}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isAdmin && <div style={styles.author}>{post.author_name || 'Аноним'}</div>}
          <div style={styles.meta}>{fullLabel} · {formatRelative(post.created_at)}</div>
        </div>
        {post.score != null && (
          <div style={styles.scoreBadge}>{post.score.toFixed ? post.score.toFixed(1) : post.score} / 10</div>
        )}
        {isAdmin && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(o => !o)} style={styles.dotsBtn} aria-label="Действия">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div style={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
                <div style={styles.menu}>
                  <button style={styles.menuItem} onClick={() => { setMenuOpen(false); onEdit(); }}>
                    Редактировать
                  </button>
                  <button
                    style={{ ...styles.menuItem, color: 'var(--status-negative)' }}
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                  >
                    Удалить
                  </button>
                </div>
              </>
            )}
          </div>
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

// Нативные диалоги Telegram (с фолбэком на браузерные) — для подтверждения удаления.
function confirmDialog(message: string): Promise<boolean> {
  const wa = (window as any)?.Telegram?.WebApp;
  if (wa?.showConfirm) {
    return new Promise(resolve => {
      try { wa.showConfirm(message, (ok: boolean) => resolve(!!ok)); }
      catch { resolve(window.confirm(message)); }
    });
  }
  return Promise.resolve(window.confirm(message));
}
function tgAlert(message: string): void {
  const wa = (window as any)?.Telegram?.WebApp;
  if (wa?.showAlert) { try { wa.showAlert(message); return; } catch (_) {} }
  // eslint-disable-next-line no-alert
  alert(message);
}

// ── Оверлей редактирования поста (только админ) ──────────────────────────────
function EditPostOverlay({ post, onClose, onSaved }: {
  post: CommunityFullPost;
  onClose: () => void;
  onSaved: (updated: CommunityFullPost) => void;
}) {
  const [girlName, setGirlName] = useState(post.girl_name || '');
  const [typazh, setTypazh] = useState(post.typazh || '');
  const [score, setScore] = useState(post.score != null ? String(post.score) : '');
  const [messages, setMessages] = useState<CommunityMsg[]>(
    (post.messages || []).map(m => ({ from: m.from === 'her' ? 'her' : 'me', text: m.text || '' })),
  );
  const [summary, setSummary] = useState<string>(typeof post.analysis?.summary === 'string' ? post.analysis.summary : '');
  const [tip, setTip] = useState<string>(typeof post.analysis?.tip === 'string' ? post.analysis.tip : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setMsg = (i: number, patch: Partial<CommunityMsg>) =>
    setMessages(prev => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMsg = (i: number) => setMessages(prev => prev.filter((_, idx) => idx !== i));
  const addMsg = () => setMessages(prev => [...prev, { from: 'me', text: '' }]);

  const save = async () => {
    setErr(null);
    const cleanMsgs: CommunityMsg[] = messages
      .map(m => ({ from: (m.from === 'her' ? 'her' : 'me') as 'me' | 'her', text: (m.text || '').trim() }))
      .filter(m => m.text);
    if (cleanMsgs.length < 1) { setErr('Диалог не может быть пустым'); return; }
    const t = typazh.trim();
    if (!t) { setErr('Укажи типаж'); return; }

    // Сохраняем прочие поля разбора (плюсы/минусы), переопределяем только итог/совет.
    let analysis: any = post.analysis ? { ...post.analysis } : null;
    const s = summary.trim(); const tp = tip.trim();
    if (s || tp || analysis) {
      analysis = analysis || {};
      if (s) analysis.summary = s; else delete analysis.summary;
      if (tp) analysis.tip = tp; else delete analysis.tip;
    }

    let scoreClamped: number | null = null;
    if (score.trim() !== '') {
      const n = Number(score);
      if (!Number.isFinite(n)) { setErr('Оценка должна быть числом'); return; }
      scoreClamped = Math.max(0, Math.min(100, Math.round(n)));
    }

    setSaving(true);
    try {
      const res = await communityAdminApi.edit(post.id, {
        girl_name: girlName.trim() || null,
        typazh: t,
        score: scoreClamped,
        messages: cleanMsgs,
        analysis,
      });
      if (!res.ok) { setErr(res.error || 'Ошибка сохранения'); setSaving(false); return; }
      onSaved({ ...post, girl_name: girlName.trim() || null, typazh: t, score: scoreClamped, messages: cleanMsgs, analysis });
    } catch (e: any) {
      setErr(e?.message || 'Ошибка сохранения');
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.sheetHead}>
          <span style={styles.sheetTitle}>Редактировать пост</span>
          <button style={styles.sheetClose} onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <div style={styles.sheetBody}>
          <label style={styles.fieldLabel}>Имя</label>
          <input style={styles.input} value={girlName} maxLength={32}
                 onChange={e => setGirlName(e.target.value)} placeholder="необязательно" />

          <label style={styles.fieldLabel}>Типаж</label>
          <input style={styles.input} value={typazh} maxLength={64}
                 onChange={e => setTypazh(e.target.value)} placeholder="например: Спортивная" />

          <label style={styles.fieldLabel}>Оценка (0–10)</label>
          <input style={styles.input} value={score} inputMode="decimal"
                 onChange={e => setScore(e.target.value)} placeholder="нет" />

          <label style={styles.fieldLabel}>Диалог</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={styles.msgRow}>
                <button
                  style={{ ...styles.fromToggle, ...(m.from === 'me' ? styles.fromMe : styles.fromHer) }}
                  onClick={() => setMsg(i, { from: m.from === 'me' ? 'her' : 'me' })}
                >
                  {m.from === 'me' ? 'Я' : 'Она'}
                </button>
                <textarea style={styles.msgInput} value={m.text} rows={2}
                          onChange={e => setMsg(i, { text: e.target.value })} />
                <button style={styles.msgDelete} onClick={() => removeMsg(i)} aria-label="Удалить сообщение">✕</button>
              </div>
            ))}
            <button style={styles.addMsgBtn} onClick={addMsg}>+ Добавить сообщение</button>
          </div>

          <label style={styles.fieldLabel}>Разбор — итог</label>
          <textarea style={styles.input} value={summary} rows={2}
                    onChange={e => setSummary(e.target.value)} placeholder="необязательно" />

          <label style={styles.fieldLabel}>Разбор — совет</label>
          <textarea style={styles.input} value={tip} rows={2}
                    onChange={e => setTip(e.target.value)} placeholder="необязательно" />

          {err && <div style={styles.errBox}>{err}</div>}
        </div>

        <div style={styles.sheetFooter}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>Отмена</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
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

  // ── Меню «⋯» (только админ) ──
  dotsBtn: {
    background: 'transparent', border: 0, cursor: 'pointer',
    color: 'var(--text-muted)', padding: 4, lineHeight: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  menuBackdrop: {
    position: 'fixed', inset: 0, zIndex: 40,
  },
  menu: {
    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 10, padding: 4, minWidth: 150,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    display: 'flex', flexDirection: 'column',
  },
  menuItem: {
    background: 'transparent', border: 0, cursor: 'pointer',
    textAlign: 'left', padding: '9px 12px', borderRadius: 7,
    fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },

  // ── Оверлей редактирования ──
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  },
  sheet: {
    width: '100%', maxWidth: 560, maxHeight: '92vh',
    background: 'var(--bg-primary)',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  sheetHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  sheetTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  sheetClose: {
    background: 'transparent', border: 0, cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 4,
  },
  sheetBody: {
    padding: 16, overflowY: 'auto', flex: 1,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  sheetFooter: {
    display: 'flex', gap: 10, padding: '12px 16px',
    borderTop: '1px solid var(--border-subtle)', flexShrink: 0,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginTop: 8, marginBottom: 2,
  },
  input: {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 10, padding: '10px 12px',
    color: 'var(--text-primary)', fontSize: 14,
    fontFamily: 'inherit', resize: 'vertical',
  },
  msgRow: { display: 'flex', alignItems: 'flex-start', gap: 6 },
  fromToggle: {
    flexShrink: 0, width: 44, padding: '8px 0',
    borderRadius: 8, border: '1px solid var(--border-default)',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  fromMe: { background: 'var(--accent-soft)', color: 'var(--text-accent)' },
  fromHer: { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  msgInput: {
    flex: 1, minWidth: 0, boxSizing: 'border-box',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 8, padding: '8px 10px',
    color: 'var(--text-primary)', fontSize: 13, lineHeight: '18px',
    fontFamily: 'inherit', resize: 'vertical',
  },
  msgDelete: {
    flexShrink: 0, background: 'transparent', border: 0, cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 16, padding: '6px 4px', lineHeight: 1,
  },
  addMsgBtn: {
    alignSelf: 'flex-start', background: 'transparent', border: 0,
    color: 'var(--text-accent)', fontSize: 13, fontWeight: 600,
    padding: 4, cursor: 'pointer',
  },
  errBox: {
    marginTop: 10, padding: '8px 12px', borderRadius: 8,
    background: 'rgba(220,38,38,0.12)', color: 'var(--status-negative)',
    fontSize: 13,
  },
  cancelBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    flex: 2, padding: '12px 0', borderRadius: 10,
    background: 'var(--gradient-accent)', border: 0,
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
};
