// ═══════════════════════════════════════════════════════════════
// AdminChartScreen — Диаграмма по выбранной метрике.
//
// Маршруты:
//   /admin/chart/:metric                — общая метрика по приложению
//   /admin/partners/:id/chart/:metric   — метрика конкретного партнёра
//
// Грузит daily (30 дней) + monthly (12 месяцев) с backend, рисует BarChart.
// Переключатель «30 дней / 12 месяцев». Показывает дату последнего обновления.
//
// Backend кэширует ответ на 24ч (in-memory), поэтому диаграмма обновляется
// раз в сутки. Это даёт стабильную картинку без скачков от ежеминутных
// событий и снижает нагрузку на БД.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { BarChart } from '../components/BarChart';
import { useMe } from '../contexts/MeContext';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic } from '../utils/haptics';
import {
  adminApi, partnerAdminApi,
  type AdminMetricKey, type PartnerMetricKey, type AdminTimelineResp,
} from '../api';

// Подписи и единицы для каждой метрики (общие).
const ADMIN_METRIC_META: Record<AdminMetricKey, { title: string; unit: string; emoji: string }> = {
  users:                { title: 'Пользователи',          unit: 'регистр.',  emoji: '👥' },
  analyses:             { title: 'Анализы',               unit: 'анализов',  emoji: '🔍' },
  simulations:          { title: 'Симуляции',             unit: 'симуляций', emoji: '🎭' },
  rejections:           { title: 'Разборы отказов',       unit: 'разборов',  emoji: '💔' },
  requests:             { title: 'Запросы (всего)',       unit: 'запросов',  emoji: '⚡' },
  paid_subs:            { title: 'Активные подписки',     unit: 'активн.',   emoji: '💎' },
  paid_subs_basic:      { title: 'Активные Basic',        unit: 'активн.',   emoji: '🔵' },
  paid_subs_premium:    { title: 'Активные Premium',      unit: 'активн.',   emoji: '⭐' },
  paid_subs_day_pass:   { title: 'Активные Day Pass',     unit: 'активн.',   emoji: '⚡' },
  free_active:          { title: 'Free-юзеры активные',   unit: 'юзеров',    emoji: '🆓' },
  partners:             { title: 'Партнёры',              unit: 'партнёров', emoji: '💼' },
};

const PARTNER_METRIC_META: Record<PartnerMetricKey, { title: string; unit: string; emoji: string; isMoney: boolean }> = {
  new_referrals:  { title: 'Новые рефералы',   unit: 'юзеров', emoji: '🆕', isMoney: false },
  paid_users:     { title: 'Платящие',         unit: 'юзеров', emoji: '💳', isMoney: false },
  gross_revenue:  { title: 'Валовая выручка',  unit: '₽',      emoji: '💰', isMoney: true },
  commission:     { title: 'Заработано',       unit: '₽',      emoji: '💸', isMoney: true },
};

type View = 'daily' | 'monthly';

