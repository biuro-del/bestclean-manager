# Rejestracja panelu zarządcy obiektu przez Google

## Efekt dla użytkownika

Na ekranie logowania portal pokazuje osobną opcję **„Zarejestruj panel zarządcy”**.
Użytkownik wpisuje wyłącznie nazwę panelu i wybiera konto Google. Po sukcesie
otrzymuje pustą organizację `FACILITY_MANAGER` z dostępem `FREE/UNLIMITED`:

- bez triala, płatności, karty i daty zakończenia;
- bez automatycznie utworzonego obiektu, klienta lub połączenia z firmą sprzątającą;
- z możliwością dodania pierwszego obiektu później w panelu;
- z jednym samodzielnie utworzonym panelem na zweryfikowaną tożsamość Google.

## Granica bezpieczeństwa

Przeglądarka wysyła do endpointu wyłącznie `organizationName` i losowy klucz
idempotencji. Backend wyprowadza UID, adres e-mail i Google subject wyłącznie z
serwerowo zweryfikowanego Firebase ID tokenu. Nie akceptuje z przeglądarki UID,
e-maila, planu, roli, obiektu ani kanału rejestracji.

Przed pierwszym logowaniem frontend pobiera z istniejącej centralnej bramy
Firebase grant dla `FACILITY_MANAGER`. Wspólny `beforeCreate` konsumuje dokładnie
jeden grant dla właściwego kanału. Nie wolno wyłączać tej bramy ani zastępować jej
bramą tylko dla zarządcy, ponieważ chroni również rejestrację firmy sprzątającej.

Endpoint `POST /api/registration/facility-manager` jest fail-closed. Wymaga
włączonej flagi, poprawnego Firebase App Check z allowlistowanego App ID,
potwierdzonego konta Google i trwałego limitu prób Firestore. Ogranicznik zapisuje
wyłącznie HMAC zweryfikowanego UID, nie e-mail, tokenu ani surowego UID.

## Baza danych

Provisioner PostgreSQL działa w jednej transakcji `SERIALIZABLE`. Tworzy tylko:

- organizację `FACILITY_MANAGER`;
- aktywnego workera-owner i membership;
- audit rejestracji;
- pseudonimowy rejestr Google identity.

Rejestr uniemożliwia równoległe lub późniejsze utworzenie drugiego panelu przez tę
samą tożsamość Google. Tabela nie przechowuje surowego Google subject. Rola runtime
`portal_app` dostaje wyłącznie `SELECT`, `INSERT` i `UPDATE` do tej tabeli, bez
`DELETE`.

## Produkcyjna kolejność

1. Uruchomić tylko do odczytu
   `registration-functions/sql/20260826_facility_manager_google_registration_base_preflight.sql`.
2. Sprawdzić wartości constraintów wymagane przez provisioner oraz uprawnienia
   runtime.
3. Wykonać addytywną migrację
   `registration-functions/sql/20260826_facility_manager_google_identity_registry.sql`.
4. Uruchomić tylko do odczytu post-preflight
   `registration-functions/sql/20260826_facility_manager_google_registration_preflight.sql`.
5. Zarejestrować produkcyjną aplikację web Firebase App Check dla App ID portalu,
   wykorzystując reCAPTCHA Enterprise; frontend musi otrzymać realny token.
6. Przywrócić w Firebase Auth wspólną funkcję `centralRegistrationBeforeUserCreated`
   jako `beforeCreate`; callable `issueFacilityManagerRegistrationGrant` musi
   pozostać aktywne w tym samym projekcie i regionie.
7. Zapisać HMAC wyłącznie w Secret Manager jako
   `FACILITY_MANAGER_REGISTRATION_HMAC_SECRET`, a następnie wdrożyć App Hosting
   `cleanzi-01`.
8. Po wydaniu potwierdzić, że żądanie bez App Check zwraca
   `401 APP_CHECK_REQUIRED`, a kontrolowana rejestracja Google prowadzi do pustego
   panelu `FREE/UNLIMITED`.

Migracja jest addytywna, ale po commicie nie jest automatycznie cofana. Wyłączenie
flagi rejestracji zatrzymuje nowe zapisy, lecz nie usuwa tabeli ani istniejących
paneli.
