import { describe, expect, it } from 'vitest';

import { isRequestEditable, REQUEST_STATUS_META, type RequestStatus } from './model';

const ALL_STATUSES: RequestStatus[] = ['ACTIVE', 'IN_PROPOSAL', 'LOCKED', 'DONE', 'REMOVED'];

describe('REQUEST_STATUS_META', () => {
  it('covers all statuses from the contract', () => {
    expect(Object.keys(REQUEST_STATUS_META).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('maps every status to a label and a tone', () => {
    for (const status of ALL_STATUSES) {
      expect(REQUEST_STATUS_META[status].label).toEqual(expect.any(String));
      expect(REQUEST_STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(['success', 'warning', 'neutral', 'error']).toContain(
        REQUEST_STATUS_META[status].tone,
      );
    }
  });
});

describe('isRequestEditable', () => {
  it('allows editing only live requests', () => {
    expect(isRequestEditable('ACTIVE')).toBe(true);
    expect(isRequestEditable('IN_PROPOSAL')).toBe(true);
  });

  it('blocks editing locked, done and removed requests', () => {
    expect(isRequestEditable('LOCKED')).toBe(false);
    expect(isRequestEditable('DONE')).toBe(false);
    expect(isRequestEditable('REMOVED')).toBe(false);
  });
});
