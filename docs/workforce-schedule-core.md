# Grafik — niezależny rdzeń planowania

## Granica domeny

`Grafik` jest osobnym modułem i własnym źródłem prawdy dla zmian, przydziałów,
wersji oraz wewnętrznych publikacji. Nie odczytuje ani nie zapisuje Zleceń,
Kalendarza, zadań, kodów QR, ewidencji pracy lub przejazdów.

Jedynymi wejściami z platformy są katalogi referencyjne:

- aktywni pracownicy, identyfikowani stabilnym ID pracownika;
- aktywne obiekty firmy sprzątającej z istniejącego katalogu `client`,
  identyfikowane stabilnym `client_id`.

Grafik nie korzysta z nieobecnego na produkcji `service_object` ani z
`facility_manager_object`, który należy do odrębnej domeny zarządcy obiektu.
Do katalogu trafiają wyłącznie rekordy ze statusem `ACTIVE` lub `Aktywny`;
status pusty, nieznany, nieaktywny albo archiwalny jest traktowany jako
nieaktywny.

Nazwy są snapshotem prezentacyjnym. Relacje Grafiku opierają się na ID, nigdy na
nazwie lub adresie.

## Tryb wewnętrzny

Pierwsze wydanie jest produkcyjnym modułem administracyjnym, ale bez dostarczania
danych pracownikom. Zapis w bazie Grafiku jest prawdziwy. Wszystkie efekty poza
modułem pozostają twardo wyłączone:

```json
{
  "effects": {
    "delivery": false,
    "notifications": false,
    "downstream": false
  }
}
```

Backend odrzuca komendę lub publikację, która nie zawiera dokładnie tego
kontraktu albo próbuje włączyć którykolwiek efekt. Wewnętrzna publikacja oznacza
zatwierdzenie wersji w Grafiku; nie oznacza SMS, e-maila, push, widoczności w
aplikacji pracownika ani zmiany ewidencji pracy.

## Ustawienia operacyjne

Administrator lub właściciel organizacji może zmienić wyłącznie ustawienia,
które mają rzeczywisty kontrakt backendowy:

- strefę czasową IANA używaną do interpretacji zmian;
- tygodniowy limit pracy od 1 minuty do 168 godzin, używany przez ostrzeżenia
  przed zatwierdzeniem Grafiku.

Zapis korzysta z wersji optymistycznej `expectedVersion`, osobnego klucza
idempotencji i jest uznawany w UI dopiero po zwróceniu przez backend dokładnego
`orgId`, nowych wartości oraz wersji większej o jeden. Wynik ze starej sesji lub
innej organizacji nie może zmienić bieżącego widoku. Strefa czasowa jest
niezmienna po utworzeniu pierwszej zmiany; tę regułę wymusza backend.

Okno ustawień nie zawiera atrap opcji prezentacyjnych i nie steruje
dostarczaniem do aplikacji pracownika, powiadomieniami, Zleceniami ani
Kalendarzem.

## Kopiowanie tygodnia

Kopiowanie tygodnia jest jedną, atomową komendą `COPY_WEEK`. Frontend wysyła
wyłącznie poniedziałek tygodnia źródłowego oraz posortowaną listę
`expectedVersions` wszystkich potwierdzonych zmian źródłowych. Zmiana oznaczona
`pendingDeletion` nie jest źródłem kopii. Lokalny szkic bez serwerowego ID,
rewizji i wersji blokuje operację zamiast być kopiowanym optymistycznie.

Serwer ponownie odczytuje i blokuje bieżące, niearchiwalne rewizje źródłowe,
porównuje ich pełny zestaw oraz wersje z żądaniem, a następnie sprawdza pusty
tydzień docelowy. Rekord docelowy oznaczony `pendingDeletion` nadal zajmuje
tydzień i blokuje kopiowanie. Daty są przesuwane o siedem dni kalendarzowych w
strefie Grafiku, a czasy UTC są wyliczane ponownie, tak aby zachować lokalną
godzinę również na granicy DST. Każda kopia otrzymuje nowe ID i powstaje jako
szkic z `revision=1`, `version=1`, bez stanu publikacji.

