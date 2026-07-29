-- REVIEW-ONLY. Nie uruchamiano na produkcji.
-- Chroni przed utworzeniem drugiego otwartego CLEAN dla tej samej osoby.
-- Istniejacych rekordow nie zmienia; zamkniecie istniejacego konfliktu pozostaje dozwolone.

BEGIN;

-- Zamknij okno pomiedzy kontrola stanu a utworzeniem triggera.
-- Blokada nie zmienia rekordow, ale zatrzymuje rownolegle INSERT/UPDATE na czas migracji.
LOCK TABLE public.event IN SHARE ROW EXCLUSIVE MODE;

-- Guard moze byc wlaczony dopiero po pelnym wdrozeniu modelu korelacji.
-- Zapobiega to sytuacji, w ktorej starszy writer nie potrafi zapisac event_type.
DO $$
DECLARE
  missing_columns text[];
BEGIN
  SELECT array_agg(required.column_name ORDER BY required.column_name)
    INTO missing_columns
    FROM unnest(ARRAY[
      'event_type',
      'match_status',
      'match_method',
      'match_reason',
      'task_id',
      'occurrence_date_ymd',
      'service_block_id',
      'allocation_id',
      'work_slot_key',
      'matched_at',
      'plan_snapshot_version',
      'planned_start_at',
      'planned_end_at',
      'planned_duration_minutes',
      'task_updated_at_snapshot'
    ]::text[]) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns AS actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = 'event'
        AND actual.column_name = required.column_name
   );

  IF coalesce(array_length(missing_columns, 1), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42703',
      MESSAGE = 'EVENT_CORRELATION_SCHEMA_INCOMPLETE',
      DETAIL = array_to_string(missing_columns, ', '),
      HINT = 'Najpierw wdroz pelna migracje korelacji zdarzen i wersje zapisujaca jawny event_type.';
  END IF;
END;
$$;

-- Twardy gate wdrozeniowy: nie zgadujemy typu otwartych rekordow historycznych.
-- Najpierw trzeba je sklasyfikowac i jawnie uzupelnic event_type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.event AS legacy
     WHERE legacy.end_at IS NULL
       AND upper(btrim(coalesce(legacy.status, 'RUNNING'))) <> 'CLOSED'
       AND nullif(btrim(to_jsonb(legacy) ->> 'event_type'), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LEGACY_OPEN_EVENT_TYPE_REQUIRES_CLASSIFICATION',
      HINT = 'Sklasyfikuj otwarte rekordy z pustym event_type przed ponownym uruchomieniem migracji.';
  END IF;
END;
$$;

-- Jawny otwarty CLEAN bez pracownika nie moze byc objety invariantem per osoba.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.event AS existing
     WHERE existing.end_at IS NULL
       AND upper(btrim(coalesce(existing.status, 'RUNNING'))) <> 'CLOSED'
       AND upper(btrim(coalesce(to_jsonb(existing) ->> 'event_type', ''))) = 'CLEAN'
       AND nullif(btrim(existing.worker_login), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPEN_CLEAN_WORKER_REQUIRES_RECONCILIATION',
      HINT = 'Uzupelnij worker_login albo zamknij jawne otwarte CLEAN bez pracownika przed ponownym uruchomieniem migracji.';
  END IF;
END;
$$;

-- Drugi gate: trigger nie moze zostac uznany za aktywny invariant,
-- jezeli w bazie juz istnieje kilka jawnych otwartych CLEAN tej samej osoby.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.event AS existing
     WHERE existing.end_at IS NULL
       AND upper(btrim(coalesce(existing.status, 'RUNNING'))) <> 'CLOSED'
       AND nullif(btrim(existing.worker_login), '') IS NOT NULL
       AND upper(btrim(coalesce(to_jsonb(existing) ->> 'event_type', ''))) = 'CLEAN'
     GROUP BY existing.org_id, lower(btrim(existing.worker_login))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'EXISTING_OPEN_CLEAN_CONFLICT_REQUIRES_RECONCILIATION',
      HINT = 'Rozstrzygnij istniejace wielokrotne otwarte CLEAN przed ponownym uruchomieniem migracji.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_single_open_clean_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflicting_event_id text;
BEGIN
  -- Domkniecie historycznego rekordu bez event_type pozostaje dozwolone.
  IF NEW.end_at IS NOT NULL
     OR upper(btrim(coalesce(NEW.status, 'RUNNING'))) = 'CLOSED' THEN
    RETURN NEW;
  END IF;

  -- Po wdrozeniu nowy otwarty rekord musi miec jawny typ. Nie zgadujemy CLEAN.
  IF nullif(btrim(to_jsonb(NEW) ->> 'event_type'), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPEN_EVENT_TYPE_REQUIRED',
      HINT = 'Dla nowego otwartego zdarzenia podaj jawny event_type.';
  END IF;

  IF upper(btrim(coalesce(to_jsonb(NEW) ->> 'event_type', ''))) <> 'CLEAN' THEN
    RETURN NEW;
  END IF;

  IF NEW.worker_login IS NULL OR btrim(NEW.worker_login) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPEN_EVENT_WORKER_REQUIRED',
      HINT = 'Dla otwartego CLEAN podaj worker_login.',
      CONSTRAINT = 'event_open_clean_worker_required';
  END IF;

  -- Ten sam klucz jest uzywany przez /api/mobile/scan. Blokada zamyka wyscig
  -- rownoleglych INSERT-ow, ktore nie widzialyby sie wzajemnie w READ COMMITTED.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.org_id::text),
    hashtext(lower(btrim(NEW.worker_login)))
  );

  SELECT event_id
    INTO conflicting_event_id
    FROM public.event AS existing
   WHERE existing.org_id = NEW.org_id
     AND lower(btrim(existing.worker_login)) = lower(btrim(NEW.worker_login))
     AND existing.event_id <> NEW.event_id
     AND existing.end_at IS NULL
     AND upper(btrim(coalesce(existing.status, 'RUNNING'))) <> 'CLOSED'
     AND upper(btrim(coalesce(to_jsonb(existing) ->> 'event_type', ''))) = 'CLEAN'
   ORDER BY existing.start_at DESC NULLS LAST, existing.updated_at DESC NULLS LAST
   LIMIT 1;

  IF conflicting_event_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'OPEN_CLEAN_EVENT_EXISTS',
      DETAIL = format(
        'org_id=%s worker_login=%s conflicting_event_id=%s',
        NEW.org_id,
        NEW.worker_login,
        conflicting_event_id
      ),
      CONSTRAINT = 'event_single_open_clean_per_worker';
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS event_open_clean_worker_lookup_idx
ON public.event (org_id, lower(btrim(worker_login)))
WHERE end_at IS NULL
  AND upper(btrim(coalesce(status, 'RUNNING'))) <> 'CLOSED'
  AND upper(btrim(coalesce(event_type, ''))) = 'CLEAN'
  AND nullif(btrim(worker_login), '') IS NOT NULL;

DROP TRIGGER IF EXISTS event_single_open_clean_per_worker ON public.event;

CREATE TRIGGER event_single_open_clean_per_worker
BEFORE INSERT OR UPDATE ON public.event
FOR EACH ROW
EXECUTE FUNCTION public.guard_single_open_clean_event();

COMMIT;

-- Kontrola przed wdrozeniem:
-- Najpierw sklasyfikuj wartosci event_type. Puste otwarte rekordy nie sa
-- automatycznie uznawane za CLEAN i blokuja wdrozenie do czasu weryfikacji:
-- SELECT coalesce(nullif(upper(btrim(to_jsonb(event) ->> 'event_type')), ''), 'LEGACY_EMPTY') AS event_type,
--        count(*)
--   FROM public.event
--  GROUP BY 1
--  ORDER BY 2 DESC;
--
-- SELECT org_id, lower(btrim(worker_login)) AS worker_login, count(*) AS open_count
--   FROM public.event
--  WHERE end_at IS NULL
--    AND upper(btrim(coalesce(status, 'RUNNING'))) <> 'CLOSED'
--    AND upper(btrim(coalesce(to_jsonb(event) ->> 'event_type', ''))) = 'CLEAN'
--  GROUP BY org_id, lower(btrim(worker_login))
-- HAVING count(*) > 1;
