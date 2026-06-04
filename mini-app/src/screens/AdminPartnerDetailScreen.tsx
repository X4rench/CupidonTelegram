// ═══════════════════════════════════════════════════════════════
// AdminPartnerDetailScreen — детальная карточка партнёра в админке.
// Маршрут: /admin/partners/:id
//
// Доступ — backend проверяет is_admin. На фронте читаем me.is_admin
// и показываем «Нет доступа» (хотя в реальной жизни сюда не попадёшь).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { BarChart } from '../components/BarChart';
import { DonutChart, type DonutSegment } from '../components/DonutChart';
import { useMe } from '../contexts/MeContext';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import { partnerAdminApi, type AdminPartnerDetail } from '../api';

export function AdminPartnerDetailScreen() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();

  const onBack = useCallback(() => nav('/admin'), [nav]);
  useBackButton(onBack);

  const [data, setData] = useState<AdminPartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const partnerId = useMemo(() => parseInt(id || '0', 10), [id]);

  const load = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await partnerAdminApi.get(partnerId);
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить партнёра');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
  }, []);

  const onUpdateStatus = useCallback(async (newStatus: 'active' | 'paused' | 'archived') => {
    if (!data || busy) return;
    if (newStatus === 'archived') {
      if (!window.confirm('Архивировать партнёра? Реф-ссылка перестанет атрибутировать новых юзеров.')) return;
    }
    impactHaptic('medium');
    setBusy(true);
    try {
      const res = await partnerAdminApi.update(data.partner.id, { status: newStatus });
      if (res.ok) {
        notificationHaptic('success');
        showToast('success', 'Статус обновлён');
        await load();
      } else {
        notificationHaptic('error');
        showToast('error', res.error || 'Не удалось обновить');
      }
    } catch (e: any) {
      notificationHaptic('error');
      showToast('error', e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }, [data, busy, load, showToast]);

  const onPay = useCallback(async () => {
    if (!data || busy) return;
    const amount = data.balance.available;
    if (amount <= 0) {
      showToast('error', 'Нет доступных к выплате средств');
      return;
    }
    const noteRaw = window.prompt(
      `Подтвердить выплату ${(amount/100).toLocaleString('ru-RU')} ₽ партнёру «${data.partner.display_name}»?\n\nОставь заметку (опционально):`,
      '',
    );
    if (noteRaw === null) return; // cancel
    impactHaptic('medium');
    setBusy(true);
    try {
      const res = await partnerAdminApi.pay(data.partner.id, amount, noteRaw || undefined);
      if (res.ok) {
        notificationHaptic('success');
        showToast('success', `Выплачено ${(res.amount/100).toLocaleString('ru-RU')} ₽`);
        await load();
      } else {
        notificationHaptic('error');
        showToast('error', res.error || 'Не удалось выплатить');
      }
    } catch (e: any) {
      notificationHaptic('error');
      showToast('error', e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }, [data, busy, load, showToast]);

  if (!me?.is_admin) {
    return (
      <div style={styles.container}>
        <Header onBack={onBack} title="Партнёр" />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Нет доступа
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <Header onBack={onBack} title="Партнёр" />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.container}>
        <Header onBack={onBack} title="Партнёр" />
        <div style={{ padding: '20px 16px' }}>
          <Card>
            <div style={{ fontSize: 14, color: 'var(--status-negative)', marginBottom: 12 }}>
              {error || 'Партнёр не найден'}
            </div>
            <SecondaryButton onClick={load} full>Повторить</SecondaryButton>
          </Card>
        </div>
      </div>
    );
  }

  const { partner, balance, stats_30d, chart_data, recent_referrals, payouts, min_payout_kopecks } = data;

  const chartNew = chart_data.map(d => d.referrals);
  const chartEarn = chart_data.map(d => d.earned / 100);
  const chartLabels = chart_data.map((d, i) => {
    if (i % 5 !== 0 && i !== chart_data.length - 1) return '';
    const parts = (d.date || '').split('-');
    return parts.length === 3 ? parts[2] : '';
  });

  const tierSegments: DonutSegment[] = [
    { label: 'Basic',    value: stats_30d.by_tier.basic,    color: '#F43F5E' },
    { label: 'Premium',  value: stats_30d.by_tier.premium,  color: '#A855F7' },
    { label: 'Day Pass', value: stats_30d.by_tier.day_pass, color: '#22C55E' },
  ];

  const paidLifetime = balance.lifetime_earned - balance.available - balance.pending;

  return (
    <div style={styles.container}>
      <Header onBack={onBack} title={`Партнёр: ${partner.display_name}`} />

      <div style={styles.section}>
        <Card>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>
            Код: <strong style={{ color: 'var(--text-accent)' }}>{partner.code}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={partner.status} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Комиссия <strong style={{ color: 'var(--text-primary)' }}>{partner.commission_pct}%</strong>
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              TG <strong style={{ color: 'var(--text-primary)' }}>{partner.telegram_user_id}</strong>
            </span>
          </div>
          {partner.notes && (
            <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              {partner.notes}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            Создан: {formatDate(partner.created_at)}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {partner.status === 'active' && (
              <button style={btnSmall('var(--status-warning)')} onClick={() => { selectionHaptic(); onUpdateStatus('paused'); }} disabled={busy}>
                Pause
              </button>
            )}
            {partner.status === 'paused' && (
              <button style={btnSmall('var(--status-positive)')} onClick={() => { selectionHaptic(); onUpdateStatus('active'); }} disabled={busy}>
                Resume
              </button>
            )}
            {partner.status !== 'archived' && (
              <button style={btnSmall('var(--status-negative)')} onClick={() => { selectionHaptic(); onUpdateStatus('archived'); }} disabled={busy}>
                Archive
              </button>
            )}
            {partner.status === 'archived' && (
              <button style={btnSmall('var(--status-positive)')} onClick={() => { selectionHaptic(); onUpdateStatus('active'); }} disabled={busy}>
                Восстановить
              </button>
            )}
          </div>
        </Card>
      </div>

      <div style={styles.section}>
        <SectionTitle icon="📊">Метрики (тапни для диаграммы)</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <MetricCard
            emoji="🆕" label="Рефералы" value={String(stats_30d.new_referrals)}
            onClick={() => { selectionHaptic(); nav(`/admin/partners/${partner.id}/chart/new_referrals`); }}
          />
          <MetricCard
            emoji="💳" label="Платящие" value={`${stats_30d.paid_users} (${stats_30d.conversion_pct}%)`}
            onClick={() => { selectionHaptic(); nav(`/admin/partners/${partner.id}/chart/paid_users`); }}
          />
          <MetricCard
            emoji="💰" label="Валовая" value={`${stats_30d.by_tier_revenue.basic + stats_30d.by_tier_revenue.premium + stats_30d.by_tier_revenue.day_pass} ₽`}
            onClick={() => { selectionHaptic(); nav(`/admin/partners/${partner.id}/chart/gross_revenue`); }}
          />
          <MetricCard
            emoji="💸" label="Заработано" value={`${formatRub(balance.lifetime_earned)} ₽`}
            onClick={() => { selectionHaptic(); nav(`/admin/partners/${partner.id}/chart/commission`); }}
          />
        </div>
      </div>

      <div style={styles.section}>
        <SectionTitle icon="📈">Новые рефералы (30 дней)</SectionTitle>
        <Card>
          <BarChart
            data={chartNew}
            labels={chartLabels}
            height={70}
            color="var(--accent-primary)"
            formatValue={(v) => `${v} реф`}
          />
        </Card>

        <div style={{ height: 12 }} />

        <SectionTitle icon="📈">Доход партнёра (30 дней)</SectionTitle>
        <Card>
          <BarChart
            data={chartEarn}
            labels={chartLabels}
            height={70}
            color="#A855F7"
            formatValue={(v) => `${v.toFixed(0)} ₽`}
          />
        </Card>
      </div>

      <div style={styles.section}>
        <SectionTitle icon="🥧">По тарифам</SectionTitle>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <DonutChart segments={tierSegments} size={140} hideLegend />
          </div>
          <Row label="Привёл людей" value={String(stats_30d.new_referrals)} />
          <Row label="Купили" value={`${stats_30d.paid_users} (${stats_30d.conversion_pct}%)`} />
          <div style={styles.divider} />
          <TierRow color="#F43F5E" label="Basic"    count={stats_30d.by_tier.basic}    revenue={stats_30d.by_tier_revenue.basic} unit="чел" />
          <TierRow color="#A855F7" label="Premium"  count={stats_30d.by_tier.premium}  revenue={stats_30d.by_tier_revenue.premium} unit="чел" />
          <TierRow color="#22C55E" label="Day Pass" count={stats_30d.by_tier.day_pass} revenue={stats_30d.by_tier_revenue.day_pass} unit="шт" />
        </Card>
      </div>

      <div style={styles.section}>
        <SectionTitle icon="💰">Финансы</SectionTitle>
        <Card>
          <Row label="Заработано всего" value={`${formatRub(balance.lifetime_earned)} ₽`} />
          <Row label="На удержании"     value={`${formatRub(balance.pending)} ₽`} />
          <Row label="К выплате"        value={`${formatRub(balance.available)} ₽`} accent />
          <Row label="Уже выплачено"    value={`${formatRub(Math.max(0, paidLifetime))} ₽`} />
          <div style={{ marginTop: 12 }}>
            <GradientButton
              onClick={onPay}
              disabled={busy || balance.available <= 0}
              loading={busy}
              full
            >
              {balance.available > 0
                ? `Выплатить ${formatRub(balance.available)} ₽`
                : 'Нечего выплачивать'}
            </GradientButton>
            <div style={styles.hint}>
              Минимум по правилу для самостоятельного запроса от партнёра: {(min_payout_kopecks/100).toFixed(0)} ₽.
              Админ может выплатить любую сумму ≤ available.
            </div>
          </div>
        </Card>
      </div>

      <div style={styles.section}>
        <SectionTitle icon="📋">Последние привлечённые</SectionTitle>
        <Card>
          {recent_referrals.length === 0 ? (
            <div style={styles.empty}>Пока никого не привёл.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recent_referrals.map((r, i) => (
                <div key={i} style={styles.referralRow}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatDateShort(r.attributed_at)}
                  </span>
                  <span style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {r.telegram_user_id_masked || '****'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.last_plan ? 'var(--text-accent)' : 'var(--text-muted)' }}>
                    {r.last_plan ? r.last_plan : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={styles.section}>
        <SectionTitle icon="📜">История выплат</SectionTitle>
        <Card>
          {payouts.length === 0 ? (
            <div style={styles.empty}>Выплат пока не было.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payouts.map((p) => (
                <div key={p.id} style={styles.referralRow}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatDateShort(p.processed_at || p.requested_at)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatRub(p.amount)} ₽
                  </span>
                  <PayoutStatus status={p.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.kind === 'success' ? 'var(--status-positive)' : 'var(--status-negative)',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── helpers / sub-components ────────────────────────────────────────────────

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div style={styles.header}>
      <button onClick={() => { selectionHaptic(); onBack(); }} style={styles.backBtn} aria-label="Назад">
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)"
             strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15,18 9,12 15,6" />
        </svg>
      </button>
      <span style={styles.headerTitle}>{title}</span>
      <div style={{ width: 40 }} />
    </div>
  );
}

function MetricCard({ emoji, label, value, onClick }: {
  emoji: string; label: string; value: string; onClick: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-accent)' }}>{value}</span>
      <svg
        width={14} height={14} viewBox="0 0 24 24" fill="none"
        stroke="var(--text-muted)" strokeWidth={2}
        style={{ position: 'absolute', top: 12, right: 12 }}
      >
        <polyline points="9,18 15,12 9,6" />
      </svg>
    </Card>
  );
}

function SectionTitle({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <h2 style={styles.sectionTitle}>
      {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
      {children}
    </h2>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={styles.row}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: accent ? 'var(--text-accent)' : 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function TierRow({ color, label, count, revenue, unit }: {
  color: string; label: string; count: number; revenue: number; unit: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{count} {unit}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', minWidth: 60, textAlign: 'right' }}>
        {formatRub(revenue)} ₽
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:   { bg: 'rgba(34,197,94,0.16)', color: 'var(--status-positive)', label: 'Active' },
    paused:   { bg: 'rgba(245,158,11,0.16)', color: 'var(--status-warning)', label: 'Paused' },
    archived: { bg: 'rgba(113,113,122,0.20)', color: 'var(--text-muted)', label: 'Archived' },
  };
  const v = map[status] || { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', label: status };
  return (
    <span style={{
      padding: '3px 8px',
      borderRadius: 6,
      fontSize: 11, fontWeight: 700,
      background: v.bg,
      color: v.color,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }}>
      {v.label}
    </span>
  );
}

function PayoutStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    requested:  { color: 'var(--status-warning)',  label: '⏳ Запрошено' },
    processing: { color: 'var(--status-warning)',  label: '⏳ В обработке' },
    paid:       { color: 'var(--status-positive)', label: '✓ Выплачено' },
    failed:     { color: 'var(--status-negative)', label: '✗ Ошибка' },
  };
  const v = map[status] || { color: 'var(--text-muted)', label: status };
  return <span style={{ fontSize: 12, fontWeight: 600, color: v.color, flexShrink: 0 }}>{v.label}</span>;
}

function btnSmall(color: string): CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 8,
    background: 'var(--bg-elevated)',
    border: `1px solid ${color}`,
    color,
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
  };
}

function formatRub(kopecks: number): string {
  const rub = Math.round(kopecks / 100);
  return rub.toLocaleString('ru-RU');
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'var(--safe-top)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  headerTitle: {
    flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
    textAlign: 'center',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    padding: '0 8px',
  },
  section: { padding: '16px 16px 0' },
  sectionTitle: {
    margin: '0 0 10px',
    fontSize: 13, fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted)',
  },
  divider: { height: 1, background: 'var(--border-subtle)', margin: '10px 0' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' },
  hint: { marginTop: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 },
  referralRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px',
    background: 'var(--bg-elevated)',
    borderRadius: 8,
  },
  empty: { padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 },
  toast: {
    position: 'fixed',
    left: 16, right: 16,
    bottom: 'calc(var(--safe-bottom) + 16px)',
    padding: '12px 16px',
    borderRadius: 12,
    color: '#fff',
    fontSize: 14, fontWeight: 600,
    textAlign: 'center',
    zIndex: 100,
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
  },
};

export default AdminPartnerDetailScreen;
