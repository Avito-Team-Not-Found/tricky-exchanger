import type { ReplacementOption } from '@entities/chain';

const KEY_PREFIX = 'tricky_exchanger_replacement_invited';

export interface InvitedRecord {
  // null — запись предыдущей версии, где хранился только факт приглашения
  requestId: number | null;
  option: ReplacementOption | null;
}

function key(chainId: number): string {
  return `${KEY_PREFIX}_${chainId}`;
}

// Факт приглашения не виден в теле цепочки, а PUT /replacement не идемпотентен: без записи
// перезагрузка возвращает экран в выбор кандидата и с пустым пулом предлагает расформировать
// здоровую цепочку. localStorage, а не sessionStorage — новая вкладка показала бы то же самое.
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
