// ═══════════════════════════════════════════════════════════════
// Mock-фид сообщества для CommunityScreen — статический RU-контент.
// Phase F: реального бекенда для постов нет (см. PHASE_F_NOTES.md TODO).
// ═══════════════════════════════════════════════════════════════

export interface FeedMsg {
  role: 'her' | 'me';
  text: string;
}

export interface AnalysisItem {
  label: string;
  value: number;
  color: string;
}

export interface FeedPost {
  id: string;
  user: string;
  avatarColors: [string, string];
  typeName: string;
  typeColor: string;
  preview: FeedMsg[];
  messages: FeedMsg[];
  score: number;
  analysis: AnalysisItem[];
  tip: string;
  likes: number;
  time: string;
  liked: boolean;
}

const AVATARS: [string, string][] = [
  ['#F43F5E', '#EC4899'],
  ['#A855F7', '#6366F1'],
  ['#22C55E', '#06B6D4'],
  ['#EF4444', '#F59E0B'],
  ['#6366F1', '#A855F7'],
  ['#EC4899', '#F59E0B'],
];

export const MOCK_FEED: FeedPost[] = [
  {
    id: 'p1',
    user: 'alexey_m',
    avatarColors: AVATARS[0],
    typeName: 'Скромная',
    typeColor: 'rgba(244,63,94,0.7)',
    preview: [
      { role: 'her', text: 'Привет) кто ты вообще?' },
      { role: 'me', text: 'Тот, кто заставит тебя забыть скучные разговоры' },
      { role: 'her', text: 'Хаха, ну ладно... расскажи' },
    ],
    messages: [
      { role: 'her', text: 'Привет) кто ты вообще?' },
      { role: 'me', text: 'Тот, кто заставит тебя забыть скучные разговоры' },
      { role: 'her', text: 'Хаха, ну ладно... расскажи' },
      { role: 'me', text: 'Я тот, кто задаёт вопросы, которые заставляют думать' },
      { role: 'her', text: 'Интересно. И какой первый вопрос?' },
      { role: 'me', text: 'Чего ты больше всего боишься потерять?' },
      { role: 'her', text: 'Хм. Это неожиданно... время наверное' },
    ],
    score: 87,
    analysis: [
      { label: 'Открытость', value: 88, color: '#22C55E' },
      { label: 'Интерес', value: 82, color: '#3B82F6' },
      { label: 'Уверенность', value: 94, color: '#F43F5E' },
    ],
    tip: 'Отличный старт — интрига без давления. Вопрос про время раскрыл её — продолжай в этом ключе.',
    likes: 47,
    time: '2 ч назад',
    liked: false,
  },
  {
    id: 'p2',
    user: 'roma_dev',
    avatarColors: AVATARS[1],
    typeName: 'Общительная',
    typeColor: 'rgba(168,85,247,0.7)',
    preview: [
      { role: 'her', text: 'О да! Я тоже люблю путешествовать 😊' },
      { role: 'me', text: 'Следующая точка — куда?' },
      { role: 'her', text: 'Хочу в Японию! Ты бы поехал?' },
      { role: 'me', text: 'С правильным компанией — хоть на Марс' },
    ],
    messages: [
      { role: 'her', text: 'О да! Я тоже люблю путешествовать 😊' },
      { role: 'me', text: 'Следующая точка — куда?' },
      { role: 'her', text: 'Хочу в Японию! Ты бы поехал?' },
      { role: 'me', text: 'С правильным компанией — хоть на Марс' },
      { role: 'her', text: 'Хаха ты смешной 😄 ну а серьёзно — что тебя тянет в путешествия?' },
      { role: 'me', text: 'Ощущение что мир больше, чем кажется из окна' },
      { role: 'her', text: 'Это красиво сказано ❤️' },
    ],
    score: 93,
    analysis: [
      { label: 'Отклик', value: 95, color: '#22C55E' },
      { label: 'Флирт', value: 88, color: '#F43F5E' },
      { label: 'Глубина', value: 76, color: '#A855F7' },
    ],
    tip: 'Высокий отклик — она сама ведёт к сближению. Ответ про мир — сильный эмоциональный крючок.',
    likes: 93,
    time: '5 ч назад',
    liked: true,
  },
  {
    id: 'p3',
    user: 'kirill_p',
    avatarColors: AVATARS[2],
    typeName: 'Интеллектуалка',
    typeColor: 'rgba(59,130,246,0.7)',
    preview: [
      { role: 'her', text: 'Ты читал "Мастера и Маргариту"?' },
      { role: 'me', text: 'Читал. Воланд — лучший персонаж там' },
      { role: 'her', text: 'Неожиданно. Почему?' },
      { role: 'me', text: 'Потому что он единственный честный' },
    ],
    messages: [
      { role: 'her', text: 'Ты читал "Мастера и Маргариту"?' },
      { role: 'me', text: 'Читал. Воланд — лучший персонаж там' },
      { role: 'her', text: 'Неожиданно. Почему?' },
      { role: 'me', text: 'Потому что он единственный честный' },
      { role: 'her', text: 'Это очень неочевидная, но точная мысль' },
      { role: 'me', text: 'Честность — редкий грех' },
      { role: 'her', text: 'Ты мне нравишься. Читаем дальше?' },
    ],
    score: 96,
    analysis: [
      { label: 'Интеллект', value: 96, color: '#3B82F6' },
      { label: 'Притяжение', value: 90, color: '#F43F5E' },
      { label: 'Доверие', value: 85, color: '#22C55E' },
    ],
    tip: 'Топ результат — нестандартный взгляд на книгу создал момент "вы на одной волне". Запомни приём.',
    likes: 134,
    time: '1 д назад',
    liked: false,
  },
  {
    id: 'p4',
    user: 'denis_w',
    avatarColors: AVATARS[3],
    typeName: 'Стервозная',
    typeColor: 'rgba(239,68,68,0.7)',
    preview: [
      { role: 'her', text: 'И чего ты хочешь?' },
      { role: 'me', text: 'Посмотреть, можешь ли ты удивить' },
      { role: 'her', text: '...' },
      { role: 'her', text: 'Интересно' },
    ],
    messages: [
      { role: 'her', text: 'И чего ты хочешь?' },
      { role: 'me', text: 'Посмотреть, можешь ли ты удивить' },
      { role: 'her', text: '...' },
      { role: 'her', text: 'Интересно' },
      { role: 'me', text: 'Рад что проснулось любопытство' },
      { role: 'her', text: 'Не зазнавайся. Это ещё ни о чём' },
      { role: 'me', text: 'Именно поэтому я здесь — узнать о чём это' },
    ],
    score: 79,
    analysis: [
      { label: 'Напряжение', value: 88, color: '#EF4444' },
      { label: 'Контроль', value: 80, color: '#F59E0B' },
      { label: 'Интрига', value: 79, color: '#A855F7' },
    ],
    tip: 'Хорошо держишь рамку. Со стервозным типом важно не прогибаться — ты справился.',
    likes: 61,
    time: '2 д назад',
    liked: false,
  },
];
