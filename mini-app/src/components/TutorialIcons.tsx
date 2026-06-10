// ═══════════════════════════════════════════════════════════════
// TutorialIcons — SVG-иконки для слайдов туториала.
// Кастомные шейпы с градиентами + ненавязчивая SMIL-анимация
// (работает на iOS WebKit и Android Chrome без CSS keyframes).
// Каждая иконка живёт сама по себе: разные дюрации, разные
// фазы — общий ритм не выглядит механическим.
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties } from 'react';

interface IconProps {
  accent: string;
  accent2: string;
  size?: number;
  style?: CSSProperties;
}

const DEFAULT_SIZE = 130;
const DEFAULT_STYLE: CSSProperties = {
  filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.28))',
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
        <radialGradient id="ti-target-bullseye" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Внешнее кольцо с рисками */}
      <g opacity="0.32">
        <circle cx="55" cy="55" r="48" fill="none" stroke="url(#ti-target-g)" strokeWidth="2.5" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <line
            key={a}
            x1="55" y1="3" x2="55" y2="9"
            stroke="url(#ti-target-g)"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${a} 55 55)`}
          />
        ))}
      </g>

      {/* Среднее кольцо */}
      <circle cx="55" cy="55" r="36" fill="none" stroke="url(#ti-target-g)" strokeWidth="3" opacity="0.58" />

      {/* Внутреннее кольцо */}
      <circle cx="55" cy="55" r="22" fill="none" stroke="url(#ti-target-g)" strokeWidth="3" opacity="0.88" />

      {/* Тонкие хайрлайны крест-накрест (прицел) */}
      <g stroke="url(#ti-target-g)" strokeWidth="1" opacity="0.22">
        <line x1="55" y1="32" x2="55" y2="78" />
        <line x1="32" y1="55" x2="78" y2="55" />
      </g>

      {/* Пульсирующее яблочко */}
      <circle cx="55" cy="55" r="11" fill="url(#ti-target-g)">
        <animate attributeName="r" values="10;11.6;10" dur="2.6s" repeatCount="indefinite" />
      </circle>
      {/* Блик на яблочке */}
      <ellipse cx="52" cy="52" rx="5" ry="3.5" fill="url(#ti-target-bullseye)" transform="rotate(-20 52 52)" />

      {/* Стрела */}
      <g transform="translate(55 55) rotate(45)">
        {/* Наконечник */}
        <path d="M3,0 L-9,-7 L-7,0 L-9,7 Z" fill="#ffffff" />
        <path d="M3,0 L-9,-7 L-7,0 Z" fill="#ffffff" opacity="0.85" />
        {/* Древко с подсветкой */}
        <rect x="-43" y="-1.6" width="34" height="3.2" fill="#ffffff" rx="1.6" />
        <rect x="-43" y="-1.6" width="34" height="1" fill="#ffffff" opacity="0.5" rx="0.5" />
        {/* Оперение — 4 пера, разные оттенки */}
        <path d="M-43,0 L-52,-6 L-47,-2 Z" fill="#ffffff" opacity="0.95" />
        <path d="M-43,0 L-52,6 L-47,2 Z" fill="#ffffff" opacity="0.7" />
        <path d="M-43,-1 L-50,-2 L-46,0 Z" fill="#ffffff" opacity="0.55" />
        <path d="M-43,1 L-50,2 L-46,0 Z" fill="#ffffff" opacity="0.55" />
        {/* Нок (хвостовик стрелы) */}
        <rect x="-44" y="-1.6" width="2.5" height="3.2" fill={accent2} opacity="0.6" rx="0.5" />
      </g>

      {/* Искры от попадания */}
      <g transform="translate(55 55)">
        <g opacity="0.9">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite" />
          <path d="M0,-18 L1.2,-13 L0,-12 L-1.2,-13 Z" fill="#ffffff" />
        </g>
        <g opacity="0.7">
          <animate attributeName="opacity" values="0.3;0.95;0.3" dur="2.1s" begin="0.4s" repeatCount="indefinite" />
          <path d="M16,2 L11,1 L10,2 L11,3 Z" fill="#ffffff" />
        </g>
        <g opacity="0.7">
          <animate attributeName="opacity" values="0.3;0.85;0.3" dur="2.4s" begin="0.9s" repeatCount="indefinite" />
          <path d="M-15,-3 L-10,-2 L-9,-3 L-10,-4 Z" fill="#ffffff" />
        </g>
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
        <linearGradient id="ti-chat-bubble-shine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.78" />
        </linearGradient>
      </defs>

      {/* Задний пузырь — "от собеседницы" */}
      <g>
        <path
          d="M60,16 L94,16 Q101,16 101,23 L101,47 Q101,54 94,54 L78,54 L68,66 L72,54 L60,54 Q53,54 53,47 L53,23 Q53,16 60,16 Z"
          fill="url(#ti-chat-bubble-shine)"
        />
        {/* Внутренняя тень/глубина */}
        <path
          d="M60,16 L94,16 Q101,16 101,23 L101,26 L53,26 L53,23 Q53,16 60,16 Z"
          fill="rgba(0,0,0,0.05)"
        />
      </g>

      {/* Три анимированных точки печати */}
      <g>
        <circle cx="66" cy="35" r="3" fill="url(#ti-chat-g)">
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="77" cy="35" r="3" fill="url(#ti-chat-g)">
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="88" cy="35" r="3" fill="url(#ti-chat-g)">
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Передний пузырь — "твой ответ" */}
      <g>
        <path
          d="M16,42 L46,42 Q53,42 53,49 L53,75 Q53,82 46,82 L36,82 L28,94 L32,82 L16,82 Q9,82 9,75 L9,49 Q9,42 16,42 Z"
          fill="url(#ti-chat-g)"
        />
        {/* Лёгкая подсветка сверху */}
        <path
          d="M16,42 L46,42 Q53,42 53,49 L53,52 L9,52 L9,49 Q9,42 16,42 Z"
          fill="rgba(255,255,255,0.15)"
        />
      </g>

      {/* Сердечко внутри переднего пузыря (с пульсом и бликом) */}
      <g transform="translate(31 64)">
        <g>
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1;1.1;1;1.06;1"
            keyTimes="0;0.18;0.35;0.5;1"
            dur="1.8s"
            repeatCount="indefinite"
          />
          <path
            d="M0,12 C-9,5 -13,1 -13,-3 C-13,-7 -10,-9 -7,-9 C-4,-9 -2,-7 0,-4 C2,-7 4,-9 7,-9 C10,-9 13,-7 13,-3 C13,1 9,5 0,12 Z"
            fill="#ffffff"
          />
          {/* Блик */}
          <ellipse cx="-5" cy="-5" rx="2" ry="2.6" fill="rgba(255,255,255,0.55)" transform="rotate(-25 -5 -5)" />
        </g>
      </g>
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
        <radialGradient id="ti-sparkle-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Свечение под главной искрой */}
      <circle cx="55" cy="55" r="40" fill="url(#ti-sparkle-glow)" />

      {/* Главная 4-конечная искра — медленно вращается */}
      <g transform="translate(55 55)">
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="22s"
            repeatCount="indefinite"
          />
          {/* Основное тело */}
          <path
            d="M0,-45 C2,-15 15,-2 43,0 C15,2 2,15 0,43 C-2,15 -15,2 -43,0 C-15,-2 -2,-15 0,-45 Z"
            fill="url(#ti-sparkle-g)"
          />
          {/* Внутренний блик */}
          <path
            d="M0,-30 C1.5,-12 11,-2 28,0 C11,2 1.5,12 0,28 C-1.5,12 -11,2 -28,0 C-11,-2 -1.5,-12 0,-30 Z"
            fill="rgba(255,255,255,0.18)"
          />
          {/* Центральный белый узел */}
          <circle cx="0" cy="0" r="3.5" fill="#ffffff" opacity="0.85" />
        </g>
      </g>

      {/* Мини-искры — мерцают с разными задержками */}
      <g>
        {/* верх-справа */}
        <g transform="translate(88 18)">
          <g>
            <animateTransform attributeName="transform" type="scale" values="1;1.35;1" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
            <path d="M0,-9 C1,-3 3,-1 9,0 C3,1 1,3 0,9 C-1,3 -3,1 -9,0 C-3,-1 -1,-3 0,-9 Z" fill="#ffffff" />
          </g>
        </g>
        {/* низ-слева */}
        <g transform="translate(22 88)">
          <g>
            <animateTransform attributeName="transform" type="scale" values="1;1.4;1" dur="2.1s" begin="0.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.95;0.4" dur="2.1s" begin="0.5s" repeatCount="indefinite" />
            <path d="M0,-7 C0.8,-2.5 2.5,-0.8 7,0 C2.5,0.8 0.8,2.5 0,7 C-0.8,2.5 -2.5,0.8 -7,0 C-2.5,-0.8 -0.8,-2.5 0,-7 Z" fill="#ffffff" />
          </g>
        </g>
        {/* верх-слева */}
        <g transform="translate(20 25)">
          <g>
            <animateTransform attributeName="transform" type="scale" values="1;1.5;1" dur="2.4s" begin="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.85;0.3" dur="2.4s" begin="1s" repeatCount="indefinite" />
            <path d="M0,-5 C0.6,-1.8 1.8,-0.6 5,0 C1.8,0.6 0.6,1.8 0,5 C-0.6,1.8 -1.8,0.6 -5,0 C-1.8,-0.6 -0.6,-1.8 0,-5 Z" fill="#ffffff" />
          </g>
        </g>
        {/* низ-справа */}
        <g transform="translate(92 82)">
          <g>
            <animateTransform attributeName="transform" type="scale" values="1;1.3;1" dur="2s" begin="1.3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" begin="1.3s" repeatCount="indefinite" />
            <path d="M0,-6 C0.7,-2 2,-0.7 6,0 C2,0.7 0.7,2 0,6 C-0.7,2 -2,0.7 -6,0 C-2,-0.7 -0.7,-2 0,-6 Z" fill="#ffffff" />
          </g>
        </g>
      </g>
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
        <linearGradient id="ti-shield-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="ti-shield-clip">
          <path d="M55,10 L84,22 Q89,24 89,30 L89,56 Q89,78 55,98 Q21,78 21,56 L21,30 Q21,24 26,22 Z" />
        </clipPath>
      </defs>

      {/* Контур щита */}
      <path
        d="M55,10 L84,22 Q89,24 89,30 L89,56 Q89,78 55,98 Q21,78 21,56 L21,30 Q21,24 26,22 Z"
        fill="url(#ti-shield-g)"
      />

      {/* Диагональный блик */}
      <g clipPath="url(#ti-shield-clip)">
        <rect x="-10" y="-10" width="70" height="120" fill="url(#ti-shield-sheen)" transform="rotate(-15 55 55)" />
      </g>

      {/* Внутренняя «гравировка» — обводка по контуру */}
      <path
        d="M55,16 L80,26 Q83,27.5 83,31 L83,54 Q83,73 55,90 Q27,73 27,54 L27,31 Q27,27.5 30,26 Z"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.2"
      />

      {/* Тонкие диагональные царапины (battle-worn) */}
      <g clipPath="url(#ti-shield-clip)" opacity="0.18">
        <line x1="32" y1="38" x2="48" y2="44" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="62" y1="70" x2="76" y2="78" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
        <line x1="44" y1="72" x2="56" y2="80" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" />
      </g>

      {/* Сердце-бьётся внутри щита (heartbeat double-pump) */}
      <g transform="translate(55 53)">
        <g>
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1;1.08;0.98;1.05;1"
            keyTimes="0;0.12;0.28;0.42;1"
            dur="1.8s"
            repeatCount="indefinite"
          />
          {/* Тень сердца */}
          <path
            d="M0,17 C-10,9 -20,2 -20,-9 C-20,-15 -16,-19 -11,-19 C-7,-19 -3,-17 0,-13 C3,-17 7,-19 11,-19 C16,-19 20,-15 20,-9 C20,2 10,9 0,17 Z"
            fill="rgba(0,0,0,0.18)"
            transform="translate(0 1.5)"
          />
          {/* Само сердце */}
          <path
            d="M0,17 C-10,9 -20,2 -20,-9 C-20,-15 -16,-19 -11,-19 C-7,-19 -3,-17 0,-13 C3,-17 7,-19 11,-19 C16,-19 20,-15 20,-9 C20,2 10,9 0,17 Z"
            fill="#ffffff"
          />
          {/* Блик на сердце */}
          <ellipse cx="-7" cy="-11" rx="3" ry="4" fill="rgba(255,255,255,0.55)" transform="rotate(-25 -7 -11)" />
        </g>
      </g>
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
        <linearGradient id="ti-book-spine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="48%" stopColor="rgba(0,0,0,0.22)" />
          <stop offset="52%" stopColor="rgba(0,0,0,0.22)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="ti-page-edge" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f5f5f5" />
          <stop offset="100%" stopColor="#e0e0e0" />
        </linearGradient>
      </defs>

      {/* Обложка */}
      <path
        d="M14,22 Q14,16 20,16 L90,16 Q96,16 96,22 L96,90 Q96,96 90,96 L20,96 Q14,96 14,90 Z"
        fill="url(#ti-book-g)"
      />

      {/* Лёгкая подсветка верха обложки */}
      <path
        d="M14,22 Q14,16 20,16 L90,16 Q96,16 96,22 L96,32 L14,32 Z"
        fill="rgba(255,255,255,0.15)"
      />

      {/* Тиснёная буква К в правом нижнем углу обложки */}
      <text
        x="80" y="92"
        fontFamily="Georgia, serif"
        fontSize="10"
        fill="rgba(255,255,255,0.35)"
        fontWeight="bold"
        textAnchor="middle"
      >
        K
      </text>

      {/* Левая страница */}
      <path
        d="M22,28 L52,28 L52,86 Q40,82 22,84 Z"
        fill="#ffffff"
      />
      {/* Тонкий край левой страницы */}
      <path d="M22,84 Q40,82 52,86 L52,87.5 Q40,83.5 22,85.5 Z" fill="url(#ti-page-edge)" />

      {/* Правая страница */}
      <path
        d="M58,28 L88,28 L88,84 Q70,82 58,86 Z"
        fill="#ffffff"
        opacity="0.92"
      />
      <path d="M58,86 Q70,82 88,84 L88,85.5 Q70,83.5 58,87.5 Z" fill="url(#ti-page-edge)" opacity="0.85" />

      {/* Реалистичные строки текста — левая страница */}
      <g stroke="url(#ti-book-g)" strokeLinecap="round" opacity="0.7">
        <line x1="26" y1="38" x2="48" y2="38" strokeWidth="2" />
        <line x1="26" y1="44" x2="46" y2="44" strokeWidth="1.6" opacity="0.85" />
        <line x1="26" y1="50" x2="48" y2="50" strokeWidth="1.6" opacity="0.85" />
        <line x1="26" y1="56" x2="42" y2="56" strokeWidth="1.6" opacity="0.7" />
        <line x1="26" y1="64" x2="48" y2="64" strokeWidth="2" opacity="0.6" />
        <line x1="26" y1="70" x2="44" y2="70" strokeWidth="1.4" opacity="0.55" />
        <line x1="26" y1="76" x2="47" y2="76" strokeWidth="1.4" opacity="0.5" />
      </g>

      {/* Строки текста — правая страница */}
      <g stroke="url(#ti-book-g)" strokeLinecap="round" opacity="0.55">
        <line x1="62" y1="38" x2="84" y2="38" strokeWidth="1.6" />
        <line x1="62" y1="44" x2="82" y2="44" strokeWidth="1.6" opacity="0.85" />
        <line x1="62" y1="50" x2="84" y2="50" strokeWidth="1.6" opacity="0.8" />
        <line x1="62" y1="56" x2="78" y2="56" strokeWidth="1.4" opacity="0.7" />
        <line x1="62" y1="64" x2="84" y2="64" strokeWidth="1.6" opacity="0.5" />
        <line x1="62" y1="70" x2="80" y2="70" strokeWidth="1.4" opacity="0.5" />
      </g>

      {/* Корешок — тёмная вертикальная тень */}
      <rect x="50" y="22" width="10" height="68" fill="url(#ti-book-spine)" />

      {/* Закладка-лента — качается */}
      <g transform="translate(76 16)">
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="-2 0 0;2 0 0;-2 0 0"
            dur="4.2s"
            repeatCount="indefinite"
          />
          {/* Тень закладки */}
          <path
            d="M0,0 L14,0 L14,30 L7,24 L0,30 Z"
            fill="rgba(0,0,0,0.18)"
            transform="translate(1 1.5)"
          />
          {/* Сама закладка */}
          <path
            d="M0,0 L14,0 L14,30 L7,24 L0,30 Z"
            fill="#ffffff"
            opacity="0.96"
          />
          {/* Складка закладки */}
          <line x1="7" y1="0" x2="7" y2="24" stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
        </g>
      </g>
    </svg>
  );
}
