-- 0001_core_tables.sql
--
-- The minimal core schema: companies, users, memberships, company_modules,
-- audit_logs, outbox_events. Mirrors the Drizzle definitions under
-- packages/db/src/schema. Hand-edited (not drizzle-kit generated) because
-- this is the foundational migration — once a real schema diff exists, this
-- file freezes and further changes go through generated migrations.
--
-- Conventions:
--   - timestamptz, never plain timestamp
--   - now() defaults; trigger-managed `updated_at` (see updater function)
--   - FK ON DELETE rules are explicit and conservative
--   - UNIQUE constraints are NAMED so error messages are stable

BEGIN;

-- ---------- updated_at trigger function ----------
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

COMMENT ON FUNCTION app.touch_updated_at() IS
  'Trigger function: stamps updated_at = now() on every row update.';

-- ---------- core.companies ----------
CREATE TABLE core.companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_slug_unique UNIQUE (slug)
);

CREATE TRIGGER companies_touch_updated_at
  BEFORE UPDATE ON core.companies
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------- core.users ----------
CREATE TABLE core.users (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive email uniqueness without depending on the citext extension.
CREATE UNIQUE INDEX users_email_lower_unique ON core.users (lower(email));

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------- core.memberships ----------
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE core.memberships (
  id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid            NOT NULL REFERENCES core.users(id)     ON DELETE CASCADE,
  company_id  uuid            NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  role        membership_role NOT NULL DEFAULT 'member',
  created_at  timestamptz     NOT NULL DEFAULT now(),
  updated_at  timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_company_unique UNIQUE (user_id, company_id)
);

CREATE INDEX memberships_user_idx    ON core.memberships (user_id);
CREATE INDEX memberships_company_idx ON core.memberships (company_id);

CREATE TRIGGER memberships_touch_updated_at
  BEFORE UPDATE ON core.memberships
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------- core.company_modules ----------
CREATE TABLE core.company_modules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  module_id    text        NOT NULL,
  enabled      boolean     NOT NULL DEFAULT true,
  enabled_at   timestamptz NOT NULL DEFAULT now(),
  disabled_at  timestamptz,
  CONSTRAINT company_modules_company_module_unique UNIQUE (company_id, module_id)
);

CREATE INDEX company_modules_company_idx ON core.company_modules (company_id);

-- ---------- core.audit_logs ----------
CREATE TABLE core.audit_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: platform-system events have no tenant. RLS handles visibility.
  company_id      uuid        REFERENCES core.companies(id) ON DELETE RESTRICT,
  actor_kind      text        NOT NULL,
  actor_id        text        NOT NULL,
  action          text        NOT NULL,
  entity_kind     text        NOT NULL,
  entity_id       text        NOT NULL,
  changes         jsonb,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  text,
  causation_id    text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_company_recorded_idx ON core.audit_logs (company_id, recorded_at);
CREATE INDEX audit_logs_entity_idx           ON core.audit_logs (entity_kind, entity_id);
CREATE INDEX audit_logs_correlation_idx      ON core.audit_logs (correlation_id);

-- ---------- core.outbox_events ----------
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'published', 'failed');

CREATE TABLE core.outbox_events (
  -- ULID per @sfos/contracts envelope. Stored as text(26).
  id              text          PRIMARY KEY,
  company_id      uuid          REFERENCES core.companies(id) ON DELETE RESTRICT,
  type            text          NOT NULL,
  version         text          NOT NULL,
  source_module   text          NOT NULL,
  correlation_id  text          NOT NULL,
  causation_id    text,
  envelope        jsonb         NOT NULL,
  status          outbox_status NOT NULL DEFAULT 'pending',
  attempts        integer       NOT NULL DEFAULT 0,
  last_error      text,
  occurred_at     timestamptz   NOT NULL,
  recorded_at     timestamptz   NOT NULL DEFAULT now(),
  published_at    timestamptz,
  CONSTRAINT outbox_events_id_is_ulid CHECK (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);

CREATE INDEX outbox_status_recorded_idx ON core.outbox_events (status, recorded_at);
CREATE INDEX outbox_company_idx         ON core.outbox_events (company_id);
CREATE INDEX outbox_correlation_idx     ON core.outbox_events (correlation_id);

COMMIT;
