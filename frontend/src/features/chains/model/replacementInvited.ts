const KEY_PREFIX = 'tricky_exchanger_replacement_invited';

function key(chainId: number): string {
  return `${KEY_PREFIX}_${chainId}`;
}

// «Приглашение уже отправлено» обязано пережить перезагрузку и открытие в другой вкладке.
// Причина не косметическая: PUT /replacement не идемпотентен (TZ §7.2), а по телу цепочки понять,
// что вакансия уже закрыта, нельзя — она в нём не видна вовсе. Без флага перезагрузка на экране
// ожидания возвращает stage в 'selecting', и пустой к тому моменту пул предлагает «Расформировать
// цепочку» — то есть снести здоровую цепочку, которая просто ждёт подтверждения кандидата.
//
// localStorage, а не sessionStorage: новая вкладка иначе снова показала бы тот же опасный экран.
// Протухание ограничено тем, что флаг снимается, как только цепочку увидели в любом статусе,
// кроме PROPOSED (см. useReplacementSelection) — так повторная замена по той же цепочке начинается
// с чистого листа. Худший остаточный случай — лишний экран ожидания, а не потеря цепочки.
export const replacementInvited = {
  get(chainId?: number): boolean {
    if (!chainId) return false;
    return localStorage.getItem(key(chainId)) === '1';
  },
  set(chainId?: number): void {
    if (!chainId) return;
    localStorage.setItem(key(chainId), '1');
  },
  clear(chainId?: number): void {
    if (!chainId) return;
    localStorage.removeItem(key(chainId));
  },
};
