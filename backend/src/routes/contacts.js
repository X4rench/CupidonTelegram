// ═══════════════════════════════════════════════════════════════
// Contacts router (TMA).
// Карточки девушек — name/typazh/notes/photo_uri/is_pinned.
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db, { upsertUserFromInitData } from '../db/index.js';

const router = Router();

// Безопасная проекция контакта — без telegram_user_id колонки
const CONTACT_COLS = 'id, name, typazh, photo_uri, notes, is_pinned, created_at';

function ensureUser(req) {
  const { user } = upsertUserFromInitData(req.tgUser, req.startParam);
  return user;
}

function parseIntId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MAX_NAME_LEN     = 100;
const MAX_TYPAZH_LEN   = 50;
const MAX_NOTES_LEN    = 2_000;
const MAX_PHOTO_URI_LEN = 500;

/**
 * Whitelist форматов photo_uri.
 * Разрешено:
 *   - https://...                     — публичные URL
 *   - blob:...                        — web sandbox blob (Mini App)
 *   - data:image/(jpeg|jpg|png|webp|gif);base64,... — встроенные растровые
 * Запрещено:
 *   - data:image/svg+xml — может содержать <script>/onload (XSS на web-фронте)
 *   - data:text/html, javascript:, vbscript: — прямой XSS
 *   - file://, ph://, content://, asset:// (специфика RN-нативки, в TMA не нужны)
 */
const SAFE_PHOTO_URI_RE =
  /^(?:https:\/\/[^\s]+|blob:[^\s]+|data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+)$/i;

function isPhotoUriSafe(uri) {
  if (!uri) return true;
  if (typeof uri !== 'string') return false;
  if (uri.length > MAX_PHOTO_URI_LEN) return false;
  return SAFE_PHOTO_URI_RE.test(uri);
}

// ── GET /api/v1/contacts ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
  ensureUser(req); // upsert на всякий случай
  const contacts = db.all(
    `SELECT ${CONTACT_COLS} FROM contacts WHERE telegram_user_id = ? ORDER BY is_pinned DESC, created_at DESC`,
    req.tgUser.id
  );
  res.json({ ok: true, contacts });
});

// ── POST /api/v1/contacts ─────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, typazh, photo_uri } = req.body;
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name обязателен' });
  if (name.length > MAX_NAME_LEN)
    return res.status(400).json({ ok: false, error: `name не более ${MAX_NAME_LEN} символов` });
  if (typazh   && typazh.length   > MAX_TYPAZH_LEN)
    return res.status(400).json({ ok: false, error: `typazh не более ${MAX_TYPAZH_LEN} символов` });
  if (!isPhotoUriSafe(photo_uri))
    return res.status(400).json({ ok: false, error: 'photo_uri имеет недопустимый формат' });

  ensureUser(req);

  const { lastInsertRowid } = db.run(
    'INSERT INTO contacts (telegram_user_id, name, typazh, photo_uri) VALUES (?, ?, ?, ?)',
    req.tgUser.id, name.trim(), typazh?.trim() ?? null, photo_uri ?? null
  );
  const contact = db.get(`SELECT ${CONTACT_COLS} FROM contacts WHERE id = ?`, lastInsertRowid);
  res.json({ ok: true, contact });
});

// ── PUT /api/v1/contacts/:id ──────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const cid = parseIntId(req.params.id);
  if (!cid) return res.status(400).json({ ok: false, error: 'id должен быть числом' });

  const { name, typazh, photo_uri, notes } = req.body;
  if (name     && name.length     > MAX_NAME_LEN)   return res.status(400).json({ ok: false, error: `name не более ${MAX_NAME_LEN} символов` });
  if (typazh   && typazh.length   > MAX_TYPAZH_LEN) return res.status(400).json({ ok: false, error: `typazh не более ${MAX_TYPAZH_LEN} символов` });
  if (notes    && notes.length    > MAX_NOTES_LEN)  return res.status(400).json({ ok: false, error: `notes не более ${MAX_NOTES_LEN} символов` });
  if (!isPhotoUriSafe(photo_uri))   return res.status(400).json({ ok: false, error: 'photo_uri имеет недопустимый формат' });

  const contact = db.get('SELECT id FROM contacts WHERE id = ? AND telegram_user_id = ?', cid, req.tgUser.id);
  if (!contact) return res.status(404).json({ ok: false, error: 'Контакт не найден' });

  db.run(
    `UPDATE contacts SET
      name      = COALESCE(?, name),
      typazh    = COALESCE(?, typazh),
      photo_uri = COALESCE(?, photo_uri),
      notes     = COALESCE(?, notes)
     WHERE id = ?`,
    name?.trim() ?? null, typazh?.trim() ?? null, photo_uri ?? null, notes ?? null, cid
  );
  const updated = db.get(`SELECT ${CONTACT_COLS} FROM contacts WHERE id = ?`, cid);
  res.json({ ok: true, contact: updated });
});

// ── PUT /api/v1/contacts/:id/pin ──────────────────────────────────────────────
router.put('/:id/pin', (req, res) => {
  const cid = parseIntId(req.params.id);
  if (!cid) return res.status(400).json({ ok: false, error: 'id должен быть числом' });

  const contact = db.get('SELECT id, is_pinned FROM contacts WHERE id = ? AND telegram_user_id = ?', cid, req.tgUser.id);
  if (!contact) return res.status(404).json({ ok: false, error: 'Контакт не найден' });

  db.run('UPDATE contacts SET is_pinned = ? WHERE id = ?', contact.is_pinned ? 0 : 1, cid);
  const updated = db.get(`SELECT ${CONTACT_COLS} FROM contacts WHERE id = ?`, cid);
  res.json({ ok: true, contact: updated });
});

// ── DELETE /api/v1/contacts/:id ───────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const cid = parseIntId(req.params.id);
  if (!cid) return res.status(400).json({ ok: false, error: 'id должен быть числом' });

  const contact = db.get('SELECT id FROM contacts WHERE id = ? AND telegram_user_id = ?', cid, req.tgUser.id);
  if (!contact) return res.status(404).json({ ok: false, error: 'Контакт не найден' });

  db.run('DELETE FROM contacts WHERE id = ?', cid);
  res.json({ ok: true });
});

export default router;
