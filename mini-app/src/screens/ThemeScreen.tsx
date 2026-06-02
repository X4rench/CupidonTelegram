// ═══════════════════════════════════════════════════════════════
// ThemeScreen — выбор темы из 8 вариантов.
// Открывается из SettingsScreen → /theme.
// ═══════════════════════════════════════════════════════════════
import { useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic, notificationHaptic } from '../utils/haptics';
import { useTheme, type ThemeId, type ThemeMeta } from '../contexts/ThemeContext';

export function ThemeScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const { themeId, themes, switchTheme } = useTheme();

  const pick = (id: ThemeId) => {
    if (id === themeId) return;
    switchTheme(id);
    notificationHaptic('success');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Тема</span>
      </div>

      <div style={styles.subtitle}>
        Выбери внешний вид. Меняется мгновенно — без перезагрузки.
      </div>

      <div style={styles.grid}>
        {Object.values(themes).map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            active={t.id === themeId}
            onClick={() => pick(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Карточка одной темы ─────────────────────────────────────────────────────

function ThemeCard({ theme, active, onClick }: { theme: ThemeMeta; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={() => { selectionHaptic(); onClick(); }}
      style={{
        ...styles.card,
        borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
        boxShadow: active ? '0 0 0 2px var(--accent-soft)' : 'none',
      } as CSSProperties}
    >
      <div style={{ ...styles.swatch, background: theme.bg }}>
        <div style={{ ...styles.swatchDot, background: theme.accent }} />
        <ThemeIcon name={theme.icon} color={theme.accent} />
      </div>
      <div style={styles.cardBody}>
        <div style={styles.cardName}>{theme.name}</div>
        {active && <div style={styles.cardBadge}>Активна</div>}
      </div>
    </button>
  );
}

function ThemeIcon({ name, color }: { name: ThemeMeta['icon']; color: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'moon':     return <svg {...common}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>;
    case 'sun':      return <svg {...common}><circle cx={12} cy={12} r={5} /><line x1={12} y1={1} x2={12} y2={3} /><line x1={12} y1={21} x2={12} y2={23} /><line x1={4.22} y1={4.22} x2={5.64} y2={5.64} /><line x1={18.36} y1={18.36} x2={19.78} y2={19.78} /><line x1={1} y1={12} x2={3} y2={12} /><line x1={21} y1={12} x2={23} y2={12} /></svg>;
    case 'star':     return <svg {...common}><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" /></svg>;
    case 'zap':      return <svg {...common}><polygon points="13,2 3,14 12,14 11,22 21,10 12,10" /></svg>;
    case 'heart':    return <svg {...common}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>;
    case 'leaf':     return <svg {...common}><path d="M11 20A7 7 0 014 13V5a1 1 0 011-1h6a7 7 0 017 7 7 7 0 01-7 7v2" /><path d="M2 22l9-9" /></svg>;
    case 'sparkles': return <svg {...common}><path d="M12 3l1.9 5.5L19 10l-5.1 1.5L12 17l-1.9-5.5L5 10l5.1-1.5z" /><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>;
    case 'cpu':      return <svg {...common}><rect x={4} y={4} width={16} height={16} rx={2} /><rect x={9} y={9} width={6} height={6} /><line x1={9} y1={1} x2={9} y2={4} /><line x1={15} y1={1} x2={15} y2={4} /><line x1={9} y1={20} x2={9} y2={23} /><line x1={15} y1={20} x2={15} y2={23} /><line x1={20} y1={9} x2={23} y2={9} /><line x1={20} y1={14} x2={23} y2={14} /><line x1={1} y1={9} x2={4} y2={9} /><line x1={1} y1={14} x2={4} y2={14} /></svg>;
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 16px)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
    paddingLeft: 20,
    paddingRight: 20,
  },
  header: {
    paddingBottom: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 20,
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  card: {
    background: 'var(--bg-card)',
    border: '2px solid',
    borderRadius: 16,
    padding: 12,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    transition: 'border-color 160ms ease, box-shadow 160ms ease',
  },
  swatch: {
    width: '100%',
    height: 64,
    borderRadius: 10,
    border: '1px solid var(--border-subtle)',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    boxShadow: '0 0 8px currentColor',
  },
  cardBody: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  cardBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
};
