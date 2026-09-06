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

- `portal_app` — LOGIN reprezentujący istniejący backend portalu; zachowuje
  szerokie prawa do kanonicznych źródeł.
- `workforce_schedule_app` — NOLOGIN, NOINHERIT; po jawnej zmianie roli ma prawa
  tylko do Grafiku i tylko odczyt źródeł.
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

- minimalny fixture `organizations`, `organization_member`, `worker` i
  `service_object` dla dwóch organizacji;
- wykonanie migracji przez `migration_runner`, z przełączeniem roli wykonywanym
  fail-closed wewnątrz migracji;
- ograniczenia właściciela funkcji SECURITY DEFINER;
- `schemaReady()` z prawdziwym `session_user=portal_app` i
  `current_user=workforce_schedule_app`;
- synchronizacja katalogów, konfiguracja, utworzenie, odczyt, edycja,
  archiwizacja i wewnętrzna publikacja zmiany;
- dokładne efekty publikacji `{delivery:false, notifications:false,
  downstream:false}`;
- izolacja RLS między organizacjami;
- brak zapisu do `organizations`, `organization_member`, `worker` i
  `service_object` po przełączeniu na rolę Grafiku;
- niezmienność pełnych fixture'ów źródłowych;
- fail-closed dla błędnego `USAGE`, grant option, członkostwa w roli właściciela
  i praw zapisu do źródeł;
- odrzucenie kolumnowych praw zapisu do źródeł i kolumnowego `UPDATE` na tabeli
  historii append-only;
- odrzucenie polityki RLS o oczekiwanej nazwie i frazach, ale osłabionej przez
  warunek `OR true`;
- odrzucenie drugiego zastosowania migracji.
