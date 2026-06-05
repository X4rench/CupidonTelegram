// ═══════════════════════════════════════════════════════════════
// Список типажей девушек — единый для Wing/Simulator/CreateGirl.
// Используется как hint для AI-анализа в Стреле.
//
// MAX_TYPAZHES = 5 — нельзя выбрать больше 5 (UX-ограничение из RN).
// ═══════════════════════════════════════════════════════════════

export const MAX_TYPAZHES = 5;

export const TYPAZHES: string[] = [
  'Скромная',
  'Весёлая',
  'Дерзкая',
  'Загадочная',
  'Интеллектуалка',
  'Спортивная',
  'Творческая',
  'Романтичная',
  'Практичная',
  'Стервозная',
  'Тусовщица',
  'Меланхоличная',
  'Альфа',
  'Заботливая',
  'Эмоциональная',
  'Пошлая',
];

export function csvToList(s: string | null | undefined): string[] {
  if (!s) return [];
  return String(s).split(',').map(x => x.trim()).filter(Boolean);
}

export function listToCsv(arr: string[] | null | undefined): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.join(',');
}

// ── Phase G: Simulator — расширенные типажи + места ─────────────────────────

export interface SimTypazh {
  name: string;
  sub: string;
  color: string; // префикс 'rgba(R,G,B' — закрывающую часть рисуем сами
}

export const TYPAZHES_SIM: SimTypazh[] = [
  { name: 'Скромная',       sub: 'Отвечает коротко',         color: 'rgba(244,63,94' },
  { name: 'Весёлая',        sub: 'Шутит и смеётся',          color: 'rgba(251,191,36' },
  { name: 'Дерзкая',        sub: 'Тестирует и подкалывает',  color: 'rgba(239,68,68' },
  { name: 'Загадочная',     sub: 'Отвечает намёками',        color: 'rgba(139,92,246' },
  { name: 'Интеллектуалка', sub: 'Глубокие темы',            color: 'rgba(59,130,246' },
  { name: 'Спортивная',     sub: 'Активная, прямая',         color: 'rgba(16,185,129' },
  { name: 'Творческая',     sub: 'Мыслит образами',          color: 'rgba(168,85,247' },
  { name: 'Романтичная',    sub: 'Любит чувства',            color: 'rgba(236,72,153' },
  { name: 'Практичная',     sub: 'Хочет ясности',            color: 'rgba(120,113,108' },
  { name: 'Стервозная',     sub: 'Холодная и колкая',        color: 'rgba(225,29,72' },
  { name: 'Тусовщица',      sub: 'Живёт вечеринками',        color: 'rgba(245,158,11' },
  { name: 'Меланхоличная',  sub: 'Тонкая и грустная',        color: 'rgba(99,102,241' },
  { name: 'Альфа',          sub: 'Сама ведёт',               color: 'rgba(124,58,237' },
  { name: 'Заботливая',     sub: 'Тёплая и мягкая',          color: 'rgba(20,184,166' },
  { name: 'Эмоциональная',  sub: 'Бурная и живая',           color: 'rgba(217,70,239' },
  { name: 'Пошлая',         sub: 'Игривая, без табу',        color: 'rgba(219,39,119' },
];

export const CUSTOM_PLACE_ID = 'custom';

export interface PlaceOpt {
  id: string;
  label: string;
}

export const PLACES_DEFAULT: PlaceOpt[] = [
  { id: 'Twinby', label: 'Twinby' },
  { id: 'Mamba', label: 'Mamba' },
  { id: 'Pure', label: 'Pure' },
  { id: 'VK', label: 'VK' },
  { id: 'Instagram', label: 'Instagram' },
  { id: 'gym', label: 'Спортзал' },
  { id: 'cafe', label: 'Кафе' },
  { id: 'street', label: 'Улица' },
  { id: 'beach', label: 'Пляж' },
  { id: 'uni', label: 'Универ' },
  { id: 'driving', label: 'За рулём' },
  { id: 'shop', label: 'Магазин' },
  { id: CUSTOM_PLACE_ID, label: 'Своё место' },
];

/** Найти SimTypazh по имени (для восстановления цвета в чате). */
export function findSimTypazhByName(name: string): SimTypazh | undefined {
  return TYPAZHES_SIM.find(t => t.name === name);
}

/**
 * Очистить имя типажа от служебного мусора, которое могло попасть в
 * localStorage (старые версии, регрессии). Убираем:
 *   - ведущие/висящие подчёркивания
 *   - ведущие цифры с пробелом ("0 Скромная" → "Скромная")
 *   - ведущие "0" без разделителя если дальше идёт буква ("0Скромная" → "Скромная")
 * Если строка после чистки пустая — возвращаем fallback 'AI'.
 *
 * Используется в SimulatorChatScreen / AllDialogsScreen / SimulatorScreen
 * чтобы не показывать «0 Скромная» если в старой записи storage остался
 * грязный typazhKey.
 */
export function cleanTypazhName(raw: string | null | undefined): string {
  if (!raw) return 'AI';
  let s = String(raw).trim();
  // Убираем ведущие/завершающие подчёркивания
  s = s.replace(/^_+|_+$/g, '');
  // "0 Имя" / "0Имя" → "Имя"
  s = s.replace(/^\d+\s*(?=[A-Za-zА-Яа-яЁё])/, '');
  // На всякий случай повторный trim
  s = s.trim();
  return s || 'AI';
}
