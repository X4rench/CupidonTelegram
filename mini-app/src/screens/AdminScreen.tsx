// ═══════════════════════════════════════════════════════════════
// AdminScreen — TMA-версия RBAC админки.
//
// Гейт: me.is_admin === true (бэк проверяет ADMIN_TELEGRAM_IDS).
// Если не админ — показываем «Нет доступа» и кнопку «На главную».
//
// 4 таба:
//   - Статистика: users/analyses/simulations/avg_score/requests_today
//   - Промпты:    список → редактор (system_prompt, model, temp, max_tokens,
//                 is_active) → Сохранить → Тест
//   - Логи:       последние request_logs (endpoint, method, status, ms)
//   - Audit:      admin_audit_log — кто что менял
//
// Отличия от RN-версии:
//   - Нет ввода admin_secret (TMA initData достаточно).
//   - Pagination нет — limit=100 хватает.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../contexts/MeContext';
import { useBackButton } from '../utils/backButton';
import { selectionHaptic, notificationHaptic, impactHaptic } from '../utils/haptics';
import { Card } from '../components/Card';
import { GradientButton } from '../components/GradientButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { Layout } from '../components/Layout';
import {
  adminApi,
  type AdminPrompt,
  type AdminStats,
  type AdminRequestLog,
  type AdminAuditEntry,
  type AdminPromptTestResp,
} from '../api';

type Tab = 'stats' | 'prompts' | 'logs' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stats',   label: 'Статистика' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'logs',    label: 'Логи' },
  { id: 'audit',   label: 'Audit' },
];

export function AdminScreen() {
  const nav = useNavigate();
  const onBack = useCallback(() => nav(-1), [nav]);
  useBackButton(onBack);

  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>('stats');

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка...</div>
      </Layout>
    );
  }

  if (!me?.is_admin) {
    return <NoAccess onBack={() => nav('/profile')} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Админ-панель</span>
        <span style={styles.badge}>ADMIN</span>
      </div>

      <div style={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { selectionHaptic(); setTab(t.id); }}
            style={{
              ...styles.tab,
              borderColor: tab === t.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
              color: tab === t.id ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === 'stats'   && <StatsTab />}
        {tab === 'prompts' && <PromptsTab />}
        {tab === 'logs'    && <LogsTab />}
        {tab === 'audit'   && <AuditTab />}
      </div>
    </div>
  );
}

// ─── No access ───────────────────────────────────────────────────────────────

function NoAccess({ onBack }: { onBack: () => void }) {
  return (
    <Layout>
      <div style={styles.noAccessWrap}>
        <div style={styles.noAccessIcon}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5}>
            <rect x={3} y={11} width={18} height={11} rx={2} />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1 style={styles.noAccessTitle}>Нет доступа</h1>
        <p style={styles.noAccessText}>
          Эта страница доступна только администраторам Сервиса. Если ты считаешь,
          что это ошибка — напиши в поддержку.
        </p>
        <div style={{ marginTop: 24 }}>
          <GradientButton onClick={onBack} full>На главную</GradientButton>
        </div>
      </div>
    </Layout>
  );
}

// ─── Stats Tab ───────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getStats();
      setStats(res.stats);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote>Загружаем статистику...</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;
  if (!stats)  return null;

  const metrics: { label: string; value: string | number }[] = [
    { label: 'Пользователей',     value: stats.users },
    { label: 'Анализов',          value: stats.analyses },
    { label: 'Симуляций',         value: stats.simulations },
    { label: 'Средний скор',      value: stats.avg_score != null ? stats.avg_score.toFixed(1) : '—' },
    { label: 'Запросов сегодня',  value: stats.requests_today },
  ];
  if (stats.rejections != null) metrics.push({ label: 'Разборы отказов', value: stats.rejections });
  if (stats.paid_subs  != null) metrics.push({ label: 'Активных подписок', value: stats.paid_subs });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {metrics.map((m) => (
        <Card key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{m.label}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-accent)' }}>{m.value}</span>
        </Card>
      ))}
      <div style={{ marginTop: 8 }}>
        <SecondaryButton onClick={load} full>Обновить</SecondaryButton>
      </div>
    </div>
  );
}

// ─── Prompts Tab ─────────────────────────────────────────────────────────────

