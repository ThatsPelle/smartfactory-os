import type { CapabilityRequirement } from '../capabilities/version.js';
import type { LifecycleHistoryEntry } from '../lifecycle/engine.js';
import type { ModuleState } from '../lifecycle/state.js';
import type { ManifestLoadIssue } from '../manifests/loader.js';

/**
 * Runtime diagnostics snapshot.
 *
 * What the operator (and any future admin UI) needs to answer the questions:
 *   - "Did every module come up?"
 *   - "If not, which one and why?"
 *   - "Where are we in the startup sequence?"
 *
 * The snapshot is a plain data object. It serializes to JSON for logging
 * and is human-readable through `reporter.ts`. There is intentionally no
 * push mechanism; the operator polls or the bootstrap logs it once after
 * startup completes.
 */

export interface ModuleDiagnostic {
  readonly moduleId: string;
  readonly version: string;
  readonly state: ModuleState;
  /** Capability requirements that could not be resolved at boot. */
  readonly unresolved: readonly CapabilityRequirement[];
  /** Provider module ids that satisfy this module's requirements. */
  readonly providers: readonly string[];
}

export interface RuntimeDiagnostics {
  readonly platformVersion: string;
  readonly runtimeMode: string;
  readonly startedAt: Date;
  readonly ready: boolean;
  /** Wall-clock ms spent in each startup phase. */
  readonly phaseDurations: Readonly<Record<string, number>>;
  /** Manifest-load issues, in input order. */
  readonly loadIssues: readonly ManifestLoadIssue[];
  /** Capability cycles detected during resolution. */
  readonly capabilityCycles: readonly (readonly string[])[];
  /** Per-module state + capability resolution. */
  readonly modules: readonly ModuleDiagnostic[];
  /** Full lifecycle transition history (bounded, see engine). */
  readonly lifecycleHistory: readonly LifecycleHistoryEntry[];
}
