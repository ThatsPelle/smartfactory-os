import { describe, expect, it } from 'vitest';

import { EventBus, ForeignEmissionError, eventTypeMatches } from '../src/events/index.js';

const env = (overrides: { type?: string; source?: string } = {}) =>
  ({
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    type: overrides.type ?? 'demo.thing.happened',
    version: '1.0',
    occurred_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    company_id: '00000000-0000-4000-8000-000000000001',
    source_module: overrides.source ?? 'demo',
    source_entity_id: null,
    emitted_by: { kind: 'system', id: 'demo' },
    correlation_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    causation_id: null,
    trace_id: null,
    depth: 0,
    payload: {},
    metadata: {},
    visibility: 'public',
    audit_required: false
  }) as never;

describe('event bus + ownership', () => {
  it('dispatches to handlers whose pattern matches', async () => {
    const bus = new EventBus();
    const called: string[] = [];
    bus.subscribe('mod', 'demo.thing.*', async () => {
      called.push('A');
    });
    bus.subscribe('other', 'unrelated.*', async () => {
      called.push('B');
    });
    const r = await bus.dispatch(env({ type: 'demo.thing.happened' }));
    expect(called).toEqual(['A']);
    expect(r.invoked).toHaveLength(1);
    expect(r.failures).toHaveLength(0);
  });

  it('isolates handler failures — one throw does not block other handlers', async () => {
    const bus = new EventBus();
    const called: string[] = [];
    bus.subscribe('a', 'x.*', async () => {
      throw new Error('boom');
    });
    bus.subscribe('b', 'x.*', async () => {
      called.push('B');
    });
    const r = await bus.dispatch(env({ type: 'x.happened' }));
    expect(called).toEqual(['B']);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.subscription.moduleId).toBe('a');
    expect(r.failures[0]!.error.message).toBe('boom');
  });

  it('rejects emission whose source_module does not match the emitter', async () => {
    const bus = new EventBus();
    await expect(
      bus.emit('crm', env({ source: 'warehouse' }))
    ).rejects.toBeInstanceOf(ForeignEmissionError);
  });

  it('accepts emission whose source_module matches', async () => {
    const bus = new EventBus();
    const r = await bus.emit('crm', env({ source: 'crm', type: 'crm.contact.created' }));
    expect(r.failures).toHaveLength(0);
  });

  it('matches single * and trailing **', () => {
    expect(eventTypeMatches('a.b.c', 'a.b.c')).toBe(true);
    expect(eventTypeMatches('a.*.c', 'a.b.c')).toBe(true);
    expect(eventTypeMatches('a.*.c', 'a.b.x')).toBe(false);
    expect(eventTypeMatches('a.**', 'a.b.c.d')).toBe(true);
    expect(eventTypeMatches('a.**', 'b.c')).toBe(false);
  });
});
