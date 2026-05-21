import { z } from 'zod';

/**
 * Branded primitives.
 *
 * A `Brand<K, T>` is a `K` that the type system also knows is "the T kind of K."
 * This prevents accidentally mixing a `UserId` with a `CompanyId` even though both
 * are strings at runtime. Constructors are validated Zod schemas.
 *
 * Frozen at v1. Do not rename existing brands.
 */

export type Brand<K, T> = K & { readonly __brand: T };

// ---------- Identifiers ----------

export type CompanyId = Brand<string, 'CompanyId'>;
export type UserId = Brand<string, 'UserId'>;
export type MembershipId = Brand<string, 'MembershipId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ModuleId = Brand<string, 'ModuleId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type DashboardId = Brand<string, 'DashboardId'>;
export type WidgetInstanceId = Brand<string, 'WidgetInstanceId'>;

/** ULID — 26-char Crockford base32, time-sortable. */
export type ULID = Brand<string, 'ULID'>;

// ---------- Zod schemas ----------

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidLike = z.string().regex(uuidV4, 'must be a UUIDv4');

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const CompanyIdSchema = uuidLike.brand<'CompanyId'>();
export const UserIdSchema = uuidLike.brand<'UserId'>();
export const MembershipIdSchema = uuidLike.brand<'MembershipId'>();
export const RoleIdSchema = uuidLike.brand<'RoleId'>();
export const SessionIdSchema = uuidLike.brand<'SessionId'>();
export const ModuleIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9.-]*[a-z0-9]$/, 'reverse-domain lowercase identifier')
  .brand<'ModuleId'>();
export const WorkspaceIdSchema = uuidLike.brand<'WorkspaceId'>();
export const DashboardIdSchema = uuidLike.brand<'DashboardId'>();
export const WidgetInstanceIdSchema = uuidLike.brand<'WidgetInstanceId'>();

export const ULIDSchema = z.string().regex(ulidPattern, 'must be a ULID').brand<'ULID'>();

// ---------- Convenience helpers ----------

/**
 * Construct a branded value from a raw string when you have already validated
 * the value upstream (e.g. RLS-resolved values from the DB). Prefer the Zod
 * schemas at trust boundaries.
 */
export const asCompanyId = (s: string): CompanyId => s as CompanyId;
export const asUserId = (s: string): UserId => s as UserId;
export const asULID = (s: string): ULID => s as ULID;
export const asModuleId = (s: string): ModuleId => s as ModuleId;
