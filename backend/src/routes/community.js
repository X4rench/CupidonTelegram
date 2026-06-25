// ═══════════════════════════════════════════════════════════════
// Community router — лента сообщества с модерацией.
//
// Юзерские endpoints:
//   POST   /community/submit          — отправить пост на модерацию
//   GET    /community/feed?limit&offset — список approved постов
//   GET    /community/posts/:id       — детали поста (полный диалог+разбор)
//   POST   /community/posts/:id/like  — поставить лайк
//   DELETE /community/posts/:id/like  — снять лайк
//
// Админские (в /admin/community/* через requireAdminAny):
//   GET  /admin/community/pending    — список pending для модерации
//   POST /admin/community/:id/approve
//   POST /admin/community/:id/reject — body { reason? }
//
// Ограничения:
//   - 1 пост в день на юзера (через user_posts_today)
//   - длина messages в JSON — до 10 KB
//   - лайк — 1 от юзера (UNIQUE constraint в community_post_likes)
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db from '../db/index.js';
import { getAdminIds } from '../middleware/auth.js';
import { requireAdminSecret } from '../middleware/adminAuth.js';

const router = Router();

const MAX_MESSAGES_BYTES = 10_000;
const MAX_ANALYSIS_BYTES = 4_000;
const DAILY_POST_LIMIT = 1;
const FEED_PAGE_DEFAULT = 20;
const FEED_PAGE_MAX = 50;

function todayUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function safeStringify(v, maxBytes) {
  try {
    const s = JSON.stringify(v);
    if (Buffer.byteLength(s, 'utf8') > maxBytes) return null;
    return s;
  } catch (_) { return null; }
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch (_) { return fallback; }
}

function authorNameFromReq(req) {
  // Берём first_name из TG initData. Если пусто — username, иначе «Аноним».
  const u = req.tgUser || {};
  const fn = (u.first_name || '').toString().trim();
  if (fn) return fn.slice(0, 32);
  const un = (u.username || '').toString().trim();
  if (un) return `@${un.slice(0, 24)}`;
  return 'Аноним';
}

