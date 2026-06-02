// Нижний таб-бар с 5 разделами и safe-area-снизу.
// Иконки — inline SVG, цвета привязаны к CSS-переменным.
import { NavLink } from 'react-router-dom';
import { selectionHaptic } from '../utils/haptics';

interface TabProps {
  to: string;
  label: string;
  icon: 'home' | 'wing' | 'simulator' | 'theory' | 'profile';
}

const TABS: TabProps[] = [
  { to: '/',          label: 'Главная',   icon: 'home' },
  { to: '/wing',      label: 'Стрела',    icon: 'wing' },
  { to: '/simulator', label: 'Симулятор', icon: 'simulator' },
  { to: '/theory',    label: 'Теория',    icon: 'theory' },
  { to: '/profile',   label: 'Профиль',   icon: 'profile' },
];

export function BottomTabBar() {
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: 'var(--tab-bar-bg)',
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 10,
        paddingBottom: 'calc(var(--safe-bottom) + 8px)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 100,
      }}
    >
      {TABS.map(t => (
        <TabButton key={t.to} {...t} />
      ))}
    </nav>
  );
}

function TabButton({ to, label, icon }: TabProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={() => selectionHaptic()}
      style={({ isActive }) => ({
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '4px 4px',
        textDecoration: 'none',
        color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
      })}
    >
      {({ isActive }) => (
        <>
          <TabIcon name={icon} color={isActive ? 'var(--accent-primary)' : 'var(--text-muted)'} />
          <span style={{ fontSize: 10, fontWeight: 500, lineHeight: '14px' }}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function TabIcon({ name, color }: { name: TabProps['icon']; color: string }) {
  const size = 20;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === 'home' && (<>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </>)}
      {name === 'wing' && (<>
        <path d="M5 19L19 5" />
        <path d="M19 5L19 12" />
        <path d="M19 5L12 5" />
      </>)}
      {name === 'simulator' && (
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      )}
      {name === 'theory' && (<>
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
        <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
      </>)}
      {name === 'profile' && (<>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx={12} cy={7} r={4} />
      </>)}
    </svg>
  );
}
