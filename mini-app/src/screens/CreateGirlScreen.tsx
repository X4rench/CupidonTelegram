// ═══════════════════════════════════════════════════════════════
// CreateGirlScreen — форма создания кастомной AI-девушки.
// Сохраняем в storage (`custom_girls`), photo — в IndexedDB.
// На «Начать чат» → /create-girl/chat (передаём id через query).
// Это НЕ контакт — AI-симуляция (см. правило из RN-кода).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { TYPAZHES, MAX_TYPAZHES } from '../utils/typazhes';
import { addCustomGirl, type CustomGirl } from '../utils/customGirls';
import { idbPutPhoto, idbGetPhotoUrl, resizeImage } from '../utils/indexedDB';
import { impactHaptic, notificationHaptic } from '../utils/haptics';
import { useBackButton } from '../utils/backButton';

const HOBBIES = [
  'Музыка', 'Танцы', 'Спорт', 'Фитнес', 'Кино', 'Сериалы', 'Аниме',
  'Игры', 'Путешествия', 'Книги', 'Готовка', 'Питомцы', 'Искусство',
  'Фото', 'Эзотерика', 'Технологии',
];
const CHARACTERS = [
  'Мягкая', 'Тёплая', 'Романтичная', 'Игривая', 'Саркастичная',
  'Прямая', 'Дерзкая', 'Сдержанная', 'Загадочная', 'Эмоциональная',
];
const COMM_STYLES = [
  'Коротко', 'Развёрнуто', 'С эмодзи', 'Без эмодзи',
];

export function CreateGirlScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [typazhes, setTypazhes] = useState<string[]>([]);
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [character, setCharacter] = useState<string | null>(null);
  const [commStyle, setCommStyle] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoBlobId, setPhotoBlobId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-resolve blob:URL когда меняется photoBlobId (§5.1)
  useEffect(() => {
    if (!photoBlobId) { setPhotoUrl(''); return; }
    let revoke = '';
    idbGetPhotoUrl(photoBlobId).then(url => {
      if (url) { setPhotoUrl(url); revoke = url; }
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [photoBlobId]);

  const toggle = (arr: string[], setArr: (a: string[]) => void, val: string, max?: number) => {
    if (arr.includes(val)) { setArr(arr.filter(x => x !== val)); return; }
    if (max && arr.length >= max) return;
    setArr([...arr, val]);
  };

  const pickPhoto = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const blob = await resizeImage(f, 512, 0.78);
      const blobId = await idbPutPhoto(blob);
      setPhotoBlobId(blobId);
      impactHaptic('light');
    } catch (_) {
      // молчком — IndexedDB или canvas не сработали
    } finally {
      e.target.value = ''; // сбросить чтобы можно было выбрать тот же файл повторно
    }
  };

  const startChat = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const girl: CustomGirl = {
        id: `girl_${Date.now()}`,
        name: name.trim() || 'AI-девушка',
        typazh: typazhes.length > 0 ? typazhes.join(',') : null,
        typazhes,
        hobbies,
        character,
        commStyle,
        description,
        color: 'rgba(236,72,153',
        photoBlobId,
      };
      // addCustomGirl теперь бросит Error если не смогло записать
      // (localStorage переполнен / приватный режим браузера / etc).
      addCustomGirl(girl);
      notificationHaptic('success');
      nav(`/create-girl/chat/${encodeURIComponent(girl.id)}`);
    } catch (e: any) {
      console.error('[CreateGirl] save failed:', e);
      setError(e?.message || 'Не удалось сохранить. Попробуй снова или очисть кэш Mini App.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={() => nav(-1)} style={styles.headerBtn} aria-label="Назад">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth={2}>
              <path d="M19 12H5M5 12L12 19M5 12L12 5" />
            </svg>
          </button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Своя девушка</h1>
          <span style={{ width: 40 }} />
        </div>

        {/* Фото */}
        <Section title="Фото (опционально)">
          <button onClick={pickPhoto} style={styles.photoBtn}>
            {photoUrl ? (
              <img src={photoUrl} alt="" style={styles.photoImg} />
            ) : (
              <div style={styles.photoPlaceholder}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth={1.6}>
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx={12} cy={13} r={4} />
                </svg>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
        </Section>

        {/* Типаж */}
        <Section title={`Типаж (до ${MAX_TYPAZHES})`}>
          <div style={styles.chips}>
            {TYPAZHES.map(t => {
              const sel = typazhes.includes(t);
              const dis = !sel && typazhes.length >= MAX_TYPAZHES;
              return (
                <span key={t} style={{ opacity: dis ? 0.4 : 1 }}>
                  <Chip
                    active={sel}
                    onClick={() => { if (dis) return; toggle(typazhes, setTypazhes, t, MAX_TYPAZHES); }}
                  >{t}</Chip>
                </span>
              );
            })}
          </div>
        </Section>

        {/* Увлечения */}
        <Section title="Увлечения">
          <div style={styles.chips}>
            {HOBBIES.map(h => (
              <Chip key={h} active={hobbies.includes(h)} onClick={() => toggle(hobbies, setHobbies, h)}>{h}</Chip>
            ))}
          </div>
        </Section>

        {/* Характер */}
        <Section title="Характер">
          <div style={styles.chips}>
            {CHARACTERS.map(c => (
              <Chip key={c} active={character === c} onClick={() => setCharacter(character === c ? null : c)}>{c}</Chip>
            ))}
          </div>
        </Section>

        {/* Стиль общения */}
        <Section title="Стиль общения">
          <div style={styles.chips}>
            {COMM_STYLES.map(s => (
              <Chip key={s} active={commStyle === s} onClick={() => setCommStyle(commStyle === s ? null : s)}>{s}</Chip>
            ))}
          </div>
        </Section>

        {/* Имя */}
        <Section title="Имя">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Как её зовут?"
            style={styles.input}
          />
        </Section>

        {/* Описание */}
        <Section title="Где встретились / контекст">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Например: познакомились на концерте, она работает дизайнером..."
            style={styles.textarea}
            rows={4}
          />
        </Section>

        {error && (
          <div style={{
            marginTop: 8,
            padding: '12px 14px',
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.30)',
            borderRadius: 12,
            fontSize: 13, lineHeight: '18px',
            color: 'var(--text-secondary)',
          }}>
            <b style={{ color: 'var(--status-warning, #F59E0B)' }}>ⓘ </b>
            {error}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <GradientButton onClick={startChat} disabled={saving} loading={saving} full>
            Начать чат
          </GradientButton>
        </div>
      </div>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    background: 'var(--bg-elevated)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  sectionTitle: { margin: '0 0 10px 0', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },

  input: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 15,
    color: 'var(--text-primary)',
    outline: 0,
  },
  textarea: {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: '12px 16px',
    fontSize: 14,
    color: 'var(--text-primary)',
    outline: 0,
    resize: 'vertical',
    minHeight: 90,
    fontFamily: 'inherit',
  },

  photoBtn: {
    width: 84, height: 84, borderRadius: 42,
    overflow: 'hidden',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    padding: 0,
  },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover' },
  photoPlaceholder: {
    width: '100%', height: '100%',
    border: '1px dashed var(--border-accent)',
    borderRadius: 42,
    background: 'var(--bg-elevated)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
