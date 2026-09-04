# Obowiązkowe wizyty w strefach QR V1

## Cel

Po pierwszym skanie kodu QR przypisanego do obiektu aktywnego dnia pracy backend tworzy niezmienną listę stref tego obiektu oznaczonych jako wymagane. Aplikacja pracownika pokazuje postęp tej listy. W trybie wymuszającym skan STOP nie może zakończyć dnia, dopóki wszystkie wymagane kody nie zostały zeskanowane.

Ten kontrakt dotyczy webowej aplikacji pracownika i portalu. Nie jest kontraktem APK Flutter.

## Konfiguracja strefy

- `public.zone.required_visit` jest polem logicznym z wartością domyślną `false`.
- Portal pokazuje pole „Wymagana wizyta” podczas dodawania i edycji kodu QR.
- Kod START ani STOP nie może zostać oznaczony jako wymagana strefa. Serwis portalu wymusza tę zasadę także poza interfejsem.
- Istniejące operacje Data Connect `InsertZoneForOrg` i `UpdateZoneForOrg` zachowują dotychczasową sygnaturę, dzięki czemu starsi klienci pozostają zgodni.
- Portal odczytuje flagi i zapisuje kompletny rekord strefy przez uwierzytelniony endpoint `/api/portal/zones`. Backend wyprowadza użytkownika z tokenu, ponownie sprawdza członkostwo, plan i rolę oraz zapisuje zmianę w jednej transakcji.
- Przygotowane definicje Data Connect dla `requiredVisit` nie są bramką wydania portalu. Nie wolno publikować całego lokalnego schematu nad produkcją, dopóki niezależny audyt zgodności nie usunie destrukcyjnego driftu wykrytego 2026-09-03.

## Lista obiektu

- Kluczem listy jest `(org_id, workday_id, client_id)`. Dla jednego obiektu w jednym Workday może istnieć tylko jedna lista.
- Lista jest tworzona przy pierwszym skanie dowolnego kodu QR przypisanego do danego obiektu.
- W chwili utworzenia kopiowane są identyfikator, nazwa i lokalizacja wszystkich stref obiektu mających `required_visit = true`, z wyłączeniem funkcji START i STOP.
- Lista jest migawką. Późniejsza edycja konfiguracji strefy nie zmienia już rozpoczętej listy pracownika; obowiązuje od następnej wizyty/Workday.
- Skan wymaganej strefy zapisuje pierwszą godzinę wizyty według czasu serwera oraz powiązany `Event` i `clientActionId`, jeżeli są dostępne.
- Ponowienie tego samego skanu jest bezpieczne: pierwszy zapis wizyty nie jest nadpisywany.

## Stan zwracany aplikacji

Snapshot mobilny zawiera `requiredZoneVisits`:

- `enabled`, `available`, `mode`;
- `objects[]` z nazwą obiektu i jego zamrożoną listą `zones[]`;
- dla strefy: `zoneId`, `name`, `location`, `visited`, `visitedAt`;
- postęp wyliczony z elementów listy: `requiredCount`, `visitedCount`, `remainingCount`;
- `activeObject`, `allComplete` i `incompleteObjectCount`.

Frontend nie ufa licznikom z odpowiedzi. Normalizuje ograniczoną liczbę elementów i sam wylicza postęp z flag `visited`.

## Blokada zakończenia dnia

