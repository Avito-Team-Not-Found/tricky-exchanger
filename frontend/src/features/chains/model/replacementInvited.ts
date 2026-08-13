import type { ReplacementOption } from '@entities/chain';

const KEY_PREFIX = 'tricky_exchanger_replacement_invited';

export interface InvitedRecord {
  // requestId приглашённого; null — запись предыдущей версии, где хранился только факт приглашения
  requestId: number | null;
  option: ReplacementOption | null;
}

function key(chainId: number): string {
  return `${KEY_PREFIX}_${chainId}`;
}

// «Приглашение уже отправлено» обязано пережить перезагрузку и открытие в другой вкладке.
// Причина не косметическая: PUT /replacement не идемпотентен (TZ §7.2), а по телу цепочки понять,
// что вакансия уже закрыта, нельзя — она в нём не видна вовсе. Без записи перезагрузка на экране
// ожидания возвращает stage в 'selecting', и пустой к тому моменту пул предлагает «Расформировать
// цепочку» — то есть снести здоровую цепочку, которая просто ждёт подтверждения кандидата.
//
// Хранится не флаг, а сам кандидат: во-первых, экран ожидания после перезагрузки иначе показывал
// бы пустую карточку; во-вторых, именно по requestId проверяется, что приглашение ещё в силе —
// см. useReplacementSelection.
//
// localStorage, а не sessionStorage: новая вкладка иначе снова показала бы тот же опасный экран.
// Протухание ограничено тем, что запись снимается, как только цепочку увидели вне PROPOSED или
// вакансия открылась заново (см. useReplacementSelection) — так повторная замена по той же цепочке
// начинается с чистого листа. Худший остаточный случай — лишний экран ожидания, а не потеря цепочки.
export const replacementInvited = {
  get(chainId?: number): InvitedRecord | null {
    if (!chainId) return null;
    const raw = localStorage.getItem(key(chainId));
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'requestId' in parsed) {
        const record = parsed as InvitedRecord;
        if (typeof record.requestId === 'number') {
          return { requestId: record.requestId, option: record.option ?? null };
        }
      }
    } catch {
      // запись предыдущей версии ('1') — приглашение было, но кандидат неизвестен
    }
    return { requestId: null, option: null };
  },
  set(chainId: number | undefined, option: ReplacementOption): void {
    if (!chainId) return;
    const record: InvitedRecord = { requestId: option.requestId, option };
    localStorage.setItem(key(chainId), JSON.stringify(record));
  },
  clear(chainId?: number): void {
    if (!chainId) return;
    localStorage.removeItem(key(chainId));
  },
};
