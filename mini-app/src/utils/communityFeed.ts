// ═══════════════════════════════════════════════════════════════
// Лента сообщества — пока пустая.
//
// MOCK_FEED намеренно [] до запуска: до релиза мы не показываем
// фейковые истории как реальные кейсы пользователей.
// Тип FeedPost оставлен — экран и карточки используют его в
// аннотациях типов, плюс пригодится когда подцепим реальный
// бекенд для постов сообщества.
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

export const MOCK_FEED: FeedPost[] = [];
