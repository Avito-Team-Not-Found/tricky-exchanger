import { Button } from 'antd';

import { chainReadiness, myParticipant, receivesItem, type Chain } from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import './ChainItemView.scss';

interface ChainItemViewProps {
  chain: Chain;
  categoryName: string | null;
  onOpenParticipants: () => void;
}

// Экран цепочки (макет 4.7): товар, который пользователь получит в обмене, его описание
// и характеристики + переход к схеме участников (макет 4.8). Действия — на схеме и в карточке.
export function ChainItemView({ chain, categoryName, onOpenParticipants }: ChainItemViewProps) {
  const me = myParticipant(chain);
  const received = me ? receivesItem(me, chain) : null;
  const { agreed, total } = chainReadiness(chain);
  const isReady = agreed === total && total > 0;

  const specs: { label: string; value: string }[] = [];
  if (categoryName) specs.push({ label: 'Категория', value: categoryName });

  return (
    <div className="chain-item">
      <div className="chain-item__photo">
        {received?.imageUrl ? (
          <img className="chain-item__photo-img" src={received.imageUrl} alt={received.title} />
        ) : (
          <div className="chain-item__photo-placeholder" aria-hidden />
        )}
      </div>

      <div className="chain-item__head">
        <h2 className="chain-item__title">{received?.title ?? 'Товар удалён'}</h2>
        <div className="chain-item__meta">
          <span className="chain-item__count">
            {total} {pluralize(total)} в цепочке
          </span>
          {isReady ? (
            <span className="chain-item__ready">Цепочка собрана</span>
          ) : (
            <ProbabilityBadge score={chain.score} />
          )}
        </div>
      </div>

      {received?.description ? (
        <section className="chain-item__section">
          <h3 className="chain-item__section-title">Описание</h3>
          <p className="chain-item__description">{received.description}</p>
        </section>
      ) : null}

      {specs.length > 0 ? (
        <section className="chain-item__section">
          <h3 className="chain-item__section-title">Характеристики</h3>
          <dl className="chain-item__specs">
            {specs.map((spec) => (
              <div className="chain-item__spec" key={spec.label}>
                <dt className="chain-item__spec-label">{spec.label}</dt>
                <dd className="chain-item__spec-value">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <Button className="chain-item__details" size="large" block onClick={onOpenParticipants}>
        Посмотреть всю цепочку
      </Button>
    </div>
  );
}

function pluralize(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'участник';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'участника';
  return 'участников';
}
