// ═══════════════════════════════════════════════════════════════
// FirstMessageScreen — генерация первого сообщения.
//
// POST /first-message/generate возвращает 9 вариантов. Показываем по 3
// за раз. «Перегенерировать» × 2 — переключаем страницу. После 3-й
// страницы кнопка disabled (лимит исчерпан).
//
// «Что её интересует» — теги из SUGGESTED_TAGS + кнопка «➕ своё»
// (модалка с инпутом, как имя контакта в Стреле).
// ═══════════════════════════════════════════════════════════════
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import { generateFirstMessage, ApiError } from '../api';

const SUGGESTED_TAGS = [
  'спорт', 'музыка', 'путешествия', 'кино', 'книги',
  'кофе', 'еда', 'животные', 'танцы', 'арт',
  'фотография', 'природа', 'мода',
];

// Где познакомились — даёт промпту контекст: на сайте знакомств есть анкета,
// в реале/соцсети профиля может не быть, заход строится иначе.
const PLATFORMS = ['Сайт знакомств', 'Instagram', 'ВКонтакте', 'Telegram', 'В реале'];

const PAGE_SIZE = 3;
const REGEN_LIMIT = 2; // 3 страницы × 3 варианта = 9 на запрос всего

export function FirstMessageScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [girlName, setGirlName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTagModalOpen, setCustomTagModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [platform, setPlatform] = useState('');                          // где познакомились
  const [platformModalOpen, setPlatformModalOpen] = useState(false);     // модалка «своё место»
  const [newPlatformInput, setNewPlatformInput] = useState('');
  const [photoDesc, setPhotoDesc] = useState('');                        // что видно на фото
  const [hasFace, setHasFace] = useState<'' | 'yes' | 'hidden'>('');     // лицо на фото
  const [multiPhoto, setMultiPhoto] = useState(false);                   // несколько разных фото
  const [bioText, setBioText] = useState('');                            // текст из профиля/анкеты
  const [loading, setLoading] = useState(false);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  // Логика страниц 1-в-1 как Wing: totalPages = regenCount + 1
  // (раскрывается по мере нажатий «Ещё», не сразу 3).
  const [responsePage, setResponsePage] = useState(0);
  const [regenCount, setRegenCount] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const toggleTag = (t: string) => {
    selectionHaptic();
    setError(null);
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const addCustomTag = () => {
    const v = newTagInput.trim().toLowerCase().slice(0, 24);
    if (!v) { setCustomTagModalOpen(false); return; }
    if (!tags.includes(v)) {
      setTags(prev => [...prev, v]);
      notificationHaptic('success');
    }
    setNewTagInput('');
    setCustomTagModalOpen(false);
  };

  const addCustomPlatform = () => {
    const v = newPlatformInput.trim().slice(0, 40);
    if (!v) { setPlatformModalOpen(false); return; }
    setPlatform(v);
    notificationHaptic('success');
    setNewPlatformInput('');
    setPlatformModalOpen(false);
    clearErrorOnChange();
  };

  const handleSubmit = async () => {
    if (loading) return;

    // Валидация: нужно хотя бы что-то ввести. Иначе бэк отвалится на
    // пустом контексте (AI ловит таймаут → 502 от nginx). Показываем
    // дружелюбное сообщение вместо технической ошибки.
    const hasName = girlName.trim().length > 0;
    const hasTags = tags.length > 0;
    const hasPhoto = photoDesc.trim().length > 0;
    const hasBio = bioText.trim().length > 0;
    if (!hasName && !hasTags && !hasPhoto && !hasBio) {
      setError('Расскажи о ней хоть что-то: выбери интересы, опиши что на фото или что написано в профиле. Иначе AI не из чего лепить сообщение.');
      notificationHaptic('error');
      return;
    }

    impactHaptic('medium');
    setLoading(true);
    setError(null);
    setResults([]);
    setResponsePage(0);
    setRegenCount(0);
    setCopiedIdx(null);
    try {
      // Собираем структурированный профиль из всех полей в один размеченный
      // текст — бэк кладёт его в {{profile_text}}, а промпт сам цепляется за
      // метки (фото / лицо / контраст / анкета / где познакомились).
      // Пустые поля не добавляем — чтобы детектор «пустого профиля» в промпте
      // продолжал работать (тогда AI берёт универсальные крючки).
      const profileParts: string[] = [];
      if (platform)          profileParts.push(`Где познакомились: ${platform}`);
      if (photoDesc.trim())  profileParts.push(`Что видно на фото: ${photoDesc.trim()}`);
      if (hasFace === 'yes')    profileParts.push('Её лицо на фото видно');
      if (hasFace === 'hidden') profileParts.push('Лицо на фото скрыто / не видно (можно обыграть)');
      if (multiPhoto)        profileParts.push('Несколько разных фото — есть контраст между кадрами');
      if (bioText.trim())    profileParts.push(`Что написано в профиле / анкете: ${bioText.trim()}`);
      const composedProfile = profileParts.join('\n');

      const res = await generateFirstMessage({
        girlName: girlName.trim() || undefined,
        tags,
        profileText: composedProfile,
      });
      const msgs: string[] = Array.isArray((res as any).messages)
        ? (res as any).messages.map((m: any) => typeof m === 'string' ? m : (m?.text || ''))
        : [];
      if (msgs.filter(Boolean).length === 0) {
        // AI вернул пустоту — обычно это значит входных данных не хватило
        setError('AI не справился с такими исходными. Попробуй добавить тегов или подробнее описать профиль.');
        notificationHaptic('error');
        return;
      }
      setResults(msgs.filter(Boolean));
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        setLimitSheet('limit');
        setLoading(false);
        return;
      }
      // Дружелюбные сообщения для типичных серверных ошибок (не «HTTP 502»)
      let msg = e?.message || 'Не удалось сгенерировать. Попробуй ещё раз.';
      if (e instanceof ApiError) {
        if (e.status >= 500) msg = 'AI сейчас занят или сломался. Попробуй через минуту — или добавь больше деталей о ней.';
        else if (e.status === 400) msg = 'AI не понял запрос. Опиши её подробнее.';
      }
      setError(msg);
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  // Сбрасываем error когда юзер начал что-то менять — чтобы красная плашка
  // не висела после исправления.
  const clearErrorOnChange = () => {
    if (error) setError(null);
  };

  // refreshResponses — 1-в-1 как Wing: инкрементит И page И regenCount.
  const refreshResponses = () => {
    if (regenCount >= REGEN_LIMIT) return;
    impactHaptic('light');
    setResponsePage(p => p + 1);
    setRegenCount(c => c + 1);
    setCopiedIdx(null);
  };

  // goToResponsePage — 1-в-1 как Wing: skip same + selectionHaptic.
  const goToResponsePage = (i: number) => {
    if (i === responsePage) return;
    selectionHaptic();
    setResponsePage(i);
    setCopiedIdx(null);
  };

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1400);
    } catch (_) {}
  };

  const visibleResults = useMemo(
    () => results.slice(responsePage * PAGE_SIZE, responsePage * PAGE_SIZE + PAGE_SIZE),
    [results, responsePage],
  );

  // Качество описания — аналог password strength. Считается из ВСЕХ полей:
  // имя(5) + площадка(5) + теги(до 12) + лицо-указано(5) + неск.фото(3)
  // + что на фото(до 35) + анкета(до 35). Два текстовых поля — основной сигнал.
  // Текст растёт линейно до 180 символов, дальше потолок (нет смысла больше).
  const qualityScore = useMemo(() => {
    const scoreText = (txt: string, max: number) => {
      const len = txt.trim().length;
      if (len <= 0) return 0;
      return max * Math.min(1, len / 180);
    };
    let s = 0;
    if (girlName.trim().length > 0) s += 5;
    if (platform)                   s += 5;
    s += Math.min(12, tags.length * 3);
    if (hasFace !== '')             s += 5;
    if (multiPhoto)                 s += 3;
    s += scoreText(photoDesc, 35);
    s += scoreText(bioText, 35);
    return Math.max(0, Math.min(100, Math.round(s)));
  }, [girlName, platform, tags, hasFace, multiPhoto, photoDesc, bioText]);

  const hasResults = results.length > 0;
  // totalPages раскрывается ПО МЕРЕ нажатий «Ещё» — точно как Wing.
  // Изначально 1, после первого «Ещё» — 2, после второго — 3 (REGEN_LIMIT+1).
  const totalPages = regenCount + 1;

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Первое сообщение</h1>
        <p style={styles.intro}>
          Скажи что знаешь о ней — её увлечения, что было в профиле.
          AI напишет 3 варианта, на которые трудно не ответить.
        </p>

        <label style={styles.label}>Её имя (опц.)</label>
        <input
          value={girlName}
          onChange={e => { setGirlName(e.target.value); clearErrorOnChange(); }}
          placeholder="Например, Аня"
          style={styles.input}
          maxLength={30}
        />

        <label style={styles.label}>Где познакомились</label>
        <div style={styles.tagsRow}>
          {PLATFORMS.map(p => (
            <Chip
              key={p}
              active={platform === p}
              onClick={() => { selectionHaptic(); setPlatform(prev => prev === p ? '' : p); clearErrorOnChange(); }}
            >
              {p}
            </Chip>
          ))}
          {/* Своё место (если выбрано и не из списка) — активный чип, тап снимает */}
          {platform && !PLATFORMS.includes(platform) && (
            <Chip active onClick={() => { selectionHaptic(); setPlatform(''); }}>
              {platform}
            </Chip>
          )}
          <button
            onClick={() => { selectionHaptic(); setPlatformModalOpen(true); }}
            style={styles.addChip}
            aria-label="Своё место"
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span>своё</span>
          </button>
        </div>

        <label style={styles.label}>Что её интересует</label>
        <div style={styles.tagsRow}>
          {SUGGESTED_TAGS.map(t => (
            <Chip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
          {/* Кастомные теги юзера (если есть и не в SUGGESTED) */}
          {tags.filter(t => !SUGGESTED_TAGS.includes(t)).map(t => (
            <Chip key={`u-${t}`} active onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
          {/* Кнопка «➕ своё» — как обычный chip */}
          <button
            onClick={() => { selectionHaptic(); setCustomTagModalOpen(true); }}
            style={styles.addChip}
            aria-label="Добавить своё"
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span>своё</span>
          </button>
        </div>

        <label style={styles.label}>Что видно на фото (опц.)</label>
        <Card style={{ padding: '8px 12px' }}>
          <AutoGrowTextarea
            value={photoDesc}
            onChange={v => { setPhotoDesc(v); clearErrorOnChange(); }}
            placeholder="Места, обстановка, чем занята, стиль. Например: на балконе ночью в чёрно-белом фильтре; у зеркала со вспышкой; на природе с собакой…"
            maxHeight={160}
            style={{ minHeight: 64, padding: 0 }}
          />
        </Card>

        <div style={styles.faceRow}>
          <span style={styles.faceLabel}>Видно её лицо на фото?</span>
          <div style={styles.segWrap}>
            <button
              onClick={() => { selectionHaptic(); setHasFace(prev => prev === 'yes' ? '' : 'yes'); }}
              style={{ ...styles.segBtn, ...(hasFace === 'yes' ? styles.segActive : {}) }}
            >Видно</button>
            <button
              onClick={() => { selectionHaptic(); setHasFace(prev => prev === 'hidden' ? '' : 'hidden'); }}
              style={{ ...styles.segBtn, ...(hasFace === 'hidden' ? styles.segActive : {}) }}
            >Скрыто</button>
          </div>
        </div>

        <button
          onClick={() => { selectionHaptic(); setMultiPhoto(v => !v); }}
          style={styles.checkRow}
        >
          <span style={{ ...styles.checkBox, ...(multiPhoto ? styles.checkBoxOn : {}) }}>
            {multiPhoto && (
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff"
                   strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            )}
          </span>
          <span style={styles.checkText}>Несколько разных фото (есть контраст между кадрами)</span>
        </button>

        <label style={styles.label}>Что написано в профиле / анкете (опц.)</label>
        <Card style={{ padding: '8px 12px' }}>
          <AutoGrowTextarea
            value={bioText}
            onChange={v => { setBioText(v); clearErrorOnChange(); }}
            placeholder="Её текст: био, статус, что о себе пишет. Например: «в поиске вдохновения, кофе и горы», «не пишите если без чувства юмора»"
            maxHeight={160}
            style={{ minHeight: 64, padding: 0 }}
          />
        </Card>

        {/* Индикатор качества — чем подробнее ввод, тем точнее AI попадёт
            в её стиль. Аналогия со «strength» индикатором пароля. */}
        {!hasResults && (
          <ProfileQualityRing
            score={qualityScore}
          />
        )}

        {/* Кнопка «Сгенерировать» прячется после успешной генерации —
            юзер дальше использует «Перегенерировать» в блоке результатов */}
        {!hasResults && (
          <div style={{ marginTop: 16 }}>
            <GradientButton full loading={loading} onClick={handleSubmit}>
              {loading ? 'AI думает…' : 'Сгенерировать'}
            </GradientButton>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>ⓘ</span>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {hasResults && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={styles.resultsHeader}>
              <span style={styles.resultsTitle}>
                Варианты {responsePage + 1} / {totalPages}
              </span>
              <button
                onClick={refreshResponses}
                disabled={regenCount >= REGEN_LIMIT || loading}
                style={{
                  ...styles.regenBtn,
                  opacity: regenCount >= REGEN_LIMIT ? 0.5 : 1,
                  cursor: regenCount >= REGEN_LIMIT ? 'default' : 'pointer',
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                     stroke={regenCount >= REGEN_LIMIT ? 'var(--text-muted)' : 'var(--text-accent)'}
                     strokeWidth={2} strokeLinecap="round">
                  <path d="M23 4v6h-6" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                <span style={{
                  fontSize: 12,
                  color: regenCount >= REGEN_LIMIT ? 'var(--text-muted)' : 'var(--text-accent)',
                }}>
                  {regenCount >= REGEN_LIMIT ? 'Лимит' : 'Ещё'}
                </span>
              </button>
            </div>

            <div style={styles.pagination}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToResponsePage(i)}
                  style={{
                    ...styles.paginationDot,
                    background: i === responsePage ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  }}
                  aria-label={`Страница ${i + 1}`}
                />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleResults.map((text, i) => (
                <div key={`p${responsePage}-${i}`} style={styles.responseItem}>
                  <button
                    onClick={() => copyText(text, i)}
                    style={styles.copyBtn}
                    aria-label="Скопировать"
                  >
                    {copiedIdx === i ? (
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                           stroke="var(--status-positive)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    ) : (
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                           stroke="var(--text-muted)" strokeWidth={2}>
                        <rect x={9} y={9} width={13} height={13} rx={2} />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                  <p style={styles.responseText}>{text}</p>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>

      {/* Модалка ввода кастомного тега */}
      {customTagModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setCustomTagModalOpen(false)}>
          <div style={styles.modalSheet} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHandle} />
            <div style={styles.modalTitle}>Что её интересует</div>
            <div style={styles.modalSub}>
              Напиши одно слово или короткую фразу. Например: «йога», «настолки», «киноклассика».
            </div>
            <input
              autoFocus
              value={newTagInput}
              onChange={e => setNewTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); }}
              placeholder="…"
              maxLength={24}
              style={styles.modalInput}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setCustomTagModalOpen(false); setNewTagInput(''); }}
                style={styles.modalCancel}
              >Отмена</button>
              <GradientButton onClick={addCustomTag} disabled={!newTagInput.trim()} full>
                Добавить
              </GradientButton>
            </div>
          </div>
        </div>
      )}

      {/* Модалка ввода своего места знакомства */}
      {platformModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setPlatformModalOpen(false)}>
          <div style={styles.modalSheet} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHandle} />
            <div style={styles.modalTitle}>Где познакомились</div>
            <div style={styles.modalSub}>
              Напиши своё место. Например: «Тиндер», «на работе», «в спортзале», «через друзей», «в баре».
            </div>
            <input
              autoFocus
              value={newPlatformInput}
              onChange={e => setNewPlatformInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomPlatform(); }}
              placeholder="…"
              maxLength={40}
              style={styles.modalInput}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setPlatformModalOpen(false); setNewPlatformInput(''); }}
                style={styles.modalCancel}
              >Отмена</button>
              <GradientButton onClick={addCustomPlatform} disabled={!newPlatformInput.trim()} full>
                Добавить
              </GradientButton>
            </div>
          </div>
        </div>
      )}

      <LimitReachedSheet
        open={limitSheet != null}
        reason={limitSheet || 'limit'}
        onClose={() => setLimitSheet(null)}
      />
    </Layout>
  );
}

