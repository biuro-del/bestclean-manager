# Harness PostgreSQL 17 dla Grafiku

Ten harness służy wyłącznie do jednorazowej walidacji migracji Grafiku na nowym,
lokalnym i przeznaczonym do usunięcia klastrze PostgreSQL 17. Nie korzysta z
`DATABASE_URL`, nie wyszukuje działającej bazy i nie sprząta bazy po wykonaniu.

## Granice bezpieczeństwa

Runner uruchomi się tylko wtedy, gdy jednocześnie:

- otrzyma argument `--run-pg17-harness`;
- istnieje jawna zmienna `TEST_WORKFORCE_SCHEDULE_DATABASE_URL`;
- URL wskazuje `127.0.0.1`, `localhost` albo `::1`;
- nazwa bazy pasuje do `cleanzi_workforce_schedule_ephemeral_<suffix>`;
- URL nie zawiera hasła, parametrów ani fragmentu;
- zmienna `TEST_WORKFORCE_SCHEDULE_EPHEMERAL_CONFIRMATION` ma dokładną wartość
  `I_CONFIRM_THIS_IS_A_DISPOSABLE_LOCAL_POSTGRESQL_17_DATABASE`;
- serwer potwierdzi PostgreSQL 17, właściwy port, pustą bazę i brak ról harnessu.

Runner nie zawiera polecenia usuwającego bazę ani tabele. Po teście należy
zatrzymać i usunąć cały jednorazowy klaster zewnętrznym, wcześniej zweryfikowanym
mechanizmem.

## Role testowe

- `workforce_schedule_session` — ograniczony LOGIN osobnego poola Grafiku; bez
  bezpośrednich praw do tabel Grafiku ani wspólnych katalogów źródłowych.
- `workforce_schedule_app` — NOLOGIN, NOINHERIT; po jawnej zmianie roli ma prawa
  tylko do tabel Grafiku oraz do wąskich funkcji `SECURITY DEFINER`; nie ma
  surowego odczytu źródeł.
- `migration_runner` — ograniczony LOGIN, który może wyłącznie przełączyć się na
  właściciela migracji.
- `workforce_schedule_owner` — NOLOGIN, NOINHERIT; ograniczony właściciel nowych
  tabel i funkcji SECURITY DEFINER.

Oba członkostwa mają `ADMIN FALSE`, `INHERIT FALSE`, `SET TRUE`.

## Uruchomienie

W PowerShell, po samodzielnym utworzeniu pustej bazy w osobnym lokalnym klastrze:

```powershell
$env:TEST_WORKFORCE_SCHEDULE_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/cleanzi_workforce_schedule_ephemeral_example'
$env:TEST_WORKFORCE_SCHEDULE_EPHEMERAL_CONFIRMATION = 'I_CONFIRM_THIS_IS_A_DISPOSABLE_LOCAL_POSTGRESQL_17_DATABASE'
node scripts/test-workforce-schedule-pg17.js --run-pg17-harness
Remove-Item Env:TEST_WORKFORCE_SCHEDULE_DATABASE_URL
Remove-Item Env:TEST_WORKFORCE_SCHEDULE_EPHEMERAL_CONFIRMATION
```

Test statyczny, który nie otwiera połączenia z bazą:

```powershell
node --test test/workforce-schedule-pg17-harness.test.js
```

## Smoke rzeczywistych entrypointów psql

Osobny harness uruchamia dokładne pliki operatorskie
`20260906_workforce_schedule_roles_preprovision.psql` oraz
`20260906_workforce_schedule_core_apply.psql`, łącznie z meta-komendami
`\if`, `\gset` i `\ir`. Sam tworzy nowy klaster PostgreSQL 17 w `%TEMP%`,
nasłuchuje wyłącznie na `127.0.0.1`, wybiera losowy port różny od `5432` i nie
przyjmuje URL, hosta ani portu od operatora. Nie korzysta z istniejącej usługi
PostgreSQL ani z Cloud SQL.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\test-workforce-schedule-psql-entrypoints.ps1' `
  -RunLocalEphemeralSmoke `
  -Confirmation 'I_CONFIRM_LOCAL_EPHEMERAL_POSTGRESQL_17_PSQL_ENTRYPOINT_SMOKE'
```

Po obu markerach sukcesu harness zatrzymuje własny proces i usuwa wyłącznie
zweryfikowany katalog tymczasowy. Przy błędzie zatrzymuje proces, ale zachowuje
katalog i podaje jego ścieżkę do diagnozy. Statyczne granice harnessu sprawdza:

```powershell
node --test test/workforce-schedule-psql-entrypoints.test.js
```

## Zakres weryfikacji

