# Workday STOP Proposal V1: uprawnienie decyzji

## Zasada produkcyjna

Aktywna osoba mająca dostęp do portalu może podjąć decyzję o propozycji STOP w swojej organizacji. Uprawnienie jest wyprowadzane w czasie rzeczywistym z aktywnego członkostwa `organization_member`; nie wymaga masowego wpisywania ani aktualizowania rekordów dla obecnych lub przyszłych użytkowników portalu.

Rola `WORKER` (także polskie `PRACOWNIK`) nie może podejmować decyzji nawet przy bezpośrednim wywołaniu API. Nieaktywny członek także nie ma dostępu.

## Granice bezpieczeństwa

- Zakres organizacji nadal pochodzi z uwierzytelnionego żądania i aktywnego członkostwa.
- Pracownik nie może zatwierdzić własnej propozycji; pozostaje istniejąca blokada polityki decyzji.
- Zatwierdzenie i korekta zapisują kanoniczny `public.workday.end_at` oraz domykają wszystkie powiązane rekordy `public.event` z pustym `end_at`. Decyzja, Workday, Eventy i audyt `public.workday_stop_proposal_audit` są zapisywane w jednej transakcji.
- Domykany Event otrzymuje tę samą oficjalną godzinę STOP, obliczony `duration_sec`, status `CLOSED`, `close_marked_at` oraz techniczny powód `WORKDAY_STOP_PROPOSAL`. Pola `Event.zone_id` oraz START-owe `Workday.utility_room_id` pozostają bez zmian.
- Oficjalny STOP jest odrzucany konfliktem `409`, jeżeli brakuje prawidłowego START Eventu, wypada nie później niż początek dowolnego Eventu, zamknięty Event ma ujemny zakres albo kończy się po proponowanym STOP. System nie tworzy czasu zerowego lub ujemnego i nie skraca istniejących aktywności.
- Odrzucenie oraz decyzja `SUPERSEDED` nie modyfikują `public.workday` ani `public.event`.
- Tabela `public.workday_time_permission` pozostaje kompatybilna z istniejącym schematem, ale nie jest już źródłem dostępu dla żądań HTTP portalu.

## Mobilny odczyt statusu propozycji (`STATUS`)

`POST /api/mobile/workday-stop-proposals` z `{"operation":"STATUS","workdayIds":[...]}` służy wyłącznie do odczytu statusów dla dni widocznych w Historii pracownika.

- `workdayIds` musi być listą od 1 do 120 identyfikatorów; duplikaty są usuwane, a błędna lista jest odrzucana przed połączeniem z bazą.
- Organizacja, członkostwo i pracownik są ustalane wyłącznie ze zweryfikowanego tokenu Firebase. Dane organizacji ani pracownika z body nie rozszerzają zakresu odczytu.
- Odczyt jest zawężony do organizacji, kanonicznego `worker_id`, loginu z Workday i przekazanych dni. Nie otwiera transakcji, nie zakłada blokad i nie zapisuje danych.
- Odpowiedź zawiera `workdayId` oraz status i dane decyzji najnowszej propozycji dla danego dnia:
  - `PENDING` — pracownik widzi, że zgłoszenie czeka na weryfikację biura;
  - `APPROVED` — aplikacja pokazuje warunkowo zatwierdzoną godzinę z kanonicznego `officialStopAt`;
  - `CORRECTED` — aplikacja pokazuje godzinę skorygowaną i zatwierdzoną z `officialStopAt`;
  - `REJECTED` — ponowne zgłoszenie jest możliwe wyłącznie po poprawnie zweryfikowanym STATUS i gdy Workday nadal jest historyczny oraz otwarty;
  - `SUPERSEDED` — zgłoszenie jest nieaktualne, ponowne wysłanie jest zablokowane, a aplikacja opiera widok na kanonicznym Workday.
  Dla decyzji zwracane są także `reviewedAt` i `decisionNote`, gdy istnieją.

## Testy regresji

- aktywny koordynator i aktor platformowy mogą zatwierdzić bez oddzielnego wpisu;
- konto `WORKER` i członek nieaktywny są odrzucani;
- oficjalny STOP zapisuje kanoniczny Workday i domyka wszystkie jego otwarte Eventy tą samą godziną;
- korekta stosuje godzinę biura również do domykanych Eventów, a odrzucenie i `SUPERSEDED` nie uruchamiają kaskady;
- błędna kolejność czasu blokuje całą decyzję, a konflikt zapisu powoduje rollback;
- retry tej samej decyzji jest no-op tylko dla identycznego zamiaru; zmiana akcji, godziny, aktora lub notatki pod tym samym `clientActionId` zwraca konflikt przed kaskadą;
- `STATUS` pozostaje tokenowo zawężonym, ograniczonym odczytem bez transakcji, blokad i zapisów oraz zwraca wszystkie pięć wspieranych statusów wraz z kanoniczną godziną decyzji, gdy dotyczy.