- `OFF`: brak odczytów i zapisów nowych tabel; dotychczasowe zachowanie pozostaje bez zmian.
- `OBSERVE`: backend tworzy listy i pokazuje postęp, lecz nie blokuje STOP.
- `ENFORCE`: przed jakąkolwiek mutacją zamykającą dzień backend sprawdza listy po stronie serwera.
- W `ENFORCE` przejście do innego obiektu jest blokowane, jeżeli bieżący obiekt nadal ma brakujące strefy. Kolejne skany w obrębie tego samego obiektu pozostają dozwolone.
- Próba opuszczenia nieukończonego obiektu zwraca HTTP 409, kod `REQUIRED_OBJECT_ZONES_INCOMPLETE` i komunikat wskazujący obiekt oraz brakujące strefy.
- Brak wymaganych wizyt zwraca HTTP 409, kod `REQUIRED_ZONES_INCOMPLETE` i ograniczoną listę brakujących stref.
- Niedostępny lub niepełny schemat w `ENFORCE` zwraca HTTP 503, kod `REQUIRED_ZONE_VISITS_UNAVAILABLE`; dzień nie jest zamykany.
- Kontrola odbywa się w tej samej transakcji co workflow skanu. Odrzucony STOP nie zamyka Event ani Workday.

Tryb i canary są sterowane przez:

- `MOBILE_REQUIRED_ZONE_VISITS_MODE=OFF|OBSERVE|ENFORCE`;
- `MOBILE_REQUIRED_ZONE_VISITS_CANARY_ORG_IDS`;
- `MOBILE_REQUIRED_ZONE_VISITS_CANARY_WORKER_IDS`.

Nieznana wartość trybu jest traktowana jak `OFF`.

## Niezmienniki istniejącego workflow

- Organizacja i pracownik pochodzą ze zweryfikowanej sesji; identyfikatory z payloadu nie poszerzają zakresu.
- `Workday.utilityRoomId` nadal oznacza kod START dnia i nie jest zmieniany przez wizyty w strefach.
- Aktywna lub odwiedzona strefa pozostaje w `Event.zoneId`.
- Funkcja nie zmienia reguł GPS, korelacji Event ani propozycji STOP.
- Migracja jest addytywna i nie modyfikuje historycznych Workday ani Event.

## Granice pierwszej wersji

- Lista powstaje dopiero po pierwszym skanie kodu przypisanego do obiektu. V1 nie wyprowadza obiektów do odwiedzenia z grafiku.
- Schemat przewiduje stan `OVERRIDDEN` z powodem i aktorem, ale ten kandydat nie udostępnia jeszcze koordynatorowi endpointu ani ekranu awaryjnego pominięcia.
- Z tego powodu szerokie `ENFORCE` wymaga przed produkcją osobnej decyzji o procedurze awaryjnej. Bez niej bezpieczny etap to `OBSERVE` lub bardzo wąski canary.

## Kolejność bezpiecznego wydania

1. Osobno zatwierdzić i wykonać preflight bazy oraz addytywną migrację `20260903_mobile_required_zone_visits_additive.sql`.
2. Wdrożyć backend z trybem `OFF` i potwierdzić, że dotychczasowy workflow nie zmienił się.
3. Włączyć `OBSERVE` wyłącznie dla testowej organizacji/pracownika i wykonać zalogowane E2E: START, pierwszy obiekt, kompletna i niekompletna lista, switch strefy, STOP.
4. Wdrożyć portal i webową aplikację pracownika dopiero po zgodnych kontraktach backendu. Portal zapisuje `requiredVisit` przez `/api/portal/zones`; wydanie V1 nie wymaga aktualizacji produkcyjnego Data Connect.
5. `ENFORCE` włączyć osobną zgodą, najpierw dla canary, ze sprawdzonym rollbackiem do `OFF`.

Samo ustawienie `OFF` jest natychmiastowym rollbackiem zachowania. Dane addytywne pozostają do audytu; migracja nie zawiera destrukcyjnego rollbacku.

## Status kandydata 2026-09-03

Kod, migracja, portal i frontend są przygotowane lokalnie. Pierwszy commit kandydata istnieje, ale nie wykonano migracji, zapisu do bazy, pusha ani wdrożenia produkcyjnego. Walidacja `validateOnly` wykazała niezależny destrukcyjny drift schematu Data Connect, dlatego tor wdrożenia portalu został przełączony na bezpieczny endpoint backendu.
