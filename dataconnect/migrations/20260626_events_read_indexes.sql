SET statement_timeout = '15min';
SET lock_timeout = '5min';

CREATE INDEX IF NOT EXISTS workday_org_start_idx
  ON public.workday (org_id, start_at DESC);

CREATE INDEX IF NOT EXISTS workday_org_updated_idx
  ON public.workday (org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS workday_org_worker_start_idx
  ON public.workday (org_id, worker_login, start_at DESC);

CREATE INDEX IF NOT EXISTS workday_org_room_start_idx
  ON public.workday (org_id, utility_room_id, start_at DESC);

CREATE INDEX IF NOT EXISTS workday_org_status_start_idx
  ON public.workday (org_id, status, start_at DESC);

CREATE INDEX IF NOT EXISTS event_org_start_idx
  ON public.event (org_id, start_at DESC);

CREATE INDEX IF NOT EXISTS event_org_updated_idx
  ON public.event (org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS event_org_worker_start_idx
  ON public.event (org_id, worker_login, start_at DESC);

CREATE INDEX IF NOT EXISTS event_org_zone_start_idx
  ON public.event (org_id, zone_id, start_at DESC);

CREATE INDEX IF NOT EXISTS event_org_status_start_idx
  ON public.event (org_id, status, start_at DESC);

CREATE INDEX IF NOT EXISTS backup_cycle_org_start_idx
  ON public.backup_cycle (org_id, start_at DESC);

CREATE INDEX IF NOT EXISTS backup_cycle_org_edited_idx
  ON public.backup_cycle (org_id, edited_at DESC);

ANALYZE public.workday;
ANALYZE public.event;
ANALYZE public.backup_cycle;
