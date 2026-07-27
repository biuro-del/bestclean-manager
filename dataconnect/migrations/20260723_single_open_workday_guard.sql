-- REVIEW-ONLY. Nie uruchamiano na produkcji.
-- Chroni przed utworzeniem drugiego otwartego dnia pracy dla tej samej osoby
-- w organizacji. Migracja nie naprawia ani nie zmienia istniejacych rekordow.

BEGIN;

-- Zamknij okno pomiedzy kontrola stanu a utworzeniem triggera.
-- Blokada nie modyfikuje rekordow, ale zatrzymuje rownolegle INSERT/UPDATE
-- na public.workday do konca tej transakcji.
LOCK TABLE public.workday IN SHARE ROW EXCLUSIVE MODE;

-- Otwarty Workday musi miec jednoznaczny klucz pracownika. Historyczne otwarte
-- rekordy z pustym loginem wymagaja recznego rozstrzygniecia przed wdrozeniem.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.workday AS existing
     WHERE existing.end_at IS NULL
       AND upper(btrim(coalesce(existing.status, 'RUNNING'))) <> 'CLOSED'
       AND nullif(btrim(existing.worker_login), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'EXISTING_OPEN_WORKDAY_WORKER_REQUIRED',
      HINT = 'Uzupelnij worker_login albo zamknij istniejace otwarte dni pracy przed ponownym uruchomieniem migracji.';
  END IF;
END;
$$;

-- Trigger nie moze zostac wlaczony, jesli invariant jest juz naruszony.
-- Login jest porownywany po usunieciu spacji i bez rozrozniania wielkosci liter.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.workday AS existing
     WHERE existing.end_at IS NULL
       AND upper(btrim(coalesce(existing.status, 'RUNNING'))) <> 'CLOSED'
       AND nullif(btrim(existing.worker_login), '') IS NOT NULL
     GROUP BY existing.org_id, lower(btrim(existing.worker_login))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'EXISTING_OPEN_WORKDAY_CONFLICT_REQUIRES_RECONCILIATION',
      HINT = 'Rozstrzygnij istniejace wielokrotne otwarte dni pracy przed ponownym uruchomieniem migracji.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_single_open_workday()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conflicting_workday_id text;
BEGIN
  -- Domkniecie rekordu jest zawsze dozwolone, rowniez wtedy, gdy zamykany
  -- historyczny rekord ma niepelne dane albo pochodzi ze zbioru konfliktowego.
  IF NEW.end_at IS NOT NULL
     OR upper(btrim(coalesce(NEW.status, 'RUNNING'))) = 'CLOSED' THEN
    RETURN NEW;
  END IF;

  -- Nie tworzymy otwartego dnia bez jednoznacznego pracownika.
  IF nullif(btrim(NEW.worker_login), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'OPEN_WORKDAY_WORKER_REQUIRED',
      HINT = 'Dla otwartego dnia pracy podaj worker_login.';
  END IF;

  -- Serializacja po znormalizowanym kluczu org + worker zamyka wyscig dwoch
  -- rownoleglych INSERT/UPDATE w izolacji READ COMMITTED.
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.org_id::text),
    hashtext(lower(btrim(NEW.worker_login)))
  );

  SELECT existing.workday_id
    INTO conflicting_workday_id
    FROM public.workday AS existing
   WHERE existing.org_id = NEW.org_id
     AND lower(btrim(existing.worker_login)) = lower(btrim(NEW.worker_login))
     AND existing.workday_id <> NEW.workday_id
     AND existing.end_at IS NULL
     AND upper(btrim(coalesce(existing.status, 'RUNNING'))) <> 'CLOSED'
   ORDER BY existing.start_at DESC NULLS LAST, existing.updated_at DESC NULLS LAST
   LIMIT 1;

  IF conflicting_workday_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'OPEN_WORKDAY_EXISTS',
      DETAIL = format(
        'org_id=%s worker_login=%s conflicting_workday_id=%s',
        NEW.org_id,
        NEW.worker_login,
        conflicting_workday_id
      ),
      CONSTRAINT = 'workday_single_open_per_worker';
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS workday_open_worker_lookup_idx
ON public.workday (org_id, lower(btrim(worker_login)))
WHERE end_at IS NULL
  AND upper(btrim(coalesce(status, 'RUNNING'))) <> 'CLOSED'
  AND nullif(btrim(worker_login), '') IS NOT NULL;

DROP TRIGGER IF EXISTS workday_single_open_per_worker ON public.workday;

CREATE TRIGGER workday_single_open_per_worker
BEFORE INSERT OR UPDATE ON public.workday
FOR EACH ROW
EXECUTE FUNCTION public.guard_single_open_workday();

COMMIT;

-- Kontrole do wykonania przed wdrozeniem (tylko odczyt):
--
-- SELECT org_id, workday_id, worker_login, status, start_at
--   FROM public.workday
--  WHERE end_at IS NULL
--    AND upper(btrim(coalesce(status, 'RUNNING'))) <> 'CLOSED'
--    AND nullif(btrim(worker_login), '') IS NULL;
--
-- SELECT org_id, lower(btrim(worker_login)) AS worker_login, count(*) AS open_count
--   FROM public.workday
--  WHERE end_at IS NULL
--    AND upper(btrim(coalesce(status, 'RUNNING'))) <> 'CLOSED'
--    AND nullif(btrim(worker_login), '') IS NOT NULL
--  GROUP BY org_id, lower(btrim(worker_login))
-- HAVING count(*) > 1;
