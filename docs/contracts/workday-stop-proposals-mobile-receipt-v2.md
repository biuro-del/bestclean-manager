# Workday STOP Proposal Mobile Receipt V2

Status: zatwierdzony i wypchnięty kandydat backendu, nadal niewdrożony.
Kandydat: commit `58d85127d5d4292723a2d9e57c78adf469158107` na branchu
`codex/history-stop-p0-prod-aligned-20260908`.
Ten dokument nie jest dowodem działania produkcyjnego ani testu E2E na rzeczywistej bazie.
Aktualny klient Production Test oczekuje tego kontraktu i przy jego braku pozostaje
fail-closed: Historia jest czytelna, ale wysłanie propozycji jest zablokowane.

V2 rozszerza mobilną część V1 bez zmiany istniejących tabel. Organizacja i pracownik
są zawsze wyprowadzane ze zweryfikowanego tokenu Firebase. Pola zakresu przesłane
przez klienta nie mogą rozszerzyć dostępu.

## SUBMIT

Nowy klient, w tym APK, wysyła jawnie:

```json
{
  "operation": "SUBMIT",
  "workdayId": "WD-123",
  "proposedStopLocal": "2026-09-02T19:15",
  "timeZone": "Europe/Warsaw",
  "employeeNote": "opcjonalnie",
  "clientActionId": "trwały-identyfikator-operacji"
}
```

`clientActionId` musi powstać raz przed pierwszą próbą i pozostać ten sam po
timeout, restarcie procesu oraz ponownym uruchomieniu aplikacji. Backend porównuje
kanoniczny fingerprint zamiaru: `workdayId`, wynikowy `proposedStopAt`,
`proposedStopLocal`, `timeZone` i znormalizowany `employeeNote`.

Schema gate wymaga nie tylko trzech relacji V1, ale również poprawnego, ważnego
i gotowego unikalnego indeksu
`workday_stop_proposal_worker_client_action_uidx` na dokładnych kolumnach
`(org_id, worker_id, client_action_id)`. Brak lub drift indeksu wyłącza cały
endpoint fail-closed.

- ten sam `clientActionId` i ten sam fingerprint zwraca istniejący rekord;
- ten sam `clientActionId` i inny `workdayId` zwraca HTTP 409
  `WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_SCOPE_CONFLICT`;
- ten sam `clientActionId` i inny fingerprint zwraca HTTP 409
  `WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_PAYLOAD_CONFLICT`;
- wyścig dwóch równoległych zapisów z tym samym `clientActionId` dla różnych dni
  jest rozpoznawany po nazwie unikalnego indeksu i zwraca HTTP 409
  `WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_SCOPE_CONFLICT`;
- retry jest rozstrzygany przed blokadą i ponowną walidacją zmiennego stanu
  Workday, więc nadal działa po późniejszym zatwierdzeniu propozycji.

Sukces pierwszego zapisu:

```json
{
  "ok": true,
  "operation": "SUBMIT",
  "idempotent": false,
  "receipt": {
    "operation": "SUBMIT",
    "proposalId": "wdsp_...",
    "workdayId": "WD-123",
    "clientActionId": "trwały-identyfikator-operacji",
    "status": "PENDING",
    "idempotent": false
  },
  "proposal": {
    "proposalId": "wdsp_...",
    "workdayId": "WD-123",
    "clientActionId": "trwały-identyfikator-operacji",
    "status": "PENDING"
  }
}
```

Idempotentny replay ma ten sam kształt, lecz oba pola `idempotent` mają wartość
`true`. Brak `operation` jest tymczasowo akceptowany wyłącznie dla zgodności ze
starym klientem WEB. Nie jest częścią kontraktu APK V2. Nieznana operacja jest
odrzucana przed połączeniem z bazą.

## STATUS_ACTION

Po timeout klient nie generuje nowego ID i nie wysyła od razu ponownie SUBMIT.
Najpierw pyta o dokładną operację:

