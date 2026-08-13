export type BarcodeKind = 'handoff' | 'receipt';

// детерминированный PRNG (mulberry32) от строкового seed: штрих-код одной цепочки стабилен
// между рендерами, у отправки и получения разный — без реального сканирования это просто имитация
function hashString(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// чередующиеся штрихи и пробелы, чётные индексы — штрихи: набором вертикальных полос
// переменной ширины штрих-код читается визуально даже без данных под ним
export function barcodeBars(seed: string): number[] {
  const random = mulberry32(hashString(seed));
  const segments: number[] = [];
  for (let i = 0; i < 30; i += 1) {
    segments.push(2 + Math.floor(random() * 3));
    segments.push(2 + Math.floor(random() * 3));
  }
  return segments;
}

export function barcodeCode(seed: string): string {
  const random = mulberry32(hashString(seed));
  let code = '';
  for (let i = 0; i < 12; i += 1) {
    code += String(Math.floor(random() * 10));
  }
  return code;
}
