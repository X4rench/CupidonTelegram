// ═══════════════════════════════════════════════════════════════
// PartnerCabinetScreen — кабинет партнёра.
// Маршрут: /partner-cabinet
//
// Доступ — backend сам проверит is_partner (403 если нет).
// На фронте показываем CTA из ProfileScreen только если me.is_partner.
//
// Все суммы из API приходят в копейках — отображаем как `(value/100).toFixed(0) ₽`.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { BarChart } from '../components/BarChart';
import { DonutChart, type DonutSegment } from '../components/DonutChart';
import { useBackButton } from '../utils/backButton';
import { impactHaptic, notificationHaptic, selectionHaptic } from '../utils/haptics';
import {
  getPartnerStats,
  getPartnerPayouts,
  requestPartnerPayout,
  type PartnerStatsResp,
  type PartnerPayout,
} from '../api';

const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string) || 'Cupidon_Ai_Bot';
const MINIAPP_SLUG = (import.meta.env.VITE_MINIAPP_SLUG as string) || 'app';

export function PartnerCabinetScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const [stats, setStats] = useState<PartnerStatsResp | null>(null);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        getPartnerStats(),
        getPartnerPayouts().catch(() => ({ ok: false, payouts: [] as PartnerPayout[] })),
      ]);
      setStats(s);
      setPayouts(p.payouts || []);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Авто-скрытие toast
  useEffect(() => {
    if (!toast || toast.kind === 'success') return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((kind: 'success' | 'error' | 'info', text: string) => {
    setToast({ kind, text });
    if (kind === 'success') setTimeout(() => setToast(null), 2500);
  }, []);

  const referralLink = useMemo(() => {
    if (!stats?.partner?.code) return '';
    return `https://t.me/${BOT_USERNAME}/${MINIAPP_SLUG}?startapp=p_${stats.partner.code}`;
  }, [stats?.partner?.code]);

  const onCopy = useCallback(async () => {
    if (!referralLink) return;
    impactHaptic('light');
    try {
      await navigator.clipboard.writeText(referralLink);
      notificationHaptic('success');
      showToast('success', 'Скопировано');
    } catch (_) {
      showToast('error', 'Не удалось скопировать');
    }
  }, [referralLink, showToast]);

  const onShare = useCallback(() => {
    if (!referralLink) return;
    impactHaptic('medium');
    const tg = (window as any)?.Telegram?.WebApp;
    const shareText = 'Купидон — AI-тренер для уверенного общения. Заходи!';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
    if (tg?.openTelegramLink) {
      try { tg.openTelegramLink(shareUrl); return; } catch (_) { /* fallthrough */ }
    }
    window.open(shareUrl, '_blank');
  }, [referralLink]);

  const onRequestPayout = useCallback(async () => {
    if (!stats) return;
    if (busy) return;
    if (stats.balance.available < stats.min_payout_kopecks) {
      showToast('info', `Минимум для выплаты — ${(stats.min_payout_kopecks / 100).toFixed(0)} ₽`);
      return;
    }
    impactHaptic('medium');
    setBusy(true);
    try {
      const res = await requestPartnerPayout();
      if (res.ok) {
        notificationHaptic('success');
        showToast('success', 'Запрос отправлен');
        await load();
      } else {
        notificationHaptic('error');
        showToast('error', res.error || 'Не удалось отправить запрос');
      }
    } catch (e: any) {
      notificationHaptic('error');
      showToast('error', e?.message || 'Ошибка запроса');
    } finally {
      setBusy(false);
    }
  }, [stats, busy, load, showToast]);

  if (loading) {
    return (
      <div style={styles.container}>
        <Header onBack={onBack} />
        <LoadingNote>Загружаем кабинет…</LoadingNote>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={styles.container}>
        <Header onBack={onBack} />
        <div style={{ padding: '24px 20px' }}>
          <Card style={{ borderColor: 'var(--border-default)' }}>
            <div style={{ fontSize: 14, color: 'var(--status-negative)', marginBottom: 12 }}>
              {error || 'Ошибка загрузки'}
            </div>
            <SecondaryButton onClick={load} full>Повторить</SecondaryButton>
          </Card>
        </div>
      </div>
    );
  }

  const { partner, balance, stats_30d, chart_data, rank, top5, min_payout_kopecks } = stats;

  const chartEarned = chart_data.map(d => d.earned / 100);
  const chartLabels = chart_data.map((d, i) => {
    // Подписи: каждый 5-й бар — DD
    if (i % 5 !== 0 && i !== chart_data.length - 1) return '';
    const parts = (d.date || '').split('-');
    return parts.length === 3 ? parts[2] : '';
  });

  const tierSegments: DonutSegment[] = [
    { label: 'Basic',    value: stats_30d.by_tier.basic,    color: '#F43F5E' },
    { label: 'Premium',  value: stats_30d.by_tier.premium,  color: '#A855F7' },
    { label: 'Day Pass', value: stats_30d.by_tier.day_pass, color: '#22C55E' },
  ];

  const canRequest = balance.available >= min_payout_kopecks;
  const minPayoutRub = (min_payout_kopecks / 100).toFixed(0);

  return (
    <div style={styles.container}>
      <Header onBack={onBack} />

      {/* Total earned + balances + payout CTA */}
      <div style={styles.section}>
        <Card style={styles.heroCard}>
          <div style={styles.heroLabel}>Заработано всего</div>
          <div style={styles.heroValue}>{formatRub(balance.lifetime_earned)} ₽</div>

          <div style={styles.balanceRow}>
            <div style={styles.balanceCell}>
              <div style={styles.balanceLabel}>К выплате</div>
              <div style={styles.balanceValue}>{formatRub(balance.available)} ₽</div>
            </div>
            <div style={styles.balanceCell}>
              <div style={styles.balanceLabel}>На удержании</div>
              <div style={styles.balanceValueMuted}>{formatRub(balance.pending)} ₽</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <GradientButton
              onClick={onRequestPayout}
              disabled={!canRequest || busy}
              loading={busy}
              full
            >
              {canRequest ? `Запросить выплату` : `Запросить выплату от ${minPayoutRub} ₽`}
            </GradientButton>
            {!canRequest && (
              <div style={styles.hintText}>
                Минимум {minPayoutRub} ₽. Сейчас доступно {formatRub(balance.available)} ₽.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 30 days */}
      <div style={styles.section}>
        <SectionTitle icon="📈">За 30 дней</SectionTitle>
        <Card>
          <BarChart
            data={chartEarned}
            labels={chartLabels}
            height={80}
            color="var(--accent-primary)"
            formatValue={(v) => `${v.toFixed(0)} ₽`}
          />
          <div style={styles.divider} />
          <Row label="Привёл людей" value={String(stats_30d.new_referrals)} />
          <Row
            label="Купили подписку"
            value={`${stats_30d.paid_users} (${stats_30d.conversion_pct}%)`}
          />
        </Card>
      </div>

      {/* By tier */}
      <div style={styles.section}>
        <SectionTitle icon="📦">По тарифам</SectionTitle>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <TierRow color="#F43F5E" label="Basic"    count={stats_30d.by_tier.basic}    revenue={stats_30d.by_tier_revenue.basic} unit="чел" />
            <TierRow color="#A855F7" label="Premium"  count={stats_30d.by_tier.premium}  revenue={stats_30d.by_tier_revenue.premium} unit="чел" />
            <TierRow color="#22C55E" label="Day Pass" count={stats_30d.by_tier.day_pass} revenue={stats_30d.by_tier_revenue.day_pass} unit="шт" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <DonutChart segments={tierSegments} size={140} hideLegend />
          </div>
        </Card>
      </div>

      {/* Referral link */}
      <div style={styles.section}>
        <SectionTitle icon="🔗">Твоя реф-ссылка</SectionTitle>
        <Card>
          <div style={styles.linkBox}>
            <span style={styles.linkText}>{referralLink || '…'}</span>
          </div>
          <div style={styles.linkButtonsRow}>
            <SecondaryButton onClick={onCopy} full>Скопировать</SecondaryButton>
            <GradientButton onClick={onShare} full>Поделиться в TG</GradientButton>
          </div>
          <div style={styles.hintText}>
            Партнёр: <strong style={{ color: 'var(--text-primary)' }}>{partner.display_name}</strong>{' '}
            · код <strong style={{ color: 'var(--text-accent)' }}>{partner.code}</strong>{' '}
            · комиссия <strong>{partner.commission_pct}%</strong>
          </div>
        </Card>
      </div>

      {/* Rank */}
      <div style={styles.section}>
        <SectionTitle icon="🏆">Топ-партнёры</SectionTitle>
        <Card>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Ты на {rank.position}-м из {rank.of_total}
          </div>
          {rank.next_position_diff > 0 && rank.position > 1 && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              Чтобы стать {rank.position - 1}-м: +{formatRub(rank.next_position_diff)} ₽
            </div>
          )}
          {top5.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {top5.map((t) => (
                <div key={t.partner_id} style={styles.topRow}>
                  <span style={styles.topRank}>{t.rank}</span>
                  <span style={styles.topName}>{t.display_name}</span>
                  <span style={styles.topTotal}>{formatRub(t.total)} ₽</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Payouts history */}
      <div style={styles.section}>
        <SectionTitle icon="📋">История выплат</SectionTitle>
        <Card>
          {payouts.length === 0 ? (
            <div style={styles.empty}>Пока выплат не было.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payouts.map((p) => (
                <div key={p.id} style={styles.payoutRow}>
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
          background: toast.kind === 'success'
            ? 'var(--status-positive)'
            : toast.kind === 'error'
              ? 'var(--status-negative)'
              : 'var(--bg-elevated)',
          color: toast.kind === 'info' ? 'var(--text-primary)' : '#fff',
          border: toast.kind === 'info' ? '1px solid var(--border-default)' : 'none',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── UI bits ─────────────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={styles.header}>
      <button onClick={() => { selectionHaptic(); onBack(); }} style={styles.backBtn} aria-label="Назад">
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)"
             strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15,18 9,12 15,6" />
        </svg>
      </button>
      <span style={styles.headerTitle}>Кабинет партнёра</span>
      <div style={{ width: 40 }} />
    </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function TierRow({ color, label, count, revenue, unit }: {
  color: string; label: string; count: number; revenue: number; unit: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{count} {unit}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', minWidth: 60, textAlign: 'right' }}>
        {formatRub(revenue)} ₽
      </span>
    </div>
  );
}

function PayoutStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    requested:  { color: 'var(--status-warning)',  label: '⏳ В очереди' },
    processing: { color: 'var(--status-warning)',  label: '⏳ В обработке' },
    paid:       { color: 'var(--status-positive)', label: '✓ Выплачено' },
    failed:     { color: 'var(--status-negative)', label: '✗ Ошибка' },
  };
  const v = map[status] || { color: 'var(--text-muted)', label: status };
  return <span style={{ fontSize: 12, fontWeight: 600, color: v.color, flexShrink: 0 }}>{v.label}</span>;
}

function LoadingNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{children}</div>;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function formatRub(kopecks: number): string {
  const rub = Math.round(kopecks / 100);
  // 87320 → "87 320"
  return rub.toLocaleString('ru-RU');
}

function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

// ── styles ──────────────────────────────────────────────────────────────────

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
  headerTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },

  section: { padding: '16px 16px 0' },
  sectionTitle: {
    margin: '0 0 10px',
    fontSize: 13, fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted)',
  },

  heroCard: {
    backgroundImage: 'linear-gradient(135deg, rgba(244,63,94,0.10), rgba(168,85,247,0.10))',
    borderColor: 'var(--border-accent)',
  },
  heroLabel: { fontSize: 13, color: 'var(--text-muted)' },
  heroValue: {
    marginTop: 4,
    fontSize: 32, fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: -0.5,
  },

  balanceRow: {
    marginTop: 14,
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
  },
  balanceCell: {
    padding: 12,
    borderRadius: 12,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
  },
  balanceLabel: { fontSize: 12, color: 'var(--text-muted)' },
  balanceValue: {
    marginTop: 4,
    fontSize: 20, fontWeight: 700,
    color: 'var(--text-accent)',
  },
  balanceValueMuted: {
    marginTop: 4,
    fontSize: 20, fontWeight: 700,
    color: 'var(--text-secondary)',
  },

  divider: { height: 1, background: 'var(--border-subtle)', margin: '12px 0' },

  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0',
  },

  hintText: {
    marginTop: 8,
    fontSize: 12, color: 'var(--text-muted)',
    lineHeight: 1.4,
  },

  linkBox: {
    padding: '10px 12px',
    borderRadius: 10,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    fontSize: 12,
    color: 'var(--text-secondary)',
    wordBreak: 'break-all',
    marginBottom: 10,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  linkText: { lineHeight: 1.5 },
  linkButtonsRow: { display: 'flex', gap: 8 },

  topRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px',
    background: 'var(--bg-elevated)',
    borderRadius: 8,
  },
  topRank: {
    width: 24, height: 24, borderRadius: 12,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    fontSize: 12, fontWeight: 700,
    flexShrink: 0,
  },
  topName: { flex: 1, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  topTotal: { fontSize: 13, fontWeight: 600, color: 'var(--text-accent)', flexShrink: 0 },

  payoutRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px',
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
    fontSize: 14, fontWeight: 600,
    textAlign: 'center',
    zIndex: 100,
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
  },
};

export default PartnerCabinetScreen;
