import { describe, expect, it } from 'vitest';

import {
  IllegalLifecycleTransitionError,
  LifecycleEngine,
  UnknownModuleError,
  canTransition,
  allowedTransitions
} from '../src/lifecycle/index.js';

describe('lifecycle state machine', () => {
  it('walks the happy path: discovered → validated → registered → initialized', () => {
    const e = new LifecycleEngine();
    e.introduce('m1');
    expect(e.stateOf('m1')).toBe('discovered');
    e.transition('m1', 'validated');
    e.transition('m1', 'registered');
    e.transition('m1', 'initialized');
    expect(e.stateOf('m1')).toBe('initialized');
  });

  it('rejects an illegal transition with a typed error', () => {
    const e = new LifecycleEngine();
    e.introduce('m1');
    expect(() => e.transition('m1', 'initialized')).toThrowError(
      IllegalLifecycleTransitionError
    );
    expect(e.stateOf('m1')).toBe('discovered'); // unchanged
  });

  it('rejects transition on an unknown module', () => {
    const e = new LifecycleEngine();
    expect(() => e.transition('ghost', 'validated')).toThrowError(UnknownModuleError);
  });

  it('supports initialized → degraded → initialized recovery', () => {
    const e = new LifecycleEngine();
    e.introduce('m1');
    e.transition('m1', 'validated');
    e.transition('m1', 'registered');
    e.transition('m1', 'initialized');
    e.transition('m1', 'degraded', 'handler crashed');
    expect(e.stateOf('m1')).toBe('degraded');
    e.transition('m1', 'initialized', 'operator recovered');
    expect(e.stateOf('m1')).toBe('initialized');
  });

  it('treats disabled as terminal', () => {
    const e = new LifecycleEngine();
    e.introduce('m1');
    e.transition('m1', 'disabled');
    expect(allowedTransitions('disabled')).toEqual([]);
    expect(() => e.transition('m1', 'validated')).toThrowError(
      IllegalLifecycleTransitionError
    );
  });

  it('records history with from/to/reason/at', () => {
    const e = new LifecycleEngine();
    e.introduce('m1', 'loaded');
    e.transition('m1', 'validated', 'schema ok');
    const h = e.history();
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ moduleId: 'm1', from: null, to: 'discovered', reason: 'loaded' });
    expect(h[1]).toMatchObject({ from: 'discovered', to: 'validated', reason: 'schema ok' });
  });

  it('does not double-introduce the same module', () => {
    const e = new LifecycleEngine();
    e.introduce('m1');
    expect(() => e.introduce('m1')).toThrow();
  });

  it('canTransition matches the engine\'s allowed transitions', () => {
    expect(canTransition('discovered', 'validated')).toBe(true);
    expect(canTransition('discovered', 'initialized')).toBe(false);
    expect(canTransition('failed', 'disabled')).toBe(true);
    expect(canTransition('disabled', 'validated')).toBe(false);
  });
});
