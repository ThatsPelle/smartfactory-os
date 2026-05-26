import { describe, expect, it } from 'vitest';

import { InMemoryModuleRegistry } from '../src/registry/module-registry.js';
import { loadModules } from '../src/manifests/loader.js';
import { ModuleAlreadyRegisteredError } from '../src/lifecycle/errors.js';
import { fakeManifest, recordingLifecycle } from './helpers.js';

const opts = {
  platformVersion: '0.1.0',
  runtimeMode: 'self_hosted' as const
};

describe('registry + manifest loader', () => {
  it('rejects duplicate manifest ids loudly', () => {
    const result = loadModules(
      [
        { manifest: fakeManifest({ id: 'dup' }), lifecycle: recordingLifecycle() },
        { manifest: fakeManifest({ id: 'dup' }), lifecycle: recordingLifecycle() }
      ],
      opts
    );
    expect(result.valid).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.kind).toBe('duplicate_id');
    expect(result.issues[0]!.moduleId).toBe('dup');
  });

  it('rejects a manifest whose platform_version_range excludes the runtime', () => {
    const result = loadModules(
      [
        {
          manifest: fakeManifest({
            id: 'incompatible',
            platform: {
              manifest_schema_version: '1',
              platform_version_range: '>=99.0.0',
              runtime_modes_supported: ['self_hosted']
            }
          }),
          lifecycle: recordingLifecycle()
        }
      ],
      opts
    );
    expect(result.valid).toHaveLength(0);
    expect(result.issues[0]!.kind).toBe('platform_version_mismatch');
  });

  it('rejects a manifest that does not declare support for the active runtime mode', () => {
    const result = loadModules(
      [
        {
          manifest: fakeManifest({
            id: 'cloud-only',
            platform: {
              manifest_schema_version: '1',
              platform_version_range: '*',
              runtime_modes_supported: ['cloud']
            }
          }),
          lifecycle: recordingLifecycle()
        }
      ],
      opts
    );
    expect(result.issues[0]!.kind).toBe('unsupported_runtime_mode');
  });

  it('registers modules and looks them up by capability', () => {
    const reg = new InMemoryModuleRegistry();
    const m = {
      manifest: fakeManifest({
        id: 'provider',
        capabilities: {
          provides: [{ key: 'demo.capability@1' }],
          provides_optional: []
        }
      }),
      lifecycle: recordingLifecycle()
    };
    reg.register(m);
    expect(reg.find('provider')).toBe(m);
    expect(reg.findByCapability('demo.capability@1')).toContain(m);
  });

  it('refuses to double-register the same id', () => {
    const reg = new InMemoryModuleRegistry();
    const m = { manifest: fakeManifest({ id: 'unique' }), lifecycle: recordingLifecycle() };
    reg.register(m);
    expect(() => reg.register(m)).toThrowError(ModuleAlreadyRegisteredError);
  });

  it('preserves a caller-supplied topological order in list()', () => {
    const reg = new InMemoryModuleRegistry();
    reg.register({ manifest: fakeManifest({ id: 'a' }), lifecycle: recordingLifecycle() });
    reg.register({ manifest: fakeManifest({ id: 'b' }), lifecycle: recordingLifecycle() });
    reg.register({ manifest: fakeManifest({ id: 'c' }), lifecycle: recordingLifecycle() });
    reg.setOrder(['c', 'a', 'b']);
    expect(reg.list().map((m) => m.manifest.identity.id)).toEqual(['c', 'a', 'b']);
  });
});
