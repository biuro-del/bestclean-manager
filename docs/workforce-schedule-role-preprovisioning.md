# Grafik: preprovisioning ról bazy

Ten pakiet jest kandydatem administracyjnym. Nie jest uruchamiany przez build,
deploy ani migrację aplikacji. Jego wykonanie na prawdziwej bazie wymaga osobnej,
jawnej zgody bazodanowej.

## Zakres

Skrypt `dataconnect/admin/20260906_workforce_schedule_roles_preprovision.psql`:

- tworzy izolowany login runtime `workforce_schedule_session`;
- tworzy role `NOLOGIN`: `workforce_schedule_app` i
  `workforce_schedule_owner`;
- tworzy oddzielny login `migration_runner`;
- nadaje wyłącznie członkostwa `SET TRUE, INHERIT FALSE, ADMIN FALSE`:
  `workforce_schedule_session -> workforce_schedule_app` oraz
  `migration_runner -> workforce_schedule_owner`;
- nadaje prawa do katalogów źródłowych wyłącznie roli `NOLOGIN`
  `workforce_schedule_owner`; login sesyjny i rola aplikacyjna dostają tylko
  `USAGE` na schemacie `public`, bez tabelowego i kolumnowego `SELECT` źródeł;
- przed utworzeniem ról sprawdza, czy konto provisioningowe jest właścicielem
  obiektów źródłowych albo ma dokładne `GRANT OPTION` niezbędne do nadania tych
  praw; samo `CREATEROLE` nie wystarcza do zarządzania ACL tabel;
- `workforce_schedule_session` i `workforce_schedule_app` nie mogą czytać
  bezpośrednio żadnej z tabel `organizations`, `organization_member`,
  `organization_subscription`, `worker` ani `client`; dotyczy to również
  uprawnień kolumnowych, `PUBLIC` i dostępu przez członkostwa;
- późniejsza, osobno zatwierdzana migracja może wystawić tylko wąskie,
  zrecenzowane funkcje `SECURITY DEFINER` należące do
  `workforce_schedule_owner`; sam preprovisioning nie tworzy tych funkcji;
- nie modyfikuje roli `portal_app` i odrzuca każde członkostwo pomiędzy nią a
  rolami Grafiku;
- odrzuca nadmiarowe członkostwa, odczyt lub zapis źródeł przez runtime, prawa do tabel
  `platform_*`, bezpośrednie prawa loginów do tabel `workforce_schedule_*` i
  jakiekolwiek tabelowe lub kolumnowe `GRANT OPTION`;
- jeśli `portal_app` istnieje, odrzuca również jego skuteczne prawa do tabel lub
  funkcji `workforce_schedule_*`.

Skrypt jest transakcyjny, idempotentny dla identycznego stanu oraz fail-closed.
Nie naprawia istniejących ról przez `ALTER ROLE` ani nie usuwa ich istniejących
członkostw. PostgreSQL 17 automatycznie nadaje ograniczonemu twórcy
`CREATEROLE` członkostwo administracyjne w każdej nowej roli. Dla czterech ról
Grafiku powstają więc dokładnie cztery nieuniknione krawędzie od roli docelowej
do administratora wykonującego skrypt: `ADMIN TRUE`, `SET FALSE`,
`INHERIT FALSE`. Ich grantorem jest bootstrap superuser, dlatego ograniczony
twórca nie może ich samodzielnie usunąć. Skrypt nie próbuje wykonywać `REVOKE`.

Nazwa oczekiwanego administratora jest obowiązkowym parametrem, a skrypt wymaga
dokładnej zgodności z `session_user`. Administrator musi być osobnym loginem
`CREATEROLE`, ale jednocześnie `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`,
`NOCREATEDB` i `NOREPLICATION`. Zachowane krawędzie pozwalają mu administrować
członkostwem ról, lecz same nie dają odziedziczonego dostępu do danych ani prawa
`SET ROLE`. `ADMIN TRUE` pozwala jednak administratorowi nadać sobie nową
krawędź z `SET TRUE` lub `INHERIT TRUE`; jest to zabezpieczenie przed
przypadkowym użyciem praw, a nie granica bezpieczeństwa wobec samego
administratora. Konto provisioningowe pozostaje kontem uprzywilejowanym i nie
może być kontem runtime aplikacji. Postflight wymaga dokładnie tych czterech
krawędzi, dwóch jawnych członkostw Grafiku oraz odrzuca wszystkie pozostałe.
Każda rozbieżność kończy wykonanie i wycofuje całą transakcję.

