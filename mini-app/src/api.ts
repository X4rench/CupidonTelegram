// ═══════════════════════════════════════════════════════════════
// API клиент — все запросы к бэкенду.
// Авторизация: Authorization: tma <initDataRaw>.
// Без device_id/session_token (как было в RN-версии).
// ═══════════════════════════════════════════════════════════════
import { getInitDataRaw } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

const PER_ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500, 3000];

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: any;
  constructor(status: number, message: string, code?: string, body?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Получить СВЕЖИЙ initData перед каждым запросом.
 * TG может обновлять initData в течение сессии (особенно после re-open Mini App).
 * Если кешировать раз при загрузке — старый initData может протухнуть и HMAC
 * не сойдётся на бэке → 401 INVALID_HMAC.
 */
function getFreshInitData(): string | null {
  // Сначала пробуем window.Telegram.WebApp.initData (самый свежий)
  try {
    const live = (window as any)?.Telegram?.WebApp?.initData;
    if (live && typeof live === 'string' && live.length > 0) {
      return live;
    }
  } catch (_) { /* fall through */ }
  // Fallback на кеш из auth.ts
  return getInitDataRaw();
}

export async function fetchAuthed<T = any>(path: string, init?: RequestInit & { _retried?: boolean }): Promise<T> {
  const initDataRaw = getFreshInitData();
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(initDataRaw ? { 'Authorization': `tma ${initDataRaw}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  let lastError: any;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const err = new ApiError(res.status, data?.error || `HTTP ${res.status}`, data?.code, data);
        // Сервер 5xx — попробовать ещё раз
        if (res.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
          lastError = err;
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw err;
      }
      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);

      // Если уже ApiError — не ретраим
      if (err instanceof ApiError) throw err;

      if (attempt < MAX_ATTEMPTS - 1) {
        lastError = err;
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }

      const msg = err.name === 'AbortError'
        ? 'Превышено время ожидания. Проверь интернет и попробуй снова.'
        : `Сеть недоступна: ${err.message}`;
      throw new Error(msg);
    }
  }
  throw lastError || new Error('Не удалось выполнить запрос');
}

// ── Конкретные endpoints (расширяется в Phase C-G по мере портирования) ──────

export interface UserProfile {
  name?: string;
  age?: string;
  experience?: string;
  platforms?: string[];
  [k: string]: any;
}

export interface MeUser {
  telegram_user_id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  tier: 'free' | 'basic' | 'premium';
  sub_expires_at?: string | null;
  daily_used?: number;
  daily_limit?: number;
  onboarding_done?: boolean;
  questionnaire_done?: boolean;
  tutorial_done?: boolean;
  user_profile?: UserProfile | null;
  requests_count?: number;
  simulations_count?: number;
  tg_bonus_claimed?: boolean;
  is_admin?: boolean;
  created_at?: string;
}

export interface MeResponse {
  ok: boolean;
  user: MeUser;
  is_new?: boolean;
}

export interface StatsResponse {
  ok: boolean;
  stats: {
    requests: number;
    simulations: number;
    avg_score: number | null;
    days_in_app: number;
    tier?: 'free' | 'basic' | 'premium';
    daily_used?: number;
    daily_limit?: number;
  };
}

export async function getMe(): Promise<MeResponse> {
  return fetchAuthed<MeResponse>('/users/me');
}

/** Обновить профиль (анкета онбординга). Любые поля — опциональные. */
export async function updateMe(payload: {
  user_profile?: UserProfile;
  onboarding_done?: boolean;
  questionnaire_done?: boolean;
  tutorial_done?: boolean;
}): Promise<MeResponse> {
  return fetchAuthed<MeResponse>('/users/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** Статистика юзера: requests, simulations, avg_score, days_in_app. */
export async function getStats(): Promise<StatsResponse> {
  return fetchAuthed<StatsResponse>('/users/stats');
}

/** Подписка/лимиты — для Paywall (Phase H). */
export async function getSubscription(): Promise<any> {
  return fetchAuthed<any>('/users/subscription');
}

/** +5 бесплатных генераций за подписку на TG-канал. */
export async function claimTgBonus(): Promise<{ ok: boolean; bonus_quota: number; total_quota: number }> {
  return fetchAuthed('/users/claim-tg-bonus', { method: 'POST' });
}

/** Удалить аккаунт. Требует confirm string. */
export async function deleteMe(): Promise<{ ok: boolean; message?: string }> {
  return fetchAuthed('/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
  });
}

// ── Phase G: Simulator / CreateGirl / FirstMessage / Rejection / Support ─────

export interface SimulatorStartResp {
  ok: boolean;
  session_id: string;
  opening_message?: string;
}
export interface SimulatorMessageResp {
  ok: boolean;
  response: string;
}
export interface SimulatorFinishResp {
  ok: boolean;
  result: {
    score: number;
    summary?: string;
    tip?: string;
    strengths?: string[];
    improvements?: string[];
    [k: string]: any;
  } | null;
}
export interface SimulatorAnalyzeResp {
  ok: boolean;
  result: {
    engagement?: number;
    interest?: number;
    quality?: number;
    recommendation?: string;
    [k: string]: any;
  } | null;
}
export interface SimulatorHintsResp {
  ok: boolean;
  hints: { type: string; text: string }[];
}

/** Стартануть новую сессию симулятора. */
export async function startSimulator(payload: {
  typazh: string;
  place: string;
  difficulty?: number;
}): Promise<SimulatorStartResp> {
  return fetchAuthed<SimulatorStartResp>('/simulator/start', {
    method: 'POST',
    body: JSON.stringify({
      typazh: payload.typazh,
      place: payload.place,
      difficulty: payload.difficulty ?? 5,
    }),
  });
}

/** Отправить сообщение в чат-симулятор. */
export async function sendSimulatorMessage(payload: {
  sessionId: string;
  message: string;
}): Promise<SimulatorMessageResp> {
  return fetchAuthed<SimulatorMessageResp>('/simulator/message', {
    method: 'POST',
    body: JSON.stringify({ session_id: payload.sessionId, message: payload.message }),
  });
}

/** Завершить симуляцию и получить разбор. */
export async function finishSimulator(payload: { sessionId: string }): Promise<SimulatorFinishResp> {
  return fetchAuthed<SimulatorFinishResp>('/simulator/finish', {
    method: 'POST',
    body: JSON.stringify({ session_id: payload.sessionId }),
  });
}

/** AI-Girl chat (CreateGirl-сценарий). */
export async function sendAiGirlMessage(payload: {
  sessionId: string;
  message: string;
  girlProfile: Record<string, any>;
}): Promise<SimulatorMessageResp> {
  return fetchAuthed<SimulatorMessageResp>('/simulator/ai-girl', {
    method: 'POST',
    body: JSON.stringify({
      session_id: payload.sessionId,
      message: payload.message,
      girl_profile: payload.girlProfile,
    }),
  });
}

/** Mid-chat analysis. */
export async function analyzeSimulator(payload: { sessionId: string }): Promise<SimulatorAnalyzeResp> {
  return fetchAuthed<SimulatorAnalyzeResp>('/simulator/analyze', {
    method: 'POST',
    body: JSON.stringify({ session_id: payload.sessionId }),
  });
}

/** Подсказки для текущего момента диалога. */
export async function getSimulatorHints(payload: { sessionId: string }): Promise<SimulatorHintsResp> {
  return fetchAuthed<SimulatorHintsResp>('/simulator/hints', {
    method: 'POST',
    body: JSON.stringify({ session_id: payload.sessionId }),
  });
}

/** Сгенерировать первое сообщение (3 варианта). */
export async function generateFirstMessage(payload: {
  girlName?: string;
  tags?: string[];
  profileText: string;
}): Promise<{ ok: boolean; messages: (string | { text: string; tone?: string; hook?: string })[] }> {
  return fetchAuthed('/first-message/generate', {
    method: 'POST',
    body: JSON.stringify({
      girl_name: payload.girlName ?? null,
      tags: payload.tags ?? [],
      profile_text: payload.profileText,
    }),
  });
}

/** Разбор отказа. */
export async function analyzeRejection(payload: { text: string }): Promise<{ ok: boolean; result: any }> {
  return fetchAuthed('/analysis/rejection', {
    method: 'POST',
    body: JSON.stringify({ text: payload.text }),
  });
}

/** Поддержи её. */
export async function generateSupport(payload: {
  situationText: string;
  tags?: string[];
  withContext?: boolean;
}): Promise<{ ok: boolean; responses: { level?: string; text: string }[] }> {
  return fetchAuthed('/analysis/support', {
    method: 'POST',
    body: JSON.stringify({
      situation_text: payload.situationText,
      tags: payload.tags ?? [],
      with_context: payload.withContext ?? false,
    }),
  });
}

// ── Contacts API ─────────────────────────────────────────────────────────────

export interface Contact {
  id: number;
  name: string;
  typazh?: string | null;
  photo_uri?: string | null;
  notes?: string | null;
  pinned?: boolean;
  [k: string]: any;
}

export const contactsApi = {
  getAll: () => fetchAuthed<{ ok: boolean; contacts: Contact[] }>('/contacts'),
  create: (data: { name: string; typazh?: string | null; photo_uri?: string | null }) =>
    fetchAuthed<{ ok: boolean; contact: Contact }>('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        typazh: data.typazh ?? null,
        photo_uri: data.photo_uri ?? null,
      }),
    }),
  update: (id: number, data: Partial<Contact>) =>
    fetchAuthed<{ ok: boolean; contact: Contact }>(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: data.name ?? null,
        typazh: data.typazh ?? null,
        photo_uri: data.photo_uri ?? null,
        notes: data.notes ?? null,
      }),
    }),
  pin: (id: number) =>
    fetchAuthed<{ ok: boolean }>(`/contacts/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({}),
    }),
  delete: (id: number) =>
    fetchAuthed<{ ok: boolean }>(`/contacts/${id}`, { method: 'DELETE' }),
};

// ── Phase F: Wing analysis / History / Polls ────────────────────────────────

export interface WingResponse {
  text: string;
  why?: string;
  badge?: string;
  variant?: string;
}

export interface WingSignal {
  type: 'positive' | 'warning' | 'negative';
  text: string;
}

export interface WingMediaHint {
  type?: 'circle' | 'voice';
  reason?: string;
  what_to_say?: string;
}

export interface WingResult {
  score: number | null;
  mood: 'positive' | 'warning' | 'negative' | null;
  responses: WingResponse[];
  summary: string;
  signals?: WingSignal[];
  engagement?: number;
  sentiment?: number;
  trust?: number;
  strategy?: string;
  girl_typazh_description?: string;
  media_hint?: WingMediaHint;
  is_quick_reply?: boolean;
}

export interface WingApiResponse {
  ok: boolean;
  result: WingResult;
  contact_typazh?: string | null;
}

const QUICK_REPLY_THRESHOLD = 50;

function buildNowTime(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Анализ переписки (Стрела). Если text короткий и нет контекста/contactId/typazh —
 * автоматически роутится на quick-reply (5 коротких реплик, дёшево).
 */
export async function analyzeWing(params: {
  text: string;
  withContext?: boolean;
  contactId?: string | number | null;
  typazhHint?: string | null;
  forceFull?: boolean;
  user_profile?: UserProfile | null;
}): Promise<WingApiResponse> {
  const { text, withContext = false, contactId = null, typazhHint = null, forceFull = false, user_profile = null } = params;
  const trimmed = (text || '').trim();
  const hasHint = typeof typazhHint === 'string' && typazhHint.trim().length > 0;

  if (!forceFull && !hasHint && trimmed.length > 0 && trimmed.length < QUICK_REPLY_THRESHOLD && !withContext && !contactId) {
    const res = await fetchAuthed<{ ok: boolean; replies?: { text: string }[] }>('/analysis/quick-reply', {
      method: 'POST',
      body: JSON.stringify({ last_message: trimmed, user_profile }),
    });
    return {
      ok: !!res.ok,
      result: {
        score: null,
        mood: null,
        responses: (res.replies || []).map(r => ({ text: r.text || '', why: '' })),
        summary: '',
        is_quick_reply: true,
      },
    };
  }

  return fetchAuthed<WingApiResponse>('/analysis/wing', {
    method: 'POST',
    body: JSON.stringify({
      text,
      with_context: withContext,
      contact_id: contactId,
      user_profile,
      now_time: buildNowTime(),
      typazh_hint: hasHint ? typazhHint!.trim() : null,
    }),
  });
}

export interface HistorySession {
  date?: string;
  summary?: string;
  score?: number | null;
  mood?: string | null;
  [k: string]: any;
}

export async function getAnalysisHistory(): Promise<{ ok: boolean; sessions: HistorySession[] }> {
  return fetchAuthed('/analysis/history');
}

// ── Polls (daily poll для Theory→Лента) ──────────────────────────────────────

export interface DailyPoll {
  id: number | string;
  question: string;
  option_a: string;
  option_b: string;
  votes?: { a: number; b: number };
  result_a?: string;
  result_b?: string;
}

export interface PollResponse {
  ok: boolean;
  poll: DailyPoll;
  user_vote?: 0 | 1 | null;
}

export async function getDailyPoll(): Promise<PollResponse> {
  return fetchAuthed<PollResponse>('/polls/today');
}

export async function votePoll(pollId: number | string, choice: 0 | 1): Promise<{
  ok: boolean;
  votes: { a: number; b: number };
  result?: { a: string; b: string };
  result_a?: string;
  result_b?: string;
}> {
  return fetchAuthed(`/polls/${pollId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ choice }),
  });
}

// ── Phase H: Stars-платежи и промокоды ───────────────────────────────────────

export type StarsPlan = 'basic' | 'premium' | 'day_pass';

export interface StarsInvoiceResponse {
  ok: boolean;
  invoice_url: string;
  plan: StarsPlan;
  amount: number;
}

/**
 * Создать invoice link для Telegram Stars.
 * Возвращает t.me/$invoice/... URL — открывать через WebApp.openInvoice(url, callback).
 */
export async function createStarsInvoice(plan: StarsPlan): Promise<StarsInvoiceResponse> {
  return fetchAuthed<StarsInvoiceResponse>('/payments/invoice', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export interface StarsPricesResponse {
  ok: boolean;
  currency: string;             // 'XTR'
  prices: Record<StarsPlan, number>;
  titles: Record<StarsPlan, string>;
  descriptions: Record<StarsPlan, string>;
}

/** Получить актуальные цены тарифов в Stars (XTR). */
export async function getStarsPrices(): Promise<StarsPricesResponse> {
  return fetchAuthed<StarsPricesResponse>('/payments/prices');
}

// ── ЮКасса — оплата картой (Phase I) ────────────────────────────────────────

export interface YookassaInvoiceResponse {
  ok: boolean;
  confirmation_url?: string;
  payment_id?: string;
  error?: string;
}

/**
 * Создать ЮКасса-платёж и получить confirmation_url для открытия в TG WebView.
 * После успешной оплаты webhook ЮКассы активирует подписку асинхронно —
 * фронт делает polling /users/subscription пока tier не сменится с free.
 */
export async function createYookassaInvoice(plan: StarsPlan): Promise<YookassaInvoiceResponse> {
  return fetchAuthed<YookassaInvoiceResponse>('/payments/yookassa/invoice', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export interface PromoApplyResponse {
  ok: boolean;
  code?: string;
  applied?: {
    kind: 'bonus_quota' | 'sub_trial';
    added?: number;             // bonus_quota
    plan?: string;              // sub_trial
    days?: number;              // sub_trial
    expires_at?: string;        // sub_trial
  };
  error?: string;
}

/** Применить промокод. На success — useMe().refresh() чтобы обновить тир/квоты. */
export async function applyPromo(code: string): Promise<PromoApplyResponse> {
  return fetchAuthed<PromoApplyResponse>('/promo/apply', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ── Phase J: Admin API ──────────────────────────────────────────────────────
// Все endpoint'ы /admin/* пускают только telegram_user_id из ADMIN_TELEGRAM_IDS
// на бэке (см. middleware/auth.js → requireAdminAny). Для TMA это работает
// прозрачно — initData уже в headers через fetchAuthed.

export interface AdminPrompt {
  id: number;
  key: string;
  name: string;
  description?: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: number | boolean;
  updated_at?: string;
}

export interface AdminPromptsResp { ok: boolean; prompts: AdminPrompt[] }
export interface AdminPromptResp  { ok: boolean; prompt: AdminPrompt }

export interface AdminStats {
  users: number;
  analyses: number;
  simulations: number;
  rejections?: number;
  avg_score: number | null;
  requests_today: number;
  paid_subs?: number;
}
export interface AdminStatsResp { ok: boolean; stats: AdminStats; recent_users?: any[] }

export interface AdminRequestLog {
  id: number;
  endpoint: string;
  method: string;
  response_status: number;
  duration_ms: number;
  device_id?: string;
  created_at: string;
}
export interface AdminLogsResp { ok: boolean; logs: AdminRequestLog[] }

export interface AdminAuditEntry {
  id: number;
  action: string;
  ip?: string;
  user_agent?: string;
  details?: string;
  created_at: string;
}
export interface AdminAuditResp { ok: boolean; entries?: AdminAuditEntry[]; logs?: AdminAuditEntry[] }

export interface AdminModelsResp {
  ok: boolean;
  models: { primary?: string; fallback?: string; [k: string]: any };
}

export interface AdminPromptTestResp {
  ok: boolean;
  raw?: string;
  parsed?: any;
  model?: string;
  usage?: any;
  duration_ms: number;
  error?: string;
}

export const adminApi = {
  getPrompts:  () => fetchAuthed<AdminPromptsResp>('/admin/prompts'),
  getPrompt:   (id: number | string) => fetchAuthed<AdminPromptResp>(`/admin/prompts/${id}`),
  updatePrompt: (id: number | string, payload: Partial<Pick<AdminPrompt, 'name' | 'system_prompt' | 'model' | 'temperature' | 'max_tokens' | 'is_active' | 'description'>>) =>
    fetchAuthed<AdminPromptResp>(`/admin/prompts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  testPrompt: (payload: {
    prompt_id?: number | string;
    system_prompt?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    test_input: string;
    variables?: Record<string, any>;
  }) =>
    fetchAuthed<AdminPromptTestResp>('/admin/prompts/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getStats:    () => fetchAuthed<AdminStatsResp>('/admin/stats'),
  getLogs:     (limit = 100) => fetchAuthed<AdminLogsResp>(`/admin/logs?limit=${limit}`),
  getAuditLog: (limit = 100, action?: string) =>
    fetchAuthed<AdminAuditResp>(`/admin/audit-log?limit=${limit}${action ? `&action=${encodeURIComponent(action)}` : ''}`),
  getModels:   () => fetchAuthed<AdminModelsResp>('/admin/models'),

  // Управление подписками по TG ID
  findUser: (tgId: number | string) =>
    fetchAuthed<{ ok: boolean; user: any; active_subscription: any | null; error?: string }>(`/admin/users/${tgId}`),
  grantSubscription: (tgId: number | string, plan: 'basic' | 'premium' | 'day_pass', days: number) =>
    fetchAuthed<{ ok: boolean; plan: string; days: number; expires_at: string; error?: string }>(
      `/admin/users/${tgId}/grant-subscription`,
      { method: 'POST', body: JSON.stringify({ plan, days }) },
    ),
  revokeSubscription: (tgId: number | string) =>
    fetchAuthed<{ ok: boolean; revoked?: { plan: string; was_expires: string }; error?: string }>(
      `/admin/users/${tgId}/revoke-subscription`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};
