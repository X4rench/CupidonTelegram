// Опциональный Redis-кеш для AI-ответов.
// Если REDIS_URL не задан или Redis недоступен — все функции no-op
// и приложение работает как раньше (graceful degradation).

import crypto from 'node:crypto';

const TTL = parseInt(process.env.AI_CACHE_TTL, 10) || 604800; // 7 дней по умолчанию

let redis = null;
let redisReady = false;
let triedConnect = false;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redis) return redisReady ? redis : null;
  if (triedConnect) return null;
  triedConnect = true;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on('error', (e) => {
      if (redisReady) console.warn('[cache] redis error:', e.message);
      redisReady = false;
    });
    redis.on('ready', () => {
      console.log('[cache] redis connected');
      redisReady = true;
    });
    await redis.connect();
    redisReady = true;
    return redis;
  } catch (e) {
    console.warn('[cache] redis init failed:', e.message);
    redis = null;
    redisReady = false;
    return null;
  }
}

export function makeKey(scope, payload) {
  const h = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
  return `cupidon:${scope}:${h}`;
}

export async function getCached(key) {
  const r = await getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function setCached(key, value, ttl = TTL) {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (_) {}
}

export function isCacheEnabled() {
  return !!process.env.REDIS_URL;
}