export function AdminChartScreen() {
  const nav = useNavigate();
  const { me } = useMe();
  const params = useParams<{ metric?: string; id?: string }>();
  const partnerId = params.id ? parseInt(params.id, 10) : null;
  const metric = (params.metric || '') as AdminMetricKey | PartnerMetricKey;

  const isPartner = partnerId != null;
  const meta = isPartner
    ? PARTNER_METRIC_META[metric as PartnerMetricKey]
    : ADMIN_METRIC_META[metric as AdminMetricKey];

  const isMoney = isPartner && (PARTNER_METRIC_META[metric as PartnerMetricKey]?.isMoney);

  const [view, setView] = useState<View>('daily');
  const [data, setData] = useState<AdminTimelineResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const promise = isPartner
      ? partnerAdminApi.getTimeline(partnerId!, metric as PartnerMetricKey)
      : adminApi.getStatsTimeline(metric as AdminMetricKey);

    promise
      .then(res => { if (!cancelled) setData(res); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Не удалось загрузить'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isPartner, partnerId, metric]);

  // Формируем данные и подписи для графика
  const chart = useMemo(() => {
    if (!data) return { values: [], labels: [], total: 0, peak: 0 };
    if (view === 'daily') {
      const values = data.daily.map(d => d.value);
      const labels = data.daily.map((d, i) => {
        if (i % 5 !== 0 && i !== data.daily.length - 1) return '';
        const [, mm, dd] = (d.date || '').split('-');
        return `${dd}.${mm}`;
      });
      return {
        values, labels,
        total: values.reduce((a, b) => a + b, 0),
        peak: Math.max(0, ...values),
      };
    }
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
                        'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const values = data.monthly.map(d => d.value);
    const labels = data.monthly.map(d => {
      const [, mm] = (d.month || '').split('-');
      return monthNames[parseInt(mm, 10) - 1] || '';
    });
    return {
      values, labels,
      total: values.reduce((a, b) => a + b, 0),
      peak: Math.max(0, ...values),
    };
  }, [data, view]);

  if (!me?.is_admin) {
    return (
      <Layout>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: 'var(--text-primary)' }}>Нет доступа</h2>
          <button onClick={() => nav('/profile')} style={styles.linkBtn}>На главную</button>
        </div>
      </Layout>
    );
  }

  if (!meta) {
    return (
      <Layout>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Неизвестная метрика: {metric}
        </div>
      </Layout>
    );
  }

  const fmt = (v: number) => isMoney ? `${(v / 100).toFixed(2)} ₽` : String(v);

  return (
    <Layout>
      <div style={{ padding: '16px 20px' }}>
        {/* Header */}
        <button onClick={onBack} style={styles.backBtn}>← Назад</button>

        <div style={styles.titleRow}>
          <span style={{ fontSize: 30 }}>{meta.emoji}</span>
          <div>
            <h1 style={styles.title}>{meta.title}</h1>
            {isPartner && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Партнёр #{partnerId}
              </div>
            )}
          </div>
        </div>

        {/* View switcher */}
        <div style={styles.switcher}>
          {(['daily', 'monthly'] as View[]).map(v => {
            const active = view === v;
            return (
              <button
                key={v}
                onClick={() => { selectionHaptic(); setView(v); }}
                style={{
                  ...styles.chip,
                  background: active ? 'var(--accent-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {v === 'daily' ? '30 дней' : '12 месяцев'}
              </button>
            );
          })}
        </div>

        {loading && (
          <Card style={styles.chartCard}>
            <div style={styles.loadingNote}>Загружаем данные…</div>
          </Card>
        )}

        {error && !loading && (
          <Card style={styles.chartCard}>
            <div style={{ ...styles.loadingNote, color: 'var(--status-negative)' }}>
              {error}
            </div>
          </Card>
        )}

        {!loading && !error && data && (
          <>
            {/* Totals */}
            <div style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <span style={styles.statLabel}>Всего за период</span>
                <span style={styles.statValue}>{fmt(chart.total)}</span>
              </Card>
              <Card style={styles.statCard}>
                <span style={styles.statLabel}>Пик</span>
                <span style={styles.statValue}>{fmt(chart.peak)}</span>
              </Card>
            </div>

            {/* The chart */}
            <Card style={styles.chartCard}>
              <BarChart
                data={chart.values}
                labels={chart.labels}
                height={160}
                color="var(--accent-primary)"
                formatValue={v => fmt(v) + ' ' + meta.unit}
              />
            </Card>

            {/* Per-period breakdown — список последних точек */}
            <h2 style={styles.sectionTitle}>Детализация</h2>
            <Card style={styles.breakdownCard}>
              {(view === 'daily' ? data.daily : data.monthly).slice().reverse().slice(0, 14).map((d: any) => {
                const label = view === 'daily'
                  ? formatRusDate(d.date)
                  : formatRusMonth(d.month);
                return (
                  <div key={d.date || d.month} style={styles.breakdownRow}>
                    <span style={styles.breakdownLabel}>{label}</span>
                    <span style={styles.breakdownValue}>
                      {d.value > 0 ? fmt(d.value) : '—'}
                    </span>
                  </div>
                );
              })}
            </Card>

            <div style={styles.updateHint}>
              Обновлено: {formatRusDateTime(data.last_updated_at)}.
              {data.cached ? ' Данные из кэша (обновление раз в 24ч).' : ' Свежие данные.'}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function formatRusDate(iso?: string) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
                  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${parseInt(dd, 10)} ${months[parseInt(mm, 10) - 1] || ''} ${yyyy}`;
}
function formatRusMonth(iso?: string) {
  if (!iso) return '';
  const [yyyy, mm] = iso.split('-');
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return `${months[parseInt(mm, 10) - 1] || ''} ${yyyy}`;
}
function formatRusDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()} ${hh}:${mi}`;
}

const styles: Record<string, CSSProperties> = {
  backBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-accent)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', padding: 4, marginBottom: 12,
  },
  titleRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 20,
  },
  title: {
    margin: 0, fontSize: 22, fontWeight: 700,
    color: 'var(--text-primary)',
  },
  switcher: {
    display: 'flex', gap: 6, padding: 4,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12, marginBottom: 16,
  },
  chip: {
    flex: 1, padding: '10px 12px',
    fontSize: 13, fontWeight: 700,
    border: 'none', borderRadius: 9, cursor: 'pointer',
    transition: 'background 160ms, color 160ms',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
    marginBottom: 12,
  },
  statCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  statLabel: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 22, fontWeight: 700, color: 'var(--text-accent)' },
  chartCard: { padding: 16, marginBottom: 16 },
  loadingNote: {
    padding: 30, textAlign: 'center',
    color: 'var(--text-muted)', fontSize: 14,
  },
  sectionTitle: {
    margin: '20px 0 10px',
    fontSize: 13, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--text-muted)',
  },
  breakdownCard: { padding: '4px 14px' },
  breakdownRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  breakdownLabel: { fontSize: 13, color: 'var(--text-secondary)' },
  breakdownValue: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  updateHint: {
    marginTop: 16, padding: '8px 12px',
    fontSize: 11, color: 'var(--text-muted)',
    textAlign: 'center',
  },
  linkBtn: {
    marginTop: 16,
    background: 'var(--accent-primary)', color: '#fff',
    border: 'none', borderRadius: 12, padding: '10px 20px',
    cursor: 'pointer', fontWeight: 600,
  },
};

export default AdminChartScreen;
