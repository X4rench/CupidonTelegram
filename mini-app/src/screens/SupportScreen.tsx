// ═══════════════════════════════════════════════════════════════
// SupportScreen — «Поддержи её». Сгенерировать поддерживающие сообщения.
// POST /analysis/support → responses[] (текст вариантов поддержки)
// ═══════════════════════════════════════════════════════════════
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { IOSPasteHint } from '../components/IOSPasteHint';
import { LimitReachedSheet, type LimitReason } from '../components/LimitReachedSheet';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import { generateSupport, ApiError } from '../api';

const PAGE_SIZE = 3;
const REGEN_LIMIT = 2; // итого 3 страницы (если AI вернёт 9+)

/**
 * Перетасовываем варианты по level так, чтобы на каждой странице был
 * один лёгкий + один уверенный + один дерзкий (если их есть).
 * Точно как Wing.interleaveResponses по badge.
 */
type SupportItem = { text: string; level?: string };
function interleaveByLevel(items: SupportItem[]): SupportItem[] {
  if (!items.length) return [];
  const ORDER = ['ЛЁГКИЙ', 'УВЕРЕННЫЙ', 'ДЕРЗКИЙ'];
  const buckets: SupportItem[][] = [[], [], []];
  const others: SupportItem[] = [];
  for (const r of items) {
    const idx = ORDER.indexOf(String(r.level || '').toUpperCase());
    if (idx >= 0) buckets[idx].push(r);
    else others.push(r);
  }
  if (buckets[0].length + buckets[1].length + buckets[2].length === 0) return items;
  const out: SupportItem[] = [];
  const maxLen = Math.max(buckets[0].length, buckets[1].length, buckets[2].length);
  for (let i = 0; i < maxLen; i++) {
    for (let c = 0; c < 3; c++) if (buckets[c][i]) out.push(buckets[c][i]);
  }
  return out.concat(others);
}

const SUPPORT_TAGS = [
  'грусть', 'обида', 'злость', 'усталость', 'болезнь',
  'тревога', 'ссора с близкими', 'неуверенность', 'выгорание',
];

// Опциональные калибровки (по одному тапу). Все single-select.
const NEED_OPTIONS      = ['выговориться', 'совет', 'отвлечься', 'просто тепло'];
const ABOUT_OPTIONS     = ['неё саму', 'близкого', 'нас двоих', 'работу/учёбу'];
const SINCE_OPTIONS     = ['только что', 'сегодня', 'тянется давно'];
const CLOSENESS_OPTIONS = ['только познакомились', 'общаемся', 'пара'];

