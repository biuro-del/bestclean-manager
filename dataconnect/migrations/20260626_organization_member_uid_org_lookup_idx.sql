SET statement_timeout = '15min';
SET lock_timeout = '5min';

CREATE INDEX IF NOT EXISTS organization_member_uid_org_lookup_idx
  ON public.organization_member (uid, org_id);

ANALYZE public.organization_member;
