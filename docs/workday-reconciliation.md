# Czas pracy na podstawie sesji Workday

## Kontrakt danych

Jedynym źródłem czasu pracy pracownika jest `Workday.startAt → Workday.endAt`. Każdy rekord `Workday` oznacza jedną sesję obecności START–STOP. Pracownik może mieć dowolną liczbę nienakładających się sesji w warszawskiej dacie biznesowej.

`Event` jest czynnością operacyjną u klienta lub w strefie. Jest przypisywany wyłącznie przez `Event.workdayId`, jest wyświetlany wewnątrz sesji, ale nigdy nie zwiększa czasu pracy. Raporty klienta i strefy mogą nadal prezentować czas czynności, lecz nie nazywają go czasem pracy pracownika.

Agregator nie ufa zapisanym `durationSec`. Czas wylicza w sekundach z timestampów. Przerwy są informacyjne i nie pomniejszają wyniku: `realWorkSec = workedSec`.

Zasady dnia:

- suma obejmuje tylko poprawne, zamknięte rekordy `Workday`;
- przerwy między sesjami nie są liczone;
- otwarta sesja nie dostaje sztucznego STOP i nie jest doliczana;
- `firstStartAt` jest najwcześniejszym START;
- `lastStopAt` jest `null`, jeżeli istnieje choć jedna otwarta sesja;
- nakładające się sesje dają stan `INVALID`, ale podgląd liczy unię przedziałów;
- sesja może przejść przez północ i należy do daty START w `Europe/Warsaw`;
- jedna sesja nie może przekraczać 24 godzin.

Stany integralności: `COMPLETE`, `OPEN_SESSION`, `INCONSISTENT`, `INVALID`. Eksport jest dozwolony wyłącznie dla dni `COMPLETE`.

## Zdarzenia w sesji

Modal pokazuje START, wcięte chronologicznie czynności oraz STOP. Dla otwartej sesji wyświetla „Brak STOP — sesja N”. Czynność bez STOP ma komunikat „Brak zakończenia zdarzenia”. `Event` bez poprawnego `workdayId` trafia do osobnej grupy „Nieprzypisane zdarzenia” i nie wpływa na sumę.

Korekta czynności może zmienić jej czas i strefę, ale przedział musi pozostać wewnątrz przypisanej sesji. Pracownik, GPS, identyfikator oraz oryginalny komentarz pozostają tylko do odczytu. Klient i lokalizacja wynikają z wybranej strefy i są walidowane przez backend.

## API

Lista dni:

`GET /api/portal/work-time/days?orgId=…&workerLogin=…&fromYmd=YYYY-MM-DD&toYmd=YYYY-MM-DD&page=1&pageSize=50`

Pełny dzień:

`GET /api/portal/work-time/days/:businessDate?orgId=…&workerLogin=…`

Zapis korekty:

`POST /api/portal/work-time/days/:businessDate?orgId=…&workerLogin=…`

Przykład:

```json
{
  "expectedVersion": "64-znakowy-hash-dnia",
  "attendanceCorrections": [
    { "workdayId": "WD-3", "endAt": "2026-08-01T14:00:00.000Z" }
  ],
  "activityCorrections": [
    { "eventId": "EV-8", "startAt": "2026-08-01T12:10:00.000Z", "endAt": "2026-08-01T12:20:00.000Z", "zoneId": "Z-2" }
  ],
  "reason": "Korekta administratora",
  "idempotencyKey": "work-time-20260801-01",
  "finalize": true
}
```

Zapis działa w jednej transakcji, blokuje wszystkie `Workday` i `Event` pracownika dla daty, ponownie agreguje dzień i zapisuje niezmienny audyt przed/po. Nieaktualna wersja, nakładanie, zdarzenie poza sesją lub finalizacja z brakującym STOP zwracają HTTP `409`.

Stary endpoint `GET /api/portal/workdays/:id/reconciliation` jest wyłącznie adapterem odczytowym do modelu całego dnia. `POST` na stary endpoint zwraca `405 LEGACY_WORKDAY_WRITE_DISABLED`.

## Uprawnienia i bezpieczeństwo

Odczyt i zapis są ograniczone do aktywnej organizacji. Backend korzysta z UID Firebase i istniejących ról. Zapis wymaga uprawnienia administracyjnego; obowiązująca blokada edycji własnej ewidencji pozostaje aktywna.

Stary edytor Zdarzeń nie może zmieniać `Eventu` powiązanego z `Workday`, ponieważ ominąłby transakcję, optimistic lock i audyt. Taki rekord otwiera wspólny dialog dnia.

Uzgadnianie dnia pozostaje jedynym kontrolowanym procesem korekt czasu pracy; pozostałe moduły nie mogą omijać transakcji, optimistic locka ani audytu.

## Schemat i wdrożenie

Wykorzystywana jest istniejąca, addytywna migracja `dataconnect/migrations/20260803_workday_reconciliation_additive.sql`, która dodaje `businessDateYmd` i niezmienny rejestr audytu. Migracja nie poprawia danych historycznych i nie jest uruchamiana automatycznie.

Przed wdrożeniem:

1. Odświeżyć poświadczenia Google i wykonać read-only audyt.
2. Sprawdzić `scripts/audit-workday-reconciliation.sql` bez zapisu danych.
3. Wykonać kopię i dopiero po zatwierdzeniu uruchomić migrację ręcznie.
4. Wdrożyć backend, potem portal.
5. Zweryfikować przypadki: dwie sesje jednego dnia, otwarty drugi START, zdarzenie osierocone, nakładanie i sesja przez północ.

Migracji ani korekt historycznych nie uruchamiać automatycznie.
