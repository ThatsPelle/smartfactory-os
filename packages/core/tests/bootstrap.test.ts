import { describe, expect, it } from 'vitest';

import { bootstrap } from '../src/runtime/bootstrap.js';
import { fakeManifest, recordingLifecycle } from './helpers.js';

const opts = {
  platformVersion: '0.1.0',
  runtimeMode: 'self_hosted' as const
};

describe('bootstrap (end-to-end runtime startup)', () => {
  it('initializes a module with no dependencies', async () => {
    const lifecycle = recordingLifecycle({ preFlight: 'ok', register: 'ok' });
    const r = await bootstrap({
      ...opts,
      modules: [{ manifest: fakeManifest({ id: 'solo' }), lifecycle }]
    });
    expect(r.diagnostics.ready).toBe(true);
    expect(r.diagnostics.modules[0]).toMatchObject({ moduleId: 'solo', state: 'initialized' });
    expect(lifecycle.calls).toEqual(['preFlight', 'register']);
  });

  it('isolates a failed module — its sibling still initializes', async () => {
    const r = await bootstrap({
      ...opts,
      modules: [
        {
          manifest: fakeManifest({ id: 'bad' }),
          lifecycle: recordingLifecycle({ preFlight: 'err' })
        },
        {
          manifest: fakeManifest({ id: 'good' }),
          lifecycle: recordingLifecycle({ preFlight: 'ok' })
        }
      ]
    });
    const bad = r.diagnostics.modules.find((m) => m.moduleId === 'bad')!;
    const good = r.diagnostics.modules.find((m) => m.moduleId === 'good')!;
    expect(bad.state).toBe('failed');
    expect(good.state).toBe('initialized');
    expect(r.diagnostics.ready).toBe(false);
  });

  it('marks modules with unresolved requirements as failed', async () => {
    const r = await bootstrap({
      ...opts,
      modules: [
        {
          manifest: fakeManifest({
            id: 'orphan',
            dependencies: {
              requires: [{ capability: 'never_provided@1', version_range: '*' }],
              requires_optional: [],
              platform_capabilities_required: []
            }
          }),
          lifecycle: recordingLifecycle()
        }
      ]
    });
    const orphan = r.diagnostics.modules.find((m) => m.moduleId === 'orphan')!;
    expect(orphan.state).toBe('failed');
    expect(orphan.unresolved.map((u) => u.capability)).toContain('never_provided@1');
  });

  it('orders provider modules before consumers', async () => {
    const r = await bootstrap({
      ...opts,
      modules: [
        {
          // Consumer is listed FIRST in input; bootstrap should still init
          // the provider first.
          manifest: fakeManifest({
            id: 'consumer',
            dependencies: {
              requires: [{ capability: 'core.event_bus@1', version_range: '>=0.0.1' }],
              requires_optional: [],
              platform_capabilities_required: []
            }
          }),
          lifecycle: recordingLifecycle({ register: 'ok' })
        },
        {
          manifest: fakeManifest({
            id: 'provider',
            capabilities: {
              provides: [{ key: 'core.event_bus@1' }],
              provides_optional: []
            }
          }),
          lifecycle: recordingLifecycle({ register: 'ok' })
        }
      ]
    });
    const ids = r.registry.list().map((m) => m.manifest.identity.id);
    expect(ids.indexOf('provider')).toBeLessThan(ids.indexOf('consumer'));
  });

  it('records every lifecycle transition in history', async () => {
    const r = await bootstrap({
      ...opts,
      modules: [{ manifest: fakeManifest({ id: 'history.test' }), lifecycle: recordingLifecycle() }]
    });
    const transitions = r.engine
      .history()
      .filter((h) => h.moduleId === 'history.test')
      .map((h) => h.to);
    expect(transitions).toEqual(['discovered', 'validated', 'registered', 'initialized']);
  });

  it('surfaces phase timings in diagnostics', async () => {
    const r = await bootstrap({ ...opts, modules: [] });
    const phases = Object.keys(r.diagnostics.phaseDurations);
    expect(phases).toEqual(expect.arrayContaining(['load', 'resolve', 'initialize']));
  });

  it('surfaces duplicate-id load issues in diagnostics', async () => {
    const r = await bootstrap({
      ...opts,
      modules: [
        { manifest: fakeManifest({ id: 'dup' }), lifecycle: recordingLifecycle() },
        { manifest: fakeManifest({ id: 'dup' }), lifecycle: recordingLifecycle() }
      ]
    });
    expect(r.diagnostics.loadIssues.some((i) => i.kind === 'duplicate_id')).toBe(true);
  });
});
