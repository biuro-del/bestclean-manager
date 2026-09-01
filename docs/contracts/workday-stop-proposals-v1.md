# Workday STOP Proposal V1: uprawnienie decyzji

## Zasada produkcyjna

Aktywna osoba mająca dostęp do portalu może podjąć decyzję o propozycji STOP w swojej organizacji. Uprawnienie jest wyprowadzane w czasie rzeczywistym z aktywnego członkostwa `organization_member`; nie wymaga masowego wpisywania ani aktualizowania rekordów dla obecnych lub przyszłych użytkowników portalu.

Rola `WORKER` (także polskie `PRACOWNIK`) nie może podejmować decyzji nawet przy bezpośrednim wywołaniu API. Nieaktywny członek także nie ma dostępu.

## Granice bezpieczeństwa

- Zakres organizacji nadal pochodzi z uwierzytelnionego żądania i aktywnego członkostwa.
- Pracownik nie może zatwierdzić własnej propozycji; pozostaje istniejąca blokada polityki decyzji.
- Zatwierdzenie i korekta nadal zapisują kanoniczny `public.workday.end_at` w jednej transakcji z decyzją oraz audytem `public.workday_stop_proposal_audit`.
- Odrzucenie nie modyfikuje `public.workday`.
- Tabela `public.workday_time_permission` pozostaje kompatybilna z istniejącym schematem, ale nie jest już źródłem dostępu dla żądań HTTP portalu.

## Mobilny odczyt statusu propozycji (`STATUS`)

`POST /api/mobile/workday-stop-proposals` z `{"operation":"STATUS","workdayIds":[...]}` służy wyłącznie do odczytu statusów dla dni widocznych w Historii pracownika.

- `workdayIds` musi być listą od 1 do 120 identyfikatorów; duplikaty są usuwane, a błędna lista jest odrzucana przed połączeniem z bazą.
- Organizacja, członkostwo i pracownik są ustalane wyłącznie ze zweryfikowanego tokenu Firebase. Dane organizacji ani pracownika z body nie rozszerzają zakresu odczytu.
- Odczyt jest zawężony do organizacji, kanonicznego `worker_id`, loginu z Workday i przekazanych dni. Nie otwiera transakcji, nie zakłada blokad i nie zapisuje danych.
- Odpowiedź zawiera `workdayId` oraz status i dane decyzji najnowszej propozycji dla danego dnia:
  - `PENDING` — pracownik widzi, że zgłoszenie czeka na weryfikację biura;
  - `APPROVED` — aplikacja pokazuje warunkowo zatwierdzoną godzinę z kanonicznego `officialStopAt`;
  - `CORRECTED` — aplikacja pokazuje godzinę skorygowaną i zatwierdzoną z `officialStopAt`.
  Dla decyzji zwracane są także `reviewedAt` i `decisionNote`, gdy istnieją.

## Testy regresji

- aktywny koordynator i aktor platformowy mogą zatwierdzić bez oddzielnego wpisu;
- konto `WORKER` i członek nieaktywny są odrzucani;
- oficjalny STOP pozostaje zapisywany wyłącznie w kanonicznym Workday.
- `STATUS` pozostaje tokenowo zawężonym, ograniczonym odczytem bez transakcji, blokad i zapisów oraz zwraca `PENDING`, `APPROVED` i `CORRECTED` wraz z kanoniczną godziną decyzji.