```json
{"operation":"STATUS_ACTION","clientActionId":"trwały-identyfikator-operacji"}
```

Odczyt nie otwiera transakcji ani blokady i jest ograniczony do tokenowo
wyprowadzonych `orgId + workerId + clientActionId`.

Gdy zapis istnieje, odpowiedź zawiera `found: true`, `idempotent: true`, pełny
`receipt` oraz `proposal` z `workdayId` i `clientActionId`. Gdy nie istnieje,
odpowiedź wynosi dokładnie:

```json
{
  "ok": true,
  "operation": "STATUS_ACTION",
  "found": false,
  "idempotent": false,
  "receipt": null,
  "proposal": null
}
```

Brak odpowiedzi lub błąd STATUS_ACTION nie dowodzi braku zapisu. APK pozostaje
wtedy fail-closed i zachowuje journal do późniejszego sprawdzenia.

## STATUS

Istniejący odczyt `STATUS` pozostaje zgodny z V1. Odpowiedź zawiera jawne
`operation: "STATUS"`. Każdy zwrócony wpis zawiera także `clientActionId`,
`workdayId` i pełną macierz statusów: `PENDING`, `APPROVED`, `CORRECTED`,
`REJECTED`, `SUPERSEDED`. Klient traktuje nieznany status fail-closed.

## Decyzja biura i Eventy

`APPROVE` oraz `CORRECT` zamykają w jednej transakcji propozycję, kanoniczny
Workday, wszystkie jego Eventy z pustym `end_at` oraz audyt. Każdy domykany Event
otrzymuje `end_at` i `close_marked_at` równe `officialStopAt`, obliczony
`duration_sec`, status `CLOSED` i techniczny `end_reason=WORKDAY_STOP_PROPOSAL`.
Pola `Event.zone_id` i `Workday.utility_room_id` nie są zmieniane.

Przed zapisem backend blokuje i waliduje wszystkie Eventy powiązane z Workday.
Decyzja jest odrzucana bez częściowego zapisu, jeśli brakuje prawidłowego
`start_at`, dowolny Event zaczyna się w lub po `officialStopAt`, albo zamknięty
Event ma ujemny zakres bądź kończy się po `officialStopAt`. `REJECTED` i
`SUPERSEDED` nie uruchamiają kaskady.

Portalowy `clientActionId` decyzji jest również kontraktem idempotencji. Powtórka
jest no-op wyłącznie, gdy aktor, rodzaj decyzji, oficjalna godzina i znormalizowana
notatka odpowiadają istniejącemu audytowi. Zmieniony zamiar pod tym samym ID zwraca
HTTP 409 `WORKDAY_STOP_PROPOSAL_DECISION_IDEMPOTENCY_CONFLICT` przed kaskadą.

## Zakres niezależny od polityki 12 godzin

Receipt V2 nie wdraża automatycznego zamykania po 12 godzinach, nie odczytuje
`auto_close_at` i nie zmienia reguł długości Workday. Ewentualna obsługa
`AUTO_12H_MISSING_STOP` pozostaje osobnym kontraktem, testem i wdrożeniem.

## Bramy wydania

Ten patch nie wykonuje migracji i nie wymaga nowej kolumny. Przed wdrożeniem są
wymagane osobne zgody na backend i klienta, zielony schema preflight trzech relacji
oraz dokładnego indeksu idempotencji, a także uwierzytelnione testy canary:

1. `SUBMIT -> utrata odpowiedzi -> STATUS_ACTION -> replay`;
2. `APPROVE` i `CORRECT` z otwartym Eventem oraz kontrolą wspólnego `endAt`;
3. `REJECT`, `SUPERSEDED`, konflikt czasu i retry decyzji;
4. potwierdzenie, że po błędzie nie pozostał częściowo zapisany Workday ani Event.

Produkcyjne odblokowanie formularza pozostaje zależne od wdrożonego backendu V2,
zielonego schema preflight i powyższych testów canary. Sam lokalny kod nie spełnia
tej bramki.
