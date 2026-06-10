// ═══════════════════════════════════════════════════════════════
// TutorialIcons — набор SVG-иконок для слайдов туториала.
// Каждая иконка принимает accent/accent2 от слайда — основной
// шейп заполняется градиентом этих цветов, белые детали поверх.
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties } from 'react';

interface IconProps {
  accent: string;
  accent2: string;
  size?: number;
  style?: CSSProperties;
}

const DEFAULT_SIZE = 120;
const DEFAULT_STYLE: CSSProperties = {
  filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.28))',
};

// ── 1. Target — Стрела (анализ переписки) ────────────────────────
export function TargetIcon({ accent, accent2, size = DEFAULT_SIZE, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      style={{ ...DEFAULT_STYLE, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ti-target-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
        <linearGradient id="ti-target-arrow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>
      </defs>

      {/* Концентрические кольца мишени */}
      <circle cx="55" cy="55" r="46" fill="none" stroke="url(#ti-target-g)" strokeWidth="3" opacity="0.28" />
      <circle cx="55" cy="55" r="34" fill="none" stroke="url(#ti-target-g)" strokeWidth="3" opacity="0.55" />
      <circle cx="55" cy="55" r="22" fill="none" stroke="url(#ti-target-g)" strokeWidth="3" opacity="0.85" />

      {/* Яблочко (центр) */}
      <circle cx="55" cy="55" r="9" fill="url(#ti-target-g)" />

      {/* Стрела (поворот 45° — летит из верхнего левого угла в центр) */}
      <g transform="translate(55 55) rotate(45)">
        {/* Наконечник (касается яблочка) */}
        <path d="M2,0 L-9,-7 L-9,7 Z" fill="url(#ti-target-arrow)" />
        {/* Древко */}
        <line x1="-9" y1="0" x2="-42" y2="0" stroke="url(#ti-target-arrow)" strokeWidth="4" strokeLinecap="round" />
        {/* Оперение */}
        <path d="M-42,0 L-50,-6 L-50,6 Z" fill="url(#ti-target-arrow)" opacity="0.7" />
        <line x1="-46" y1="-5" x2="-46" y2="5" stroke="url(#ti-target-arrow)" strokeWidth="2" opacity="0.55" />
      </g>
    </svg>
  );
}

// ── 2. Chat — Симулятор знакомства ───────────────────────────────
export function ChatIcon({ accent, accent2, size = DEFAULT_SIZE, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      style={{ ...DEFAULT_STYLE, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ti-chat-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
      </defs>

      {/* Задний пузырь (белый, "от собеседницы") */}
      <path
        d="
          M60,18
          L94,18
          Q100,18 100,24
          L100,48
          Q100,54 94,54
          L78,54
          L70,64
          L72,54
          L60,54
          Q54,54 54,48
          L54,24
          Q54,18 60,18
          Z
        "
        fill="#ffffff"
        opacity="0.92"
      />
      {/* Точки внутри заднего пузыря */}
      <circle cx="66" cy="36" r="2.5" fill="url(#ti-chat-g)" />
      <circle cx="77" cy="36" r="2.5" fill="url(#ti-chat-g)" />
      <circle cx="88" cy="36" r="2.5" fill="url(#ti-chat-g)" />

      {/* Передний пузырь (градиент, "твой ответ") */}
      <path
        d="
          M18,44
          L48,44
          Q54,44 54,50
          L54,76
          Q54,82 48,82
          L36,82
          L28,92
          L30,82
          L18,82
          Q12,82 12,76
          L12,50
          Q12,44 18,44
          Z
        "
        fill="url(#ti-chat-g)"
      />
      {/* Сердечко внутри переднего пузыря */}
      <path
        d="M33,73 C26,68 22,64 22,60 C22,57 24,55 27,55 C29,55 31,56 33,58 C35,56 37,55 39,55 C42,55 44,57 44,60 C44,64 40,68 33,73 Z"
        fill="#ffffff"
        opacity="0.95"
      />
    </svg>
  );
}

// ── 3. Sparkle — Первое сообщение ────────────────────────────────
export function SparkleIcon({ accent, accent2, size = DEFAULT_SIZE, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      style={{ ...DEFAULT_STYLE, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ti-sparkle-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
      </defs>

      {/* Основная "Anthropic-style" 4-конечная искра */}
      <path
        d="
          M55,10
          C57,38 70,51 98,53
          C70,55 57,68 55,96
          C53,68 40,55 12,53
          C40,51 53,38 55,10
          Z
        "
        fill="url(#ti-sparkle-g)"
      />

      {/* Маленькая искра справа-сверху */}
      <path
        d="
          M88,16
          C89,25 92,28 101,29
          C92,30 89,33 88,42
          C87,33 84,30 75,29
          C84,28 87,25 88,16
          Z
        "
        fill="#ffffff"
        opacity="0.96"
      />

      {/* Маленькая искра слева-снизу */}
      <path
        d="
          M20,76
          C21,82 23,84 29,85
          C23,86 21,88 20,94
          C19,88 17,86 11,85
          C17,84 19,82 20,76
          Z
        "
        fill="#ffffff"
        opacity="0.86"
      />
    </svg>
  );
}

// ── 4. Shield — Разбор отказа ────────────────────────────────────
export function ShieldIcon({ accent, accent2, size = DEFAULT_SIZE, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      style={{ ...DEFAULT_STYLE, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ti-shield-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
      </defs>

      {/* Контур щита */}
      <path
        d="
          M55,10
          L84,22
          Q89,24 89,30
          L89,56
          Q89,78 55,98
          Q21,78 21,56
          L21,30
          Q21,24 26,22
          Z
        "
        fill="url(#ti-shield-g)"
      />

      {/* Внутренний блик (легче сверху) */}
      <path
        d="
          M55,18
          L78,28
          Q81,29 81,33
          L81,52
          Q81,68 55,84
          Q29,68 29,52
          L29,33
          Q29,29 32,28
          Z
        "
        fill="#ffffff"
        opacity="0.12"
      />

      {/* Сердечко внутри щита */}
      <path
        d="
          M55,72
          C44,62 33,54 33,44
          C33,38 38,33 44,33
          C48,33 52,35 55,39
          C58,35 62,33 66,33
          C72,33 77,38 77,44
          C77,54 66,62 55,72
          Z
        "
        fill="#ffffff"
        opacity="0.95"
      />
    </svg>
  );
}

// ── 5. Book — Теория и сообщество ────────────────────────────────
export function BookIcon({ accent, accent2, size = DEFAULT_SIZE, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 110 110"
      style={{ ...DEFAULT_STYLE, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ti-book-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
      </defs>

      {/* Обложка (фон) */}
      <path
        d="
          M14,22
          Q14,16 20,16
          L90,16
          Q96,16 96,22
          L96,90
          Q96,96 90,96
          L20,96
          Q14,96 14,90
          Z
        "
        fill="url(#ti-book-g)"
      />

      {/* Левая страница */}
      <path
        d="
          M22,28
          L52,28
          L52,86
          Q40,82 22,84
          Z
        "
        fill="#ffffff"
        opacity="0.96"
      />

      {/* Правая страница */}
      <path
        d="
          M58,28
          L88,28
          L88,84
          Q70,82 58,86
          Z
        "
        fill="#ffffff"
        opacity="0.86"
      />

      {/* Строки текста — левая */}
      <line x1="27" y1="40" x2="47" y2="40" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      <line x1="27" y1="48" x2="47" y2="48" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      <line x1="27" y1="56" x2="42" y2="56" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
      <line x1="27" y1="64" x2="45" y2="64" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.35" strokeLinecap="round" />

      {/* Строки текста — правая */}
      <line x1="63" y1="40" x2="83" y2="40" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      <line x1="63" y1="48" x2="83" y2="48" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      <line x1="63" y1="56" x2="78" y2="56" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.4" strokeLinecap="round" />
      <line x1="63" y1="64" x2="80" y2="64" stroke="url(#ti-book-g)" strokeWidth="2" opacity="0.35" strokeLinecap="round" />

      {/* Подсветка корешка */}
      <line x1="55" y1="22" x2="55" y2="92" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />

      {/* Закладка-ленточка */}
      <path
        d="M76,16 L76,38 L82,32 L88,38 L88,16 Z"
        fill="#ffffff"
        opacity="0.92"
      />
    </svg>
  );
}