function PromptsTab() {
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [models, setModels] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pres, mres] = await Promise.all([
        adminApi.getPrompts(),
        adminApi.getModels().catch(() => null),
      ]);
      setPrompts(pres.prompts);
      setSelectedId(prev => prev != null ? prev : (pres.prompts[0]?.id ?? null));
      if (mres?.models) {
        const m: string[] = [];
        if (mres.models.primary)  m.push(mres.models.primary);
        if (mres.models.fallback && mres.models.fallback !== mres.models.primary) m.push(mres.models.fallback);
        // Доп-модели из объекта
        Object.values(mres.models).forEach((v) => {
          if (typeof v === 'string' && !m.includes(v)) m.push(v);
        });
        setModels(m);
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить промпты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote>Загружаем промпты...</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;
  if (prompts.length === 0) return <EmptyNote>Промпты не настроены.</EmptyNote>;

  const selected = prompts.find(p => p.id === selectedId) || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={styles.promptListRow}>
        {prompts.map((p) => (
          <button
            key={p.id}
            onClick={() => { selectionHaptic(); setSelectedId(p.id); }}
            style={{
              ...styles.promptChip,
              borderColor: selectedId === p.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background:  selectedId === p.id ? 'var(--accent-soft)'    : 'var(--bg-card)',
              color:       selectedId === p.id ? 'var(--text-accent)'    : 'var(--text-muted)',
            }}
          >
            {p.name || p.key}
          </button>
        ))}
      </div>

      {selected && (
        <PromptEditor
          key={selected.id}
          prompt={selected}
          modelOptions={models}
          onSaved={load}
        />
      )}
    </div>
  );
}

