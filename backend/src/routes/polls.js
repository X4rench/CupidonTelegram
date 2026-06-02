// ═══════════════════════════════════════════════════════════════
// Polls router (TMA) — ежедневный опрос для ленты Теории.
// Только русский язык (no _en fallback).
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Detect day-of-year (1..366) для детерминированного выбора опроса (UTC)
function dayOfYear(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

// GET /api/v1/polls/today — детерминированный выбор по дате
router.get('/today', (req, res) => {
  const polls = db.all('SELECT id, slug, question, option_a, option_b FROM polls ORDER BY id ASC');
  if (!polls.length) return res.status(404).json({ ok: false, error: 'Опросы ещё не настроены' });

  const idx = dayOfYear() % polls.length;
  const poll = polls[idx];

  // Не выдаём чужой голос — только текущего юзера
  const row = db.get(
    'SELECT choice FROM poll_votes WHERE poll_id = ? AND telegram_user_id = ?',
    poll.id, req.tgUser.id
  );

  res.json({
    ok: true,
    poll: {
      id:       poll.id,
      slug:     poll.slug,
      question: poll.question,
      option_a: poll.option_a,
      option_b: poll.option_b,
    },
    user_vote: row?.choice ?? null,
  });
});

// POST /api/v1/polls/:id/vote — записать голос
router.post('/:id/vote', (req, res) => {
  const pollId = parseInt(req.params.id, 10);
  const { choice } = req.body;

  if (!Number.isInteger(pollId)) return res.status(400).json({ ok: false, error: 'Неверный id опроса' });
  if (choice !== 0 && choice !== 1) return res.status(400).json({ ok: false, error: 'choice должен быть 0 или 1' });

  const poll = db.get('SELECT * FROM polls WHERE id = ?', pollId);
  if (!poll) return res.status(404).json({ ok: false, error: 'Опрос не найден' });

  // TMA3 — голос пользователя фиксируется один раз; повторный POST не меняет
  // выбор (защита от накручивания статистики через перевыбор).
  db.run(
    `INSERT INTO poll_votes (poll_id, telegram_user_id, choice) VALUES (?, ?, ?)
     ON CONFLICT(poll_id, telegram_user_id) DO NOTHING`,
    pollId, req.tgUser.id, choice
  );

  const realA = db.get('SELECT COUNT(*) as c FROM poll_votes WHERE poll_id = ? AND choice = 0', pollId).c;
  const realB = db.get('SELECT COUNT(*) as c FROM poll_votes WHERE poll_id = ? AND choice = 1', pollId).c;

  res.json({
    ok: true,
    user_vote: choice,
    votes: {
      a: poll.base_votes_a + realA,
      b: poll.base_votes_b + realB,
    },
    result: {
      a: poll.result_a,
      b: poll.result_b,
    },
  });
});

// GET /api/v1/polls/:id/result
router.get('/:id/result', (req, res) => {
  const pollId = parseInt(req.params.id, 10);
  const poll = db.get('SELECT * FROM polls WHERE id = ?', pollId);
  if (!poll) return res.status(404).json({ ok: false, error: 'Опрос не найден' });

  const realA = db.get('SELECT COUNT(*) as c FROM poll_votes WHERE poll_id = ? AND choice = 0', pollId).c;
  const realB = db.get('SELECT COUNT(*) as c FROM poll_votes WHERE poll_id = ? AND choice = 1', pollId).c;

  res.json({
    ok: true,
    votes: {
      a: poll.base_votes_a + realA,
      b: poll.base_votes_b + realB,
    },
    result: {
      a: poll.result_a,
      b: poll.result_b,
    },
  });
});

export default router;
