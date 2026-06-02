// ═══════════════════════════════════════════════════════════════
// SettingsScreen — настройки приложения (TMA).
//
// Что есть:
//   - Тема: 8 вариантов (открывает /theme — Phase J)
//   - Toggle нотификаций (заглушка до Phase H — сохраняем в localStorage)
//   - Ссылки на Условия, Политику, Поддержку
//   - Кнопка «Удалить аккаунт» → /delete-profile
//   - Build version в футере
//   - Ссылка на админку (только для is_admin) — Phase J
// ═══════════════════════════════════════════════════════════════
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../utils/storage';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic, impactHaptic } from '../utils/haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useMe } from '../contexts/MeContext';

const BUILD_VERSION = (import.meta.env.VITE_BUILD_VERSION as string) || 'dev';

export function SettingsScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const { theme } = useTheme();
  const { me } = useMe();
  const [notifs, setNotifs] = useState<boolean>(() => storage.get<boolean>('settings.notifs', true));

  const toggleNotifs = () => {
    selectionHaptic();
    const next = !notifs;
    setNotifs(next);
    storage.set('settings.notifs', next);
    // TODO Phase H: интеграция с TG-уведомлениями (web_app_request_*)
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Настройки</span>
      </div>

      {/* Тема */}
      <Section title="Тема">
        <List>
          <ListItem
            icon="moon"
            label="Тема оформления"
            subLabel={`Сейчас: ${theme.name}`}
            onClick={() => nav('/theme')}
            first
            last
            chevron
          />
        </List>
      </Section>

      {/* Общие */}
      <Section title="Общие">
        <List>
          <ListItem
            icon="bell"
            label="Уведомления"
            right={<Toggle value={notifs} onClick={toggleNotifs} />}
            first
          />
          <ListItem
            icon="globe"
            label="Язык"
            right={<Badge>Русский</Badge>}
            last
          />
        </List>
      </Section>

      {/* Документы и поддержка */}
      <Section title="Информация">
        <List>
          <ListItem icon="doc" label="Условия использования" onClick={() => nav('/terms')} first chevron />
          <ListItem icon="shield" label="Политика конфиденциальности" onClick={() => nav('/privacy')} chevron />
          <ListItem icon="message" label="Связь с поддержкой" onClick={() => nav('/support')} last chevron />
        </List>
      </Section>

      {/* Админка — только для is_admin */}
      {me?.is_admin && (
        <Section title="Администрирование">
          <List>
            <ListItem
              icon="shield"
              label="Админ-панель"
              subLabel="Промпты, статистика, логи, audit"
              onClick={() => nav('/admin')}
              first
              last
              chevron
            />
          </List>
        </Section>
      )}

      {/* Опасная зона */}
      <Section title="Аккаунт">
        <List>
          <ListItem
            icon="trash"
            label="Удалить аккаунт"
            color="var(--status-negative)"
            onClick={() => { impactHaptic('medium'); nav('/delete-profile'); }}
            first
            last
            chevron
          />
        </List>
      </Section>

      <div style={styles.version}>
        Купидон TMA · v{BUILD_VERSION}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <div style={styles.list}>{children}</div>;
}

interface ListItemProps {
  icon: string;
  label: string;
  subLabel?: string;
  right?: ReactNode;
  color?: string;
  onClick?: () => void;
  first?: boolean;
  last?: boolean;
  chevron?: boolean;
}

function ListItem({ icon, label, right, color, onClick, first, last, chevron, subLabel }: ListItemProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick ? () => { selectionHaptic(); onClick(); } : undefined}
      style={{
        ...styles.listItem,
        ...(first ? styles.listFirst : {}),
        ...(last ? styles.listLast : {}),
        ...(last ? {} : styles.listBorder),
        cursor: onClick ? 'pointer' : 'default',
      } as CSSProperties}
    >
      <Icon name={icon} color={color ?? 'var(--text-secondary)'} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ ...styles.listLabel, color: color ?? 'var(--text-primary)' }}>{label}</div>
        {subLabel && <div style={styles.listSub}>{subLabel}</div>}
      </div>
      {right}
      {chevron && (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
          <polyline points="9,18 15,12 9,6" />
        </svg>
      )}
    </Tag>
  );
}

function Item({ icon, label, subLabel, right }: ListItemProps) {
  return (
    <div style={{ ...styles.list, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name={icon} color="var(--text-secondary)" />
        <div style={{ flex: 1 }}>
          <div style={styles.listLabel}>{label}</div>
          {subLabel && <div style={styles.listSub}>{subLabel}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

function Toggle({ value, onClick }: { value: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={value}
      style={{
        width: 44, height: 24,
        background: value ? 'var(--accent-primary)' : 'var(--toggle-off)',
        border: '1px solid',
        borderColor: value ? 'var(--accent-primary)' : 'var(--border-default)',
        borderRadius: 12,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 220ms ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18,
        borderRadius: 9,
        background: '#fff',
        position: 'absolute',
        top: 2,
        left: value ? 22 : 2,
        transition: 'left 220ms ease',
      }} />
    </button>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      padding: '4px 10px', borderRadius: 6,
      background: 'var(--bg-elevated)',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }}>{children}</span>
  );
}

function Icon({ name, color }: { name: string; color: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === 'moon' && <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />}
      {name === 'bell' && <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>}
      {name === 'globe' && <><circle cx={12} cy={12} r={10} /><line x1={2} y1={12} x2={22} y2={12} /><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" /></>}
      {name === 'doc' && <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></>}
      {name === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
      {name === 'message' && <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />}
      {name === 'trash' && <><polyline points="3,6 5,6 21,6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></>}
    </svg>
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

  section: { padding: '0 20px 8px', marginBottom: 12 },
  sectionTitle: {
    margin: '8px 0 8px',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-muted)',
  },

  list: {
    borderRadius: 16,
    border: '1px solid var(--border-subtle)',
    overflow: 'hidden',
    background: 'var(--bg-card)',
  },
  listItem: {
    width: '100%',
    background: 'var(--bg-card)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    cursor: 'pointer',
    border: 'none',
    textAlign: 'left',
  },
  listFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  listLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  listBorder: { borderBottom: '1px solid var(--border-subtle)' },
  listLabel: { fontSize: 15, color: 'var(--text-primary)' },
  listSub: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },

  version: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-muted)',
    padding: '24px 20px 0',
  },
};
