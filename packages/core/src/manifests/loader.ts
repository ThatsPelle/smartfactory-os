import semverSatisfies from 'semver/functions/satisfies.js';
import { ManifestSchema, type Manifest } from '@sfos/contracts/manifest';
import type { RegisteredModule } from '@sfos/module-sdk';

/**
 * Manifest loading.
 *
 * Modules ship a manifest + a `ModuleLifecycle` implementation. In v1 the
 * platform receives them as PRE-RESOLVED objects from the bootstrap caller
 * (i.e. the app code does `loadModules([{ manifest, lifecycle }, ...])`).
 * Filesystem discovery is intentionally NOT here — explicit registration
 * is debuggable and a better fit for the runtime modes the platform
 * supports (cloud, self-hosted, workstation).
 *
 * What this module DOES do:
 *   1. Re-validates every manifest through `ManifestSchema` — `defineManifest`
 *      already did this at module import, but the runtime double-checks so
 *      a hot-loaded module from a future plugin system can't slip through.
 *   2. Rejects duplicate `identity.id` collisions loudly.
 *   3. Checks `platform_version_range` against the actual platform version.
 *
 * Output is a `LoadResult` — diagnostics first, valid modules second. The
 * caller decides what to do with invalid modules (typically: register the
 * valid ones, surface the invalid ones in diagnostics, and either continue
 * or abort based on whether any failed module is marked critical).
 */

export interface ManifestLoadIssue {
  readonly moduleId: string | null;
  readonly kind:
    | 'schema_invalid'
    | 'duplicate_id'
    | 'platform_version_mismatch'
    | 'unsupported_runtime_mode';
  readonly detail: string;
}

export interface LoadResult {
  readonly valid: readonly RegisteredModule[];
  readonly issues: readonly ManifestLoadIssue[];
}

export interface LoadOptions {
  /** Platform package version, e.g. `"0.1.0"`. */
  readonly platformVersion: string;
  /** Active runtime mode, e.g. `"self_hosted"`. */
  readonly runtimeMode: 'cloud' | 'self_hosted' | 'workstation';
}

interface CandidateModule {
  readonly manifest: unknown;
  readonly lifecycle: RegisteredModule['lifecycle'];
}

export const loadModules = (
  candidates: readonly CandidateModule[],
  opts: LoadOptions
): LoadResult => {
  const seen = new Set<string>();
  const valid: RegisteredModule[] = [];
  const issues: ManifestLoadIssue[] = [];

  for (const c of candidates) {
    const parsed = ManifestSchema.safeParse(c.manifest);
    if (!parsed.success) {
      const id = readId(c.manifest);
      issues.push({
        moduleId: id,
        kind: 'schema_invalid',
        detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      });
      continue;
    }
    const manifest: Manifest = parsed.data;
    const id = manifest.identity.id;

    if (seen.has(id)) {
      issues.push({
        moduleId: id,
        kind: 'duplicate_id',
        detail: `Another manifest already registered id "${id}". Manifest ids must be globally unique.`
      });
      continue;
    }

    if (!semverSatisfies(opts.platformVersion, manifest.platform.platform_version_range)) {
      issues.push({
        moduleId: id,
        kind: 'platform_version_mismatch',
        detail:
          `Module requires platform "${manifest.platform.platform_version_range}", ` +
          `runtime is "${opts.platformVersion}".`
      });
      continue;
    }

    if (!manifest.platform.runtime_modes_supported.includes(opts.runtimeMode)) {
      issues.push({
        moduleId: id,
        kind: 'unsupported_runtime_mode',
        detail:
          `Module does not declare support for runtime mode "${opts.runtimeMode}". ` +
          `Supported: ${manifest.platform.runtime_modes_supported.join(', ')}.`
      });
      continue;
    }

    seen.add(id);
    valid.push({ manifest, lifecycle: c.lifecycle });
  }

  return { valid, issues };
};

const readId = (manifest: unknown): string | null => {
  if (
    typeof manifest === 'object' &&
    manifest !== null &&
    'identity' in manifest &&
    typeof (manifest as { identity: unknown }).identity === 'object'
  ) {
    const identity = (manifest as { identity: { id?: unknown } }).identity;
    if (identity !== null && typeof identity.id === 'string') return identity.id;
  }
  return null;
};
