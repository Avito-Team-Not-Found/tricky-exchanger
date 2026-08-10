import './DealItemSwap.scss';

interface DealItemSwapProps {
  // «Вы отправляете» / «Вы получите» — подпись над строкой обмена (макет 4.9)
  label: string;
  giveTitle: string;
  giveImageUrl?: string | null;
  receiveTitle: string;
  receiveImageUrl?: string | null;
}

// Строка обмена экрана сделки (макет 4.9): миниатюры 28×28 отдаваемого и получаемого товаров
// со стрелкой между названиями. Фото товаров бэкенд не хранит — заглушка-плейсхолдер.
export function DealItemSwap({
  label,
  giveTitle,
  giveImageUrl,
  receiveTitle,
  receiveImageUrl,
}: DealItemSwapProps) {
  return (
    <section className="deal-swap">
      <p className="deal-swap__label">{label}</p>
      <div className="deal-swap__row">
        <ItemThumb title={giveTitle} imageUrl={giveImageUrl} />
        <span className="deal-swap__name">{giveTitle}</span>
        <span className="deal-swap__arrow" aria-hidden>
          →
        </span>
        <ItemThumb title={receiveTitle} imageUrl={receiveImageUrl} />
        <span className="deal-swap__name">{receiveTitle}</span>
      </div>
    </section>
  );
}

function ItemThumb({ title, imageUrl }: { title: string; imageUrl?: string | null }) {
  return (
    <span className={`deal-swap__thumb${imageUrl ? '' : ' deal-swap__thumb--empty'}`} aria-hidden>
      {imageUrl ? <img className="deal-swap__thumb-img" src={imageUrl} alt="" /> : (title[0] ?? '')}
    </span>
  );
}
