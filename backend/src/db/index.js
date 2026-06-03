// ═══════════════════════════════════════════════════════════════
// Database — better-sqlite3 (синхронный API, надёжно на Node 20 LTS).
//
// WAL + synchronous=NORMAL = быстро + безопасно для concurrent reads.
// Все SELECT-ы — через `get()`/`all()`, write — `run()`. Транзакции — `transaction()`.
// ═══════════════════════════════════════════════════════════════
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dir = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || './data/cupidon.sqlite';

mkdirSync(dirname(resolvePath(DB_PATH)), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Применить базовую схему ──────────────────────────────────────────────────
const schema = readFileSync(join(__dir, 'schema.sql'), 'utf-8');
// PRAGMA уже выставлены выше — вычищаем из schema.sql
const schemaCleaned = schema.replace(/PRAGMA[^;]+;/g, '');
db.exec(schemaCleaned);

// ── Версионные миграции (каждая идемпотентна) ────────────────────────────────
// Когда нужно поменять схему — добавь новую запись { version, sql }.
// Уже применённые помечаются в schema_migrations и не запускаются повторно.
const MIGRATIONS = [
  // L2 — стартовая миграция-маркер: проверяет что schema_migrations работает
  // и что миграционный pipeline настроен. Не меняет схему.
  {
    version: '001_init_marker',
    sql: '-- init marker: schema_migrations infra ready',
  },
  // 002 — добавляем колонку tutorial_done для проигрывания туториала
  // только при первом входе после онбординга+анкеты.
  // Существующим юзерам ставим tutorial_done=1 (они уже видели приложение —
  // не дёргаем их туториалом при апгрейде).
  // Обрабатывается особо ниже (см. applyTutorialDoneMigration) потому что
  // schema.sql уже содержит колонку → ALTER упадёт на fresh-install.
  {
    version: '002_users_tutorial_done',
    sql: null, // null = специальная обработка
  },
];

/**
 * 002 migration — добавить tutorial_done. Идемпотентность через PRAGMA table_info:
 * если колонка уже есть (после fresh CREATE TABLE из schema.sql) — пропускаем ALTER,
 * только UPDATE существующих юзеров чтобы не дёргать их туториалом.
 */
function applyTutorialDoneMigration() {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const hasCol = cols.some(c => c.name === 'tutorial_done');
  if (!hasCol) {
    db.exec(`ALTER TABLE users ADD COLUMN tutorial_done INTEGER NOT NULL DEFAULT 0`);
  }
  // На существующих юзерах ставим tutorial_done=1 (они уже работали с приложением)
  db.exec(`UPDATE users SET tutorial_done = 1 WHERE tutorial_done = 0`);
}

function isApplied(version) {
  return !!db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
}
function markApplied(version) {
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(version);
}

for (const m of MIGRATIONS) {
  if (isApplied(m.version)) continue;
  try {
    if (m.version === '002_users_tutorial_done') {
      applyTutorialDoneMigration();
    } else if (m.sql) {
      db.exec(m.sql);
    }
    markApplied(m.version);
    console.log(`[db] applied migration ${m.version}`);
  } catch (err) {
    console.error(`[db] migration ${m.version} failed:`, err.message);
    throw err;
  }
}

console.log(`[db] better-sqlite3 connected: ${DB_PATH}`);

// ── Совместимый интерфейс с RN-версией (get/all/run/transaction) ─────────────
export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}
export function exec(sql) {
  return db.exec(sql);
}
export function transaction(fn) {
  return db.transaction(fn)();
}

export default { all, get, run, exec, transaction, raw: db };

// ── Утилиты для работы с user-строкой ────────────────────────────────────────
/**
 * upsert по telegram_user_id из validated initData.
 * Обновляет first_name/last_name/username/language_code на каждом вызове —
 * юзер мог сменить их в TG, мы хотим отражать актуальное.
 *
 * Возвращает: { user, isNew } где user — полная строка из БД.
 */
export function upsertUserFromInitData(tgUser, startParam = null) {
  // TMA2 — start_param приходит из initData (TG валидирует HMAC), но через
  // QR-spoofing атакующий может подсунуть длинный реф-код. Ограничиваем длину.
  const safeStartParam = startParam != null ? String(startParam).slice(0, 256) : null;

  const existing = get('SELECT * FROM users WHERE telegram_user_id = ?', tgUser.id);
  if (existing) {
    run(
      `UPDATE users SET
         first_name    = ?,
         last_name     = ?,
         username      = ?,
         language_code = ?,
         last_seen_at  = datetime('now'),
         updated_at    = datetime('now')
       WHERE telegram_user_id = ?`,
      tgUser.first_name ?? null,
      tgUser.last_name ?? null,
      tgUser.username ?? null,
      tgUser.language_code ?? null,
      tgUser.id
    );
    return { user: get('SELECT * FROM users WHERE telegram_user_id = ?', tgUser.id), isNew: false };
  }

  run(
    `INSERT INTO users
       (telegram_user_id, first_name, last_name, username, language_code, start_param, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    tgUser.id,
    tgUser.first_name ?? null,
    tgUser.last_name ?? null,
    tgUser.username ?? null,
    tgUser.language_code ?? null,
    safeStartParam
  );
  return { user: get('SELECT * FROM users WHERE telegram_user_id = ?', tgUser.id), isNew: true };
}

/** Активная подписка (или null). Активность — по expires_at > now, не по cancelled_at. */
export function getActiveSubscription(telegramUserId) {
  return get(
    `SELECT plan, source, started_at, expires_at, is_trial, cancelled_at, auto_renew
     FROM subscriptions
     WHERE telegram_user_id = ? AND datetime(expires_at) > datetime('now')
     ORDER BY datetime(expires_at) DESC
     LIMIT 1`,
    telegramUserId
  );
}

/** Тир пользователя на основании активной подписки (free | basic | premium). */
export function getUserTier(telegramUserId) {
  const sub = getActiveSubscription(telegramUserId);
  if (!sub) return 'free';
  // day_pass даёт временный буст к текущему тиру; если есть только day_pass — считаем как basic.
  if (sub.plan === 'day_pass') return 'basic';
  return sub.plan;
}
