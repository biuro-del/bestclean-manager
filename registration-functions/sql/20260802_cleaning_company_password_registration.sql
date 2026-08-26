-- Local integration migration. Do not execute against any Firebase/Cloud SQL
-- environment without a separate owner-approved release plan.
-- Requires public-registration migrations 003 and 004.

BEGIN;

ALTER TABLE registration_attempt
  ADD COLUMN IF NOT EXISTS broker_operation_id varchar(160),
  ADD COLUMN IF NOT EXISTS organization_kind varchar(40);

CREATE UNIQUE INDEX IF NOT EXISTS registration_attempt_broker_operation_unique
  ON registration_attempt (broker_operation_id)
  WHERE broker_operation_id IS NOT NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS organization_kind varchar(40);

CREATE TABLE IF NOT EXISTS cleanzi_registration_projection_outbox (
  event_id varchar(64) PRIMARY KEY,
  operation_id varchar(160) NOT NULL,
  event_type varchar(80) NOT NULL,
  org_id varchar(64) NOT NULL,
  uid varchar(128) NOT NULL,
  state varchar(20) NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL,
  lease_owner varchar(160),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error_code varchar(120),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT cleanzi_registration_projection_outbox_operation_unique
    UNIQUE (operation_id),
  CONSTRAINT cleanzi_registration_projection_outbox_state_check
    CHECK (state IN ('PENDING', 'LEASED', 'DELIVERED', 'FAILED')),
  CONSTRAINT cleanzi_registration_projection_outbox_attempts_check
    CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS cleanzi_registration_projection_outbox_ready_idx
  ON cleanzi_registration_projection_outbox (state, available_at, created_at);

UPDATE subscription_plan_catalog
   SET trial_days = 14,
       updated_at = now()
 WHERE plan_code = 'TRIAL'
   AND active = true;

COMMIT;
