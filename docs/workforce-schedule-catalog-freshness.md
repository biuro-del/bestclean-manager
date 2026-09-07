# Grafik: świeżość katalogów pracowników i obiektów

Ten kontrakt dotyczy wyłącznie referencyjnych katalogów niezależnego modułu
`Grafik`. Źródłami pozostają aktywny `worker` oraz aktywny `client`. Synchronizacja
nie odczytuje ani nie zapisuje Zleceń, Kalendarza, QR, ewidencji pracy lub danych
aplikacji pracownika.

## Widok bieżący i historyczny

Bootstrap zwraca:

- wszystkie aktywne snapshoty osób i obiektów organizacji;
- nieaktywne snapshoty tylko wtedy, gdy są wskazane przez zmianę zwróconą dla
  żądanego zakresu dat;
- normalizacja po stronie portalu nadaje jawne `selectable: false` każdemu
  nieaktywnemu snapshotowi zwróconemu przez API.

Nieaktywne rekordy historyczne pochodzą wyłącznie z tabel Grafiku. Funkcje
`SECURITY DEFINER` nadal czytają z kanonicznych tabel `worker` i `client` tylko
rekordy aktywne. Zapytania historyczne zawsze zawężają dane przez `org_id` oraz
identyfikatory zmian już ograniczonych do żądanego zakresu.

Nieaktywną osobę lub lokalizację można pokazać przy istniejącej zmianie, ale nie
można jej użyć w nowej zmianie, nowym przypisaniu, jako domyślnej lokalizacji ani
jako celu przeciągania. Backend pozostaje ostateczną bramką i odrzuca zapis
odwołujący się do nieaktywnego snapshotu.

## Synchronizacja wyłącznie świadoma

Ręczne polecenie `SYNC_CATALOGS` jest dostępne wyłącznie dla `OWNER` i `ADMIN` i
pozostaje jedną atomową transakcją. Równoległe wywołania tej samej organizacji
współdzielą operację w toku. Kolejne świadome kliknięcie po sukcesie otrzymuje
nowy klucz idempotencji.

Zwykłe wejście do Grafiku, zmiana zakresu dat i odświeżenie widoku są operacjami
tylko do odczytu. Nie uruchamiają `SYNC_CATALOGS`. Wyjątkiem jest świadome
pierwsze uruchomienie przez administratora: przycisk `Uruchom Grafik` jawnie
tworzy konfigurację i wykonuje pierwszy odczyt katalogów.

Synchronizacja nie może automatycznie zdezaktywować żadnego istniejącego,
aktywnego snapshotu. Dotyczy to zarówno pustego, jak i częściowego odczytu
źródłowego. Już jedna brakująca osoba lub jeden brakujący obiekt zatrzymuje całą
transakcję przed pierwszym zapisem. Bezpieczna dezaktywacja wymaga osobnego,
przyszłego kontraktu `preview + confirm`; nie wolno jej wywnioskować z braku
rekordu w pojedynczym odczycie.

Sukces zwraca kompaktowe potwierdzenie:

```json
{
  "receipt": {
    "version": 1,
    "orgId": "example-org",
    "synchronizedAt": "2026-09-07T10:00:00.000Z",
    "people": { "active": 12, "created": 1, "updated": 2, "deactivated": 0 },
    "locations": { "active": 8, "created": 0, "updated": 1, "deactivated": 0 },
    "effects": { "delivery": false, "notifications": false, "downstream": false }
  }
}
```

Wszystkie liczniki są nieujemnymi liczbami całkowitymi. Receipt nie zawiera nazw,
loginów, Firebase UID ani list identyfikatorów. Podczas przejściowego okresu
zgodności odpowiedź zachowuje puste pola `people: []` oraz `locations: []`, żeby
starszy frontend wykonał ponowny bootstrap zamiast uznać prawidłowy zapis za
błąd.

`catalogSync.lastSyncedAt` w bootstrapie pochodzi z ostatniego zakończonego
polecenia synchronizacji zapisanego w tej samej zatwierdzonej transakcji. Nie
jest wyliczany z `max(synced_at)`, ponieważ bezczynna, ale poprawna synchronizacja
nie musi zmienić żadnego wiersza katalogu.

## Błędy i obserwowalność

Nieudana albo wycofana transakcja nie aktualizuje receipt, czasu ostatniej
synchronizacji ani widocznego snapshotu. UI może prezentować wyłącznie
dozwolone pola konfliktu:

- `personId` albo `locationId`;
- `shiftId`;
- `date` w formacie `YYYY-MM-DD`;
- `hasMore`.

Dowolne inne pole `error.details` jest ignorowane. Efekty `delivery`,
`notifications` i `downstream` pozostają zawsze równe `false`.
