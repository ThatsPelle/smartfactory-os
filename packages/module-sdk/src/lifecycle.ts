import type { Result } from '@sfos/contracts/result';
import type { CompanyId, UserId } from '@sfos/contracts/brands';
import type { EventEnvelope } from '@sfos/contracts/envelope';

/**
 * Module lifecycle.
 *
 * Every module exports a single object implementing this interface from its
 * `src/server/index.ts`. The platform's module registry calls these hooks in
 * a documented sequence (see docs/architecture/04-manifest-and-events.md §5).
 *
 * Hooks marked optional may be omitted entirely.
 */
export interface ModuleLifecycle {
  /**
   * Called once per platform startup, before any tenant activations.
   *
   * Use for: cheap sanity checks (env vars, schema readiness). Must complete
   * quickly (< 1s); long checks delay platform startup unacceptably.
   *
   * Returning `Err` prevents the module from being available to any tenant.
   */
  preFlight?(ctx: PlatformContext): Promise<Result<void, string>>;

  /**
   * Called once per tenant that activates this module.
   *
   * Use for: per-tenant initialization beyond migrations + seeds (which the
   * registry runs from manifest declarations).
   *
   * Returning `Err` causes the activation transaction to roll back.
   */
  activate?(ctx: TenantContext): Promise<Result<void, string>>;

  /**
   * Called when a tenant deactivates this module.
   *
   * Use for: clean shutdown of module-local resources for that tenant.
   * Data is retained until explicit uninstall.
   */
  deactivate?(ctx: TenantContext): Promise<Result<void, string>>;

  /**
   * Called per platform startup *after* preFlight, before user traffic.
   *
   * Use for: registering event handlers, scheduled jobs, internal services.
   */
  register?(ctx: PlatformContext): Promise<Result<void, string>>;
}

/**
 * Platform context provided to platform-level lifecycle hooks (preFlight,
 * register).
 *
 * Scoped to the platform — no specific tenant.
 */
export interface PlatformContext {
  /** Logger scoped to this module. */
  readonly logger: ModuleLogger;
  /** Read access to the platform's settings (feature flags, env). */
  readonly settings: PlatformSettings;
  /** Hook to subscribe an event handler. Called inside `register`. */
  readonly events: EventSubscriptionApi;
  /** Module's own identity. */
  readonly moduleId: string;
}

/**
 * Tenant context provided to tenant-level lifecycle hooks (activate,
 * deactivate) and event handlers.
 */
export interface TenantContext {
  readonly companyId: CompanyId;
  readonly actorUserId?: UserId;
  readonly logger: ModuleLogger;
  readonly events: EventEmissionApi;
  readonly moduleId: string;
}

/** Logger interface. Implementations route to pino/console/test-sink. */
export interface ModuleLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): ModuleLogger;
}

/** Read-only access to platform-level settings during lifecycle. */
export interface PlatformSettings {
  get<T = string>(key: string): T | undefined;
  has(key: string): boolean;
}

/** Subscribe to events from the platform bus. */
export interface EventSubscriptionApi {
  /**
   * Register a handler for events matching `pattern`. Wildcards allowed
   * (e.g., `warehouse.stock.*`). The handler is invoked once per matching
   * event. Idempotency is the handler's responsibility.
   */
  subscribe(
    pattern: string,
    handler: (event: EventEnvelope, ctx: TenantContext) => Promise<void>
  ): void;
}

/** Emit events scoped to a tenant. Used by tenant-scoped code paths. */
export interface EventEmissionApi {
  emit(envelope: EventEnvelope): Promise<void>;
}
