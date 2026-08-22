# Cleanzi — rejestracja firmy sprzątającej: wydanie produkcyjne

**Id wydania:** `CLZ-ONBOARDING-20260822-01`
**Stan:** kandydat do wydania — nie wdrożony, nieaktywowany.

## Zakres wydania

- pierwszy ekran portalu umożliwia istniejącemu użytkownikowi logowanie jak dotychczas;
- nowa firma może rozpocząć przez Google albo link potwierdzający wysłany e-mailem;
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

- włączony dostawca Google;
- włączony dostawca e-mail link oraz dozwolony adres URL powrotu `portal.cleanzi.pl`;
- `portal.cleanzi.pl` na liście autoryzowanych domen;
- App Check dla aplikacji WWW, klucz reCAPTCHA Enterprise przekazany do frontendu i
  egzekwowanie tokenu dla tej ścieżki;
- kontrolowana sekretami zmienna `CLEANING_COMPANY_ONBOARDING_IP_HASH_SECRET`
  (opcjonalna; brak sekretu oznacza brak zapisu IP, nigdy zapis surowego IP).

W konfiguracji App Hosting oba przełączniki muszą pozostać `false` do czasu pełnego
odbioru. Dopiero po zatwierdzeniu opisanej polityki można ustawić:

```text
CLEANING_COMPANY_ONBOARDING_ENABLED=true
CLEANING_COMPANY_ONBOARDING_AUTO_CONFIRMATION_ENABLED=true
CLEANING_COMPANY_ONBOARDING_REQUIRE_APP_CHECK=true
```

## Kolejność wydania

1. Uruchomić wyłącznie odczytowy audyt migracji i zweryfikować zgodność produkcyjnego
   schematu z migracją:

   ```text
   npm run migrate:cleaning-company-onboarding -- --audit
   ```

2. Wykonać migrację raz, z wymaganym potwierdzeniem produkcyjnym skryptu migracyjnego.
   Migracja jest addytywna; nie wykonuje się down-migration.

   ```text
   npm run migrate:cleaning-company-onboarding -- --apply --confirm-production=CLZ-DB-20260822-CLEANING-COMPANY-ONBOARDING-V2-01
   ```

   Token techniczny skryptu nie jest akceptacją właściciela produktu; uruchamia się go
   dopiero po bramce wydania opisanej niżej.
3. Wdrożyć kandydat App Hosting przy wyłączonych przełącznikach rejestracji.
4. Zweryfikować na środowisku podglądowym: Google, link e-mailowy (przed i po kliknięciu),
   niepoprawny NIP, NIP istniejącej firmy, wartość `0` pracowników, brak zgód marketingowych,
   ponowienie tego samego żądania oraz niezmienione logowanie dotychczasowego użytkownika.
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
OK PRODUKCJA CLZ-ONBOARDING-20260822-01
```

Jeżeli wybierana jest automatyczna polityka potwierdzania, zgoda musi to wyraźnie obejmować.
