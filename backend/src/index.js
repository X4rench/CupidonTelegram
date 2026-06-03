// ═══════════════════════════════════════════════════════════════
// Cupidon TMA Backend — Entry point
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { requestLogger } from './middleware/logger.js';
import { requireInitData } from './middleware/auth.js';

// БД инициализируется при импорте
import './db/index.js';
// Промпты и опросы upsertятся при каждом старте (idempotent)
import './db/seed.js';
import './db/polls_seed.js';

// Phase C routes
import usersRouter        from './routes/users.js';
import analysisRouter     from './routes/analysis.js';
import simulatorRouter    from './routes/simulator.js';
import firstMessageRouter from './routes/firstMessage.js';
import adminRouter        from './routes/admin.js';
import contactsRouter     from './routes/contacts.js';
import promoRouter        from './routes/promo.js';
import pollsRouter        from './routes/polls.js';
import paymentsRouter     from './routes/payments.js';
import telegramRouter     from './routes/telegram.js'; // /telegram/webhook
import yookassaRouter     from './routes/yookassa.js'; // /yookassa/webhook

// Log retention
import { startCleanupSchedule } from './utils/logCleanup.js';
// YooKassa reconciliation (catches webhooks that didn't reach us)
import { startReconciliation } from './utils/reconcile.js';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// За nginx на проде → доверяем X-Forwarded-For ровно на N hops.
const TRUST_HOPS = parseInt(process.env.TRUST_PROXY_HOPS, 10) || 0;
if (TRUST_HOPS > 0) app.set('trust proxy', TRUST_HOPS);

// ── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: (origin, cb) => {
    // В production: запросы без Origin отклоняем (защита от curl/Postman без headers).
    // Health-check (/health) защищён отдельно ниже — не проходит через этот middleware.
    if (!origin) {
      if (isProd) return cb(null, false);
      return cb(null, true);
    }
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    const err = new Error(`CORS: origin ${origin} not allowed`);
    err.status = 403;
    err.code = 'CORS_NOT_ALLOWED';
    return cb(err);
  },
  credentials: false,
}));

app.use(express.json({ limit: '2mb' }));
app.use(requestLogger);

// ── Health (БЕЗ авторизации) ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'cupidon-tma-backend',
    version: '1.0.0',
    env: process.env.NODE_ENV,
    model: process.env.POLZA_MODEL,
    auth: 'tg-initdata',
    proxy: process.env.TG_API_PROXY ? 'configured' : 'direct',
    timestamp: new Date().toISOString(),
  });
});

// ── Webhook endpoints — БЕЗ initData (своя верификация) ─────────────────────
// Подключаем ДО глобального requireInitData, иначе webhook не пройдёт авторизацию.
app.use('/api/v1/telegram', telegramRouter);
// ЮКасса присылает уведомления о платежах со своей стороны (не из Mini App) —
// проверяет себя через X-YK-Webhook-Token (secret-token из YK_WEBHOOK_SECRET).
app.use('/api/v1/yookassa', yookassaRouter);

// ── Все остальные /api/v1/* требуют initData ─────────────────────────────────
app.use('/api/v1', requireInitData);

// ── Rate limiters (после auth — key по tg_user_id, не по IP) ────────────────
// Per-TG-user key чтобы юзеры за одним CGNAT IP не блокировали друг друга.
const userKeyGen = (req) => req.tgUser?.id ? `tg:${req.tgUser.id}` : req.ip;

// Глобальный лимит на /api/v1/* — все endpoint'ы.
const globalUserLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX, 10)        || 30,
  keyGenerator: userKeyGen,
  message:  { ok: false, error: 'Слишком много запросов. Подожди минуту.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Жёсткий лимит на /promo — защита от перебора кодов.
const promoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,          // 1 час
  max: 5,
  keyGenerator: userKeyGen,
  message: { ok: false, error: 'Слишком много попыток ввода промокода. Попробуй через час.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Лимит на /payments — защита от спама invoice'ов.
const paymentsLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: userKeyGen,
  message: { ok: false, error: 'Слишком много попыток оплаты. Подожди минуту.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Лимит на /users/claim-tg-bonus — защита от фарма бонусов.
const tgBonusLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,     // 24 часа
  max: 3,
  keyGenerator: userKeyGen,
  message: { ok: false, error: 'Слишком много попыток получить бонус. Попробуй позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Подключаемые роуты с per-endpoint лимитами (специфичные ДО глобального):
app.use('/api/v1/promo',                       promoLimiter);
app.use('/api/v1/payments',                    paymentsLimiter);
app.use('/api/v1/users/claim-tg-bonus',        tgBonusLimiter);
app.use('/api/v1',                             globalUserLimiter);

app.use('/api/v1/users',         usersRouter);
app.use('/api/v1/analysis',      analysisRouter);
app.use('/api/v1/simulator',     simulatorRouter);
app.use('/api/v1/first-message', firstMessageRouter);
app.use('/api/v1/contacts',      contactsRouter);
app.use('/api/v1/admin',         adminRouter);
app.use('/api/v1/promo',         promoRouter);
app.use('/api/v1/polls',         pollsRouter);
app.use('/api/v1/payments',      paymentsRouter);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Маршрут ${req.method} ${req.path} не найден` });
});

// ── CORS error handler (ДО global handler) ──────────────────────────────────
// CORS-ошибки бросаются как Error из middleware и без специального handler'а
// уходят в global error handler, который возвращает 500. Возвращаем 403.
app.use((err, req, res, next) => {
  if (err?.code === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ ok: false, error: 'CORS: origin запрещён', code: 'CORS_NOT_ALLOWED' });
  }
  return next(err);
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const errorId = Math.random().toString(36).slice(2, 10);
  console.error(`[Server Error] [${errorId}]`, err);
  const isProdEnv = process.env.NODE_ENV === 'production';
  // Валидируем err.status — иначе можно получить 200 OK с error body.
  const status = (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600)
    ? err.status
    : 500;
  res.status(status).json({
    ok: false,
    error: isProdEnv ? 'Внутренняя ошибка сервера' : (err.message || 'Внутренняя ошибка сервера'),
    error_id: errorId,
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      Cupidon TMA Backend — Running       ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Port:   ${String(PORT).padEnd(32)}║`);
  console.log(`║  Env:    ${String(process.env.NODE_ENV ?? 'dev').padEnd(32)}║`);
  console.log(`║  Model:  ${String(process.env.POLZA_MODEL ?? '-').padEnd(32)}║`);
  console.log(`║  Auth:   tg-initdata${' '.repeat(20)}║`);
  console.log(`║  Proxy:  ${(process.env.TG_API_PROXY ? 'configured' : 'direct').padEnd(32)}║`);
  console.log('╚══════════════════════════════════════════╝\n');

  // Periodic log cleanup
  startCleanupSchedule();
  // YooKassa reconciliation (no-op если YK_SHOP_ID/YK_SECRET_KEY не заданы)
  startReconciliation();
});

export default app;
