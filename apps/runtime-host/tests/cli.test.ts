import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComposedRuntime } from '../src/index.js';

const baseRuntime = (): ComposedRuntime =>
  ({
    registry: {
      find: vi.fn(),
      findByCapability: vi.fn(),
      list: vi.fn(),
      isActive: vi.fn(),
      activeCapabilities: vi.fn()
    },
    bus: {
      subscribe: vi.fn(),
      publish: vi.fn()
    },
    engine: {
      history: vi.fn()
    },
    diagnostics: {
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted',
      startedAt: new Date('2026-06-12T00:00:00.000Z'),
      ready: true,
      phaseDurations: { load: 1, resolve: 2, initialize: 3 },
      loadIssues: [],
      capabilityCycles: [],
      modules: [
        {
          moduleId: 'sfos.iam',
          version: '0.1.0',
          state: 'initialized',
          unresolved: [],
          providers: []
        }
      ],
      lifecycleHistory: []
    }
  }) as ComposedRuntime;

describe('runtime host cli', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help and exits zero', async () => {
    const { runCli } = await import('../src/cli.js');
    const stdout: string[] = [];

    const exitCode = await runCli(['--help'], {
      composeRuntime: vi.fn(),
      createHydrationClient: vi.fn(),
      stdout: (line) => stdout.push(line),
      stderr: vi.fn(),
      env: {}
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('--hydrate');
    expect(stdout.join('\n')).toContain('--fail-on-degraded');
  });

  it('default run does not hydrate', async () => {
    const { runCli } = await import('../src/cli.js');
    const composeRuntime = vi.fn().mockResolvedValue(baseRuntime());

    const exitCode = await runCli([], {
      composeRuntime,
      createHydrationClient: vi.fn(),
      stdout: vi.fn(),
      stderr: vi.fn(),
      env: { DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam' }
    });

    expect(exitCode).toBe(0);
    expect(composeRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        hydration: false,
        loggerFor: expect.any(Function)
      })
    );
  });

  it('hydrate flag invokes hydration path', async () => {
    const { runCli } = await import('../src/cli.js');
    const composeRuntime = vi.fn().mockResolvedValue({
      ...baseRuntime(),
      hydration: { ready: true, enumeratedCompanies: 0, results: [] }
    });
    const close = vi.fn().mockResolvedValue(undefined);
    const createHydrationClient = vi.fn().mockReturnValue({
      db: {} as never,
      close
    });

    const exitCode = await runCli(['--hydrate'], {
      composeRuntime,
      createHydrationClient,
      stdout: vi.fn(),
      stderr: vi.fn(),
      env: {
        DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam',
        DATABASE_ADMIN_URL: 'postgres://admin:secret@runtime-host.invalid/sfos'
      }
    });

    expect(exitCode).toBe(0);
    expect(createHydrationClient).toHaveBeenCalledWith(
      'postgres://admin:secret@runtime-host.invalid/sfos'
    );
    expect(composeRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        loggerFor: expect.any(Function),
        hydration: expect.objectContaining({
          db: expect.any(Object)
        })
      })
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('json flag emits valid redacted json', async () => {
    const { runCli } = await import('../src/cli.js');
    const stdout: string[] = [];
    const composeRuntime = vi.fn().mockResolvedValue({
      ...baseRuntime(),
      diagnostics: {
        ...baseRuntime().diagnostics,
        ready: false,
        loadIssues: [
          {
            moduleId: 'sfos.iam',
            kind: 'platform_version_mismatch',
            detail:
              'Broken via TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/sfos_test'
          }
        ]
      }
    });

    const exitCode = await runCli(['--json'], {
      composeRuntime,
      createHydrationClient: vi.fn(),
      stdout: (line) => stdout.push(line),
      stderr: vi.fn(),
      env: { DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam' }
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.join('\n')) as {
      status: string;
      bootstrap: { ready: boolean };
    };
    expect(parsed.status).toBe('degraded');
    expect(parsed.bootstrap.ready).toBe(false);
    expect(stdout.join('\n')).not.toContain('TEST_DATABASE_URL');
    expect(stdout.join('\n')).not.toContain(
      'postgres://postgres:postgres@localhost:5432/sfos_test'
    );
  });

  it('pretty flag emits readable output', async () => {
    const { runCli } = await import('../src/cli.js');
    const stdout: string[] = [];

    const exitCode = await runCli(['--pretty'], {
      composeRuntime: vi.fn().mockResolvedValue(baseRuntime()),
      createHydrationClient: vi.fn(),
      stdout: (line) => stdout.push(line),
      stderr: vi.fn(),
      env: { DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam' }
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Runtime startup');
    expect(stdout.join('\n')).toContain('Hydration: disabled');
    expect(stdout.join('\n')).toContain('sfos.iam');
  });

  it('degraded diagnostics with fail-on-degraded exits non-zero', async () => {
    const { runCli } = await import('../src/cli.js');

    const exitCode = await runCli(['--fail-on-degraded'], {
      composeRuntime: vi.fn().mockResolvedValue({
        ...baseRuntime(),
        diagnostics: {
          ...baseRuntime().diagnostics,
          ready: false
        }
      }),
      createHydrationClient: vi.fn(),
      stdout: vi.fn(),
      stderr: vi.fn(),
      env: { DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam' }
    });

    expect(exitCode).toBe(2);
  });

  it('infrastructure failure exits non-zero', async () => {
    const { runCli } = await import('../src/cli.js');
    const stderr: string[] = [];

    const exitCode = await runCli(['--hydrate'], {
      composeRuntime: vi.fn(),
      createHydrationClient: vi.fn(),
      stdout: vi.fn(),
      stderr: (line) => stderr.push(line),
      env: { DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam' }
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Hydration requested');
  });

  it('output does not include DATABASE_URL or TEST_DATABASE_URL strings', async () => {
    const { runCli } = await import('../src/cli.js');
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(['--json', '--fail-on-degraded'], {
      composeRuntime: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Boot failed DATABASE_URL=postgres://postgres:postgres@localhost:5432/sfos TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55434/sfos_test'
          )
        ),
      createHydrationClient: vi.fn(),
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      env: {
        DATABASE_IAM_URL: 'postgres://runtime-host.invalid/iam',
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/sfos',
        TEST_DATABASE_URL: 'postgres://postgres:postgres@localhost:55434/sfos_test'
      }
    });

    expect(exitCode).toBe(1);
    expect(stdout.join('\n')).not.toContain('DATABASE_URL');
    expect(stdout.join('\n')).not.toContain('TEST_DATABASE_URL');
    expect(stderr.join('\n')).not.toContain('DATABASE_URL');
    expect(stderr.join('\n')).not.toContain('TEST_DATABASE_URL');
  });
});
