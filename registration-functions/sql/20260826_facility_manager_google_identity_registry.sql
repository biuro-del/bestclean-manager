-- CONTROLLED ADDITIVE MIGRATION. Execute only with explicit release approval.
-- The table is a pseudonymous one-panel-per-Google-identity registry; it does
-- not modify existing organizations, memberships, trials, subscriptions or objects.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtext('cleanzi:facility-manager-google-identity-registry:v1')
);

CREATE TABLE IF NOT EXISTS public.facility_manager_google_identity (
  google_identity_key varchar(64) PRIMARY KEY,
  provider_id varchar(40) NOT NULL,
  org_id varchar(64) NOT NULL,
  registration_operation_id varchar(160) NOT NULL,
  registration_audit_id varchar(64) NOT NULL,
  owner_uid varchar(128) NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT facility_manager_google_identity_provider_check
    CHECK (provider_id = 'google.com'),
  CONSTRAINT facility_manager_google_identity_key_format_check
    CHECK (google_identity_key ~ '^fmgi_[A-Za-z0-9_-]{43}$'),
  CONSTRAINT facility_manager_google_identity_org_format_check
    CHECK (org_id ~ '^org_fm_[A-Za-z0-9_-]+$'),
  CONSTRAINT facility_manager_google_identity_operation_format_check
    CHECK (registration_operation_id ~ '^fmreg_[A-Za-z0-9_-]+$'),
  CONSTRAINT facility_manager_google_identity_audit_format_check
    CHECK (registration_audit_id ~ '^fmreg_[A-Za-z0-9_-]+$'),
  CONSTRAINT facility_manager_google_identity_owner_uid_check
    CHECK (btrim(owner_uid) <> ''),
  CONSTRAINT facility_manager_google_identity_org_unique UNIQUE (org_id),
  CONSTRAINT facility_manager_google_identity_operation_unique UNIQUE (registration_operation_id),
  CONSTRAINT facility_manager_google_identity_audit_unique UNIQUE (registration_audit_id)
);

COMMENT ON TABLE public.facility_manager_google_identity IS
  'One self-created active FACILITY_MANAGER graph per verified Google identity; the raw Google subject is never stored.';

-- The App Hosting runtime only reads, inserts and locks its own registry row.
-- Do not grant DELETE or broad schema/database privileges to the runtime role.
GRANT SELECT, INSERT, UPDATE ON TABLE public.facility_manager_google_identity TO portal_app;

COMMIT;
