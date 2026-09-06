# Grafik: kontrolowane wykonanie migracji rdzenia

Migracja `20260906_workforce_schedule_core_additive.sql` jest kandydatem
addytywnym, a nie automatyczną częścią builda lub deployu. Nie została wykonana
na produkcji. Jej uruchomienie wymaga osobnej, jawnej zgody migracyjnej.

## Jedyny dopuszczony punkt wejścia

Operatorowi nie wolno wykonywać bezpośrednio pliku
`dataconnect/migrations/20260906_workforce_schedule_core_additive.sql` przez
`psql -f`, wklejenie do konsoli ani klienta GUI. Surowy plik pozostaje osobno
wyłącznie jako deterministyczne wejście testów PostgreSQL 17 i nie ma własnej
ochrony przed wskazaniem złej bazy.

Jedynym dopuszczonym punktem wejścia dla kontrolowanego wykonania jest:

`dataconnect/admin/20260906_workforce_schedule_core_apply.psql`

Wrapper ma `ON_ERROR_STOP` i przed dołączeniem surowego SQL wymaga jednocześnie:

- dokładnej, zapisanej w wrapperze bazy `iclean-room-database`;
- dokładnego `session_user` i `current_user` równego `migration_runner`, bez
  wcześniejszego `SET ROLE`;
- dokładnego tokenu
  `APPLY_WORKFORCE_SCHEDULE_CORE_ONLY_20260906`;
- PostgreSQL w wersji głównej 17;
- połączenia z instancją primary, dla której `pg_is_in_recovery()` jest fałszem;
- sesji i bazy dopuszczających zapis (`transaction_read_only=off` oraz
  `default_transaction_read_only=off`).

Brak parametru lub niespełnienie choćby jednego warunku przerywa wykonanie przed
instrukcją `\ir`, a więc przed `BEGIN` i przed jakąkolwiek zmianą schematu.
Po przejściu bramek wrapper ustawia jednorazowy marker sesji
`cleanzi.workforce_schedule_core_entrypoint`. Surowy SQL wymaga dokładnej
wartości markera, zużywa go jeszcze przed `BEGIN` i bez niego kończy się błędem
`WORKFORCE_SCHEDULE_GUARDED_ENTRYPOINT_REQUIRED`. Dzięki temu przypadkowe
`psql -f` lub uruchomienie pliku w GUI nie wykona migracji. Marker nie zastępuje
kontroli celu; wszystkie parametry bazy, roli i wersji nadal muszą przejść przez
wrapper.
Sam surowy SQL zachowuje własny preflight ról, ACL i pustej przestrzeni nazw oraz
transakcję z postflightem. Wrapper nie zastępuje tych kontroli.

## Wymagane etapy poprzedzające

Przed osobnym zatwierdzeniem migracji muszą być zakończone i zweryfikowane:

1. preprovisioning opisany w
   `docs/workforce-schedule-role-preprovisioning.md`;
2. aktywacja poświadczeń wyłącznie dla `migration_runner` na czas migracji;
3. read-only audyt dokładnej instancji, bazy, wersji PostgreSQL, roli sesyjnej,
   stanu primary/read-write i braku wcześniejszych obiektów
   `workforce_schedule_*`;
4. kopia zapasowa oraz uzgodnione okno i osoba odpowiedzialna za obserwację;
5. osobna zgoda zawierająca dokładną bazę, rolę i token wykonania.

Preprovisioning ról nie jest zgodą na migrację. Migracja nie jest zgodą na
ustawienie sekretów runtime, IAM, zmianę flag, push ani deploy.

## Kontrolowane uruchomienie

Połącz się przez bezpieczny kanał jako `migration_runner`. Hasła ani pełnego URI
z poświadczeniami nie wolno umieszczać w repozytorium, argumencie procesu,
logach ani historii powłoki. Preferowany jest lokalny Cloud SQL Auth Proxy i
interaktywny prompt hasła klienta `psql`.

Przykład zawiera wyłącznie jawne parametry ochronne; host i port są
placeholderami bez sekretów:

```powershell
psql.exe -h '<LOCAL_PROXY_HOST>' -p '<LOCAL_PROXY_PORT>' `
  -U migration_runner -d iclean-room-database -W `
  -v workforce_schedule_expected_database='iclean-room-database' `
  -v workforce_schedule_expected_migration_runner='migration_runner' `
  -v workforce_schedule_core_confirmation='APPLY_WORKFORCE_SCHEDULE_CORE_ONLY_20260906' `
  -f 'dataconnect/admin/20260906_workforce_schedule_core_apply.psql'
```

Sukces kończy się komunikatem
`WORKFORCE_SCHEDULE_CORE_MIGRATION_APPLIED`. Każdy inny wynik jest porażką i
nie pozwala przejść do aktywacji aplikacji. Po wykonaniu trzeba osobno
potwierdzić postflight schematu, RLS i ACL, a następnie ponownie wyłączyć login
`migration_runner` oraz usunąć jego aktywne hasło zgodnie z zaakceptowaną
procedurą DBA.

## Cofnięcie i zatrzymanie

Przy błędzie wrappera nie wolno omijać ochrony przez uruchomienie surowego SQL.
Najpierw należy wyjaśnić rozbieżność i przeprowadzić ponowny read-only audyt.

Migracja nie ma automatycznego `DROP` ani rollbacku usuwającego dane. Przed
pierwszym użyciem transakcja surowej migracji wycofuje się przy błędzie. Po
zapisaniu danych Grafiku schemat jest historią biznesową; ewentualne usunięcie
wymaga osobnej decyzji, kopii zapasowej i osobnego, zrecenzowanego skryptu.
