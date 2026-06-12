import {
  bootstrap,
  StartupHydrationOrchestrator,
  type BootstrapInput,
  type BootstrapResult,
  type StartupHydrationOrchestratorOptions,
  type StartupHydrationReport
} from '@sfos/core';
import type { SfosDb } from '@sfos/db';
import iamManifest from '@sfos/iam/manifest';
import { lifecycle as iamLifecycle } from '@sfos/iam';

const defaultModules = [{ manifest: iamManifest, lifecycle: iamLifecycle }] as const;

export interface ComposeRuntimeInput extends Pick<
  BootstrapInput,
  'platformVersion' | 'runtimeMode' | 'loggerFor' | 'settings'
> {
  readonly modules?: BootstrapInput['modules'];
  readonly hydration?: false | ComposeRuntimeHydrationOptions;
}

export interface ComposeRuntimeHydrationOptions extends Omit<
  StartupHydrationOrchestratorOptions,
  'registry' | 'db'
> {
  readonly db: SfosDb;
}

export interface ComposedRuntime extends BootstrapResult {
  readonly hydration?: StartupHydrationReport;
}

export const composeRuntime = async (input: ComposeRuntimeInput): Promise<ComposedRuntime> => {
  const runtime = await bootstrap({
    platformVersion: input.platformVersion,
    runtimeMode: input.runtimeMode,
    ...(input.loggerFor ? { loggerFor: input.loggerFor } : {}),
    ...(input.settings ? { settings: input.settings } : {}),
    modules: input.modules ?? defaultModules
  });

  if (!input.hydration) return runtime;

  const hydration = await new StartupHydrationOrchestrator({
    db: input.hydration.db,
    registry: runtime.registry,
    ...(input.hydration.platformCapabilities
      ? { platformCapabilities: input.hydration.platformCapabilities }
      : {}),
    ...(input.hydration.enumerateCompanies
      ? { enumerateCompanies: input.hydration.enumerateCompanies }
      : {}),
    ...(input.hydration.listCompanyActivations
      ? { listCompanyActivations: input.hydration.listCompanyActivations }
      : {})
  }).hydrateAllCompanies();

  return { ...runtime, hydration };
};

export { defaultModules };
