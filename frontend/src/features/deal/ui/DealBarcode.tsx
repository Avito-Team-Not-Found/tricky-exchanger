import type { BarcodeKind } from '../model/dealBarcode';
import { barcodeBars, barcodeCode } from '../model/dealBarcode';

import './DealBarcode.scss';

interface DealBarcodeProps {
  chainId: number;
  // для какого действия предъявляется штрих-код — меняет подпись и рисунок полос
  kind: BarcodeKind;
}

// подпись: зачем предъявлять штрих-код — отправка или получение
const BARCODE_CAPTIONS: Record<BarcodeKind, string> = {
  handoff: 'Предъявите этот штрих-код при отправке',
  receipt: 'Предъявите этот штрих-код при получении',
};

// Фиктивный штрих-код сделки: полосы и цифры генерируются детерминированно из id цепочки,
// реального сканирования нет — это имитация на время MVP, как адрес ПВЗ и фото упаковки.
export function DealBarcode({ chainId, kind }: DealBarcodeProps) {
  const seed = `${chainId}:${kind}`;
  const segments = barcodeBars(seed);
  const code = barcodeCode(seed);

  return (
    <div className="deal-barcode">
      <p className="deal-barcode__caption">{BARCODE_CAPTIONS[kind]}</p>
      <div className="deal-barcode__strip" aria-hidden>
        {segments.map((width, index) =>
          index % 2 === 0 ? (
            <span key={index} className="deal-barcode__bar" style={{ width }} />
          ) : (
            <span key={index} className="deal-barcode__space" style={{ width }} />
          ),
        )}
      </div>
      <p className="deal-barcode__code" aria-hidden>
        {code}
      </p>
    </div>
  );
}
