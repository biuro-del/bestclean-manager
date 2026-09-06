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

## Zakres weryfikacji

- minimalny fixture `organizations`, `organization_member`,
  `organization_subscription`, `worker` i `client` dla dwóch organizacji,
  obejmujący także nieaktywne, puste oraz nieznane statusy obiektów;
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
- niezmienność pełnych fixture'ów źródłowych;
- fail-closed dla błędnego `USAGE`, grant option, członkostwa w roli właściciela
  i praw zapisu do źródeł;
- odrzucenie kolumnowych praw zapisu do źródeł i kolumnowego `UPDATE` na tabeli
  historii append-only;
- odrzucenie polityki RLS o oczekiwanej nazwie i frazach, ale osłabionej przez
  warunek `OR true`;
- odrzucenie drugiego zastosowania migracji.
