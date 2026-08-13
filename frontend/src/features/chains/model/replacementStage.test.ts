import { describe, expect, it } from 'vitest';

import { replacementStage } from './replacementStage';

describe('replacementStage', () => {
  it('keeps the actor selecting until the invitation is sent', () => {
    expect(replacementStage('PROPOSED', false)).toBe('selecting');
  });

  it('waits for the candidate while the chain stays proposed', () => {
    expect(replacementStage('PROPOSED', true)).toBe('waiting');
  });

  // подтверждение кандидата — последнее недостающее, поэтому цепочка сразу уходит в FROZEN
  it('reports success once the chain is frozen', () => {
    expect(replacementStage('FROZEN', true)).toBe('succeeded');
  });

  it('reports a rollback when the candidate declined or the chain fell apart', () => {
    expect(replacementStage('CANDIDATE', true)).toBe('rolledBack');
    expect(replacementStage('BROKEN', true)).toBe('rolledBack');
  });

  // вне PROPOSED пул не запрашивается, и пустой список предложил бы расформировать живую цепочку
  it('never offers the candidate list outside a proposed chain', () => {
    expect(replacementStage('IN_PROGRESS', false)).toBe('rolledBack');
    expect(replacementStage('COMPLETED', false)).toBe('rolledBack');
    expect(replacementStage(undefined, false)).toBe('rolledBack');
  });
});