## Wykonalność w Cloud SQL

Cloud SQL for PostgreSQL nie udostępnia klientowi prawdziwego `SUPERUSER`, ale
pozwala tworzyć niestandardowe role przez SQL. Kandydat jest wykonalny bez
`SUPERUSER` pod trzema warunkami:

1. osobny login provisioningowy ma dokładne atrybuty sprawdzane przez preflight,
   w tym `CREATEROLE`, `NOINHERIT` i `NOCREATEDB`;
2. właściciel źródeł nadał mu wcześniej dokładne zdolności delegowania ACL
   opisane niżej;
3. połączenie wskazuje PostgreSQL 17, właściwą bazę oraz dokładny `session_user`.

Typowy użytkownik wbudowany tworzony przez Cloud SQL otrzymuje m.in. `CREATEDB`
i nie spełnia tego kontraktu bez przygotowania osobnej, ograniczonej roli.
Samo członkostwo w `cloudsqlsuperuser` ani samo `CREATEROLE` nie zastępuje praw
do obiektów źródłowych. Dokumentacja referencyjna:
[Cloud SQL — users and roles](https://cloud.google.com/sql/docs/postgres/users),
[PostgreSQL 17 — role attributes](https://www.postgresql.org/docs/17/role-attributes.html),
[PostgreSQL 17 — privileges](https://www.postgresql.org/docs/17/ddl-priv.html).

To jest kontrakt wykonalności, nie potwierdzenie aktualnego stanu instancji
produkcyjnej. Skrypt nie został na niej uruchomiony; przed przyszłym wykonaniem
trzeba osobno odczytać atrybuty ról, właścicieli obiektów i rzeczywiste ACL.

## Hasła i sekrety

Repozytorium nie zawiera hasła ani parametru pozwalającego przekazać hasło w
linii poleceń. Nowo utworzone role `LOGIN` dostają `PASSWORD NULL`. Oznacza to,
że po samym preprovisioningu nie można zalogować się nimi za pomocą hasła.

Aktywacja poświadczeń jest oddzielnym etapem i wymaga oddzielnej zgody:

1. DBA otwiera interaktywną sesję `psql` po bezpiecznym kanale.
2. DBA używa `\password workforce_schedule_session`; `psql` pobiera wartość bez
   wyświetlania jej na ekranie i nie umieszcza jej w historii poleceń SQL.
3. Ta sama wartość trafia do nowego sekretu
   `WORKFORCE_SCHEDULE_DB_PASS`; sekret
   `WORKFORCE_SCHEDULE_DB_USER` zawiera wyłącznie nazwę
   `workforce_schedule_session`.
4. Hasło `migration_runner`, jeśli jest potrzebne do kontrolowanej migracji,
   ustawia się analogicznie przez `\password migration_runner`. Nie jest ono
   sekretem runtime aplikacji i nie powinno być podpinane do usługi portalu.

Po zakończeniu zatwierdzonej migracji login `migration_runner` powinien zostać
ponownie wyłączony (`NOLOGIN`) i pozbawiony aktywnego hasła w osobnym,
kontrolowanym kroku DBA. Jego członkostwo `SET` w roli właściciela może pozostać
do przyszłych migracji tylko wtedy, gdy sam login jest nieaktywny; ponowne
włączenie wymaga nowej zgody migracyjnej.

Skrypt nie potrafi i nie próbuje stwierdzić, czy istniejąca rola ma aktywne
hasło. Nie zmienia poświadczeń istniejących ról.

## Kontrolowane uruchomienie

Przed wykonaniem trzeba połączyć się bezpośrednio z właściwą bazą PostgreSQL 17
jako oddzielny, ograniczony administrator z `CREATEROLE` oraz prawem nadawania
wymaganych ACL. Nazwa oczekiwanej bazy, nazwa oczekiwanego administratora i
dokładne potwierdzenie są obowiązkowe:

Właściciel schematu i tabel źródłowych musi wcześniej nadać temu kontu możliwość
delegowania wyłącznie następujących praw (albo konto musi być właścicielem tych
obiektów): `USAGE` i `CREATE` na schemacie `public`; `SELECT` na
`organizations`, `organization_member`, `organization_subscription`, `worker`
i `client`; `REFERENCES` na `organizations`; `UPDATE` na `worker` i `client`.
Każde z nich musi obejmować `WITH GRANT OPTION`. Konto provisioningowe ma przez
to administracyjny dostęp do wymienionych obiektów i musi być chronione jak
konto uprzywilejowane; nie wolno używać go jako runtime. Jeśli choć jednej
zdolności delegowania brakuje, preflight kończy się przed `CREATE ROLE`.

```powershell
psql.exe '<ADMIN_CONNECTION>' `
  -v workforce_schedule_expected_database='<EXACT_DATABASE_NAME>' `
  -v workforce_schedule_expected_provisioning_admin='<EXACT_ADMIN_ROLE>' `
  -v workforce_schedule_role_provision_confirmation='PROVISION_WORKFORCE_SCHEDULE_ROLES_ONLY_20260906' `
  -f 'dataconnect/admin/20260906_workforce_schedule_roles_preprovision.psql'
```

`<ADMIN_CONNECTION>`, `<EXACT_DATABASE_NAME>` i `<EXACT_ADMIN_ROLE>` są
placeholderami, nie wartościami produkcyjnymi. Połączenia ani haseł nie wolno
zapisywać w repozytorium, logach czy historii powłoki. Preferowane jest
połączenie bez wpisywania sekretu do argumentu procesu, np. lokalny Cloud SQL
Auth Proxy oraz interaktywny prompt `psql`.

Pomyślny preprovisioning nie jest zgodą na migrację, ustawienie sekretów, zmianę
konfiguracji Hostingu, włączenie flag, push ani deploy.

## Plan wyłączenia konta provisioningowego

To jest wyłącznie plan osobnego, ręcznie zatwierdzanego etapu. Skrypt
preprovisioningu nie wykonuje żadnego z poniższych poleceń, a tego etapu nie
wolno łączyć z migracją ani wdrożeniem.

Po ukończeniu wszystkich zatwierdzonych etapów właściciel obiektów źródłowych
powinien najpierw potwierdzić końcowe ACL roli `workforce_schedule_owner` oraz
brak źródłowych ACL ról `workforce_schedule_session` i
`workforce_schedule_app`, a następnie sprawdzić grantora. Dopiero potem może
cofnąć kontu provisioningowemu bezpośrednie
`GRANT OPTION` na schemacie i tabelach źródłowych. Nie wolno wykonywać
nieprzygotowanego `REVOKE ... CASCADE`: prawa nadane dalej przez provisionera
mogłyby zostać usunięte razem z jego ścieżką delegowania. Zakres oraz wynik
takiego cofnięcia wymagają oddzielnego audytu ACL.

Następnie administrator, który utworzył konto provisioningowe, powinien zmienić
je na `NOLOGIN NOCREATEROLE` i potwierdzić, że żadna inna rola nie może go
odziedziczyć ani użyć przez `SET ROLE`. Cztery automatyczne krawędzie
`ADMIN TRUE, SET FALSE, INHERIT FALSE` do wyłączonej roli mogą pozostać — ich
samodzielne usunięcie nie jest możliwe dla ograniczonego twórcy. Wyłączenie
loginu i `CREATEROLE`, podobnie jak cofnięcie ACL, wymaga osobnej zgody
bazodanowej i ponownej weryfikacji po wykonaniu.
