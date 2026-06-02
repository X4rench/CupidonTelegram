-- ═══════════════════════════════════════════════════════════════
-- Cupidon TMA DB Schema
--
-- Главное отличие от RN-версии: идентификация юзера — telegram_user_id
-- (numeric, выдаётся Telegram), а НЕ device_id/hardware_id.
-- telegram_user_id невозможно подделать (initData подписан HMAC по BOT_TOKEN),
-- и он сам по себе является и identity, и hardware-lock — поэтому таблицы
-- device_bonuses, feature_trials_durable, free_trials, session_tokens из
-- RN-версии нам НЕ нужны.
--
-- SQLite через better-sqlite3 (синхронный API, стабильно на Node 20 LTS).
-- ═══════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ── Пользователи (1 строка = 1 TG-аккаунт) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL UNIQUE,
  -- Метаинфа из initData (обновляется при каждом /users/me, не PII-критичная)
  first_name        TEXT,
  last_name         TEXT,
  username          TEXT,
  language_code     TEXT,
  -- start_param из deep-link (реф-код, промо-кампания)
  start_param       TEXT,
  -- Счётчики (для отображения в Profile)
  requests_count    INTEGER NOT NULL DEFAULT 0,
  simulations_count INTEGER NOT NULL DEFAULT 0,
  -- Дневной лимит (для free-тарифа)
  daily_requests    INTEGER NOT NULL DEFAULT 0,
  daily_reset_at    TEXT,
  -- Подписка (избыточно с таблицей subscriptions, но удобно для быстрых проверок)
  sub_tier          TEXT NOT NULL DEFAULT 'free',  -- free | basic | premium
  sub_expires_at    TEXT,
  -- TG-канал бонус (+5 к лимиту за подписку)
  tg_bonus_claimed  INTEGER NOT NULL DEFAULT 0,
  tg_bonus_quota    INTEGER NOT NULL DEFAULT 0,
  -- Профиль из анкеты (JSON: {gender, age, goals, ...})
  user_profile      TEXT,
  -- Прохождение онбординга
  onboarding_done   INTEGER NOT NULL DEFAULT 0,
  questionnaire_done INTEGER NOT NULL DEFAULT 0,
  -- Часовые метки
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ── Подписки (источник истины для платных тарифов) ───────────────────────────
-- Активность определяется по expires_at > now (НЕ по cancelled_at).
-- cancelled_at = "автопродление выключено", но доступ до конца периода сохраняется.
-- Revoke (админский) ставит expires_at = now + cancelled_at + auto_renew=0.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL,
  plan              TEXT NOT NULL,         -- basic | premium | day_pass
  source            TEXT NOT NULL,         -- stars | yookassa | promo | admin_grant
  started_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  is_trial          INTEGER NOT NULL DEFAULT 0,
  cancelled_at      TEXT,
  auto_renew        INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(telegram_user_id, expires_at DESC);

-- ── Платежи (идемпотентность по charge_id) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id    INTEGER NOT NULL,
  -- Stars: telegram_payment_charge_id; ЮКасса: payment.id
  charge_id           TEXT NOT NULL UNIQUE,
  provider            TEXT NOT NULL,        -- stars | yookassa
  plan                TEXT NOT NULL,        -- basic | premium | day_pass
  amount_minor        INTEGER NOT NULL,     -- для Stars — кол-во звёзд, для ЮК — копейки
  currency            TEXT NOT NULL,        -- XTR | RUB
  status              TEXT NOT NULL,        -- pending | succeeded | refunded | failed
  processed_at        TEXT,
  raw                 TEXT,                 -- JSON payload от провайдера для отладки
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ── Контакты (девушки в Стреле) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL,
  name              TEXT NOT NULL,
  typazh            TEXT,
  photo_uri         TEXT,               -- URL или blob:-ID (resolve на клиенте)
  is_pinned         INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(telegram_user_id);

-- ── Сессии анализа (Стрела/Wing) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL,
  contact_id        INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  input_text        TEXT NOT NULL,
  with_context      INTEGER NOT NULL DEFAULT 0,
  result            TEXT,
  score             REAL,
  mood              TEXT,
  input_hash        TEXT,
  typazh_hint       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_user ON analysis_sessions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_input_hash ON analysis_sessions(telegram_user_id, input_hash);

-- ── Сессии симулятора ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulator_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL,
  typazh            TEXT NOT NULL,
  place             TEXT NOT NULL,
  difficulty        INTEGER NOT NULL DEFAULT 5,
  messages          TEXT NOT NULL DEFAULT '[]',
  score             REAL,
  completed         INTEGER NOT NULL DEFAULT 0,
  result_json       TEXT,
  result_hash       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sim_user ON simulator_sessions(telegram_user_id);

-- ── Анализ отказов ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rejection_analyses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL,
  input_text        TEXT NOT NULL,
  result            TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rejection_user ON rejection_analyses(telegram_user_id);

-- ── Сгенерированные первые сообщения ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS first_messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER NOT NULL,
  girl_name         TEXT,
  tags              TEXT NOT NULL DEFAULT '[]',
  profile_text      TEXT,
  messages          TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_first_msg_user ON first_messages(telegram_user_id);

-- ── Промпты (редактируются в админке) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  system_prompt TEXT NOT NULL,
  model         TEXT NOT NULL DEFAULT 'qwen/qwen3-235b-a22b-2507',
  temperature   REAL NOT NULL DEFAULT 0.7,
  max_tokens    INTEGER NOT NULL DEFAULT 1500,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Лог API запросов (для дебага; PII вырезается) ───────────────────────────
CREATE TABLE IF NOT EXISTS request_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id  INTEGER,
  endpoint          TEXT NOT NULL,
  method            TEXT NOT NULL,
  request_body      TEXT,
  response_status   INTEGER,
  duration_ms       INTEGER,
  ai_model          TEXT,
  ai_tokens         INTEGER,
  cache_hit         INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_user ON request_logs(telegram_user_id);

-- ── Опросы для ленты теории (ежедневный) ────────────────────────────────────
-- БЕЗ английских колонок — TMA-версия только на русском.
CREATE TABLE IF NOT EXISTS polls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  question      TEXT NOT NULL,
  option_a      TEXT NOT NULL,
  option_b      TEXT NOT NULL,
  base_votes_a  INTEGER NOT NULL DEFAULT 0,
  base_votes_b  INTEGER NOT NULL DEFAULT 0,
  result_a      TEXT,
  result_b      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id           INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  telegram_user_id  INTEGER NOT NULL,
  choice            INTEGER NOT NULL,            -- 0 = A, 1 = B
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(poll_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes(telegram_user_id);

-- ── Промокоды и реферальная программа ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  -- bonus_quota: +N к tg_bonus_quota; sub_trial: даёт N дней триала
  kind            TEXT NOT NULL,
  payload         TEXT NOT NULL,           -- JSON: { value: 5 } или { plan: 'basic', days: 7 }
  max_uses        INTEGER,                 -- NULL = безлимит
  used_count      INTEGER NOT NULL DEFAULT 0,
  expires_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_uses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  promo_code_id     INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  telegram_user_id  INTEGER NOT NULL,
  used_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(promo_code_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_uses_user ON promo_uses(telegram_user_id);

-- ── Аудит-лог админских действий ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON admin_audit_log(action);

-- ── Версия миграций ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
