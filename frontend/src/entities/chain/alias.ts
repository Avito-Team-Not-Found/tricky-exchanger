export interface ParticipantAlias {
  name: string;
  emoji: string;
}

// На этапе MVP участники цепочки анонимны: настоящие имена не показываются, вместо них —
// животное-псевдоним с эмодзи (макет 4.8). Первые три — те же, что нарисованы в макете.
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

// Псевдоним берётся по позиции в цепочке, а не по id пользователя: позиции внутри цепочки
// уникальны, поэтому два участника одной цепочки никогда не получат одно и то же животное.
export function participantAlias(position: number): ParticipantAlias {
  const index = (Math.trunc(position) - 1) % ALIASES.length;
  return ALIASES[index < 0 ? index + ALIASES.length : index];
}
