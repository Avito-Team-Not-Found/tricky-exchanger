import { theme } from 'antd';

import './ui.scss';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AvatarSize, number> = { sm: 24, md: 40, lg: 64 };
const FONT_PX: Record<AvatarSize, number> = { sm: 10, md: 14, lg: 20 };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  // подпись вместо инициалов (в цепочке текущий пользователь помечен «Я»)
  label?: string;
  // эмодзи-псевдоним участника; рисуется вполовину диаметра — заметно крупнее подписи
  emoji?: string;
}

// Круглый аватар без фото: фолбэк — инициалы на 15%-м акценте
export function Avatar({ name, size = 'md', label, emoji }: AvatarProps) {
  const { token } = theme.useToken();
  const backgroundColor = `${token.colorPrimary}26`;
  const style = {
    width: SIZE_PX[size],
    height: SIZE_PX[size],
    fontSize: emoji ? SIZE_PX[size] / 2 : FONT_PX[size],
    backgroundColor,
    color: token.colorPrimary,
  };

  return (
    <span className="avatar" style={style} aria-label={name} title={name}>
      {emoji ?? label ?? initialsOf(name)}
    </span>
  );
}
