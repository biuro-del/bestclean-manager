# Centralna brama rejestracji Cleanzi

Status: lokalny kontrakt integracyjny, bez eksportu funkcji blokującej, wdrożenia,
zmiany Firebase Authentication, migracji danych ani publikacji.

Punkt odniesienia: `cleanzi01/main` na commicie
`fddc25dc9a844565f62494e63c40c624c980cb07`.

## Cel i granica

Cleanzi zachowuje jeden Firebase UID dla osoby, niezależnie od liczby organizacji
i pełnionych ról. Rejestracja ma dwa rozdzielone kanały:

- `FACILITY_MANAGER`, akcja Turnstile `registration_facility_manager`;
- `CLEANING_COMPANY`, akcja Turnstile `registration_cleaning_company`.

Kanały mogą mieć osobne formularze, endpointy, zgody, onboarding i payloady, ale
utworzenie nowego konta w jednym projekcie Firebase musi przechodzić przez jedną
centralną funkcję `beforeUserCreated`. Funkcja wybiera kanał wyłącznie na podstawie
ważnego, krótkotrwałego grantu utworzonego przez zaufany backend. Metadana kanału
nie jest rolą ani uprawnieniem.

Logowanie istniejącego użytkownika pozostaje poza tą bramą. Nie wolno zastępować
kontroli nowej rejestracji globalnym wymaganiem Turnstile podczas logowania.

Po zużyciu grantu `beforeUserCreated` może zapisać trwałe claimy
`cleanziInitialRegistrationChannel` i `cleanziRegistrationGrantVersion`. Są one
wyłącznie dowodem pochodzenia pierwszej rejestracji. Mogą zostać użyte jeden raz przez
zaufany backend do bootstrapu pierwszego workspace, ale nie są rolą, członkostwem ani
stałym uprawnieniem. Każdy późniejszy odczyt i zapis organizacyjny nadal wynika z
aktywnego membershipu lub zaakceptowanej relacji usługowej.

## Stan kanałów

### Zarządca obiektu

Lokalny adapter obejmuje:

- dokładną akcję i allowlistę hostów Turnstile;
- e-mail link oraz Google z powiązaniem grantu z tożsamością;
- HMAC zamiast surowego e-maila lub tokenu OAuth w dokumencie grantu;
- krótki TTL, jednokrotne użycie i idempotentny retry tego samego zdarzenia;
- walidację typu zdarzenia oraz zasobu Identity Platform.

Microsoft wymaga osobnego zaufanego brokera. Custom authentication nie uruchamia
`beforeUserCreated`, więc broker musi sam zweryfikować token Microsoft, Turnstile,
mapowanie tożsamości oraz idempotentnie utworzyć konto przed wydaniem custom tokenu.

### Firma sprzątająca

Adapter rejestracyjny nie jest jeszcze dostępny. Backend zaproszeń klienta do firmy
sprzątającej nie zastępuje onboardingu firmy. Docelowy onboarding musi co najmniej:

- używać akcji `registration_cleaning_company`;
- weryfikować e-mail wyłącznie przy nowej rejestracji;
- po rejestracji administratora natychmiast utworzyć organizację
  `kind: cleaning_provider` i członkostwo ownera;
- uruchomić 14-dniowy trial;
- obsłużyć GO+, PLUS i PRO, rozliczenie miesięczne lub roczne z rabatem 20%;
- zachować ENTERPRISE poza publicznym wyborem pakietu;
- utworzyć sesję Stripe po zaufanej stronie serwera;
- pozwolić jednej osobie używać istniejącego UID w wielu organizacjach i rolach;
- utworzyć `cleaningProviderProfiles/{uid}` wymagany przez backend zaproszeń.

## Warunek aktywacji

Nie wolno eksportować ani wdrażać funkcji `beforeUserCreated`, dopóki:

1. oba adaptery nie są zaimplementowane i niezależnie przetestowane;
2. centralny router nie odrzuca zera oraz więcej niż jednego pasującego grantu;
3. konsumpcja dokładnie jednego grantu nie jest transakcją Firestore;
4. test równoległy nie potwierdzi, że tylko jedno zdarzenie może skonsumować grant;
5. Identity Platform nie jest włączone i sprawdzone na projekcie testowym;
6. nie ma udokumentowanego rollbacku oraz procedury wyrejestrowania funkcji
   blokującej; samo usunięcie wdrożonej funkcji może zablokować Authentication;
7. oba frontendowe przepływy nie tworzą konta przed wydaniem grantu;
8. Microsoft pozostaje wyłączony dla nowej rejestracji albo ma gotowy broker.

Preflight kodu musi wymagać pełnego zbioru kanałów `FACILITY_MANAGER` i
`CLEANING_COMPANY`. Obecność tylko adaptera zarządcy ma kończyć się błędem i nie
może tworzyć eksportu wdrożeniowego.

## Magazyn grantów

Granty są prywatnymi dokumentami serwerowymi, niedostępnymi dla przeglądarki.
Identyfikator dokumentu jest deterministyczny, ale wyprowadzony z HMAC tożsamości,
kanału, dostawcy i wersji schematu. Dokument nie zawiera surowego e-maila, tokenu
Turnstile, tokenu OAuth, IP ani User-Agent.

Transakcja konsumpcji:

1. odczytuje wszystkie kandydaty wyliczone przez centralny router;
2. uznaje tylko `ISSUED`, niewygasłe i w pełni zgodne dokumenty;
3. wymaga dokładnie jednego dopasowania;
4. zapisuje `CONSUMED`, UID, identyfikator zdarzenia i czas;
5. pozwala powtórzyć tylko to samo zdarzenie dla tego samego UID;
6. odrzuca ponowne użycie przez inne zdarzenie lub UID;
7. przy awarii Firestore działa fail-closed.

## Wariant A: zaproszenia i relacje

Lokalny Wariant A w prototypie portalu klienta jest osobnym modułem. Przygotowuje,
wysyła, anuluje i wygasza zaproszenia oraz tworzy relację klient–firma dopiero po
akceptacji przez już onboardowaną firmę sprzątającą. Nie zawiera rejestracji firmy,
triala, wyboru pakietu ani Stripe.

Blaze jest wymagany do wdrożenia Cloud Functions, ale nie jest jedyną bramką testu.
Przed wdrożeniem testowym potrzebne są również App Check, jawne klucze i sekrety,
osobny panel firmy sprzątającej oraz kompletny onboarding `cleaning_provider`.

## Zakazane skróty

- Nie wyprowadzaj kanału z domeny e-mail, NIP, URL referera ani claimu klienta.
- Nie traktuj App Check jako autoryzacji organizacyjnej ani dowodu zgody.
- Nie łącz organizacji po samym e-mailu lub NIP.
- Nie włączaj funkcji tylko dla jednego kanału w współdzielonym projekcie.
- Nie dodawaj sekretów do repozytorium, Vite ani dokumentacji.
- Nie wdrażaj przez nieograniczone `firebase deploy`.

## Następny bezpieczny krok

Po otrzymaniu kompletnego adaptera firmy sprzątającej należy przeprowadzić wspólny
review tożsamości i atomowości, uzupełnić centralny router, uruchomić testy emulatorowe
obu kanałów, a dopiero potem przygotować osobny plan wdrożenia do projektu testowego.
