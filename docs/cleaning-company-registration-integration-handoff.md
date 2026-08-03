# Integracja rejestracji firmy sprzątającej z centralną bramką

Status: broker i osobny codebase Functions znajdują się w PR #4, bez zmian w
repozytorium publicznej rejestracji, bez konfiguracji Firebase i bez wdrożenia.

## Potwierdzone źródła

- `biuro-del/registration-cleanzi`, gałąź `rejestracja-31-07-2026`, commit
  `b1540b90a2e4a8500d207abfd37704daa80a7643` zawiera formularz v7 i Functions
  handoffu do portalu. Obecnie wywołuje `createUserWithEmailAndPassword` przed
  uzyskaniem centralnego grantu i nie zawiera akcji Turnstile
  `registration_cleaning_company`.
- `biuro-del/Cleanzi-01`, gałąź `Rejestracja-31-07-2026`, commit
  `f4d7300f1905fdee3fc5fc1b0efb81446f894d26` zawiera portalowy onboarding,
  politykę planów, GUS i webhook Stripe. Obecnie ustawia trial na 7 dni.
- Bazowy commit `main` `biuro-del/Cleanzi-01` zawiera centralny magazyn grantów i
  router. Ta gałąź robocza dodaje osobny, lokalnie zweryfikowany codebase
  `cleanzi-registration`; nie został on wdrożony ani dopisany do szerokiego
  `firebase.json` portalu.

Nie wolno scalać żadnej z dwóch gałęzi `Rejestracja-31-07-2026` w całości bez
selektywnego review. Pierwsza jest oparta na rozwijanej publicznej witrynie, a druga
zawiera również szeroki, niezależny zakres `Cleanzi-admin`.

## Kontrakt kanału

- Kanał: `CLEANING_COMPANY`.
- Turnstile action: `registration_cleaning_company`.
- Dozwolone metody nowej rejestracji: e-mail/hasło oraz Google. Microsoft pozostaje
  wyłączony, dopóki nie powstanie zaufany broker.
- Identity Platform nie wywołuje `beforeCreate` dla e-mail/hasło, dlatego ten kanał
  musi korzystać z centralnego zaufanego brokera, a nie z klientowego
  `createUserWithEmailAndPassword`.
- Grant jest prywatny, krótkotrwały, jednokrotny i nie zawiera e-maila, IP,
  User-Agentu ani tokenu Turnstile.
- Brak grantu, dwa pasujące granty, awaria Firestore, zła akcja lub niedozwolony
  hostname blokują utworzenie konta.
- Claim `cleanziInitialRegistrationChannel` jest tylko dowodem pochodzenia pierwszej
  rejestracji. Nie jest rolą, członkostwem ani uprawnieniem.
- Istniejące konta nie przechodzą ponownej rejestracji i logują się bez Turnstile.

## Wymagana kolejność dla e-mail/hasło

1. W Firebase Authentication wyłączamy samodzielne tworzenie i usuwanie kont przez
   użytkowników końcowych. Istniejące logowanie e-mail/hasło pozostaje dostępne.
2. Formularz zapisuje wersjonowane zgody i próbę rejestracji bez hasła w bazie.
3. Przeglądarka pobiera token Turnstile dla dokładnej akcji kanału i przesyła hasło
   wyłącznie przez TLS do centralnego brokera. Hasło nie trafia do bazy, logów ani
   telemetrii.
4. Broker weryfikuje Turnstile, hostname, akcję, status próby, e-mail, zgody i
   politykę hasła, a następnie przez Firebase Admin tworzy konto
   `emailVerified: false` oraz ustawia provenance kanału.
5. Broker natychmiast tworzy deterministyczną organizację `kind: cleaning_provider`,
   nieoperacyjny membership ownera `ONBOARDING`, rekord właściciela, szkic profilu i subskrypcję
   `TRIAL/TRIALING`. Trial rozpoczyna się w chwili utworzenia organizacji i kończy
   dokładnie po 14 × 24 godzinach; nie wymaga karty i nie konwertuje się automatycznie.
