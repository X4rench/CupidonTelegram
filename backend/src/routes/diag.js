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
// GET /api/v1/diag/beacon  (БЕЗ initData — public endpoint)
//   query: stage=...&ua=...&...
// Используется на самых ранних стадиях загрузки (HTML, main.tsx)
// когда initData ещё может быть недоступна. Логирует через [client-diag-beacon].
//
// Защита: requireInitData выше для /client-log, плюс global rate-limit. Body size
// ограничен express.json (по умолчанию 100KB) + наш truncate до 10KB.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';

const router = Router();
// Beacon route — отдельный без auth. Монтируется в src/index.js до requireInitData.
export const beaconRouter = Router();

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

// Public beacon — GET, без auth. Все query-параметры идут в лог.
// Frontend стучится через new Image().src = '/api/v1/diag/beacon?stage=...'
// — это работает даже без initData и до любого fetch'а.
beaconRouter.get('/beacon', (req, res) => {
  const q = req.query || {};
  const stage = String(q.stage || 'unknown').slice(0, 80);
  const ua = String(req.headers['user-agent'] || '').slice(0, 150);
  // Сбрасываем все query кроме stage в data
  const data = {};
  for (const [k, v] of Object.entries(q)) {
    if (k === 'stage' || k === 'ts') continue;
    data[k] = String(v).slice(0, 200);
  }
  let dataStr = '';
  try { dataStr = JSON.stringify(data); } catch (_) { dataStr = '[unserializable]'; }

  console.warn(`[client-diag-beacon] stage=${stage} ip=${req.ip} ua="${ua}" data=${dataStr}`);

  // Возвращаем 1×1 GIF — стандартный трюк для трекинговых пикселей
  const buf = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store');
  res.send(buf);
});

export default router;