UI nie dopisuje kopii do stanu lokalnego i nie wykonuje serii `UPSERT_SHIFT`.
Przechodzi do następnego tygodnia oraz pokazuje sukces dopiero po jednej
odpowiedzi zawierającej dokładny receipt: `orgId`, zakres źródłowy, zakres
docelowy, `createdCount` i mapowanie każdego `sourceShiftId` na nowe `shiftId`,
datę, rewizję i wersję. Brak, nadmiar lub duplikat wpisu, obce `orgId`, zły zakres
albo inna wersja powodują odrzucenie potwierdzenia i odświeżenie widoku.
Jeżeli zapis mógł zostać przyjęty, lecz receipt nie przeszedł walidacji, ponowienie
tej samej operacji zachowuje pierwotny klucz idempotencji i odbiera zapisany
wynik zamiast próbować tworzyć drugi komplet kopii.
Odpowiedź zakończona po zmianie sesji lub organizacji jest ignorowana i nie może
zmienić zakresu, komunikatu ani blokady zapisu nowej sesji. Klucz idempotencji
obejmuje organizację i cały payload, a efekty `delivery`, `notifications` i
`downstream` pozostają wyłączone.

## Niedozwolone zależności

Kod Grafiku nie może importować ani wywoływać:

- `features/orders`;
- `features/calendar`;
- `scheduleTaskDataConnectService`;
- endpointów `schedule-orders`;
- tabel `task`, `event`, `workday` ani danych aplikacji pracownika.

Przyszłe podłączenie aplikacji pracownika lub innych modułów jest osobnym
projektem i wymaga nowego kontraktu oraz jawnego włączenia efektu.

## Bezpieczeństwo wydania

- Backend jest domyślnie wyłączony przez `WORKFORCE_SCHEDULE_ENABLED=false`
  oraz niezależną politykę `WORKFORCE_SCHEDULE_ROLLOUT_MODE=OFF`.
- Rollout ma tylko trzy tryby: `OFF`, `CANARY` i `ALL`. Nieznany albo pusty tryb
  zachowuje się jak `OFF`. `CANARY` wymaga dokładnego `org_id` na rozdzielonej
  przecinkami liście `WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS`; pusta lub
  nieprawidłowa lista nie dopuszcza żadnej organizacji. `ALL` jest osobną,
  jawną decyzją i nadal respektuje wszystkie pozostałe bramki dostępu.
- Frontend live jest domyślnie wyłączony przez `VITE_WORKFORCE_SCHEDULE_MODE`.
- Dostęp wymaga organizacyjnego Firebase ID tokenu, aktywnego członkostwa oraz
  aktywnego profilu pracownika. Sesja administratora platformy jest odrzucana.
- `ADMIN` może konfigurować, edytować i zatwierdzać; `MANAGER` może edytować i
  zatwierdzać; `COORDINATOR` ma wyłącznie podgląd.
- Każda operacja jest ograniczona do organizacji z aktywnego kontekstu.
- Tabele `workforce_schedule_*` mają wymuszone RLS oraz minimalne granty.
- Migracja przed i po DDL audytuje surowe `pg_default_acl` właściciela. Każdy
  domyślny grant dla roli innej niż `workforce_schedule_owner` zatrzymuje i
  wycofuje migrację. Końcowy allowlist obejmuje ACL tabel, kolumn, sekwencji i
  funkcji, więc `portal_app` ani inna rola nie może odziedziczyć dostępu.
- Login `workforce_schedule_session` i rola wykonawcza
  `workforce_schedule_app` nie mają bezpośredniego `SELECT` ani praw zapisu do
  wspólnych tabel `organizations`, `organization_member`,
  `organization_subscription`, `worker` i `client`. Autoryzację, filtrowany
  odczyt aktywnych katalogów oraz blokady użytych rekordów realizują wyłącznie
  wąskie funkcje `SECURITY DEFINER` należące do
  `workforce_schedule_owner`, ze stałym `search_path=pg_catalog` i dokładnym
  allowlistem `EXECUTE`.