6. Broker generuje wiadomość weryfikacyjną. Do potwierdzenia e-maila użytkownik nie
   może wejść do portalu ani korzystać z operacyjnego API. Po potwierdzeniu może
   ukończyć profil firmy; operacyjne API pozostaje zablokowane do zakończenia
   obowiązkowego onboardingu. Zaufana transakcja kończąca onboarding sprawdza
   zweryfikowany token Firebase i dopiero wtedy ustawia membership `ACTIVE`.

## Wymagana kolejność dla Google

Nowe konto Google również przechodzi przez centralnego brokera. Backend weryfikuje
token Google, `aud`, `iss`, `sub`, e-mail i Turnstile, tworzy lub wiąże UID w sposób
idempotentny i zwraca krótkotrwały custom token. Klient loguje się custom tokenem, a
Google credential jest następnie jawnie wiązany z tym samym UID. Zwykłe logowanie
Google pozostaje dostępne dla istniejącego UID, ale nie może samodzielnie utworzyć
nowego konta.

## Zatwierdzona polityka produktu

- Trial trwa dokładnie 14 dni i nie wymaga karty.
- Publiczne pakiety: GO+, PLUS i PRO.
- Cykle płatne: miesięczny oraz roczny z rabatem 20%.
- ENTERPRISE nie jest publicznym wyborem; ma ofertę indywidualną.
- Organizacja firmy sprzątającej powstaje natychmiast po bezpiecznym utworzeniu
  administratora, ze statusem onboardingu `IN_PROGRESS`. Po potwierdzeniu e-maila
  i ukończeniu profilu może tworzyć klientów i pracowników.
- Stripe Checkout i webhook działają wyłącznie po stronie zaufanego backendu.
- Wariant A zaproszeń nie tworzy firmy sprzątającej; akceptacja zaproszenia wymaga
  istniejącej aktywnej organizacji `cleaning_provider` oraz ownera/admina.

## Bramka dalszych prac

Przed przygotowaniem eksportu `beforeUserCreated` trzeba dostarczyć i wspólnie
przetestować:

1. centralny broker tworzący konta po wyłączeniu klientowego self-signup;
2. bezpieczna obsługa hasła bez zapisu/logowania, preflight Google oraz fail-closed
   Microsoft;
3. korektę triala z 7 do 14 dni w portalu i testach;
4. idempotentny onboarding organizacji `cleaning_provider`, jawna kompensacja po
   awarii i profil wymagany przez backend zaproszeń;
5. testy dwóch frontendów, emulatora, App Check/Turnstile, Stripe i rollbacku;
6. osobny plan wdrożenia najpierw do projektu testowego.

## Stan lokalnej warstwy danych 2026-08-02

W izolowanym `registration-functions` są gotowe:

- autorytatywna walidacja próby i zgód w PostgreSQL;
- transakcyjne utworzenie organizacji, ownera, profilu roboczego i dokładnie
  14-dniowego triala;
- jednorazowe wykorzystanie triala i bezpieczna obsługa nieznanego wyniku commita;
- transakcyjny outbox i idempotentna projekcja do Firestore;
- stan `onboarding`, który nie uprawnia do zaproszeń, oraz osobne zdarzenie
  aktywacji po ukończeniu profilu firmy.

Gotowe lokalnie są też eksporty Functions, pool oparty o istniejący serwerowy
`DATABASE_URL`, App Check, Resend oraz harmonogram outboxa. Nie są jeszcze
skonfigurowane prawdziwe sekrety i dostawcy, publiczny formularz ani portalowa
transakcja kończąca onboarding. Dokładne kontrakty znajdują się w:

- `cleaning-company-sql-firestore-projection-contract.md`;
- `cleaning-company-public-registration-change-contract.md`;
- `cleaning-company-functions-deployment-runbook.md`.
