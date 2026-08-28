# Centralna brama rejestracji Cleanzi

Status: lokalny kontrakt integracyjny, bez eksportu funkcji blokującej, wdrożenia,
zmiany Firebase Authentication, migracji danych ani publikacji.

Punkt odniesienia: `cleanzi01/main` po scaleniu PR #3, commit
`d0770889ff889f19f9442d0db6f51717c8f1fc24`.

## Cel i granica

Cleanzi zachowuje jeden Firebase UID dla osoby, niezależnie od liczby organizacji
i pełnionych ról. Rejestracja ma dwa rozdzielone kanały:

- `FACILITY_MANAGER`, akcja Turnstile `registration_facility_manager`;
- `CLEANING_COMPANY`, akcja Turnstile `registration_cleaning_company`.

Kanały mogą mieć osobne formularze, endpointy, zgody, onboarding i payloady, ale
utworzenie nowego konta w jednym projekcie Firebase musi przechodzić przez jedną
centralną warstwę zaufaną. Dla zdarzeń obsługiwanych przez Identity Platform jest to
`beforeUserCreated` z krótkotrwałym grantem. Dla e-mail/hasło oraz custom auth jest
to centralny broker tworzący użytkownika przez Firebase Admin, ponieważ te metody
nie uruchamiają `beforeCreate`. Tworzenie kont przez użytkowników końcowych musi być
wyłączone, aby nie dało się ominąć brokera. Metadana kanału nie jest rolą ani
uprawnieniem.

Logowanie istniejącego użytkownika pozostaje poza tą bramą. Nie wolno zastępować
kontroli nowej rejestracji globalnym wymaganiem Turnstile podczas logowania.

Po zużyciu grantu `beforeUserCreated` lub broker może zapisać trwałe claimy
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

Lokalny adapter centralnej bramy jest dostępny w
`registration-functions/src/cleaning-company-adapter.js`. Używa wyłącznie akcji
`registration_cleaning_company`, osobnego klucza HMAC i tego samego
privacy-minimalnego kontraktu grantu co kanał zarządcy. Claim po konsumpcji grantu
jest wyłącznie dowodem pochodzenia pierwszej rejestracji i nie nadaje roli ani
członkostwa.

Identity Platform nie uruchamia `beforeCreate` dla dostawcy e-mail/hasło. Z tego
powodu klientowe `createUserWithEmailAndPassword` nie może być chronione tym grantem
i jest odrzucane kontraktem jako `PASSWORD_BROKER_REQUIRED`. Nowe konto hasłowe musi
utworzyć centralny zaufany broker po weryfikacji Turnstile, próby rejestracji i zgód.
Projekt musi mieć wyłączone tworzenie kont przez użytkowników końcowych, aby nie dało
się ominąć brokera bezpośrednim wywołaniem Firebase Auth. Nie wyłącza to logowania
istniejących kont. Weryfikacja e-mail nadal jest wymagana przed wejściem do portalu
i dostępem operacyjnym. Broker może wcześniej utworzyć izolowaną organizację ze
statusem `IN_PROGRESS`, ale nie nadaje jej operacyjnego dostępu.

Adapter nie zastępuje zaufanego endpointu wydającego grant ani onboardingu firmy.
Backend zaproszeń klienta do firmy sprzątającej również nie zastępuje onboardingu.
Docelowy przepływ musi co najmniej:

- używać akcji `registration_cleaning_company`;
- weryfikować e-mail wyłącznie przy nowej rejestracji;
- po rejestracji administratora natychmiast utworzyć organizację
  `kind: cleaning_provider` i członkostwo ownera;
- uruchomić dokładnie 30-dniowy trial bez wymagania karty;
- obsłużyć GO+, PLUS i PRO, rozliczenie miesięczne lub roczne z rabatem 20%;
- zachować ENTERPRISE poza publicznym wyborem pakietu;
- utworzyć sesję Stripe po zaufanej stronie serwera;
- pozwolić jednej osobie używać istniejącego UID w wielu organizacjach i rolach;
- utworzyć `cleaningProviderProfiles/{uid}` wymagany przez backend zaproszeń.

## Warunek aktywacji

Nie wolno eksportować ani wdrażać funkcji `beforeUserCreated`, dopóki:

