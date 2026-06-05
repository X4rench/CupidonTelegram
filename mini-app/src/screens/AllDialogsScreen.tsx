// ═══════════════════════════════════════════════════════════════
// AllDialogsScreen — список всех диалогов.
// Tabs: Стрела (contacts из API) / Симулятор (sim_session_* из storage).
// Тап → nav в чат с пред-восстановленным session_id.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { contactsApi, type Contact } from '../api';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic } from '../utils/haptics';
import { findSimTypazhByName, cleanTypazhName } from '../utils/typazhes';

interface SimDialog {
  key: string;        // полный storage-key (для passing в чат)
  storageKey: string; // sim_session_<...>
  sessionId: string;
  typazh: string;
  place: string;
  lastMsg: string;
  difficulty?: number;
  color: string;
  girlName?: string;
}

const GRADIENT_POOL: [string, string][] = [
  ['#F43F5E', '#EC4899'],
  ['#A855F7', '#6366F1'],
  ['#22C55E', '#06B6D4'],
  ['#EF4444', '#F59E0B'],
  ['#6366F1', '#A855F7'],
  ['#EC4899', '#F59E0B'],
];

export function AllDialogsScreen() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'wing' | 'sim'>('wing');
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [simDialogs, setSimDialogs] = useState<SimDialog[]>([]);

  useBackButton(() => nav(-1));

  useEffect(() => {
    contactsApi.getAll()
      .then(res => { if (res.ok) setContacts(res.contacts || []); })
      .catch(() => {});

    // Сканируем localStorage на sim_session_*
    const out: SimDialog[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const m = /^cupidon:[^:]+:sim_session_(.+)$/.exec(k);
      if (!m) continue;
      const suffix = m[1];
      const underIdx = suffix.indexOf('_');
      const typazhRaw = underIdx > 0 ? suffix.slice(0, underIdx) : suffix;
      const place = underIdx > 0 ? suffix.slice(underIdx + 1) : '';
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const data = JSON.parse(raw);
        const msgs = data.messages || [];
        const lastHer = [...msgs].reverse().find((m: any) => m.from === 'her');
        const lastAny = msgs[msgs.length - 1];
        if (!msgs.length) continue;
        // Имя сначала из data.typazh (правильно при сохранении), потом из
        // суффикса (legacy fallback). Чистим от лидирующих цифр/мусора.
        const typazh = cleanTypazhName(data.typazh || typazhRaw);
        const t = findSimTypazhByName(typazh);
        out.push({
          key: k,
          storageKey: `sim_session_${suffix}`,
          sessionId: data.session_id,
          typazh,
          girlName: data.girl_name,
          place,
          lastMsg: lastHer?.text || lastAny?.text || '',
          difficulty: data.difficulty,
          color: data.type_color || t?.color || 'rgba(168,85,247',
        });
      } catch (_) {}
    }
    setSimDialogs(out);
  }, []);

  const wingFiltered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.typazh || '').toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const simFiltered = useMemo(() => {
    const q = search.toLowerCase();
    return simDialogs.filter(d =>
      d.typazh.toLowerCase().includes(q) ||
      (d.girlName || '').toLowerCase().includes(q) ||
      d.lastMsg.toLowerCase().includes(q),
    );
  }, [simDialogs, search]);

  const list = tab === 'wing' ? wingFiltered : simFiltered;

  return (
    <Layout>
      <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={() => nav(-1)} style={styles.backBtn} aria-label="Назад">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={2.5} strokeLinecap="round">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Все диалоги</h1>
          <div style={styles.countBadge}>{list.length}</div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, color: tab === 'wing' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            onClick={() => { selectionHaptic(); setTab('wing'); setSearch(''); }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M5 19L19 5M19 5L19 12M19 5L12 5" />
            </svg>
            <span>Стрела</span>
          </button>
          <button
            style={{ ...styles.tab, color: tab === 'sim' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            onClick={() => { selectionHaptic(); setTab('sim'); setSearch(''); }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span>Симулятор</span>
          </button>
          <div style={{ ...styles.tabIndicator, left: tab === 'wing' ? '0%' : '50%' }} />
        </div>

        {/* Search */}
        <div style={styles.searchBox}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
            <circle cx={11} cy={11} r={8} />
            <path d="M21 21L16.65 16.65" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск..."
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <button onClick={() => setSearch('')} aria-label="Очистить">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* List */}
        {list.length === 0 ? (
          <div style={styles.empty}>
            {tab === 'wing' ? 'Пока нет контактов' : 'Пока нет начатых симуляций'}
          </div>
        ) : tab === 'wing' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wingFiltered.map((c, i) => (
              <DialogRow
                key={c.id}
                title={c.name}
                subtitle={c.typazh || 'без типажа'}
                lastMsg=""
                gradient={GRADIENT_POOL[i % GRADIENT_POOL.length]}
                onClick={() => nav(`/wing?contact=${c.id}`)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {simFiltered.map((d, i) => (
              <DialogRow
                key={d.storageKey}
                title={d.girlName ? `${d.girlName} · ${d.typazh}` : d.typazh}
                subtitle={d.place || 'AI-симуляция'}
                lastMsg={d.lastMsg}
                gradient={GRADIENT_POOL[i % GRADIENT_POOL.length]}
                onClick={() => nav(`/simulator/chat/${encodeURIComponent(d.sessionId)}?key=${encodeURIComponent(d.storageKey)}`)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function DialogRow({ title, subtitle, lastMsg, gradient, onClick }: {
  title: string;
  subtitle: string;
  lastMsg: string;
  gradient: [string, string];
  onClick: () => void;
}) {
  const initial = (title.trim() || '?').slice(0, 1).toUpperCase();
  return (
    <Card onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 25,
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 18,
          flexShrink: 0,
        }}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastMsg || subtitle}
          </div>
        </div>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </div>
    </Card>
  );
}

const styles: Record<string, CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    background: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.15))',
    border: '1px solid rgba(244,63,94,0.2)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  countBadge: {
    padding: '4px 10px',
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 10,
  },
  tabs: {
    position: 'relative',
    display: 'flex',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tab: {
    flex: 1, padding: '12px 8px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
    background: 'transparent',
  },
  tabIndicator: {
    position: 'absolute', bottom: 0,
    width: '50%', height: 2,
    background: 'var(--accent-primary)',
    transition: 'left 220ms ease-out',
  },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: 'var(--text-primary)',
    border: 0, outline: 0, background: 'transparent',
  },
  empty: {
    textAlign: 'center', color: 'var(--text-muted)',
    fontSize: 14, padding: '40px 16px',
  },
};