// ── POST /community/submit ─────────────────────────────────────────────────
router.post('/submit', (req, res) => {
  const { girl_name, typazh, messages, analysis, score } = req.body || {};

  if (!typazh || typeof typazh !== 'string') {
    return res.status(400).json({ ok: false, error: 'typazh обязателен' });
  }
  if (!Array.isArray(messages) || messages.length < 2) {
    return res.status(400).json({ ok: false, error: 'Слишком короткий диалог для публикации' });
  }

  const tgId = req.tgUser.id;
  const isAdmin = getAdminIds().includes(tgId);

  // Лимит постов на день (админы — без лимита: они наполняют ленту)
  if (!isAdmin) {
    const today = todayUTC();
    const todayCount = db.get(
      `SELECT COUNT(*) as c FROM community_posts
        WHERE telegram_user_id = ? AND created_at LIKE ?`,
      tgId, `${today}%`,
    ).c;
    if (todayCount >= DAILY_POST_LIMIT) {
      return res.status(429).json({
        ok: false,
        code: 'POST_LIMIT_EXCEEDED',
        error: 'Ты уже опубликовал пост сегодня. Можно один в день.',
      });
    }
  }

  const messagesJson = safeStringify(messages, MAX_MESSAGES_BYTES);
  if (!messagesJson) {
    return res.status(400).json({ ok: false, error: 'Слишком много данных в диалоге' });
  }
  const analysisJson = analysis ? safeStringify(analysis, MAX_ANALYSIS_BYTES) : null;

  const safeGirlName = girl_name ? String(girl_name).trim().slice(0, 32) : null;
  const safeTypazh   = String(typazh).trim().slice(0, 64);
  const safeScore    = Number.isFinite(+score) ? Math.max(0, Math.min(100, Math.round(+score))) : null;
  const authorName   = authorNameFromReq(req);

  // Админ-посты публикуются сразу (наполнение ленты), остальные — на модерацию
  const status = isAdmin ? 'approved' : 'pending';
  const result = db.run(
    `INSERT INTO community_posts
       (telegram_user_id, author_name, girl_name, typazh, messages, analysis, score, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tgId, authorName, safeGirlName, safeTypazh, messagesJson, analysisJson, safeScore, status,
  );
  if (isAdmin) {
    db.run(`UPDATE community_posts SET approved_at = datetime('now'), reviewed_by = ? WHERE id = ?`, tgId, result.lastInsertRowid);
  }

  res.json({
    ok: true,
    post_id: result.lastInsertRowid,
    status,
    message: isAdmin
      ? 'Опубликовано в ленте.'
      : 'Пост отправлен на модерацию. Появится в ленте после одобрения.',
  });
});

// ── GET /community/feed ────────────────────────────────────────────────────
router.get('/feed', (req, res) => {
  const limit  = Math.min(FEED_PAGE_MAX, Math.max(1, parseInt(req.query.limit, 10) || FEED_PAGE_DEFAULT));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const tgId = req.tgUser.id;
  const isAdmin = getAdminIds().includes(tgId);
  const posts = db.all(
    `SELECT p.id, p.author_name, p.girl_name, p.typazh, p.score, p.likes_count,
            p.created_at, p.messages, p.analysis,
            EXISTS(SELECT 1 FROM community_post_likes WHERE post_id = p.id AND telegram_user_id = ?) AS liked
       FROM community_posts p
      WHERE p.status = 'approved'
      ORDER BY datetime(p.created_at) DESC
      LIMIT ? OFFSET ?`,
    tgId, limit, offset,
  ).map(p => {
    const msgs = safeParse(p.messages, []);
    // В feed возвращаем preview: первые 3 сообщения. Полный — в /posts/:id
    // Автора (имя/кружок) видят только админы — обычным юзерам не отдаём.
    return {
      id: p.id,
      author_name: isAdmin ? p.author_name : null,
      girl_name: p.girl_name,
      typazh: p.typazh,
      score: p.score,
      likes_count: p.likes_count,
      liked: !!p.liked,
      created_at: p.created_at,
      preview: msgs.slice(0, 3),
      messages_count: msgs.length,
      has_analysis: !!p.analysis,
    };
  });

  res.json({ ok: true, posts, limit, offset });
});

// ── GET /community/posts/:id ───────────────────────────────────────────────
router.get('/posts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });

  const tgId = req.tgUser.id;
  const isAdmin = getAdminIds().includes(tgId);
  const p = db.get(
    `SELECT p.*,
            EXISTS(SELECT 1 FROM community_post_likes WHERE post_id = p.id AND telegram_user_id = ?) AS liked
       FROM community_posts p
      WHERE p.id = ? AND p.status = 'approved'`,
    tgId, id,
  );
  if (!p) return res.status(404).json({ ok: false, error: 'Пост не найден' });

  res.json({
    ok: true,
    post: {
      id: p.id,
      author_name: isAdmin ? p.author_name : null,
      girl_name: p.girl_name,
      typazh: p.typazh,
      score: p.score,
      likes_count: p.likes_count,
      liked: !!p.liked,
      created_at: p.created_at,
      messages: safeParse(p.messages, []),
      analysis: safeParse(p.analysis, null),
    },
  });
});

// ── POST /community/posts/:id/like ──────────────────────────────────────────
router.post('/posts/:id/like', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });

  const tgId = req.tgUser.id;
  const exists = db.get(`SELECT 1 FROM community_posts WHERE id = ? AND status = 'approved'`, id);
  if (!exists) return res.status(404).json({ ok: false, error: 'Пост не найден' });

  // INSERT OR IGNORE + увеличиваем счётчик только если реально INSERT'нулось
  const ins = db.run(
    `INSERT OR IGNORE INTO community_post_likes (post_id, telegram_user_id) VALUES (?, ?)`,
    id, tgId,
  );
  if (ins.changes > 0) {
    db.run(`UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ?`, id);
  }
  const row = db.get(`SELECT likes_count FROM community_posts WHERE id = ?`, id);
  res.json({ ok: true, liked: true, likes_count: row?.likes_count ?? 0 });
});

// ── DELETE /community/posts/:id/like ────────────────────────────────────────
router.delete('/posts/:id/like', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });

  const tgId = req.tgUser.id;
  const del = db.run(
    `DELETE FROM community_post_likes WHERE post_id = ? AND telegram_user_id = ?`,
    id, tgId,
  );
  if (del.changes > 0) {
    db.run(`UPDATE community_posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?`, id);
  }
  const row = db.get(`SELECT likes_count FROM community_posts WHERE id = ?`, id);
  res.json({ ok: true, liked: false, likes_count: row?.likes_count ?? 0 });
});

// ─── ADMIN endpoints ──────────────────────────────────────────────────────────

function requireAdminAny(req, res, next) {
  if (req.tgUser?.id && getAdminIds().includes(req.tgUser.id)) return next();
  return requireAdminSecret(req, res, next);
}

const adminRouter = Router();
adminRouter.use(requireAdminAny);

// GET /admin/community/pending
adminRouter.get('/pending', (req, res) => {
  const posts = db.all(
    `SELECT id, telegram_user_id, author_name, girl_name, typazh, score, created_at, messages, analysis
       FROM community_posts WHERE status = 'pending'
      ORDER BY datetime(created_at) ASC`,
  ).map(p => ({
    id: p.id,
    telegram_user_id: p.telegram_user_id,
    author_name: p.author_name,
    girl_name: p.girl_name,
    typazh: p.typazh,
    score: p.score,
    created_at: p.created_at,
    messages: safeParse(p.messages, []),
    analysis: safeParse(p.analysis, null),
  }));
  res.json({ ok: true, posts });
});

// POST /admin/community/:id/approve
adminRouter.post('/:id/approve', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });
  const p = db.get(`SELECT id, status FROM community_posts WHERE id = ?`, id);
  if (!p) return res.status(404).json({ ok: false, error: 'Пост не найден' });
  if (p.status === 'approved') return res.json({ ok: true, already: true });

  db.run(
    `UPDATE community_posts
        SET status = 'approved', approved_at = datetime('now'), reviewed_by = ?
      WHERE id = ?`,
    req.tgUser?.id || null, id,
  );
  res.json({ ok: true });
});

// POST /admin/community/:id/reject
adminRouter.post('/:id/reject', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
  const p = db.get(`SELECT id FROM community_posts WHERE id = ?`, id);
  if (!p) return res.status(404).json({ ok: false, error: 'Пост не найден' });

  db.run(
    `UPDATE community_posts
        SET status = 'rejected', rejected_reason = ?, reviewed_by = ?
      WHERE id = ?`,
    reason, req.tgUser?.id || null, id,
  );
  res.json({ ok: true });
});

// POST /admin/community/:id/edit — редактирование поста админом
// Принимает любые из полей: girl_name, typazh, score, messages, analysis.
// Обновляются только переданные (partial update).
adminRouter.post('/:id/edit', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });
  const exists = db.get(`SELECT id FROM community_posts WHERE id = ?`, id);
  if (!exists) return res.status(404).json({ ok: false, error: 'Пост не найден' });

  const { girl_name, typazh, score, messages, analysis } = req.body || {};
  const sets = [];
  const args = [];

  if (girl_name !== undefined) {
    sets.push('girl_name = ?');
    args.push(girl_name ? String(girl_name).trim().slice(0, 32) : null);
  }
  if (typazh !== undefined) {
    const t = String(typazh).trim().slice(0, 64);
    if (!t) return res.status(400).json({ ok: false, error: 'Типаж не может быть пустым' });
    sets.push('typazh = ?');
    args.push(t);
  }
  if (score !== undefined) {
    const s = Number.isFinite(+score) ? Math.max(0, Math.min(100, Math.round(+score))) : null;
    sets.push('score = ?');
    args.push(s);
  }
  if (messages !== undefined) {
    if (!Array.isArray(messages) || messages.length < 1) {
      return res.status(400).json({ ok: false, error: 'Диалог не может быть пустым' });
    }
    const mj = safeStringify(messages, MAX_MESSAGES_BYTES);
    if (!mj) return res.status(400).json({ ok: false, error: 'Слишком много данных в диалоге' });
    sets.push('messages = ?');
    args.push(mj);
  }
  if (analysis !== undefined) {
    const aj = analysis ? safeStringify(analysis, MAX_ANALYSIS_BYTES) : null;
    if (analysis && !aj) return res.status(400).json({ ok: false, error: 'Слишком большой разбор' });
    sets.push('analysis = ?');
    args.push(aj);
  }

  if (!sets.length) return res.json({ ok: true, unchanged: true });

  args.push(id);
  db.run(`UPDATE community_posts SET ${sets.join(', ')} WHERE id = ?`, ...args);
  res.json({ ok: true });
});

// DELETE /admin/community/:id — удаление поста админом (вместе с лайками)
adminRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Неверный id' });
  const exists = db.get(`SELECT id FROM community_posts WHERE id = ?`, id);
  if (!exists) return res.status(404).json({ ok: false, error: 'Пост не найден' });

  db.run(`DELETE FROM community_post_likes WHERE post_id = ?`, id);
  db.run(`DELETE FROM community_posts WHERE id = ?`, id);
  res.json({ ok: true });
});

export { router as communityRouter, adminRouter as communityAdminRouter };
