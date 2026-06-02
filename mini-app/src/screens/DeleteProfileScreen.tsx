// ═══════════════════════════════════════════════════════════════
// DeleteProfileScreen — двойное подтверждение удаления аккаунта.
//
// Шаг 1: предупреждение + список последствий + чекбокс «Я понимаю».
// Шаг 2 (модалка): финальное подтверждение → DELETE /users/me.
//
// После успешного удаления — показываем экран «Аккаунт удалён» и
// перезагружаем страницу (новый /users/me снова создаст пустой профиль,
// т.к. initData с TG не меняется — но это уже на ревью продакта).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { SecondaryButton } from '../components/SecondaryButton';
import { GradientButton } from '../components/GradientButton';
import { deleteMe } from '../api';
import { useBackButton } from '../utils/backButton';
import { notificationHaptic, impactHaptic } from '../utils/haptics';

const CONSEQUENCES = [
  'Все диалоги и анализы будут удалены',
  'История симуляций и созданные девушки исчезнут',
  'Баллы и активные подписки сбросятся',
  'Действие нельзя отменить',
];

export function DeleteProfileScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const [iUnderstand, setIUnderstand] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reallyDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMe();
      notificationHaptic('success');
      setDone(true);
    } catch (e: any) {
      notificationHaptic('error');
      setError(e?.message || 'Не удалось удалить аккаунт');
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  if (done) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.successIcon}>
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--status-positive)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          </div>
          <h1 style={styles.successTitle}>Аккаунт удалён</h1>
          <p style={styles.successSub}>
            Все твои данные удалены. Если захочешь вернуться — открой Купидона снова, будет создан новый чистый профиль.
          </p>
          <GradientButton full onClick={() => window.location.reload()}>
            Закрыть
          </GradientButton>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Удалить аккаунт</span>
      </div>

      <div style={styles.content}>
        <div style={styles.iconWrap}>
          <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="var(--status-negative)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,6 5,6 21,6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            <line x1={10} y1={11} x2={10} y2={17} />
            <line x1={14} y1={11} x2={14} y2={17} />
          </svg>
        </div>

        <h1 style={styles.headline}>Точно удалить аккаунт?</h1>
        <p style={styles.sub}>
          Эта операция необратима. Перед подтверждением убедись, что понимаешь последствия.
        </p>

        <div style={styles.list}>
          <div style={styles.listTitle}>Что произойдёт:</div>
          {CONSEQUENCES.map((c, i) => (
            <div key={i} style={styles.row}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--status-negative)" strokeWidth={2}>
                <circle cx={12} cy={12} r={10} />
                <line x1={8} y1={12} x2={16} y2={12} />
              </svg>
              <span style={styles.rowText}>{c}</span>
            </div>
          ))}
        </div>

        <label style={styles.check}>
          <input
            type="checkbox"
            checked={iUnderstand}
            onChange={e => { impactHaptic('light'); setIUnderstand(e.target.checked); }}
            style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)' }}
          />
          <span style={styles.checkText}>Я понимаю, что данные удалятся навсегда</span>
        </label>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.buttons}>
          <SecondaryButton full onClick={() => nav(-1)}>Отмена</SecondaryButton>
          <button
            disabled={!iUnderstand || deleting}
            onClick={() => { impactHaptic('medium'); setConfirmOpen(true); }}
            style={{
              ...styles.deleteBtn,
              opacity: !iUnderstand ? 0.4 : 1,
              cursor: !iUnderstand ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--status-negative)" strokeWidth={2}>
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
            Удалить
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div style={styles.overlay} onClick={() => !deleting && setConfirmOpen(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalIcon}>
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--status-negative)" strokeWidth={2}>
                <circle cx={12} cy={12} r={10} />
                <line x1={12} y1={8} x2={12} y2={12} />
                <line x1={12} y1={16} x2={12.01} y2={16} />
              </svg>
            </div>
            <h2 style={styles.modalTitle}>Последнее подтверждение</h2>
            <p style={styles.modalSub}>После нажатия «Удалить» аккаунт исчезнет навсегда.</p>
            <div style={styles.modalButtons}>
              <SecondaryButton full onClick={() => setConfirmOpen(false)} disabled={deleting}>Отмена</SecondaryButton>
              <button onClick={reallyDelete} disabled={deleting} style={styles.confirmDel}>
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 16px)',
    paddingBottom: 'calc(var(--safe-bottom) + 24px)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '0 20px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' },

  content: {
    flex: 1,
    padding: '8px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 96, height: 96,
    borderRadius: 48,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  headline: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  sub: {
    margin: 0,
    fontSize: 14,
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: '21px',
  },
  list: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  listTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  rowText: { fontSize: 13, color: 'var(--text-secondary)', flex: 1, lineHeight: '19px' },

  check: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    padding: '8px 4px',
  },
  checkText: { fontSize: 14, color: 'var(--text-secondary)' },

  error: {
    width: '100%',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: 'var(--status-negative)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    textAlign: 'center',
  },

  buttons: { width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 20px',
    borderRadius: 12,
    minHeight: 48,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: 'var(--status-negative)',
    fontSize: 15,
    fontWeight: 600,
    width: '100%',
  },

  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--modal-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 200,
  },
  modal: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 20,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  modalIcon: {
    width: 56, height: 56, borderRadius: 28,
    background: 'rgba(239,68,68,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, textAlign: 'center', color: 'var(--text-primary)' },
  modalSub: { margin: 0, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: '19px' },
  modalButtons: { display: 'flex', gap: 10, width: '100%', marginTop: 4 },
  confirmDel: {
    flex: 1,
    padding: '14px 20px',
    borderRadius: 12,
    background: 'var(--status-negative)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },

  successIcon: {
    width: 96, height: 96, borderRadius: 48,
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 24,
  },
  successTitle: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
  successSub: { margin: 0, fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', lineHeight: '21px' },
};
