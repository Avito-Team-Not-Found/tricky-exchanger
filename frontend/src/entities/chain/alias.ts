export interface ParticipantAlias {
  name: string;
  emoji: string;
}

// участники цепочки анонимны: вместо имён — животное-псевдоним с эмодзи
const ALIASES: ParticipantAlias[] = [
  { name: 'Мишка', emoji: '🐻' },
  { name: 'Лиса', emoji: '🦊' },
  { name: 'Кот', emoji: '🐱' },
  { name: 'Волк', emoji: '🐺' },
  { name: 'Заяц', emoji: '🐰' },
  { name: 'Панда', emoji: '🐼' },
  { name: 'Тигр', emoji: '🐯' },
  { name: 'Лев', emoji: '🦁' },
  { name: 'Ёж', emoji: '🦔' },
  { name: 'Сова', emoji: '🦉' },
  { name: 'Пингвин', emoji: '🐧' },
  { name: 'Олень', emoji: '🦌' },
];

// по позиции, а не по id пользователя: позиции внутри цепочки уникальны, поэтому двух
// одинаковых животных в ней не будет. Позиции 0-based, первая позиция кольца — «Мишка»
export function participantAlias(position: number): ParticipantAlias {
  const index = Math.trunc(position) % ALIASES.length;
  return ALIASES[index < 0 ? index + ALIASES.length : index];
}