export function SupportScreen() {
  const nav = useNavigate();
  useBackButton(() => nav(-1));

  const [situation, setSituation] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  // Калибровки (single-select, опциональные)
  const [need, setNeed] = useState('');
  const [about, setAbout] = useState('');
  const [since, setSince] = useState('');
  const [closeness, setCloseness] = useState('');
  // Общая модалка «своё» для всех блоков. customField = какой блок редактируем.
  const [customField, setCustomField] = useState<null | 'tags' | 'need' | 'about' | 'since' | 'closeness'>(null);
  const [customInput, setCustomInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ResultItem хранит text + level — точно как в Стреле text+why.
  type ResultItem = SupportItem;
  const [results, setResults] = useState<ResultItem[]>([]);
  // Логика страниц — точно как в Стреле (responsePage + regenCount):
  //   - responsePage: текущая страница (индекс)
  //   - regenCount:   сколько раз нажат «Ещё» (totalPages = regenCount + 1)
  // Изначально totalPages = 1 (показана только первая страница);
  // после первого «Ещё» появляется вторая, после второго — третья.
  const [responsePage, setResponsePage] = useState(0);
  const [regenCount, setRegenCount] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [limitSheet, setLimitSheet] = useState<LimitReason | null>(null);

  const toggleTag = (t: string) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const openCustom = (field: NonNullable<typeof customField>) => {
    selectionHaptic();
    setCustomInput('');
    setCustomField(field);
  };

  const submitCustom = () => {
    const v = customInput.trim().slice(0, 40);
    if (!v) { setCustomField(null); return; }
    if (customField === 'tags') {
      if (!tags.includes(v)) setTags(prev => [...prev, v]);
    } else if (customField === 'need')      setNeed(v);
    else if (customField === 'about')       setAbout(v);
    else if (customField === 'since')       setSince(v);
    else if (customField === 'closeness')   setCloseness(v);
    notificationHaptic('success');
    setCustomInput('');
    setCustomField(null);
  };

  // Заголовок/подсказка модалки под конкретный блок
  const CUSTOM_META: Record<NonNullable<typeof customField>, { title: string; sub: string }> = {
    tags:      { title: 'Что она чувствует', sub: 'Своё одно слово. Например: «паника», «пустота», «обречённость».' },
    need:      { title: 'Что ей сейчас нужнее', sub: 'Например: «чтоб я просто был на связи», «помочь делом».' },
    about:     { title: 'Ситуация про', sub: 'Например: «здоровье», «деньги», «бывшего», «питомца».' },
    since:     { title: 'Как давно это', sub: 'Например: «неделю», «пару часов», «уже месяц».' },
    closeness: { title: 'Кто она тебе', sub: 'Например: «бывшая», «подруга», «коллега», «жена».' },
  };

  const handleSubmit = async () => {
    if (loading) return;
    const trimmed = situation.trim();
    if (trimmed.length < 10) {
      setError('Опиши ситуацию подробнее.');
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
      const res = await generateSupport({
        situationText: trimmed, tags, withContext: false,
        need, about, since, closeness,
      });
      const items: ResultItem[] = Array.isArray((res as any).responses)
        ? (res as any).responses.map((r: any) => {
            if (typeof r === 'string') return { text: r };
            return { text: r?.text || '', level: r?.level };
          }).filter((r: ResultItem) => r.text)
        : [];
      setResults(items);
      notificationHaptic('success');
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 429) {
        setLimitSheet('limit');
        setLoading(false);
        return;
      }
      setError(e?.message || 'Не удалось сгенерировать. Попробуй ещё.');
      notificationHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  // Человекочитаемый level → подсказка под текстом (как why в Стреле)
  const levelHint = (level?: string): string => {
    if (!level) return '';
    const L = level.toUpperCase();
    if (L === 'ЛЁГКИЙ')    return 'лёгкая поддержка — снимает напряжение, без давления';
    if (L === 'УВЕРЕННЫЙ') return 'уверенная поддержка — даёт ощущение опоры';
    if (L === 'ДЕРЗКИЙ')   return 'дерзкая поддержка — выдёргивает из переживаний с улыбкой';
    return level.toLowerCase();
  };

  const copyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      impactHaptic('light');
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1400);
    } catch (_) {}
  };

  // refreshResponses — точная копия Wing: инкрементит И page, И regenCount.
  // После REGEN_LIMIT нажатий кнопка disabled («Лимит»).
  const refreshResponses = () => {
    if (regenCount >= REGEN_LIMIT) return;
    impactHaptic('light');
    setResponsePage(p => p + 1);
    setRegenCount(c => c + 1);
    setCopiedIdx(null);
  };

  // goToResponsePage — точная копия Wing: skip если та же страница,
  // selectionHaptic при переключении.
  const goToResponsePage = (i: number) => {
    if (i === responsePage) return;
    selectionHaptic();
    setResponsePage(i);
    setCopiedIdx(null);
  };

  // Interleave — варианты идут по «лёгкий-уверенный-дерзкий, лёгкий-...»
  // Каждая страница содержит по одному из каждого типа (если хватает).
  const orderedResults = useMemo(() => interleaveByLevel(results), [results]);
  const visibleResults = orderedResults.slice(responsePage * PAGE_SIZE, responsePage * PAGE_SIZE + PAGE_SIZE);

  const hasResults = results.length > 0;
  // totalPages раскрывается ПО МЕРЕ нажатий «Ещё» — как в Стреле.
  // Изначально =1 (одна страница), после каждого refresh +1, max = REGEN_LIMIT+1.
  const totalPages = regenCount + 1;

  // Ряд single-select чипов (тап повторно — снимает выбор) + «своё».
  const choiceRow = (
    label: string,
    options: string[],
    value: string,
    setValue: (v: string) => void,
    fieldKey: NonNullable<typeof customField>,
  ) => (
    <div>
      <div style={styles.subLabel}>{label}</div>
      <div style={styles.tagsRow}>
        {options.map(o => (
          <Chip
            key={o}
            active={value === o}
            onClick={() => { selectionHaptic(); setValue(value === o ? '' : o); }}
          >
            {o}
          </Chip>
        ))}
        {/* Своё значение (если не из списка) — активный чип, тап снимает */}
        {value && !options.includes(value) && (
          <Chip active onClick={() => { selectionHaptic(); setValue(''); }}>
            {value}
          </Chip>
        )}
        <button onClick={() => openCustom(fieldKey)} style={styles.addChip} aria-label="Своё">
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          <span>своё</span>
        </button>
      </div>
    </div>
  );

  return (
    <Layout>
      <div style={styles.container}>
        <h1 style={styles.h1}>Поддержи её 💜</h1>
        <p style={styles.intro}>
          Опиши что у неё происходит. AI напишет 3-5 вариантов поддержки которые звучат искренне, а не как шаблон из мессенджера.
        </p>

        <label style={styles.label}>Что случилось</label>
        <Card style={styles.inputCard}>
          <AutoGrowTextarea
            value={situation}
            onChange={setSituation}
            placeholder="Например: у неё умер кот, она пишет «я не могу», уже два дня не отвечает на звонки"
            maxHeight={220}
            style={{ minHeight: 100, padding: 0 }}
          />
        </Card>
        <IOSPasteHint />

        <label style={styles.label}>Что она сейчас чувствует (опц.)</label>
        <div style={styles.tagsRow}>
          {SUPPORT_TAGS.map(t => (
            <Chip key={t} active={tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
          {/* Свои эмоции (не из списка) */}
          {tags.filter(t => !SUPPORT_TAGS.includes(t)).map(t => (
            <Chip key={`u-${t}`} active onClick={() => toggleTag(t)}>
              {t}
            </Chip>
          ))}
          <button onClick={() => openCustom('tags')} style={styles.addChip} aria-label="Своё">
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span>своё</span>
          </button>
        </div>

        {/* Калибровки — всё по желанию, по одному тапу. Чем точнее, тем
            лучше ответ; можно пропустить всё и нажать «Сгенерировать». */}
        <div style={styles.hintsWrap}>
          <div style={styles.hintsHead}>Чуть точнее — по желанию</div>
          <div style={styles.hintsList}>
            {choiceRow('Что ей сейчас нужнее', NEED_OPTIONS, need, setNeed, 'need')}
            {choiceRow('Ситуация про', ABOUT_OPTIONS, about, setAbout, 'about')}
            {choiceRow('Как давно это', SINCE_OPTIONS, since, setSince, 'since')}
            {choiceRow('Кто она тебе', CLOSENESS_OPTIONS, closeness, setCloseness, 'closeness')}
          </div>
        </div>

        {/* Кнопка «Сгенерировать» прячется после успеха — далее
            используем «Ещё» в блоке результатов (как в Стреле). */}
        {!hasResults && (
          <div style={{ marginTop: 16 }}>
            <GradientButton full loading={loading} onClick={handleSubmit}>
              {loading ? 'AI пишет…' : 'Сгенерировать'}
            </GradientButton>
          </div>
        )}

        {error && (
          <Card style={{ marginTop: 16, borderColor: 'var(--status-negative)' }}>
            <p style={{ margin: 0, color: 'var(--status-negative)', fontSize: 14 }}>{error}</p>
            <div style={{ marginTop: 12 }}>
              <SecondaryButton onClick={handleSubmit}>Попробовать ещё</SecondaryButton>
            </div>
          </Card>
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
              {visibleResults.map((r, i) => (
                <div key={`p${responsePage}-${i}`} style={styles.responseItem}>
                  <button
                    onClick={() => copyText(r.text, i)}
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
                  <p style={styles.responseText}>{r.text}</p>
                  {r.level && (
                    <p style={styles.responseWhy}>{levelHint(r.level)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Общая модалка ввода своего варианта (для эмоций и калибровок) */}
      {customField && (
        <div style={styles.modalOverlay} onClick={() => setCustomField(null)}>
          <div style={styles.modalSheet} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHandle} />
            <div style={styles.modalTitle}>{CUSTOM_META[customField].title}</div>
            <div style={styles.modalSub}>{CUSTOM_META[customField].sub}</div>
            <input
              autoFocus
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCustom(); }}
              placeholder="…"
              maxLength={40}
              style={styles.modalInput}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setCustomField(null); setCustomInput(''); }}
                style={styles.modalCancel}
              >Отмена</button>
              <GradientButton onClick={submitCustom} disabled={!customInput.trim()} full>
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

const styles: Record<string, CSSProperties> = {
  container:    { padding: '24px 20px' },
  h1:           { margin: 0, fontSize: 24, fontWeight: 700 },
  intro:        { marginTop: 8, color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 },
  label:        { display: 'block', marginTop: 20, marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' },
  inputCard:    { padding: '8px 12px' },
  tagsRow:      { display: 'flex', flexWrap: 'wrap', gap: 8 },
  // Блок опциональных калибровок — отделён и помечен как «по желанию»,
  // чтобы не читался как обязательная анкета.
  hintsWrap: {
    marginTop: 20,
    padding: '14px 14px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
  },
  hintsHead: {
    fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 12,
  },
  hintsList: { display: 'flex', flexDirection: 'column', gap: 12 },
  subLabel:  { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 },
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

  // Модалка ввода своего варианта
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 1000,
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
  modalSub:   { fontSize: 13, color: 'var(--text-secondary)', lineHeight: '18px' },
  modalInput: {
    width: '100%', padding: '12px 14px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 10, color: 'var(--text-primary)', fontSize: 15,
  },
  modalCancel: {
    flex: 1, padding: 12, borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'transparent', color: 'var(--text-secondary)',
    fontSize: 14, cursor: 'pointer',
  },
  // Шапка результатов — точно как в WingScreen.styles.responsesHeader
  resultsHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  // Заголовок «Варианты N / 3» — как WingScreen.styles.sectionLabel
  resultsTitle: {
    fontSize: 14, fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'block',
  },
  // Кнопка «↻ Ещё / Лимит» — простая ссылка без рамки/фона, как WingScreen.refreshBtn
  regenBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: 'transparent',
    border: 0, padding: 0,
    cursor: 'pointer',
  },
  // Пагинация — 3 тонкие полоски на всю ширину, как WingScreen.pagination
  pagination: {
    display: 'flex', gap: 4,
    marginBottom: 8,
  },
  paginationDot: {
    flex: 1, height: 3, borderRadius: 2,
    border: 0, padding: 0, cursor: 'pointer',
  },
  // Стрело-аналогичный responseItem — bg-elevated div, не Card.
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
  responseText: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-primary)' },
  responseWhy:  { margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: '15px' },
};
