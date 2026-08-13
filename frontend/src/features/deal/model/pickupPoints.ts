// Адреса ПВЗ для экрана сделки: физического ПВЗ в MVP нет, адрес хранится в localStorage.
// Первый — значение по умолчанию, пока пользователь не выбрал другой.
export const PICKUP_POINTS = [
  'ул. Тверская, 12, Москва · до 22:00',
  'пр-т Мира, 108, Москва · до 21:00',
  'ул. Ленина, 45, Санкт-Петербург · до 22:00',
  'пр-т Невский, 93, Санкт-Петербург · до 20:00',
  'ул. Карла Маркса, 17, Казань · до 21:00',
];

export function pickupPointKey(chainId: number): string {
  return `deal:pickup:${chainId}`;
}

export function defaultPickupPoint(): string {
  return PICKUP_POINTS[0];
}
