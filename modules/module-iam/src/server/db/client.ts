import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export type IamDb = PostgresJsDatabase<typeof schema>;

export interface IamClient {
  readonly db: IamDb;
  readonly close: () => Promise<void>;
}

interface ClientOptions {
  readonly max?: number;
  readonly idleTimeout?: number;
}

export const createIamDb = (url: string, opts: ClientOptions = {}): IamClient => {
  const sql = postgres(url, {
    max: opts.max ?? 5,
    idle_timeout: opts.idleTimeout ?? 30,
    connection: { timezone: 'UTC' },
    onnotice: () => undefined
  });
  return {
    db: drizzle(sql, { schema }),
    close: async () => sql.end({ timeout: 5 })
  };
};