// ── ProfileQualityRing ──────────────────────────────────────────────────────
// Круговой индикатор «качества» описания (аналог password strength).
// Плавно перетекает между 4 уровнями: Слабое → Базовое → Хорошее → Отличное.
function ProfileQualityRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  // Уровни и цвета. Слабое = серый, потом янтарный, фиолет, зелёный.
  const tier =
    pct < 25 ? { label: 'Слабое',  color: '#71717A', hint: 'AI почти ничего не знает — ответ выйдет общим.' } :
    pct < 55 ? { label: 'Базовое', color: '#F59E0B', hint: 'Уже что-то — но добавь деталей для попадания.' } :
    pct < 80 ? { label: 'Хорошее', color: '#A855F7', hint: 'Отлично. Можешь дописать ещё пару нюансов.' } :
               { label: 'Отличное',color: '#22C55E', hint: 'AI попадёт точно в её стиль и интересы.' };

  return (
    <div style={qualityStyles.wrap}>
      <svg width={62} height={62} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
        {/* Трек */}
        <circle cx="32" cy="32" r={radius}
          stroke="var(--border-default)" strokeWidth="5.5" fill="none" />
        {/* Прогресс */}
        <circle cx="32" cy="32" r={radius}
          stroke={tier.color} strokeWidth="5.5" fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dashoffset 400ms ease, stroke 200ms' }}
        />
        <text x="32" y="37" textAnchor="middle"
          fill="var(--text-primary)" fontSize="14" fontWeight="700"
          fontFamily="var(--font-display)">
          {pct}%
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={qualityStyles.headRow}>
          <span style={qualityStyles.title}>Описание профиля:</span>
          <span style={{ ...qualityStyles.tierLabel, color: tier.color }}>{tier.label}</span>
        </div>
        <p style={qualityStyles.hint}>{tier.hint}</p>
      </div>
    </div>
  );
}

