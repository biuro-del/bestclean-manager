# Data Connect / Cloud SQL: granica wydania read-guard

Data: 2026-08-11. Dokument jest raportem diagnostycznym; nie jest instrukcją migracji SQL.

## Zweryfikowany stan

- Produkcyjny App Hosting `cleanzi-01` ma 100% ruchu na buildzie `build-2026-08-11-005`, ze źródła `Cleanzi-01` commit `f57cb3eb885368b19635b31afc5d6af248f2d8fc`.
- Wdrożony główny schemat Data Connect ma `updateTime` `2026-07-24T19:02:00.520545841Z`, a konektor `example` `2026-07-24T19:02:03.155808060Z`.
- Dry-run źródła opartego na wdrożonym schemacie kompiluje konektor, ale proponuje destrukcyjne usunięcie trzech istniejących ograniczeń SQL. Dry-run niczego nie zastosował.

## Przyczyny wykrytych różnic

1. `task_lifecycle_status_check`

   Produkcyjne źródło `f57` zawiera deklarację `Task.lifecycleStatus` oraz ręczną, addytywną migrację `dataconnect/migrations/20260727_task_lifecycle_additive.sql`. Migracja dodaje kolumnę, indeks i ograniczenie `task_lifecycle_status_check`. Wdrożony schemat Data Connect z 24 lipca nie opisuje jeszcze `lifecycle_status`. Ten dryf wyjaśnia, dlaczego schematowy dry-run chce usunąć ograniczenie.

2. `organization_subscription_plan_version_fk` i `organization_subscription_pricing_agreement_fk`

   Ani wdrożony zrzut Data Connect, ani autorytatywne źródło `f57` nie deklarują modeli lub migracji `plan_version` / `pricing_agreement`. Ograniczenia istnieją fizycznie w Cloud SQL, ale ich źródła nie ma w osiągalnej historii `Cleanzi-01`. To nieudokumentowany drift bazy, którego nie wolno usuwać dla wygody wydania konektora.

## Bezpieczna granica wdrożenia

- `firebase deploy --dry-run` zawsze liczy różnicę głównego schematu, również z filtrem konektora. Jest więc dobrym testem kompilacji i dryfu, ale nie symuluje wiernie release'u samego konektora.
- W ścieżce release Firebase CLI filtr `dataconnect:iclean-room-service:<connector>` wybiera konektor, ale nie wybiera głównego schematu. Nie wywołuje więc migracji schematu, o ile komenda nie zawiera pełnej usługi ani `:schema`.
- Wydanie read-guard musi utworzyć wyłącznie nowy konektor `read-guard`, obok istniejącego `example`. Konektor zawiera jedynie sześć ograniczonych operacji i własny wygenerowany SDK; nie aktualizuje ani nie usuwa operacji starszych klientów.
- Zakazane jest uruchomienie pełnego `dataconnect` lub `:schema`, akceptowanie SQL z dry-run albo ręczne usuwanie powyższych ograniczeń w ramach wydania read-guard.

## Następstwa

- Remediacja rzeczywistego dryfu schematu i Cloud SQL jest osobnym zadaniem z własnym planem, backupem, testem odtworzenia i zatwierdzeniem właściciela.
- Ten dokument nie daje zgody na produkcję. Przed produkcją potrzebne są: pełne testy kandydata, ponowna kontrola źródła i wyraźne potwierdzenie produkcyjne dla gotowego zakresu.