- Token Firebase jest weryfikowany przez backend przed wywołaniem funkcji
  autoryzacyjnej. Funkcja bazy potwierdza wyłącznie dokładną parę `orgId + uid`;
  sama baza nie zastępuje kryptograficznej weryfikacji tokenu Firebase.
- Readiness przypina sześć funkcji `SECURITY DEFINER` do dokładnie
  zrecenzowanych ciał z migracji przez `md5(pg_proc.prosrc)`. Osobno sprawdza
  język, typ funkcji, volatility, ownera, `search_path`, sposób przechowywania
  ciała, kontrakt wyniku oraz ACL. Zmiana treści lub sygnatury wyniku zatrzymuje
  Grafik przed wykonaniem operacji.
- Grafik ma osobny pool i login `workforce_schedule_session`, zasilany wyłącznie
  przez `WORKFORCE_SCHEDULE_DB_USER` oraz `WORKFORCE_SCHEDULE_DB_PASS`. Nie
  korzysta z `DB_USER`, `DB_PASS` ani członkostwa `portal_app`.
- Uśpiona konfiguracja `apphosting.yaml` celowo nie wskazuje jeszcze sekretów
  loginu Grafiku. Referencje do nich wolno dodać dopiero w osobnym kandydacie
  aktywacyjnym, po utworzeniu aktywnych wersji i nadaniu dostępu kontu runtime;
  dzięki temu brak nowych sekretów nie blokuje wdrożeń niezwiązanych z Grafikiem.
- Tryb logowania do bazy jest wymagany osobno jako
  `WORKFORCE_SCHEDULE_DB_AUTH_TYPE=PASSWORD`. Nie dziedziczy
  `CLOUD_SQL_AUTH_TYPE` ani `DB_AUTH_TYPE`; brak, `IAM` lub inna wartość
  zatrzymuje uruchomienie Grafiku z bezpiecznym błędem 503. IAM wymaga osobnego
  projektu roli Cloud SQL i nie jest obsługiwany przez obecny natywny login.
- Każda transakcja Grafiku jawnie i lokalnie przełącza się na
  `workforce_schedule_app`; po `COMMIT` lub `ROLLBACK` bieżąca rola musi wrócić
  do `workforce_schedule_session`.
- Migracja jest addytywnym kandydatem; nie uruchamia się automatycznie.

## Warunki aktywacji

Przed pierwszym włączeniem produkcyjnym trzeba osobno utworzyć ograniczone role i
członkostwa, ustawić dwa dedykowane sekrety, wykonać migrację na PostgreSQL 17,
sprawdzić kontrakt uprawnień,
izolację dwóch organizacji oraz uwierzytelniony przepływ przeglądarkowy. Dopiero
po tych bramkach można osobno ustawić backendowe
`WORKFORCE_SCHEDULE_ENABLED=true`, bezpieczny rollout
`WORKFORCE_SCHEDULE_ROLLOUT_MODE=CANARY`, dokładną listę
`WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS` i frontendowe
`VITE_WORKFORCE_SCHEDULE_MODE=live`. Flagi `DELIVERY`, `NOTIFICATIONS` i
`DOWNSTREAM` pozostają `false`. Tryb `ALL` wymaga późniejszej, osobnej decyzji
po zakończeniu canary.

Autoryzacja dopuszcza wyłącznie kanoniczny typ organizacji
`CLEANING_PROVIDER`. Organizacja z pustym, historycznym albo innym typem jest
odrzucana. Przed aktywacją trzeba więc wykonać osobny audyt tylko do odczytu dla
organizacji docelowej; ewentualna klasyfikacja lub backfill danych wymaga osobnej
zgody i nie jest częścią tej migracji.

Wycofanie aplikacyjne jest bezstratne: wyłącz oba przełączniki aktywujące i
pozostaw addytywny schemat w bazie. Nie ma automatycznego skryptu `DROP`, ponieważ
po rozpoczęciu pracy mógłby usunąć historię Grafiku. Ewentualne usunięcie pustego
schematu przed pierwszym użyciem wymaga osobnej, ręcznej decyzji migracyjnej.
