// ═══════════════════════════════════════════════════════════════
// EditProfileScreen — редактирование анкеты.
// Та же форма, что в Questionnaire, но prefill из текущего user_profile,
// и mode='edit' (все поля сразу, без wizard).
//
// На submit — PUT /users/me { user_profile } → refresh() → nav(-1).
// Аватар — берётся из TG (photo_url не редактируется в TMA: TG задаёт его сам).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { updateMe } from '../api';
import { QuestionnaireForm, type QFormValues } from './QuestionnaireForm';
import { useBackButton } from '../utils/backButton';
import { notificationHaptic } from '../utils/haptics';
import { getTgUser } from '../auth';

export function EditProfileScreen() {
  const nav = useNavigate();
  const { me, refresh } = useMe();
  const tgUser = getTgUser();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const submit = async (values: QFormValues) => {
    if (saving) return;
    setSaving(true);
    try {
      await updateMe({ user_profile: values });
      await refresh();
      notificationHaptic('success');
      setToast('Профиль обновлён');
      setTimeout(() => nav(-1), 900);
    } catch (e: any) {
      notificationHaptic('error');
      setToast(e?.message || 'Не удалось сохранить');
      setSaving(false);
    }
  };

  const displayName = me?.user_profile?.name || me?.first_name || 'Пользователь';
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Редактировать профиль</span>
      </div>

      <div style={styles.content}>
        {/* Avatar preview (read-only — TG задаёт фото) */}
        <div style={styles.avatarSection}>
          <div style={styles.avatarWrap}>
            {tgUser?.photo_url ? (
              <img src={tgUser.photo_url} alt="" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarFallback}>
                <span style={styles.avatarInitials}>{initials}</span>
              </div>
            )}
          </div>
          <span style={styles.avatarHint}>Фото и имя берутся из Telegram</span>
        </div>

        <QuestionnaireForm
          mode="edit"
          initial={me?.user_profile ?? { name: me?.first_name }}
          onSubmit={submit}
          saving={saving}
          submitLabel="Сохранить"
        />
      </div>

      {toast && (
        <div style={styles.toast}>
          {toast}
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
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },
  header: {
    padding: '0 20px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' },
  content: {
    padding: '0 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  avatarWrap: {
    width: 80, height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarFallback: {
    width: '100%', height: '100%',
    background: 'var(--gradient-accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { color: '#fff', fontSize: 28, fontWeight: 700 },
  avatarHint: { fontSize: 12, color: 'var(--text-muted)' },

  toast: {
    position: 'fixed',
    left: 20,
    right: 20,
    bottom: 'calc(var(--safe-bottom) + 24px)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '12px 16px',
    textAlign: 'center',
    fontSize: 14,
    color: 'var(--text-primary)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 200,
  },
};
