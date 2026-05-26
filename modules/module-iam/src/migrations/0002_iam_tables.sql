-- 0002_iam_tables.sql
-- module_iam tables: credentials, sessions, invitations, password_reset_tokens.

BEGIN;

-- ---------- module_iam.credentials ----------
-- One row per user. No company_id — credentials are platform-scoped.
-- Written exclusively by module_iam_role; never by app_tenant.
CREATE TABLE module_iam.credentials (
  user_id                  uuid        PRIMARY KEY
                                         REFERENCES core.users(id) ON DELETE CASCADE,
  password_hash            text        NOT NULL,
  mfa_enabled              boolean     NOT NULL DEFAULT false,
  mfa_secret_enc           text,
  failed_attempts          integer     NOT NULL DEFAULT 0,
  locked_until             timestamptz,
  last_password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credentials_mfa_secret_requires_enabled
    CHECK (mfa_secret_enc IS NULL OR mfa_enabled = true)
);

CREATE TRIGGER credentials_touch_updated_at
  BEFORE UPDATE ON module_iam.credentials
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------- module_iam.sessions ----------
-- One row per active session. id is a ULID (text).
-- Written by module_iam_role; read/revoked by app_tenant via RLS.
CREATE TABLE module_iam.sessions (
  id                    text        PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES core.users(id)     ON DELETE CASCADE,
  company_id            uuid        NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  access_token_hash     text        NOT NULL UNIQUE,
  refresh_token_hash    text        NOT NULL UNIQUE,
  expires_at            timestamptz NOT NULL,
  refresh_expires_at    timestamptz NOT NULL,
  revoked_at            timestamptz,
  rotated_from_session_id text REFERENCES module_iam.sessions(id) ON DELETE SET NULL,
  ip_address            inet,
  user_agent            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_id_is_ulid
    CHECK (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  CONSTRAINT sessions_expires_before_refresh
    CHECK (expires_at < refresh_expires_at)
);

CREATE INDEX sessions_user_company_idx ON module_iam.sessions (user_id, company_id);
CREATE INDEX sessions_access_hash_idx  ON module_iam.sessions (access_token_hash);
CREATE INDEX sessions_active_idx       ON module_iam.sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TRIGGER sessions_touch_updated_at
  BEFORE UPDATE ON module_iam.sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------- module_iam.invitations ----------
CREATE TYPE module_iam.invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE module_iam.invitations (
  id            uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid                         NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  invited_email text                         NOT NULL,
  invited_role  membership_role              NOT NULL DEFAULT 'member',
  invited_by    uuid                         NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  token_hash    text                         NOT NULL UNIQUE,
  status        module_iam.invitation_status NOT NULL DEFAULT 'pending',
  expires_at    timestamptz                  NOT NULL,
  accepted_at   timestamptz,
  accepted_by   uuid                         REFERENCES core.users(id),
  revoked_at    timestamptz,
  revoked_by    uuid                         REFERENCES core.users(id),
  created_at    timestamptz                  NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_lower
    CHECK (invited_email = lower(invited_email))
);

CREATE INDEX invitations_company_status_idx ON module_iam.invitations (company_id, status);
CREATE UNIQUE INDEX invitations_single_pending_idx
  ON module_iam.invitations (company_id, invited_email)
  WHERE status = 'pending';

-- Prevent status regression: once accepted/revoked, cannot go back to pending.
CREATE OR REPLACE FUNCTION module_iam.invitations_guard_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('accepted', 'revoked') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'invitation % already %: status cannot change', OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION module_iam.invitations_guard_status() TO app_tenant;

CREATE TRIGGER invitations_guard_status
  BEFORE UPDATE ON module_iam.invitations
  FOR EACH ROW EXECUTE FUNCTION module_iam.invitations_guard_status();

-- ---------- module_iam.password_reset_tokens ----------
-- Append-only. Consuming sets consumed_at; rows are never deleted during TTL.
CREATE TABLE module_iam.password_reset_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  token_hash   text        NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prt_user_active_idx ON module_iam.password_reset_tokens (user_id)
  WHERE consumed_at IS NULL;

COMMIT;
