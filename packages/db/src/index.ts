/**
 * @sfos/db — public surface.
 *
 * Modules import from here. Internal files (env.ts, anything under a future
 * `internal/`) are not re-exported — keep the surface minimal so future
 * refactors don't break consumers.
 *
 * Architecture rules baked into imports:
 *   - There is no `repository` or `dao` export. Tenant-facing code composes
 *     queries against the Drizzle schema directly inside `withTenantContext`.
 *   - There is no admin client export from this barrel. The admin client
 *     factory is reachable only via the `./client` subpath, and
 *     dependency-cruiser rules (added when modules land) deny it to
 *     non-platform packages.
 */

export { createTenantClient, type SfosClient, type SfosDb } from './client.js';

export {
  withTenantContext,
  withSystemContext,
  type TenantContext,
  type SystemContext
} from './context.js';

export * as schema from './schema/index.js';
