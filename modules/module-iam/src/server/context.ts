import type { CompanyId, UserId } from '@sfos/contracts';
import type { SfosDb } from '@sfos/db';
import type { EventEmissionApi, ModuleLogger } from '@sfos/module-sdk';

import type { IamDb } from './db/client.js';

export interface IamServiceCtx {
  readonly companyId: CompanyId;
  /** undefined for pre-auth operations (login, acceptInvitation, passwordReset). */
  readonly actorUserId?: UserId;
  /** module_iam_role connection — bypasses RLS for credential/session operations. */
  readonly systemDb: IamDb;
  /** app_tenant connection — used with withTenantContext for cross-module writes. */
  readonly tenantDb: SfosDb;
  /** Pre-scoped to companyId. Writes go to core.outbox_events via platform outbox. */
  readonly events: EventEmissionApi;
  readonly logger: ModuleLogger;
  readonly correlationId: string;
}
