import { asCompanyId } from '@sfos/contracts';
import { describe, expect, it } from 'vitest';

import { StartupHydrationOrchestrator } from '../src/activation/startup-hydration.js';
import { InMemoryModuleRegistry } from '../src/registry/module-registry.js';
import { fakeManifest, recordingLifecycle } from './helpers.js';

describe('startup hydration orchestration', () => {
  it('returns empty success when no companies are enumerated', async () => {
    const registry = new InMemoryModuleRegistry();
    const orchestrator = new StartupHydrationOrchestrator({
      db: {} as never,
      registry,
      enumerateCompanies: async () => [],
      listCompanyActivations: async () => []
    });

    await expect(orchestrator.hydrateAllCompanies()).resolves.toEqual({
      ready: true,
      enumeratedCompanies: 0,
      results: []
    });
  });

  it('fails fast on company enumeration errors', async () => {
    const registry = new InMemoryModuleRegistry();
    const orchestrator = new StartupHydrationOrchestrator({
      db: {} as never,
      registry,
      enumerateCompanies: async () => {
        throw new Error('company listing unavailable');
      },
      listCompanyActivations: async () => []
    });

    await expect(orchestrator.hydrateAllCompanies()).resolves.toEqual({
      ready: false,
      enumeratedCompanies: 0,
      results: [],
      enumerationError: {
        code: 'company_enumeration_failed',
        message: 'company listing unavailable'
      }
    });
  });

  it('degrades one company when activation rows cannot be listed', async () => {
    const alpha = asCompanyId('10000000-0000-4000-8000-000000000001');
    const beta = asCompanyId('10000000-0000-4000-8000-000000000002');
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: recordingLifecycle({ activate: 'ok', deactivate: 'ok' })
    });
    registry.markActive('stale.module', beta);

    const orchestrator = new StartupHydrationOrchestrator({
      db: {} as never,
      registry,
      enumerateCompanies: async () => [
        { companyId: alpha, name: 'Alpha', slug: 'alpha' },
        { companyId: beta, name: 'Beta', slug: 'beta' }
      ],
      listCompanyActivations: async (_db, companyId) => {
        if (companyId === beta) {
          throw new Error('activation rows unreadable');
        }
        return [{ moduleId: 'sfos.iam', status: 'active', enabled: true }];
      }
    });

    const result = await orchestrator.hydrateAllCompanies();

    expect(result).toEqual({
      ready: false,
      enumeratedCompanies: 2,
      results: [
        {
          companyId: alpha,
          companyName: 'Alpha',
          companySlug: 'alpha',
          ready: true,
          activeModuleIds: ['sfos.iam'],
          diagnostics: []
        },
        {
          companyId: beta,
          companyName: 'Beta',
          companySlug: 'beta',
          ready: false,
          activeModuleIds: [],
          diagnostics: [
            {
              code: 'company_activation_query_failed',
              message: 'activation rows unreadable'
            }
          ]
        }
      ]
    });
    await expect(registry.isActive('sfos.iam', alpha)).resolves.toBe(true);
    await expect(registry.isActive('stale.module', beta)).resolves.toBe(false);
  });
});
