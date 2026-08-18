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

## Testy regresji

- aktywny koordynator i aktor platformowy mogą zatwierdzić bez oddzielnego wpisu;
- konto `WORKER` i członek nieaktywny są odrzucani;
- oficjalny STOP pozostaje zapisywany wyłącznie w kanonicznym Workday.
