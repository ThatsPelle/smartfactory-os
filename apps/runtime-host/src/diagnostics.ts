import type { ComposedRuntime } from './index.js';

export interface StartupDiagnosticsView {
  readonly status: 'ready' | 'degraded';
  readonly bootstrap: {
    readonly ready: boolean;
    readonly platformVersion: string;
    readonly runtimeMode: string;
    readonly startedAt: string;
    readonly phaseDurations: Readonly<Record<string, number>>;
    readonly modules: readonly {
      readonly moduleId: string;
      readonly version: string;
      readonly state: string;
      readonly providers: readonly string[];
      readonly unresolved: readonly { capability: string; versionRange: string }[];
    }[];
    readonly loadIssues: readonly {
      readonly moduleId: string | null;
      readonly kind: string;
      readonly detail: string;
    }[];
    readonly capabilityCycles: readonly (readonly string[])[];
  };
  readonly hydration: {
    readonly enabled: boolean;
    readonly ready?: boolean;
    readonly enumeratedCompanies?: number;
    readonly enumerationError?: {
      readonly code: string;
      readonly message: string;
    };
    readonly results?: readonly {
      readonly companyId: string;
      readonly companyName: string;
      readonly companySlug: string;
      readonly ready: boolean;
      readonly activeModuleIds: readonly string[];
      readonly diagnostics: readonly Record<string, unknown>[];
    }[];
  };
}

export interface StartupFailureView {
  readonly status: 'failed';
  readonly error: {
    readonly message: string;
  };
}

const REDACTED = '[REDACTED]';
const REDACTED_URL = '[REDACTED_URL]';
const REDACTED_PATH = '[REDACTED_PATH]';

const redactString = (value: string): string =>
  value
    .replace(
      /\b(?:DATABASE_URL|TEST_DATABASE_URL|DATABASE_ADMIN_URL|DATABASE_IAM_URL)\b/g,
      REDACTED
    )
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s"]+/gi, REDACTED_URL)
    .replace(/\b[A-Za-z]:\\[^\s"]+/g, REDACTED_PATH);

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizeValue(nested)])
    );
  }
  return value;
};

export const buildStartupDiagnosticsView = (
  runtime: ComposedRuntime,
  hydrationEnabled: boolean
): StartupDiagnosticsView =>
  sanitizeValue({
    status:
      runtime.diagnostics.ready && (!runtime.hydration || runtime.hydration.ready)
        ? 'ready'
        : 'degraded',
    bootstrap: {
      ready: runtime.diagnostics.ready,
      platformVersion: runtime.diagnostics.platformVersion,
      runtimeMode: runtime.diagnostics.runtimeMode,
      startedAt: runtime.diagnostics.startedAt.toISOString(),
      phaseDurations: runtime.diagnostics.phaseDurations,
      modules: runtime.diagnostics.modules.map((module) => ({
        moduleId: module.moduleId,
        version: module.version,
        state: module.state,
        providers: module.providers,
        unresolved: module.unresolved.map((requirement) => ({
          capability: requirement.capability,
          versionRange: requirement.versionRange
        }))
      })),
      loadIssues: runtime.diagnostics.loadIssues,
      capabilityCycles: runtime.diagnostics.capabilityCycles
    },
    hydration: runtime.hydration
      ? {
          enabled: hydrationEnabled,
          ready: runtime.hydration.ready,
          enumeratedCompanies: runtime.hydration.enumeratedCompanies,
          enumerationError: runtime.hydration.enumerationError,
          results: runtime.hydration.results.map((result) => ({
            companyId: result.companyId,
            companyName: result.companyName,
            companySlug: result.companySlug,
            ready: result.ready,
            activeModuleIds: result.activeModuleIds,
            diagnostics: result.diagnostics as readonly Record<string, unknown>[]
          }))
        }
      : {
          enabled: hydrationEnabled
        }
  }) as StartupDiagnosticsView;

export const buildStartupFailureView = (error: unknown): StartupFailureView =>
  sanitizeValue({
    status: 'failed',
    error: {
      message: error instanceof Error ? error.message : String(error)
    }
  }) as StartupFailureView;

const formatDiagnosticsPretty = (view: StartupDiagnosticsView): string => {
  const lines = [
    'Runtime startup',
    `Status: ${view.status}`,
    `Platform version: ${view.bootstrap.platformVersion}`,
    `Runtime mode: ${view.bootstrap.runtimeMode}`,
    `Bootstrap ready: ${view.bootstrap.ready ? 'yes' : 'no'}`,
    `Hydration: ${view.hydration.enabled ? (view.hydration.ready ? 'enabled' : 'enabled (degraded)') : 'disabled'}`,
    'Modules:'
  ];

  for (const module of view.bootstrap.modules) {
    lines.push(`- ${module.moduleId}@${module.version} ${module.state}`);
    if (module.unresolved.length > 0) {
      for (const unresolved of module.unresolved) {
        lines.push(`  unresolved: ${unresolved.capability} ${unresolved.versionRange}`);
      }
    }
  }

  if (view.bootstrap.loadIssues.length > 0) {
    lines.push('Load issues:');
    for (const issue of view.bootstrap.loadIssues) {
      lines.push(`- ${issue.moduleId ?? 'unknown'} ${issue.kind}: ${issue.detail}`);
    }
  }

  if (view.bootstrap.capabilityCycles.length > 0) {
    lines.push('Capability cycles:');
    for (const cycle of view.bootstrap.capabilityCycles) {
      lines.push(`- ${cycle.join(' -> ')}`);
    }
  }

  if (view.hydration.enabled) {
    lines.push(`Hydrated companies: ${view.hydration.enumeratedCompanies ?? 0}`);
    if (view.hydration.enumerationError) {
      lines.push(
        `Hydration enumeration error: ${view.hydration.enumerationError.code} ${view.hydration.enumerationError.message}`
      );
    }
    for (const result of view.hydration.results ?? []) {
      lines.push(
        `- ${result.companySlug} (${result.companyId}) ${result.ready ? 'ready' : 'degraded'} active=[${result.activeModuleIds.join(', ')}]`
      );
      for (const diagnostic of result.diagnostics) {
        lines.push(`  diagnostic: ${JSON.stringify(diagnostic)}`);
      }
    }
  }

  return lines.join('\n');
};

const formatFailurePretty = (view: StartupFailureView): string =>
  ['Runtime startup', `Status: ${view.status}`, `Error: ${view.error.message}`].join('\n');

export const formatStartupOutput = (
  view: StartupDiagnosticsView | StartupFailureView,
  format: 'json' | 'pretty'
): string => {
  if (format === 'json') return JSON.stringify(view, null, 2);
  return view.status === 'failed' ? formatFailurePretty(view) : formatDiagnosticsPretty(view);
};
