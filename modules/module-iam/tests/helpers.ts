import { sql } from 'drizzle-orm';
import type { EventEnvelope } from '@sfos/events';
import type { IamDb } from '../src/server/db/client.js';
import type { IamServiceCtx } from '../src/server/context.js';
import { hashPassword } from '../src/internal/password-hash.js';

export const TEST_COMPANY_ID = '00000000-0000-4000-a000-000000000001';

export const makeRecordingEvents = () => {
  const emitted: EventEnvelope[] = [];
  return {
    events: { emit: async (env: EventEnvelope) => { emitted.push(env); } },
    emitted
  };
};

const makeLogger = (): IamServiceCtx['logger'] => ({
  debug: () => {},
  info:  () => {},
  warn:  () => {},
  error: () => {},
  child: function() { return makeLogger(); }
});

export const makeIamCtx = (
  db: IamDb,
  overrides: Partial<IamServiceCtx> = {}
): { ctx: IamServiceCtx; emitted: EventEnvelope[] } => {
  const { events, emitted } = makeRecordingEvents();
  const ctx: IamServiceCtx = {
    companyId: TEST_COMPANY_ID as IamServiceCtx['companyId'],
    systemDb: db,
    tenantDb: db as unknown as IamServiceCtx['tenantDb'],
    events,
    logger: makeLogger() as IamServiceCtx['logger'],
    correlationId: 'test-corr-id',
    ...overrides
  };
  return { ctx, emitted };
};

export const seedUser = async (
  db: IamDb,
  email: string,
  password: string
): Promise<{ userId: string }> => {
  const rows = await db.execute(
    sql`INSERT INTO core.users (email) VALUES (${email})
        ON CONFLICT (lower(email)) DO UPDATE SET email = EXCLUDED.email
        RETURNING id`
  ) as Array<{ id: string }>;
  const userId = rows[0]!.id;
  const passwordHash = await hashPassword(password);
  await db.execute(
    sql`INSERT INTO module_iam.credentials (user_id, password_hash)
        VALUES (${userId}, ${passwordHash})
        ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`
  );
  return { userId };
};

export const cleanup = async (db: IamDb): Promise<void> => {
  await db.execute(sql`DELETE FROM module_iam.sessions`);
  await db.execute(sql`DELETE FROM module_iam.invitations`);
  await db.execute(sql`DELETE FROM module_iam.password_reset_tokens`);
  await db.execute(sql`DELETE FROM module_iam.credentials`);
  await db.execute(sql`DELETE FROM core.users WHERE email LIKE '%@test.example'`);
};
