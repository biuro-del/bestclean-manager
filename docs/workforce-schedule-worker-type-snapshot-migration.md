# Grafik: kontrolowane dodanie typu pracownika do katalogu

Migracja `20260908_workforce_schedule_worker_type_snapshot_additive.sql` jest
addytywnym kandydatem bazy danych. Nie jest częścią automatycznego builda ani
wdrożenia aplikacji. Jej uruchomienie wymaga osobnej, jawnej zgody migracyjnej.

## Zakres

Migracja:

- dodaje nullable `worker_type_snapshot varchar(40)` do
  `public.workforce_schedule_person`;
- zachowuje bez zmian funkcję
  `public.workforce_schedule_read_active_workers(text)`;
- dodaje osobną funkcję
  `public.workforce_roster_read_active_workers_v2(text)`;
- nadaje `EXECUTE` funkcji V2 wyłącznie roli `workforce_schedule_app`;
- nie nadaje rolom runtime ani sesyjnym bezpośredniego `SELECT` do
  `public.worker`;
- nie aktualizuje danych źródłowych pracowników i nie uruchamia synchronizacji
  katalogu.

Istniejące rekordy katalogu pozostają z `worker_type_snapshot = NULL` do czasu
osobno uruchomionej, autoryzowanej synchronizacji katalogu Grafiku. Dzięki temu
migracja schematu nie interpretuje ani nie przepisuje danych biznesowych.

Reader V2 celowo korzysta z osobnego, ściśle audytowanego prefiksu
`workforce_roster_`. Aktualny backend produkcyjny wymaga dokładnie sześciu
funkcji `public.workforce_schedule_*`; dodanie siódmej funkcji pod tym prefiksem
natychmiast wyłączyłoby Grafik. Po tej migracji starszy backend nadal widzi
dokładnie te same sześć funkcji, a nowy backend audytuje łącznie oba jawnie
dopuszczone prefiksy i wymaga readera V2.

## Jedyny dopuszczony punkt wejścia

Surowego pliku migracji nie wolno wykonywać bezpośrednio przez `psql -f`,
wklejenie do konsoli ani klienta GUI. Jedynym dopuszczonym punktem wejścia jest:

`dataconnect/admin/20260908_workforce_schedule_worker_type_snapshot_apply.psql`

Wrapper wymaga jednocześnie:

- bazy `iclean-room-database`;
- `session_user` i `current_user` równych `migration_runner`;
- tokenu
  `APPLY_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_ONLY_20260908`;
- PostgreSQL 17;
- instancji primary;
- sesji i bazy w trybie read-write.

Po przejściu bramek wrapper uzbraja jednorazowy marker sesji, który surowa
migracja zużywa przed rozpoczęciem transakcji. Brak lub niezgodność dowolnej
bramki zatrzymuje operację przed zmianą schematu.

## Warunki poprzedzające

Przed wykonaniem należy osobno potwierdzić:

1. aktualną kopię zapasową bazy;
2. dokładny SHA kodu oczekującego funkcji V2 i nowej kolumny;
3. zdrowy rdzeń `cleanzi.workforce_schedule.core.v1`;
4. brak istniejącej funkcji V2 i kolumny `worker_type_snapshot`;
5. aktywne, czasowe poświadczenia `migration_runner`;
6. okno obserwacji oraz plan zatrzymania wdrożenia aplikacji.

Zgoda na tę migrację nie jest zgodą na deploy, zmianę flag, synchronizację
katalogu, push ani publikację Grafiku pracownikom.

## Kontrolowane wykonanie

Hasła ani pełnego URI z poświadczeniami nie wolno umieszczać w repozytorium,
argumentach procesu, logach lub historii powłoki. Preferowany jest lokalny
Cloud SQL Auth Proxy oraz interaktywny prompt hasła `psql`.

```powershell
psql.exe -h '<LOCAL_PROXY_HOST>' -p '<LOCAL_PROXY_PORT>' `
  -U migration_runner -d iclean-room-database -W `
  -v workforce_schedule_expected_database='iclean-room-database' `
  -v workforce_schedule_expected_migration_runner='migration_runner' `
  -v workforce_schedule_worker_type_confirmation='APPLY_WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_ONLY_20260908' `
  -f 'dataconnect/admin/20260908_workforce_schedule_worker_type_snapshot_apply.psql'
```

Sukces kończy się komunikatem
`WORKFORCE_SCHEDULE_WORKER_TYPE_SNAPSHOT_MIGRATION_APPLIED`. Każdy inny wynik
jest porażką i blokuje wdrożenie kodu wymagającego funkcji V2.

## Postflight i dokładna kolejność aktywacji

Kolejności nie wolno odwracać. Nowy backend przed migracją jest celowo
fail-closed, natomiast stary backend po migracji pozostaje zgodny dzięki
oddzielnemu prefiksowi readera V2.

1. Pozostaw aktualny backend produkcyjny bez zmian i potwierdź jego readiness.
2. Po osobnej zgodzie wykonaj wyłącznie tę migrację przez guarded wrapper.
3. Potwierdź kolumnę, ograniczenie, właściciela i dokładny ACL funkcji V2.
4. Potwierdź, że nadal istnieje dokładnie sześć funkcji
   `public.workforce_schedule_*` oraz dokładnie jeden reader
   `public.workforce_roster_*`.
5. Na nadal uruchomionym starym backendzie wykonaj readiness i bezpieczny GET
   bootstrapu. Oba muszą przejść przed deployem nowego backendu.
6. Potwierdź brak bezpośredniego `SELECT` do `public.worker` dla
   `workforce_schedule_app` i `workforce_schedule_session`.
7. Dopiero teraz wdróż nowy backend wymagający kolumny i readera V2; ponownie
   uruchom readiness i bezpieczny GET bootstrapu.
8. Uruchom kontrolowaną synchronizację katalogu tylko dla organizacji canary.
9. Potwierdź licznik synchronizacji i obecność `workerType` w bootstrapie bez
   ujawniania loginów ani UID. Dopiero po tym można aktywować filtr w UI.

Nie należy wypełniać `worker_type_snapshot` ręcznym SQL. Źródłem wartości jest
wyłącznie jawna synchronizacja katalogu przez funkcję V2.

## Zatrzymanie

Przy dowolnej rozbieżności nie wolno omijać wrappera ani modyfikować funkcji V1.
Migracja działa w pojedynczej transakcji, więc błąd preflightu lub postflightu
wycofuje cały kandydat. Po sukcesie kolumna pozostaje kompatybilna ze starszym
kodem, ponieważ jest nullable, a funkcja V1 nadal istnieje. Usuwanie kolumny lub
funkcji wymagałoby osobnej decyzji, kopii zapasowej i osobnego skryptu DBA.
