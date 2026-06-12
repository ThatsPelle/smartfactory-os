import type { CompanyId } from '@sfos/contracts';
import type { EventEnvelope } from '@sfos/contracts/envelope';
import { schema, type SfosDb } from '@sfos/db';
import type { RegisteredModule } from '@sfos/module-sdk';

import { ForeignEmissionError, UndeclaredEmissionError } from '../events/ownership.js';

export const createModuleEventEmitter = (
  tx: SfosDb,
  module: RegisteredModule,
  companyId: CompanyId
) => {
  const declared = new Set(module.manifest.events_produced.map(({ type }) => type));
  return {
    emit: async (envelope: EventEnvelope): Promise<void> => {
      if (envelope.source_module !== module.manifest.identity.id) {
        throw new ForeignEmissionError(
          module.manifest.identity.id,
          envelope.source_module,
          envelope.type
        );
      }
      if (!declared.has(envelope.type)) {
        throw new UndeclaredEmissionError(module.manifest.identity.id, envelope.type);
      }
      if (envelope.company_id !== companyId) {
        throw new Error(`Lifecycle event ${envelope.type} has wrong company_id`);
      }
      await tx.insert(schema.outboxEvents).values({
        id: envelope.id,
        companyId: envelope.company_id,
        type: envelope.type,
        version: envelope.version,
        sourceModule: envelope.source_module,
        correlationId: envelope.correlation_id,
        causationId: envelope.causation_id,
        envelope,
        occurredAt: new Date(envelope.occurred_at)
      });
    }
  };
};
