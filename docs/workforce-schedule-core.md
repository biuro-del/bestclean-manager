# Grafik — niezależny rdzeń planowania

## Granica domeny

`Grafik` jest osobnym modułem i własnym źródłem prawdy dla zmian, przydziałów,
wersji oraz wewnętrznych publikacji. Nie odczytuje ani nie zapisuje Zleceń,
Kalendarza, zadań, kodów QR, ewidencji pracy lub przejazdów.

Jedynymi wejściami z platformy są katalogi referencyjne:

- aktywni pracownicy, identyfikowani stabilnym ID pracownika;
- aktywne obiekty, identyfikowane stabilnym ID obiektu.

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

- Backend jest domyślnie wyłączony przez `WORKFORCE_SCHEDULE_ENABLED`.
- Frontend live jest domyślnie wyłączony przez `VITE_WORKFORCE_SCHEDULE_MODE`.
- Dostęp wymaga organizacyjnego Firebase ID tokenu, aktywnego członkostwa oraz
  aktywnego profilu pracownika. Sesja administratora platformy jest odrzucana.
- `ADMIN` może konfigurować, edytować i zatwierdzać; `MANAGER` może edytować i
  zatwierdzać; `COORDINATOR` ma wyłącznie podgląd.
- Każda operacja jest ograniczona do organizacji z aktywnego kontekstu.
- Tabele `workforce_schedule_*` mają wymuszone RLS oraz minimalne granty.
- Dedykowana rola `workforce_schedule_app` ma do katalogów źródłowych wyłącznie
  odczyt. Blokady użytych rekordów pracowników i obiektów wykonują dwie wąskie
  funkcje `SECURITY DEFINER`, należące do `workforce_schedule_owner`.
- Sesja backendu działa jako `portal_app`, a każda transakcja Grafiku jawnie i
  lokalnie przełącza się na `workforce_schedule_app`; po `COMMIT` lub `ROLLBACK`
  bieżąca rola musi wrócić do `portal_app`.
- Migracja jest addytywnym kandydatem; nie uruchamia się automatycznie.

## Warunki aktywacji

Przed pierwszym włączeniem produkcyjnym trzeba osobno utworzyć ograniczone role i
członkostwa, wykonać migrację na PostgreSQL 17, sprawdzić kontrakt uprawnień,
izolację dwóch organizacji oraz uwierzytelniony przepływ przeglądarkowy. Dopiero
po tych bramkach można osobno ustawić backendowe
`WORKFORCE_SCHEDULE_ENABLED=true` i frontendowe
`VITE_WORKFORCE_SCHEDULE_MODE=live`. Flagi `DELIVERY`, `NOTIFICATIONS` i
`DOWNSTREAM` pozostają `false`.

Wycofanie aplikacyjne jest bezstratne: wyłącz oba przełączniki aktywujące i
pozostaw addytywny schemat w bazie. Nie ma automatycznego skryptu `DROP`, ponieważ
po rozpoczęciu pracy mógłby usunąć historię Grafiku. Ewentualne usunięcie pustego
schematu przed pierwszym użyciem wymaga osobnej, ręcznej decyzji migracyjnej.