const qualityStyles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: '10px 12px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
  },
  headRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: 700,
  },
  hint: {
    margin: '4px 0 0',
    fontSize: 11,
    lineHeight: '15px',
    color: 'var(--text-muted)',
  },
};

const styles: Record<string, CSSProperties> = {
  container:    { padding: '24px 20px' },
  h1:           { margin: 0, fontSize: 24, fontWeight: 700 },
  intro:        { marginTop: 8, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 },
  label:        { display: 'block', marginTop: 20, marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' },
  input:        { width: '100%', padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' },
  tagsRow:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  addChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 12px',
    border: '1px dashed var(--border-accent)',
    background: 'transparent',
    color: 'var(--text-accent)',
    borderRadius: 16,
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
  },

  // Переключатель «Видно / Скрыто» (лицо на фото)
  faceRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginTop: 12,
  },
  faceLabel: { fontSize: 13, color: 'var(--text-secondary)' },
  segWrap: {
    display: 'inline-flex', gap: 4, padding: 4,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
  },
  segBtn: {
    padding: '6px 14px', borderRadius: 9,
    border: 0, background: 'transparent',
    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'background 160ms, color 160ms',
  },
  segActive: { background: 'var(--accent-primary)', color: '#fff' },

  // Чекбокс «несколько фото»
  checkRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginTop: 12, padding: 0,
    background: 'transparent', border: 0, cursor: 'pointer',
    textAlign: 'left', width: '100%',
  },
  checkBox: {
    flexShrink: 0,
    width: 20, height: 20, borderRadius: 6,
    border: '1.5px solid var(--border-default)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 160ms, border-color 160ms',
  },
  checkBoxOn: { background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' },
  checkText: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 },

  // Мягкая подсказка-ошибка (тёплый янтарь, не паника-красный)
  errorBox: {
    marginTop: 14,
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '12px 14px',
    background: 'rgba(245, 158, 11, 0.10)',
    border: '1px solid rgba(245, 158, 11, 0.30)',
    borderRadius: 12,
  },
  errorIcon: {
    flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20,
    borderRadius: '50%',
    background: 'rgba(245, 158, 11, 0.20)',
    color: 'var(--status-warning, #F59E0B)',
    fontSize: 12, fontWeight: 700,
  },
  errorText: {
    margin: 0, flex: 1,
    fontSize: 13, lineHeight: '18px',
    color: 'var(--text-secondary)',
  },

  // Шапка/кнопка/пагинация — точно как WingScreen.styles.{responsesHeader,
  // sectionLabel, refreshBtn, pagination, paginationDot}
  resultsHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  resultsTitle: {
    fontSize: 14, fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'block',
  },
  regenBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: 'transparent',
    border: 0, padding: 0,
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex', gap: 4,
    marginBottom: 8,
  },
  paginationDot: {
    flex: 1, height: 3, borderRadius: 2,
    border: 0, padding: 0, cursor: 'pointer',
  },

  // Карточки вариантов — точно как WingScreen.styles.{responseItem, copyBtn, responseText}
  responseItem: {
    position: 'relative',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    padding: 12,
    paddingRight: 36,
  },
  copyBtn: {
    position: 'absolute',
    top: 10, right: 10,
    padding: 4,
    background: 'transparent',
    cursor: 'pointer',
    border: 0,
  },
  responseText: {
    margin: 0,
    fontSize: 14, lineHeight: '22px',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
  },

  // Модалка
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100,
  },
  modalSheet: {
    width: '100%', maxWidth: 520,
    background: 'var(--bg-card)',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: '14px 18px',
    paddingBottom: 'calc(18px + var(--safe-bottom))',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalHandle: {
    width: 38, height: 4,
    background: 'var(--border-default)',
    borderRadius: 2, margin: '0 auto 4px',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  modalSub: {
    fontSize: 13, color: 'var(--text-secondary)', lineHeight: '18px',
  },
  modalInput: {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: 15,
  },
  modalCancel: {
    flex: 1,
    padding: 12, borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
  },
};
