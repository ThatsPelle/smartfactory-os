import { describe, expect, it } from 'vitest';

import { resolveCapabilities, parseCapabilityKey, satisfies } from '../src/capabilities/index.js';
import { fakeManifest, recordingLifecycle } from './helpers.js';

const mod = (
  id: string,
  opts: {
    provides?: string[];
    requires?: { capability: string; versionRange: string }[];
    version?: string;
  }
) => ({
  manifest: fakeManifest({
    id,
    identity: {
      id,
      name: id,
      version: opts.version ?? '1.0.0',
      vendor: 'Test',
      license: 'MIT'
    },
    capabilities: {
      provides: (opts.provides ?? []).map((key) => ({ key })),
      provides_optional: []
    },
    dependencies: {
      requires: (opts.requires ?? []).map((r) => ({
        capability: r.capability,
        version_range: r.versionRange
      })),
      requires_optional: [],
      platform_capabilities_required: []
    }
  }),
  lifecycle: recordingLifecycle()
});

describe('capability resolution', () => {
  it('parses capability keys and rejects malformed ones', () => {
    expect(parseCapabilityKey('a.b@1')).toMatchObject({ name: 'a.b', major: 1 });
    expect(() => parseCapabilityKey('no-version')).toThrow();
    expect(() => parseCapabilityKey('a.b@x')).toThrow();
  });

  it('satisfies matches name+major exactly and version range loosely', () => {
    expect(
      satisfies(
        { capability: 'a.b@1', versionRange: '>=1.0.0' },
        'a.b@1',
        '1.2.3'
      )
    ).toBe(true);
    expect(
      satisfies(
        { capability: 'a.b@2', versionRange: '>=1.0.0' },
        'a.b@1',
        '1.2.3'
      )
    ).toBe(false);
    expect(
      satisfies(
        { capability: 'a.b@1', versionRange: '>=2.0.0' },
        'a.b@1',
        '1.2.3'
      )
    ).toBe(false);
  });

  it('topologically orders providers before consumers', () => {
    const provider = mod('provider', { provides: ['svc@1'] });
    const consumer = mod('consumer', {
      requires: [{ capability: 'svc@1', versionRange: '>=1.0.0' }]
    });
    const r = resolveCapabilities([consumer, provider]);
    expect(r.order.indexOf('provider')).toBeLessThan(r.order.indexOf('consumer'));
    expect(r.providersByModule.get('consumer')).toEqual(['provider']);
    expect(r.unresolvedByModule.size).toBe(0);
  });

  it('flags missing requirements', () => {
    const lonely = mod('lonely', {
      requires: [{ capability: 'no_one_provides@1', versionRange: '*' }]
    });
    const r = resolveCapabilities([lonely]);
    expect(r.unresolvedByModule.get('lonely')).toEqual([
      { capability: 'no_one_provides@1', versionRange: '*' }
    ]);
  });

  it('detects capability cycles', () => {
    const a = mod('a', {
      provides: ['x@1'],
      requires: [{ capability: 'y@1', versionRange: '*' }]
    });
    const b = mod('b', {
      provides: ['y@1'],
      requires: [{ capability: 'x@1', versionRange: '*' }]
    });
    const r = resolveCapabilities([a, b]);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]).toEqual(expect.arrayContaining(['a', 'b']));
  });
});
