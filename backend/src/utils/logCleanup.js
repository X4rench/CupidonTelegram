// ═══════════════════════════════════════════════════════════════
// Log retention / TTL cleanup.
// Удаляет старые записи из request_logs и admin_audit_log,
// чтобы:
//   - база не разрасталась бесконечно
//   - утечка БД не сливала годовую историю запросов
//
// Конфигурация через .env:
//   LOGS_RETENTION_DAYS  (default 90)  — для request_logs
//   AUDIT_RETENTION_DAYS (default 180) — для admin_audit_log
//   LOG_CLEANUP_INTERVAL_HOURS (default 24) — частота запуска
//
// Запускается:
//   1. Один раз при старте сервера (через 30 секунд после старта)
//   2. Дальше — раз в LOG_CLEANUP_INTERVAL_HOURS часов
// ═══════════════════════════════════════════════════════════════
import db from '../db/index.js';

const LOGS_RETENTION_DAYS  = parseInt(process.env.LOGS_RETENTION_DAYS, 10)  || 90;
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS, 10) || 180;
const INTERVAL_HOURS       = parseInt(process.env.LOG_CLEANUP_INTERVAL_HOURS, 10) || 24;

export function runCleanup() {
  const result = { request_logs_deleted: 0, audit_log_deleted: 0 };
  try {
    const r1 = db.run(
      `DELETE FROM request_logs WHERE created_at < datetime('now', ?)`,
      `-${LOGS_RETENTION_DAYS} days`
    );
    result.request_logs_deleted = r1.changes;
  } catch (e) {
    console.warn('[logCleanup] request_logs failed:', e.message);
  }
  try {
    const r2 = db.run(
      `DELETE FROM admin_audit_log WHERE created_at < datetime('now', ?)`,
      `-${AUDIT_RETENTION_DAYS} days`
    );
    result.audit_log_deleted = r2.changes;
  } catch (e) {
    console.warn('[logCleanup] admin_audit_log failed:', e.message);
  }
  return result;
}

export function startCleanupSchedule() {
  setTimeout(() => {
    const r = runCleanup();
    console.log(
      `[logCleanup] Initial run: ` +
      `request_logs=${r.request_logs_deleted}, audit_log=${r.audit_log_deleted} ` +
      `(retention: ${LOGS_RETENTION_DAYS}d / ${AUDIT_RETENTION_DAYS}d)`
    );
  }, 30_000).unref();

  const intervalMs = INTERVAL_HOURS * 3600 * 1000;
  setInterval(() => {
    const r = runCleanup();
    if (r.request_logs_deleted || r.audit_log_deleted) {
      console.log(
        `[logCleanup] Scheduled run: ` +
        `request_logs=${r.request_logs_deleted}, audit_log=${r.audit_log_deleted}`
      );
    }
  }, intervalMs).unref();
}
