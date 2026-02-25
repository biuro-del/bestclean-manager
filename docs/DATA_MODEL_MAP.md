# Data Model Map (Sheets -> Firestore)

## Cel

Mapowanie służy do pełnej migracji danych historycznych i zachowania logiki biznesowej 1:1.

## Arkusze i kolekcje

| Google Sheet | Firestore collection | Klucz docelowy | Uwagi |
|---|---|---|---|
| `Pracownicy` | `users` | `uid` (Firebase Auth) + `legacyWorkerId` | Logowanie e-mail, role w claims i w `users`. |
| `Strefy` | `zones` | `roomId` | Funkcja QR: `START`, `STOPx`, `CLEAN`, `SPRZATANIE_INDYWIDUALNE`. |
| `Backup_Log` | `cycles` | `cycleId` | Historia cykli sprzątania i atomowe przejścia. |
| `Workday_Log` | `workdays` | `workdayId` | Statusy: `RUNNING`, `ENDING`, `CLOSED`. |
| `Workday_Pauza` | `pauses` | `pauseId` | Powiązanie z `workdayId` i użytkownikiem. |
| `Coordinator_Log` | `coordinatorLogs` | `logId` | Dostęp ograniczony przez role. |
| `Checklist` | `checklists` | `checklistId` | Powiązania z `roomId`/`cycleId`/`workdayId` wg endpointów. |
| `Grafik` (zewnętrzny plik) | `schedules` | `workerId + weekKey` | Snapshot tygodniowy do odczytu. |
| `Zlecenia indywidualne` | `indOrders` | `qrId` (`BCIxxxx`) | Resolver QR dla zleceń indywidualnych. |
| `Sessions` (logika) | `sessions` | `uid` | Wymuszenie single-device. |

## Konwencje pól czasu

- Wszystkie znaczniki czasu zapisujemy jako `Timestamp` i równolegle `iso` tam, gdzie potrzebne dla zgodności.
- Porównania dnia roboczego wykonujemy po czasie lokalnym użytkownika (`Europe/Warsaw` + offset klienta).

## Zasady integralności

1. Jedna aktywna sesja na użytkownika (`sessions/{uid}`).
2. Jeden aktywny `workday` na użytkownika.
3. Jeden aktywny `cycle` na użytkownika.
4. Operacje `stopAndStart` i `stopCycleAndBeginEnding` muszą być atomowe (transakcja).

## Plan migracji rekordów

1. Eksport surowy z arkuszy do JSON/CSV.
2. Walidacja wymaganych kolumn.
3. Transformacja do docelowych obiektów Firestore.
4. Import batchami z raportowaniem.
5. Raport porównawczy: liczność + sumy czasów + próbka rekordów.
