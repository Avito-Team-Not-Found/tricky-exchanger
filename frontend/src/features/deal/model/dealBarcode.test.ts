import { describe, expect, it } from 'vitest';

import { barcodeBars, barcodeCode } from './dealBarcode';

describe('barcodeBars', () => {
  it('возвращает чередующиеся штрихи и пробелы чётной длины', () => {
    const segments = barcodeBars('1:handoff');
    expect(segments.length % 2).toBe(0);
    expect(segments.length).toBeGreaterThan(0);
  });

  it('детерминирован: один seed даёт одинаковый рисунок', () => {
    expect(barcodeBars('1:handoff')).toEqual(barcodeBars('1:handoff'));
  });

  it('отправка и получение одной цепочки дают разный рисунок', () => {
    expect(barcodeBars('1:handoff')).not.toEqual(barcodeBars('1:receipt'));
  });

  it('штрих-коды разных цепочек различаются', () => {
    expect(barcodeBars('1:handoff')).not.toEqual(barcodeBars('2:handoff'));
  });
});

describe('barcodeCode', () => {
  it('возвращает 12-значный код и детерминирован', () => {
    expect(barcodeCode('1:receipt')).toMatch(/^\d{12}$/);
    expect(barcodeCode('1:receipt')).toBe(barcodeCode('1:receipt'));
  });
});
