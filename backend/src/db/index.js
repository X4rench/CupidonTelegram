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
  // 003 — billing_period для годовых/квартальных подписок (Basic/Premium).
  // Значения: 'monthly' | 'quarterly' | 'yearly'. Дефолт 'monthly' — для
  // существующих subscriptions подходит (мы и так считаем по expires_at;
  // эта колонка только для UI/аналитики).
  {
    version: '003_subs_billing_period',
    sql: null, // спец-обработка через PRAGMA table_info (см. applyBillingPeriodMigration)
  },
  // 004 — таблицы партнёрской программы (partners / referrals / commissions /
  // payouts / daily_stats). Идемпотентно через CREATE TABLE IF NOT EXISTS.
  {
    version: '004_partners',
    sql: `
      CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id INTEGER NOT NULL UNIQUE,
        code TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        commission_pct INTEGER NOT NULL DEFAULT 50,
        status TEXT NOT NULL DEFAULT 'active',
        payout_details TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by_admin_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_partners_code ON partners(code);
      CREATE INDEX IF NOT EXISTS idx_partners_user ON partners(telegram_user_id);

      CREATE TABLE IF NOT EXISTS partner_referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id),
        telegram_user_id INTEGER NOT NULL UNIQUE,
        attributed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_referrals_partner ON partner_referrals(partner_id);

      CREATE TABLE IF NOT EXISTS partner_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id),
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT,
        note TEXT,
        admin_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_payouts_partner ON partner_payouts(partner_id, status);

      CREATE TABLE IF NOT EXISTS partner_commissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id),
        payment_id INTEGER NOT NULL REFERENCES payments(id),
        telegram_user_id INTEGER NOT NULL,
        gross_amount INTEGER NOT NULL,
        ai_cost INTEGER NOT NULL,
        yk_fee INTEGER NOT NULL,
        tax INTEGER NOT NULL,
        net_amount INTEGER NOT NULL,
        commission_pct INTEGER NOT NULL,
        commission_amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        available_at TEXT NOT NULL,
        paid_at TEXT,
        payout_id INTEGER REFERENCES partner_payouts(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_commissions_partner ON partner_commissions(partner_id, status);
      CREATE INDEX IF NOT EXISTS idx_commissions_available_at ON partner_commissions(available_at);
      CREATE INDEX IF NOT EXISTS idx_commissions_payment ON partner_commissions(payment_id);

      CREATE TABLE IF NOT EXISTS partner_daily_stats (
        partner_id INTEGER NOT NULL REFERENCES partners(id),
        date TEXT NOT NULL,
        new_referrals INTEGER NOT NULL DEFAULT 0,
        paid_users INTEGER NOT NULL DEFAULT 0,
        gross_revenue INTEGER NOT NULL DEFAULT 0,
        commission_earned INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (partner_id, date)
      );
    `,
  },
  // 005 — отдельный лимит на сообщения в симуляторе.
  // daily_sim_messages / daily_sim_reset_at — дневной счётчик
  // sim_bonus_quota — bonus-сообщения от Day Pass (накапливаются, не сгорают)
  {
    version: '005_simulator_message_limits',
    sql: null, // спец-обработка ниже
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

/**
 * 003 — billing_period в subscriptions. Идемпотентно через PRAGMA table_info.
 */
function applyBillingPeriodMigration() {
  const cols = db.prepare('PRAGMA table_info(subscriptions)').all();
  const hasCol = cols.some(c => c.name === 'billing_period');
  if (!hasCol) {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN billing_period TEXT NOT NULL DEFAULT 'monthly'`);
  }
}

/**
 * 005 — отдельный лимит на сообщения в чате симулятора. Идемпотентно
 * через PRAGMA table_info. Все три колонки добавляются раз.
 */
function applySimulatorMessageLimitsMigration() {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const has = (name) => cols.some(c => c.name === name);
  if (!has('daily_sim_messages')) {
    db.exec(`ALTER TABLE users ADD COLUMN daily_sim_messages INTEGER NOT NULL DEFAULT 0`);
  }
  if (!has('daily_sim_reset_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN daily_sim_reset_at TEXT`);
  }
  if (!has('sim_bonus_quota')) {
    db.exec(`ALTER TABLE users ADD COLUMN sim_bonus_quota INTEGER NOT NULL DEFAULT 0`);
  }
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
    } else if (m.version === '003_subs_billing_period') {
      applyBillingPeriodMigration();
    } else if (m.version === '005_simulator_message_limits') {
      applySimulatorMessageLimitsMigration();
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
