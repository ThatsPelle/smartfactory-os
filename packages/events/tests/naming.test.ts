import { describe, expect, it } from 'vitest';

import { assertOwnership } from '../src/naming.js';

describe('event ownership', () => {
  it('accepts the final manifest id segment as the event namespace', () => {
    expect(() => assertOwnership('iam.session.created', 'sfos.iam')).not.toThrow();
  });

  it('still rejects a foreign event namespace', () => {
    expect(() => assertOwnership('warehouse.item.created', 'sfos.iam')).toThrow(/cannot emit/);
  });
});
