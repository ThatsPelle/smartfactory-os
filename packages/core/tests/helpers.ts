import type { Manifest } from '@sfos/contracts/manifest';
import type { ModuleLifecycle } from '@sfos/module-sdk';

/**
 * Build a minimal valid manifest. Override any field via `overrides`.
 *
 * The defaults satisfy ManifestSchema but advertise nothing — useful for
 * tests that care about lifecycle / registry behavior, not domain shape.
 */
export const fakeManifest = (overrides: Partial<Manifest> & { id?: string } = {}): Manifest => {
  const id = overrides.id ?? 'test.example';
  const base: Manifest = {
    identity: {
      id,
      name: id,
      version: '0.1.0',
      vendor: 'Test',
      license: 'MIT'
    },
    platform: {
      manifest_schema_version: '1',
      platform_version_range: '>=0.0.1',
      runtime_modes_supported: ['cloud', 'self_hosted', 'workstation']
    },
    capabilities: { provides: [], provides_optional: [] },
    dependencies: { requires: [], requires_optional: [], platform_capabilities_required: [] },
    schema: { namespace: 'test', owns_tables: [], published_views: [] },
    migrations: { directory: 'db/migrations', ordering: 'sequential' },
    permissions: [],
    events_produced: [],
    events_consumed: [],
    metadata: { description: 'fake module for tests' }
  };
  // Shallow merge — tests that need deep overrides build full blocks.
  const { id: _id, ...rest } = overrides;
  void _id;
  return { ...base, ...rest } as Manifest;
};

/** Lifecycle that records hook calls; defaults to all-ok. */
export const recordingLifecycle = (
  opts: {
    preFlight?: 'ok' | 'err' | 'throw';
    register?: 'ok' | 'err' | 'throw';
  } = {}
): ModuleLifecycle & { calls: string[] } => {
  const calls: string[] = [];
  const result = (k: 'ok' | 'err' | 'throw' | undefined, name: string) => {
    if (k === 'throw') throw new Error(`${name} threw`);
    if (k === 'err') return { ok: false as const, error: `${name} returned err` };
    return { ok: true as const, value: undefined };
  };
  return {
    calls,
    preFlight: opts.preFlight
      ? async () => {
          calls.push('preFlight');
          return result(opts.preFlight, 'preFlight');
        }
      : undefined,
    register: opts.register
      ? async () => {
          calls.push('register');
          return result(opts.register, 'register');
        }
      : undefined
  } as ModuleLifecycle & { calls: string[] };
};