1. oba adaptery centralnej bramy nie są zaimplementowane i niezależnie przetestowane;
2. centralny router nie odrzuca zera oraz więcej niż jednego pasującego grantu;
3. konsumpcja dokładnie jednego grantu nie jest transakcją Firestore;
4. test równoległy nie potwierdzi, że tylko jedno zdarzenie może skonsumować grant;
5. Identity Platform nie jest włączone i sprawdzone na projekcie testowym;
6. nie ma udokumentowanego rollbacku oraz procedury wyrejestrowania funkcji
   blokującej; samo usunięcie wdrożonej funkcji może zablokować Authentication;
7. oba frontendowe przepływy nie tworzą konta przed wydaniem grantu;
8. Microsoft pozostaje wyłączony dla nowej rejestracji albo ma gotowy broker;
9. tworzenie kont przez użytkowników końcowych nadal jest włączone lub centralny
   broker nie obsługuje bezpiecznie e-mail/hasło i nowych kont Google.

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

Gałąź `Rejestracja-31-07-2026` zawiera lokalny portalowy onboarding organizacji,
politykę planów, GUS i webhook Stripe, ale nie może być scalona bez korekty. Jej
trial ma 7 dni zamiast zatwierdzonych 30 dni, a frontend nie pobiera jeszcze grantu
`CLEANING_COMPANY` przed utworzeniem nowego konta. Nie zawiera też produkcyjnego
endpointu wydającego grant po poprawnej weryfikacji Turnstile.

Lokalny adapter źródłowej próby, provisioner Cloud SQL, App Check, Resend, wdrażalny
host brokera i worker outboxa są przygotowane w izolowanym codebase. Bezpośredni
onboarding portalu stosuje 30 dni; osobny broker rejestracji hasłowej musi zostać
zaktualizowany z 14 do 30 dni wraz z nową addytywną migracją katalogu planów, zanim
publiczny interfejs tego kanału zacznie deklarować konkretną długość okresu próbnego.
Następny etap to selektywne podłączenie publicznego formularza i portalowego końca
onboardingu oraz konfiguracja prawdziwego projektu testowego.
Dopiero po testach obu frontendów, App Check/Turnstile, Stripe i rollbacku można
zatwierdzić zakresowe wdrożenie testowe.
Dokładny kontrakt między repozytoriami opisuje
[`cleaning-company-registration-integration-handoff.md`](cleaning-company-registration-integration-handoff.md).

## Lokalna implementacja brokera hasłowego

Izolowany codebase `registration-functions` zawiera obecnie:

- `password-registration-contract.js` — kanoniczny payload, trzy publiczne plany,
  dwa cykle, wersjonowane zgody i privacy-minimalny fingerprint; obecnie nadal 14 dni,
  więc przed deklaracją 30 dni wymaga osobnego wydania brokera i migracji katalogu;
- `password-registration-broker.js` — kolejność Turnstile → źródłowa próba i zgody
  → Firebase Admin → organizacja → e-mail weryfikacyjny;
- `firestore-password-registration-operation-store.js` — transakcyjną rezerwację
  operacji bez surowego e-maila, hasła, tokenu Turnstile, IP ani User-Agent;
- `cleaning-company-access-policy.js` — blokadę przed weryfikacją e-maila,
  ograniczenie do onboardingu po weryfikacji i dostęp operacyjny dopiero po
  ukończeniu profilu oraz przy aktywnym trialu.
- `postgres-registration-attempt-authority.js` — zgodność źródłowej próby, hasha
  tokenu i zgód przed Firebase Auth;
- `postgres-cleaning-company-provisioner.js` — transakcję organizacji, ownera,
  jednorazowego triala i outboxa;
- `postgres-registration-projection-outbox.js` oraz
  `firestore-cleaning-provider-projector.js` — retry, rekonsyliację i aktywację
  profilu zaproszeń dopiero po ukończeniu onboardingu.

UID i `orgId` są deterministyczne dla prywatnego identyfikatora operacji. Dzięki
temu retry po zerwaniu połączenia nie tworzy kolejnego konta ani organizacji.
Provisioner musi rozróżniać błąd sprzed transakcji, przy którym wolno usunąć nowego
użytkownika Auth, od nieznanego wyniku commita. W drugim przypadku broker zatrzymuje
operację jako `RECOVERY_REQUIRED`; nie usuwa użytkownika w ciemno i wymaga
rekonsyliacji. Wysyłka e-mail używa identyfikatora operacji jako klucza idempotencji.

Implementacja nadal nie jest eksportowana jako Function ani podłączona do root
`firebase.json`. Nie zmienia konfiguracji Firebase i nie może zostać wdrożona przez
obecne skrypty projektu.
