import { createAdminClient, type SfosClient } from '@sfos/db/client';
import { pathToFileURL } from 'node:url';
import type { ModuleLogger } from '@sfos/module-sdk';

import {
  formatStartupOutput,
  buildStartupDiagnosticsView,
  buildStartupFailureView
} from './diagnostics.js';
import { composeRuntime, type ComposeRuntimeInput, type ComposedRuntime } from './index.js';

const HELP_TEXT = `Usage: sfos-runtime-host [options]

Options:
  --hydrate            Enumerate companies and hydrate activation mirrors
  --no-hydrate         Skip hydration explicitly
  --json               Print machine-readable diagnostics
  --pretty             Print human-readable diagnostics
  --fail-on-degraded   Exit non-zero when startup diagnostics are degraded
  --help               Show this help
`;

const DEFAULT_PLATFORM_VERSION = '0.1.0';
const DEFAULT_RUNTIME_MODE = 'self_hosted';

export interface RuntimeHostCliOptions {
  readonly hydrate: boolean;
  readonly format: 'json' | 'pretty';
  readonly failOnDegraded: boolean;
  readonly help: boolean;
}

interface ParsedCliArgs {
  readonly ok: true;
  readonly options: RuntimeHostCliOptions;
}

interface ParsedCliError {
  readonly ok: false;
  readonly message: string;
}

type ParsedCliResult = ParsedCliArgs | ParsedCliError;

type HydrationClient = Pick<SfosClient, 'db' | 'close'>;

export interface RuntimeHostCliDependencies {
  readonly composeRuntime: (input: ComposeRuntimeInput) => Promise<ComposedRuntime>;
  readonly createHydrationClient: (url: string) => HydrationClient | Promise<HydrationClient>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly env: NodeJS.ProcessEnv;
}

const defaultDependencies = (): RuntimeHostCliDependencies => ({
  composeRuntime,
  createHydrationClient: (url) => createAdminClient(url),
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  env: process.env
});

export const parseCliArgs = (argv: readonly string[]): ParsedCliResult => {
  let hydrate = false;
  let format: 'json' | 'pretty' = 'pretty';
  let failOnDegraded = false;
  let help = false;

  for (const arg of argv) {
    switch (arg) {
      case '--hydrate':
        hydrate = true;
        break;
      case '--no-hydrate':
        hydrate = false;
        break;
      case '--json':
        format = 'json';
        break;
      case '--pretty':
        format = 'pretty';
        break;
      case '--fail-on-degraded':
        failOnDegraded = true;
        break;
      case '--help':
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg}` };
    }
  }

  return {
    ok: true,
    options: { hydrate, format, failOnDegraded, help }
  };
};

const isDegraded = (runtime: ComposedRuntime): boolean =>
  !runtime.diagnostics.ready || Boolean(runtime.hydration && !runtime.hydration.ready);

const readHydrationDatabaseUrl = (env: NodeJS.ProcessEnv): string | undefined =>
  env['DATABASE_ADMIN_URL'] ?? env['TEST_DATABASE_URL'];

const silentLogger: ModuleLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger
};

export const runCli = async (
  argv: readonly string[],
  overrides: Partial<RuntimeHostCliDependencies> = {}
): Promise<number> => {
  const deps = { ...defaultDependencies(), ...overrides };
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    deps.stderr(formatStartupOutput(buildStartupFailureView(parsed.message), 'pretty'));
    deps.stderr(HELP_TEXT.trimEnd());
    return 1;
  }

  if (parsed.options.help) {
    deps.stdout(HELP_TEXT.trimEnd());
    return 0;
  }

  let hydrationClient: HydrationClient | undefined;
  try {
    if (parsed.options.hydrate) {
      const url = readHydrationDatabaseUrl(deps.env);
      if (!url) {
        deps.stderr(
          formatStartupOutput(
            buildStartupFailureView(
              'Hydration requested but runtime DB connection is not configured.'
            ),
            parsed.options.format
          )
        );
        return 1;
      }
      hydrationClient = await deps.createHydrationClient(url);
    }

    const runtime = await deps.composeRuntime({
      platformVersion: DEFAULT_PLATFORM_VERSION,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      loggerFor: () => silentLogger,
      hydration: hydrationClient ? { db: hydrationClient.db } : false
    });
    const view = buildStartupDiagnosticsView(runtime, parsed.options.hydrate);
    deps.stdout(formatStartupOutput(view, parsed.options.format));

    if (parsed.options.failOnDegraded && isDegraded(runtime)) {
      return 2;
    }
    return 0;
  } catch (error) {
    deps.stderr(formatStartupOutput(buildStartupFailureView(error), parsed.options.format));
    return 1;
  } finally {
    await hydrationClient?.close();
  }
};

export const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<void> => {
  process.exitCode = await runCli(argv);
};

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
