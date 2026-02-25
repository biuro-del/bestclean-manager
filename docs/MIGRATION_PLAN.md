# Best Clean Migration Plan (Google Apps Script -> Firebase + React)

## Ustalone decyzje

- Zakres: bezpieczna migracja `start -> finish` bez utraty funkcjonalności.
- Firebase: nowa aplikacja (nie modyfikujemy istniejących appów).
- Backend: `Cloud Functions` + `Firestore` + `Firebase Auth` + `Hosting`.
- Region: `europe-central2` (Warszawa).
- Auth: przejście na Firebase (logowanie e-mail).
- Sesja: zasada single-device (nowe logowanie unieważnia poprzednie urządzenie).
- Dane: pełna migracja historii z arkuszy.
- UI: najpierw pełna zgodność funkcjonalna, redesign po stabilizacji.

## Zasada prowadzenia prac

1. Najpierw zgodność logiki 1:1, potem optymalizacje.
2. Każda zmiana kończy się testem regresji.
3. Jeśli wykryjemy niejednoznaczność biznesową, zatrzymujemy krok i pytamy.
4. Cutover dopiero po testach porównawczych danych i przepływów.

## Etapy

### Etap 0: Zamrożenie i inwentaryzacja

- Zamrażamy zakres funkcjonalny wersji źródłowej (`V0.231`).
- Spisujemy wszystkie endpointy i przepływy użytkownika.
- Definiujemy kryteria akceptacji (checklista testów end-to-end).

### Etap 1: Fundament Firebase

- Tworzymy nową app web w projekcie `iClean-room`.
- Konfigurujemy Hosting (SPA), Firestore, Functions (`europe-central2`).
- Przygotowujemy środowiska: `.env` frontend i konfigurację backendu.

### Etap 2: Model danych Firestore

- Projektujemy kolekcje i indeksy pod:
  - użytkowników i role,
  - sesje single-device,
  - day/work cycles,
  - pauzy,
  - checklisty,
  - harmonogram i podsumowania.
- Weryfikujemy zgodność pól z obecnymi arkuszami.

### Etap 3: Migracja danych (pełna)

- Eksport danych z Google Sheets.
- Transformacja do schematu Firestore.
- Import wsadowy z logowaniem błędów i raportem zgodności.
- Kontrola jakości: liczba rekordów, sumy czasu, losowa weryfikacja rekord->rekord.

### Etap 4: Backend funkcjonalny (Cloud Functions)

- Implementujemy odpowiedniki endpointów z `Router.gs`.
- Dodajemy warstwę auth i RBAC.
- Implementujemy locki/atomowość operacji (`start/stop`, `stopAndStart`, ending).
- Dodajemy audyt i spójne kody błędów API.

### Etap 5: Frontend React (parytet funkcji)

- Ekrany: logowanie, menu, skaner, workflow, podsumowania, koordynator.
- Integracja z Functions API i obsługa sesji.
- Obsługa wymuszonego wylogowania przy przejęciu sesji przez nowe urządzenie.
- QR: niezawodny skaner mobilny z fallbackiem.

### Etap 6: Testy i cutover

- Testy regresji wszystkich kluczowych scenariuszy.
- Testy wydajności i spójności danych.
- Go-live nowej app web (bez dotykania starszych aplikacji).
- Okres obserwacji + szybka ścieżka rollback.

### Etap 7: Redesign UI (po stabilizacji)

- Zmieniamy wygląd dopiero po zamknięciu krytycznych ryzyk funkcjonalnych.
- Zachowujemy te same przepływy biznesowe i wyniki operacji.

## Kryterium zakończenia projektu

- 100% krytycznych scenariuszy działa jak w źródle lub lepiej.
- Migracja danych jest pełna i zweryfikowana.
- Single-device działa i wymusza powrót do logowania na starym urządzeniu.
- Nowa aplikacja działa stabilnie na urządzeniach docelowych.
