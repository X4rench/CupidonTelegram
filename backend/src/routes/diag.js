// ═══════════════════════════════════════════════════════════════
// Diagnostic logging — приём client-side ошибок с фронта.
//
// POST /api/v1/diag/client-log
//   body: { context: string, data?: any }
//
// Фронт может слать сюда что угодно — мы пишем в console.warn с
// префиксом [client-diag], чтобы потом journalctl -u cupidon | grep
// поднял эти записи.
//
// Защита: requireInitData выше, плюс global rate-limit. Body size
// ограничен express.json (по умолчанию 100KB) + наш truncate до 10KB.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';

const router = Router();

const MAX_DATA_BYTES = 10_000;

router.post('/client-log', (req, res) => {
  const tg = req.tgUser || {};
  const context = String(req.body?.context || 'unknown').slice(0, 200);
  let dataStr = '';
  try {
    dataStr = JSON.stringify(req.body?.data ?? null);
    if (dataStr.length > MAX_DATA_BYTES) dataStr = dataStr.slice(0, MAX_DATA_BYTES) + '...';
  } catch (_) { dataStr = '[unserializable]'; }

  // Логируем в stdout — попадёт в journalctl -u cupidon
  console.warn(`[client-diag] ctx=${context} tg_id=${tg.id || '?'} ` +
               `username=${tg.username || '?'} platform=${req.headers['user-agent']?.slice(0, 60) || '?'} ` +
               `data=${dataStr}`);

  res.json({ ok: true });
});

export default router;
