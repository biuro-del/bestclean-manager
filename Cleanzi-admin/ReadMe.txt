CLEANZI — PANEL ADMINA
Dokumentacja struktury, modułów i integracji

1. PRZEZNACZENIE

Panel admina jest prywatnym modułem aplikacji Cleanzi przeznaczonym wyłącznie
dla kont z rolą PLATFORM_OWNER. Umożliwia zarządzanie organizacjami,
subskrypcjami, rozliczeniami, historią zmian i prywatnym audytem platformy.

To repozytorium jest dystrybucją modułu źródłowego. Nie jest niezależną
aplikacją i wymaga hosta Cleanzi-01, jego Firebase Auth, backendu Node.js,
PostgreSQL/Cloud SQL oraz istniejących modeli organizations i
organization_subscription.

Moduł nie tworzy drugiego systemu uwierzytelniania, nie pobiera pieniędzy,
nie wdraża aplikacji i nie uruchamia migracji automatycznie.

2. STRUKTURA MODUŁU

Cleanzi-admin/
  frontend/
    template.js                 — semantyczna struktura Panelu admina
    styles.css                  — responsywny, ciemny motyw panelu
    index.js                    — kontroler widoków i operacji użytkownika
    api.js                      — klient endpointów /api/platform/*
    platformFirebaseClient.js   — nazwana aplikacja Firebase tylko dla panelu

  backend/
    platform-admin-repository.js — zapytania SQL, dashboard, historia,
                                   rozliczenia i transakcje biznesowe
    billing/
      provider-adapter.js        — kontrakt przyszłego operatora płatności
      noop-provider.js           — bezpieczny adapter bez operacji zewnętrznych
      provider-registry.js       — wybór adaptera przez konfigurację

  migrations/
    20260721_cleanzi_admin_billing.sql
                                — idempotentne rozszerzenie istniejącej bazy

  scripts/
    migrate.js                  — audyt i kontrolowane uruchamianie migracji

  test/
    migration-contract.test.js
    platform-admin-operations.test.js
    portability-contract.test.js

  docs/
    architecture.md
    firebase-migration-checklist.md
    platform-owner-provisioning.md
    host-integration.md

  .env.example                  — nazwy zmiennych bez prawdziwych sekretów
  README.md                     — skrócona dokumentacja modułu
  ReadMe.txt                    — niniejszy pełny opis

Platformowe pliki hosta publikowane razem z modułem:
  platform-api.js
  platform-repository.js
  platform-policy.js
  platform-request-context.js
  platform-email-mfa.js
  scripts/platform-admin.js
  test/platform-policy.test.js
  test/platform-repository.test.js
  test/platform-email-mfa.test.js

3. STRUKTURA STRONY

3.1. Logowanie Panelu admina

Panel lokalny jest dostępny pod adresem z parametrem ?panel=admin. Frontend
korzysta z osobnej nazwanej aplikacji Firebase skonfigurowanej zmiennymi
VITE_PLATFORM_FIREBASE_*. Zwykły ekran logowania organizacji nie pokazuje
wyboru obszaru logowania.

Dostęp wymaga jednocześnie:
  - poprawnie zweryfikowanego tokenu Firebase;
  - dokładnego claimu platformRole: PLATFORM_OWNER;
  - zweryfikowanego adresu email;
  - aktywnego MFA;
  - aktywnego rekordu platform_admin;
  - braku członkostwa i zatrudnienia w jakiejkolwiek organizacji.

Email, w tym cleanzi@admin.com, nigdy nie jest samodzielną podstawą
autoryzacji.

3.2. Dashboard

Dashboard prezentuje:
  - liczbę wszystkich, aktywnych, zawieszonych, wygasłych i usuniętych
    organizacji;
  - aktywne Trial i Trial kończące się w ciągu 3, 7, 14 i 30 dni;
  - aktywne plany START i PRO;
  - subskrypcje zaległe, anulowane i wygasłe;
  - sumę potwierdzonych płatności według waluty;
  - MRR tylko wtedy, gdy katalog planów zawiera kompletne ceny miesięczne.

3.3. Lista organizacji

Lista zawiera nazwę, orgId, dokładny czas rejestracji, Ownera, status
organizacji, onboarding, plan, status subskrypcji, koniec Trial lub okresu
płatnego, liczbę dni do końca i czas ostatniej płatności.

Wyszukiwanie, filtrowanie, sortowanie i paginacja są wykonywane po stronie
backendu. Zapytania SQL są parametryzowane. Klient nie może przesyłać SQL,
GraphQL ani nazwy dowolnej operacji spoza backendowej listy dozwolonej.

3.4. Szczegóły organizacji

Widok szczegółów ma zakładki:
  - Podsumowanie;
  - Subskrypcja;
  - Płatności i faktury;
  - Historia zmian;
  - Prywatny audyt.

Otwarcie danych organizacji wymaga aktywnego kontekstu utworzonego z podanym
powodem. Powód jest zapisywany wyłącznie w prywatnym audycie platformy.

3.5. Operacje ręczne

Obsługiwane są:
  - edycja nazwy, statusu organizacji i onboardingu;
  - zmiana Ownera, soft-delete i przywrócenie;
  - przedłużenie Trial o liczbę dni lub do konkretnej daty;
  - zmiana planu TRIAL, START lub PRO;
  - aktywacja, zawieszenie, anulowanie, wygaśnięcie i ponowne uruchomienie
    subskrypcji;
  - korekta początku i końca okresu rozliczeniowego;
  - ręczna płatność, zwrot i korekta finansowa.

Każda operacja wymaga powodu, podglądu before/after i oddzielnego
potwierdzenia. Operacje planowe, subskrypcyjne i finansowe wymagają świeżego
uwierzytelnienia z MFA, maksymalnie sprzed 5 minut.

4. PRZEPŁYW DANYCH

  Panel frontendowy
        |
        | token Firebase + kontekst + wymagany powód
        v
  /api/platform/*
        |
        | polityka PLATFORM_OWNER i walidacja wejścia
        v
  platform-repository.js
        |
        | transakcja SQL i blokady rekordów
        v
  PostgreSQL / Cloud SQL
        |
        +--> bieżąca subskrypcja
        +--> historia append-only
        +--> prywatny audyt platformy
        +--> płatności, dokumenty i zdarzenia rozliczeniowe

Przed mutacją backend zapisuje REQUESTED. Jeżeli ten zapis się nie powiedzie,
operacja nie jest wykonywana. Zmiana biznesowa i SUCCEEDED są zapisywane w tej
samej transakcji SQL. Po niepowodzeniu i rollbacku zapisywany jest FAILED.

Tokeny, hasła, kody MFA i sekrety są usuwane z danych audytowych.

5. API PLATFORMY

Wszystkie dane prywatne są dostępne wyłącznie przez /api/platform/*.
Najważniejsze grupy endpointów:
  - GET  /api/platform/dashboard
  - GET  /api/platform/plans
  - GET  /api/platform/organizations
  - POST /api/platform/access-context
  - POST /api/platform/access-context/close
  - GET  /api/platform/organizations/:orgId
  - GET  /api/platform/organizations/:orgId/subscription-history
  - GET  /api/platform/organizations/:orgId/transactions
  - GET  /api/platform/organizations/:orgId/documents
  - POST /api/platform/organizations/:orgId/operations/preview
  - POST /api/platform/organizations/:orgId/operations
  - GET  /api/platform/audit
  - POST /api/platform/mfa/email/request
  - POST /api/platform/mfa/email/verify

Interfejsy API nie przyjmują dowolnego SQL ani GraphQL. Wejście do operacji
Data Connect jest ograniczone nazwami znajdującymi się na backendowej liście
dozwolonej.

6. MODEL DANYCH

Migracja zachowuje istniejące tabele organizations i
organization_subscription. Dodaje tylko brakujące kolumny oraz:
  - platform_plan — katalog TRIAL, START i PRO z opcjonalnymi cenami;
  - organization_subscription_history — append-only historia zmian;
  - organization_billing_account — powiązanie z przyszłym operatorem;
  - billing_transaction — płatności, zwroty i korekty;
  - billing_transaction_event — append-only zdarzenia finansowe;
  - billing_document — faktury i inne dokumenty rozliczeniowe.

Kwoty są liczbami całkowitymi BIGINT w najmniejszych jednostkach waluty.
Waluta jest trzyliterowym kodem. Operacje finansowe mają idempotency key,
dzięki czemu ponowienie tego samego żądania nie tworzy duplikatu.

Źródło wpisu rozliczeniowego rozróżnia operacje ręczne, systemowe i przyszłego
operatora płatności. Brak historii dla istniejących rekordów jest poprawnym
pustym stanem.

7. ADAPTER OPERATORA PŁATNOŚCI

BillingProviderAdapter definiuje granicę dla klienta, subskrypcji, anulowania,
zwrotu i webhooków. Domyślny NoopBillingProvider nie wykonuje żadnych operacji
zewnętrznych.

Stripe, Przelewy24 lub inny operator powinien zostać dodany jako osobna
implementacja adaptera i zarejestrowany w provider-registry.js. Sekrety
operatora mogą istnieć wyłącznie po stronie backendu lub w Secret Manager.

8. KONFIGURACJA ŚRODOWISKA

Wartości konfiguracyjne nie mogą być zapisane na sztywno w kodzie. Kategorie:
  - VITE_PLATFORM_API_BASE — adres backendu platformy;
  - VITE_PLATFORM_FIREBASE_* — frontendowy Firebase Auth Panelu admina;
  - PLATFORM_FIREBASE_* — backendowa weryfikacja Firebase;
  - FIREBASE_DATACONNECT_* i VITE_DATACONNECT_* — Data Connect;
  - DATABASE_URL albo CLOUD_SQL_CONNECTION_NAME/DB_* — PostgreSQL;
  - BILLING_PROVIDER i przyszłe BILLING_PROVIDER_* — operator płatności;
  - PLATFORM_EMAIL_MFA_SECRET i PLATFORM_MFA_SMTP_* — prywatne MFA email.

Pełna lista nazw znajduje się w Cleanzi-admin/.env.example. Do repozytorium nie
wolno dodawać rzeczywistych .env, kont serwisowych, tokenów, haseł ani kluczy.

9. INTEGRACJA Z CLEANZI-01

Moduł wymaga:
  - osadzenia platformAdminTemplate w układzie portalu;
  - utworzenia kontrolera createCleanziAdminPanel przez hosta;
  - przekazania bezpiecznych funkcji sesji, routingu i wylogowania;
  - dostarczenia platformAuthHeaders do klienta API;
  - montowania createPlatformApi dla ścieżek /api/platform/*;
  - dostarczenia puli PostgreSQL i zweryfikowanego tokenu Firebase;
  - zachowania prywatnego kontekstu żądania platformowego.

Szczegółowy kontrakt znajduje się w docs/host-integration.md. Pliki zwykłego
portalu organizacji nie są częścią tej dystrybucji, ponieważ zawierają również
niezwiązane funkcje tenantowe.

10. TESTY I LOKALNA WERYFIKACJA

W pełnym repozytorium Cleanzi-01:

  npm test
  npm --prefix web-app run lint
  npm --prefix web-app run build
  npm run migrate:cleanzi-admin:audit

Audyt migracji jest tylko do odczytu, ale łączy się z bazą wskazaną przez
środowisko. Polecenie apply nie może zostać uruchomione na zdalnej bazie bez
osobnej zgody:

  npm run migrate:cleanzi-admin:apply

Testy obejmują autoryzację PLATFORM_OWNER, MFA, zakaz tenantowego członkostwa,
transakcje, rollback, historię, audyt, idempotencję płatności, migrację,
przenośność konfiguracji i poprawny UTF-8.

11. PROVISIONING PLATFORM_OWNER

Provisioning wykonuje uprzywilejowany operator:
  1. tworzy konto w docelowym Firebase Auth;
  2. weryfikuje email i konfiguruje MFA;
  3. nadaje claim platformRole: PLATFORM_OWNER przez Firebase Admin SDK;
  4. dodaje aktywny rekord platform_admin;
  5. potwierdza brak wpisów worker i organization_member;
  6. unieważnia stare tokeny i wymusza ponowne logowanie.

Procedura jest opisana w docs/platform-owner-provisioning.md. Hasła, tokeny i
kody MFA nie mogą być zapisywane w repozytorium ani audycie.

12. CZYNNOŚCI NIEWYKONYWANE PRZEZ MODUŁ

  - brak deployu do Firebase i App Hosting;
  - brak automatycznej migracji Cloud SQL;
  - brak tworzenia kont i nadawania claimów po stronie klienta;
  - brak pobierania pieniędzy;
  - brak zmian uprawnień zwykłych użytkowników organizacji;
  - brak ujawniania danych finansowych i audytu tenantom;
  - brak zapisywania PLATFORM_OWNER w tenantowych createdBy/updatedBy/edit.

13. KOMPATYBILNOŚĆ

Istniejące rekordy subskrypcji pozostają obsługiwane. Nowe pola mają wartości
domyślne lub dopuszczają NULL. Brak historii nie powoduje błędu. Panel używa
wyłącznie istniejącego uwierzytelniania, prywatnego audytu i kontekstu wejścia
do organizacji.
