# Broker rejestracji e-mail/hasło — kontrakt v1

Status: implementacja i endpoint gotowe lokalnie, bez wartości sekretów, migracji,
zmiany Firebase Authentication, pushu i wdrożenia.

## Niezmienniki

- kanał: `CLEANING_COMPANY`;
- akcja Turnstile: `registration_cleaning_company`;
- nowe konto tworzy wyłącznie Firebase Admin po walidacji źródłowej próby i zgód;
- UID oraz organizacja są deterministyczne i idempotentne dla jednej operacji;
- organizacja `cleaning_provider` powstaje natychmiast po utworzeniu administratora;
- trial to `TRIAL/TRIALING`, dokładnie 14 × 24 godziny od utworzenia organizacji;
- trial nie wymaga karty, nie konwertuje się automatycznie i ma funkcje GO+;
- wybrany GO+/PLUS/PRO oraz cykl miesięczny/roczny są intencją późniejszego zakupu,
  a nie sposobem klientowego nadania uprawnień;
- ENTERPRISE nie jest przyjmowany przez publiczny kontrakt;
- hasło występuje tylko w pamięci żądania i wywołaniu Firebase Admin;
- operacja Firestore nie zapisuje e-maila, hasła, tokenu Turnstile, IP ani User-Agent;
- claim kanału jest pochodzeniem rejestracji, nie rolą ani membershipem.

## Kolejność

1. Walidacja kanonicznego payloadu i serwerowej polityki hasła.
2. Serwerowa weryfikacja Turnstile: sukces, tryb `enforce`, dokładna akcja i host.
3. Serwerowy limit nadużyć oparty na prywatnym HMAC e-maila i próbie rejestracji.
4. Autoryzacja próby i wersjonowanych zgód w źródłowej polskiej bazie rejestracji.
5. Transakcyjna rezerwacja prywatnej operacji w Firestore.
6. Utworzenie niezweryfikowanego Firebase UID przez Admin SDK.
7. Idempotentna transakcja organizacji, ownera, workera, profilu i triala.
8. Wygenerowanie linku weryfikacyjnego i idempotentna wysyłka e-maila.
9. Dostęp: brak przed weryfikacją; tylko onboarding po weryfikacji; operacje dopiero
   po ukończeniu profilu i przy aktywnym trialu.

## Awarie i ponowienia

- Powtórzenie tej samej operacji zwraca te same UID, `orgId` i daty triala.
- Inny payload pod tym samym kluczem kończy się `IDEMPOTENCY_CONFLICT`.
- Znany błąd przed rozpoczęciem/commitem organizacji pozwala skompensować nowo
  utworzony Firebase UID i ponowić operację.
- Nieznany wynik commita kończy się `RECOVERY_REQUIRED`; automatyczne usunięcie UID
  jest zakazane, ponieważ organizacja mogła już powstać.
- Awaria poczty zachowuje konto, organizację i pierwotny koniec triala. Kolejne
  wywołanie ponawia wyłącznie idempotentną wysyłkę.

## Integracje przygotowane lokalnie

- adapter źródłowej bazy `registration_attempt` i `registration_consent`;
- transakcyjny provisioner Cloud SQL z jednorazowym trialem i outboxem;
- idempotentna projekcja profilu Firestore wymaganego przez backend zaproszeń;
- osobna aktywacja profilu dopiero po ukończeniu onboardingu i podaniu nazwy prawnej.
- serwerowy Siteverify Turnstile z deterministycznym kluczem retry;
- polityka hasła NIST + k-anonimowa kontrola Pwned Passwords;
- atomowy limit nadużyć bez surowych danych użytkownika;
- Resend z trwałym stanem dostarczenia wykraczającym poza 24-godzinne okno
  idempotencji dostawcy.

Szczegóły: `cleaning-company-sql-firestore-projection-contract.md`.
Adaptery wykonawcze: `registration-execution-adapters.md`.

## Integracje przygotowane do testowego wdrożenia

- osobny codebase `cleanzi-registration` z publicznym brokerem, prywatną ręczną
  rekonsyliacją i harmonogramem outboxa w `europe-west3`;
- pool PostgreSQL korzystający z istniejącego serwerowego sekretu `DATABASE_URL`;
- dokładny CORS, obowiązkowa weryfikacja App Check i allowlista App ID;
- zakresowy runbook, który nie obejmuje hostingu, reguł ani Data Connect.

## Nadal wymagane przed testowym wdrożeniem

- wywołanie aktywacji outboxa z transakcji kończącej portalowy onboarding;
- zatwierdzenie zależności Pwned Passwords i treści wiadomości Resend;
- rzeczywista konfiguracja App Check dla publicznej aplikacji, niezależnie od
  Turnstile rejestracji;
- selektywna zmiana publicznego formularza zgodnie z
  `cleaning-company-public-registration-change-contract.md`;
- kontrolowany test Google, który nie pozwala tworzyć nowych kont poza brokerem;
- procedura wyłączenia self-signup dopiero podczas zsynchronizowanego cutoveru.
