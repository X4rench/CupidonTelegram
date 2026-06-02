// ═══════════════════════════════════════════════════════════════
// QuestionnaireScreen — wizard анкеты после онбординга.
// Сохраняет ответы в user_profile + ставит questionnaire_done=true,
// затем редиректит на Home.
//
// Если у юзера уже есть user_profile (повторно зашёл) — поля prefill.
// ═══════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuestionnaireForm, type QFormValues } from './QuestionnaireForm';
import { updateMe } from '../api';
import { useMe } from '../contexts/MeContext';
import { notificationHaptic } from '../utils/haptics';

export function QuestionnaireScreen() {
  const nav = useNavigate();
  const { me, refresh } = useMe();
  const [saving, setSaving] = useState(false);

  const submit = async (values: QFormValues) => {
    if (saving) return;
    setSaving(true);
    try {
      await updateMe({
        user_profile: values,
        questionnaire_done: true,
        // если юзер скипнул онбординг и попал сюда — заодно проставим
        onboarding_done: true,
      });
      await refresh();
      notificationHaptic('success');
      nav('/', { replace: true });
    } catch (e: any) {
      console.warn('[questionnaire] save failed:', e);
      // Всё равно отправим на Home — иначе юзер застрянет
      nav('/', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    // Минимальный профиль (имя из TG) + questionnaire_done=true
    if (saving) return;
    setSaving(true);
    try {
      await updateMe({
        user_profile: { name: me?.first_name || '' },
        questionnaire_done: true,
        onboarding_done: true,
      });
      await refresh();
    } catch (_) {}
    setSaving(false);
    nav('/', { replace: true });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Расскажи о себе</h1>
      </div>
      <QuestionnaireForm
        mode="onboarding"
        initial={me?.user_profile ?? {}}
        onSubmit={submit}
        saving={saving}
        submitLabel="Готово"
        onSkip={skip}
      />
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
  header: { padding: '0 20px 16px' },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
};
