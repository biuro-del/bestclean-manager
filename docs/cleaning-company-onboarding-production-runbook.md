# Cleanzi — rejestracja firmy sprzątającej: wydanie produkcyjne

**Fundament produkcyjny:** `CLZ-ONBOARDING-20260822-01` — wdrożony z wyłączoną rejestracją.
**Id bieżącego kandydata:** `CLZ-ONBOARDING-20260822-02`
**Stan:** kandydat do wydania — nieaktywny publicznie.

## Zakres wydania

- pierwszy ekran portalu umożliwia istniejącemu użytkownikowi logowanie jak dotychczas;
- nowa firma może rozpocząć przez Google albo link potwierdzający wysłany e-mailem;
- każde nowe konto przechodzi przez istniejącą centralną bramę Firebase: przed utworzeniem
  konta portal pobiera jednorazowy grant `CLEANING_COMPANY`, a serwer wymaga pochodzenia
  `registration_cleaning_company` w tokenie;
- po zweryfikowaniu adresu e-mail właściciel uzupełnia NIP, pełną nazwę firmy,
  deklarowaną liczbę pracowników oraz wymagane potwierdzenia dokumentów;
- zgody marketingowe (e-mail, SMS i telefon) są niezależne, dobrowolne i domyślnie
  wyłączone;
- serwer tworzy odizolowaną organizację `CLEANING_PROVIDER`, właściciela i 14-dniowy
  okres próbny. Nigdy nie dołącza konta do istniejącej firmy tylko dlatego, że NIP się zgadza.

## Warunek biznesowo-prawny przed aktywacją

Obecny Regulamin Cleanzi mówi, że zawarcie umowy następuje także po potwierdzeniu
rejestracji przez Usługodawcę. To wydanie pozostawia automatyczne potwierdzenie
**wyłączone**, dopóki właściciel Cleanzi nie zatwierdzi jednej z poniższych polityk:

1. poprawnie zweryfikowany e-mail, kontrola App Check i poprawny NIP stanowią
   automatyczne potwierdzenie rejestracji przez Usługodawcę; albo
2. po formularzu firma pozostaje w stanie oczekującym na ręczne potwierdzenie,
   a Regulamin i interfejs opisują ten etap.

Nie wolno uruchamiać samodzielnego dostępu i jednocześnie przedstawiać go jako zgodnego
z obecnym brzmieniem Regulaminu bez zatwierdzenia pierwszej polityki albo zmiany dokumentu.

## Wymagania konfiguracyjne

Przed wdrożeniem administrator sprawdza w projekcie Firebase używanym przez portal:

- aktywną globalną bramę `beforeCreate` oraz callable
  `issueCleaningCompanyRegistrationGrant` w `europe-west1`; nie wdraża drugiej bramy i nie
  zmienia kanału rejestracji zarządców;
- włączony dostawca Google;
- włączony dostawca e-mail link oraz dozwolony adres URL powrotu `portal.cleanzi.pl`;
- `portal.cleanzi.pl` na liście autoryzowanych domen;
- App Check dla aplikacji WWW, klucz reCAPTCHA Enterprise przekazany do frontendu i
  egzekwowanie tokenu dla tej ścieżki;
- w App Hosting, wyłącznie dla kompilacji, ustawione: `VITE_CENTRAL_REGISTRATION_ISSUER_READY=true`
  oraz `VITE_CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID` identyczny z publicznym client ID aktywnego
  issuera. Client ID może pozostać poza Gitem, lecz nigdy nie wolno dodawać do frontendu
  client secreta Google;
- kontrolowana sekretami zmienna `CLEANING_COMPANY_ONBOARDING_IP_HASH_SECRET`
  (opcjonalna; brak sekretu oznacza brak zapisu IP, nigdy zapis surowego IP).

W konfiguracji App Hosting oba przełączniki rejestracji oraz build-time flaga issuera muszą
pozostać `false` do czasu pełnego odbioru. Dopiero po zatwierdzeniu opisanej polityki i
technicznego preflightu można ustawić:

```text
CLEANING_COMPANY_ONBOARDING_ENABLED=true
CLEANING_COMPANY_ONBOARDING_AUTO_CONFIRMATION_ENABLED=true
CLEANING_COMPANY_ONBOARDING_REQUIRE_APP_CHECK=true
VITE_CENTRAL_REGISTRATION_ISSUER_READY=true
```

## Kolejność wydania

1. Migracja `CLZ-DB-20260822-CLEANING-COMPANY-ONBOARDING-V2-01` została wykonana wraz z
   fundamentem `-01`; dla tego kandydata nie wykonuje się jej drugi raz. Zweryfikować jedynie
   odczytowy postflight:

   ```text
   npm run migrate:cleaning-company-onboarding -- --audit
   ```

2. Ustawić i niezależnie odczytać konfigurację Firebase Auth, App Check oraz build-time
   App Hosting wymienioną wyżej; przełączniki runtime rejestracji pozostają `false`.
3. Wdrożyć kandydat App Hosting przy wyłączonych przełącznikach rejestracji.
4. Zweryfikować w kontrolowanym przebiegu: Google, link e-mailowy (przed i po kliknięciu),
   niepoprawny NIP, NIP istniejącej firmy, wartość `0` pracowników, brak zgód marketingowych,
   ponowienie tego samego żądania, odrzucenie tokenu bez provenance oraz niezmienione logowanie
   dotychczasowego użytkownika.
5. Dopiero po odbiorze włączyć przełączniki i powtórzyć krótki test dymny z odizolowanym
   kontem testowym.

## Wycofanie

Natychmiastowa blokada nowych rejestracji to ustawienie obu przełączników rejestracji na
`false`. W razie błędu można następnie przywrócić poprzednią rewizję App Hosting. Nie usuwa
się ani nie obniża wersji migracji, nie kasuje się utworzonych organizacji i nie odbiera się
użytkownikom danych w ramach procedury rollbacku.

## Bramka wdrożenia

Wdrożenie na produkcję wymaga dokładnego komunikatu właściciela produktu:

```text
OK PRODUKCJA CLZ-ONBOARDING-20260822-02
```

Jeżeli wybierana jest automatyczna polityka potwierdzania, zgoda musi to wyraźnie obejmować.
