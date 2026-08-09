import { TrophyFilled } from '@ant-design/icons';

import './BestChainBadge.scss';

// Плашка «лучший вариант» у цепочки с максимальной вероятностью среди вариантов заявки.
// Иконка + текст, а не один лишь цвет — требование доступности из DESIGN.md.
export function BestChainBadge() {
  return (
    <span className="best-chain-badge">
      <TrophyFilled className="best-chain-badge__icon" aria-hidden />
      Лучшая цепочка для этого товара
    </span>
  );
}
