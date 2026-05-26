-- 0002_app_rls_helpers.sql
--
-- RLS predicate functions. Three rules govern every helper here:
--
--   1. FAIL CLOSED. Missing context → NULL → no rows match. Never error,
--      never default to a "convenience" company.
--   2. STABLE volatility. The planner caches the result inside a single
--      statement, which is what RLS needs to evaluate predicates uniformly.
--   3. NO SECURITY DEFINER on tenant predicates. The function runs as the
--      caller; if the caller can't read memberships, neither can the helper.
--
-- Context propagation is via `SET LOCAL` in a transaction — see the TS
-- helper `withTenantContext` in src/context.ts. There is NO global mutable
-- state.

BEGIN;

-- ---------- current_company_id ----------
CREATE OR REPLACE FUNCTION app.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  -- `current_setting(_, true)` returns NULL when the setting is unset,
  -- instead of raising. NULLIF turns the empty string into NULL too, so
  -- the cast doesn't blow up on a half-initialized transaction.
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$;

COMMENT ON FUNCTION app.current_company_id() IS
  'Returns the tenant uuid bound to the current transaction via SET LOCAL, or NULL when unset (RLS denies all rows in that case).';

-- ---------- current_user_id ----------
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

COMMENT ON FUNCTION app.current_user_id() IS
  'Returns the user uuid bound to the current transaction, or NULL when unset.';

-- ---------- current_user_has(permission) ----------
-- v1 implementation: a permission is granted iff the current user has an
-- 'owner' or 'admin' membership in the current company. This is a stub —
-- when @sfos/contracts/permissions ships its full catalog, the body of this
-- function expands to a lookup against a permissions table that future
-- migrations create. The signature is frozen.
CREATE OR REPLACE FUNCTION app.current_user_has(_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM core.memberships m
    WHERE m.user_id    = app.current_user_id()
      AND m.company_id = app.current_company_id()
      AND m.role IN ('owner', 'admin')
  );
$$;

COMMENT ON FUNCTION app.current_user_has(text) IS
  'v1 permission check: true iff the current user is owner/admin in the current company. Stub for future full permission lookup.';

-- The argument _permission is currently unused but kept in the signature
-- so callers and policies can reference the final permission catalog today
-- without a future signature break.

GRANT EXECUTE ON FUNCTION app.current_company_id()      TO app_tenant;
GRANT EXECUTE ON FUNCTION app.current_user_id()         TO app_tenant;
GRANT EXECUTE ON FUNCTION app.current_user_has(text)    TO app_tenant;

COMMIT;