### Tabelowy ACL obcej roli

Harness nadaje roli `portal_app` zwykły, niegrantowalny `SELECT` na
`public.workforce_schedule_settings`. Przypadek działa w osobnej transakcji:
test potwierdza dokładny wpis przez `pg_class.relacl` i `aclexplode()`, wymaga od
`schemaReady()` stanu fail-closed z markerem `runtime:TABLE_ACL`, wykonuje
`ROLLBACK`, a następnie potwierdza usunięcie wpisu `portal_app` z tabelowego ACL.

### Pełna macierz kolumnowych ACL

Harness wykonuje cztery rzeczywiste granty na
`public.workforce_schedule_settings`, każdy w osobnej transakcji zakończonej
`ROLLBACK`:

- `INSERT (version)` dla `workforce_schedule_app`;
- `UPDATE (version)` dla `workforce_schedule_app`;
- `REFERENCES (org_id)` dla `workforce_schedule_app`;
- `SELECT (version) WITH GRANT OPTION` dla `workforce_schedule_app`.

W każdym przypadku test odczytuje `pg_attribute.attacl`, rozwija wpis przez
`aclexplode()` i potwierdza dokładny typ prawa, odbiorcę oraz stan grant option.
`schemaReady()` musi przejść w stan fail-closed z markerem
`runtime:COLUMN_ACL`; `REFERENCES` musi dodatkowo zgłosić
`public.workforce_schedule_settings:REFERENCES:EXCESS`, a przypadek z grant
option także `runtime:GRANT_OPTION`. Po każdym rollbacku test ponownie odczytuje
`pg_attribute.attacl` i potwierdza usunięcie kolumnowego ACL.

Ta sama czteroelementowa macierz jest osobno wstrzykiwana przed postflightem
migracji dla roli `portal_app`. Każdy przypadek musi zakończyć się błędem
`WORKFORCE_SCHEDULE_COLUMN_ACL_POSTFLIGHT_FAILED` ze stanem SQL `P0001`, a
rollback migracji musi pozostawić zero tabel i funkcji Grafiku.

- minimalny fixture `organizations`, `organization_member`,
  `organization_subscription`, `worker` i `client` dla dwóch prawidłowych
  organizacji oraz osobnych przypadków fail-closed: rozjazd UID, brak Workera,
  `auth_uid=NULL`, nieaktywny Worker i status Workera inny niż `ACTIVE`;
- wykonanie migracji przez `migration_runner`, z przełączeniem roli wykonywanym
  fail-closed wewnątrz migracji;
- odrzucenie i pełny rollback migracji przy globalnym lub schematowym
  `DEFAULT ACL` właściciela nadającym `portal_app` prawa do tabel, sekwencji albo
  funkcji;
- odrzucenie wstrzykniętych przed postflightem praw tabelowych, kolumnowych,
  sekwencyjnych i funkcyjnych oraz potwierdzenie braku pozostałych obiektów po
  każdym rollbacku;
- ograniczenia właściciela funkcji SECURITY DEFINER;
- `schemaReady()` z prawdziwym `session_user=workforce_schedule_session` i
  `current_user=workforce_schedule_app`;
- synchronizacja katalogów, konfiguracja, utworzenie, odczyt, edycja,
  archiwizacja i wewnętrzna publikacja zmiany;
- dokładne efekty publikacji `{delivery:false, notifications:false,
  downstream:false}`;
- izolacja RLS między organizacjami;
- odmowa surowego `SELECT` i zapisu do `organizations`,
  `organization_member`, `organization_subscription`, `worker` i `client` dla
  loginu sesyjnego oraz roli Grafiku;
- dokładna autoryzacja pary `orgId + uid` przed `SET LOCAL ROLE` oraz odmowa
  odczytu katalogu innej organizacji przez funkcje po ustawieniu kontekstu;
- fail-closed, gdy aktywne członkostwo organizacji wskazuje pracownika, którego
  `worker.auth_uid` nie jest identyczne z Firebase UID tego członkostwa;
- niezmienność pełnych fixture'ów źródłowych;
- fail-closed dla błędnego `USAGE`, grant option, członkostwa w roli właściciela
  i praw zapisu do źródeł;
- odrzucenie kolumnowych praw zapisu do źródeł i kolumnowego `UPDATE` na tabeli
  historii append-only;
- odrzucenie polityki RLS o oczekiwanej nazwie i frazach, ale osłabionej przez
  warunek `OR true`;
- odrzucenie funkcji `SECURITY DEFINER`, której ciało zostało podmienione przy
  zachowaniu nazwy, argumentów, ownera, języka, volatility i `search_path`;
- odrzucenie drugiego zastosowania migracji.