function PromptEditor({ prompt, modelOptions, onSaved }: {
  prompt: AdminPrompt;
  modelOptions: string[];
  onSaved: () => void;
}) {
  const [systemPrompt, setSystemPrompt] = useState(prompt.system_prompt);
  const [model, setModel] = useState(prompt.model);
  const [temperature, setTemperature] = useState(String(prompt.temperature));
  const [maxTokens, setMaxTokens] = useState(String(prompt.max_tokens));
  const [isActive, setIsActive] = useState<boolean>(!!prompt.is_active);
  const [saving, setSaving] = useState(false);

  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<AdminPromptTestResp | { error: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const allModels = [...new Set([model, ...modelOptions])].filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updatePrompt(prompt.id, {
        system_prompt: systemPrompt,
        model,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens, 10),
        is_active: isActive ? 1 : 0,
      });
      notificationHaptic('success');
      onSaved();
    } catch (e: any) {
      impactHaptic('medium');
      alert(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testInput.trim()) {
      alert('Введи тестовый запрос');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.testPrompt({
        prompt_id: prompt.id,
        system_prompt: systemPrompt,
        model,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens, 10),
        test_input: testInput,
      });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ error: e?.message || 'Ошибка теста' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {prompt.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{prompt.description}</div>
      )}

      <Field label="Системный промпт">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          style={{ ...styles.textarea, minHeight: 140 }}
        />
      </Field>

      <Field label="Модель">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allModels.map((m) => (
            <button
              key={m}
              onClick={() => { selectionHaptic(); setModel(m); }}
              style={{
                ...styles.modelOption,
                borderColor: model === m ? 'var(--accent-primary)' : 'var(--border-subtle)',
                background:  model === m ? 'var(--accent-soft)'    : 'var(--bg-card)',
                color:       model === m ? 'var(--text-accent)'    : 'var(--text-muted)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Temperature" style={{ flex: 1 }}>
          <input
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            inputMode="decimal"
            style={styles.input}
          />
        </Field>
        <Field label="Max tokens" style={{ flex: 1 }}>
          <input
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            inputMode="numeric"
            style={styles.input}
          />
        </Field>
      </div>

      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => { selectionHaptic(); setIsActive(v => !v); }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Активен</span>
      </label>

      <GradientButton onClick={save} loading={saving} full>
        {saving ? 'Сохранение...' : 'Сохранить промпт'}
      </GradientButton>

      <div style={styles.divider} />

      <Field label="Тестовый запрос">
        <textarea
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder="Введи тестовые данные..."
          style={{ ...styles.textarea, minHeight: 80 }}
        />
      </Field>

      <SecondaryButton onClick={test} disabled={testing} full>
        {testing ? 'Тестирование...' : 'Тест промпта'}
      </SecondaryButton>

      {testResult && (
        <div style={styles.testResult}>
          {'error' in testResult && testResult.error ? (
            <div style={{ color: 'var(--status-negative)', fontSize: 13 }}>
              Ошибка: {testResult.error}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{(testResult as AdminPromptTestResp).duration_ms} ms</span>
                <span>{(testResult as AdminPromptTestResp).model}</span>
              </div>
              <pre style={styles.testRaw}>
                {(testResult as AdminPromptTestResp).raw || '(пустой ответ)'}
              </pre>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Logs Tab ────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<AdminRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getLogs(100);
      setLogs(res.logs);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить логи');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingNote>Загружаем логи...</LoadingNote>;
  if (error)   return <ErrorBlock message={error} onRetry={load} />;
  if (logs.length === 0) return <EmptyNote>Логов нет.</EmptyNote>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SecondaryButton onClick={load} full>Обновить</SecondaryButton>
      {logs.map((log) => (
        <Card key={log.id} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {log.method} {log.endpoint}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(log.response_status) }}>
              {log.response_status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{log.duration_ms} ms</span>
            {log.device_id && <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.device_id}</span>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{log.created_at}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Audit Tab ───────────────────────────────────────────────────────────────

function AuditTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAuditLog(100, actionFilter || undefined);
      setEntries(res.entries || res.logs || []);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить audit-log');
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Фильтр по action (опционально)">
        <input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="prompt_update, ..."
          style={styles.input}
        />
      </Field>
      <SecondaryButton onClick={load} full>Применить / Обновить</SecondaryButton>

      {loading && <LoadingNote>Загружаем audit-log...</LoadingNote>}
      {error   && <ErrorBlock message={error} onRetry={load} />}
      {!loading && !error && entries.length === 0 && <EmptyNote>Audit-log пуст.</EmptyNote>}

      {entries.map((e) => (
        <Card key={e.id} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-accent)' }}>{e.action}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.created_at}</span>
          </div>
          {e.ip && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              IP: {e.ip}
            </div>
          )}
          {e.details && (
            <details>
              <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Подробнее
              </summary>
              <pre style={styles.testRaw}>{tryPretty(e.details)}</pre>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

function tryPretty(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw; }
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

function LoadingNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{children}</div>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{children}</div>;
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ padding: 12, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--status-negative)', fontSize: 13 }}>
        {message}
      </div>
      <SecondaryButton onClick={onRetry} full>Повторить</SecondaryButton>
    </div>
  );
}

function statusColor(s: number): string {
  if (s >= 500) return 'var(--status-negative)';
  if (s >= 400) return 'var(--status-warning)';
  return 'var(--status-positive)';
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    paddingTop: 'calc(var(--safe-top) + 16px)',
    paddingBottom: 'calc(var(--safe-bottom) + 40px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px 12px',
  },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: 6,
    background: 'var(--accent-soft)',
    color: 'var(--text-accent)',
    letterSpacing: 0.4,
  },

  tabs: {
    display: 'flex',
    gap: 6,
    padding: '0 20px',
    overflowX: 'auto',
    marginBottom: 16,
  },
  tab: {
    border: '1px solid',
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 120ms, color 120ms',
  },

  content: { padding: '0 20px' },

  noAccessWrap: { padding: '60px 24px 40px', textAlign: 'center' },
  noAccessIcon: { display: 'inline-flex', marginBottom: 16, opacity: 0.6 },
  noAccessTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' },
  noAccessText: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },

  promptListRow: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    paddingBottom: 4,
  },
  promptChip: {
    border: '1px solid',
    borderRadius: 20,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    maxWidth: 200,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  textarea: {
    width: '100%',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.4,
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  input: {
    width: '100%',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: '10px 12px',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 14,
  },
  modelOption: {
    border: '1px solid',
    borderRadius: 8,
    padding: 10,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    wordBreak: 'break-all',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  divider: {
    height: 1,
    background: 'var(--border-subtle)',
    margin: '4px 0',
  },
  testResult: {
    padding: 12,
    borderRadius: 10,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
  },
  testRaw: {
    margin: 0,
    fontSize: 11,
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    maxHeight: 240,
    overflowY: 'auto',
  },
};
