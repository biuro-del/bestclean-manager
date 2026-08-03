Cleanzi version 4.0 - dokument techniczny dla programistów i AI
===============================================================

Data utworzenia dokumentu: 2026-06-24
Projekt: Cleanzi / Best Clean Portal

Cel tego pliku
--------------
Ten plik jest główną mapą projektu dla programisty i AI. Ma pomagać kolejnej osobie szybko zrozumieć:
- gdzie znajduje się logika aplikacji,
- które moduły odpowiadają za konkretne funkcje biznesowe,
- jak uruchamiać, budować i sprawdzać projekt,
- co trzeba zaktualizować po każdej zmianie w kodzie.

Obowiązkowa zasada pracy:
Każda osoba lub AI, która zmienia projekt, musi zaktualizować sekcję "Historia zmian dokumentacji i projektu" na końcu tego pliku. Wpis musi jasno mówić, co dodano, co zmieniono, co usunięto, jakie testy/sprawdzenia wykonano i co kolejna osoba powinna wiedzieć.

Jeśli czyta to AI:
- przed zmianami przeczytaj ten plik i sprawdź aktualny stan repozytorium,
- przed rozpoczęciem pracy sprawdź, czy w zdalnym repozytorium jest nowsza wersja; poinformuj użytkownika, jeśli lokalna gałąź jest za GitHubem,
- jeśli istnieje nowsza wersja w GitHubie, traktuj ją jako punkt odniesienia i dostosuj dalsze prace do niej; nie wracaj do starszej wersji tylko dlatego, że taka była uruchomiona na localhost,
- nie zakładaj, że opis jest w 100% aktualny, jeżeli kod mówi co innego,
- po zmianach dopisz wpis w historii zmian,
- nie usuwaj cudzych wpisów historii,
- nie zmieniaj wygenerowanych plików ręcznie, jeśli powinny powstać przez generator,
- nie nadpisuj zmian innych osób widocznych w `git status`.


Szybki start
------------
Najważniejsze komendy z katalogu głównego projektu:

1. Tryb developerski backend + Vite:
   `npm run dev`

2. Tylko frontend Vite:
   `npm run dev:web`

3. Build frontendu portalowego:
   `npm run build`

4. Start serwera produkcyjnego/lokalnego po buildzie:
   `npm start`

5. Lint frontendu:
   `npm --prefix web-app run lint`

6. Build bezpośrednio w `web-app`:
   `npm --prefix web-app run build`

7. Testy backendu, polityk i repozytoriów:
   `npm test`

8. Migracja i kontrola schematu pracowników/platformy:
   `npm run migrate:workers`
   `npm run migrate:workers -- --audit`

9. Administracja kontami PLATFORM_OWNER:
   `npm run platform-admin -- list`
   `npm run platform-admin -- enable --email adres@example.com --name "Nazwa"`
   `npm run platform-admin -- disable --email adres@example.com`

10. Regeneracja SDK Data Connect po zmianie schema/queries/mutations:
    `firebase dataconnect:sdk:generate`

Lokalny backend używa Google Application Default Credentials (ADC), aby pobrać sekrety i połączyć się z usługami Google Cloud. Przed pierwszym uruchomieniem albo po wygaśnięciu sesji wykonaj na Windows:
`gcloud.cmd auth application-default login`

Jeżeli portal zgłasza `invalid_grant`, `invalid_rapt` albo komunikat `Lokalna sesja Google Cloud wygasla`, ponów powyższe logowanie i zrestartuj `npm run dev`. Jest to sesja lokalnego programisty; App Hosting używa konta serwisowego runtime.

Uwaga: zmiana dokumentacji nie wymaga builda. Przy zmianach w JS/React/API minimum sprawdź `node --check index.js`, `node --check build-webapp.js`, lint lub build frontendu, zależnie od zakresu zmiany.


Główne katalogi i pliki
-----------------------
`index.js`
Główny backend Node.js. To nie jest Express, tylko ręczny serwer HTTP oparty o `http.createServer`. Obsługuje statyczny frontend z `web-app/dist`, endpointy API, proxy do wdrożonego hostingu/API oraz lokalne tryby pracy z Cloud SQL/Firebase Admin.

`package.json`
Skrypty główne projektu. `npm run dev` uruchamia `scripts/dev.js`, a `npm run build` uruchamia `build-webapp.js`. Dostępne są również `npm test`, `npm run migrate:workers`, `npm run migrate:platform` i `npm run platform-admin`.

`build-webapp.js`
Wrapper buildu portalu. Normalizuje target do `portal`, sprawdza zależności `web-app` i uruchamia `npm run build:portal`.

`scripts/dev.js`
Punkt wejścia lokalnego developmentu. Jeśli konfiguracja bazy nie jest podana jawnie, używa ADC do pobrania `PORTAL_DB_USER` i `PORTAL_DB_PASS` z Secret Manager, ustawia bezpośredni tryb Cloud SQL i uruchamia `scripts/dev-local.js`.

`scripts/dev-local.js`
Lokalny orchestrator developerski. Uruchamia backend na porcie `8080` oraz frontend Vite na `localhost:5173`, sprawdza konflikty portów, Firebase Admin, bazę, healthcheck i TLS. Backend nie ma watchera; po zmianie plików backendowych trzeba zrestartować cały `npm run dev`.

`worker-repository.js`, `worker-id-policy.js`, `auth-session-policy.js`
Bezpośredni model Cloud SQL pracowników, transakcje rezerwacji ID, polityka ról i ocena dostępu do organizacji.

`platform-api.js`, `platform-repository.js`, `platform-policy.js`, `platform-request-context.js`
Backend kont `PLATFORM_OWNER`: wybór organizacji, kontekst dostępu, allowlista operacji, prywatny audyt i gateway Data Connect.

`platform-email-mfa.js`
Opcjonalny aplikacyjny kod email dla kont platformowych. Wymaga sekretu, serwerowej allowlisty adresów i konfiguracji SMTP; nie jest natywnym drugim składnikiem Firebase.

`scripts/migrate-worker-model.js`
Idempotentnie uruchamia migracje pracowników, ról i tabel platformowych oraz może wykonać audyt schematu przez `--audit`.

`scripts/platform-admin.js`
Niejawny skrypt provisioningowy `PLATFORM_OWNER`; nie istnieje publiczny endpoint do samodzielnego nadawania tej roli.

`web-app/`
Aplikacja frontendowa React + Vite.

`web-app/apps/portal-web/src/`
Kod portalu administracyjnego/użytkowego.

`dataconnect/`
Konfiguracja Firebase Data Connect: schema, queries, mutations i generator SDK.

`web-app/apps/portal-web/src/dataconnect-generated/`
Wygenerowany SDK Data Connect używany przez frontend. Nie edytować ręcznie. Po zmianach w `dataconnect/schema` albo `dataconnect/connectors` regenerować SDK odpowiednią komendą Firebase Data Connect.

`.env.example`
Przykład konfiguracji backendu/root.

`web-app/.env.example`
Przykład konfiguracji frontendu Vite/Firebase.

`firebase.json`
Konfiguracja Firebase Hosting, Firestore rules, Storage rules i Data Connect.

`apphosting.yaml`
Konfiguracja App Hosting/runtime. Zawiera zmienne produkcyjne, sekrety i target portalu.

`.local-data/`
Lokalne dane runtime backendu dla trybów plikowych. Katalog jest ignorowany przez git.


Backend i API
-------------
Backend znajduje się w `index.js` i ma kilka głównych zadań:
- serwowanie zbudowanego frontendu z `web-app/dist`,
- obsługa endpointów portalu i mobile,
- komunikacja z Firebase Admin/Firebase Auth,
- komunikacja z Cloud SQL/PostgreSQL,
- proxy wybranych endpointów do `API_PROXY_TARGET`,
- obsługa lokalnych trybów plikowych dla części danych portalu.

Najważniejsze endpointy:
- `GET /healthz` - prosty healthcheck.
- `/api/mobile/state` - stan dla workflow mobilnego.
- `/api/mobile/scan` - obsługa skanowania/workflow mobile.
- `/api/portal/tasks` - zadania portalu, lokalnie lub proxy.
- `/api/portal/schedule-orders` - zlecenia/grafik, lokalnie lub proxy.
- `/api/portal/events` - zdarzenia portalu, lokalnie lub proxy.
- `GET /api/admin/worker-id/next?orgId=...` - niewiążący podgląd następnego ID pracownika.
- `POST /api/admin/users` - jedyna aktywna ścieżka tworzenia pracownika, konta Firebase Auth, członkostwa i rezerwacji ID.
- `/api/auth/provision-worker` - endpoint wycofany; zwraca `410 WORKER_PROVISION_ENDPOINT_REMOVED`.
- `/api/admin/worker-password/reveal` - endpoint wycofany; zwraca `410 WORKER_PASSWORD_REVEAL_REMOVED`.
- `/api/admin/worker-password/set` - resetuje hasło wyłącznie w Firebase Auth; hasło nie jest zapisywane w SQL.
- `/api/admin/worker-profile/update` - aktualizacja profilu pracownika.
- `/api/admin/worker-profile/delete` - usuwanie profilu pracownika.
- `/api/admin/workers/restore` - transakcyjne odtwarzanie pracowników z backupu.
- `/api/auth/session-context` - kontekst sesji, organizacji, subskrypcji i konta platformowego.
- `GET /api/platform/organizations` - lista i filtrowanie organizacji dla PLATFORM_OWNER.
- `POST /api/platform/access-context` i `/api/platform/access-context/close` - otwarcie/zamknięcie audytowanego wejścia do organizacji.
- `POST /api/platform/data-connect` - allowlistowany gateway danych wybranej organizacji.
- `GET /api/platform/audit` - prywatny audyt administratorów platformy.
- `/api/platform/organizations/:orgId` oraz akcje `subscription`, `owner`, `soft-delete`, `restore` - zarządzanie organizacją.
- `/api/platform/mfa/email/request` i `/api/platform/mfa/email/verify` - opcjonalna aplikacyjna weryfikacja kodem email.
- `/api/**` - fallback proxy do zdalnego API.

Są też legacy aliasy dla części funkcji. Alias provisioningowy i podgląd hasła pozostają wyłącznie po to, aby stare klienty otrzymały jednoznaczną odpowiedź `410`.

Ważne zmienne backendu:
- `PORT` - port backendu, domyślnie `8080`.
- `APP_TARGET` - historycznie target aplikacji; aktualnie build normalizuje do `portal`.
- `API_PROXY_TARGET` - zdalny host/API używany przez proxy.
- `API_PROXY_FORWARDED_HOST` - host przekazywany upstreamowi.
- `API_PROXY_TIMEOUT_MS` - timeout proxy.
- `MAX_PROXY_BODY_BYTES` - limit body proxy.
- `ADMIN_USERS_MODE` - tryb `/api/admin/users`.
- `PORTAL_DB_ROUTES_MODE`, `PORTAL_TASKS_MODE`, `PORTAL_SCHEDULE_ORDERS_MODE`, `PORTAL_EVENTS_MODE` - tryby lokalne/proxy dla tras portalu.
- `WORKER_PROFILE_MODE` - local/direct/proxy/remote dla profilu pracownika.
- `WORKER_PROFILE_STORAGE_MODE` - operacje CRUD pracowników zawsze używają Cloud SQL (`database`).
- `CLOUD_SQL_CONNECTION_NAME`, `DB_NAME`, `DB_USER`, `DB_PASS` - połączenie z Cloud SQL; lokalnie `scripts/dev.js` może pobrać użytkownika i hasło z Secret Manager przez ADC.
- `PLATFORM_EMAIL_MFA_SECRET` oraz `PLATFORM_EMAIL_MFA_*` - opcjonalna konfiguracja kodu email/SMTP dla administratorów platformy.

Backend ma własne helpery do:
- nagłówków security/CSP,
- czytania i limitowania JSON body,
- normalizacji błędów,
- łączenia z Cloud SQL,
- Firebase Admin/Auth,
- transakcyjnego CRUD pracowników i kompensacji zmian Firebase Auth,
- rezerwacji ID i technicznych loginów pracowników,
- polityk ról organizacyjnych i platformowych,
- Data Connect REST/GraphQL,
- lokalnych plików `.local-data`.

Tabela `worker_credential`, kod szyfrowania haseł i `WORKER_PASSWORD_SECRET` zostały wycofane. W repozytorium może występować tylko migracja `DROP TABLE IF EXISTS`; hasła są obsługiwane wyłącznie przez Firebase Auth.


Frontend portalowy
------------------
Frontend jest w `web-app` i działa jako React + Vite.

Główne wejścia:
- `web-app/index.html` - HTML Vite, język `pl`, mount `#root`.
- `web-app/apps/portal-web/src/main.jsx` - tworzy root React.
- `web-app/apps/portal-web/src/App.jsx` - montuje `mountPortalApp()`.
- `web-app/apps/portal-web/src/ui/portalApp.js` - centralny plik portalu: nawigacja, sesja, lazy loading feature, global search, powiadomienia, synchronizacja tras, shared context dla modułów.
- `web-app/apps/portal-web/src/ui/router.js` - pokazywanie/ukrywanie widoków po route, aktywacja menu i submenu.
- `web-app/apps/portal-web/src/ui/layoutTemplate.js` - główny layout portalu.
- `web-app/apps/portal-web/src/ui/viewTemplates.js` - rejestr/szablony widoków.
- `web-app/apps/portal-web/src/index.css` - globalne style portalu.
- `web-app/apps/portal-web/src/ui/styles/clientProfile.css` - style profilu klienta.

Stan i helpery:
- `web-app/apps/portal-web/src/app/state/index.js` - globalny stan aplikacji `appState`, reset sesji i dashboardu.
- `web-app/apps/portal-web/src/app/shared/index.js` - wspólne helpery: daty, formatowanie, paginacja, selecty, HTML escaping.
- `web-app/apps/portal-web/src/auth/authService.js` - logowanie emailem, reset hasła Firebase, TOTP/SMS MFA, opcjonalny kod email, sesja i wybór organizacji.
- `web-app/apps/portal-web/src/firebase/firebaseClient.js` - klient Firebase/Data Connect i gotowość auth.
- `web-app/apps/portal-web/src/services/platformDataConnectService.js` - przekierowuje operacje PLATFORM_OWNER do backendowego gatewaya i przekazuje nagłówki kontekstu platformowego.
- `web-app/apps/portal-web/src/ui/subscriptionBadge.js` - prezentuje pakiet wybranej organizacji i pozostały okres subskrypcji/Trial.

Zasada modułów frontendu:
- Feature zwykle ma `index.js` z `route`, `viewId` i funkcją `create...Feature(ctx)`.
- Wiele feature ma `template.html`, czasem `style.css`.
- Feature dostaje `ctx` z `portalApp.js`, czyli dostęp do stanu, serwisów, routera i helperów.
- Nie dodawaj dużej logiki biznesowej do template HTML. Logika powinna być w `index.js` feature albo w serwisie.


Struktura folderów sekcji i podsekcji
-------------------------------------
Portal jest podzielony folderami według sekcji i podsekcji interfejsu. Główne sekcje są w `web-app/apps/portal-web/src/features/`, a podsekcje mają własne podfoldery wewnątrz sekcji nadrzędnej.

Zasada bazowa:
- każda duża sekcja portalu ma osobny folder w `features`, np. `dashboard`, `calendar`, `kanban`, `events`, `reports`, `schedule`;
- każda sekcja z podsekcjami ma folder nadrzędny i osobne foldery podsekcji;
- każda podsekcja powinna mieć własne pliki logiki i widoku, najczęściej `index.js` oraz `template.html`;
- jeśli podsekcja ma style specyficzne tylko dla siebie, dodaje się lokalny `style.css`;
- folder nadrzędny sekcji może mieć `index.js`, który zbiera routes/podmoduły i wystawia wspólne `create...Feature(ctx)`;
- wspólne operacje danych powinny trafiać do `services`, a nie być kopiowane między folderami podsekcji.

Aktualny wzorzec folderów:
- `features/orders/list` i `features/orders/map` - dwie podsekcje zleceń.
- `features/clients/profile`, `features/clients/profile-details`, `features/clients/list`, `features/clients/individual-orders` - podsekcje klientów.
- `features/objects/zones`, `features/objects/audits`, `features/objects/checklists` - podsekcje obiektów.
- `features/workers/worker_list_profile`, `features/workers/account`, `features/workers/time`, `features/workers/time-detail` - podsekcje pracowników.
- `features/settings/styles` i `features/settings/backup` - podsekcje ustawień.
- `features/dashboard`, `features/calendar`, `features/kanban`, `features/events`, `features/reports` - sekcje samodzielne.

Przy dodawaniu nowej sekcji lub podsekcji:
- utwórz osobny folder w odpowiednim miejscu pod `features`;
- dodaj `index.js` z `route`, `viewId` i funkcją tworzącą feature, jeśli moduł ma własną logikę;
- dodaj `template.html`, jeśli widok jest montowany z szablonu HTML;
- dodaj lokalny `style.css` tylko dla stylów, które nie powinny być globalne;
- zarejestruj trasę w routerze i mapach portalu (`ui/router.js`, `ui/portalApp.js`, layout/menu/view templates - zależnie od zakresu);
- dopisz opis nowej sekcji lub podsekcji w tym pliku.


Moduły biznesowe frontendu
--------------------------
`features/dashboard`
Pulpit. Zbiera najważniejsze podsumowania i sygnały z innych obszarów.

`features/calendar`
Kalendarz zadań/terminów. Powiązany z taskami, zleceniami i widokami czasu.

`features/kanban`
Widok kanban, sekcje typu home/tasks/inbox.

`features/orders/list`
Lista zleceń.

`features/orders/map`
Mapa zleceń/adresów. Może używać Google Maps, jeśli skonfigurowano `VITE_GOOGLE_MAPS_API_KEY`.

`features/events`
Zdarzenia, workdays, eventy strefowe, komentarze i operacje na zdarzeniach.

`features/clients/profile`
Profil/lista klientów jako główny widok klientów.

`features/clients/profile-details`
Szczegóły klienta.

`features/clients/list`
Starszy/alternatywny route `clientsList`, w routerze normalizowany do `clientProfile`.

`features/objects/zones`
Strefy/obiekty klientów.

`features/objects/audits`
Audyty obiektów.

`features/workers/worker_list_profile`
Lista i profil pracowników, tworzenie/edycja, osobne pola roli oraz typu pracownika, status online i eksporty ewidencji. Formularz pokazuje `Email (login)`; techniczny login nie jest prezentowany użytkownikowi.

`features/workers/account`
Konto pracownika.

`features/workers/time`
Widok czasu pracy pracowników.

`features/workers/time-detail`
Szczegółowy widok czasu pracy, edycja dni, eksport CSV/PDF, szerokości kolumn.

`features/reports`
Raporty i zestawienia.

`features/settings`
Kontener ustawień.

`features/settings/styles`
Ustawienia stylu organizacji/użytkownika.

`features/settings/backup`
Backup, restore, download, automatyzacja kopii.


Serwisy frontendu
-----------------
Serwisy w `web-app/apps/portal-web/src/services/` izolują komunikację z Data Connect, backendem i lokalnymi endpointami.

Najważniejsze serwisy:
- `clientService.js` - klienci.
- `individualOrderService.js` - zlecenia indywidualne.
- `workerService.js` - pracownicy, konta, profile i reset hasła w Firebase Auth; bez sejfu i podglądu hasła.
- `workdayService.js` - workdays, eventy, aktywni pracownicy, podsumowania.
- `zoneService.js` - strefy/obiekty.
- `scheduleService.js` - board grafiku.
- `portalTaskService.js` - `/api/portal/tasks`.
- `scheduleTaskDataConnectService.js` - taski grafiku przez Data Connect.
- `backupService.js` - backup/restore/download/automatyzacja.
- `styleService.js` - style UI organizacji i użytkowników.
- `orgService.js` - organizacje.
- `platformDataConnectService.js` - bezpośrednia komunikacja sesji PLATFORM_OWNER z backendowym gatewayem; bez fallbacku do klientowego Data Connect.

Zasada: jeśli kilka feature potrzebuje tej samej operacji danych, dodaj/zmień serwis zamiast kopiować fetch/logikę w widokach.


Data Connect, baza i modele danych
----------------------------------
Główny schemat:
- `dataconnect/schema/schema.gql`

Konfiguracja:
- `dataconnect/dataconnect.yaml`
- `dataconnect/connectors/example/connector.yaml`

Operacje:
- `dataconnect/connectors/example/queries.gql`
- `dataconnect/connectors/example/mutations.gql`

Wygenerowany SDK:
- `web-app/apps/portal-web/src/dataconnect-generated/`

Główne encje w schemacie:
- `Organization`, `OrganizationMember`
- `OrganizationSubscription`
- `OrgUiStyle`, `UserUiStylePreference`
- `Worker`, `WorkerIdReservation`
- `Client`, `ClientInd`, `IndividualClientJob`
- `Zone`
- `Storage`, `ClientStorage`
- `Task`
- `Workday`, `WorkdayPause`
- `BackupCycle`
- `Event`
- `CheckListDef`, `CheckListExtra`, `CheckListLog`

Ważna zasada multi-tenant:
Większość danych jest zakresowana przez `orgId`. Przy nowych zapytaniach i mutacjach zawsze zachowaj walidację membership/role przez `organizationMember` i `auth.uid`.

Ważna zasada Data Connect:
Nie edytuj ręcznie `dataconnect-generated`. Zmień `schema.gql`, `queries.gql` albo `mutations.gql`, a potem wygeneruj SDK.

CRUD pracowników:
- lista pozostaje pobierana przez `WorkersForOrg`,
- podgląd ID, dodawanie, edycja, reset hasła, usuwanie i restore są wykonywane przez backend oraz bezpośrednie transakcje Cloud SQL,
- brak konfiguracji/gotowości schematu zwraca `503 WORKER_SCHEMA_NOT_READY`; backend nie przełącza automatycznie CRUD pracowników na brakujące operacje Data Connect,
- brak historycznych/opcjonalnych tabel, np. `worker_credential` albo `checklist_log`, nie może przerwać usuwania ani zmiany loginu.

Migracje uruchamiane przez `scripts/migrate-worker-model.js`:
- `20260716_worker_id_reservations_and_remove_credentials.sql`,
- `20260717_worker_roles_and_types.sql`,
- `20260717_platform_owner.sql`,
- `20260717_platform_email_mfa.sql`.


Pracownicy: ID, email, role i typy
---------------------------------
- Nowe ID ma format `worker_<orgId>_<numer>`, np. `worker_orgA_17`.
- `worker_id_reservation` trwale rezerwuje numer. Usunięcie pracownika nie zwalnia numeru; następny zapis używa kolejnego.
- Ręczną dodatnią końcówkę ID mogą wskazać tylko `ADMIN`, `OWNER` i `PLATFORM_OWNER`. Backend zawsze konstruuje finalne ID.
- Techniczny login nowego pracownika ma format `u_<orgId>_<numer>` zapisany małymi literami, np. `u_orga_17`. Login jest wewnętrzny, niewidoczny i niemodyfikowalny.
- Użytkownik wpisuje dowolny poprawny, globalnie unikalny email. Ten sam email trafia do `worker.email`, `worker.login_email` i Firebase Auth i służy do logowania.
- Istniejące historyczne ID i loginy nie są automatycznie zmieniane.

Role/uprawnienia:
- `OWNER` - założyciel/właściciel organizacji wskazany przez `owner_uid` i `owner_worker_id`; pełne uprawnienia, roli nie można przydzielić zwykłym formularzem.
- `ADMIN` - pełna administracja organizacją. Historyczne `ADMINISTRATOR` i `SUPERADMIN` są normalizowane do `ADMIN` tam, gdzie wymaga tego UI/polityka.
- `MANAGER` - może oglądać, dodawać i edytować, ale nie może usuwać. Historyczny `KIEROWNIK` jest aliasem `MANAGER`.
- `COORDINATOR` - dostęp do portalu tylko do odczytu. Historyczny `KOORDYNATOR`/`MEMBER` jest aliasem.
- `WORKER` - domyślna rola nowego pracownika; dostęp tylko do aplikacji mobilnej, bez dostępu do portalu.
- Usuwanie pracownika jest dozwolone dokładnie dla `ADMIN`, `OWNER` i backendowej roli `PLATFORM_OWNER`; nadal nie wolno usunąć własnego konta organizacyjnego.

Typ pracownika jest informacją do prezentacji i filtrowania, a nie źródłem uprawnień. Dostępne wartości UI: `Administrator`, `Pracownik Biurowy`, `Stały personel na obiekcie`, `Zespół Mobilny`.


Konto PLATFORM_OWNER
--------------------
- `PLATFORM_OWNER` jest rolą ponad organizacjami. Konto nie istnieje w `worker` ani `organization_member` i nie jest Ownerem żadnej organizacji.
- Dostęp wymaga zweryfikowanego emaila Firebase, claimu `platformRole: PLATFORM_OWNER`, aktywnego rekordu `platform_admin` oraz MFA.
- Po logowaniu użytkownik trafia do Centrum platformy, wybiera organizację i obowiązkowo podaje powód wejścia. Aktywny kontekst jest przesyłany jako `X-Platform-Context-Id`.
- Dane wybranej organizacji przechodzą przez backendowy allowlistowany gateway `/api/platform/data-connect`; sesja platformowa nie używa klientowego fallbacku Data Connect.
- Operacje Data Connect zawierają jawne `auth.uid`. Gateway wykorzystuje aktywnego członka organizacji wyłącznie jako kontekst obliczenia tych wyrażeń; rzeczywistym aktorem pozostaje administrator platformy zapisany w prywatnym audycie.
- Pola tenantowe typu `editedBy`, `updatedBy` i `createdByUid` zachowują poprzednie wartości albo `NULL`; UID/email administratora platformy nie są wpisywane do danych organizacji.
- Mutacje mają audyt append-only `REQUESTED/SUCCEEDED/FAILED`. Nieudany zapis fazy `REQUESTED` blokuje mutację.
- Usuwanie, zmiana Ownera, subskrypcji, soft-delete i restore wymagają świeżego uwierzytelnienia MFA.
- Tabele SQL: `platform_admin`, `platform_access_context`, `platform_admin_audit_log`, opcjonalnie `platform_email_mfa_challenge` i `platform_email_mfa_session`.

Natywne MFA Firebase w tej aplikacji to TOTP lub SMS. TOTP jest podstawową sprawdzoną metodą. Kod email jest osobnym mechanizmem aplikacyjnym i wymaga skonfigurowanego SMTP; nie zastępuje natywnego wyzwania Firebase na koncie, które ma już zapisany TOTP.


Konfiguracja i sekrety
----------------------
Nie commitować:
- `.env`,
- `.env.local`,
- plików service account,
- sekretów Firebase/Admin/DB,
- lokalnych dumpów i danych `.local-data`.

Przykłady konfiguracji są w:
- `.env.example`,
- `web-app/.env.example`.

Produkcja/App Hosting:
- `apphosting.yaml` ustawia m.in. `NODE_ENV=production`, `APP_TARGET=portal`, Cloud SQL i sekrety DB.
- Produkcja powinna używać konta serwisowego runtime. Nie należy kopiować lokalnego pliku ADC ani uruchamiać `gcloud auth application-default login` na serwerze.

Lokalne Google Cloud/ADC:
- poświadczenia użytkownika są zapisywane poza repozytorium, standardowo w `%APPDATA%\gcloud\application_default_credentials.json`,
- `gcloud auth login` i `gcloud auth application-default login` to różne sesje; biblioteki backendu korzystają z ADC,
- po odświeżeniu ADC zrestartuj `npm run dev`, ponieważ backend nie przeładowuje poświadczeń automatycznie,
- częste `invalid_rapt` może wynikać z polityki reautoryzacji/MFA konta Google, zmiany hasła albo cofnięcia refresh tokenu.

Firebase Hosting:
- `firebase.json` hostuje `web-app/dist` i ma rewrites do funkcji/API.


Zasady bezpiecznej edycji
-------------------------
Przed zmianami:
- sprawdź `git status --short`,
- sprawdź zdalne repozytorium, np. `git fetch --all --prune`, i upewnij się, czy lokalna gałąź nie jest starsza od gałęzi z GitHuba,
- jeśli lokalny stan, localhost albo uruchomiona aplikacja są starsze niż GitHub, nie traktuj ich jako źródła prawdy; zsynchronizuj lub dopasuj plan zmian do najnowszej wersji po poinformowaniu użytkownika,
- przeczytaj odpowiednie pliki feature/serwis/backend,
- ustal, czy plik jest generowany,
- sprawdź, czy są cudze zmiany w tych samych plikach.

Podczas zmian:
- trzymaj zmiany blisko zadania,
- nie przenoś dużej logiki bez potrzeby,
- nie mieszaj refaktoru z poprawką biznesową,
- nie usuwaj fallbacków/proxy bez sprawdzenia trybów lokalnych i produkcyjnych,
- przy zmianach w uprawnieniach sprawdź role: `PLATFORM_OWNER`, `OWNER`, `ADMIN`, `MANAGER`, `COORDINATOR`, `WORKER`; nie mieszaj roli z typem pracownika.

Po zmianach:
- uruchom adekwatne sprawdzenia,
- zaktualizuj ten plik, jeśli zmieniła się struktura, logika, endpoint, komenda, konfiguracja albo znana pułapka,
- dopisz wpis w historii zmian.


Checklist dla programisty
-------------------------
Przed zakończeniem pracy odpowiedz sobie:
- Czy zmieniłem endpoint, payload, role albo tryb proxy?
- Czy zmieniłem schemat Data Connect albo queries/mutations?
- Czy trzeba regenerować `dataconnect-generated`?
- Czy zmieniłem route, viewId albo nazwę modułu?
- Czy zmieniłem CSS globalny, który może dotknąć innych ekranów?
- Czy dodałem/zmieniłem zmienną `.env` i opisałem ją w `.env.example`?
- Czy sprawdziłem build/lint/składnię odpowiednio do zmiany?
- Czy wpisałem zmianę w historii tego pliku?


Checklist dla AI
----------------
Jeśli pracujesz jako AI:
- nie wykonuj destructive git commands bez wyraźnej zgody użytkownika,
- nie cofaj cudzych zmian,
- przy konflikcie w pliku najpierw przeczytaj i pracuj z istniejącymi zmianami,
- jeśli zmieniasz kod, dopisz wpis w historii tego pliku,
- w historii wpisz konkrety, nie ogólniki,
- jeśli nie uruchomiono testów, wpisz dlaczego,
- jeśli zmiana dotyczy tylko dokumentacji, nie udawaj, że wykonano build.

Format wpisu historii:

Data: RRRR-MM-DD
Autor: imię / inicjały / AI
Dodano:
- ...
Zmieniono:
- ...
Usunięto:
- ...
Testy/sprawdzenia:
- ...
Uwagi dla następnej osoby:
- ...


Historia zmian dokumentacji i projektu
--------------------------------------
Data: 2026-07-20
Autor: AI Codex
Dodano:
- Dodano bezpośredni model Cloud SQL pracowników z tabelą trwałych rezerwacji `worker_id_reservation`, formatem ID `worker_<orgId>_<numer>` oraz technicznym loginem `u_<orgId>_<numer>`.
- Dodano rozdzielenie roli/uprawnień od informacyjnego typu pracownika oraz kanoniczne role `OWNER`, `ADMIN`, `MANAGER`, `COORDINATOR`, `WORKER`.
- Dodano logowanie pracownika dowolnym poprawnym emailem; email jest globalnie unikalny w Firebase Auth, a login techniczny pozostaje niewidoczny i niemodyfikowalny.
- Dodano reset zapomnianego hasła na ekranie logowania przez `sendPasswordResetEmail` Firebase oraz poprawne polskie komunikaty.
- Dodano rolę `PLATFORM_OWNER`, Centrum platformy, wybór organizacji z wymaganym powodem, tabele administratorów/kontekstów/audytu, provisioning CLI, soft-delete/restore, zarządzanie Ownerem i subskrypcją.
- Dodano natywne logowanie MFA TOTP/SMS dla administratora platformy oraz opcjonalną infrastrukturę jednorazowego kodu email z HMAC, limitami prób, allowlistą odbiorców i SMTP.
- Dodano backendowy allowlistowany gateway Data Connect dla sesji platformowej i prywatny audyt faz `REQUESTED/SUCCEEDED/FAILED`.
- Dodano chip pakietu/subskrypcji aktywnej organizacji w nagłówku portalu.
- Dodano migracje `20260716_worker_id_reservations_and_remove_credentials.sql`, `20260717_worker_roles_and_types.sql`, `20260717_platform_owner.sql` i `20260717_platform_email_mfa.sql`.
Zmieniono:
- CRUD pracowników, reset hasła i restore przeniesiono na backend oraz bezpośrednie transakcje Cloud SQL; lista pracowników nadal używa `WorkersForOrg`.
- Tworzenie pracownika rezerwuje ID pod blokadą organizacji, tworzy Firebase Auth i kompensuje konto Auth po błędzie SQL. Edycja zachowuje `worker_id` i login techniczny oraz cofa zmianę Firebase po błędzie bazy.
- Usuwanie pracownika zachowuje rezerwację numeru, pomija nieistniejące tabele historyczne i jest dostępne tylko dla `ADMIN`, `OWNER` oraz backendowego `PLATFORM_OWNER`; pozostaje blokada usunięcia własnego konta.
- Formularze pracownika pokazują `Email (login)`, osobną rolę i osobny typ. Lista pracowników ma osobne kolumny `Rola` i `Typ pracownika`, a eksporty nie pokazują loginu technicznego.
- Sesja portalu rozpoznaje `PLATFORM_OWNER` przed członkostwem organizacyjnym i wymaga zweryfikowanego emaila, claimu, aktywnego rekordu SQL oraz MFA.
- Gateway platformowy wykonuje operacje Data Connect z istniejącym aktywnym członkiem organizacji jako technicznym kontekstem `auth.uid`; usuwa to błąd `Failed to compute String_Expr` bez dodawania konta platformowego do tenantów.
- Poprawiono wygląd ekranu MFA: ukrywanie przycisku SMS przy wybranym TOTP oraz styl listy drugiego składnika zgodny z pozostałymi polami logowania.
- Lokalny `npm run dev` uruchamia `scripts/dev.js`, który pobiera dane Cloud SQL z Secret Manager przez ADC i uruchamia bezpośredni backend oraz Vite.
- Rozszerzono główną część `ReadMe.txt` o aktualne endpointy, pliki, migracje, zasady ról, PLATFORM_OWNER, MFA i rozwiązywanie problemów z ADC; cały plik znormalizowano do poprawnego UTF-8 (naprawiono jeden historyczny bajt Windows-1250).
Usunięto:
- Usunięto aktywny model/tabelę `worker_credential`, sejf haseł, szyfrowanie haseł, konfigurację `WORKER_PASSWORD_SECRET` oraz podgląd/kopiowanie przypisanego hasła w UI.
- Wyłączono `/api/auth/provision-worker` i `/api/admin/worker-password/reveal`; stare klienty otrzymują odpowiednio jednoznaczne odpowiedzi `410`.
- Usunięto wymóg tworzenia emaila pracownika z loginu i domeny konta administratora.
Testy/sprawdzenia:
- Migracje pracowników i platformy wykonano poprawnie na Cloud SQL; readiness `worker-schema` oraz `platform-schema` zwraca `ready`.
- Uruchomiono `npm test`: 49/49 testów zakończonych sukcesem po dodaniu testów gatewaya platformowego.
- Uruchomiono `node --check` dla zmienionych plików backendowych oraz produkcyjny `npm run build`; build Vite zakończył się sukcesem ze standardowym ostrzeżeniem o dużych chunkach.
- Wykonano rzeczywisty test gatewaya Data Connect po poprawce `String_Expr`; `WorkersForOrg` zwróciło 82 rekordy.
- Zweryfikowano lokalny backend i portal: `/healthz` oraz `http://localhost:5173` zwróciły HTTP 200.
- 2026-07-20 odświeżono ADC przez `gcloud.cmd auth application-default login`, zrestartowano `npm run dev` i potwierdzono odczyt sekretów, połączenie Cloud SQL oraz gotowość obu schematów.
Uwagi dla następnej osoby:
- Te zmiany są w lokalnym, niezacommitowanym stanie repozytorium; ten wpis nie oznacza automatycznego wdrożenia online.
- TOTP działa i jest podstawową metodą MFA. SMS wymaga włączonego dostawcy w Identity Platform. Kod email jest mechanizmem aplikacyjnym, wymaga konfiguracji SMTP i nie jest natywnym zamiennikiem TOTP po rozpoczęciu wyzwania Firebase.
- Konto PLATFORM_OWNER nie może zostać dodane do `worker` ani `organization_member`. Rzeczywista tożsamość administratora ma trafiać tylko do prywatnego audytu platformy, nigdy do pól autora danych organizacji.
- Po zmianach backendu zawsze restartuj cały `npm run dev`; Vite ma HMR, ale `index.js` i moduły backendowe nie mają watchera.
- Po wygaśnięciu lokalnych poświadczeń wykonaj `gcloud.cmd auth application-default login` i ponownie uruchom `npm run dev`; nie przenoś lokalnego pliku ADC do App Hosting.

Data: 2026-06-29
Autor: AI Codex
Dodano:
- Dodano normalizacje wieloliniowych komorek grafiku dnia pobieranych z Google Sheets, z zachowaniem podzialow linii i czyszczeniem nadmiarowych spacji.
- Dodano awaryjne rozpoznawanie godziny START z poczatku wpisu zadania, gdy osobna kolumna `godz. START` jest pusta.
Zmieniono:
- Przelaczono zrodlo panelu `Pulpit -> Grafik dnia` na zakladke arkusza Google Sheets `gid=1837558782`.
- Zmieniono klucz cache grafiku dnia na `portal.dashboardSchedule.lastGood.1837558782`, aby nie mieszac danych ze stara zakladka.
- Poprawiono renderowanie wpisow `Rano` i `Popoludnie`, aby opisy z godzinami na poczatku linii nie dostawaly zdublowanej godziny START.
- Poprawiono CSS panelu `Grafik dnia`, aby tresc zmian zawijala sie i zachowywala nowe linie, a pole `Godz. START` pozostalo jednowierszowe.
- Zaktualizowano link w sekcji `Grafik`, aby otwieral ta sama zakladke arkusza `gid=1837558782`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/services/scheduleService.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `npm.cmd run build` w `web-app`; build zakonczyl sie sukcesem z istniejacym ostrzezeniem o duzych chunkach Vite.
Uwagi dla nastepnej osoby:
- Panel `Grafik dnia` nadal pobiera dane przez Google Visualization API (`gviz/tq`) z pliku `1fT9pG2HpW9xT8b28d4jbhg2m3izhM08-U0QybwXvkas`; aktywna zakladka to teraz `gid=1837558782`.

Data: 2026-06-29
Autor: AI Codex
Dodano:
- Dodano walidacje zgodnosci swiezego odczytu pracownika po zapisie z rekordem potwierdzonym przez backend; jezeli odczyt po `SERVER_ONLY` zwraca stary typ/dane, UI natychmiast uzywa rekordu zwroconego po zapisie.
Zmieniono:
- Poprawiono mapowanie `workerType/type/role` w `workerService.js`, aby `type` w portalu oznaczal widoczny typ pracownika, a `role` pozostala rola systemowa/uprawnieniem.
- Poprawiono filtrowanie, sortowanie i renderowanie typu w Liscie pracownikow tak, aby preferowaly `workerType` zamiast starego `role/type`.
- Poprawiono zakladki konta pracownika po zapisie roli/typu tak, aby lokalny stan, cache i formularze byly od razu aktualizowane nowym typem.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workerService.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/account/index.js`.
- Uruchomiono `npm.cmd run build`; build zakonczyl sie sukcesem z istniejacym ostrzezeniem o duzych chunkach Vite.
Uwagi dla nastepnej osoby:
- Po zapisie typu pracownika UI nie powinien juz czekac na reczne odswiezenie strony; jezeli odczyt Data Connect chwilowo zwroci stary rekord, portal utrzyma backendowo potwierdzona wartosc.

Data: 2026-06-29
Autor: AI Codex
Dodano:
- Dodano kontrolowana diagnostyke lokalnych zapytan SQL dla zapisu profilu pracownika w `index.js`, z etykietami krokow typu `update-worker-profile-row` i `rename-worker-finalize-new-row`.
- Dodano mapowanie bledow SQLSTATE `42P08` i `42P18` na czytelny blad `DB_QUERY_PARAMETER_ERROR`, aby nie byly mylone z Firebase Auth.
- Dodano obsluge bledow rate limit Firebase Auth (`429`, `auth/too-many-requests`, `TOO_MANY_ATTEMPTS_TRY_LATER`, `RESOURCE_EXHAUSTED`) z czytelnym komunikatem dla uzytkownika.
Zmieniono:
- Naprawiono lokalna i hostingowa sciezke zapisu pracownikow uzywana przez Liste pracownikow oraz zakladki konta: `/api/auth/provision-worker`, `/api/admin/worker-profile/update`, `/api/admin/worker-password/set`.
- W `web-app/vite.config.js` poprawiono domyslny target proxy dla endpointow worker/admin, zeby sam Vite nie kierowal zapisu na niedzialajacy lokalny backend `8080`, gdy nie jest uruchomiony root dev stack.
- W `scripts/dev-local.js` doprecyzowano wybor lokalnego trybu `WORKER_PROFILE_MODE` i `WORKER_PROFILE_STORAGE_MODE`, tak aby root `npm run dev` uzywal lokalnej bazy, a web-only dev mogl bezpiecznie proxy do hostingu.
- W `index.js` ograniczono Firebase REST `signUp` jako fallback lokalny; produkcyjna sciezka tworzenia/edycji kont pracownikow ma uzywac Firebase Admin SDK.
- W `index.js` poprawiono zapis profilu pracownika w Cloud SQL: `role` zapisuje role systemowa, a `worker_type` zapisuje etykiete typu pracownika z UI.
- W `index.js` poprawiono zapytania SQL przy edycji, zmianie loginu, dodawaniu i usuwaniu pracownika przez jawne typowanie parametrow (`::text`, `::boolean`) oraz usuniecie nieuzywanego parametru w kroku `rename-worker-finalize-new-row`.
- W `web-app/apps/portal-web/src/services/workerService.js` zapis pracownika uznaje sukces tylko po otrzymaniu zweryfikowanego `response.data.worker` z backendu i preferuje rekord backendu zamiast optymistycznego payloadu formularza.
- W liscie pracownikow i zakladkach konta wymuszono odswiezanie danych pracownikow po zapisie oraz czyszczenie lokalnych cache, zeby po relogu portal nie wracal do starego rekordu.
- Ograniczono liste wyboru typu pracownika w dodawaniu/edycji do: `ADMIN`, `Koordynator`, `Staly personel na obiekcie`, `Zespol mobilny`.
Usunieto:
- Usunieto mylace komunikaty sugerujace problem z lokalnym `8080/healthz`, gdy request faktycznie szedl do hostingu albo blad pochodzil z bazy danych.
- Usunieto niekontrolowana produkcyjna probe tworzenia kont pracownikow przez klientowy Firebase REST fallback po bledzie Admin SDK.
Testy/sprawdzenia:
- Uruchomiono `node --check index.js`.
- Uruchomiono `node --check scripts/dev-local.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workerService.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/account/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js`.
- Uruchomiono `node --check web-app/vite.config.js`.
- Uruchomiono `npm.cmd run build`; build zakonczyl sie sukcesem z istniejacym ostrzezeniem o duzych chunkach Vite.
- Kilkukrotnie zrestartowano lokalny dev stack `5173/8080` i potwierdzono `http://127.0.0.1:8080/healthz` zwracajace `{"ok":true}`.
Uwagi dla nastepnej osoby:
- Przy dalszym debugowaniu zapisu pracownikow patrz najpierw na etykiete kroku w komunikacie `DB_QUERY_PARAMETER_ERROR`; wskazuje konkretne zapytanie backendu.
- Po zmianach w `index.js` trzeba restartowac root `npm run dev`, bo Vite na `5173` proxyuje do procesu backendu na `8080`.
- Zrodlem prawdy dla danych widocznych po relogu pozostaje rekord pracownika w Data Connect/Cloud SQL, a Firebase Auth jest zrodlem prawdy dla konta auth i hasla.

Data: 2026-06-26
Autor: AI Codex
Dodano:
- Dodano paginowane zapytania Data Connect dla widoku Zdarzenia: `EventsPageForOrg*` oraz `WorkdaysPageForOrg*`.
- Dodano lekkie zapytania fingerprint dla pollingu Zdarzen: `EventsFingerprintForOrg` i `WorkdaysFingerprintForOrg`.
- Dodano indeksy Data Connect/Cloud SQL dla szybkich odczytow `event`, `workday` i fallbackowego `backup_cycle`.
- Dodano migracje SQL `dataconnect/migrations/20260626_events_read_indexes.sql`.
Zmieniono:
- Zoptymalizowano `web-app/apps/portal-web/src/services/workdayService.js`: widok Zdarzenia uzywa teraz szybkiej sciezki z ograniczona paginacja i fallbackiem do starego pelnego pobrania.
- Zoptymalizowano `web-app/apps/portal-web/src/features/events/index.js`: tabela nie czeka na pelne referencje modala, polling nie robi juz pelnego refreshu co 10 sekund bez wykrycia zmiany, a render pracownikow buduje lookup raz na render.
- Dodano cache opcji modala dodawania/edycji zdarzen dla pracownikow, klientow i stref.
- Poprawiono plynnosc panelu dodawania/edycji zdarzen: modal pokazuje sie od razu, pickery maja stan ladowania, lista wynikow jest limitowana, a filtrowanie jest wykonywane lokalnie z cache zamiast przez helper raportow.
- Dodano selektor liczby rekordow na stronie w sekcji Zdarzenia z opcjami 10/25/50/100 i ustawiono domyslnie 25 rekordow.
- Zaktualizowano `web-app/apps/portal-web/src/ui/portalApp.js`, aby przekazywal do sekcji Zdarzenia nowy helper fingerprint.
- Wygenerowano ponownie SDK Data Connect w `web-app/apps/portal-web/src/dataconnect-generated/`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `firebase.cmd dataconnect:sdk:generate`; pierwsza proba pokazala, ze Data Connect uzywa operatorow `ge`/`le`, po poprawce generator zakonczyl sie sukcesem.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workdayService.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/events/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/app/state/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/portalApp.js`.
- Uruchomiono `npm.cmd run build` w `web-app`; build zakonczyl sie sukcesem po optymalizacji tabeli, po poprawce plynnosci panelu edycji oraz po dodaniu selektora liczby rekordow.
Uwagi dla nastepnej osoby:
- Pelny efekt wydajnosciowy w produkcji wymaga deployu Data Connect oraz zastosowania migracji indeksow w Cloud SQL.
- Fast path ma fallback do starego pelnego pobrania, jezeli nowe operacje Data Connect nie sa jeszcze wdrozone albo ograniczony overscan nie wystarczy do bezpiecznego wyniku.
- Eksport PDF/Excel nadal moze wykonywac ciezszy odczyt na zadanie; optymalizacja dotyczy przede wszystkim tabeli, modala i pollingu.

Data: 2026-06-26 15:45 +02:00
Autor: AI Codex
Dodano:
- Dodano zapis operacji administracyjnej usunięcia pięciu wskazanych zleceń z produkcyjnej tabeli `public.task` dla organizacji `bestclean`.
- Przed usunięciem zapisano pełny backup rekordów w `.codex-backups/production-task-delete-2026-06-26T13-21-59-840Z.json`.
Zmieniono:
- Brak zmian w kodzie aplikacji, API, schematach i frontendzie.
Usunięto:
- Z produkcyjnej tabeli `public.task` usunięto rekordy:
  - `fw-order-1781679322264-aaiwho`
  - `fw-order-1781502139199-h0oqnm`
  - `fw-order-1781679395754-k5xgyf`
  - `fw-order-1781946671248-mc68y7`
  - `fw-order-1781946744436-5jo0f6`
Testy/sprawdzenia:
- Przed usunięciem potwierdzono, że dokładnie 5 rekordów istnieje dla `org_id = bestclean`.
- Wykonano test `DELETE ... ROLLBACK`, który potwierdził, że operacja dotyczy dokładnie 5 rekordów.
- Po usunięciu wykonano kontrolny odczyt po tych samych `id_task`; wynik: `remainingCount = 0`.
Uwagi dla następnej osoby:
- Backup zawiera pełne wiersze z `public.task` i jest podstawą do ewentualnego ręcznego odtworzenia rekordów.
- Operacja była wykonana na polecenie użytkownika po potwierdzeniu usunięcia danych produkcyjnych.

Data: 2026-06-26 13:44 +02:00
Autor: AI Codex
Dodano:
- Dodano zasadę sprawdzania zdalnego repozytorium przed rozpoczęciem pracy.
- Dodano wymóg informowania użytkownika, gdy lokalna gałąź jest starsza niż wersja na GitHubie.
Zmieniono:
- Rozszerzono zasady dla AI i checklistę przed zmianami o zakaz opierania dalszych prac na starszym stanie localhosta, jeśli GitHub ma nowszą wersję.
Usunięto:
- Nic.
Testy/sprawdzenia:
- Sprawdzono `git status --short --branch`.
- Sprawdzono, że w `ReadMe.txt` nie było wcześniej równoważnej zasady przez wyszukanie fraz związanych z nowszą wersją, localhostem i GitHubem.
- Nie uruchamiano builda, bo zmiana dotyczy tylko dokumentacji.
Uwagi dla następnej osoby:
- Przed pracą zawsze porównaj lokalną gałąź z remote i nie przywracaj starszego zachowania tylko dlatego, że było widoczne lokalnie.

Data: 2026-06-24
Autor: AI Codex
Dodano:
- zmiana profilu klienta: dodano nowy szeroki naglowek profilu klienta inspirowany przeslana grafika, z metadanymi klienta i akcjami hero.
- Dodano przyciski hero `cpdHeroEditBtn`, `cpdHeroMessageBtn`, `cpdHeroExportBtn` i `cpdHeroMoreBtn`.
Zmieniono:
- Przebudowano uklad szczegolow profilu klienta tak, aby zakladki byly na gorze, a sekcje i tabele mialy jasne karty, fioletowe akcenty i spojny styl.
- Ustawiono pasek pol szybkich informacji profilu klienta w kolejnosci: Koordynator, Miasto, Kontakt glowny, Czestotliwosc uslugi, z ikonami i separatorami jak w referencji.
- Dodano minimalna obsluge przyciskow hero w logice profilu klienta bez zmian API, endpointow, Data Connect ani payloadow.
Usunięto:
- Nic.
Testy/sprawdzenia:
- Sprawdzono skladnie `web-app/apps/portal-web/src/features/clients/profile/index.js` komenda `node --check`.
- Uruchomiono `npm --prefix web-app run lint`.
- Uruchomiono `npm run build`.
- Sprawdzono bilans znacznikow `div` i `article` w `profile-details/template.html` po dopasowaniu paska pol.
- Sprawdzono, ze lokalny Vite odpowiada HTTP 200 pod `http://127.0.0.1:5173`.
- Nie wykonano manualnego sprawdzenia w przegladarce, bo narzedzie Browser nie bylo dostepne w tej sesji.
Uwagi dla następnej osoby:
- Przy kolejnych promptach w ramach tej pracy aktualizuj tylko ten wpis historii dotyczacy zmiany profilu klienta.

Data: 2026-06-24
Autor: AI Codex
Dodano:
- Dodano sekcję "Struktura folderów sekcji i podsekcji".
- Opisano zasadę, że każda główna sekcja portalu ma osobny folder, a podsekcje mają własne podfoldery i pliki.
- Dodano aktualne przykłady folderów dla zleceń, klientów, obiektów, pracowników, ustawień i samodzielnych sekcji.
Zmieniono:
- Rozszerzono dokumentację frontendu o zasady dodawania nowych sekcji/podsekcji i ich rejestracji.
Usunięto:
- Nic.
Testy/sprawdzenia:
- Sprawdzono aktualną strukturę `web-app/apps/portal-web/src/features`.
- Nie uruchamiano builda, bo zmiana dotyczy tylko dokumentacji.
Uwagi dla następnej osoby:
- Przy dodawaniu nowego widoku pamiętaj o spójności folderu, `route`, `viewId`, template, routera i opisu w tym pliku.

Data: 2026-06-24
Autor: AI Codex
Dodano:
- Utworzono główny plik `ReadMe.txt` w root projektu.
- Dodano opis struktury backendu, frontendu, Data Connect, konfiguracji, serwisów i modułów biznesowych.
- Dodano obowiązkową zasadę aktualizowania tego pliku po zmianach w projekcie.
Zmieniono:
- Brak zmian w logice aplikacji, API, schematach i frontendzie.
Usunięto:
- Nic.
Testy/sprawdzenia:
- Sprawdzono, że `ReadMe.txt` nie istniał przed utworzeniem.
- Sprawdzono aktualną strukturę repo, skrypty, endpointy i moduły na podstawie plików projektu.
- Nie uruchamiano builda, bo zmiana dotyczy tylko dokumentacji.
Uwagi dla następnej osoby:
- W chwili tworzenia dokumentu w repo były już zmodyfikowane pliki: `web-app/apps/portal-web/src/features/events/index.js`, `web-app/apps/portal-web/src/features/events/template.html`, `web-app/apps/portal-web/src/index.css`. Ten dokument ich nie zmienia.

Data: 2026-06-26 23:09 +02:00
Autor: AI Codex
Dodano:
- Dodano lekki, opóźniony timer odświeżania podsumowania kreatora zlecenia podczas wpisywania adresu.
- Dodano cache lokalnych podpowiedzi adresów w module zleceń, żeby nie skanować klientów, stref i zleceń przy każdym znaku.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` odciążono obsługę pola `ordersEditLocation`.
- Podczas pisania adresu formularz nie odpala już geokodowania Google i nie przebudowuje całego kreatora po każdym znaku.
- Podpowiedzi Google Maps startują dopiero od 5 znaków i po dłuższym debounce, a źródła lokalne dogrzewają się po wejściu w pole, nie przy każdym `input`.
Usunięto:
- Usunięto ciężkie wywołania `ordersQueueGoogleLocationResolve`, `ordersWarmLocationSources` i natychmiastowe `ordersRenderEditorWizard` z eventu wpisywania adresu.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build` z katalogu głównego projektu; build Vite zakończył się poprawnie.
- Sprawdzono, że lokalny Vite odpowiada HTTP 200 pod `http://127.0.0.1:5173`.
Uwagi dla następnej osoby:
- Nie wykonano pełnego testu manualnego formularza na localhost, bo lokalny portal pokazał ekran logowania; poprawka jest gotowa do sprawdzenia po zalogowaniu lub po wdrożeniu na środowisko testowe.
- Nie wdrażano tej poprawki na produkcję w ramach tego wpisu.

Data: 2026-06-27 07:20 +02:00
Autor: AI Codex
Dodano:
- Dodano lokalny timer symulacji osi czasu pulpitu, wyrównany do pełnych kroków 5-minutowych.
- Dodano lekki polling fingerprintu dzisiejszych zdarzeń i workdayów; pełna synchronizacja pulpitu uruchamia się dopiero po zmianie tokenu.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` czerwona linia osi czasu jest teraz zaokrąglana do 5 minut zamiast do 30 minut.
- W `web-app/apps/portal-web/src/features/dashboard/index.js` postęp zielonych pasków i panel grafiku odświeżają się lokalnie bez czytania bazy.
- W `web-app/apps/portal-web/src/features/dashboard/index.js` usunięto automatyczny pełny refresh pulpitu co 15 minut; zastąpiono go lekkim sprawdzaniem zmian co 60 sekund.
- W `web-app/apps/portal-web/src/ui/layoutTemplate.js` usunięto widoczny tekst o automatycznej synchronizacji co 15 minut.
Usunięto:
- Usunięto użycie stałej `DASHBOARD_REFRESH_INTERVAL_MS` i timera pełnej synchronizacji pulpitu co 15 minut.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/layoutTemplate.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakończył się poprawnie.
Uwagi dla następnej osoby:
- Timer 5-minutowy nie pobiera danych z bazy; renderuje oś na podstawie danych już obecnych w stanie aplikacji.
- Polling fingerprintu czyta tylko mały token dla dzisiejszych zdarzeń i workdayów. Jeśli token się zmieni, dopiero wtedy uruchamia się `refreshDashboardWidgets({ forceRefresh: true, syncWorktimeToken: true, showLoadingOverlay: false })`.
- Zmiana dotyczy portalu desktop, nie aplikacji mobilnej.

Data: 2026-06-27 08:01 +02:00
Autor: AI Codex
Dodano:
- Dodano automatyczny wybór wolnego portu backendu w `scripts/dev-local.js`; jeśli `8080` jest zajęty, lokalny dev stack startuje backend na kolejnym wolnym porcie i przekazuje go do Vite.
- Dodano lokalny fallback TLS dla proxy backendu, gdy używana wersja Node nie obsługuje `--use-system-ca`.
Zmieniono:
- W `scripts/dev-local.js` domyślny tryb `WORKER_PROFILE_MODE` przełącza się na `proxy`, jeśli lokalna konfiguracja DB/Firebase Admin nie jest dostępna.
- W `scripts/dev-local.js` i `web-app/vite.config.js` domyślny target proxy zmieniono z `https://cleanzi-01.web.app` na App Hosting: `https://cleanzi-01--iclean-room.europe-west4.hosted.app`.
- W `web-app/vite.config.js` proxy dla `/api/admin/worker-profile/*` korzysta z tego samego targetu co reszta API, zamiast sztywno trafiać w `http://127.0.0.1:8080`.
- W `web-app/apps/portal-web/src/services/workerService.js` poprawiono komunikat błędu, gdy endpoint zapisu pracownika zwraca stronę HTML 404 zamiast JSON.
Usunięto:
- Usunięto zależność lokalnego zapisu pracownika od stałego portu `8080`, który może być zajęty przez inny projekt.
Testy/sprawdzenia:
- Wykonano `git fetch cleanzi01 main --prune`; lokalny HEAD był zgodny z `cleanzi01/main` przed zmianami (`0 0` w `git rev-list --left-right --count HEAD...cleanzi01/main`).
- Uruchomiono `node --check scripts/dev-local.js`.
- Uruchomiono `node --check web-app/vite.config.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workerService.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakończył się poprawnie.
- Sprawdzono lokalnie `http://127.0.0.1:5173/` - HTTP 200.
- Sprawdzono `http://127.0.0.1:8081/healthz` - HTTP 200.
- Sprawdzono testowy POST bez tokenu do `http://127.0.0.1:5173/api/admin/worker-profile/update`; endpoint zwraca teraz JSON `401 UNAUTHENTICATED`, a nie stronę HTML 404.
Uwagi dla następnej osoby:
- Przyczyną błędu w modalnym formularzu pracownika było proxy trafiające w zły proces na porcie `8080` oraz stary target `cleanzi-01.web.app`; formularz dostawał stronę HTML "Nie znaleziono strony" zamiast odpowiedzi API.
- Nie zmieniano danych pracowników ani czasu pracy w bazie; test zapisu wykonano wyłącznie pustym żądaniem bez tokenu.
- Lokalne uruchomienie po tej zmianie: `npm run dev` z katalogu głównego projektu i adres `http://127.0.0.1:5173/`.

Data: 2026-06-27 09:00 +02:00
Autor: AI Codex
Dodano:
- Dodano przekazywanie `WORKER_PROFILE_STORAGE_MODE` z `scripts/dev-local.js` do lokalnego procesu backendu `index.js`, aby lokalny zapis profilu pracownika faktycznie używał Data Connect, gdy nie ma lokalnej konfiguracji DB.
- Dodano lokalny fallback TLS dla połączeń backendu z Google/Firebase, gdy używana wersja Node nie obsługuje `--use-system-ca` i nie ustawiono `NODE_EXTRA_CA_CERTS`.
Zmieniono:
- W `index.js` zapis profilu pracownika przez Data Connect używa kanonicznego loginu odczytanego z bazy, a nie wielkości liter z formularza. Naprawia to przypadek, w którym formularz pokazywał `Orzol`, a zapis powinien trafić w rekord loginu z bazy.
- W `index.js` zwykła zmiana typu pracownika używa mutacji `UpdateWorkerForOrg`, a nie ścieżki `UpdateWorkerProfileForOrg` z aktualizacją `organizationMember`, jeśli nie synchronizujemy roli konta administracyjnego.
- W `web-app/apps/portal-web/src/services/workerService.js` uaktualniono komunikat `FIREBASE_TLS_CERT_ERROR`, żeby odpowiadał aktualnemu zachowaniu `dev-local.js`.
Usunięto:
- Usunięto tymczasowy log diagnostyczny z zapisu pracownika po potwierdzeniu przyczyny błędu.
Testy/sprawdzenia:
- Uruchomiono `node --check index.js`.
- Uruchomiono `node --check scripts/dev-local.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workerService.js`.
- Uruchomiono `git diff --check`; brak błędów whitespace, widoczne tylko ostrzeżenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakończył się poprawnie.
- Uruchomiono lokalny dev stack przez `npm run dev`; backend wystartował na `http://127.0.0.1:8081`, Vite na `http://127.0.0.1:5173`.
- Potwierdzono w logach `worker-profile -> local (local dataconnect storage)` oraz poprawny test TLS do Firebase w lokalnym trybie awaryjnym.
- Przez UI zmieniono pracownika `Agnieszka Orzoł` (`W051`) z typu `Pracownik` na `Zespół mobilny` na wyraźne polecenie użytkownika.
- Po pełnym odświeżeniu listy pracowników z bazy potwierdzono, że `Agnieszka Orzoł` nadal widnieje jako `Zespół mobilny`.
Uwagi dla następnej osoby:
- Nie zmieniano czasu pracy ani zdarzeń pracownika. Zmieniono wyłącznie typ/rolę profilu wskazanego pracownika.
- Lokalny fallback `NODE_TLS_REJECT_UNAUTHORIZED=0` jest tylko obejściem dla dev stacka na tym komputerze. Docelowo lepiej dodać firmowy certyfikat CA przez `NODE_EXTRA_CA_CERTS`, jeśli środowisko przechwytuje TLS.
- Przywrócenie stanu danych dla Agnieszki Orzoł: w module `Pracownicy -> Lista pracowników` wyszukaj `Agnieszka Orzoł`, edytuj profil i ustaw typ z powrotem na `Pracownik`.

Data: 2026-06-27 09:35 +02:00
Autor: AI Codex
Dodano:
- Dodano wpis diagnostyczny dla zmiany wyswietlania typu pracownika na liscie pracownikow.
Zmieniono:
- W `web-app/apps/portal-web/src/services/workerService.js` mapowanie pracownika preferuje teraz `workerType` jako pole wyswietlane `type`, a `role` zostawia jako osobne pole roli/uprawnien.
- W `web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js` lista, filtr, wyszukiwarka, porownanie optymistycznego zapisu i modal edycji preferuja `workerType` przed `type` i `role`.
- Przez UI potwierdzono, ze `Justyna Smolka` (`W047`) pokazuje sie jako `Staly personel na obiekcie`; wczesniej lista pokazywala `Koordynator`, bo brala pole `role` zamiast `workerType`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workerService.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js`.
- Odwiezono lokalny portal `http://127.0.0.1:5173`, wyszukano `Justyna Smolka` i potwierdzono wiersz `Staly personel na obiekcie`.
- Proba sprawdzenia GitHub przez `git fetch cleanzi01 main --prune` oraz `git ls-remote cleanzi01 refs/heads/main` przekroczyla timeout; nie potwierdzono swiezej synchronizacji remote w tej sesji.
Uwagi dla nastepnej osoby:
- Problem nie dotyczy czasu pracy ani zdarzen. Dotyczy rozdzielenia pola biznesowego `workerType` od pola `role`.
- Jesli inne widoki nadal pokazuja role zamiast typu pracownika, sprawdz kolejnosc fallbackow `workerType -> type -> role`.

Data: 2026-06-29 08:08 +02:00
Autor: AI Codex
Dodano:
- Dodano priorytet sortowania pracownikow na osi kalendarza w `web-app/apps/portal-web/src/features/calendar/index.js`.
Zmieniono:
- W `calendarTimelineResources()` pracownicy typu mobilnego (`workerType/type/role` zawiera `mobil` albo `zespol`) wyswietlaja sie przed reszta.
- Koordynatorzy (`workerType/type/role` zawiera `koord` albo `coordinator`) wyswietlaja sie po pracownikach mobilnych, ale przed pozostalymi osobami.
- W kazdej grupie zostawiono sortowanie alfabetyczne po nazwisku/imieniu.
- Sygnatura cache zasobow kalendarza uwzglednia teraz `workerType/type/role`, zeby zmiana typu pracownika odswiezala kolejnosc bez cofania danych.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Proba `git fetch cleanzi01 main --prune` przekroczyla timeout; nie wykonano merge ani resetu.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko kolejnosci wyswietlania w kalendarzu. Nie zmienia danych pracownikow, zlecen, czasu pracy ani zdarzen.
- Przywrocenie poprzedniego sortowania: usunac helper `calendarTimelineWorkerSortPriority`, usunac pole typu z `calendarTimelineWorkersCacheSignature` i przywrocic sortowanie tylko po `first.name.localeCompare(...)`.

Data: 2026-06-29 08:43 +02:00
Autor: AI Codex
Dodano:
- Dodano wizualne oznaczenia typu pracownika na osi kalendarza w `web-app/apps/portal-web/src/features/calendar/index.js`.
- Dodano style dla oznaczen w `web-app/apps/portal-web/src/index.css`.
Zmieniono:
- Pracownicy mobilni dostaja jasne turkusowe tlo w lewej kolumnie, cienki pasek po lewej i badge `MOB`.
- Koordynatorzy dostaja jasne fioletowe tlo w lewej kolumnie, cienki pasek po lewej i badge `KOO`.
- Tlo osi czasu dla takich wierszy jest delikatnie zabarwione, zeby typ pracownika byl widoczny na pierwszy rzut oka bez zaslaniania paskow zadan.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Sprawdzono lokalny Vite pod `http://127.0.0.1:5173/`; odpowiedz HTTP 200.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko wygladu kalendarza. Nie zmienia danych pracownikow, zlecen, czasu pracy ani zdarzen.
- Przywrocenie poprzedniego wygladu: usunac helper `calendarTimelineWorkerTypeBadge`, klasy `is-worker-type-*` oraz style `.fw-resource-type-badge*`, `.fw-resource-name.is-worker-type-*`, `.fw-grid-row--worker-*`.

Data: 2026-06-29 08:53 +02:00
Autor: AI Codex
Dodano:
- Dodano status kolorystyczny bezposrednio na badge typu pracownika w osi kalendarza.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` badge `MOB`/`KOO` dostaje klase statusu na podstawie `resource.started`.
- Dla pracownikow z badge `MOB`/`KOO` usunieto osobna zielona/czerwona kropke statusu, zeby nie dublowac informacji.
- W `web-app/apps/portal-web/src/index.css` zielony/czerwony status jest teraz pokazany kolorem badge.
- Poszerzono lewa kolumne zasobow kalendarza z `190px` do `260px`; ten sam wymiar ustawiono w `data-calendar-timeline-resource-width`, zeby obliczenia drag/drop nadal trafialy w poprawna kolumne czasu.
Usunieto:
- Nic globalnie; ukryto tylko kropke statusu dla wierszy posiadajacych badge typu pracownika.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Sprawdzono lokalny Vite pod `http://127.0.0.1:5173/`; odpowiedz HTTP 200.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko wygladu i wymiaru lewej kolumny kalendarza. Nie zmienia danych pracownikow, zlecen, czasu pracy ani zdarzen.
- Przywrocenie poprzedniej szerokosci: cofnac `260px` do `190px` w CSS gridu, fallbacku `resourceWidth` i atrybucie `data-calendar-timeline-resource-width`.

Data: 2026-06-29 09:02 +02:00
Autor: AI Codex
Dodano:
- Doprecyzowano uklad badge `MOB`/`KOO` w lewej kolumnie osi kalendarza.
Zmieniono:
- W `web-app/apps/portal-web/src/index.css` label pracownika zajmuje cala dostepna szerokosc, a badge `MOB`/`KOO` jest dociagany do prawej strony komorki.
- Nazwa pracownika pozostaje elastyczna i ucina sie dopiero przed badge, zamiast przesuwac badge zaraz za tekstem.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Sprawdzono lokalny Vite pod `http://127.0.0.1:5173/`; odpowiedz HTTP 200.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko CSS kalendarza. Nie zmienia danych ani logiki sortowania.
- Przywrocenie poprzedniego ukladu: usunac `width:100%` z `.fw-resource-label-main`, `margin-left:auto` z `.fw-resource-type-badge` i `flex:1 1 auto` z `.fw-resource-label`.

Data: 2026-06-29 09:04 +02:00
Autor: AI Codex
Dodano:
- Dodano typ `site` dla pracownikow typu `Staly personel na obiekcie` na osi kalendarza.
- Dodano badge `STA` oraz osobny odcien wiersza dla stalego personelu na obiekcie.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` sortowanie pracownikow uwzglednia teraz kolejnosc: mobilni, koordynatorzy, staly personel na obiekcie, pozostali.
- W `web-app/apps/portal-web/src/index.css` dodano style `is-worker-type-site`, `fw-resource-type-badge--site` i `fw-grid-row--worker-site`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Sprawdzono lokalny Vite pod `http://127.0.0.1:5173/`; odpowiedz HTTP 200.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko wygladu i kolejnosci wyswietlania w kalendarzu. Nie zmienia danych pracownikow, zlecen, czasu pracy ani zdarzen.
- Przywrocenie poprzedniego zachowania: usunac rozpoznawanie `site`, badge `STA` i style `.is-worker-type-site`, `.fw-resource-type-badge--site`, `.fw-grid-row--worker-site`.

Data: 2026-06-29 09:13 +02:00
Autor: AI Codex
Dodano:
- Dodano typ `admin` dla pracownikow z rola/uprawnieniem admina na osi kalendarza.
- Dodano badge `ADM` oraz osobny odcien wiersza dla administratorow.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` rozpoznawanie typu pracownika czyta teraz lacznie `workerType`, `type`, `role`, `profileRole`, `permissions` i `permission`, zeby wykryc tez admina.
- Sortowanie pracownikow uwzglednia teraz kolejnosc: mobilni, koordynatorzy, staly personel na obiekcie, admini, pozostali.
- W `web-app/apps/portal-web/src/index.css` dodano style `is-worker-type-admin`, `fw-resource-type-badge--admin` i `fw-grid-row--worker-admin`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Sprawdzono lokalny Vite pod `http://127.0.0.1:5173/`; odpowiedz HTTP 200.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko wygladu i kolejnosci wyswietlania w kalendarzu. Nie zmienia danych pracownikow, zlecen, czasu pracy ani zdarzen.
- Przywrocenie poprzedniego zachowania: usunac rozpoznawanie `admin`, badge `ADM` i style `.is-worker-type-admin`, `.fw-resource-type-badge--admin`, `.fw-grid-row--worker-admin`.

Data: 2026-06-29 09:30 +02:00
Autor: AI Codex
Dodano:
- Dodano bezpieczne fallbacki dla helperow Kanban w `web-app/apps/portal-web/src/ui/portalApp.js`, uzywane zanim feature Kanban zostanie zaladowany.
Zmieniono:
- `kanbanColumnsForStatus`, `kanbanNewTaskStatus`, `kanbanDefaultStatusForTask`, `kanbanNormalizeColumnScope`, `kanbanTaskIsCompleted`, `kanbanInitials`, `kanbanSetDataLoading`, `kanbanColumnLabel`, `kanbanNormalizeStatus` i `kanbanCurrentUserOption` nie rzucaja juz bledu podczas synchronizacji zadan kalendarza przed inicjalizacja Kanban.
- Synchronizacja zadan kalendarza i pulpit moga teraz dzialac niezaleznie od kolejnosci zaladowania widoku Kanban.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/portalApp.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/ui/portalApp.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana nie modyfikuje danych, zlecen, zdarzen ani czasu pracy. Dotyczy tylko odpornosci helperow UI na lazy-loading Kanban.
- Przywrocenie poprzedniego zachowania: usunac `KANBAN_FALLBACK_COLUMNS`, funkcje `fallbackKanban*` oraz przywrocic bezposrednie wywolania `getKanbanFeature()` w wymienionych wrapperach.

Data: 2026-06-29 10:10 +02:00
Autor: AI Codex
Dodano:
- Dodano walidacje dat i godzin zlecenia bezposrednio w kroku `Zmiany i osoby` kreatora zlecen.
Zmieniono:
- Usunieto osobna zakladke/krok `Termin` z formularza dodawania i edycji zlecenia.
- Przeniesiono panele trybu, dat, godzin, zgody na wydluzenie pracy oraz dni dostepu pod krok `Zmiany i osoby`.
- Stare odwolanie do kroku `schedule` jest mapowane na `staffing`, zeby nie blokowac istniejacych przejsc w UI.
Usunieto:
- Widoczny krok `2 Termin` z listy krokow kreatora; numeracja pozostalych krokow to teraz 1-4.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js web-app/apps/portal-web/src/features/orders/list/template.html`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono w LH `http://localhost:5173/`, ze kreator nie ma juz targetu/panelu `schedule`, a widoczne kroki to `Klient i adres`, `Zmiany i osoby`, `Cyklicznosc`, `Opis i podsumowanie`.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko ukladu i walidacji kreatora zlecen. Nie zmienia danych zlecen, pracownikow, czasu pracy ani backendu.
- Przywrocenie poprzedniego ukladu: dodac z powrotem krok `schedule` w `ORDERS_EDITOR_STEPS`, przywrocic przycisk `Termin` w `list/template.html` i przepiac panele terminu z `staffing` na `schedule`.

Data: 2026-06-29 10:30 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` przycisk `OK` w pickerze czasu po zatwierdzeniu wartosci rozfokusowuje pole (`blur`) zamiast ponownie ustawic na nim fokus.
- Dzięki temu picker czasu nie otwiera sie ponownie po zatwierdzeniu wyboru przyciskiem `OK`.
Usunieto:
- Usunieto ponowne `focus()` na polu czasu po kliknieciu `OK`.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Proba automatycznego klikniecia w LH nie doszla do skutku, bo aktualny stan formularza po reloadzie mial pole czasu w DOM z rozmiarem `0x0`; kodowa przyczyna ponownego otwierania pickera zostala usunieta.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko zachowania pickera czasu w formularzu zlecen. Nie zmienia danych zlecen, czasu pracy, pracownikow ani backendu.
- Przywrocenie poprzedniego zachowania: w `ordersApplyTimePickerSelection` zamienic `input.blur()` z powrotem na `input.focus({ preventScroll: true })`.

Data: 2026-06-29 10:48 +02:00
Autor: AI Codex
Dodano:
- Dodano walidacje ustawien cyklicznosci bezposrednio w kroku `Zmiany i osoby`, gdy zlecenie ma tryb cykliczny.
Zmieniono:
- Usunieto osobna zakladke/krok `Cyklicznosc` z kreatora dodawania i edycji zlecenia.
- Panel ustawien cyklicznosci zostal podpiety pod krok `Zmiany i osoby`.
- Stare odwolania do kroku `recurrence` sa mapowane na `staffing`, zeby nie blokowac istniejacych przejsc w UI.
Usunieto:
- Usunieto przycisk kroku `Cyklicznosc` z `web-app/apps/portal-web/src/features/orders/list/template.html`.
- Usunieto martwa walidacje starego kroku `recurrence` z `web-app/apps/portal-web/src/features/orders/index.js`.
Testy/sprawdzenia:
- Uruchomiono `rg` i potwierdzono brak `data-orders-step-target="recurrence"`, `data-orders-step-panel="recurrence"`, `id: 'recurrence'` oraz `step === 'recurrence'`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js web-app/apps/portal-web/src/features/orders/list/template.html`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko ukladu i walidacji kreatora zlecen. Nie zmienia danych zlecen, pracownikow, czasu pracy ani backendu.
- Automatyczna proba odswiezenia LH w przegladarce przekroczyla limit czasu, wiec weryfikacja UI opiera sie na kodzie i buildzie.
- Przywrocenie poprzedniego ukladu: dodac z powrotem krok `recurrence` w `ORDERS_EDITOR_STEPS`, przywrocic przycisk `Cyklicznosc` w `list/template.html`, przepiac panel `ordersScheduleRepeatPanel` z `staffing` na `recurrence` i przywrocic walidacje starego kroku.

Data: 2026-06-29 11:10 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W kreatorze zlecen w `web-app/apps/portal-web/src/features/orders/list/template.html` usunieto widoczny panel `Dni dostepu i wyjatki`.
- W `web-app/apps/portal-web/src/features/orders/index.js` edytor nie korzysta juz ze starych ukrytych `accessWindows` jako ograniczenia dni/godzin.
- Wybor dni w zmianach bazuje teraz na dniach cyklicznosci i zmianach, a nie na tabeli dostepu do obiektu.
- Przy zapisie zlecenia czyszczone sa szczegolowe pola `accessWindows`, `objectAccessWindows`, `accessTimeWindows` i `buildingAccessWindows`.
Usunieto:
- Usunieto nieuzywana obsluge renderowania, dodawania, usuwania i zdarzen dla wierszy `Dni dostepu i wyjatki`.
Testy/sprawdzenia:
- Uruchomiono `rg` i potwierdzono brak widocznych identyfikatorow `ordersAccessWindowsPanel`, `ordersAccessWindowRows`, `ordersAccessWindowAdd`, `data-orders-access-window` oraz tekstu `Dni dost` w szablonie i logice formularza.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js web-app/apps/portal-web/src/features/orders/list/template.html`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy formularza zlecen i usuwa dodatkowa warstwe dostepnosci obiektu. Dni/godziny realizacji maja wynikac ze zmian i ustawien cyklicznosci.
- Przywrocenie poprzedniego ukladu: przywrocic blok `ordersAccessWindowsPanel` w `list/template.html`, funkcje renderowania/obslugi `ordersAccessWindow*` w `index.js`, ponownie wywolywac `ordersRenderAccessWindowsControls` i zapisywac `ordersEnsureAccessWindowsFromControls(order)` dla zlecen cyklicznych.

Data: 2026-06-29 11:38 +02:00
Autor: AI Codex
Dodano:
- Dodano pomocnicze funkcje `ordersServiceBlocksTotals` i `ordersServiceBlocksWorkerSummary`, zeby podsumowanie kreatora zlecen liczylo RBH, liczbe osob i obsade z kafelkow zmian.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/list/template.html` krok `Zmiany i osoby` zaczyna sie teraz bezposrednio od kafelkow zmian.
- W `web-app/apps/portal-web/src/features/orders/index.js` podsumowanie kreatora i podglad cyklicznosci korzystaja z `serviceBlocks` zamiast z usunietych globalnych pol pracownika/RBH/liczby osob.
- Usunieto instrukcyjny pasek nad kafelkami zmian, zeby nie tworzyc dodatkowego modulu nad lista zmian.
Usunieto:
- Usunieto z formularza zlecen gorny modul `Zespoly i zmiany` z globalnym wyborem `Pracownik/pracownicy`.
- Usunieto globalne pola `Wymagany czas pracy (rbh)` i `Liczba osob do obsadzenia` oraz opis o przypisywaniu do BUFORU.
Testy/sprawdzenia:
- Uruchomiono `rg` i potwierdzono brak usunietych tekstow/ID w `web-app/apps/portal-web/src/features/orders/list/template.html`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js web-app/apps/portal-web/src/features/orders/list/template.html`; sa tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko kreatora zlecen w portalu. Nie zmienia backendu, danych pracownikow, zdarzen ani aplikacji mobilnej.
- Zrodlem prawdy dla godzin, RBH i obsady w formularzu pozostaja kafelki zmian (`serviceBlocks`).
- Przywrocenie poprzedniego ukladu: odtworzyc w `list/template.html` blok z `ordersEditWorker`, `ordersEditWorkHours`, `ordersEditRequiredPeople` i `ordersWorkloadHint`, a w `index.js` przywrocic podsumowanie kreatora oparte o te pola oraz pasek `.orders-service-blocks-hint`.

Data: 2026-06-29 12:06 +02:00
Autor: AI Codex
Dodano:
- Dodano pomocnicza funkcje `ordersRepeatWeekdaysFromServiceBlocks`, zeby dni cyklu byly wyliczane z kafelkow zmian.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` walidacja i zapis zlecen cyklicznych nie wymagaja juz osobnych pol `Powtarza sie`, `Co`, `W nastepujace dni` ani `Wzorzec tygodnia`.
- Domyslny zapis cyklicznosci po usunieciu selektora powtarzania traktuje zlecenie cykliczne jako tygodniowe, a konkretne dni bierze z kafelkow zmian.
- Podglad i zapis nie buduja juz `weeklyScheduleRules` ze starego formularza wzorca tygodnia; zrodlem pozostaja `serviceBlocks`.
Usunieto:
- Z `web-app/apps/portal-web/src/features/orders/list/template.html` usunieto caly widoczny panel `ordersScheduleRepeatPanel`, w tym:
  `ordersEditRepeatPreset`, `ordersEditRepeatEvery`, `ordersEditRepeatUnit`, checkboxy dni tygodnia, `ordersWeeklyPatternPanel` oraz kalendarz podgladu powtarzania.
Testy/sprawdzenia:
- Uruchomiono `rg` i potwierdzono brak tekstow/ID usunietego modulu w `web-app/apps/portal-web/src/features/orders/list/template.html`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js web-app/apps/portal-web/src/features/orders/list/template.html`; sa tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Proba automatycznej weryfikacji w przegladarce LH przekroczyla limit czasu narzedzia, wiec nie wykonano zapisu ani dalszych klikniec w formularzu.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko kreatora zlecen w portalu. Nie zmienia backendu, danych pracownikow, zdarzen ani aplikacji mobilnej.
- Od tej zmiany dni, godziny, RBH i obsada cyklicznosci maja byc ustawiane w kafelkach zmian (`serviceBlocks`).
- Przywrocenie poprzedniego ukladu: odtworzyc blok `ordersScheduleRepeatPanel` w `list/template.html`, przywrocic renderowanie `ordersRenderWeeklyPatternControls(order)` w synchronizacji harmonogramu oraz ponownie budowac `weeklyRules` przez `ordersWeeklyPatternRulesFromControlsForWeekdays`.

Data: 2026-06-29 15:18 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` brak pola `ordersEditAllowExtendedWork` oznacza teraz zawsze `false`, czyli zapis zlecenia nie wlacza mozliwosci wydluzania czasu pracy.
Usunieto:
- Z `web-app/apps/portal-web/src/features/orders/list/template.html` usunieto sekcje z checkboxem `Pracownik moze wydluzyc czas pracy, jesli sytuacja na obiekcie tego wymaga`.
Testy/sprawdzenia:
- Uruchomiono `rg` i potwierdzono brak `ordersEditAllowExtendedWork`, `Pracownik moze wydluzyc`, `wydluzyc czas pracy` oraz `orders-extended-work-toggle` w szablonie formularza zlecen.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/orders/index.js web-app/apps/portal-web/src/features/orders/list/template.html`; sa tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko kreatora zlecen w portalu. Nie zmienia backendu, zdarzen ani aplikacji mobilnej.
- Przywrocenie opcji: odtworzyc label `.orders-extended-work-toggle` z inputem `ordersEditAllowExtendedWork` w `list/template.html` i w `ordersReadExtendedWorkAllowed` ponownie uzyc fallbacku `ordersExtendedWorkAllowed(order)`.

Data: 2026-06-30 09:16 +02:00
Autor: AI Codex
Dodano:
- Dodano przekazanie intencji `workday-day-editor` z dymka pulpitu `Nie zamkniete START-STOP` do konta pracownika.
- Dodano w koncie pracownika obsluge `workerAccountPendingTimeEditor`, ktora ustawia filtr czasu na wskazany dzien i po zaladowaniu tabeli otwiera istniejace okno `Edycja dnia pracy`.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` klik osoby z metryki `openStartStopYesterday` nie otwiera juz ogolnej historii zdarzen, tylko przechodzi do `workerAccount`, zakladki `time`, dla konkretnego pracownika i daty.
- W `web-app/apps/portal-web/src/features/workers/account/index.js` tabela czasu pracy potrafi po zaladowaniu automatycznie otworzyc modal edycji dnia, bez automatycznego zapisu danych.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/account/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/dashboard/index.js web-app/apps/portal-web/src/features/workers/account/index.js`; sa tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop. Nie zmienia aplikacji mobilnej, backendu ani samych danych czasu pracy.
- Przywrocenie poprzedniego zachowania: usunac pola `action/dayKey/workerLogin/workerName/workdayId` z `openStartStopYesterdayIssues`, usunac helpery `openDashboardWorkdayDayEditor` i powiazane funkcje wyszukiwania pracownika w dashboardzie, a w `openDashboardMetricDetail` zostawic tylko wywolanie `openEventHistoryFromRow`. W koncie pracownika usunac obsluge `workerAccountPendingTimeEditor` oraz wywolania `maybeOpenWorkerAccountPendingTimeEditor`.

Data: 2026-06-30 09:32 +02:00
Autor: AI Codex
Dodano:
- Dodano lokalna aktualizacje tabeli czasu pracy po zapisie popupu `Edycja dnia pracy` w koncie pracownika.
- Dodano helpery w `web-app/apps/portal-web/src/features/workers/account/index.js`, ktore buduja swiezy rekord Workday z odpowiedzi zapisu i podmieniaja go w aktualnym widoku tabeli.
Zmieniono:
- Po zapisie manualnej korekty dnia pracy widok nie wykonuje juz natychmiastowego `refreshTimeTab()`, ktory mogl wczytac jeszcze stary stan z backendu/cache i pokazac nieaktualne dane.
- Popup po zapisie zamyka sie, a tabela `Czas pracy`, karta sumy miesiaca i podsumowanie konta sa aktualizowane wynikiem zapisu.
Usunieto:
- Usunieto z tej sciezki natychmiastowe wymuszone pobranie czasu pracy po zapisie popupu.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/account/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/workers/account/index.js`; jest tylko ostrzezenie CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i ekranu konta pracownika, zakladki `Czas pracy`.
- Nie zmieniano aplikacji mobilnej, backendu ani modelu danych Workday.
- Przywrocenie poprzedniego zachowania: w `saveWorkerAccountDayEditor` usunac zbieranie `updatedRows`, usunac wywolanie `applyWorkerAccountLocalWorkdayUpdates(updatedRows, worker)`, przywrocic czyszczenie `workerAccountTimeLoadedKey`/`workerAccountTimeLoadingKey` oraz `await refreshTimeTab()`, a nastepnie usunac helpery `workerAccountWorkdayId`, `workerAccountUpdatedWorkdayRow` i `applyWorkerAccountLocalWorkdayUpdates`.

Data: 2026-06-30 11:40 +02:00
Autor: AI Codex
Dodano:
- Utworzono bezpieczna galaz integracyjna `codex/pre-prod-sync-20260630-112213` oparta o aktualny `cleanzi01/main`.
- Utworzono zewnetrzna kopie stanu sprzed integracji w `C:\Users\rafal\Desktop\app-to-react-backups\pre-prod-sync-20260630-112144`.
- Utworzono stash awaryjny `stash@{0}: pre-prod-sync-20260630-112213`.
Zmieniono:
- Przeniesiono dotychczasowe lokalne zmiany portalu na najnowszy stan z GitHub `cleanzi01/main`, ktory zawieral nowsze poprawki profilu pracownika.
- Rozwiazano konflikty po synchronizacji w `index.js`, `scripts/dev-local.js`, `web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js`, `web-app/apps/portal-web/src/services/workerService.js` oraz `web-app/vite.config.js`.
- Zachowano nowsza logike zapisu profilu pracownika z `main` oraz lokalne uzupelnienia dotyczace typow pracownikow, proxy lokalnego backendu i konfiguracji TLS/CA.
Usunieto:
- Nic. Nie wykonano commita, pusha ani deploya.
Testy/sprawdzenia:
- Uruchomiono `node --check` dla kluczowych plikow backendu, dev-local, kalendarza, pulpitu, zlecen, konta pracownika, listy pracownikow, serwisu pracownikow, layoutu portalu i konfiguracji Vite.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono odpowiedz HTTP 200 dla lokalnego `localhost:5173` oraz produkcji `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`.
Uwagi dla nastepnej osoby:
- To jest etap przygotowania do oceny produkcyjnej, nie wdrozenie.
- Przed deployem trzeba jeszcze wykonac reczny smoke test w przegladarce: Pulpit, Kalendarz, Lista zlecen, Dodaj/Edycja zlecenia, Lista pracownikow i Konto pracownika/Czas pracy.
- Powrot do punktu sprzed integracji: uzyc zewnetrznej kopii z `C:\Users\rafal\Desktop\app-to-react-backups\pre-prod-sync-20260630-112144` albo stash `stash@{0}`.

Data: 2026-06-30 12:18 +02:00
Autor: AI Codex
Dodano:
- Dodano liczenie metryki pulpitu `Nie zamkniete START-STOP` bezposrednio z otwartych rekordow `workdays`.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` dymek `Nie zamkniete START-STOP` nie jest juz budowany z historycznych `events`, ktore moga zawierac stary event START mimo zamknietego dnia pracy.
- Historia `events` zostaje nadal uzyta dla metryki `Nie zamkniete CLEAN`.
- W tle `dashboardRefreshBackgroundData` przekazuje `forceRefresh` do pobierania historycznych otwartych `workdays`, zeby reczne `Synchronizuj teraz` omijalo lokalny cache.
Usunieto:
- Usunieto dopisywanie osob do `Nie zamkniete START-STOP` na podstawie braku STOP w historycznych `events`.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/dashboard/index.js`; pozostalo tylko ostrzezenie CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i pulpitu.
- Nie zmienia aplikacji mobilnej, backendu ani danych czasu pracy.
- Jesli trzeba przywrocic poprzednie zachowanie, w `dashboardBuildSummary` nalezy znowu budowac `openStartStopYesterdayIssues` w petli po `historicalBuckets` z `events`, ale to moze ponownie pokazywac zamkniete juz dni jako otwarte.

Data: 2026-06-30 12:50 +02:00
Autor: AI Codex
Dodano:
- Dodano sygnal `portal:workday-updated` po zapisie popupu `Edycja dnia pracy` w koncie pracownika.
- Dodano flage stanu `dashboardForceRefreshOnNextOpen`, ktora wymusza swieze pobranie Pulpitu po korekcie Workday.
Zmieniono:
- Po zapisaniu recznej korekty dnia pracy czyszczony jest lokalny snapshot Pulpitu i oznaczane sa dane Pulpitu jako nieaktualne.
- Router portalu po powrocie na `Pulpit` omija cache tylko po zmianie Workday, dzieki czemu licznik `Nie zamkniete START-STOP` ma zostac przeliczony z bazy.
- Jesli korekta Workday zostanie wykonana, gdy uzytkownik jest juz na Pulpicie, Pulpit uruchamia ciche wymuszone odswiezenie.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/workers/account/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/portalApp.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/app/state/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/workers/account/index.js web-app/apps/portal-web/src/ui/portalApp.js web-app/apps/portal-web/src/app/state/index.js`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i odswiezania Pulpitu po manualnej korekcie Workday.
- Nie zmieniano aplikacji mobilnej ani danych pracownikow.
- Przywrocenie poprzedniego zachowania: usunac `dashboardForceRefreshOnNextOpen` ze stanu, usunac `notifyWorkerAccountWorkdayChanged` i jego wywolanie w `saveWorkerAccountDayEditor`, usunac `markDashboardRouteStale`, obsluge `portal:workday-updated` oraz uzycie `forceDashboardRefresh` w `syncRouteDataNow`.

Data: 2026-06-30 14:51 +02:00
Autor: AI Codex
Dodano:
- Dodano zakres analizy bledow Pulpitu obejmujacy biezacy i poprzedni miesiac.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` metryki `Nie zamkniete START-STOP`, `Nie zamkniete CLEAN` oraz `CLEAN > 1,5h` sa liczone tylko dla okresu od pierwszego dnia poprzedniego miesiaca do dzis.
- Odczyt otwartych Workday dla `Nie zamkniete START-STOP` dostal `fromIso` z poczatku poprzedniego miesiaca, zeby nie zaciagac starszych historycznych wpisow.
- Szybki odczyt Pulpitu i odswiezanie w tle pobieraja osobny zakres eventow dla bledow systemu, a komentarze/zadania zostaja na krotszym zakresie synchronizacji.
Usunieto:
- Usunieto ograniczenie `CLEAN > 1,5h` tylko do dzisiaj i wczoraj.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/dashboard/index.js`; pozostalo tylko ostrzezenie CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i sekcji `Bledy w systemie` na Pulpicie.
- Nie zmieniano aplikacji mobilnej ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helper `dashboardSystemIssueRangeFrom`, usunac `fromIso` z `dashboardLoadHistoricalOpenWorkdays`, wrocic w `dashboardLoadFastRows` do pobierania eventow od `daysAgoYmd(1)`, w `dashboardRefreshBackgroundData` ponownie uzyc jednego `recentEvents` do summary, a `CLEAN > 1,5h` ograniczyc do `today` i `yesterday`.

Data: 2026-06-30 15:02 +02:00
Autor: AI Codex
Dodano:
- Dodano dodatkowe rozpoznawanie zamknietego dnia pracy dla metryki `Nie zamkniete START-STOP` na Pulpicie.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` rekord Workday nie trafia juz do `Nie zamkniete START-STOP`, jesli ma jakikolwiek wiarygodny STOP: `endAt`, `dayEndAt`, `qrStop`, `stop`, `stopTime`, `endTime`, `closeMarkedAt`, status `CLOSED` albo powody zamkniecia `WORKDAY_STOP`, `STOP_END_DAY`, `MANUAL_CLOSE`.
- Dodano dopasowanie zamknietych i otwartych rekordow po identyfikatorach oraz po kluczu pracownik+dzien+start, zeby zamkniety rekord z innego zrodla danych mogl usunac falszywy wpis z listy bledow.
- Podbito `DASHBOARD_LOCAL_CACHE_VERSION` z `1` do `2`, zeby przegladarka odrzucila stare snapshoty Pulpitu z poprzednim wynikiem bledow.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/features/dashboard/index.js`; pozostalo tylko ostrzezenie CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i licznika/tooltipa `Nie zamkniete START-STOP`.
- Nie zmieniano aplikacji mobilnej ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helpery `dashboardRowHasWorkdayStop`, `dashboardOpenStartStopMatchKeys`, `dashboardClosedStartStopKeys`, `dashboardRowMatchesClosedStartStop`, usunac ich uzycie w `dashboardBuildSummary` i obnizyc `DASHBOARD_LOCAL_CACHE_VERSION` tylko jesli nie trzeba invalidowac snapshotow.

Data: 2026-06-30 15:38 +02:00
Autor: AI Codex
Dodano:
- Dodano bramke `VITE_ENABLE_DATACONNECT_FINGERPRINT` dla lekkich fingerprintow zdarzen/workdayow.
Zmieniono:
- W `web-app/apps/portal-web/src/services/workdayService.js` `getEventsFingerprintForOrg` nie wywoluje domyslnie operacji `EventsFingerprintForOrg` i `WorkdaysFingerprintForOrg`, bo zdalny connector moze jeszcze ich nie miec wdrozonych.
- Gdy fingerprint jest niedostepny, funkcja zwraca obiekt z `unavailable: true` i powodem, zamiast probowac zapytan generujacych 404 w konsoli Firebase.
- W `web-app/apps/portal-web/src/features/events/index.js` polling Zdarzen nie robi juz pelnego odswiezenia co minute, jesli fingerprint jest niedostepny.
Usunieto:
- Usunieto ukryte obciazenie pelnego pollingu Zdarzen po wykryciu braku operacji fingerprint w Data Connect.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workdayService.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/events/index.js`.
- Uruchomiono `git diff --check -- web-app/apps/portal-web/src/services/workdayService.js web-app/apps/portal-web/src/features/events/index.js ReadMe.txt`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono localhost w przegladarce: Pulpit, Kalendarz, Lista zlecen, Lista pracownikow i modal `Dodaj zlecenie`.
- Sprawdzono dymek `Nie zamkniete START-STOP`: klikniecie osoby przechodzi do profilu pracownika i otwiera edycje dnia pracy; modal zamknieto bez zapisu.
- Po odswiezeniu i przejsciu przez te widoki konsola przegladarki nie pokazala bledow ani ostrzezen aplikacji.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i mechanizmu synchronizacji w tle.
- Nie zmieniano aplikacji mobilnej ani danych w bazie.
- Jesli connector Data Connect zostanie wdrozony z operacjami `EventsFingerprintForOrg` i `WorkdaysFingerprintForOrg`, mozna wlaczyc szybkie fingerprinty przez `VITE_ENABLE_DATACONNECT_FINGERPRINT=true`.
- Przywrocenie poprzedniego zachowania: usunac bramke `EVENTS_FINGERPRINT_FOR_ORG_ENABLED` w `workdayService.js` oraz obsluge `fingerprint?.unavailable` w `features/events/index.js`.

Data: 2026-06-30 21:02 +02:00
Autor: AI Codex
Dodano:
- Utworzono backup przed planowanym wdrozeniem portalu: `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-portal-20260630-204854`.
- Backup zawiera `working-tree.diff`, `git-status.txt` i `head.txt`, zeby mozna bylo odtworzyc stan sprzed proby wdrozenia.
Zmieniono:
- Nie wykonano zmian kodu w ramach samej proby wdrozenia.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Sprawdzono Firebase CLI: `firebase login:list` pokazuje konto `biuro@bestclean.pl`, ale komendy produkcyjne zwracaja niewazne poswiadczenia i prosza o `firebase login --reauth`.
- `firebase apphosting:backends:list --project iclean-room --json` oraz `firebase apphosting:backends:get cleanzi-01 --project iclean-room --json` nie pozwolily potwierdzic backendu App Hosting z powodu problemu z autoryzacja CLI.
Uwagi dla nastepnej osoby:
- Nie wykonano deploya na produkcje, bo kontrolowany rollout App Hosting wymaga odblokowanego Firebase CLI albo potwierdzonej sciezki GitHub/App Hosting.
- Nie nalezy uzywac `firebase deploy --only hosting` jako zamiennika bez potwierdzenia, bo produkcyjny adres portalu to `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`, czyli Firebase App Hosting, nie zwykly Firebase Hosting.
- Nie zmieniano aplikacji mobilnej ani danych w bazie.

Data: 2026-06-30 21:33 +02:00
Autor: AI Codex
Dodano:
- Dopisano raport po bezpiecznym wdrozeniu portalu desktop na produkcje App Hosting.
- Punkt powrotu przed wdrozeniem: `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-portal-20260630-204854`.
Zmieniono:
- Wdrozenie wykonano z commita `cb0a329 portal: prepare production sync fixes` z galezi `codex/pre-prod-sync-20260630-112213`.
- Galaz zostala wypchnieta do remote `cleanzi01/codex/pre-prod-sync-20260630-112213`.
- Utworzono rollout App Hosting backendu `cleanzi-01` w projekcie `iclean-room`, region `europe-west4`, na adres produkcyjny `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`.
- Firebase CLI uruchomiono przez Node 24.13.1 z `--use-system-ca`, zeby uzyc systemowego magazynu CA zamiast obchodzic weryfikacje TLS.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed rolloutem uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Przed rolloutem uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Po rolloutcie sprawdzono backend `cleanzi-01`: `reconciling=false`, `updateTime=2026-06-30T19:26:59.809587Z`.
- Produkcyjny adres portalu zwrocil HTTP 200.
- Produkcyjny HTML laduje zasoby `assets/portal-BE_CiY6A.js` i `assets/portal-DgbxO4e4.css`.
- W produkcyjnym JS potwierdzono znaczniki nowego kodu: `VITE_ENABLE_DATACONNECT_FINGERPRINT` oraz `portal:workday-updated`.
- Smoke test w przegladarce produkcyjnej: Pulpit zaladowal dane, Kalendarz pokazal toolbar, BUFOR i wiersze pracownikow.
- Konsola przegladarki podczas smoke testu Pulpitu i Kalendarza nie pokazala bledow ani ostrzezen aplikacji.
Uwagi dla nastepnej osoby:
- Nie wdrazano aplikacji mobilnej.
- Nie wdrazano Data Connect ani nie zmieniano danych w bazie.
- Przywrocenie wersji sprzed wdrozenia: uzyc backupu `working-tree.diff` z katalogu `pre-deploy-portal-20260630-204854` albo cofnac rollout App Hosting do commita sprzed `cb0a329`, zgodnie z procedura Firebase App Hosting/GitHub.

Data: 2026-07-01 12:59 +02:00
Autor: AI Codex
Dodano:
- Dodano bardziej uporzadkowany uklad karty zmiany w formularzu zlecenia: czytelniejszy licznik osob, szersza karta, sekcja dni pracy jako kompaktowa siatka oraz spokojniejszy blok podsumowania obsady.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` licznik zmiany pokazuje teraz `X os.` zamiast samej cyfry, a formularz zmiany dostal dodatkowe klasy ukladu dla trybu jednorazowego i cyklicznego.
- W `web-app/apps/portal-web/src/index.css` poprawiono szerokosc karty zmiany, wyglad nazwy zmiany, licznika osob, siatki czasu, dni tygodnia oraz podsumowania obsady.
- Dni tygodnia w karcie zmiany sa teraz prostokatnymi przelacznikami zamiast okraglych pol z checkboxem, z wyraznym stanem zaznaczenia.
Usunieto:
- Nic z logiki zapisu ani danych; zmiana dotyczy warstwy HTML/CSS formularza zlecenia.
Testy/sprawdzenia:
- Przed praca uruchomiono `git fetch cleanzi01` i sprawdzono `git rev-list --left-right --count HEAD...cleanzi01/main`; lokalna galaz byla 2 commity do przodu i 0 commitow za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono lokalny adres `http://127.0.0.1:5173/`, otwarto modal `Dodaj zlecenie`, wybrano klienta `Best Clean` i obejrzano lokalnie karte zmiany bez zapisywania zlecenia.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego wygladu: cofnac zmiany w `ordersServiceBlockCardHtml`, nowe klasy `orders-shift-*`, wrapper `orders-service-weekdays-wrap` oraz powiazane style `orders-service-*` / `orders-kanban-*` dodane w tym wpisie.

Data: 2026-07-02 09:50 +02:00
Autor: AI Codex
Dodano:
- Dodano rozwijana liste pracownikow w slocie osoby w formularzu zlecenia, w polu `Opis / rola osoby`.
- Dodano automatyczne dociaganie listy pracownikow po wejsciu w krok `Zmiany i osoby`, jesli formularz zlecenia nie ma jeszcze zasobow pracownikow z kalendarza.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` pole roli osoby w slocie jest teraz selectem z opcjami `BUFOR` oraz pracownikami.
- Nowy select synchronizuje wybor z technicznym polem `Pracownik opcjonalnie`, zeby zapis nadal korzystal z dotychczasowego mechanizmu obsady.
- W `web-app/apps/portal-web/src/ui/portalApp.js` `fetchWorkersForCurrentSession` najpierw inicjalizuje modul `workerTime`, dzieki czemu pobieranie pracownikow dziala rowniez wtedy, gdy uzytkownik nie otwieral wczesniej widoku pracownikow/kalendarza.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed praca uruchomiono `git fetch cleanzi01` i sprawdzono `git rev-list --left-right --count HEAD...cleanzi01/main`; lokalna galaz byla 2 commity do przodu i 0 commitow za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/portalApp.js`.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono lokalnie `http://localhost:5173/`: otwarto `Dodaj zlecenie`, wybrano klienta `Best Clean`, przejscie do `Zmiany i osoby` pokazalo 55 opcji w liscie osoby.
- Sprawdzono, ze wybor pracownika w nowej liscie ustawia to samo nazwisko w polu `Pracownik opcjonalnie`, a powrot na `BUFOR` resetuje pole pracownika. Nie zapisano zlecenia.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: w `ordersServiceBlockSlotsHtml` przywrocic input `data-orders-service-slot-label`, usunac helpery `ordersServiceSlotPersonOptionsHtml`, `ordersReadServiceSlotLabel`, `ordersApplyServiceSlotPersonSelection`, `ordersSyncServiceSlotPersonLabelFromWorker`, `ordersEnsureWorkerResourcesForEditor`, zmiany w handlerze `data-orders-service-slot-label` oraz linie inicjalizacji `workerTime` w `fetchWorkersForCurrentSession`.

Data: 2026-07-02 10:12 +02:00
Autor: AI Codex
Dodano:
- Dodano nakladanie aktualnych `workAllocations` na sloty `serviceBlocks` przy otwieraniu/normalizacji formularza zlecenia.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` formularz `Zmiany i osoby` traktuje teraz `workAllocations` jako zrodlo prawdy dla obsady slotu, takze gdy zapisane `serviceBlocks.slots` nadal maja stare `BUFOR`.
- Dopasowanie slotu korzysta z klucza alokacji, `slotId`, indeksu slotu oraz kontekstu bloku zmiany, zeby po przypisaniu z kalendarza pole `Opis / rola osoby` i `Pracownik opcjonalnie` pokazywaly tego samego pracownika.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed praca uruchomiono `git fetch cleanzi01` i sprawdzono `git rev-list --left-right --count HEAD...cleanzi01/main`; lokalna galaz byla 2 commity do przodu i 0 commitow za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Sprawdzono lokalnie w otwartym formularzu edycji zlecenia, ze slot przypisany z BUFORU do `Dudek Rafal` pokazuje `Dudek Rafal` w polu `Opis / rola osoby` oraz w polu `Pracownik opcjonalnie`. Nie zapisano formularza.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helpery `ordersServiceBlockAllocationSource`, `ordersServiceSlotKeyCandidates`, `ordersServiceSlotMatchesAllocation`, `ordersServiceSlotWithAllocation`, `ordersServiceSlotsWithAllocations` oraz przywrocic bezposrednie normalizowanie `block.slots` w `ordersServiceBlockSlots`.

Data: 2026-07-02 11:31 +02:00
Autor: AI Codex
Dodano:
- Dodano synchronizacje zlecen kalendarza podczas odswiezania Pulpitu, zeby os dnia mogla pokazac zaplanowane zadania bez koniecznosci wchodzenia najpierw w Kalendarz.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` `refreshDashboardWidgets` pobiera teraz rownolegle dane aktywnych pracownikow/zdarzen oraz zlecenia z `ordersSyncRemoteTimelineOrders`.
- Render osi dnia korzysta dzieki temu z aktualnych `ordersListSourceOrders`, a komunikat `Brak aktywnosci do pokazania na osi dnia` nie powinien pojawiac sie tylko dlatego, ze modul kalendarza nie byl jeszcze otwierany.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed praca uruchomiono `git fetch cleanzi01` i sprawdzono `git rev-list --left-right --count HEAD...cleanzi01/main`; lokalna galaz byla 2 commity do przodu i 0 commitow za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac `ordersSyncRemoteTimelineOrders` z destrukturyzacji kontekstu Pulpitu, helper `dashboardSyncCalendarOrdersForTimeline` oraz rownolegle wywolanie tego helpera w `refreshDashboardWidgets`.

Data: 2026-07-02 13:35 +02:00
Autor: AI Codex
Dodano:
- Dodano rozpoznawanie aktualnego wiersza pracownika dla slotow zlecenia na podstawie stabilnych danych obsady: `workerId`, `workerLogin`, `workerKey` oraz nazwy pracownika.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` `calendarTimelineVisualOrderSlots` nie ufa juz bezwarunkowo zapisanemu numerowi `row`, tylko przed renderem probuje przeliczyc go na aktualny wiersz pracownika z listy zasobow.
- Klucze techniczne slotow typu `slot:*`, `workslot*`, `service-slot*`, `buffer` i `BUFOR` nie sa traktowane jako identyfikator pracownika.
- Dzieki tej zmianie Pulpit i Kalendarz korzystaja z tego samego rozpoznania obsady po zmianie kolejnosci/sortowania pracownikow.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed praca sprawdzono `git rev-list --left-right --count HEAD...cleanzi01/main`; lokalna galaz byla 2 commity do przodu i 0 commitow za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono lokalnie `http://localhost:5173/`: po przejsciu na Pulpit wiersz `Dudek Rafal` pokazuje jednoczesnie realny START oraz planowane zlecenie `11:00-14:00 Best Clean`.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helpery `calendarTimelineAllocationStoredRow`, `calendarTimelineAllocationKeyLooksLikeSlot`, `calendarTimelineAllocationWorkerKey`, `calendarTimelineAllocationWorkerAssignment`, `calendarTimelineResolveAllocationRow` oraz przywrocic bezposrednie ustawienie `row` w `safeAllocations` na wartosc `Number(item.row)`.

Data: 2026-07-02 14:22 +02:00
Autor: AI Codex
Dodano:
- Dodano wspolne oczekiwanie na trwajaca synchronizacje zlecen kalendarza w module kalendarza.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` `ordersSyncRemoteTimelineOrders` nie zwraca juz lokalnego snapshotu, gdy inne pobieranie zlecen juz trwa.
- Kolejne wywolania synchronizacji czekaja na ten sam request do bazy i dopiero po nim renderuja aktualny widok, co ma usunac przypadek, w ktorym Pulpit po pelnym odswiezeniu strony nie pokazuje zlecenia widocznego pozniej w Kalendarzu.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Proba `git fetch cleanzi01` oraz `git ls-remote cleanzi01 refs/heads/main` przekroczyla limit czasu; lokalny `cleanzi01/main` pozostaje referencja porownawcza z poprzedniego pobrania.
- Sprawdzono `git rev-parse HEAD` i `git rev-parse cleanzi01/main`; lokalna galaz pozostaje przed lokalnie znanym `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Proba automatycznego testu pelnego odswiezenia w przegladarce Codexa zostala przerwana przez timeout polaczenia z karta, mimo ze lokalny Vite odpowiadal HTTP 200; test wizualny po tej poprawce wymaga jeszcze recznego potwierdzenia w LH.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac `calendarTimelineOrdersRemotePromise` i przywrocic warunek `if (!orgId || appState.calendarTimelineOrdersRemoteLoading) return ordersListSourceOrders()` w `ordersSyncRemoteTimelineOrders`.

Data: 2026-07-02 22:59 +02:00
Autor: AI Codex
Dodano:
- Dodano mocniejsze dopasowanie pracownika na osi dnia Pulpitu po `workerId`, loginie oraz wariantach imienia i nazwiska, np. `Dudek Rafal` i `Rafal Dudek`.
- Dodano awaryjne wyswietlanie kodu QR/strefy jako etykiety aktywnego paska, gdy nie da sie rozpoznac nazwy klienta po tym kodzie.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` aktywne paski na Pulpicie preferuja najnowszy event QR tego samego pracownika i dnia przed ogolna etykieta z workday.
- Pulpit pobiera zdarzenia z biezacego dnia w zakresie do nastepnego dnia, aby nie tracic eventow przy filtrowaniu po koncu zakresu.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Sprawdzono, ze lokalny Vite serwuje najnowszy modul `web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono lokalnie `http://localhost:5173/`: po kliknieciu `Pulpit` wiersz `Dudek Rafal` pokazuje aktywny START oraz pozycje kalendarzowa `11:00-14:00 Best Clean`.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helpery `dashboardActivityWorkerMatchKeys` i `dashboardActivityRowsShareWorker`, usunac fallback `rawQrLabel` w `dashboardActivityLatestQrCompanyLabelForRow` oraz przywrocic porownanie po samym `dashboardResolveWorkerIdValue`.

Data: 2026-07-06 11:05 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` zmieniono odswiezanie kart zmian po zmianie trybu, dnia, godzin lub obsady tak, aby render korzystali z aktualnych kontrolek formularza (`preferStored: false`), a nie ze starego zapisanego stanu.
- Celem jest naprawa cofania wyboru dni pracy i pracownika w formularzu dodawania/edycji zlecenia, np. przy probie ustawienia cyklicznego zlecenia Best Clean dla Rafala Dudka pon.-pt. 08:00-16:00.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano poczatek `ReadMe.txt` i sprawdzono `git status -sb`.
- Proba `git fetch --all --prune` przekroczyla limit czasu, wiec praca jest prowadzona na aktualnym stanie lokalnym bez cofania istniejacych zmian.
- Test przegladarkowy na `http://localhost:5173/` jest kontynuowany po tej zmianie.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani danych w bazie.
- Przywrocenie poprzedniego zachowania: w obsludze zmiany kontrolek `data-orders-service-*` przywrocic `ordersRenderWorkAllocationControls(order, { forceEven: true, preferStored: true })`.

Data: 2026-07-06 12:26 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` odblokowano wybor trybu zmiany w karcie zmiany, tak aby ustawienie `Cyklicznie co tydzien` na zmianie ustawialo cale zlecenie jako cykliczne.
- W `web-app/apps/portal-web/src/features/orders/index.js` zmieniono normalizacje kart zmian podczas odczytu i zapisu formularza tak, aby biezace kontrolki formularza nie byly nadpisywane starym `workAllocations` z rekordu zlecenia. Naprawia to przypadek, w ktorym po wyborze `Dudek Rafal` formularz wracal do `BUFOR`.
- W `web-app/apps/portal-web/src/features/orders/index.js` pominieto synchronizacje planu obiektu do danych klienta, jezeli zlecenie nie ma zadan obiektowych ani wyposazenia. Dzieki temu proste zlecenie nie jest blokowane bledem zapisu pustego planu klienta.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Sprawdzono lokalnie `http://localhost:5173/`: dodano testowe zlecenie cykliczne Best Clean od 06.07.2026, pon.-pt., 08:00-16:00, przypisane do `Dudek Rafal`.
- Po zapisie ponownie otwarto edycje tego zlecenia i potwierdzono, ze widoczne sa `Dudek Rafal`, tryb cykliczny, dni pon.-pt. oraz godziny 08:00-16:00.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect ani schematow bazy.
- Przywrocenie poprzedniego zachowania: ponownie zablokowac `data-orders-service-mode` dla zlecen niecyklicznych, usunac blok synchronizujacy tryb zmiany z `order.scheduleMode`, przywrocic przekazywanie oryginalnego `order` do `ordersNormalizeServiceBlock` w `ordersStoreServiceBlocks` i `ordersReadServiceBlocksFromControls`, oraz przywrocic bezwarunkowy zapis `ordersSyncObjectDataToClient`.

Data: 2026-07-06 14:26 +02:00
Autor: AI Codex
Dodano:
- Dodano rozpoznawanie uprawnienia administratora przy usuwaniu zlecen historycznych w module zlecen.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` funkcja `ordersTimelineOrderCanBeDeleted` pozwala teraz uzytkownikom z poziomem roli `roleLevel >= 3` albo rola `admin` / `administrator` / `owner` / `superadmin` usuwac prawdziwe zlecenia niezaleznie od tego, czy sa historyczne, rozpoczete albo zakonczone.
- Dla pozostalych uzytkownikow zostaje dotychczasowa blokada: usuwac mozna tylko zaplanowane zlecenia, ktore jeszcze sie nie rozpoczely.
- W `ordersConfirmTimelineOrderDelete` dodano osobny komunikat potwierdzenia dla administratora informujacy, ze operacja moze dotyczyc rowniez zlecen historycznych/rozpoczetych i jest nieodwracalna.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect, backendowego endpointu DELETE ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helper `ordersCurrentUserCanDeleteHistoricalOrders`, usunac `roleLevel` z destrukturyzacji kontekstu w `createOrdersFeature`, przywrocic warunek `if (!order || order.completed || order.isDraft) return false` w `ordersTimelineOrderCanBeDeleted` oraz usunac administratorska galaz potwierdzenia w `ordersConfirmTimelineOrderDelete`.

Data: 2026-07-06 14:42 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` zmieniono logike dostepnych dni w karcie zmiany. Po usunieciu osobnej sekcji "Dni dostepu i wyjatki" poprzednie `repeatWeekdays` nie jest juz traktowane jako limit dni, tylko jako aktualny wybor uzytkownika.
- W `ordersNormalizeServiceBlock` usunieto filtrowanie dni zmiany przez stary zestaw dni z rekordu zlecenia. Dzieki temu po przelaczeniu zlecenia/zmiany na tryb cykliczny mozna zaznaczyc wiele dni pracy, a formularz nie cofa wyboru do samego poniedzialku.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano poczatek `ReadMe.txt`.
- Sprawdzono zdalne repozytorium: `git fetch cleanzi01 main --prune`; lokalna galaz nie jest za GitHubem (`HEAD...cleanzi01/main` = `2 0`, czyli 2 commity lokalnie do przodu, 0 zdalnych brakujacych lokalnie).
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
- Sprawdzono, ze lokalny Vite odpowiada HTTP 200 pod `http://localhost:5173/`.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect, backendu ani danych w bazie.
- Przywrocenie poprzedniego zachowania: w `ordersAvailableAccessWeekdays` przywrocic odczyt `ordersRepeatWeekdaysFromOrder(order)`, a w `ordersNormalizeServiceBlock` ponownie filtrowac dni przez `availableWeekdays`.

Data: 2026-07-06 14:58 +02:00
Autor: AI Codex
Dodano:
- Dodano helper `ordersAssignableWorkerResourceOptions` w `web-app/apps/portal-web/src/features/orders/index.js`, ktory buduje liste pracownikow do obsady w kolejnosci alfabetycznej po nazwie.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` lista `Opis / rola osoby` w slocie zmiany pokazuje teraz `BUFOR` jako pierwsza opcje, a nastepnie pracownikow alfabetycznie.
- W tym samym pliku lista `Pracownik opcjonalnie` uzywa tej samej kolejnosci alfabetycznej, zeby oba pola obsady byly spojne.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano poczatek `ReadMe.txt`.
- Sprawdzono zdalne repozytorium: `git fetch cleanzi01 main --prune`; lokalna galaz nie jest za GitHubem (`HEAD...cleanzi01/main` = `2 0`, czyli 2 commity lokalnie do przodu, 0 zdalnych brakujacych lokalnie).
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; pozostaly tylko ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect, backendu ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helper `ordersAssignableWorkerResourceOptions` i przywrocic bezposrednie mapowanie `resources` w `ordersServiceSlotWorkerOptionsHtml` oraz `ordersServiceSlotPersonOptionsHtml`.

Data: 2026-07-06 15:46 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` kalendarz dla zlecen posiadajacych `serviceBlocks` priorytetowo korzysta teraz z alokacji z blokow zmian, zamiast ze starszych top-level `workAllocations`.
- W `calendarTimelineServiceBlockAllocations` alokacje zapisane bezposrednio w zmianie dziedzicza godziny `startTime` / `endTime` z bloku zmiany. Dzieki temu stara alokacja 08:00-16:00 nie nadpisuje poprawnego planu zmiany 07:00-15:00.
- W `calendarTimelineVisualOrderSlots` warstwa wizualna planowanych paskow rowniez preferuje `serviceBlocks`, aby lista, edycja i kalendarz nie rozjezdzaly sie przy nowych zleceniach zmianowych.
- W `web-app/apps/portal-web/src/features/orders/index.js` scalanie slotu z alokacja (`ordersServiceSlotWithAllocation`) nie nadpisuje juz godzin slotu godzinami z alokacji. Slot/zmiana okresla czas, alokacja okresla osobe.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytorium: `git fetch cleanzi01 main --prune`; lokalna galaz nie jest za GitHubem (`HEAD...cleanzi01/main` = `2 0`, czyli 2 commity lokalnie do przodu, 0 zdalnych brakujacych lokalnie).
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Po odswiezeniu `http://localhost:5173/` sprawdzono w przegladarce, ze wiersze `Cisak Marta` i `Dudek Sabina` maja planowane paski `07:00-15:00 Best Clean`.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect, backendu ani danych w bazie.
- Dla zlecen z `serviceBlocks` godziny bloku zmiany sa zrodlem prawdy dla kalendarza, a `workAllocations` przenosi przede wszystkim osobe/slot.

Data: 2026-07-06 16:29 +02:00
Autor: AI Codex
Dodano:
- Dodano zabezpieczenie frontendu w `web-app/apps/portal-web/src/services/scheduleTaskDataConnectService.js`, ktore traktuje odpowiedz `/api/portal/schedule-orders` z `storage: local-file` albo bez `data.orders` / `data.deletedOrderIds` jako niedostepny endpoint i przechodzi do Data Connect zamiast przyjmowac lokalny plik jako prawde.
Zmieniono:
- W `index.js` lokalny zapis plikowy zlecen grafiku (`.local-data/portal-schedule-orders`) nie wlacza sie juz automatycznie przy braku konfiguracji bazy. Wymaga jawnej zmiennej `ALLOW_LOCAL_PORTAL_SCHEDULE_ORDERS_FILE_STORAGE=1` oraz trybu `PORTAL_SCHEDULE_ORDERS_MODE=local/direct/file`.
- W `index.js` lokalny zapis plikowy zadan portalowych/Kanban (`.local-data/portal-tasks`) rowniez wymaga jawnej zmiennej `ALLOW_LOCAL_PORTAL_TASK_FILE_STORAGE=1` oraz trybu `PORTAL_TASKS_MODE=local/direct/file`.
- W `scripts/dev-local.js` domyslny `npm run dev` ustawia `PORTAL_SCHEDULE_ORDERS_MODE=proxy` oraz `PORTAL_TASKS_MODE=proxy`, zeby localhost uzywal zdalnej bazy/proxy zamiast lokalnych plikow.
- W `.env.example` opisano, ze zlecenia grafiku nie powinny byc zapisywane w lokalnym fallbacku i dodano przyklady zmiennych proxy oraz awaryjnego opt-in dla file fixtures.
Usunieto:
- Nic. Istniejace pliki `.local-data` zostaly zachowane, ale nie powinny byc juz uzywane automatycznie jako miejsce zapisu zlecen.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytorium: `git fetch cleanzi01 main --prune`; lokalna galaz nie jest za GitHubem (`HEAD...cleanzi01/main` = `2 0`, czyli 2 commity lokalnie do przodu, 0 zdalnych brakujacych lokalnie).
- Utworzono backup aktualnego stanu: `.codex-backups/pre-local-write-lock-20260706-162928` z `git-status.txt`, `HEAD.txt`, `working-tree.diff` oraz kopia `.local-data`.
- Uruchomiono `node --check index.js`.
- Uruchomiono `node --check scripts/dev-local.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/scheduleTaskDataConnectService.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono swiezy `npm run dev`; poniewaz port 8080 byl zajety, backend wystartowal na 8081, a Vite na `http://127.0.0.1:5173/`.
- Sprawdzono HTTP 200 dla `http://127.0.0.1:5173/` oraz `{"ok":true}` dla `http://127.0.0.1:8081/healthz`.
Uwagi dla nastepnej osoby:
- Nie wdrazano tej zmiany na produkcje w ramach tego wpisu.
- Nie migrowano ani nie usuwano danych z `.local-data`; jesli sa tam testowe lub omylkowe zlecenia, trzeba osobno zdecydowac, czy je przeniesc do `public.task`, czy odrzucic.
- Przywrocenie poprzedniego zachowania: przywrocic automatyczne `return NODE_ENV !== 'production' && !hasDatabaseConnectionConfig()` w `shouldUseLocalPortalScheduleOrderFileStorage` i `shouldUseLocalPortalTaskFileStorage`, ustawic w `scripts/dev-local.js` `PORTAL_TASKS_MODE` na `local` i usunac obsluge lokalnego payloadu w `scheduleTaskDataConnectService.js`.

Data: 2026-07-06 17:37 +02:00
Autor: AI Codex
Dodano:
- Wdrozenie produkcyjne portalu Best Clean / Cleanzi na App Hosting backend `cleanzi-01` w projekcie `iclean-room`.
- Commit wdrozeniowy: `d1a65caccd24f3c7e70547c0d823a7317bc476eb` (`portal: harden schedule persistence and calendar flows`).
- Rollout App Hosting: `build-2026-07-06-002`; Cloud Build: `c17a1cbf-a2bd-4dc1-80fb-b71083ae0161`.
Zmieniono:
- Na produkcje wyslano dotychczasowe poprawki portalu dotyczace m.in. zabezpieczenia przed lokalnym zapisem zlecen, spojnosci `serviceBlocks` / `workAllocations`, synchronizacji osi dnia z kalendarzem, list pracownikow w obsadzie, widoku rol pracownikow w kalendarzu oraz poprawek formularza zlecen.
- Nie wdrazano zmian aplikacji mobilnej w tym kroku.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed wdrozeniem sprawdzono zdalne repozytorium: `git fetch cleanzi01 main --prune`; lokalna galaz nie byla za GitHubem (`HEAD...cleanzi01/main` = `3 0`, czyli 3 commity lokalnie do przodu, 0 zdalnych brakujacych lokalnie).
- Utworzono backup przed wdrozeniem: `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-portal-20260706-164917`.
- Uruchomiono `git diff --check`; wynik bez bledow, pozostaly tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Wypchnieto branch `codex/pre-prod-sync-20260630-112213` do GitHub.
- Utworzono rollout App Hosting dla commita `d1a65ca`; rollout zakonczyl sie statusem `SUCCEEDED`.
- Sprawdzono Cloud Run: rewizja `cleanzi-01-build-2026-07-06-002` ma 100% ruchu.
- Sprawdzono produkcyjny URL `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`; zwrocil HTTP 200.
- Sprawdzono serwowane assety produkcyjne; marker nowej logiki `ordersSyncRemoteTimelineOrders` jest obecny w `/assets/portal-Bv5O1e79.js`.
Uwagi dla nastepnej osoby:
- Jesli trzeba wycofac wdrozenie, punktem odniesienia sprzed tego rollouta jest poprzedni commit `cb0a329` / poprzedni build App Hosting sprzed `build-2026-07-06-002`.
- Backup lokalnego stanu przed deployem znajduje sie w `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-portal-20260706-164917`.
- Po deployu w szybkim smoke tescie HTML nadal wskazywal asset `/assets/portal-Bv5O1e79.js`, ale App Hosting i Cloud Run potwierdzaja rollout `build-2026-07-06-002`, a marker nowej logiki jest w tym assetcie.

Data: 2026-07-06 20:53 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/services/workdayService.js` dodano pochodne pole `scanObjectLabel` dla mapowanych i agregowanych aktywnych dni pracy.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` etykieta po prawej stronie osi dnia najpierw korzysta z gotowej etykiety skanu/obiektu (`scanObjectLabel`, aktywna lokalizacja/strefa), a dopiero potem z dotychczasowych fallbackow klienta i QR.
- Resolver QR dla osi dnia potrafi teraz zwrocic etykiete obiektu/strefy z `public.zone`, jesli nie uda sie ustalic nazwy klienta.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytorium: `git fetch cleanzi01`; lokalna galaz robocza nie byla za zdalna galezia, a `cleanzi01/main` pozostawal na commicie `1a3850a`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workdayService.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu lokalnego; nie wdrazano jej na produkcje.
- Nie zmieniano aplikacji mobilnej, Data Connect, backendu ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helper `dashboardActivityResolveObjectLabelByQr`, usunac priorytet `scanObjectCandidates` w `dashboardActivityCompanyLabel` i usunac pole `scanObjectLabel` z `workdayService.js`.

Data: 2026-07-06 22:14 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` dodano helper `dashboardActivityScannedObjectLabel`, ktory wydziela pewne etykiety pochodzace z realnego skanu/QR lub danych zapisanych bezposrednio przy zdarzeniu.
Zmieniono:
- Ograniczono uzupelnianie etykiety obiektu po prawej stronie osi dnia: nazwa jest pokazywana tylko wtedy, gdy istnieje QR albo jawna etykieta skanu/obiektu.
- Wpisy dodane recznie bez QR nie sa juz dopasowywane na sile do harmonogramu ani planowanych zlecen; dla takich wpisow zostaje `-`.
- Usunieto martwe helpery, ktore probowaly dobierac etykiety z planu dnia jako fallback.
Usunieto:
- Fallback wymuszajacy etykiety obiektu z grafiku/harmonogramu przy braku QR.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/services/workdayService.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; wynik bez bledow, pozostaly tylko ostrzezenia CRLF.
- W przegladarce na `http://localhost:5173/` odswiezono Pulpit i przewinieto os dnia. Wynik: 36 wierszy, 33 z etykieta obiektu/firmy, 3 reczne wpisy bez QR pozostaly jako `-` (`Nowaczyk-Woda Katarzyna`, `Kustos Szymon`, `Dudek Sabina`).
Uwagi dla nastepnej osoby:
- To celowe zachowanie: brak QR oznacza brak wymuszania nazwy obiektu na osi dnia.
- Zmiana dotyczy tylko portalu lokalnego; nie wdrazano jej na produkcje.

Data: 2026-07-06 22:59 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` dodano obsluge otwierania edycji dnia pracy bezposrednio z paska pracy na osi dnia pulpitu.
Zmieniono:
- Paski realnego czasu pracy na pulpicie (`data-dash-activity-workday-edit`) po podwojnym kliknieciu otwieraja teraz okno `Edycja dnia pracy` pracownika zamiast starego edytora zdarzenia.
- Dodano dane pomocnicze do paska pracy: dzien, `workdayId`, login i nazwe pracownika, zeby otwierac dokladny rekord dnia pracy.
- Dodano wsparcie klawiatury: Enter/Spacja na pasku pracy otwieraja to samo okno edycji dnia.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; wynik bez bledow, pozostaly tylko ostrzezenia CRLF.
- W przegladarce na `http://localhost:5173/` odswiezono pulpit i podwojnie kliknieto pasek pracy Rafala Dudka; otworzylo sie okno `Edycja dnia pracy` z polami daty, startu, konca pracy i komentarza.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop; nie zmieniano aplikacji mobilnej, backendu ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helpery `dashboardActivityWorkdayDetailFromBar`, `dashboardActivityWorkdayClickKeyFromBar`, `openDashboardActivityWorkdayDayEditor` i przywrocic atrybut/handler `data-dash-activity-event-edit` dla paskow pracy.

Data: 2026-07-06 23:22 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` doprecyzowano deduplikacje realnych paskow dnia pracy na kalendarzu.
- Aktywny pasek pracownika dodawany z biezacego statusu nie usuwa juz wczesniejszego zamknietego odcinka dnia pracy tego samego pracownika, jesli zamkniety odcinek konczy sie przed startem aktywnego odcinka.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- W przegladarce na `http://localhost:5173/` sprawdzono kalendarz dla `Dudek Rafal` na 06.07.2026: widoczny jest zamkniety realny pasek `08:00-17:43` oraz osobny aktywny pasek od `17:43`, zamiast samego aktywnego odcinka.
Uwagi dla nastepnej osoby:
- Przywrocenie poprzedniego zachowania: w `calendarTimelineEnsureActiveWorkerStatusOrders` usunac warunek `closedBeforeFallback` i ponownie usuwac wszystkie realne paski `workday` dla tego samego wiersza/dnia przed dodaniem fallbacku aktywnego statusu.
- Zmiana dotyczy tylko portalu desktop; nie zmieniano aplikacji mobilnej, backendu ani danych w bazie.

Data: 2026-07-06 23:37 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/calendar/index.js` dodano helper `calendarTimelineServiceBlockRepeatWeekdays`, ktory wyciaga dni powtarzania bezposrednio ze zmian `serviceBlocks.weekdays`.
- Dodano helper `calendarTimelineOccurrenceServiceBlocks`, ktory dla kazdego wystapienia cyklicznego przesuwa daty `serviceBlocks`, slotow i alokacji na konkretny dzien kalendarza.
Zmieniono:
- Rozwijanie zlecen cyklicznych na kalendarzu preferuje teraz dni zapisane przy zmianach, a nie tylko pochodne pole `repeatWeekdays`.
- Wystapienia cykliczne zachowuja strukture zmian i obsady, ale dostaja poprawna date wystapienia, dzieki czemu zlecenie pon-pt pokazuje sie takze w kolejnych dniach widoku 3-dniowego.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- W przegladarce na `http://localhost:5173/` odswiezono kalendarz i sprawdzono paski `Best Clean`: wystapienia sa widoczne dla `2026-07-06`, `2026-07-07` i `2026-07-08`.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i sposobu renderowania/rozwijania serii na kalendarzu; nie zmieniano aplikacji mobilnej, backendu ani danych w bazie.
- Przywrocenie poprzedniego zachowania: usunac helpery `calendarTimelineServiceBlockRepeatWeekdays` i `calendarTimelineOccurrenceServiceBlocks`, a w `calendarTimelineRecurringInstance` wrocic do generowania alokacji bez nadpisywania `serviceBlocks` dla dnia wystapienia.

Data: 2026-07-07 10:50 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` trwale wylaczono modal ostrzegawczy `Brak QR START`.
- Funkcja `dashboardShowScheduleMissingStartAlert` nie tworzy juz okna, tylko czysci ewentualny stary popup i kolejke powiadomienia `dashboard:schedule-missing`.
- Popup spoznien `dashboardShowScheduleLateStartAlert` nie czeka juz na popup `Brak QR START`, bo ten popup zostal usuniety z przeplywu.
Usunieto:
- Usunieto kod HTML i obsluge przyciskow `Przypomnij za`, `Odloz`, `Nie pokazuj` dla popupu `Brak QR START`.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytoria przez `git fetch --all --prune`; biezaca galaz `codex/pre-prod-sync-20260630-112213` nie byla za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Sprawdzono, ze tekst `Brak QR START` nie wystepuje juz w `web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; wynik bez bledow, pozostaly tylko ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop; nie zmieniano aplikacji mobilnej, backendu ani danych w bazie.
- Liczenie brakujacego startu i wizualizacja na osi/paskach pozostaja w systemie; usuniety jest tylko modal `Brak QR START`.
- Przywrocenie poprzedniego zachowania: odtworzyc poprzednia zawartosc `dashboardShowScheduleMissingStartAlert` oraz blok priorytetu w `dashboardShowScheduleLateStartAlert`, ktory kolejkowal popup spoznien po popupie braku START.

Data: 2026-07-07 11:20 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` dodano helper `dashboardSyncCalendarTimelineInputs`, ktory dla pulpitu pobiera zrodlo zlecen kalendarza oraz katalog pracownikow przed renderem osi dnia.
- W `web-app/apps/portal-web/src/ui/layoutTemplate.js` dodano widoczny przycisk `Odswiez u zrodla` w panelu osi dnia pulpitu.
- W `web-app/apps/portal-web/src/index.css` dodano style przycisku `dash-refresh-btn--source` i zachowano animacje spinnera podczas pobierania.
Zmieniono:
- Odświeżenie pulpitu oraz ladowanie osi dla wybranego dnia korzystaja teraz z tego samego zrodla zlecen co kalendarz, bez koniecznosci wejscia w zakladke `Kalendarz`.
- Klikniecie przycisku odswiezania pulpitu wymusza pobranie danych u zrodla: zlecen grafiku, listy pracownikow, aktywnosci i grafiku dnia.
- Komunikat po recznym odswiezeniu informuje, ze dane pulpitu zostaly pobrane u zrodla.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytoria przez `git fetch --all --prune`; biezaca galaz `codex/pre-prod-sync-20260630-112213` nie byla za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/layoutTemplate.js`.
- Uruchomiono `npm.cmd run build`; build portalu zakonczyl sie poprawnie.
- Uruchomiono `git diff --check`; wynik bez bledow, pozostaly tylko ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop; nie zmieniano aplikacji mobilnej, backendu ani danych w bazie.
- Przywrocenie poprzedniego zachowania: w `refreshDashboardWidgets` i `dashboardLoadActivityDay` wrocic z `dashboardSyncCalendarTimelineInputs` do samego `dashboardSyncCalendarOrdersForTimeline`, usunac helper oraz przywrocic przycisk `dashRefreshBtn` jako `dash-refresh-btn--icon`.

Data: 2026-07-07 11:21 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/ui/layoutTemplate.js` skrocono widoczny tekst przycisku odswiezania pulpitu z `Odswiez u zrodla` do `Odswiez`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/ui/layoutTemplate.js`.
Uwagi dla nastepnej osoby:
- Tooltip i opis dostepnosci przycisku nadal informuja, ze odswiezanie pobiera dane u zrodla; zmieniono tylko widoczny napis.

Data: 2026-07-07 11:33 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` nowy draft zlecenia tworzony przy `Dodaj zlecenie` startuje jako klient jednorazowy (`clientType/customerType: individual`).
- Renderer formularza odroznia etykiete wyboru `Klient jednorazowy` od wlasciwej nazwy zlecajacego, dzieki czemu pierwszy ekran otwiera sekcje klienta jednorazowego, ale pola danych klienta pozostaja puste do wypelnienia.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytoria przez `git fetch --all --prune`; biezaca galaz `codex/pre-prod-sync-20260630-112213` nie byla za `cleanzi01/main`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i tylko sciezki nowego zlecenia; edycja istniejacych zlecen korzysta z dotychczasowego rozpoznania klienta.
- Przywrocenie poprzedniego zachowania: usunac pola `clientType/customerType: individual` z `ordersCreateDraftOrder` i przywrocic poprzednie wyliczanie `renderClientLabel`, `selectedClientForRender`, `isIndividualOrder`, `ordersIndividualName` oraz `ordersEditClientName` w `ordersRenderEditor`.

Data: 2026-07-07 11:42 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` poprawiono filtrowanie listy klientow w pickerze klienta na pierwszym kroku formularza zlecenia.
- Gdy wybrany jest `Klient jednorazowy`, widoczna etykieta pola nie jest juz traktowana jako filtr wyszukiwania, wiec po rozwinieciu listy widac rowniez dotychczasowych klientow posortowanych alfabetycznie.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalne repozytoria przez `git fetch --all --prune`; biezaca galaz `codex/pre-prod-sync-20260630-112213` nie byla za `cleanzi01/main`.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i tylko zachowania listy klientow w formularzu zlecenia.
- Przywrocenie poprzedniego zachowania: w `ordersRenderClientPickerList` wrocic do liczenia `query` bez `selectedDisplayKey`.

Data: 2026-07-07 11:54 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/orders/index.js` dodano w karcie osoby pomocnicze etykiety `statusLabel` i `summaryLabel`, uzywane tylko do czytelniejszego renderowania slotu osoby.
- W `web-app/apps/portal-web/src/index.css` dodano style `orders-kanban-slot-title`, `orders-kanban-slot-hours-pill` oraz doprecyzowano wyglad karty `orders-kanban-slot-card`.
Zmieniono:
- Poprawiono uklad karty osoby w sekcji `Zmiany i osoby`: naglowek ma teraz czytelny status i chip RBH, pola sa rowniej ulozone, a stopka pokazuje czy slot trafi do BUFORU albo kto jest przypisany.
- Uporzadkowano odstepy, obramowania, promienie i wysokosci pol w kanbanie slotow, bez zmiany logiki zapisu obsady.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Probowano sprawdzic zdalne repozytoria przez `git fetch --all --prune`, ale komenda przekroczyla limit czasu w tej sesji.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i tylko warstwy widoku formularza zlecenia; nie zmieniano aplikacji mobilnej, backendu ani danych w bazie.
- Przywrocenie poprzedniego wygladu: cofnac zmiany w `ordersServiceBlockSlotsHtml` dotyczace `statusLabel/summaryLabel/orders-kanban-slot-title/orders-kanban-slot-hours-pill` oraz usunac odpowiadajace style z `index.css`.

Data: 2026-07-07 12:03 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` zmieniono edycje zlecenia cyklicznego z osi kalendarza: klikniecie `Edytuj` oraz dwuklik na pasku nie wyswietlaja juz popupu wyboru zakresu `Tylko ten jeden dzien / Reguly cyklicznosci`.
- Dla wystapienia serii cyklicznej portal otwiera teraz bezposrednio edytor zlecenia zrodlowego/serii; dla materializowanego override nadal otwierany jest konkretny rekord override.
Usunieto:
- Nic z plikow; pominieto wywolanie popupu zakresu edycji w sciezce edycji z kalendarza.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalny branch przez `git fetch cleanzi01 main --prune`.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i tylko wejscia do edycji z osi kalendarza; nie zmieniano drag/drop, backendu, aplikacji mobilnej ani danych w bazie.
- Funkcja `calendarTimelineShowRecurringScopeDialog` zostaje w kodzie, bo nadal moze byc uzywana przez inne sciezki, np. zakres przesuniecia cyklicznego.
- Przywrocenie poprzedniego zachowania: w `calendarTimelineEditOrderFromContext` i obsludze `dblclick` przywrocic wywolanie `calendarTimelineShowRecurringScopeDialog` z akcjami `ordersOpenRecurringOccurrenceEditorFromCalendar` oraz `ordersOpenEditorFromCalendar`.

Data: 2026-07-07 12:26 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` zmieniono stan poczatkowy nowego draftu zlecenia: formularz `Dodaj zlecenie` startuje teraz z BUFOR-em zamiast automatycznie przypisywac pierwszy wiersz pracownika.
- Nowy draft ma `row` ustawiony na techniczny wiersz BUFOR, ale `assignedRows` i `workerAssignments` pozostaja puste do momentu swiadomego wyboru pracownika w formularzu.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Sprawdzono zdalny branch przez `git fetch cleanzi01 main --prune` w tej sesji pracy.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly tylko standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko istniejace ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i tylko sciezki dodawania nowego zlecenia; edycja istniejacych zlecen nadal odtwarza zapisane osoby, sloty i zasady z danych zlecenia.
- Przywrocenie poprzedniego zachowania: w `ordersCreateDraftOrder` ustawic z powrotem `row = 0`, `assignedRows: [row]` i `workerAssignments: ordersWorkerAssignmentsFromRows([row])`.

Data: 2026-07-07 13:30 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` poprawiono otwieranie edycji z paska zlecenia cyklicznego na pulpicie/kalendarzu.
- Dwuklik w konkretne wystapienie cykliczne nie otwiera juz bezposrednio rekordu zrodlowego calej serii, tylko przygotowuje edycje wystapienia dla wskazanej daty przez `ordersOpenRecurringOccurrenceEditorFromCalendar`.
- Ta sama zasada obejmuje teraz dwuklik bezposrednio na osi kalendarza oraz wejscie przez kontekst paska.
- Zachowano brak popupu wyboru zakresu; zmiana dotyczy tylko wyboru poprawnego kontekstu edycji.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- W przegladarce localhost dwukliknieto pasek `Jablonska Ewa: Plan 15:00-18:00 - NZOZ SWIERKLANY`; edytor pokazal sloty `Jablonska Ewa` i `Smolka Justyna`, zamiast poprzednio odtwarzanej zmiany `Radecka Natalia / Ostrowska Agnieszka`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko istniejace ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i sciezki otwierania edycji z osi/pulpitu; nie zmieniano zapisu danych, aplikacji mobilnej ani backendu.
- Przywrocenie poprzedniego zachowania: w `calendarTimelineEditOrderFromContext` przy `context.shouldAskScope && context.sourceOrder` ponownie wywolac `ordersOpenEditorFromCalendar(context.sourceOrderId)`.

Data: 2026-07-07 14:45 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/orders/index.js` dodano pomocnicze rozpoznanie kanonicznych alokacji obsady z `workAllocations` / `workerAllocations` oraz deduplikacje pracownikow po stabilnej tozsamosci.
Zmieniono:
- Uporzadkowano odczyt obsady zlecenia: jesli rekord ma `workAllocations` albo `workerAllocations`, lista zlecen, etykiety pracownikow i edytor biora pracownikow najpierw z tych pol, bez mieszania ze starymi polami `workerAssignments`, `assignedRows`, `workerLabel` i `workerIds`.
- Przy mapowaniu obsady na wiersze pracownikow priorytet maja identyfikatory/login/klucz/nazwa, a dopiero na koncu bezposredni numer `row`, zeby stare numery wierszy nie podmienialy osoby.
- Jesli kanoniczne alokacje istnieja, ale sa faktycznie BUFOR-em, formularz wraca do BUFOR-u zamiast odtwarzac przypadkowa osobe ze starych pol pomocniczych.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt` i sprawdzono `git status`.
- Probowano wykonac `git fetch --all --prune`, ale komenda przekroczyla limit czasu w tej sesji.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko istniejace ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i odczytu obsady zlecen w module zlecen; nie zmieniano aplikacji mobilnej, backendu ani schematu bazy.
- Przy dalszym sprzataniu nalezy utrzymac zasade: `task.work_allocations` / `Task.workAllocations` sa zrodlem prawdy, a pola `workerAssignments`, `assignedRows`, `workerLabel`, `workerIds` sa tylko pomocnicze/fallbackowe dla starych rekordow bez kanonicznych alokacji.

Data: 2026-07-07 17:40 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/orders/index.js` dodano zabezpieczenia formularza edycji zlecenia przed odczytem nieaktualnych kontrolek z poprzednio otwartego zlecenia.
- Dodano pomocnicze dopasowanie slotu obsady do pracownika po stabilnej tozsamosci: `workerId`, `workerLogin`, `workerKey` i nazwa, z numerem wiersza jako ostatnim fallbackiem.
Zmieniono:
- Poprawiono priorytet ID przy kliknieciu przycisku edycji na liscie zlecen: edytor otwiera teraz konkretny rekord z kliknietego wiersza, a nie rekord zrodlowy serii, ktory mogl pokazywac innego klienta i inna obsade.
- Przy odtwarzaniu slotow zmiany zlecenia portal nie miesza juz pustych/starych slotow BUFOR z pomocniczymi danymi poprzedniego edytora.
- Jesli slot w danych ma pracownika zapisanym identyfikatorem albo nazwa, formularz edycji pokazuje tego pracownika nawet wtedy, gdy stary numer `row` nie pasuje juz do aktualnej kolejnosci listy pracownikow.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana korzystano z aktualnego `ReadMe.txt` jako mapy zmian.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- W przegladarce localhost przeklikano edycje 6 widocznych zlecen z listy: Best Clean, GAPR, Gmina Godow, HOCHTIEF, Nash Tackle Zory i NZOZ SWIERKLANY. Edytor otwieral zgodnego klienta oraz zgodna obsade z wierszem listy.
- Nie wykonywano zapisu danych w bazie podczas testu.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i sciezki `Zlecenia -> Lista zlecen -> Edytuj`.
- Dla `Gmina Godow` edytor pokazuje poprawnego klienta i pracownika `Wuwer Mariola`, ale rekord ma trzy sloty tej samej osoby; to wyglada na osobny temat porzadkowania danych/regul slotow, a nie blad otwierania niewlasciwego rekordu.
- Przywrocenie poprzedniego zachowania: w `ordersOpenEditorFromRow`/delegacji akcji listy przywrocic priorytet `data-order-source-id` przed `data-order-id` oraz usunac guard `ordersEditorControlsBelongToOrder` i fallbacki dopasowania slotow po stabilnej tozsamosci.

Data: 2026-07-07 19:42 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/index.css` przesunieto dymki roznic czasu na pulpicie poza zewnetrzne krawedzie paskow czasu: START kotwiczy sie po lewej stronie paska, a STOP po prawej.
- Dla tracka osi dnia na pulpicie wlaczono widocznosc elementow wychodzacych poza obrys, zeby dymki nie byly ucinane po przeniesieniu na zewnatrz paska.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana przeczytano `ReadMe.txt` i sprawdzono aktualny status repozytorium.
- Wykonano `git fetch cleanzi01 --prune`, zeby upewnic sie, ze lokalny stan widzi aktualny remote.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko istniejace ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko wygladu osi dnia na pulpicie w portalu desktop; nie zmieniano JS, danych, backendu ani aplikacji mobilnej.
- Przywrocenie poprzedniego zachowania: w `web-app/apps/portal-web/src/index.css` dla `.dash-activity-timeline-track` przywrocic `overflow:hidden`, a dla `.dash-activity-delta-marker--phase-start/end` usunac zewnetrzne kotwiczenie i transformacje.

Data: 2026-07-07 20:48 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/orders/index.js` dodano centralne wyznaczanie czasu realizacji zlecenia z pierwszej dostepnej karty zmiany (`ordersPrimaryServiceBlockTiming`).
Zmieniono:
- Formularz dodawania/edycji zlecenia przestal uzywac gornych pol godzin/dostepu jako zrodla czasu realizacji; START/STOP sa teraz brane z kart w sekcji `Zmiany i osoby`.
- Podsumowanie, ukryte pola techniczne, walidacja, zapis zlecenia jednorazowego i zapis zlecenia cyklicznego korzystaja z godzin zmian, a nie z dawnych pol `ordersEditTime` i `ordersEditEndTime`.
- W `web-app/apps/portal-web/src/features/calendar/index.js` zachowano godziny slotow/alokacji przy budowaniu paskow kalendarza, zeby kalendarz nie wracal do starszych godzin rekordu nadrzednego.
Usunieto:
- Z `web-app/apps/portal-web/src/features/orders/list/template.html` usunieto widoczne pola `Godzina START` / `Godzina STOP` oraz ich wariant `Dostep do obiektu od/do` z gornej czesci formularza.
- Z `web-app/apps/portal-web/src/index.css` usunieto martwy styl dla nieistniejacego panelu `ordersScheduleTimeGrid`.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko istniejace ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy tylko portalu desktop i logiki formularza zlecen; nie zmieniano aplikacji mobilnej, backendu ani schematu bazy.
- Przywrocenie poprzedniego zachowania wymaga przywrocenia pol `ordersEditTime`/`ordersEditEndTime` w template oraz ponownego podpiecia ich w `ordersUpdateOrderScheduleFromControls`, `ordersBuildRepeatCalendarOrder` i `ordersSaveEditor`.

Data: 2026-07-07 21:55 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/orders/index.js` wylaczono aktywna logike godzin dostepu do obiektu w formularzu zlecen.
- Karty zmian w sekcji `Zmiany i osoby` sa jedynym zrodlem godzin realizacji; checkboxy dni pracy w kartach nie sa juz blokowane przez historyczne okna dostepu.
- Starsze etykiety formularza i podsumowan zmieniono z tekstow typu `Dostep od/do` na `START`, `STOP` albo `Plan`, zeby nie sugerowac oddzielnego okna dostepu do obiektu.
Usunieto:
- Aktywne komunikaty i blokady walidacyjne typu `godziny serwisu sa poza ogolnym dostepem do obiektu`, `dzien bez dostepu do obiektu` oraz blokade przekroczenia okna dostepu.
- Nieaktywna funkcje `ordersAccessWindowMinutes`.
- Stare helpery okien dostepu `ordersAccessWindow*` / `ordersWeeklyAccessWindows*`, ktore mogly sugerowac, ze formularz nadal ma osobna logike dostepu do obiektu.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko istniejace ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Pola techniczne `accessStartTime`, `accessEndTime` i puste `accessWindows` pozostaja przy zapisie tylko dla zgodnosci ze starymi rekordami. Nie steruja juz formularzem ani walidacja czasu zlecenia; ich wartosc jest kopia czasu wynikajacego z kart zmian.

Data: 2026-07-07 22:59 +02:00
Autor: AI Codex
Dodano:
- Utworzono commit produkcyjny `89c72a9` z aktualnymi poprawkami portalu desktop i wypchnieto go do repozytorium `cleanzi01` na galaz `codex/pre-prod-sync-20260630-112213`.
Zmieniono:
- Wdrozenie produkcyjne App Hosting dla backendu `cleanzi-01` w projekcie `iclean-room` wykonano z commita `89c72a9f62c2050327124f1b3d9992d26b0dc2d4`.
Usunieto:
- Nic w tym wpisie dokumentacyjnym.
Testy/sprawdzenia:
- Przed wdrozeniem uruchomiono `npm.cmd run build` - build przeszedl poprawnie ze standardowymi ostrzezeniami Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko ostrzezenia CRLF.
- Utworzono kopie stanu sprzed deploya w `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-portal-20260707-223134`.
- Wykonano App Hosting rollout: `firebase apphosting:rollouts:create cleanzi-01 --project iclean-room --git-commit 89c72a9f62c2050327124f1b3d9992d26b0dc2d4 --force`.
- Sprawdzono backend `cleanzi-01`: `updateTime` ustawiony na `2026-07-07T20:53:17.271413Z`, `reconciling: false`.
- Sprawdzono produkcyjny adres `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200, tytul `Best Clean Portal`, aktywny bundle `/assets/portal-CVeiTFYw.js`, brak bledow `console.error` w smoke tescie przegladarki.
Uwagi dla nastepnej osoby:
- Firebase CLI lokalnie wymagal jednorazowego obejscia problemu certyfikatu TLS przez `NODE_TLS_REJECT_UNAUTHORIZED=0`; nie zapisano tego ustawienia na stale.

Data: 2026-07-08 00:00 +02:00
Autor: AI Codex
Dodano:
- Dodano helper `calendarTimelineOrderUsesServiceBlockTruth` w `web-app/apps/portal-web/src/features/calendar/index.js`.
Zmieniono:
- Kalendarz i pulpit, przez wspolny model `calendarTimelineVisualOrderSlots`, traktuja teraz zagniezdzone `serviceBlocks` jako kanoniczne zrodlo zmian, godzin i obsady.
- Plaskie pola `workAllocations` / `workerAllocations` sa uzywane tylko jako fallback, gdy zlecenie nie ma kompletnego modelu `serviceBlocks`.
- Alokacje zagniezdzone w konkretnej zmianie dostaja `serviceBlockId`, `serviceBlockKind`, date i godziny z wlasnego `serviceBlock`, aby nie dziedziczyc przypadkiem danych z innej zmiany albo koszyka `Task`.
Usunieto:
- Usunieto nieuzywany helper `calendarTimelineAllocationHasServiceAnchor`, poniewaz nie decyduje juz o wyborze zrodla prawdy dla wyswietlania zmian.
Testy/sprawdzenia:
- Wykonano `git fetch --all --prune`; lokalna galaz `codex/pre-prod-sync-20260630-112213` nie byla za `cleanzi01/main` i ma lokalne commity ahead.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko standardowe ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
Uwagi dla nastepnej osoby:
- To jest etap aplikacyjny bez migracji bazy. `public.task` nadal jest koszykiem zapisu, ale widoki czytaja szczegoly zmian z `serviceBlocks`.
- Kolejny etap powinien zaprojektowac trwały kanoniczny model danych dla pojedynczych zmian/zadan i dopiero potem posprzatac stare pola/fallbacki w bazie.

Data: 2026-07-07 23:35 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` poprawiono dobor godzin planowanych paskow w kalendarzu i na pulpicie.
- Generator osi czasu bierze teraz godziny z konkretnej karty zmiany/serviceBlock, do ktorej nalezy dana osoba, zamiast splaszczac obsade do pierwszej zmiany albo do ogolnych godzin zlecenia.
- Dla zlecen z wieloma zmianami w jednym dniu niezakotwiczone, plaskie `workAllocations` nie sa juz traktowane jako zrodlo godzin, jesli dostepne sa obsady zagniezdzone w `serviceBlocks`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko ostrzezenie CRLF.
Uwagi dla nastepnej osoby:
- Pulpit korzysta z `calendarTimelineVisualOrderSlots`, dlatego ta sama poprawka obejmuje widok `Os dnia dzisiejszego` i glowny kalendarz.
- Cofniecie zmiany wymaga przywrocenia poprzedniego priorytetu godzin w `calendarTimelineServiceBlockAllocations`, `calendarTimelineServiceBlockTimingForAllocation` i `calendarTimelineVisualOrderSlots`.

Data: 2026-07-07 23:49 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- Wdrozenie produkcyjne App Hosting dla backendu `cleanzi-01` w projekcie `iclean-room` wykonano z commita `5ecd9683c94dd144b85b10b46c4479b0556f4c17`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed wdrozeniem utworzono kopie stanu w `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-service-block-times-20260707-233725`.
- Przed wdrozeniem uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Przed wdrozeniem uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Przed wdrozeniem uruchomiono `git diff --check` - brak bledow diffu, tylko ostrzezenia CRLF.
- Przed wdrozeniem wykonano `git fetch cleanzi01 main`; remote `main` nie mial nowszych commitow wzgledem lokalnej bazy pracy.
- Wykonano App Hosting rollout: `firebase apphosting:rollouts:create cleanzi-01 --project iclean-room --git-commit 5ecd9683c94dd144b85b10b46c4479b0556f4c17 --force`.
- Sprawdzono backend `cleanzi-01`: `updateTime` ustawiony na `2026-07-07T21:43:47.974721Z`, `reconciling: false`.
- Sprawdzono produkcyjny adres `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200, tytul `Best Clean Portal`, aktywny bundle `/assets/portal-D1gtF6au.js`.
Uwagi dla nastepnej osoby:
- Firebase CLI lokalnie wymagal jednorazowego obejscia problemu certyfikatu TLS przez `NODE_TLS_REJECT_UNAUTHORIZED=0`; nie zapisano tego ustawienia na stale.
- W razie cofniecia aplikacji uzyc kopii backupu powyzej oraz commita sprzed deploya `5960962`.

Data: 2026-07-08 00:24 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` dodano deduplikacje gotowych alokacji osi czasu przed narysowaniem paskow kalendarza.
- Deduplikacja dziala tylko dla wierszy pracownikow i porownuje pracownika, date, godzine start/stop oraz czas trwania, zeby nie rysowac dwa razy tego samego planowanego slotu.
- Sloty BUFORU nie sa deduplikowane, poniewaz kilka podobnych paskow w BUFORZE moze oznaczac kilka osob do obsadzenia.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
Uwagi dla nastepnej osoby:
- Poprawka nie zmienia danych w bazie i nie robi migracji rekordow; usuwa tylko wizualne podwojne paski wynikajace z rownolegle obecnych alokacji w `serviceBlocks` i `workAllocations`.

Data: 2026-07-07 23:12 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/dashboard/index.js` wylaczono modalny popup pulpitu `Pracownicy pojawili sie po czasie`.
- Dane o spoznionym rozpoczeciu pracy pozostaja widoczne w kartach/grafiku pulpitu, ale system nie zaslania juz ekranu dodatkowym oknem informacyjnym.
Usunieto:
- Z modulu pulpitu usunieto tworzenie elementu `dashScheduleLateAlert` oraz nieuzywane helpery kolejki/deduplikacji tego popupu.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/dashboard/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko ostrzezenie CRLF.
Uwagi dla nastepnej osoby:
- Cofniecie tej zmiany wymaga przywrocenia funkcji tworzacej modal `dashScheduleLateAlert` w `dashboardShowScheduleLateStartAlert`.

Data: 2026-07-07 23:20 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- Wdrozenie produkcyjne App Hosting dla backendu `cleanzi-01` w projekcie `iclean-room` wykonano z commita `37b680b7104db1f0492afd2b1dfb27ad0c1d56ff`.
Usunieto:
- Z produkcyjnego bundla portalu usunieto modalny popup `Pracownicy pojawili sie po czasie`.
Testy/sprawdzenia:
- Przed wdrozeniem utworzono kopie stanu w `C:\Users\rafal\Desktop\app-to-react-backups\pre-deploy-remove-late-popup-20260707-231346`.
- Wykonano App Hosting rollout: `firebase apphosting:rollouts:create cleanzi-01 --project iclean-room --git-commit 37b680b7104db1f0492afd2b1dfb27ad0c1d56ff --force`.
- Sprawdzono backend `cleanzi-01`: `updateTime` ustawiony na `2026-07-07T21:18:36.086360Z`, `reconciling: false`.
- Sprawdzono produkcyjny adres `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200, aktywny bundle `/assets/portal-MlN_MvWy.js`, brak tekstu `Pracownicy pojawili` w produkcyjnym JS.
Uwagi dla nastepnej osoby:
- Firebase CLI lokalnie wymagal jednorazowego obejscia problemu certyfikatu TLS przez `NODE_TLS_REJECT_UNAUTHORIZED=0`; nie zapisano tego ustawienia na stale.

Data: 2026-07-08 20:47 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/orders/index.js` dodano lokalny kontekst otwarcia edytora z kalendarza: `workSlotKey`, `serviceBlockId`, `serviceBlockKind`, `serviceBlockLabel` i data wystapienia.
- Dodano helpery wyboru preferowanej karty zmiany po `serviceBlock`/`workSlotKey`, aby edytor mogl wskazac konkretna zmiane osoby zamiast pierwszej zmiany zlecenia.
Zmieniono:
- `ordersOpenEditorFromCalendar` i `ordersOpenRecurringOccurrenceEditorFromCalendar` przyjmuja teraz kontekst konkretnego paska z kalendarza.
- `calendarTimelineEditOrderFromContext` oraz podwojne klikniecie paska kalendarza przekazuja do edytora identyfikator slotu i zmiany.
- Podsumowanie terminu w edytorze wybiera godziny z dopasowanej karty zmiany, np. dla Rafala Dudka z `Druga zmiana 08:00-16:00`, a nie z pierwszej zmiany `07:00-15:00`.
- Otwarcie nowego zlecenia, zwyklej listy zlecen i standardowej edycji czysci kontekst kalendarza, zeby dane poprzedniego paska nie przechodzily na kolejne okno.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko ostrzezenia CRLF.
Uwagi dla nastepnej osoby:
- Cofniecie tej zmiany wymaga usuniecia helperow `orders*ServiceBlockContext` w `orders/index.js` oraz cofniecia przekazywania kontekstu `serviceBlock/workSlotKey` z `calendar/index.js`.

Data: 2026-07-13 19:46 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/events/index.js` rozdzielono krytyczny zapis zdarzenia od pomocniczych odswiezen historii, czasu pracownika i pulpitu.
- Po udanym zapisie bledy pomocniczych odswiezen nie przerywaja juz procesu zapisu i nie pokazuja alertu `Calendar feature is not initialized`; trafiaja do konsoli jako ostrzezenie.
- Jesli pomocnicze odswiezenie po zapisie nie powiedzie sie, portal pokazuje neutralny komunikat, ze zdarzenie zapisano i w razie potrzeby nalezy odswiezyc widoki.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Uruchomiono `node --check web-app/apps/portal-web/src/features/events/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Sprawdzono `http://localhost:5173/`: lokalny portal odpowiada HTTP 200.
- Przeklikano w przegladarce `Zdarzenia -> filtr Rafal -> Edytuj -> Zapisz` na localhost; po zapisie nie pojawil sie alert `Calendar feature is not initialized`.
Uwagi dla nastepnej osoby:
- Cofniecie tej zmiany wymaga przywrocenia bezposrednich wywolan `await reportHistoryRefreshAfterEventSave`, `await refreshWorkerAccountTimeAfterWorkdaySave` oraz `await refreshDashboardAfterEventSave`/`await refreshDashboardWidgets` w bloku zapisu zdarzenia w `events/index.js`.

Data: 2026-07-13 21:44 +02:00
Autor: AI Codex
Dodano:
- Raport wdrozenia produkcyjnego App Hosting dla portalu Cleanzi.
Zmieniono:
- Wdrozenie produkcyjne backendu App Hosting `cleanzi-01` w projekcie `iclean-room` wykonano z commita `486c81cb490d1f34a155e232f608bace9b93e6b9` (`portal: harden schedule and event flows`).
- Commit zawiera dotychczasowe poprawki kalendarza/listy zlecen oraz izolacje bledow pomocniczych odswiezen po zapisie zdarzenia.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed wdrozeniem potwierdzono, ze remote `cleanzi01/main` wskazywal na `1a3850a820ff6f8c9cb02a3f65be378f1ff26562`, czyli nie bylo nowszego commita do zaciagniecia wzgledem lokalnej bazy.
- Uruchomiono `node --check` dla `web-app/apps/portal-web/src/features/calendar/index.js`, `web-app/apps/portal-web/src/features/orders/index.js` i `web-app/apps/portal-web/src/features/events/index.js`.
- Uruchomiono `git diff --check` - brak bledow diffu, tylko ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build` - build portalu zakonczyl sie poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Wypchnieto commit `486c81c` na `cleanzi01/main` komenda `git push cleanzi01 HEAD:main`.
- Wykonano App Hosting rollout: `firebase apphosting:rollouts:create cleanzi-01 --project iclean-room --git-commit 486c81cb490d1f34a155e232f608bace9b93e6b9 --force`.
- Firebase CLI uruchomiono przez Node 24.13.1 z `--use-system-ca`, zeby uzyc systemowego magazynu CA bez wylaczania weryfikacji TLS.
- Sprawdzono backend `cleanzi-01`: `updateTime` ustawiony na `2026-07-13T19:38:38.555043Z`, `reconciling: false`.
- Sprawdzono produkcyjny adres `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200, tytul `Best Clean Portal`, aktywny bundle `/assets/portal-BG4MpGqV.js`.
- Sprawdzono produkcyjny lazy chunk `/assets/index-BTTkysu7.js`; zawiera markery poprawki `Zapisano zdarzenie` oraz `failed after event save`.
Uwagi dla nastepnej osoby:
- Cofniecie wdrozenia wymaga utworzenia nowego rollouta App Hosting na poprzedni zatwierdzony commit produkcyjny albo commit sprzed `486c81c`, po uprzednim sprawdzeniu aktualnego `cleanzi01/main`.
- Nie commitowano lokalnych katalogow tymczasowych `.codex-backups/`, `.codex-tmp/`, `_deploy_gps_start_fix/` ani `_deploy_route_sync_refresh/`.

Data: 2026-07-14 13:30 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/orders/index.js` dodano czytelny status karty osoby: etykiete `BUFOR` lub nazwisko przypisanego pracownika oraz pomocniczy opis stanu przypisania.
- W `web-app/apps/portal-web/src/index.css` dodano subtelny akcent statusu po lewej stronie karty, uporzadkowana stopke z awatarem i opisem oraz stany hover przyciskow.
Zmieniono:
- Uporzadkowano wizualnie karty osob w kroku `Zmiany i osoby`: wyrownano pola, wzmocniono hierarchie naglowka i stopki, ograniczono dekoracje oraz zachowano maksymalny promien naroznikow 8 px.
- Zmieniono etykiety formularza na krotsze i jednoznaczne: `Osoba / rola` oraz `Pracownik (opcjonalnie)`.
- Dla slotu nieobsadzonego skrocono glowna etykiete do `BUFOR`, a stan wyjasnia tekst `Oczekuje na przypisanie`.
- Dopasowano proporcje kolumn RBH i wyboru pracownika oraz responsywne skladanie pol na waskim ekranie.
Usunieto:
- Usunieto powtorzony rzad statystyk pod instrukcja zmiany; te same informacje pozostaja w naglowku zmiany i na karcie osoby.
- Usunieto nieuzywany CSS `.orders-kanban-column-stats` oraz zwiazane z nim nieuzywane zmienne renderowania.
Testy/sprawdzenia:
- Potwierdzono przed praca, ze lokalny `HEAD` i `cleanzi01/main` wskazuja ten sam commit `77b6412` i nie ma nowszej wersji do pobrania.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/orders/index.js`.
- Uruchomiono `git diff --check` - brak bledow diffu, pozostaly jedynie ostrzezenia CRLF.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Sprawdzono `http://localhost:5173/` w przegladarce: formularz `Dodaj zlecenie -> Zmiany i osoby` renderuje pelna karte bez poziomego przelewania i bez zapisywania danych.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy wylacznie prezentacji formularza zlecenia; nie zmieniono identyfikatorow pol, obslugi zdarzen, walidacji, zapisu ani zrodla danych.
- Cofniecie wymaga usuniecia tego wpisu oraz przywrocenia poprzednich fragmentow `ordersServiceBlockSlotsHtml` w `orders/index.js` i stylow `.orders-kanban-slot-*` w `index.css`.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-15 23:33:46 +02:00
Autor: AI Codex
Temat: Bezpieczne przypisanie zlecenia z BUFORU do wolnego czasu pracownika
Dodano:
- Dedykowana sciezke drag/drop tylko dla zlecen BUFOR -> pracownik. Nie korzysta ona ze starego mechanizmu przesuwania, dzielenia ani przebudowywania zlecen.
- System wylicza zajete przedzialy pracownika dla wskazanego dnia i szuka najblizszego wolnego okna, w ktorym miesci sie cala dlugosc przeciaganego zlecenia.
- Podglad upuszczenia wskazuje rzeczywiste wolne miejsce. Jesli pelny czas zlecenia nie miesci sie w dniu pracownika, upuszczenie jest blokowane.
- Bezposrednio przed zapisem pobierane sa swieze zlecenia i ponownie wykonywana jest kontrola dostepnosci.
- Dodano kontrole niezmiennosci istniejacych przydzialow: przed zapisem porownywane sa osoba, dzien, godziny, czas i identyfikatory kazdego wczesniej przypisanego slotu.
Zmieniono:
- Zapis dotyczy tylko dokladnie wskazanego slotu BUFORU. Pozostale zlecenia i przydzialy sa scalane z pelnym, aktualnym zestawem przed wyslaniem do backendu.
- Ujednolicono identyfikacje slotu przez allocation identity, serviceBlockId i workSlotId, aby kilka slotow BUFORU nie bylo mylonych ze soba.
- Dla bloku zawierajacego juz przypisane osoby godziny bloku sa nieruchome. Zmiana godziny jest mozliwa tylko dla bloku skladajacego sie w calosci ze slotow BUFORU.
Naprawiono:
- Usunieto filtr, ktory po przypisaniu jednego slotu kasowal pozostale sloty BUFORU z work_allocations.
- Usunieto awaryjne wybieranie pierwszego slotu z row=0, ktore moglo zmienic inne zlecenie niz przeciagane.
- Zlecenia przypisane przed operacja sa traktowane jako zajete i nie moga byc przesuwane, nadpisywane, skracane ani usuwane przez ten drag/drop.
Testy/sprawdzenia:
- `npm.cmd run build` zakonczyl sie poprawnie (Vite build, pozostalo standardowe ostrzezenie o duzych chunkach).
- `git diff --check` nie wykazal bledow; pozostaly jedynie ostrzezenia CRLF.
- `http://localhost:5173/` odpowiada HTTP 200.
- Pelnego automatycznego dropu w przegladarce nie wykonano, poniewaz narzedzie Browser nie uruchomilo klienta z powodu konfliktu w jego srodowisku runtime. Nie wykonywano zastepczych zapisow na danych firmy.
Kopia i cofniecie:
- Kopia stanu sprzed tej poprawki: `.codex-backups/calendar-buffer-safe-drop-20260715-104620`.
- Aby cofnac tylko te zmiane, przywroc z kopii `web-app/apps/portal-web/src/features/calendar/index.js`; nie przywracaj innych plikow bez porownania, poniewaz zawieraja wczesniejsze zmiany robocze.
Uwagi:
- Nie zmieniono danych pracownikow, rekordow czasu pracy ani zdarzen START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-14 14:24 +02:00
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/index.css` poprawiono wysokosc zewnetrznej karty zmiany w formularzu `Dodaj/Edytuj zlecenie -> Zmiany i osoby`.
- Karta zmiany zachowuje dotychczasowa minimalna wysokosc widoku, ale teraz rosnie do wysokosci swojej zawartosci, dzieki czemu biale tlo i obramowanie obejmuja wszystkie karty osob oraz przycisk `Dodaj osobe`.
- Zmiana jest ograniczona do `.orders-kanban-column`; nie zmienia wygladu pustej kolumny `Dodaj zmiane` ani mechanizmu przewijania formularza.
Usunieto:
- Nic.
Testy/sprawdzenia:
- Przed zmiana wykonano `git fetch cleanzi01 main --prune`; lokalny `HEAD` i `cleanzi01/main` nie wykazaly rozbieznosci (`0 0`).
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostaly standardowe ostrzezenia Vite o duzych chunkach.
- Uruchomiono `git diff --check` - brak bledow diffu, pozostaly jedynie ostrzezenia CRLF.
- Sprawdzono `http://localhost:5173/` - lokalny portal odpowiada HTTP 200.
Uwagi dla nastepnej osoby:
- Zmiana dotyczy wylacznie ukladu CSS; nie zmieniono formularza, walidacji, danych, API ani zapisu zlecen.
- Cofniecie wymaga usuniecia reguly `.orders-kanban-column` dodanej obok ustawien szerokosci kolumn w `web-app/apps/portal-web/src/index.css`.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-14 22:21 +02:00
Autor: AI Codex
Dodano:
- W `web-app/apps/portal-web/src/features/calendar/index.js` dodano podglad miejsca upuszczenia zlecenia z BUFORU: wskazuje docelowego pracownika oraz wyliczony zakres godzin po przesunieciu z dokladnoscia do 15 minut.
- W `web-app/apps/portal-web/src/index.css` dodano czytelny stan podgladu poprawnego i niedozwolonego upuszczenia.
Zmieniono:
- Przeciaganie na kalendarzu rozpoczyna sie tylko dla planowanego zlecenia znajdujacego sie w BUFORZE; zielone paski rzeczywistego czasu pracy i zlecenia juz przypisane nie uruchamiaja tej sciezki.
- Upuszczenie jest dozwolone tylko na wierszu pracownika. Pozycja pozioma wskazuje nowa godzine START, czas trwania pozostaje bez zmian, a STOP jest wyliczany z zachowanej dlugosci zlecenia.
- Walidacja konfliktu sprawdza inne zaplanowane zlecenia pracownika. Rzeczywiste paski START/STOP nie blokuja przypisania.
- Dla zlecenia cyklicznego zapis z kalendarza nadal tworzy lub aktualizuje wyjatek tylko dla wskazanego dnia; nie zmienia reguly calej serii.
- Zapis wykorzystuje istniejacy mechanizm informacji `Przenosze zlecenie...` i odswiezenia danych po powodzeniu.
Usunieto:
- Usunieto zapisywanie zlecenia z awaryjnej obslugi `dragend`; zapis nastepuje tylko po rzeczywistym, poprawnym upuszczeniu.
- W nowej sciezce BUFOR -> pracownik pominieto stare pytania o zakres serii i zakres przypisania.
Testy/sprawdzenia:
- Przed praca potwierdzono, ze lokalny `HEAD` i produkcyjny remote `cleanzi01/main` wskazuja ten sam commit `77b6412` (`0 0`). Nowszego kodu produkcyjnego do polaczenia nie bylo.
- `origin/main` wskazuje inna, niekompatybilna historie projektu (`b88a7d3`) i nie zostal scalony ani pobrany do biezacej galezi.
- Uruchomiono `node --check web-app/apps/portal-web/src/features/calendar/index.js`.
- Uruchomiono `npm.cmd run build` - build portalu przeszedl poprawnie; pozostalo standardowe ostrzezenie Vite o duzym chunku.
- Uruchomiono `git diff --check` - brak bledow diffu, pozostaly jedynie ostrzezenia CRLF.
- Sprawdzono `http://localhost:5173/` w przegladarce: pasek `12:00-14:00 Best Clean` w BUFORZE jest jedynym przeciagalnym zleceniem, a widok nie pokazuje bledu ani aktywnego zapisu.
- Nie wykonano pelnego upuszczenia na realnego pracownika, poniewaz testowy Rafal Dudek znajdowal sie daleko na przewijanej liscie, a przegladarka testowa nie przewijala widoku podczas trzymania paska. Pozwolilo to uniknac przypadkowej zmiany danych innej osoby.
Uwagi dla nastepnej osoby:
- Zmiana nie modyfikuje rekordow dnia pracy, zdarzen START/STOP ani aplikacji mobilnej. Dotyczy tylko zlecen grafiku w kalendarzu.
- Cofniecie wymaga usuniecia helperow `calendarTimelineBufferDragOptions`, `calendarTimelineClearDropPreview`, `calendarTimelinePreviewSlot`, `calendarTimelineShowDropPreview`, zmian obslugi `dragstart`/`dragover`/`drop`/`dragend` w `calendar/index.js` oraz stylow `.calendar-timeline-drop-preview` w `index.css`.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-16 12:47:47 +02:00
Autor: AI Codex
Temat: Zachowanie punktu zlapanej czesci paska przy BUFOR -> pracownik
Dodano:
- W `web-app/apps/portal-web/src/features/calendar/index.js` dodano obliczanie odleglosci kursora od poczatku przeciaganego paska w slotach 15-minutowych.
- Punkt zaczepienia jest przechowywany w stanie przeciagania oraz w `DataTransfer`, aby podglad i finalny zapis uzywaly tej samej godziny.
Zmieniono:
- Pozycja kursora podczas przeciagania nie oznacza juz automatycznie godziny START. System odejmuje miejsce, za ktore uzytkownik zlapal pasek.
- Upuszczenie pod godzina 18:00 daje START 18:00 niezaleznie od tego, czy pasek zostal zlapany za poczatek, srodek czy koniec.
- Korekta dotyczy tylko sciezki BUFOR -> pracownik. Nie zmieniono ochrony istniejacych zlecen ani mechanizmu szukania wolnego przedzialu.
Usunieto:
- Nic.
Testy/sprawdzenia:
- `node --check web-app/apps/portal-web/src/features/calendar/index.js` zakonczyl sie poprawnie.
- `npm.cmd run build` zakonczyl sie poprawnie; pozostalo standardowe ostrzezenie Vite o duzych chunkach.
- `git diff --check` nie wykazal bledow; pozostaly jedynie ostrzezenia CRLF.
- `http://localhost:5173/` odpowiada HTTP 200.
- Pelnego zapisu drag/drop nie wykonano automatycznie, poniewaz sterowanie przegladarka localhost jest zablokowane polityka srodowiska. Nie wykonywano zastepczych zmian danych firmy.
Kopia i cofniecie:
- Kopia stanu sprzed poprawki: `.codex-backups/calendar-buffer-drag-anchor-20260716-123716`.
- Aby cofnac tylko te zmiane, przywroc `calendar-index.js` z tej kopii do `web-app/apps/portal-web/src/features/calendar/index.js`; przed przywroceniem porownaj pliki, aby zachowac pozniejsze zmiany.
Uwagi:
- Nie zmieniono danych pracownikow, rekordow czasu pracy ani zdarzen START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-16 14:07:11 +02:00
Autor: AI Codex
Temat: Godzina START wskazywana bezposrednio kursorem przy BUFOR -> pracownik
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` uproszczono wyliczanie miejsca upuszczenia zlecenia z BUFORU.
- Pozycja kursora na osi czasu ponownie oznacza bezposrednio oczekiwana godzine START zlecenia. Podglad i finalny zapis korzystaja z tego samego, nieprzesunietego slotu.
- Pozostawiono mechanizm wyszukiwania najblizszego pelnego wolnego przedzialu. Istniejace zlecenia pracownika nadal sa traktowane jako zajete i nie moga zostac zastapione ani usuniete przez drop.
- Czerwone obramowanie nadal oznacza faktyczny wiersz pracownika znajdujacy sie pod kursorem.
Usunieto:
- Usunieto stan `calendarTimelineDragGrabOffsetSlots`, helper korekty punktu zaczepienia oraz pole `application/x-calendar-grab-offset-slots` z `DataTransfer`.
- Usunieto odejmowanie miejsca, za ktore uzytkownik zlapal pasek. Eliminuje to opozniony i przesuniety wzgledem kursora podglad godziny.
Testy/sprawdzenia:
- `node --check web-app/apps/portal-web/src/features/calendar/index.js` zakonczyl sie poprawnie.
- `npm.cmd run build` zakonczyl sie poprawnie; pozostalo standardowe ostrzezenie Vite o duzych chunkach.
- `git diff --check` nie wykazal bledow; pozostaly jedynie ostrzezenia CRLF.
- `http://localhost:5173/` odpowiada HTTP 200.
- Nie wykonano automatycznego zapisu drag/drop na danych firmy; korekta zostala sprawdzona skladniowo, przez build i dzialajacy localhost.
Kopia i cofniecie:
- Kopia stanu sprzed tej korekty: `.codex-backups/calendar-buffer-start-at-cursor-20260716-135558/calendar-index.js`.
- Aby cofnac tylko te zmiane, po porownaniu plikow przywroc wskazana kopie do `web-app/apps/portal-web/src/features/calendar/index.js`.
Uwagi:
- Nie zmieniono danych pracownikow, rekordow czasu pracy ani zdarzen START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-16 14:56:10 +02:00
Autor: AI Codex
Temat: Utrzymanie przypisania BUFOR -> pracownik po zapisie
Dodano:
- W wywolaniu zapisu po poprawnym upuszczeniu przekazywane jest teraz swiezo zmienione zlecenie jako `retainLocalOrders`.
Zmieniono:
- Odpowiedz backendu po zapisie jest scalana ze swiezszym lokalnym stanem przypisania. Starsza odpowiedz nie moze juz natychmiast przywrocic slotu do BUFORU.
- Ochrona dotyczy tylko rekordu zmienionego przez konkretne upuszczenie. Nie zmienia innych zlecen, godzin pracy pracownikow ani zdarzen START/STOP.
Usunieto:
- Nic.
Testy/sprawdzenia:
- `node --check web-app/apps/portal-web/src/features/calendar/index.js` zakonczyl sie poprawnie.
- `npm.cmd run build` zakonczyl sie poprawnie; pozostalo standardowe ostrzezenie Vite o duzych chunkach.
- `git diff --check` nie wykazal bledow; pozostaly jedynie ostrzezenia CRLF.
- `http://localhost:5173/` odpowiada HTTP 200.
- Pelnego zapisu drag/drop nie wykonano automatycznie, poniewaz narzedzie sterowania przegladarka nie bylo dostepne w tej sesji. Zmiana jest serwowana przez HMR na localhost i wymaga koncowego sprawdzenia przez upuszczenie testowego zlecenia.
Kopia i cofniecie:
- Kopia stanu sprzed poprawki: `.codex-backups/calendar-buffer-drop-persistence-20260716-145610/calendar-index.js`.
- Aby cofnac tylko te zmiane, po porownaniu plikow przywroc wskazana kopie do `web-app/apps/portal-web/src/features/calendar/index.js`.
Uwagi:
- Nie zmieniono danych pracownikow, rekordow czasu pracy, aplikacji mobilnej ani mechanizmu planowania istniejacych zlecen.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-16 17:22:40 +02:00
Autor: AI Codex
Temat: Spojne przypisanie zlecenia po przeniesieniu z BUFORU do pracownika
Dodano:
- Nic.
Zmieniono:
- W `web-app/apps/portal-web/src/features/calendar/index.js` kalendarz traktuje zapisane `workAllocations` lub `workerAllocations` jako kanoniczne zrodlo przypisanej osoby.
- `serviceBlocks` nadal dostarcza strukture zmiany, date i godziny, ale nie moze juz nadpisac swiezego przypisania pracownika starszym slotem `BUFOR`.
- W `web-app/apps/portal-web/src/features/orders/index.js` normalizacja blokow zmiany zawsze naklada kanoniczne alokacje zlecenia na zapisane sloty przed odbudowaniem danych pochodnych.
- Usunieto rozbieznosc, w ktorej lista zlecen pokazywala `Kowalski Jan`, a kalendarz po ponownym odczycie nadal umieszczal to samo zlecenie w BUFORZE.
Usunieto:
- Nic.
Testy/sprawdzenia:
- `node --check web-app/apps/portal-web/src/features/orders/index.js` zakonczyl sie poprawnie.
- `node --check web-app/apps/portal-web/src/features/calendar/index.js` zakonczyl sie poprawnie.
- `npm.cmd run build` zakonczyl sie poprawnie; pozostalo standardowe ostrzezenie Vite o duzych chunkach.
- `git diff --check` nie wykazal bledow; pozostaly jedynie ostrzezenia CRLF.
- `http://localhost:5173/` odpowiada HTTP 200.
- W repozytorium nie znaleziono istniejacego testu jednostkowego obejmujacego ten konkretny przeplyw BUFOR -> pracownik.
Kopia i cofniecie:
- Kopia kalendarza sprzed korekty: `.codex-backups/calendar-work-allocation-priority-20260716-163456/calendar-index.js`.
- Kopia normalizacji zlecen sprzed korekty: `.codex-backups/orders-allocation-overlay-20260716-171212/orders-index.js`.
- Przy cofaniu nalezy najpierw porownac kopie z aktualnymi plikami, aby nie utracic pozniejszych zmian.
Uwagi:
- Nie zmieniono danych pracownikow, czasu pracy, zdarzen START/STOP ani aplikacji mobilnej.
- Nie wykonano zapisu testowego na danych firmy, commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-16 23:57:29 +02:00
Autor: AI Codex
Temat: Przenoszenie zlecen jednorazowych miedzy osoba, dniem i godzina w kalendarzu
Dodano:
- W `web-app/apps/portal-web/src/features/calendar/index.js` dodano osobna sciezke drag/drop dla juz przypisanych zlecen jednorazowych.
- Zlecenie jednorazowe mozna w jednym widoku kalendarza przeniesc do innej osoby, na inny dzien oraz na inna godzine.
- Podczas przenoszenia zachowywany jest pierwotny czas trwania zlecenia.
- Przed zapisem wykonywany jest swiezy odczyt zrodla oraz ponowna kontrola typu zlecenia i kolizji.
Zmieniono:
- Kalendarz rozroznia teraz przeciaganie z BUFORU od zmiany polozenia juz przypisanego zlecenia jednorazowego.
- Dla zlecen jednorazowych podglad miejsca upuszczenia pokazuje dokladna osobe, dzien i godziny wynikowe.
- Upuszczenie jest blokowane, gdy wskazany pracownik ma w tym czasie inne zaplanowane zlecenie.
- Istniejace przypisania pozostaja nietkniete; przy zleceniu wieloosobowym zmieniane jest tylko przeciagane przypisanie.
- Zlecenia cykliczne i dzienne wyjatki serii nie sa przeciagalne w tej sciezce.
- Przy zmianie wpisu z BUFORU na pracownika klucz alokacji jest budowany z identyfikatora pracownika zamiast zachowywac klucz `buffer:*`.
Usunieto:
- Nic.
Testy/sprawdzenia:
- `node --check web-app/apps/portal-web/src/features/calendar/index.js` zakonczyl sie poprawnie.
- `git diff --check -- web-app/apps/portal-web/src/features/calendar/index.js` nie wykazal bledow; pozostalo tylko standardowe ostrzezenie CRLF.
- `npm.cmd run build` zakonczyl sie poprawnie (`vite build`, 375 modulow, 22.02 s).
- `http://127.0.0.1:5173/` odpowiada HTTP 200.
- Nie wykonano automatycznego zapisu drag/drop na danych firmy, poniewaz narzedzie sterowania przegladarka nie bylo dostepne w tej sesji.
Kopia i cofniecie:
- Kopia stanu sprzed zmiany: `.codex-backups/calendar-oneoff-general-drag-20260716-212142/calendar-index.js`.
- Kopia `ReadMe.txt` sprzed zmiany znajduje sie w tym samym katalogu kopii.
- Przy cofaniu nalezy najpierw porownac kopie z aktualnym plikiem, aby nie utracic pozniejszych zmian innych osob.
Uwagi:
- Zmiana jest dostepna tylko na localhost i dotyczy wylacznie portalu.
- Nie zmieniono danych pracownikow, czasu pracy, zdarzen START/STOP ani aplikacji mobilnej.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-17 11:59:10 +02:00
Autor: AI Codex
Temat: Blokada recznej edycji wlasnego czasu pracy wedlug numeru Workera
Dodano:
- Dodano wspolna polityke dostepu w `web-app/apps/portal-web/src/features/workers/workdayEditAccess.js`.
- Tozsamosc pracownika jest porownywana wylacznie przez kanoniczny numer Workera (`workerId`, np. `W001`). Login, e-mail, UID i imie sluza jedynie do jednoznacznego odnalezienia numeru Workera zalogowanej osoby.
- Dodano wyjatek administracyjny dla numeru Workera `W001` (Rafal Dudek), ktory moze edytowac czas pracy kazdej osoby, w tym swoj.
Zmieniono:
- W `web-app/apps/portal-web/src/auth/authService.js` sesja portalu jest uzupelniana o kanoniczny `workerId` z rekordu pracownika. Dopasowanie pomocnicze po UID, e-mailu, loginie lub nazwie jest akceptowane tylko wtedy, gdy wskazuje jeden rekord.
- W `web-app/apps/portal-web/src/features/workers/time-detail/index.js` zablokowano otwarcie i zapis recznej edycji wlasnego dnia pracy dla kazdego Workera poza `W001`.
- W `web-app/apps/portal-web/src/features/workers/account/index.js` zastosowano taka sama blokade przy otwieraniu i zapisie edytora czasu pracy.
- Przy probie niedozwolonej edycji portal wyswietla komunikat: `Brak dostepu do edycji wlasnego czasu pracy.`
Usunieto:
- Nic.
Testy/sprawdzenia:
- Targetowany ESLint dla zmienionych plikow zakonczyl sie poprawnie.
- Macierz testowa polityki dostepu potwierdzila: zwykly Worker nie edytuje siebie, moze edytowac inna osobe, `W001` moze edytowac wszystkich, a sama nazwa Rafal Dudek bez `W001` nie daje wyjatku.
- `npm.cmd run build` zakonczyl sie poprawnie (Vite, 376 modulow).
- Nie wykonywano zapisu testowego na danych firmy.
Kopia i cofniecie:
- Kopia stanu sprzed zmiany znajduje sie w `.codex-backups/20260717-105932`.
- Kopia obejmuje wszystkie istniejace pliki zmienione w ramach tej poprawki oraz `ReadMe.txt`.
- Przy cofaniu nalezy najpierw porownac kopie z aktualnymi plikami, aby nie utracic pozniejszych zmian innych osob.
Uwagi:
- Blokada dotyczy tylko recznych formularzy edycji czasu pracy w portalu.
- Nie zmieniono aplikacji mobilnej ani automatycznych zapisow START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-17 14:11:23 +02:00
Autor: AI Codex
Temat: Pakiet produkcyjny portalu - kalendarz, zlecenia i kontrola edycji czasu
Stan bazowy:
- Przed przygotowaniem wdrozenia wykonano `git fetch cleanzi01 main --prune`.
- Lokalny HEAD i `cleanzi01/main` wskazywaly ten sam commit bazowy: `77b64129b626dc76c64e98ae42e04377f327235d`.
- Wynik porownania `HEAD...cleanzi01/main` wynosil `0 0`; nie bylo nowszych zmian innych osob do scalenia.
Dodano:
- Wspolna polityke blokady recznej edycji wlasnego czasu pracy oparta o kanoniczny numer Workera.
- Pelny wyjatek administracyjny tylko dla Workera `W001` (Rafal Dudek).
Zmieniono:
- Ujednolicono obsluge przypisan zlecen miedzy lista, edytorem i kalendarzem, z priorytetem kanonicznych alokacji pracownika.
- Poprawiono zachowanie BUFOR -> pracownik oraz przenoszenie przypisanych zlecen jednorazowych z zachowaniem istniejacych zlecen i kontroli kolizji.
- Sesja portalu przenosi kanoniczny `workerId`, a formularze czasu pracy kontroluja uprawnienie przed otwarciem i przed zapisem.
- Uporzadkowano kod formularza zlecen przez usuniecie nieuzywanych funkcji starego wzorca tygodniowego.
Usunieto:
- Nieaktywne funkcje starego interfejsu wzorca tygodniowego, ktore nie byly wywolywane przez aktualny formularz.
Testy/sprawdzenia:
- Test polityki Worker ID: 4/4 scenariusze zakonczone poprawnie.
- `node --check` zakonczyl sie poprawnie dla wszystkich zmienionych plikow JavaScript.
- Targetowany ESLint dla zmienionych modulow portalu zakonczyl sie bez bledow.
- `git diff --check` nie wykazal bledow; pozostaly jedynie standardowe ostrzezenia CRLF.
- `npm.cmd run build` zakonczyl sie poprawnie (Vite 7.3.1, 376 modulow, 26.10 s); pozostalo standardowe ostrzezenie o duzych chunkach.
- Lokalny portal pod `http://localhost:5173/` odpowiedzial HTTP 200, a zalogowany pulpit zostal otwarty w przegladarce bez zapisu danych.
Kopia i cofniecie:
- Pelna kopia stanu roboczego przed przygotowaniem wdrozenia: `C:\Users\rafal\Desktop\app to react\.codex-backups\pre-prod-complete-20260717-122739`.
- Kopia zawiera `worktree.patch`, status, metadane, `ReadMe.txt` oraz poddrzewo `web-app`.
- W razie potrzeby cofniecia nalezy wdrozyc poprzedni commit App Hosting, a pliki lokalne odtwarzac dopiero po porownaniu z kopia, aby nie utracic pozniejszych zmian.
Uwagi:
- Zmiany dotycza portalu desktopowego. Nie zmieniono aplikacji mobilnej.
- Nie wykonano operacji na rekordach czasu pracy, zdarzeniach START/STOP ani danych pracownikow podczas testow.
- Do wdrozenia ma trafic dokladnie commit utworzony z tego sprawdzonego zestawu plikow, bez katalogow kopii i plikow tymczasowych.

Data: 2026-07-17 15:08:43 +02:00
Autor: AI Codex
Temat: Wynik wdrozenia produkcyjnego portalu i punkt przywracania
Wdrozenie:
- Na produkcje wdrozono dokladnie przetestowany commit `d7968f82caaba1661fe8e96d73aa3fdf614e6e16` (`portal: harden calendar scheduling and worktime access`).
- Bezposrednio przed wdrozeniem i po nim sprawdzono `cleanzi01/main`; nie bylo nowszego commita do scalenia, a lokalny HEAD byl zgodny ze zdalnym `main`.
- App Hosting backend: `cleanzi-01`, projekt Firebase: `iclean-room`, region: `europe-west4`.
- Backend zakonczyl uzgadnianie: `reconciling: false`; czas aktualizacji: `2026-07-17T12:34:47.864071Z`.
- Adresy produkcyjne: `https://portal.cleanzi.pl/` oraz `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`.
Testy/sprawdzenia produkcji:
- Oba adresy odpowiedzialy HTTP 200 i wskazaly ten sam zestaw zasobow produkcyjnych: `portal-DbOO2JJe.js` oraz `portal-Bzrdeytm.css`.
- Produkcyjny bundle laduje modul `workdayEditAccess-DuYL73Op.js` zgodny z lokalnym, przetestowanym buildem.
- Potwierdzono w bundle polityke oparta na kanonicznym `workerId`, wyjatek dla Workera `W001` i komunikat blokady edycji wlasnego czasu.
- W przegladarce wykonano test produkcyjny tylko do odczytu: portal otworzyl zalogowany pulpit Rafala Dudka i aktualne dane bez bledu inicjalizacji.
- Nie klikano operacji zapisujacych i nie modyfikowano danych firmy podczas testu produkcyjnego.
Kopia i cofniecie:
- Commit poprzedniej wersji do ponownego wdrozenia w razie regresji: `77b64129b626dc76c64e98ae42e04377f327235d`.
- Pelna kopia stanu sprzed przygotowania wdrozenia: `C:\Users\rafal\Desktop\app to react\.codex-backups\pre-prod-complete-20260717-122739`.
- Przywracanie zaczac od ponownego wdrozenia poprzedniego commita App Hosting; lokalne pliki odtwarzac dopiero po porownaniu z kopia.
Uwagi:
- Wdrozenie dotyczy wylacznie portalu desktopowego; aplikacja mobilna nie zostala zmieniona.
- Nie zmieniono rekordow czasu pracy, zdarzen START/STOP ani danych pracownikow.
- Katalogi kopii, pliki tymczasowe i raporty lokalne pozostaly poza commitem i wdrozeniem.
Data: 2026-07-21
Autor: AI Codex
Dodano:
- Nic.
Zmieniono:
- Usunięto z pulpitu stary panel „Grafik dnia” oparty na Google Sheets.
- Pulpit nie inicjalizuje już odświeżania ani nie porównuje godzin START z danymi Google Sheets.
- „Oś dnia” nadal korzysta z rzeczywistych zdarzeń i czasu pracy pobieranych przez API, a kalendarz zleceń nadal korzysta z `task` / Data Connect.
Usunięto:
- Widoczny panel starego grafiku dnia na pulpicie.
- Zakładkę „Grafik pracy”, jej pozycję w menu i wyszukiwarce, route `schedule`, pusty widok oraz link do edytora Google Sheets.
- Moduł `features/schedule` i style `.schedule-embed-*` używane wyłącznie przez usuniętą zakładkę.
- Usługę `scheduleService.js` z odczytem JSONP `gviz/tq`, parserem i lokalnym cache arkusza.
- Stan, odświeżanie, alerty, listenery i CSS używane wyłącznie przez stary panel.
- Wyjątki `docs.google.com` z polityki CSP dla skryptów i ramek.
Testy/sprawdzenia:
- `node --check` dla serwera, dashboardu, layoutu, aplikacji portalu, routera, szablonów widoków i stanu: OK.
- `npm.cmd --prefix web-app run build`: OK (Vite, 375 modulow).
- `npm.cmd test`: OK, ale repozytorium nie zawiera obecnie testow automatycznych (0 testow).
- ESLint plikow objetych zmiana: pozostaje 1 wczesniejszy, niezwiązany z grafikiem blad `no-unused-vars` dla `openDashboardActivityEventEditor` w dashboardzie.
- Kontrola źródeł: brak `Grafik pracy`, `view-schedule`, `features/schedule`, `.schedule-embed-*`, adresu arkusza i odczytu `gviz/tq` w kanonicznym portalu.
- Localhost po pełnym przeładowaniu: brak aktywnej sesji i widoczny ekran logowania; w zamontowanym DOM 0 elementów starej zakładki, brak zasobów Google Sheets oraz brak nowych błędów i ostrzeżeń konsoli.
Uwagi dla następnej osoby:
- Nie przywracać starego panelu ani pustej zakładki Google Sheets. Grafik zleceń pozostaje oparty na danych `task` / Data Connect.
- Nie wykonano wdrożenia ani żadnej operacji na danych produkcyjnych.

Data: 2026-07-22
Autor: AI Codex
Temat: Nowy modul Przeglad na pulpicie
Dodano:
- Cztery responsywne, nieinteraktywne karty informacyjne: Pracownicy, Obiekty, Zaplanowane zlecenia i Postep ogolny.
- Pasek najblizszego zaplanowanego zlecenia z godzina, nazwa, przypisanymi pracownikami i liczba pozostalych zlecen.
Zmieniono:
- Pracownicy licza unikalne osoby z dzisiejszym aktywnym dniem pracy; stare niezamkniete dni nie zawyzaja wyniku.
- Obiekty licza unikalne miejsca z rzeczywistych, rozpoczetych lub zakonczonych dzis prac widocznych na Osi dnia.
- Zaplanowane zlecenia sa pobierane z kalendarza/Data Connect, rozwijaja cykle i sa deduplikowane po wystapieniu zlecenia, wiec wielu przypisanych pracownikow nie zawyza licznika.
- Postep ogolny pozostaje jako neutralne `—%` do czasu ustalenia wzoru w kolejnym module; nie pokazuje wymyslonej wartosci.
- Etapy ladowania pulpitu uproszczono po usunieciu starego panelu zadan, a wersje lokalnego snapshotu podniesiono do 3.
Testy/sprawdzenia:
- `node --check` dla dashboardu i layoutu: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia CRLF.
- `npm.cmd test`: OK, repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd --prefix web-app run build`: OK (Vite, 375 modulow).
- Localhost na realnym odczycie tylko do odczytu pokazal: 6 aktywnych pracownikow, 2 aktywne/wysprzatane obiekty i 5 unikalnych zaplanowanych zlecen.
- Sprawdzono desktop oraz breakpointy 1181/1180, 761/760 i 390 px; siatka kart nie powoduje wlasnego przewijania poziomego.
- Targetowany ESLint nie wykazal nowych problemow; pozostaje wczesniejszy, niezalezny blad `no-unused-vars` dla `openDashboardActivityEventEditor`.
Uwagi:
- Nie zmieniono danych firmy, zlecen, czasu pracy ani zdarzen START/STOP.
- Nie wykonano commita, pusha, wdrozenia ani zadnej operacji zapisujacej na produkcji.

Data: 2026-07-22
Autor: AI Codex
Temat: Licznik historycznych dni bez QR STOP w module Przeglad
Dodano:
- Karte `Brak QR STOP` pomiedzy kartami `Pracownicy` i `Obiekty`.
- Licznik wszystkich niezamknietych dni pracy sprzed dzisiaj; dzisiejszy dzien jest zawsze wykluczony.
Zmieniono:
- Licznik jest liczony jako pracownik-dzien, a nie jako liczba unikalnych osob: jedna osoba z trzema roznymi niezamknietymi dniami daje wynik 3.
- Wiele rekordow tej samej osoby z tego samego dnia jest deduplikowane do jednego dnia.
- Zakres pobierania nie jest juz ograniczony do ostatniego miesiaca; obejmuje dostepna historie starsza niz dzisiaj.
- Wersje lokalnego snapshotu pulpitu podniesiono do 4, aby stara wartosc nie byla wyswietlana z cache.
- Responsywna siatka ma 5 kolumn na szerokim ekranie, 3 kolumny do 1280 px, 2 kolumny do 820 px i 1 kolumne do 760 px.
Testy/sprawdzenia:
- `node --check` dla dashboardu i layoutu: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia CRLF.
- `npm.cmd test`: OK, repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow).
- Targetowany ESLint nie wykazal nowych problemow; pozostaje wczesniejszy, niezalezny blad `no-unused-vars` dla `openDashboardActivityEventEditor`.
- Localhost na odczycie tylko do odczytu pokazal 3 niezamkniete historyczne dni bez QR STOP.
- Sprawdzono progi 1281/1280, 821/820, 761/760 i 390 px; siatka kart nie powoduje wlasnego przewijania poziomego.
Uwagi:
- Nie zmieniono zadnych rekordow firmy ani statusow START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Profil klienta - wariant 1 oraz modul Koszty i rentownosc
Dodano:
- Nowa organizacja profilu klienta w czterech glownych sekcjach: `Podsumowanie`, `Operacje`, `Dokumenty i kontakt` oraz `Koszty i rentownosc`, z kompaktowym naglowkiem klienta i najwazniejszymi danymi w jednym wierszu.
- Modul finansowy per obiekt z agregatem klienta, szescioma KPI, porownaniem obiektow, struktura kosztow, planem i wykonaniem pracy, trendem 12 miesiecy, rankingiem, tabela kosztow, tabela prac okresowych, ostrzezeniami i historia zmian.
- Formularze umowy dla modeli `MONTHLY_FIXED`, `HOURLY`, `PER_SERVICE` i `MIXED`, a takze formularze kosztu, przychodu zmiennego, pelnego kosztu godziny pracownika oraz sprzetu.
- Backendowa domene rentownosci z kwotami w integer minor units, wyliczeniem kosztu pracy z START/STOP i historycznej stawki, ochrona przed podwojnym naliczeniem pracy okresowej, snapshotami, audytem oraz niezmiennoscia zamknietych okresow.
- Centralne uprawnienie `profitabilityModule` dla PRO i ENTERPRISE oraz rozdzielenie praw odczytu, edycji i zamykania okresu. Pracownik liniowy pozostaje bez dostepu; koordynator wymaga osobnego grantu.
- Migracja `dataconnect/migrations/20260722_profitability_domain.sql` zostala przygotowana wylacznie do przegladu. Nie zostala uruchomiona.
Zmieniono:
- Brak stawki, brak STOP, brak przychodu wymaganego przez model lub starsza obecnosc bez mapowania do obiektu oznaczaja `Niepelne dane`; nie sa zamieniane na sztuczne zero.
- Trend korzysta wylacznie z najnowszych snapshotow lub korekt w zamknietych okresach. Bez historii interfejs pokazuje jawny stan pusty.
- Konfiguracja ESLint pomija wygenerowane katalogi `dist*`; usunieto dwa osierocone, nieuzywane odniesienia w zrodlach, dzieki czemu lint kodu zrodlowego przechodzi.
- Lokalny fixture testowy jest dostepny tylko w `import.meta.env.DEV` na localhost i nie trafia do produkcyjnego buildu.
Testy/sprawdzenia:
- `npm.cmd test`: OK, 60/60 testow, w tym wzorzec 30 000 / 23 500 / 6 500 / 21,67%, wiele obiektow, zmiana stawki w polowie miesiaca, brak stawki, otwarty START, amortyzacja, prace okresowe, role i separacja organizacji.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych istniejacych chunkach.
- `node --check` dla kluczowych plikow backendu i frontendu oraz `git diff --check`: OK.
- Produkcyjny `dist` nie zawiera tekstu podgladu, fixture ani danych przykladowych.
- QA przegladarkowe objelo zakladki, wybieranie obiektu, formularze umowy/przychodu/stawki, dynamiczne modele rozliczen, puste stany oraz porownanie implementacji z wybranym wariantem 1. Szczegoly sa w `design-qa.md`.
Uwagi:
- Nie uruchomiono migracji, nie zmieniono bazy ani danych firmy, nie wykonano commita, pusha ani wdrozenia produkcyjnego.
- Po uruchomieniu migracji w osobnym, zatwierdzonym etapie modul zacznie czytac rzeczywiste dane finansowe; do tego czasu schemat nie jest aktywowany na produkcji.

Data: 2026-07-22
Autor: AI Codex
Temat: Interaktywna lista dni bez QR STOP i przejscie do edytora
Dodano:
- Kafelek `Brak QR STOP` jest natywnym przyciskiem dostepnym z myszy oraz klawiatury.
- Klikniecie otwiera pelna, przewijana liste wszystkich wczytanych historycznych dni bez STOP; nie otwiera juz automatycznie pierwszego rekordu.
- Kazdy wiersz listy ma akcje `Uzupelnij STOP i zamknij dzien` i prowadzi do istniejacego edytora czasu pracy wybranego pracownika oraz dnia.
- Obsluge `aria-expanded`, focusu pierwszego rekordu, klawisza Escape i zamykania po kliknieciu poza lista.
Zmieniono:
- Dla metryki `openStartStopYesterday` usunieto limit 24 pozycji w widoku listy; wysokosc pozostaje ograniczona, a lista jest przewijana.
- Tytul listy wyjasnia, ze nalezy wybrac dzien do uzupelnienia.
- Poprawiono separator danych w wierszach listy oraz dodano jednoznaczny opis akcji.
- Zachowano istniejacy mechanizm edycji: wpisanie konca pracy i zapis ustawia Workday jako `CLOSED`; nie tworzy historycznego skanu QR STOP.
Testy/sprawdzenia:
- `node --check` dla dashboardu i layoutu: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia CRLF.
- `npm.cmd test`: OK, repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow).
- Targetowany ESLint nie wykazal nowych problemow; pozostaje wczesniejszy, niezalezny blad `no-unused-vars` dla `openDashboardActivityEventEditor`.
- Localhost pokazal 3 pozycje listy. Wybranie pierwszej otworzylo edytor dnia 21.07.2026 z istniejacym START i pustym STOP.
- Edytor zamknieto przyciskiem anulowania, a na pulpit wrocono bez zapisu; licznik pozostal 3.
- Sprawdzono widok 904 x 698 oraz mobilny 390 x 844; kafelek i lista nie powoduja poziomego overflow.
- Po calej interakcji konsola przegladarki nie zawierala bledow ani ostrzezen.
Uwagi:
- Test byl tylko do odczytu. Nie klikano `Zapisz` i nie zmieniono danych firmy.
- Faktyczny zapis jest dostepny tylko dla uprawnionej roli i recznie zamyka Workday; nie falszuje zdarzenia skanowania QR.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Interaktywne listy Pracownicy, Obiekty i Zaplanowane zlecenia
Dodano:
- Kafelki `Pracownicy`, `Obiekty` i `Zaplanowane zlecenia` sa natywnymi przyciskami i analogicznie do `Brak QR STOP` otwieraja pelne, przewijane listy odpowiadajacych im pozycji.
- Lista pracownikow pokazuje aktywne teraz osoby i prowadzi do dzisiejszego raportu czasu wybranej osoby.
- Lista obiektow pokazuje obiekty sprzatane albo wysprzatane dzisiaj i prowadzi do historii wybranego klienta/obiektu.
- Lista zaplanowanych zlecen pokazuje dzisiejsze zlecenia z godzinami, obiektem i obsada oraz otwiera istniejacy edytor konkretnego zlecenia.
- Dialog list ma jawny przycisk zamkniecia, cykl fokusu, obsluge Escape i przywracanie fokusu na kafelek.
Zmieniono:
- Licznik kazdego interaktywnego kafelka jest wyprowadzany z tej samej kolekcji co jego lista, dlatego liczba zawsze odpowiada liczbie widocznych pozycji.
- Dla obiektow ujednolicono grupowanie po nazwie i kanonicznym ID, a komunikat `od` dla trwajacej pracy korzysta tylko z aktualnie aktywnej sesji.
- Dla zlecen oddzielono prawdziwe ID edytowanego zlecenia od klucza slotu; zachowany jest kontekst dnia, cyklu, wystapienia i bloku uslugi.
- Blad pobrania zlecen nie jest juz przedstawiany jako wiarygodne `0`; kafelek pokazuje `—`, a lista wylacznie komunikat bledu i nie pozwala otworzyc nieaktualnych danych z cache.
- Przejscie z kafelka do raportu oczekuje na zakonczenie zmiany trasy, dzieki czemu raport obiektu nie pozostaje w poprzednim trybie pracownika.
- `Postep ogolny` pozostaje nieinteraktywnym elementem z `—%` do czasu zdefiniowania wzoru w kolejnym module.
- Poprawiono kontrast drobnych opisow i wskaznika fokusu oraz dodano `aria-haspopup="dialog"` i spojne `aria-expanded`.
Testy/sprawdzenia:
- `node --check` dla dashboardu, raportow, layoutu, aplikacji portalu i stanu: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- `npm.cmd test`: OK, ale repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd --prefix web-app run build`: OK (Vite, 375 modulow); pozostalo standardowe ostrzezenie o duzych chunkach.
- Targetowany ESLint nie wykazal nowych problemow; pozostaje wczesniejszy, niezalezny blad `no-unused-vars` dla `openDashboardActivityEventEditor` w dashboardzie.
- Localhost na zywych danych pokazal w chwili testu: 9 aktywnych pracownikow, 3 historyczne dni bez QR STOP, 6 obiektow i 5 zaplanowanych zlecen; kazda otwarta lista miala dokladnie tyle samo wierszy co licznik.
- Sprawdzono przejscie: pracownik -> dzisiejszy raport osoby, obiekt -> historia klienta NZOZ SWIERKLANY, zlecenie -> edytor Best Clean z terminem i obsada. Wszystkie formularze zamknieto bez zapisu.
- Escape zamyka liste i oddaje fokus kafelkowi; Tab i Shift+Tab pozostaja w otwartym dialogu.
- Przy 390 x 844 px dialog zlecen mial szerokosc 370,4 px, miescil sie miedzy 10 a 380,4 px, a dokument nie mial poziomego overflow.
Uwagi:
- Gdy aktywnosci QR nie da sie powiazac z kanonicznym `clientId`, historia obiektu korzysta z istniejacego dopasowania nazwy; przy identycznych nazwach klientow potrzebne bedzie wzbogacenie danych QR o jednoznaczne ID.
- Test byl tylko do odczytu. Nie zapisano zadnych zmian w danych firmy, zleceniach ani statusach START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Trzy panele operacyjne i mapa aktywnych pracownikow
Dodano:
- Nowy wiersz trzech paneli pomiedzy modulem `Przeglad` i `Osia dnia dzisiejszego`.
- Lewy panel `Obiekty` z mala interaktywna mapa, zielonymi pinezkami aktywnych pracownikow, licznikiem `X / Y z GPS` oraz tekstowa lista wszystkich osob majacych pozycje.
- Obsluge przyblizania i oddalania mapa rolka myszy, przeciagania mapy, klawiatury i natywnych kontrolek zoomu.
- Klikniecie pracownika na liscie centruje jego pinezke, ustawia czytelne przyblizenie i otwiera dymek z osoba, obiektem oraz godzina ostatniego GPS.
- Dwa neutralne placeholdery: `Postep uslug` i `Potwierdzone ukonczenie zadan`; nie dodano jeszcze logiki ani sztucznych wskaznikow.
Zmieniono:
- Mapa korzysta z juz istniejacego loadera Google Maps z modulu zlecen; nie dodano drugiego skryptu mapy ani nowej zaleznosci produkcyjnej.
- Pinezki sa tworzone wylacznie dla unikalnych osob z dzisiejszym aktywnym dniem pracy (`isRunning`) i prawidlowa pozycja GPS. Brak GPS nie tworzy wspolrzednych zastepczych.
- Dopasowanie osoby do surowego wpisu GPS jest hierarchiczne: najpierw kanoniczne ID, potem login, a nazwa tylko wtedy, gdy jest jednoznaczna wsrod aktywnych pracownikow.
- Parser przeglada wszystkie wpisy GPS w polach dnia i komentarza, wybiera najnowszy prawidlowy znacznik `at`, odrzuca wspolrzedne poza zakresem oraz `0,0`.
- Interfejs jawnie opisuje pozycje jako ostatni zapis GPS z dnia pracy, a nie lokalizacje sledzona na zywo.
- Lista alternatywna zawiera wszystkie osoby z GPS w przewijanym obszarze; mapa ma `aria-describedby`, aktualizowane `aria-busy` i wyrazny stan fokusu.
- Uklad jest responsywny: 3 kolumny na desktopie, 2 + 1 do 1080 px i 1 kolumna do 760 px.
Testy/sprawdzenia:
- `node --check` dla dashboardu, zlecen, aplikacji portalu i layoutu: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- `npm.cmd test`: OK, ale repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow); pozostaje standardowe ostrzezenie o duzych chunkach.
- Targetowany ESLint nie wykazal nowych problemow; pozostaja dwa wczesniejsze bledy `no-unused-vars` dla `openDashboardActivityEventEditor` oraz `localDateAndTimeInputToIso`.
- W kontrolowanym lokalnym podgladzie rolka zmienila zoom z 11 do 13, przeciagniecie zmienilo srodek mapy, a klikniecie wiersza otworzylo prawidlowy dymek pinezki.
- Przy viewportcie 390 x 844 px karty mialy szerokosc 359,2 px, a dokument mial `scrollWidth` rowny `clientWidth` (390 px), bez poziomego overflow.
- Referencje, zrzuty desktop/mobile i wspolny obraz porownawczy opisano w `design-qa.md`; wynik QA: `passed`.
Uwagi:
- To nie jest sledzenie na zywo. Pinezka moze byc starsza, a jej dokladnosc zalezy od urzadzenia i zapisu wykonanego podczas dnia pracy.
- Lokalne sesje portalu byly wylogowane, dlatego wizualny test komponentu wykonano w tymczasowym harnessie z produkcyjnym HTML/CSS i kontrolowanymi punktami; build oraz kod integracji sprawdzono osobno.
- Nie zmieniono danych firmy, czasu pracy, zlecen ani zdarzen START/STOP. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Zmiana nazwy Kanban na Centrum zadan
Zmieniono:
- Widoczna nazwe sekcji `Kanban` w menu bocznym na `Centrum zadan`, bez zmiany trasy ani logiki modulu.
- Powiazane etykiety wyszukiwarki globalnej, komunikaty interfejsu, opis narzedzi dla czytnikow ekranu i nazwe kolumn w module kopii zapasowej.
Testy/sprawdzenia:
- `node --check` dla zmienionych plikow JavaScript: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- `npm.cmd test`: OK, repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd run build` w `web-app`: OK; pozostalo standardowe ostrzezenie o duzych chunkach.
Uwagi:
- Techniczne identyfikatory `kanban`, nazwy funkcji i klucze danych pozostaly bez zmian, aby nie naruszyc kompatybilnosci.
- Nie zmieniono zadan ani danych firmy. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Statusy pracownikow na mapie i powiekszenie mapy w popupie
Dodano:
- Zielone pinezki dla osob z trwajacym dzisiaj dniem pracy oraz czerwone pinezki dla osob, ktore zakonczyly dzien rzeczywistym statusem STOP.
- Legende `W pracy` / `Dzien zakonczony`, kolory statusow na liscie pracownikow oraz informacje o statusie i godzinie STOP w dymku pinezki.
- Powiekszana wersje tej samej interaktywnej mapy w modalnym popupie. Popup otwiera klikniecie tla mapy, pinezki, przycisku `Powieksz mape` oraz Enter lub Spacja na fokusie mapy.
- Zamykanie przez przycisk `Zamknij`, Escape i klikniecie przyciemnionego tla, z blokada przewijania strony, cyklem fokusu i oddaniem fokusu do elementu otwierajacego.
Zmieniono:
- Zrodlo mapy obejmuje dzisiejsze osoby aktywne oraz osoby z potwierdzonym STOP. Rekord bez trwajacego dnia i bez rzeczywistego STOP nie jest oznaczany na czerwono.
- Przy kilku wpisach tej samej osoby aktywny dzien ma pierwszenstwo przed zakonczonym; przy tym samym statusie wybierany jest najnowszy START albo STOP.
- Sygnatura markerow obejmuje status, dzieki czemu zmiana zielonej pinezki na czerwona odswieza sie nawet bez zmiany wspolrzednych GPS.
- Do popupu przenoszona jest istniejaca instancja mapy, a nie jej kopia, dlatego zachowane sa zoom, przesuniecie i otwarty dymek.
Testy/sprawdzenia:
- `node --check` dla zmienionych modulow JavaScript: OK.
- `npm.cmd test`: OK, repozytorium nadal nie zawiera testow automatycznych (0 testow).
- `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow); pozostaje standardowe ostrzezenie o duzych chunkach.
- Targetowany ESLint nie wykazal nowych problemow; pozostaje wczesniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- Kontrolowany test pokazal dokladnie 3 zielone i 3 czerwone pinezki. Klikniecie tla mapy oraz pinezki otwieralo powiekszony popup; pinezka zachowala dymek ze statusem.
- Rolkowanie zmienilo poziom kafelkow OpenStreetMap z 9 na 12, przeciaganie przesunelo mape, a zamkniecie i ponowne umieszczenie mapy w malej karcie zachowalo jej stan.
- Przy 390 x 844 px popup mial szerokosc 374 px, miescil sie w ekranie z marginesem 8 px, nie powodowal poziomego overflow i pozostawial przycisk zamkniecia dostepny.
- Konsola kontrolowanego podgladu nie zawierala bledow ani ostrzezen. Zrzuty oraz porownanie z referencja sa opisane w `design-qa.md`.
Uwagi:
- Koncowa sesja wlasciwego portalu na localhost byla wylogowana. Widok i interakcje sprawdzono w kontrolowanym lokalnym podgladzie z produkcyjnym CSS, a reguly statusow zweryfikowano w kodzie.
- Nie zmieniono danych firmy ani statusow START/STOP. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Niebieskie pinezki pracownikow z zadaniem na dzis
Dodano:
- Trzeci status mapy `Zadanie na dzis` oznaczony niebieska pinezka, niebieskim wskaznikiem na liscie oraz pozycja w legendzie malej i powiekszonej mapy.
- Informacje o dzisiejszym zleceniu w dymku: nazwa zadania, planowane godziny i obiekt.
- Zachowanie rzeczywistego stanu dnia pracy w dymku i na liscie, dlatego niebieska osoba nadal ma opis `W pracy` albo `Dzien zakonczony`.
Zmieniono:
- Zrodlo mapy laczy dzisiejsze dni pracy z tym samym kanonicznym zestawem planowanych zlecen, ktory zasila podglad dnia.
- Przydzial do zadania ma pierwszenstwo kolorystyczne, aby pracownik z dzisiejszym zleceniem byl niebieski rowniez po START lub STOP.
- Dla kilku przydzialow jednej osoby wybierane jest aktualne zadanie, a nastepnie najblizsze nadchodzace; pracownicy sa deduplikowani.
- Przy istniejacym GPS pinezka pozostaje na ostatniej pozycji dnia pracy. Bez GPS moze wykorzystac zapisane w zleceniu `lat/lng`, jawnie opisane jako lokalizacja zadania.
- Brak GPS i brak wspolrzednych zlecenia nie tworzy sztucznej lokalizacji ani nie uruchamia geokodowania; osoba pozostaje uwzgledniona w mianowniku licznika.
- Licznik i komunikaty mapy zostaly uogolnione z samego GPS na pozycje GPS lub lokalizacje zadania.
- Po przeniesieniu mapy do modala wybrana pinezka jest centrowana ponownie, dzieki czemu dymek nie nachodzi na sterowanie zoomem.
Testy/sprawdzenia:
- Na aktualnych danych localhost odczytano 5 grup zlecen i 10 unikalnych przydzielonych osob; koncowy widok pokazal 16 zielonych, 5 niebieskich i 5 czerwonych pozycji (`26 / 35 na mapie`).
- Piec przydzielonych osob mialo dostepna pozycje mapowa. Dla pozostalych nie utworzono atrap wspolrzednych.
- Klikniecie niebieskiego wiersza otwieralo jego pinezke; powiekszona mapa zachowala dymek w obrebie mapy i bez kolizji z zoomem.
- Po pelnym odswiezeniu strony konsola testowanej sciezki nie zawierala bledow ani ostrzezen.
- `node --check`: OK. `npm.cmd test`: OK (`0 tests`). `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow).
- Targetowany ESLint nie wykazal nowego problemu; pozostaje wczesniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
Uwagi:
- Test byl tylko do odczytu. Nie zmieniono danych firmy, zlecen ani statusow START/STOP.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Modul rentownosci kontraktow na pulpicie
Dodano:
- Szeroka karte `Rentownosc kontraktow` pod trzema panelami operacyjnymi i bezposrednio nad `Widokiem dnia dzisiejszego`.
- Uklad zgodny z przekazanym wzorcem: srednia marza i zmiana `+/-` po lewej, obszar trendu ponizej oraz `Top kontrakty` po prawej.
- Gotowe semantyczne warianty zmiany: dodatni zielony, ujemny czerwony i neutralny szary.
- Dynamiczne etykiety czterech ostatnich miesiecy, wyliczane wzgledem aktualnej daty.
Zmieniono:
- Glowna siatka dashboardu ma kolejnosc `overview -> insights -> profitability -> activity`.
- Karta jest responsywna: dwie kolumny na desktopie, jedna kolumna ponizej 900 px oraz mniejszy padding ponizej 760 px.
- Nie skopiowano wartosci `23,8%`, trendu ani nazw kontraktow ze wzorca. W aktualnym modelu istnieje tylko niejednoznaczne `Task.price`, domyslnie `0`, bez waluty, kosztow pracy i materialow, powiazania czasu z kontraktem oraz jednoznacznego `contractId`.
- Do czasu zdefiniowania modelu finansowego karta pokazuje uczciwy stan pusty: brak procentu, neutralne `+/-`, brak wykresu i brak rankingu. `Zobacz wszystkie kontrakty` nie udaje aktywnej nawigacji do nieistniejacego raportu.
Testy/sprawdzenia:
- Localhost przy `1280 x 720` pokazal karte o szerokosci 946 px dokladnie pomiedzy panelem obiektow a osia dnia; dokument nie mial poziomego overflow.
- Po pelnym odswiezeniu etykiety miesiecy wynosily `Kwi / Maj / Cze / Lip`, a konsola testowanej sciezki byla bez bledow i ostrzezen.
- Porownanie referencji i implementacji zapisano w `.codex-tmp\qa-profitability-comparison.png`; raport `design-qa.md` zakonczyl sie wynikiem `passed`.
- `node --check`: OK. `git diff --check`: OK. `npm.cmd test`: OK (`0 tests`). `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow).
- Targetowany ESLint nadal zglasza tylko wczesniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`.
Uwagi:
- Do realnego wyliczenia marzy potrzebne sa co najmniej: wartosc i waluta kontraktu z okresem obowiazywania, koszty godzinowe pracownikow, zuzycie materialow z cena jednostkowa oraz powiazanie czasu i kosztow z kontraktem.
- Nie zapisano zadnych danych firmy i nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Przykladowe dane w module rentownosci kontraktow
Dodano:
- Widoczne oznaczenie `Przykladowe dane` oraz komunikat, ze wartosci demonstracyjne nie pochodza z danych firmy.
- Przykladowe wartosci: marza srednia `23,8%`, zmiana `+3,2 p.p.`, trend czterech ostatnich miesiecy oraz ranking pieciu kontraktow demonstracyjnych.
- Responsywny wykres `canvas`, ktory zachowuje ostrosc po zmianie szerokosci karty.
Zmieniono:
- Stan pusty modulu zostal zastapiony kompletnym podgladem demonstracyjnym zgodnym z przekazanym wzorcem.
- Ranking jest arytmetycznie spojny: srednia wartosci `28,5 / 25,4 / 23,9 / 21,8 / 19,4%` wynosi `23,8%`.
- Trend `18,4 / 21,2 / 20,6 / 23,8%` jest spojny ze zmiana miesiac do miesiaca `+3,2 p.p.`.
- `Zobacz wszystkie kontrakty` pozostaje elementem tylko do wyswietlania z `aria-disabled=true`, poniewaz raport rentownosci nie ma jeszcze osobnej trasy.
Testy/sprawdzenia:
- Localhost przy `1280 x 720` pokazal karte `946 x 405,8 px`; dokument nie mial poziomego overflow, a konsola byla bez bledow i ostrzezen.
- Przy `390 x 844` karta miala `355 x 701 px`, uklad przeszedl w jedna kolumne i nie powstal poziomy scroll.
- Porownanie ze wzorcem zapisano w `.codex-tmp\qa-profitability-sample-reference-comparison.png`; raport `design-qa.md` ma wynik `passed`.
- `node --check`, `git diff --check`, `npm.cmd test` (`0 tests`) i `npm.cmd run build` w `web-app`: OK.
- Targetowany ESLint nadal zglasza tylko wczesniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`.
Uwagi:
- Dane sa stale i demonstracyjne. Nie sa odczytywane z bazy ani laczone z realnymi wynikami firmy.
- Nie zapisano danych firmy i nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Wyrownanie imion i nazwisk w liscie pod mapa
Zmieniono:
- Wiersz pracownika pod mapa korzysta teraz z trzech jawnych kolumn: znacznik statusu, elastyczna kolumna tekstu oraz czas GPS.
- Imie i nazwisko zaczyna sie 8 px za znacznikiem statusu zamiast byc odsuwane przez `justify-content: space-between`.
- Czas GPS pozostaje przy prawej krawedzi, a dlugie nazwy nadal sa bezpiecznie skracane wielokropkiem.
Testy/sprawdzenia:
- Przy viewportcie `1280 x 720` tekst zaczynal sie 20 px od lewej krawedzi calego wiersza, bez poziomego overflow.
- Klikniecie wiersza `Paulina Fojcik` nadal ustawialo odpowiednia pinezke i otwieralo dymek mapy.
- Konsola po odswiezeniu i kliknieciu wiersza byla bez bledow i ostrzezen.
- `git diff --check` oraz `npm.cmd run build` w `web-app`: OK; Vite przetworzyl 375 modulow.
Uwagi:
- Zmiana dotyczy tylko CSS. Nie zmieniono danych firmy, logiki mapy ani statusow pracownikow.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Kompaktowy modul Przeglad na pulpicie
Zmieniono:
- Piec kafelkow `Przegladu` miesci sie w jednym rzedzie przy standardowym viewportcie `1280 x 720`, zamiast ukladu `3 + 2`.
- Wysokosc calego panelu spadla z `388,9 px` do `201,4 px`, czyli o `48,2%`.
- Zachowano oryginalne rozmiary podstawowej typografii (`12 / 30 / 11 / 10 px`), aby mniejszy modul pozostal czytelny.
- Kafelek `Zaplanowane zlecenia` ma zwarty uklad siatkowy: nazwa, liczba z opisem, podglad zlecenia i link akcji.
- `Postep ogolny` zachowuje wartosc `-%` w jednym wierszu; status dopasowuje sie do dostepnego miejsca.
- Breakpoint trzech kolumn przesunieto do `1120 px`; ponizej `820 px` pozostaja dwie kolumny, a ponizej `760 px` jedna.
Testy/sprawdzenia:
- Localhost przy `1280 x 720`, `devicePixelRatio=1`: panel `946 x 201,4 px`, piec kolumn po okolo `174,4 px`, brak poziomego overflow i brak ucietej tresci kafelkow.
- Klikniecie kafelka `Pracownicy` nadal otwieralo liste aktywnych osob; po tescie przywrocono czysty widok pulpitu.
- Porownanie przed/po zapisano w `.codex-tmp\qa-overview-compact-comparison.png`; raport `design-qa.md` ma wynik `passed`.
- Konsola localhost nie zawierala bledow ani ostrzezen. `npm.cmd run build` w `web-app`: OK (Vite, 375 modulow); pozostaje istniejace ostrzezenie o duzych chunkach.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
Uwagi:
- Zmiana dotyczy wylacznie CSS. Nie zmieniono danych, obliczen ani nawigacji kafelkow.
- Nie zapisano danych firmy i nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Aktywny postep uslug i potwierdzone zakonczenia na pulpicie
Dodano:
- Panel `Postep uslug` zasilany wylacznie rozpoczetymi i nadal otwartymi zdarzeniami sprzatania `CLEAN`. Przyszle zlecenia oraz zakonczone zdarzenia nie trafiaja do tej listy.
- Procent realizacji oparty na rzeczywistym czasie od START-u i wiarygodnym planie godzinowym tej samej osoby na tym samym obiekcie. Bez zapisanych godzin poczatku i konca planu panel pokazuje jawnie orientacyjne `50%` oraz opis `W trakcie - brak planu czasowego`.
- Panel `Potwierdzone ukonczenie zadan` z obiektami, na ktorych dzisiejsze jawne zdarzenia sprzatania maja rzeczywisty START i STOP.
- Grupowanie po jednoznacznym `clientId`, z kontrolowanym rozwiazaniem strefy lub unikalnej nazwy klienta. Niejednoznaczne rekordy sa pomijane zamiast byc przypisywane do przypadkowego obiektu.
- Obsluge kilku pracownikow na jednym obiekcie: obiekt pozostaje aktywny, gdy przynajmniej jedno zdarzenie nadal trwa, i trafia do zakonczonych dopiero po STOP-ie ostatniej osoby.
- Uwzglednianie otwartych zdarzen `CLEAN` rozpoczetych przed dzisiaj, pobranych z istniejacego szerszego zakresu zdarzen, aby nocna praca nie tworzyla falszywego zakonczenia.
Zmieniono:
- Zrodlem obu paneli sa jawne rekordy `Event`, a nie zagregowane dni pracy. Zamkniety `Workday` ani sama pozycja GPS nie sa dowodem zakonczenia sprzatania.
- Jawne zdarzenie obiektowe zamkniete przez `STOP_END_DAY` jest uznawane za zakonczenie sprzatania tylko wtedy, gdy zachowuje konkretna strefe i dodatni rzeczywisty czas; zwykly marker STOP dnia nie przechodzi filtra explicit event.
- Deduplikacja tego samego `eventId` wybiera najnowsza rewizje po `updatedAt`; kompletnosc START/STOP jest tylko rozstrzygajacym kryterium przy tym samym czasie aktualizacji.
- Dopasowanie planu jest ograniczone najpierw do tego samego pracownika i obiektu. Sztuczne godziny tworzone przez fallback kalendarza nie sa traktowane jako prawdziwy plan.
- Oba panele maja liczniki, przewijane listy, semantyczne elementy `time`, dostepne paski `progressbar`, widoczny fokus i responsywny uklad `3 / 2 / 1` kolumn.
- Teksty pomocnicze maja co najmniej 10 px; stan orientacyjnego `50%` jest dodatkowo opisany przez `aria-valuetext` i nie udaje pomiaru.
Testy/sprawdzenia:
- Na zalogowanym localhost panel pokazal 1 rzeczywista usluge w toku (`Urzad Miasta Rybnik (UM)`) i 4 obiekty zakonczone po STOP-ie ostatniej osoby. Wartosci pochodzily z odczytu aktualnych danych, bez ich modyfikowania.
- Reczne odswiezenie pulpitu zachowalo te same reguly i liczby. Konsola nie zawierala bledow ani ostrzezen.
- Przy viewportcie CSS `1075 x 687` dwa pierwsze panele mialy po `454 px`, trzeci zajmowal kolejny pelny rzad `924 px`; dokument i listy nie mialy poziomego overflow.
- Porownanie wzorcow i implementacji zapisano w `.codex-tmp\qa-service-panels-comparison.png`, a pelny zrzut w `.codex-tmp\qa-service-panels-live.png`.
- `node --check`, `git diff --check`, `npm.cmd test` (`0 tests`) i `npm.cmd run build` w `web-app`: OK; Vite przetworzyl 375 modulow i pokazal tylko istniejace ostrzezenie o duzych chunkach.
- Targetowany ESLint nie wykazal nowego problemu; nadal zatrzymuje sie na wczesniejszym `no-unused-vars` dla `openDashboardActivityEventEditor`.
Uwagi:
- Nie zapisano danych firmy, zdarzen, zlecen ani statusow START/STOP. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-22
Autor: AI Codex
Temat: Obiekt pinezki z tego samego odbicia QR i GPS
Zmieniono:
- Nazwa obiektu na mapie nie jest juz pobierana niezaleznie z najpozniejszego zdarzenia QR pracownika z calego dnia.
- Kazdy wpis GPS zachowuje teraz rekord zrodlowy, pole pochodzenia, faze START/STOP oraz rodzaj odbicia (`START_GPS`, `STOP_GPS`, `CLEAN_START_GPS`, `CLEAN_STOP_GPS`).
- Przy jednakowym czasie pierwszenstwo ma rozpoczecie nowego sprzatania przed automatycznym zamknieciem poprzedniego; zwykly `STOP_GPS` ma pierwszenstwo przed syntetycznym `CLEAN_STOP_GPS`.
- Obiekt jest rozwiazywany z QR, strefy lub klienta nalezacego do tego samego rekordu co wybrana pozycja GPS. Brak jednoznacznego powiazania daje komunikat `Brak obiektu przy ostatnim odbiciu` zamiast nazwy z innego zdarzenia.
- Dla zakonczonego dnia zachowano bezpieczny fallback do klienta z wybranego rekordu dnia pracy, ale usunieto przeszukiwanie wszystkich innych zdarzen pracownika.
- Opis czasu w popupie brzmi `Ostatnie odbicie GPS`, aby jasno wskazywal zrodlo informacji.
Testy/sprawdzenia:
- Na zalogowanym localhost pinezki `Katarzyna Rapacz` i `Malgorzata Piprek` pokazaly `Gmina Godow` oraz `Ostatnie odbicie GPS: 17:14` zamiast blednego `Heliosz Med`.
- Po pojawieniu sie nowszego odbicia widok automatycznie zmienil obie osoby na `Best Clean`, `Dzien zakonczony`, `STOP 21:12` i `Ostatnie odbicie GPS: 21:12`, co potwierdzilo korzystanie z aktualnego rekordu.
- `Jolanta Wachowicz` nadal byla prawidlowo powiazana z `Neuro-Med Raciborz`, a zakonczeni pracownicy zachowali rozpoznane obiekty, gdy wystepowaly w ich wlasnym rekordzie dnia pracy.
- Czyste przeladowanie localhost nie wykazalo bledow ani ostrzezen konsoli. `node --check`, `git diff --check`, `npm.cmd test` (`0 tests`) oraz `npm.cmd run build` w `web-app`: OK; Vite przetworzyl 375 modulow.
- Targetowany ESLint nadal zatrzymuje sie tylko na wczesniejszym `no-unused-vars` dla `openDashboardActivityEventEditor`.
- Nie wykonano zapisu danych firmy; weryfikacja korzystala wylacznie z odczytu aktualnego widoku localhost.
Uwagi:
- Zmiana dotyczy logiki prezentacji mapy. Nie modyfikuje zdarzen, pozycji GPS, klientow ani stref w bazie.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Osobny modul Rentownosc kontraktow pod Centrum zadan
Dodano:
- Samodzielna pozycje `Rentownosc kontraktow` w menu glownym, bezposrednio pod `Centrum zadan` i przed sekcja `OPERACJE`.
- Osobna trase `contractProfitability` oraz leniwie ladowany modul w `web-app/apps/portal-web/src/features/profitability/`.
- Pelny ekran demonstracyjny z filtrami okresu, klienta, statusu, kompletnosci i wyszukiwaniem.
- Szesc kart KPI: przychod netto, koszt calkowity, marza, wazona rentownosc portfela, koszt pracy wraz z udzialem w przychodzie oraz kompletnosc danych.
- Trend 12 miesiecy z przelaczaniem rentownosci, marzy i przychodu, liste kontraktow wymagajacych uwagi, porownawcza tabele obiektow oraz szczegoly struktury kosztow i planu wzgledem wykonania.
- Aktywne przejscie do modulu z dotychczasowej karty `Rentownosc kontraktow` na pulpicie oraz wynik w globalnej wyszukiwarce portalu.
Zmieniono:
- Dane pogladowe sa ladowane dynamicznie tylko w trybie developerskim na `localhost`, `127.0.0.1` lub `::1`. Produkcyjny build nie zawiera fixture ani nazw demonstracyjnych.
- W produkcji modul respektuje centralne uprawnienie `profitabilityModule.canRead`; bez uprawnienia pozycja menu, karta pulpitu i wynik wyszukiwania sa ukryte, a sam widok nie ujawnia danych finansowych.
- Brak stawki, kosztu albo przychodu nie jest zamieniany na zero. Niepelny kontrakt pokazuje `—` i status tekstowy.
- Rentownosc portfela jest liczona jako suma marz podzielona przez sume przychodow kontraktow z kompletnym wynikiem. Kontrakt z zerowym przychodem obniza marze portfela, ale nie dostaje mylacego indywidualnego procentu.
- Koszt pracy i jego udzial korzystaja tylko z kontraktow z jawnie znanym kosztem pracy; brak stawki nie zaniza procentu jak koszt rowny zero.
- Statusy maja tekst i symbol, a nie tylko kolor; dodano stany fokusu, `aria-pressed`, opis danych wykresu i czytelniejsza typografie.
Dane wejsciowe potrzebne do realnego uruchomienia:
- Kontrakt i obiekt: `organizationId`, `clientId`, `objectId`, numer kontraktu, daty obowiazywania, przychod netto w minor units, waluta ISO 4217, model rozliczenia i docelowa rentownosc.
- Praca: planowane godziny, rzeczywiste START/STOP QR lub NFC przypisane do obiektu i strefy oraz wersjonowany pelny koszt godziny pracownika z zakresem dat.
- Koszty: materialy, srodki, sprzet lub amortyzacja, podwykonawcy, transport, prace okresowe, uslugi dodatkowe i pozostale koszty bezposrednie, zawsze z okresem, zrodlem i kwota netto.
- Jakosc i audyt: brakujace stawki, otwarte START/STOP, dokumenty zrodlowe, autor i czas zmiany, powod korekty oraz snapshot zamknietego okresu.
Testy/sprawdzenia:
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd test`: OK, 60 z 60 testow, w tym test wzorcowy 30 000 / 23 500 / 6 500 / 21,67%, brak stawki, otwarty START/STOP, brak przychodu, wersjonowanie stawek, amortyzacja, brak podwojnego naliczania oraz uprawnienia i separacja organizacji.
- `npm.cmd --prefix web-app run build`: OK, Vite przetworzyl 383 moduly; pozostaje tylko istniejace ostrzezenie o duzych chunkach.
- Skan `web-app/dist` nie znalazl identyfikatorow ani nazw z fixture demonstracyjnego.
- Zalogowany localhost pokazal pozycje menu w wymaganym miejscu, aktywna trase, oznaczenie `Dane pogladowe`, 7 kontraktow, przychod wszystkich kontraktow 508 000 zl oraz koszt 403 400 zl, marze 52 600 zl i rentownosc 11,54% dla 6 kontraktow z kompletnym wynikiem, a takze szczegoly wybranego kontraktu.
Uwagi:
- To etap demonstracyjny widoku calego portfela. Aktualne API rentownosci jest klientowe i wymaga `clientId`; przed podlaczeniem realnych danych potrzebny jest bezpieczny endpoint portfela organizacji albo zatwierdzona strategia agregacji bez zapytan N+1.
- Migracja `20260722_profitability_domain.sql` nie zostala uruchomiona. Nie zapisano ani nie zmieniono danych firmy.
- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Zwijana miniatura panelu Rentownosc kontraktow na pulpicie
Dodano:
- Przycisk `Zwin panel` w prawym gornym rogu karty rentownosci oraz stan `Rozwin panel` po zwinieciu.
- Kompaktowa miniatura zawierajaca tylko najwazniejsze informacje: srednia marze, zmiane miesiac do miesiaca, najlepszy kontrakt, jego wynik oraz przejscie `Otworz analize`.
- Natywna semantyke przycisku z `aria-controls`, aktualizowanym `aria-expanded`, etykieta i tytulem odpowiadajacym biezacemu stanowi.
Zmieniono:
- Po zwinieciu pelny wykres i ranking sa faktycznie ukrywane atrybutem `hidden`; miniatura stanowi osobny, czytelny skrot, zamiast wizualnie sciskac pelna zawartosc.
- W stanie pelnym panel zachowuje dotychczasowy uklad, wykres, ranking i aktywne przejscie do calego modulu.
- Preferencja zwiniecia jest zapisywana lokalnie osobno dla organizacji i uzytkownika. Brak dostepu do `localStorage` nie blokuje dzialania przycisku.
- Po ponownym rozwinieciu wykres jest przerysowywany, aby odzyskac poprawny rozmiar po wczesniejszym ukryciu.
- Uklad miniatury jest responsywny: jeden kompaktowy rzad na szerokim ekranie i bezpieczne skladanie sekcji na telefonie.
Testy/sprawdzenia:
- Zalogowany localhost: pelna karta miala `1413 x 405,8 px`, a miniatura `1413 x 130 px`; ponowne rozwiniecie przywrocilo pelny widok.
- Telefon `390 x 844`: miniatura miala `355 x 271,3 px`, bez poziomego overflow dokumentu.
- Zweryfikowano oba stany, aktualizacje `aria-expanded`, ukrywanie pelnej zawartosci, widocznosc podsumowania i zachowanie fokusu na przycisku. Konsola nie zawierala bledow ani ostrzezen.
- Porownania wizualne zapisano w `.codex-tmp\qa-profitability-collapse\comparison-reference-expanded.png` i `.codex-tmp\qa-profitability-collapse\comparison-reference-collapsed.png`.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd test`: OK, 60 z 60 testow.
- `npm.cmd --prefix web-app run build`: OK, Vite przetworzyl 383 moduly; pozostaje tylko istniejace ostrzezenie o duzych chunkach.
- `node --check` i `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
Uwagi:
- Zmiana dotyczy wylacznie prezentacji i lokalnej preferencji interfejsu. Nie zmienia danych ani obliczen rentownosci.
- Nie zapisano danych firmy. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Zwijane miniatury paneli Obiekty, Postep uslug i Potwierdzone ukonczenie zadan
Dodano:
- Osobny maly przycisk `Zwin` / `Rozwin` w kazdym z trzech paneli operacyjnych pulpitu.
- Kompaktowy stan `Obiektow` z liczba osob na mapie oraz rozkladem statusow `W pracy`, `Zadanie na dzis` i `Dzien zakonczony`.
- Kompaktowy stan `Postepu uslug` z najbardziej zaawansowana usluga sposrod sprzatan realizowanych w tej chwili.
- Kompaktowy stan `Potwierdzonego ukonczenia zadan` z ostatnim zamknietym obiektem albo jednoznacznym stanem pustym.
- Niezalezne zapamietywanie stanu kazdej karty w `localStorage`, rozdzielone wedlug organizacji i uzytkownika.
Zmieniono:
- Widoczny przycisk zwijania ma teraz `28 px` wysokosci i krotka etykiete; niewidoczny obszar klikniecia pozostaje powiekszony do co najmniej `44 px`.
- Przycisk w panelu `Rentownosc kontraktow` korzysta z tej samej malej kontrolki i tekstu `Zwin` / `Rozwin` zamiast `Zwin panel` / `Rozwin panel`.
- Pelna zawartosc zwijanej karty jest rzeczywiscie ukrywana atrybutem `hidden`, a osobne podsumowanie pozostaje czytelne i aktualizowane z tego samego renderu danych live.
- Po rozwinieciu panelu `Obiekty` mapa jest ponownie przeliczana, aby odzyskac poprawny rozmiar.
Testy/sprawdzenia:
- Zalogowany localhost: kazda rozwinieta karta miala okolo `460,3 x 517,6 px`, a zwinieta `460,3 x 121,4 px`; rzad zmniejszyl wysokosc o okolo `76,5%`.
- Klikniecia zmienialy `aria-expanded`, widocznosc body i miniatury. Ponowne zaladowanie zachowalo osobny stan wszystkich trzech kart.
- Telefon `390 x 844`: karty mialy `355 px` szerokosci, a rzad paneli nie mial poziomego overflow.
- Porownanie wizualne zapisano w `.codex-tmp\qa-insight-collapse\comparison-source-and-implementation.png`; raport w `design-qa.md` konczy sie wynikiem `passed`.
- `node --check`, `git diff --check` i `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd test`: OK, 60 z 60 testow.
- `npm.cmd --prefix web-app run build`: OK, Vite przetworzyl 383 moduly; pozostaje tylko istniejace ostrzezenie o duzych chunkach.
Uwagi:
- Dane skrotow pochodza z aktualnego renderu mapy i paneli uslug; nie dodano danych demonstracyjnych.
- Nie zmieniono danych firmy, zdarzen, pozycji GPS ani logiki obliczania postepu. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Audytowalna korelacja zdarzen QR z planem zlecen i scisly postep uslug
Dodano:
- Trwaly kontrakt korelacji zdarzenia `CLEAN` z planem: `taskId`, `occurrenceDateYmd`, `serviceBlockId`, `allocationId`, `workSlotKey`, `matchStatus`, `matchMethod`, `matchReason`, `matchedAt`, `planSnapshotVersion`, planowany przedzial i czas oraz rewizje zrodlowego zadania.
- Serwerowy korelator korzystajacy z kanonicznych ID organizacji, zadania, klienta, strefy, pracownika, bloku uslugi i alokacji. Nazwy klientow, obiektow i pracownikow sa tylko etykietami prezentacyjnymi.
- Jawny stan `UNMATCHED` z przyczyna dla zdarzen, ktorych nie da sie polaczyc jednoznacznie. Brak dopasowania i kilka kandydatow nie sa automatycznie przypisywane do przypadkowego planu.
- Migracje `dataconnect/migrations/20260723_service_execution_correlation.sql` z kolumnami, ograniczeniami integralnosci, kluczem obcym do zadania, kontrola pelnego klucza dopasowania oraz uniewaznianiem korelacji po zmianie danych zrodlowych.
- Testy kontraktowe dla korelatora, repozytorium, polityki bezpieczenstwa i modelu pulpitu, w tym niejednoznacznosc, rozne organizacje, powtarzalnosc, pominiete terminy, nadpisania, stare rewizje i kilka wizualnie identycznych alokacji.
Zmieniono:
- Utworzenie zdarzenia QR ustala pracownika wylacznie z potwierdzonego tokenu Firebase, przypisania `membership.worker_id` albo jednoznacznego adresu e-mail tokenu. `workerId` i login z body sa tylko kontrola spojnosci i nie moga wybrac innej osoby.
- Czas zdarzenia i dzien wystapienia sa wyznaczane z czasu serwera w strefie `Europe/Warsaw`. Pole `clientScannedAt` nie moze cofnac ani przesunac zdarzenia i nie bierze udzialu w korelacji.
- Ogolne mutacje zdarzen nie pozwalaja klientowi zapisac stanu `MATCHED` ani pol korelacji. Zapis dopasowania przechodzi przez waska, serwerowa metode z lista dozwolonych algorytmow.
- Korelator nie uzywa nazw ani heurystyki najblizszego czasu. Dokladne ID sa warunkiem; przedzial czasu rozstrzyga tylko pomiedzy kilkoma kandydatami, ktorzy juz maja ten sam pelny zestaw ID.
- Panel `Postep uslug` przyjmuje tylko jawne zdarzenia `CLEAN` ze stanem `MATCHED`, pelnym kluczem planu i rewizja identyczna z aktualnym zadaniem. Stara korelacja trafia do wyjatkow zamiast do wyniku.
- Procent jest liczony tylko wtedy, gdy kazda wymagana alokacja ma kompletny i spojny snapshot planowanego czasu. Brak planu daje stan `Nieokreslony`, a nie umowne `50%`.
- `Potwierdzone ukonczenie zadan` uznaje obiekt za zakonczony dopiero po zamknieciu wszystkich wymaganych alokacji prawidlowym `endAt`. Sam status tekstowy ani zamkniecie dnia pracy nie wystarcza.
- Zachowano pelne dane cyklu przy zapisie zadania: koniec powtarzalnosci, pominiete daty, zrodlo, nadpisanie, rodzaj nadpisania i pierwotna data wystapienia.
- Wygenerowano ponownie oficjalny SDK Firebase Data Connect po zmianie schematu i operacji.
Testy/sprawdzenia:
- `npm.cmd test`: OK, 118 z 118 testow.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK, Vite przetworzyl 390 modulow; pozostaja tylko ostrzezenia o rozmiarze chunkow.
- `node --check`: OK dla backendu, korelatora, repozytorium, polityki bezpieczenstwa i modelu pulpitu.
- `firebase.cmd dataconnect:sdk:generate`: OK.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- Swiezy lokalny backend odpowiedzial `200` na `http://127.0.0.1:8081/healthz`, a Vite `200` na `http://127.0.0.1:5173/`. Ekran logowania zaladowal sie bez bledow i ostrzezen konsoli.
- Lokalny runtime uruchomiono na Node.js 24.13.1. Brakujacy lokalnie, lecz juz zadeklarowany `nodemailer@7.0.0` zostal odtworzony bez zmiany `package-lock.json`.
Uwagi:
- Migracja `20260723_service_execution_correlation.sql` ma status `REVIEW-ONLY` i nie zostala uruchomiona. Bez wdrozonego schematu backend zachowuje zgodnosc ze starym zapisem, ale pulpit nie udaje dopasowania, ktorego baza nie potwierdzila.
- Widoki za logowaniem zostaly sprawdzone testami modelu i kontraktu; w tej sesji nie wykonywano logowania ani nie odczytywano hasla uzytkownika.
- Nie odczytano ani nie zmieniono danych realnej firmy. Nie wykonano migracji, commita, pusha ani wdrozenia produkcyjnego.
- Galaz pozostaje zgodna z `cleanzi01/main`, a `stash@{0}` zachowuje kopie bezpieczenstwa stanu sprzed tej korelacji.

Data: 2026-07-23
Autor: AI Codex
Temat: Naprawa lokalnego bootstrapu logowania i komunikatu DB_CONFIG_MISSING
Przyczyna:
- Localhost zostal uruchomiony bezposrednio przez `scripts/dev-local.js`, z pominieciem `scripts/dev.js`, ktory pobiera dane uwierzytelniajace Cloud SQL z Secret Manager.
- Firebase Auth przyjal email i haslo, ale `/api/auth/session-context` nie mogl sprawdzic czlonkostwa w organizacji bez polaczenia z baza i zwrocil techniczny tekst `DB_CONFIG_MISSING`.
Zmieniono:
- `scripts/dev.js` rozpoznaje teraz `VITE_FIREBASE_PROJECT_ID`. Dla kanonicznego projektu `iclean-room` odtwarza niesekretne wspolrzedne Cloud SQL zgodne z `apphosting.yaml`: nazwe instancji i bazy.
- Jawne zmienne srodowiskowe nadal maja pierwszenstwo, a inny projekt Firebase nie dziedziczy ustawien bazy Cleanzi.
- Login i haslo bazy nadal sa pobierane wylacznie z Secret Manager przez ADC. Nie sa zapisywane w repozytorium, `.env.local`, komendzie ani logach.
- `mapDatabaseConnectionError` mapuje brak konfiguracji na kontrolowane `503 DB_CONFIG_MISSING` z czytelnym komunikatem o koniecznosci uruchomienia pelnego `npm run dev`.
Testy/sprawdzenia:
- `node --check scripts/dev.js`: OK.
- `node --check index.js`: OK.
- Testy `test/dev-config.test.js`: OK, 3 z 3. Sprawdzono fallback dla Cleanzi, pierwszenstwo jawnych ustawien oraz brak przenoszenia konfiguracji do obcego projektu.
- Stan ADC sprawdzono bez wyswietlania tokenu i sekretow: `REAUTH_REQUIRED`.
Uwagi:
- Do zakonczenia testu logowania potrzebne jest interaktywne odswiezenie lokalnych Google Application Default Credentials poleceniem `gcloud.cmd auth application-default login`.
- Nie uruchomiono jeszcze backendu z dostepem do Cloud SQL i nie wykonano zadnego zapytania do danych firmy.
- Nie zmieniono hasla uzytkownika ani danych Firebase Auth. Nie wykonano migracji, commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Odswiezenie ADC i bezpieczne rozpoznanie blokady TLS Cloud SQL
Zrobiono:
- Za zgoda uzytkownika uruchomiono interaktywne `gcloud auth application-default login`; konto i haslo byly obslugiwane wylacznie przez strone Google.
- Google Cloud SDK nie potrafil zakonczyc wymiany tokenu przez certyfikat `Norton Web/Mail Shield Root`. Zamiast wylaczac SSL uzyto tymczasowo systemowego magazynu zaufanych certyfikatow Windows.
- Po autoryzacji sprawdzono ADC bez wyswietlania tokenu: klient Google Cloud SDK oraz backendowy `google-auth-library` zwrocily status `OK`.
- Tymczasowy pakiet CA, log autoryzacji i pomocniczy plik integracji z magazynem Windows zostaly usuniete po zakonczeniu testu. Globalne `core/custom_ca_certs_file` zostalo przywrocone do stanu pustego.
- Stary stack uruchomiony przez `scripts/dev-local.js` zostal zatrzymany. Pelny bootstrap `scripts/dev.js` pobral sekrety z Secret Manager i uruchomil frontend na `127.0.0.1:5173` oraz backend na `8081`.
Sprawdzenia:
- Frontend i `/healthz` backendu odpowiadaja. Ekran logowania laduje sie bez bledow i ostrzezen konsoli.
- Minimalne, tylko odczytowe `select 1` nie dotarlo do bazy. Cloud SQL Connector odrzucil polaczenie kodem `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
- Analiza biblioteki potwierdzila, ze Cloud SQL Connector celowo przypina certyfikat konkretnej instancji. Skanowanie TLS przez Norton podmienia ten certyfikat, wiec dodanie lokalnego CA albo wylaczenie weryfikacji nie jest bezpiecznym rozwiazaniem.
Uwagi:
- Aby lokalny backend mogl sprawdzic organizacje, Norton musi pominac skanowanie TLS dla procesu Node.js lub polaczenia Cloud SQL. Alternatywnie skanowanie HTTPS mozna wylaczyc tylko na czas lokalnego testu i od razu ponownie wlaczyc.
- Nie wylaczono weryfikacji TLS, nie oslabiono pinningu Cloud SQL i nie wykonano zapytania do danych firmy.
- Nie wykonano migracji, commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Bezpieczny lokalny proxy kontekstu sesji bez oslabiania TLS
Przyczyna:
- Firebase Auth dzialal lokalnie, ale po zalogowaniu `/api/auth/session-context` probowal laczyc sie z Cloud SQL przez lokalnie przechwytywane polaczenie TLS. Cloud SQL Connector prawidlowo odrzucal podmieniony certyfikat kodem `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
- Stary host `https://cleanzi-01.web.app` zwracal dla tego endpointu `403 FORBIDDEN_HOST`. Kanoniczny `https://portal.cleanzi.pl` zwraca poprawna odpowiedz API.
Dodano:
- Jawny skrypt `npm run dev:auth-proxy`, ktory wlacza proxy tylko po fladze `--auth-session-proxy`.
- Dokladna allowliste `https://portal.cleanzi.pl`; odrzucane sa inne hosty, HTTP, credentials, sciezki, query i fragmenty.
- Waski regex obejmujacy wylacznie `/api/auth/session-context` z opcjonalnym query. Pozostale `/api` nadal trafiaja do lokalnego backendu.
- Dodatkowy gate serwerowy, przez co sam wpis targetu w `.env.local` albo powloce nie moze wlaczyc proxy.
- Testy konfiguracji bootstrapu i proxy Vite, w tym kolejnosc przed ogolnym `/api`, allowlista, gate, dozwolone metody oraz filtrowanie naglowkow.
Zabezpieczenia:
- Dozwolone sa tylko `GET`, `POST` i `OPTIONS`. W aktualnym handlerze GET i POST sa odczytowe; POST sluzy do wyboru organizacji przez `orgId`.
- Token Firebase oraz wymagane naglowki kontekstu platformy sa przekazywane bez logowania. Usuwane sa Cookie, Proxy-Authorization, naglowki Forwarded/X-Forwarded i Set-Cookie.
- Wymuszono `secure: true`, brak sledzenia przekierowan oraz `Cache-Control: no-store`.
- Nie wylaczono TLS, nie dodano `secure: false` i nie oslabiono pinningu Cloud SQL.
Testy/sprawdzenia:
- `npm.cmd test`: OK, 127 z 127 testow.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK, Vite przetworzyl 390 modulow; pozostaja tylko istniejace ostrzezenia o rozmiarze chunkow.
- `git diff --check` dla zmienionych plikow: OK; tylko standardowe ostrzezenia LF/CRLF.
- Runtime: frontend `127.0.0.1:5173` odpowiedzial `200`, backend `8081/healthz` odpowiedzial `200`, a lokalny `/api/auth/session-context` bez tokenu zwrocil poprawne `401 UNAUTHENTICATED` z `Cache-Control: no-store`.
- Niedozwolona metoda na lokalnym endpointcie zwrocila `405` i `Allow: GET, POST, OPTIONS`, co potwierdzilo aktywny waski proxy.
- Ekran logowania zostal odswiezony i przekazany uzytkownikowi bez odczytania pol formularza ani wyslania hasla.
Uwagi:
- Ten tryb naprawia lokalne sprawdzenie organizacji, ale nie tworzy sandboxa ani calego portalu read-only. Pozostale lokalne endpointy i bezposrednie polaczenia Firebase/Data Connect moga korzystac z realnych danych firmy; akcje mutujace wymagaja takiej samej ostroznosci jak produkcja.
- Lokalny Cloud SQL nadal jest blokowany przez Norton dla tras, ktore probuja laczyc sie bezposrednio z baza. Poprawka celowo nie obchodzi tej ochrony.
- Nie wykonano logowania za uzytkownika, zapisu danych firmy, migracji, commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-23
Autor: AI Codex
Temat: Integralnosc Event/Workday bez zgadywania oraz plan bezpiecznego wdrozenia
Przyczyna:
- Lista zdarzen i mobilny workflow nie mialy jednego, wspolnego invariantu dla otwartego `Event CLEAN` i otwartego `Workday`.
- Historyczne otwarte Eventy z pustym `event_type` nie moga byc bez dowodu uznane ani za aktywny CLEAN, ani za bezpiecznie zamknieta historie.
- Dotychczasowe zapytania ograniczone do 5000 rekordow lub zakresu `startAt` nie byly wystarczajacym dowodem braku starego konfliktu.
Dodano lokalnie:
- Osobne klasy diagnostyczne: wielokrotny jawny CLEAN, pojedynczy jawny CLEAN bez aktywnego powiazanego Workday, nierozstrzygniety otwarty Event bez `event_type` oraz historyczny Event bez typu powiazany dokladnie z zamknietym Workday tej samej osoby.
- Klikalne grupy `Pokaz` otwieraja dokladnie sklasyfikowane rekordy, maja lokalna paginacje, prawidlowy eksport, powrot i obsluge klawiatury. Zmiana organizacji podczas odczytu nie moze wstawic wyniku starej sesji.
- Portalowy precheck jawnego CLEAN i Workday przed zapisem. Brak kompletnego wyniku daje `INTEGRITY_CHECK_INCOMPLETE`; system nie przechodzi do zapisu na podstawie ograniczonego fallbacku.
- Dwie kompletne operacje `EventsIntegrityPageForOrg` i `WorkdaysIntegrityPageForOrg`. Paginacja obejmuje cala organizacje, ma stabilny tie-breaker po ID, nie filtruje po case loginu ani po `startAt`, a normalizacja `trim/lower` i definicja open sa zgodne z SQL.
- Operacje integrity sa w allowliscie sesji platformowej oraz w wygenerowanym SDK Data Connect.
- Polityke jednego otwartego Workday w mobile: stary lub wielokrotny otwarty dzien zwraca kontrolowane 409; system nie wybiera arbitralnie najnowszego rekordu.
- START i STOP pozostaja dostepne przy niepelnym schemacie korelacji. Tylko nowy CLEAN wymaga pelnych 15 kolumn korelacji; stan mobilny pokazuje wtedy jawny problem schematu zamiast zgadywac.
- Mapowanie bledow triggerow Event i Workday na stabilne odpowiedzi 409.
- Dwie migracje `REVIEW-ONLY`: `20260723_single_open_clean_event_guard.sql` i `20260723_single_open_workday_guard.sql`. Zawieraja preflight, blokade tabeli, advisory lock, triggery, wymagane klucze pracownika i czesciowe indeksy zgodne z predykatami open. Migracji nie uruchomiono.
- Dual-write nie jest raportowany jako sukces, gdy drugi zapis jest niepewny. Portal zwraca `PARTIAL_EVENT_WORKDAY_*_UNKNOWN`, a pojedynczy osierocony jawny CLEAN jest widoczny w diagnostyce.
Stan danych odczytany bez modyfikacji:
- Pulpit localhost podczas finalnej kontroli pokazal `Brak QR STOP: 1`, 5 aktywnych osob, 15 obiektow i 6 zaplanowanych zlecen. Sa to wartosci dynamiczne z chwili odczytu.
- Wczesniejszy pelny odczyt diagnostyczny pokazal 85 otwartych Eventow bez `event_type` u 7 pracownikow. To nie jest 85 otwartych dni pracy i nie ma jeszcze dowodu, ze wszystkie sa bezpiecznymi orphanami zamknietych Workday.
- Bezposrednie zapytanie kontrolne Cloud SQL nie zostalo wykonane, poniewaz lokalny Connector nadal prawidlowo odrzuca certyfikat podmieniany przez skanowanie TLS Norton. Nie obchodzono tej ochrony.
- Po przelaczeniu UI na nowa operacje integrity localhost pokazuje kontrolowany komunikat o jej niedostepnosci, bo zapytanie jest przygotowane lokalnie, ale nie zostalo wdrozone do Data Connect. Zwykla lista zdarzen nadal dziala.
Testy/sprawdzenia:
- Niezalezny koncowy re-review: brak P0 i P1 w przejrzanym zakresie; osobny zestaw 45 z 45 testow przeszedl.
- Pelne `npm.cmd test`: OK, 176 z 176 testow.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaja tylko istniejace ostrzezenia o rozmiarze chunkow.
- `firebase.cmd dataconnect:sdk:generate`: OK; pozostaje istniejace ostrzezenie o aliasie `cycleId/workdayId`.
- `node --check index.js`: OK.
Uwagi:
- Nie zmieniono, nie zamknieto ani nie sklasyfikowano zadnego realnego Eventu lub Workday. Nie wykonano migracji, commita, pusha ani wdrozenia produkcyjnego.
- Wymagana kolejnosc wdrozenia: najpierw read-only klasyfikacja historycznych danych i pelny schemat/operacje Data Connect, potem review-only guardy SQL po czystym preflight, nastepnie runtime backend/mobile i na koncu portal.
- Pusty `event_type` nie jest automatycznie traktowany jako CLEAN. Klasyfikacja musi wynikac z dokladnego powiazania ID i stanu Workday albo z decyzji operacyjnej potwierdzonej na danych.

Data: 2026-07-24
Autor: AI Codex
Temat: Produkcyjny etap 1 - bezpieczne operacje diagnostyczne Data Connect
Wdrożono:
- Do produkcyjnego connectora `example` w usłudze `iclean-room-service` wdrożono wyłącznie dwie operacje tylko do odczytu: `WorkdaysIntegrityPageForOrg` i `EventsIntegrityPageForOrg`.
- Operacje wymagają zalogowanego użytkownika, aktywnego członkostwa w organizacji i jednej z ról zarządczych: `ADMIN`, `ADMINISTRATOR`, `OWNER`, `SUPERADMIN`, `MANAGER`, `KIEROWNIK`, `COORDINATOR` albo `KOORDYNATOR`.
- Zwykłe role pracownicze nie otrzymały dostępu do pełnej historii organizacji.
Bezpieczeństwo wdrożenia:
- Przed wdrożeniem pobrano świeży connector produkcyjny. Schemat, mutacje i konfiguracja były identyczne z pakietem wdrożeniowym; logiczny diff zapytań wynosił `+78/-0` i dodawał tylko wskazane dwie operacje.
- Użyto celu `dataconnect:iclean-room-service:example`. Produkcyjny `Schema Last Updated` pozostał bez zmiany (`2026-07-14T09:46:35.828265807Z`), a `Connector Last Updated` zmienił się na `2026-07-24T07:29:00.284925465Z`.
- Źródło pobrane ponownie po wdrożeniu miało identyczne SHA-256 jak przygotowany pakiet dla `schema.gql`, `queries.gql` i `mutations.gql`.
- Nie użyto `--force`. Nie uruchomiono żadnego pliku SQL, migracji, triggera, backfillu ani klasyfikacji danych. Nie zmieniono Eventów, Workday, zleceń ani statusów START/STOP.
Weryfikacja na zalogowanym localhost:
- `WorkdaysIntegrityPageForOrg` działa: kafelek `Brak QR STOP` pokazał 4 niezamknięte dni starsze niż dzisiaj i otworzył dokładnie cztery pozycje do uzupełnienia.
- `EventsIntegrityPageForOrg` działa: zamiast błędu `operation not found` portal pokazał pełną kontrolę historycznych wpisów. W chwili odczytu było 90 nierozstrzygniętych otwartych wpisów bez `event_type` u 10 pracowników oraz 37 historycznych wpisów wymagających klasyfikacji u 16 pracowników.
- Są to wartości dynamiczne z chwili odczytu. Sam odczyt niczego nie zamknął i nie uznał automatycznie za CLEAN.
Zmiany lokalnego źródła po audycie:
- Ograniczono role w trzech pełnych zapytaniach diagnostycznych/korelacyjnych do ról zarządczych, zgodnie z wdrożonym connector-em.
- `matchStatus` pozostaje lokalnie polem nullable bez automatycznego defaultu, aby przyszły etap schematu nie klasyfikował istniejących rekordów przez samo wdrożenie.
- Poprawiono położenie `schemaValidation: "COMPATIBLE"` w `dataconnect.yaml`, aby Firebase CLI faktycznie odczytywał tę opcję.
Testy/sprawdzenia lokalne:
- `npm.cmd test`: OK, 176 z 176 testów.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK, Vite przetworzył 392 moduły; pozostało tylko istniejące ostrzeżenie o dużych chunkach.
- Kontrolny dry-run lokalnego pełnego źródła zatrzymał się bez wdrożenia na wymaganym potwierdzeniu zmian breaking. Nie użyto `--force`.
Blokada pełnego schematu korelacji:
- Pełny dry-run schematu wykazał niezależny dryf istniejącej bazy: próbę zwężenia kilku `worker_id`, usunięcia dwóch unikalnych indeksów pracownika i ustawienia `zone.client_id` na `NOT NULL`. Taki deploy został przerwany.
- Pełny schemat korelacji, guardy SQL, runtime backend/mobile i automatyczna korelacja planu nadal nie zostały wdrożone. Wymagają osobnego, kontrolowanego etapu po przygotowaniu wyłącznie addytywnej migracji i preflight bazy.

Data: 2026-07-24
Autor: AI Codex
Temat: Lokalny pakiet bezpiecznej aktywacji korelacji CLEAN bez zmian produkcyjnych
Dodano lokalnie:
- Addytywną migrację `dataconnect/migrations/20260724_service_execution_correlation_additive.sql`: 15 nullable kolumn bez defaultów, backfillu, klasyfikacji historii, triggerów i zmian istniejących rekordów. Indeksy korelacji są tworzone `CONCURRENTLY`; migracja ma timeouty, advisory lock i kontrole metadanych.
- Osobną mutację `ReidentifyEventForOrg`. Jawna zmiana powiązanego dnia, obiektu, pracownika lub czasu START unieważnia poprzedni link i snapshot planu oraz ustawia `UNMATCHED`; zwykłe dopisanie STOP korzysta z `UpdateEventForOrg` i nie dotyka tożsamości korelacji.
- Jawny bezpiecznik restore: connector nie wystawia `RestoreEventForOrg`, a backup zawierający moduł `Zdarzenia` jest zatrzymywany przed migawką wstępną i przed jakimkolwiek zapisem. Pola korelacji pozostają w eksporcie, ale ich odtworzenie wymaga przyszłej atomowej walidacji serwerowej planu, alokacji i snapshotu.
- Walidację integralności danych Event w backupie: brak lub duplikat `eventId`, niepoprawny otwarty typ, kilka otwartych CLEAN tej samej osoby, nieznany `matchStatus`, niekompletny MATCHED i obca wersja snapshotu są raportowane przed blokadą restore.
- Testy behawioralne zachowania sekund/milisekund START, rozróżniania wielkości liter w identyfikatorach planu oraz blokady niezweryfikowanego restore.
Zmieniono:
- `InsertEventForOrg` nie przyjmuje już od klienta typu zdarzenia do zapisu. Typ jest wymuszony w operacji jako `CLEAN`, więc rola pracownicza nie może ominąć invariantu innym `eventType`.
- Flaga `MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED` blokuje tylko utworzenie nowego CLEAN. Nadal można zamknąć już otwarty CLEAN; przy zmianie strefy flaga jest sprawdzana przed zamknięciem poprzedniego cyklu.
- Edytor Eventu zachowuje dokładny pierwotny START i STOP, jeżeli pole widoczne z dokładnością do minuty nie zostało świadomie zmienione. Samo dopisanie STOP nie obcina sekund START i nie kasuje poprawnej korelacji.
- Brak jawnego baseline przy aktualizacji Eventu działa fail-closed i wybiera rekorelację. Znane ścieżki edytora i raportu przekazują pełny rekord źródłowy; porównanie obejmuje również `workdayId`.
- `ReidentifyEventForOrg` jest na allowliście sesji platformowej i wymaga świeżego uwierzytelnienia MFA. `RestoreEventForOrg` usunięto z connectora, SDK i allowlisty.
- Wersję formatu backupu podniesiono do `1.1.0`, a SDK Firebase Data Connect wygenerowano ponownie.
Testy/sprawdzenia:
- `npm test`: OK, 191 z 191 testów.
- `npm --prefix web-app run lint`: OK.
- `npm run build`: OK, Vite przetworzył 395 modułów; pozostaje tylko istniejące ostrzeżenie o dużych chunkach.
- `firebase dataconnect:sdk:generate` uruchomione przez Node.js 24 z systemowym magazynem CA: OK; pozostaje istniejące ostrzeżenie o aliasie `cycleId/workdayId`.
- Targetowane testy zabezpieczeń korelacji, mobile, migracji, kolejności dual-write i backupu: OK, 27 z 27.
Stan produkcji i granice:
- Produkcyjny `public.event` ma już 15 addytywnych kolumn korelacji. Wszystkie są nullable, nie mają defaultów i zostały dodane bez backfillu, triggerów, kluczy obcych ani klasyfikacji historii.
- Utworzono współbieżnie trzy indeksy: `event_org_task_occurrence_idx`, `event_org_plan_slot_idx` i `event_org_match_status_updated_idx`. Końcowy postflight potwierdził dla wszystkich `indisvalid=true` oraz `indisready=true`, a definicje i kolejność kolumn są zgodne z migracją.
- Nie zmieniono żadnego istniejącego Eventu, Workday, zlecenia ani statusu START/STOP. Postflight wykazał `0` rekordów z automatycznie wpisanymi danymi korelacji.
- Flaga aktywacyjna pozostaje `false`. Nie wykonano deployu aplikacji/connectora, commita ani pusha.
- Odczytowy preflight Cloud SQL Studio wykonano 2026-07-24 na `iclean-room-database` jako `biuro@bestclean.pl`: PostgreSQL `17.10`, `public.event` ma `8051` rekordów i rozmiar `6736 kB`.
- W preflighcie wszystkie 15 planowanych kolumn korelacji oraz trzy planowane indeksy były nieobecne. Nie było kolizji nazw ani śladów częściowego wdrożenia.
- W chwili preflightu nie było oczekujących blokad tabeli `public.event` ani innych aktywnych sesji w bazie. Zapytania zakończyły się odpowiednio w `43,6 ms` i `8,9 ms`.
- Addytywną migrację wykonano 2026-07-24 w Cloud SQL Studio na `iclean-room-database` jako `biuro@bestclean.pl`. Transakcja dodająca i walidująca kolumny trwała `7,1 ms`; indeksy współbieżne trwały kolejno `18,0 ms`, `13,8 ms` i `16,0 ms`.
- Końcowy postflight wykazał `15/15` bezpiecznych kolumn, `3/3` poprawne indeksy, `8056` rekordów Event, `0` rekordów z danymi korelacji i `0` oczekujących blokad. W czasie migracji aktywna aplikacja dopisała pięć normalnych zdarzeń (`8051 -> 8056`); migracja nie uzupełniła w nich nowych pól.
- Cloud SQL Data API pozostaje wyłączone i nie zmieniano konfiguracji instancji. Pełny diff Data Connect nadal nie został uruchomiony z powodu niezależnego dryfu istniejącego schematu.
- Bezpieczny kolejny krok produkcyjny to osobny deploy przygotowanego connectora/runtime z flagą nadal ustawioną na `false`, a następnie test zapisu i odczytu przed jakąkolwiek aktywacją korelacji. Odtwarzanie Eventów pozostaje celowo wyłączone do czasu wdrożenia zaufanej, atomowej ścieżki serwerowej.

Data: 2026-07-24
Autor: AI Codex
Temat: Minimalny pakiet Data Connect korelacji zatrzymany na bezpiecznym dry-runie
Przygotowano:
- Pobrano świeże produkcyjne źródło schematu i connectora `example`, a następnie utworzono izolowany pakiet `.codex-tmp/dataconnect-stage1-correlation-baseline-20260724b`.
- Do pakietu dodano wyłącznie 15 pól i trzy indeksy modelu Event, pola korelacji w istniejących odczytach Event, dwa nowe zapytania korelacyjne oraz osobną mutację `ReidentifyEventForOrg`.
- Nie zmieniono produkcyjnych definicji `InsertEventForOrg` ani `UpdateEventForOrg`, aby sam etap connectora nie zmienił zachowania obecnego portalu.
- Diff izolowanego pakietu względem ponownie pobranego produkcyjnego baseline wynosi `319` dodanych linii i jedną techniczną zmianę linii indeksu w trzech plikach Data Connect. Nie zawiera zmian rentowności, UI, runtime, aplikacji mobilnej ani innych lokalnych modułów.
Weryfikacja:
- `dataconnect:compile` dla `iclean-room-service` zakończył się sukcesem.
- Pełny `firebase deploy --dry-run --only dataconnect:iclean-room-service` zakończył kompilację schematu i connectora, ale pokazał siedem niezależnych zmian SQL spoza zakresu korelacji.
- Odczyt w Cloud SQL Studio potwierdził, że `organization_member.worker_id`, `organizations.owner_worker_id`, `task.worker_id` i `worker.worker_id` mają rzeczywiście `varchar(128)` i są nullable, podczas gdy produkcyjne źródło Data Connect nadal deklaruje `varchar(64)`.
- `zone.client_id` ma rzeczywiście `varchar(64)` i jest nullable, podczas gdy źródło Data Connect deklaruje pole wymagane.
- Indeksy `worker_org_login_ci_uidx` i `worker_org_worker_id_ci_uidx` są unikalnymi indeksami funkcyjnymi `lower(...)`; drugi jest dodatkowo indeksem częściowym. Zwykła dyrektywa indeksu Data Connect nie odwzorowuje tych definicji.
Decyzja bezpieczeństwa:
- Deploy nie został wykonany. Nie użyto `--force`, nie wyłączono walidacji schematu, nie usunięto indeksów i nie wykonano żadnego `ALTER TABLE`.
- Nie zmieniono produkcyjnego schematu Data Connect, connectora, runtime, flag, danych firmy ani statusów START/STOP. Wykonana wcześniej addytywna migracja Cloud SQL pozostaje bez zmian.
- Przed deployem trzeba osobno uzgodnić i wdrożyć bezpieczne rozwiązanie dryfu produkcyjnego schematu Data Connect, które zachowa oba indeksy unikalności i szerokość `varchar(128)`. Dopiero czysty dry-run bez `DROP`, zwężeń typów i `SET NOT NULL` pozwoli wrócić do wdrożenia connectora korelacji.

Data: 2026-07-24
Autor: AI Codex
Temat: Audyt dryfu Worker/Zone i lokalny zamiennik indeksow funkcyjnych
Stan produkcji odczytany bez zmian:
- `public.worker` ma 86 rekordow. Nie ma ani jednej grupy duplikatow po `org_id + lower(btrim(login))` ani po `org_id + lower(btrim(worker_id))`.
- `login_normalized` jest puste w 63 rekordach, a jeden niepusty rekord ma niepoprawna wielkosc liter. Loginy i `worker_id` nie maja zewnetrznych spacji; maksymalne dlugosci wynosza odpowiednio 37 i 36 znakow.
- Tabela Worker nie ma triggera utrzymujacego pola znormalizowane. Oba dotychczasowe indeksy `worker_org_login_ci_uidx` i `worker_org_worker_id_ci_uidx` sa unikalne, valid i ready.
- `public.zone` ma 1342 rekordy, w tym 0 pustych/null `client_id` i 0 osieroconych powiazan z klientem. Nie przywrocono jednak `NOT NULL`, bo migracja `20260720_zone_qr_optional_assignment.sql` celowo dopuszcza nieprzypisane kody QR.
Przygotowano lokalnie:
- Kontrolowana migracje `dataconnect/migrations/20260724_worker_identity_normalization_additive.sql`. Dodaje nullable `worker_id_normalized`, uzupelnia tylko dwa pola pochodne, instaluje trigger utrzymujacy normalizacje i dwa nowe indeksy unikalne na jawnych kolumnach.
- Migracja nigdy nie przepisuje `login` ani `worker_id`, zatrzymuje sie na duplikatach lub niezgodnym schemacie i nie usuwa starych indeksow funkcyjnych. Stare i nowe zabezpieczenia maja dzialac rownolegle do osobnej decyzji o deployu Data Connect.
- W izolowanym pakiecie `.codex-tmp/dataconnect-stage1-correlation-baseline-20260724b` skorygowano cztery szerokosci `worker_id` do `varchar(128)`, dodano `workerIdNormalized` oraz deklaratywne `@unique` dla obu jawnych pol normalizowanych. Wariant kompiluje sie poprawnie pod technicznym ID audytowym.
Weryfikacja:
- Targetowane testy migracji: 3 z 3 OK.
- Pelne `npm test`: 194 z 194 OK.
- Produkcyjna migracja Worker nie zostala uruchomiona. Nie wykonano backfillu, triggera, indeksu, deployu, `--force`, commita ani pusha.
Blokada:
- Firebase CLI wymaga interaktywnego `firebase login --reauth` przed ponownym `dataconnect:sql:diff`. Oficjalne logowanie zostalo uruchomione, ale do czasu jego zakonczenia nie wolno wykonywac produkcyjnego etapu ani uznawac diffu za czysty.
- Prawdziwy model Zone jest nullable z powodu opcjonalnych, jeszcze nieprzypisanych kodow QR. Aktualizacja kontraktu Data Connect z non-null na nullable jest przez Firebase klasyfikowana jako breaking API i wymaga osobnej, jawnej decyzji; nie wolno maskowac tego przez przywrocenie `NOT NULL`.

Data: 2026-07-24
Autor: AI Codex
Temat: Produkcyjna normalizacja Worker zakonczona, connector korelacji nadal fail-closed
Wdrozone w Cloud SQL:
- Uruchomiono w jednej transakcji migracje `dataconnect/migrations/20260724_worker_identity_normalization_additive.sql`.
- Dodano nullable `worker_id_normalized varchar(128)`, uzupelniono wylacznie pola pochodne `login_normalized` i `worker_id_normalized`, dodano trigger `worker_identity_normalized_biu` oraz dwa nowe indeksy unikalne na jawnych polach normalizowanych.
- Nie przepisano `login` ani `worker_id`. Zachowano oba stare indeksy funkcyjne `worker_org_login_ci_uidx` i `worker_org_worker_id_ci_uidx`; nie wykonano zadnego `DROP`.
Postflight produkcji:
- `86` rekordow Worker, `0` rozbieznosci `login_normalized`, `0` rozbieznosci `worker_id_normalized`.
- Stary i nowy komplet indeksow jest obecny, a nowa kolumna i trigger sa aktywne.
- Ponowny `dataconnect:sql:diff` nie proponuje juz dodania kolumny ani nowych indeksow. Pozostaly tylko dwa niezatwierdzone `DROP INDEX` starych zabezpieczen oraz osobna zmiana FK Zone z `ON DELETE CASCADE` na `ON DELETE SET NULL`.
Weryfikacja connectora:
- Oficjalna dokumentacja Firebase potwierdza, ze opcjonalne `@ref` generuje `ON DELETE SET NULL`, a wymagane `@ref` generuje `ON DELETE CASCADE`; dyrektywa nie ma parametru pozwalajacego niezaleznie ustawic akcje usuwania.
- Dry-run connectora z prawdziwym nullable Zone zostal poprawnie zatrzymany jako breaking API: `ZonesForOrg.zones.clientId` i `EventsIntegrityPageForOrg.events.zone.clientId` zmieniaja typ z non-null na nullable.
- W izolowanym wariancie zachowujacym dotychczasowy non-null kontrakt connector kompiluje sie, a dry-run przechodzi bez breaking assessments. Rzeczywisty deploy samego connectora zostal jednak odrzucony przez API przed publikacja jako `invalid connector sources`, poniewaz nowy connector odwoluje sie do pol korelacji, ktore nie sa jeszcze udostepnione przez produkcyjny schemat aplikacyjny Data Connect.
Granice bezpieczenstwa:
- Nie wdrozono schematu Data Connect ani connectora korelacji, nie uzyto `--force`, nie ustawiono `schemaValidation: NONE`, nie zmieniono FK Zone i nie usunieto zadnego indeksu.
- Flaga korelacji pozostaje wylaczona. Nie zmieniono Eventow, Workday, zlecen, statusow START/STOP ani danych planu.
- Kolejny etap musi osobno rozwiazac rollout nullable `Zone.clientId` dla istniejacych klientow API albo utworzyc odseparowany kontrakt/usluge korelacji. Nie wolno laczyc tej decyzji z usuwaniem starych indeksow Worker.

Data: 2026-07-24
Autor: AI Codex
Temat: Produkcyjny schemat i connector korelacji wdrozone z zachowaniem zgodnosci
Wdrozone w Cloud SQL:
- Uruchomiono addytywna migracje `dataconnect/migrations/20260724_zone_client_fk_set_null_additive.sql`. Jedyna zmiana definicji to kontrolowane przejscie FK `zone_org_id_client_id_fkey` z `ON DELETE CASCADE` na `ON DELETE SET NULL`; kolumna pozostala nullable, a dane Zone nie zostaly przepisane.
- Po niezaleznej kontroli nowych zabezpieczen uruchomiono `dataconnect/migrations/20260724_worker_legacy_guard_retirement.sql`, ktora usunela tylko dwa redundantne indeksy funkcyjne Worker wskazane przez `sql:diff`.
- Postflight: `86` rekordow Worker, `0` rozbieznosci obu pol normalizowanych, aktywny trigger i oba nowe indeksy unikalne; `1342` rekordy Zone, `0` osieroconych powiazan, FK jest validated i ma akcje `SET NULL`.
Wdrozone w Firebase Data Connect:
- Izolowany pakiet `.codex-tmp/dataconnect-stage1-correlation-baseline-20260724b` przeszedl schema validate-only, a nastepnie zostal opublikowany oficjalnym API Data Connect bez wykonywania dodatkowego SQL. Zastosowano te sciezke, poniewaz lokalny Norton Web/Mail Shield przechwytuje polaczenie TLS uzywane przez standardowy connector Cloud SQL.
- Koncowy schema etag: `6oy5hfv7mUxwkt9hR8dLk8LTk7FB0pelWd5JO7FGG0M`; connector etag: `kDN-yHgLDCA9IB1UwlgSQ8lXV1x-7wOe5eZ1Rl66z8I`.
- Zweryfikowane fingerprinty: schema `a854fb83bbf5c1d91bdf5d14c3d6576817ec2294b4ba28a78216c669fb84526f`, mutations `4adbbbfce54cd25df28823f2ad07d7f44e3ae33177ec35fd232cc039f5464217`, queries `a34bd40f740a87a4df49a73dd4a321482dfb312ff1e382a2975a2ba641d8a502`.
Zgodnosc i kontrola regresji:
- Connector zachowuje wszystkie `42` operacje ze swiezego produkcyjnego baseline sprzed wdrozenia i ma teraz lacznie `45` operacji, w tym wymagane `ZonesForOrg`, `EventsIntegrityPageForOrg` i `WorkdaysIntegrityPageForOrg`.
- Produkcyjny bundle portalu zawiera nazwy 12 operacji magazynu i zlecen indywidualnych, ktorych nie bylo juz w baseline przed wdrozeniem. Produkcyjna baza nie ma tabel `storage`, `client_storage` ani `individual_job`; nie tworzono ich w ramach korelacji i nie maskowano tego starego dlugu technicznego nieautoryzowana migracja.
- Koncowy `dataconnect:sql:diff` wynosi zero. Pelny dry-run kompiluje schemat i connector, potwierdza zgodnosc bazy i konczy sie komunikatem `Dry run complete`.
- Pelne `npm test`: `200/200` OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
Granice rollout:
- `MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED=false` pozostaje zarowno w `.env.example`, jak i `apphosting.yaml`. Nie aktywowano automatycznej korelacji dla pracownikow i nie zmieniono zadnego Eventu, Workday, statusu START/STOP ani zlecenia.
- Lokalny portal dziala pod `http://localhost:5173/`. Do kontrolowanego testu E2E zapisu i odczytu potrzebna jest zalogowana sesja portalu; dopiero po takim tescie mozna osobno zdecydowac o wlaczeniu flagi.

Data: 2026-07-24
Autor: AI Codex
Temat: Izolowany lokalny fallback TLS dla pelnego stosu developerskiego
Zmieniono lokalnie:
- `scripts/dev-local.js` przyjmuje teraz opcjonalne `DEV_BACKEND_TLS_REJECT_UNAUTHORIZED`, stosowane wylacznie do procesu lokalnego backendu. Pobranie sekretow, frontend i konfiguracja App Hosting nie dziedzicza tego ustawienia.
- `.env.example` dokumentuje, ze wartosc `0` jest tymczasowym wyjatkiem tylko dla komputera, na ktorym skaner HTTPS przechwytuje tunel Cloud SQL i systemowy magazyn CA nie wystarcza.
- `worker-repository.js` sprawdza aktualne kolumny `login_normalized`, `worker_id_normalized` oraz ich indeksy unikalne. Nie wymaga juz dwoch starych indeksow funkcyjnych, ktore zostaly wycofane po kontrolowanej migracji.
- Dodano test regresji gotowosci schematu Worker dla nowego kompletu zabezpieczen oraz odrzucenia powrotu do starych indeksow.
Granice:
- Nie zmieniono `apphosting.yaml`, flagi korelacji ani danych firmy.
- Ustawienie nie jest przeznaczone do produkcji i nie moze byc wlaczane w App Hosting.

Data: 2026-07-24
Autor: AI Codex
Temat: Kafelek Brak QR STOP zgodny z rzeczywistym stanem Workday
Diagnoza:
- Odczyt produkcyjnych danych przez lokalny portal wykazal `7` otwartych dni pracy starszych niz dzis, podczas gdy pulpit pokazywal tylko `3`.
- Pulpit uznawal kazde zamkniete zdarzenie CLEAN za zamkniecie calego dnia, jezeli zdarzenie bylo powiazane z tym samym `workdayId`. Przykladem byl dzien Rafala Dudka z `2026-07-06`: Workday nadal mial `RUNNING` i brak `endAt`, ale osiem sekund trwajace zdarzenie zakonczone jako `QR_SAME` ukrywalo go z listy.
- Aplikacja mobilna prawidlowo traktowala ten Workday jako otwarty i zatrzymywala kolejny skan kodem `MULTIPLE_OPEN_WORKDAYS`.
Zmieniono lokalnie:
- Dodano czysty model `historicalOpenWorkdayModel.js`, ktory rozroznia STOP uslugi od STOP dnia pracy.
- Kafelek `Brak QR STOP` opiera sie teraz na rzeczywistym stanie rekordu Workday. Zamkniete zdarzenie uslugi nie ukrywa otwartego dnia; dzisiejszy otwarty dzien nadal nie jest liczony jako zaleglosc.
- Po poprawce licznik i lista pokazuja komplet `7` otwartych dni sprzed dzis, w tym Rafala Dudka z `2026-07-06`.
Weryfikacja i granice:
- Testy regresji modelu rozrozniaja `QR_SAME` od `STOP_END_DAY`, zamkniety Workday, otwarty stary Workday i otwarty dzien dzisiejszy.
- Pelne `npm test`: `207/207` OK. `npm --prefix web-app run lint`: OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
- Nie zamknieto ani nie zmieniono zadnego Workday, Eventu, statusu START/STOP ani zlecenia. Flaga korelacji pozostaje wylaczona do czasu uporzadkowania konfliktu danych.

Data: 2026-07-24
Autor: AI Codex
Temat: Edycja zaleglego dnia przypieta do dokladnego workdayId
Diagnoza:
- Klikniecie zaleglego dnia Rafala z `2026-07-06` poprawnie przekazywalo `WD-4bfe2b2e-a515-4def-afcf-0094db709da1`, ale ekran czasu pracy ponownie wybieral zagregowany wiersz tylko po dacie.
- W tej samej dacie istnial juz zamkniety Workday `08:00-17:43` oraz osobny otwarty Workday od `17:43:48`. Formularz pokazywal dane zamknietego rekordu, a zapis zagregowanego dnia moglby zaktualizowac kilka rekordow jednoczesnie.
Zmieniono lokalnie:
- Intencja otwarcia edytora z `workdayId` wyszukuje teraz tylko dzien zawierajacy dokladny rekord i nie wraca do innego rekordu tej samej daty.
- Formularz z intencji zaleglego STOP otrzymuje tylko wskazany rekord z `sourceRows`; zwykla reczna edycja dnia bez `workdayId` zachowuje dotychczasowe zachowanie.
- Dodano czysty model wyboru rekordow oraz testy: dokladny wybor, zatrzymanie przy brakujacym ID i niezmieniona zwykla edycja dnia.
Granice:
- Blednie otwarty formularz zostal anulowany bez zapisu. Na tym etapie nie zmieniono zadnego produkcyjnego Workday ani Eventu.
- Pelne `npm test`: `210/210` OK. `npm --prefix web-app run lint`: OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.

Data: 2026-07-25
Autor: AI Codex
Temat: Dokladne zamkniecie zaleglego Workday Rafala i obsluga sekund
Zmieniono lokalnie:
- Edytor czasu Workday pokazuje i zapisuje czas z dokladnoscia do sekund (`step="1"`), zamiast obcinac zaakceptowany STOP do pelnej minuty.
- Wspolny model edytora zawiera testowalny formatter `HH:MM:SS`; dodano regresje potwierdzajaca zachowanie sekund.
Zmiana danych produkcyjnych:
- Po jawnej akceptacji operatora zamknieto tylko rekord `WD-4bfe2b2e-a515-4def-afcf-0094db709da1` dla Rafala Dudka z `2026-07-06`.
- Zapisano START `17:43:48`, STOP `17:44:06`, `duration_sec=18`, `status=CLOSED` i `updated_by=Rafal Dudek`.
- Bezposredni odczyt Cloud SQL potwierdzil zapis. Po pelnym odswiezeniu portal zmniejszyl licznik `Brak QR STOP` z `8` do `7`, a pozycja Rafala z `06.07.2026` zniknela z listy.
- Dla loginu `Rafal` pozostal jeden otwarty Workday: `WD-18bff3ae-e927-43af-970a-51e96d978407` rozpociety `2026-07-24 09:10:48` czasu Europe/Warsaw.
Weryfikacja i granice:
- Targetowane testy edytora: `4/4` OK. Pelne `npm test`: `211/211` OK. `npm --prefix web-app run lint`: OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
- `git diff --check` dla zmienionych plikow: brak bledow, tylko standardowe ostrzezenia LF/CRLF.
- `MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED` pozostaje wylaczone. Nie utworzono testowego CLEAN ani zlecenia; 25.07.2026 portal nie pokazuje zadnego zaplanowanego zlecenia, wiec nie bylo poprawnego planu do kontrolowanego dopasowania.

Data: 2026-07-25
Autor: AI Codex
Temat: Deduplikacja produkcyjnych reprezentacji przydzialu przed korelacja CLEAN
Diagnoza:
- Odczytowy preflight produkcji znalazl `11` zlecen oraz `9` unikalnych wykonan zaplanowanych na poniedzialek `2026-07-27`.
- Ten sam rzeczywisty przydzial byl przechowywany rownolegle jako `slots`, `workAllocations`, `workerAllocations`, `workerAssignments` oraz globalny skrot przydzialu. Parser tworzyl z nich od `2` do `3` kandydatow, dlatego suchy test wszystkich `9` wykonan konczyl sie `AMBIGUOUS`.
- Dopasowanie strefy nadal nie korzysta z nazwy klienta. Skan QR dostarcza dokladne `zoneId` i powiazane `clientId`; plan bez opcjonalnego `zoneId` moze pasowac tylko przez zgodne kanoniczne `clientId`.
Zmieniono lokalnie:
- Szczegolowe sloty i przydzialy maja pierwszenstwo przed pomocniczym `workerAssignments`.
- Globalny przydzial bez `serviceBlockId` jest pomijany tylko wtedy, gdy ten sam pracownik ma juz szczegolowy przydzial w aktywnym bloku. Jawne rozne bloki i przydzialy zachowuja osobne tozsamosci.
- Dodano test odtwarzajacy dokladna wielowarstwowa strukture z produkcyjnego zlecenia.
Weryfikacja i granice:
- Po poprawce suchy test tych samych danych produkcyjnych daje `9/9 MATCHED` dla `2026-07-27`, kazdy z jednym dokladnym `taskId`, `serviceBlockId`, `allocationId` i `workSlotKey`.
- Rozszerzony test wszystkich wystapien w okresie 35 dni od `2026-07-25` sprawdzil `225` unikalnych planowanych wykonan i uzyskal `225/225 MATCHED`, bez `AMBIGUOUS`, `UNMATCHED` ani nieprzetestowalnych pozycji.
- Testy korelacji, repozytorium i modelu: `52/52` OK. Pelne `npm test`: `212/212` OK. `npm --prefix web-app run lint`: OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
- Preflight i suchy test byly tylko do odczytu. Nie zmieniono zadnego zlecenia, Eventu, Workday ani statusu START/STOP. Flaga `MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED` pozostaje wylaczona.

Data: 2026-07-25
Autor: AI Codex
Temat: Produkcyjny rollout runtime korelacji z flaga nadal wylaczona
Wdrozenie:
- Potwierdzono, ze `portal.cleanzi.pl` korzysta z backendu Firebase App Hosting `cleanzi-01`, repozytorium `biuro-del/Cleanzi-01` i lokalizacji `europe-west4`.
- Od produkcyjnego commita `f8098b6d4fdcd3367700b56e0844bda589d00975` utworzono izolowany kandydat wydania bez lokalnych zmian rentownosci i UI.
- Commit wydania `e7aa7188c15350f2c0f995a77115cd71f68f918f` wypchnieto na osobna galaz `release/service-correlation-safe-20260725`.
- App Hosting utworzyl `build-2026-07-25-001` i `rollout-2026-07-25-001`. Build zakonczyl sie stanem `READY`, rollout stanem `SUCCEEDED`, a aktywny ruch wskazuje w 100% ten build.
Zakres i bezpieczenstwo:
- Wdrożono runtime korelacji CLEAN, repozytorium zapisu snapshotu planu, jednoznaczna identyfikacje pracownika/QR, kontrole otwartych Workday/CLEAN oraz zgodnosc gotowosci schematu Worker.
- Build App Hosting potwierdza dokladny commit `e7aa7188...` oraz efektywna wartosc `MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED=false` pochodzaca z `apphosting.yaml`.
- Nie wdrazano ponownie Data Connect ani migracji. Nie wykonano zapisu do Cloud SQL, backfillu, zmiany Eventu, Workday, zlecenia ani statusu START/STOP.
- Automatyczna korelacja i tworzenie nowego CLEAN pozostaja wylaczone. START i STOP dnia pozostaja dostepne.
Weryfikacja:
- Izolowany kandydat: `npm test` 65/65 OK, kontrola skladni backendu OK, `npm run build` OK, lokalny backend odpowiedzial `200 {"ok":true}`.
- Produkcja: `/` odpowiada HTTP 200; `/api/auth/session-context` i `/api/mobile/state` bez tokenu odpowiadaja oczekiwanym HTTP 401 z kodem `UNAUTHENTICATED`, co potwierdza dzialanie nowego runtime.
- Sciezka `/healthz` jest odrzucana na warstwie App Hosting przed aplikacja (HTTP 404), dlatego postflight oparto na aktywnym buildzie, 100% ruchu i rzeczywistych trasach API.
- Pelny lint izolowanego drzewa zatrzymuje jeden istniejacy blad `no-unused-vars` w niezmienionym pliku `web-app/apps/portal-web/src/features/orders/index.js`; rollout nie zawiera zmian `web-app`.
Kolejny etap:
- Osobnej decyzji wymaga czasowe lub stale ustawienie flagi na `true` i kontrolowany test E2E na rzeczywistym zaplanowanym wykonaniu. Do tego czasu system nie zapisze nowej korelacji CLEAN.

Data: 2026-07-26
Autor: AI Codex
Temat: Canary korelacji CLEAN dla W001 i przygotowanie testu E2E
Wdrozenie:
- W izolowanym worktree `app-to-react-correlation-release-20260725` dodano polityke canary po exact worker ID/login.
- Commit `d5a6f6e6bfb271ad5a683d21c57d93848c880810` wypchnieto na `release/service-correlation-safe-20260725`.
- App Hosting utworzyl `build-2026-07-26-001` i `rollout-2026-07-26-001`; build ma stan `READY`, rollout `SUCCEEDED`, a ruch produkcyjny wskazuje w 100% nowy build.
- Efektywne zmienne z `apphosting.yaml`: `MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED=true` oraz `MOBILE_SERVICE_EXECUTION_CORRELATION_CANARY_WORKER_IDS=W001`.
Zakres bezpieczenstwa:
- Nowy CLEAN moze utworzyc tylko pracownik `W001` (Rafal Dudek). Inni pracownicy otrzymuja blokade canary. START i STOP pozostaja niezalezne od flagi.
- Testy polityki, runtime i korelacji: `69/69` OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
Zlecenie testowe:
- Dodano jednorazowe zlecenie produkcyjne `codex-e2e-20260726-w001-best-clean-bc0071` na `2026-07-26`, godziny `12:14-14:29`, klient `Best Clean`, strefa `BC0071`, pracownik `W001`.
- Suchy test po zapisie: `MATCHED`, powod `EXACT_IDS_UNIQUE`, dokladnie jeden kandydat, `serviceBlockId=e2e-service-20260726`, `allocationId=slot-w001`, `workSlotKey=slot:e2e-service-20260726:slot-w001`.
Porzadkowanie danych przed testem:
- Piec osieroconych wpisow Rafala z `2026-06-17`, bez Workday i bez `event_type`, domknieto metoda `DATA_REPAIR_NEXT_SCAN`: end_at kazdego wpisu jest czasem kolejnego rzeczywistego skanu tego pracownika. Po transakcji liczba nierozstrzygnietych blockerow Event wynosi `0`.
- Nadal otwarty jest Workday `WD-18bff3ae-e927-43af-970a-51e96d978407` rozpoczety `2026-07-24T07:10:48.869Z`. Nie ustawiono fikcyjnego STOP; przed testem potrzebna jest faktyczna godzina zakonczenia pracy 24.07.
Postflight:
- `https://cleanzi-01--iclean-room.europe-west4.hosted.app/` i `https://portal.cleanzi.pl/` odpowiadaja HTTP 200.
- `/api/mobile/scan` bez tokenu odpowiada oczekiwanym HTTP 401 `UNAUTHENTICATED`.

Uzupelnienie 2026-07-26:
- Rafal Dudek podal faktyczna godzine zakonczenia pracy 24.07: `20:00` Europe/Warsaw.
- Exact Workday `WD-18bff3ae-e927-43af-970a-51e96d978407` zamknieto z `end_at=2026-07-24T18:00:00.000Z`, `status=CLOSED` i `duration_sec=38952`.
- Postcheck po transakcji: `0` otwartych Workday Rafala i `0` nierozstrzygnietych Eventow blokujacych nowy CLEAN.
- Ponowny preflight zlecenia testowego pozostaje `MATCHED`, `EXACT_IDS_UNIQUE`, dokladnie jeden kandydat.

Uzupelnienie E2E 2026-07-26:
- Skan START utworzyl exact Workday `WD-3ee39b5c-eb81-4bd5-b1d5-03912a5d10d1` dla loginu `Rafal`.
- Workday ma `start_at=2026-07-26T17:21:13.615Z` (`19:21:13` Europe/Warsaw), `status=RUNNING` i brak `end_at`.
- Ze wzgledu na pozniejszy rzeczywisty START zmieniono tylko jednorazowe zlecenie testowe `codex-e2e-20260726-w001-best-clean-bc0071` na okno `19:21-21:21`; zsynchronizowano czasy bloku uslugi i przydzialu W001.
- Transakcyjny postcheck po zmianie: `MATCHED`, powod `EXACT_IDS_UNIQUE`, dokladnie jeden kandydat, `serviceBlockId=e2e-service-20260726`, `allocationId=slot-w001`, `workSlotKey=slot:e2e-service-20260726:slot-w001`.
- Niezalezny odczyt potwierdzil aktywny Workday i brak utworzonego CLEAN przed skanem strefy `BC0071`.
- Test negatywny zwyklej strefy `BC0995` utworzyl Event `EV-5aa737ac-aee4-44b1-8619-cb1b42be0b1d` od `19:39:16` do `19:41:44` Europe/Warsaw.
- Ponowny skan `BC0995` poprawnie zamknal Event (`status=CLOSED`). Wpis nie otrzymal `task_id` ani danych dopasowania, wiec nie zostal blednie powiazany z planem `BC0071`.
- Po zamknieciu `BC0995` Workday `WD-3ee39b5c-eb81-4bd5-b1d5-03912a5d10d1` nadal ma `status=RUNNING`.
- Skan testowego QR `BC0071` utworzyl Event `EV-b18985a0-444e-4555-adb3-db2fd24d139a` od `20:05:23` do `20:10:22` Europe/Warsaw; ponowny skan poprawnie zamknal wpis z `end_reason=QR_SAME` i `duration_sec=299`.
- Test E2E korelacji nie przeszedl: Event `BC0071` ma puste `event_type`, `task_id`, `occurrence_date_ymd`, `service_block_id`, `allocation_id`, `work_slot_key` i `match_status`.
- Tabela `mobile_scan_command` nie zawiera polecenia dla tych skanow. Analiza czystego repozytorium `C:\Users\rafal\Desktop\mobile-web` potwierdzila, ze aplikacja zapisuje strefe bezposrednio przez Data Connect `InsertEventForOrg` w `mobileWorkflowService.js`, a nie przez `/api/mobile/scan` z wdrozona korelacja.
- Przed kolejnym E2E trzeba za zgoda wlasciciela zmienic rzeczywista sciezke zapisu `mobile-web`, przetestowac ja lokalnie i osobno zatwierdzic wdrozenie produkcyjne.

Uzupelnienie produkcyjne mobile-web 2026-07-26:
- W repozytorium `C:\Users\rafal\Desktop\mobile-web` utworzono galaz `agent/route-w001-scans-through-correlation-api` i draft PR `biuro-del/mobile-web#1`.
- Commit `9beca403623a7bd499dda862a6be2c108d4a319a` dodal sciezke `/api/mobile/scan`, dokladna polityke canary `W001`, idempotentny `clientActionId`, proxy z tokenem Firebase oraz brak cichego fallbacku do starego `InsertEventForOrg`.
- Postflight pierwszego rolloutu wykazal, ze uzytkownicy pobieraja aplikacje z Firebase Hosting (`app.cleanzi.pl`), a nie bezposrednio z domeny App Hosting. Dlatego dodano commit korygujacy `c83f4e7040c022fbb4f229251a8de2d160d5afd6`: staly endpoint App Hosting i scisly CORS tylko dla jawnych domen Cleanzi.
- Finalny App Hosting build `build-2026-07-26-w001-scan-002` ma stan `READY`, rollout `roll-2026-07-26-w001-scan-002` ma stan `SUCCEEDED`, a 100% ruchu backendu `mobile-web` wskazuje ten build i dokladny commit `c83f4e7040c022fbb4f229251a8de2d160d5afd6`.
- Firebase Hosting site `iclean-room` wdrozono jako wersje `bba1b7a4f120f91c`; `app.cleanzi.pl` i `iclean-room.web.app` serwuja bundle `mobile-dU12ScV8.js`.
- Produkcyjny bundle na obu domenach zawiera dokladny canary `W001`, adres bezpiecznego endpointu i prefiks idempotencji `mobile-scan-`. Pozostali pracownicy nadal korzystaja z dotychczasowej sciezki Data Connect.
- Produkcyjny preflight CORS z `https://app.cleanzi.pl` do backendu App Hosting odpowiada HTTP 204 i dopuszcza naglowki `Authorization, Content-Type`. POST bez tokenu odpowiada HTTP 401 `UNAUTHENTICATED`; obce originy sa odrzucane przed proxy.
- Weryfikacja lokalna finalnego commita: testy `11/11` OK, lint zmienionych modulow OK, build `APP_TARGET=mobile` OK, lokalny smoke test strony 200 i endpointu bez tokenu 401.
- W czasie wdrozenia nie zmieniono zadnego Workday, Eventu, zlecenia ani statusu START/STOP. Kolejny krok to pojedynczy skan `BC0071` przez odswiezona aplikacje W001 i natychmiastowy odczyt nowych pol korelacji przed ponownym skanem.

Korekta kontraktu orgId 2026-07-26:
- Pierwszy skan po wdrozeniu zatrzymal sie komunikatem `ORG_ID_MISSING` / `Brak poprawnego orgId.`. Produkcyjny endpoint wymaga `orgId` przed rozpoczeciem transakcji, a klient canary wysylal token i QR bez tego pola.
- Odczyt tylko do odczytu potwierdzil, ze bledne zadanie nie utworzylo Eventu ani wpisu `mobile_scan_command`; ostatni Event `BC0071` pozostal starym, zamknietym wpisem `EV-b18985a0-444e-4555-adb3-db2fd24d139a`.
- Commit `a6655cc80de37c3ca9073888a964a0d321280f63` przekazuje dokladne `orgId` z aktywnej sesji. Backend nadal weryfikuje czlonkostwo tej organizacji przed transakcja; orgId nie jest zgadywane z nazwy ani loginu.
- Testy finalnej poprawki: `12/12` OK, lint zmienionych modulow OK, build `APP_TARGET=mobile` OK i smoke test OK.
- App Hosting build `build-2026-07-26-w001-scan-003` ma stan `READY`, rollout `roll-2026-07-26-w001-scan-003` ma stan `SUCCEEDED`, a 100% ruchu wskazuje commit `a6655cc80de37c3ca9073888a964a0d321280f63`.
- Firebase Hosting wdrozono jako wersje `08d7cc49fb72bece`. `app.cleanzi.pl` i `iclean-room.web.app` serwuja bundle `mobile-BhBfFYaO.js` zawierajacy kontrakt orgId, canary W001 i idempotentny endpoint skanowania.

Weryfikacja START korelacji W001 2026-07-26:
- Produkcyjny skan `BC0071` o `21:11:42` Europe/Warsaw utworzyl Event `EV-c0b82e3a-09a9-4aa9-be86-434be1e438ff`.
- Event ma `event_type=CLEAN`, `status=RUNNING`, `task_id=codex-e2e-20260726-w001-best-clean-bc0071` oraz `match_status=MATCHED`.
- Powiazanie jest jednoznaczne: `match_method=EXACT_IDS_UNIQUE`, `service_block_id=e2e-service-20260726`, `allocation_id=slot-w001`, `work_slot_key=slot:e2e-service-20260726:slot-w001`.
- Komenda idempotentna zostala zapisana jako `mobile-scan-1785093102327-e2b76b3b-b0b8-4fa2-9237-6881bdd672d2` z akcja `START_ZONE`.
- Workday `WD-3ee39b5c-eb81-4bd5-b1d5-03912a5d10d1` pozostaje aktywny. Kolejny krok testu to drugi skan `BC0071`, ktory powinien zamknac tylko ten Event jako STOP strefy.
- Odczyt ujawnil dwa stare otwarte Eventy Rafala (`BC0838` z 18.06 i `BC0021` z 24.06), bez danych korelacji. Nie sa czescia dzisiejszego testu i nie zostaly zmienione.

Poprawka wybudzania aplikacji mobile W001 2026-07-26:
- Po zgloszeniu bledu `Nie znaleziono kodu QR` przy bardzo szybkim skanie po odblokowaniu telefonu potwierdzono w kodzie, ze chwilowy blad zapytania Data Connect byl zamieniany na pusta liste stref i mogl nadpisac poprzedni poprawny snapshot.
- Commit `d4d9027c432e74df9c3a2f9dd409976caa964770` dodal dla exact canary `W001`: rygorystyczne pobieranie wymaganych danych bez zamiany bledu na pusta liste, synchronizacje po `visibilitychange/pageshow`, blokade skanera na czas odswiezenia oraz bezpieczne zatrzymanie i restart strumienia kamery.
- Pozostali pracownicy zachowuja dotychczasowa polityke odswiezania i zapisu. Canary nadal jest wyznaczany przez dokladny worker ID `W001`, a nie login lub nazwe.
- Walidacja przed wdrozeniem: testy `15/15` OK, lint zmienionych plikow OK, build mobilny OK, pelny proces `npm ci + build` OK i lokalny smoke test OK.
- App Hosting build `build-2026-07-26-w001-wake-004` ma stan `READY`, rollout `roll-2026-07-26-w001-wake-004` ma stan `SUCCEEDED`, a 100% ruchu wskazuje dokladny commit `d4d9027c432e74df9c3a2f9dd409976caa964770`.
- Firebase Hosting site `iclean-room` wdrozono jako wersje `1b22809b4bc234bc`. `app.cleanzi.pl` i `iclean-room.web.app` serwuja bundle `mobile-BJT2j3ib.js`; App Hosting serwuje `mobile-Hz-23h0T.js`.
- Postflight na wszystkich trzech domenach: HTTP 200, obecne `W001`, endpoint skanowania, idempotencja, `visibilitychange`, `pageshow` i zabezpieczenie snapshotu. CORS z `app.cleanzi.pl` odpowiada HTTP 204, a POST bez tokenu HTTP 401 `UNAUTHENTICATED`.
- Odczyt bazy po wdrozeniu: Event `EV-c0b82e3a-09a9-4aa9-be86-434be1e438ff` pozostaje `CLOSED`, `CLEAN`, `MATCHED`, `EXACT_IDS_UNIQUE`; nie powstal nowy `mobile_scan_command`. Workday `WD-3ee39b5c-eb81-4bd5-b1d5-03912a5d10d1` nadal ma `status=RUNNING`.
- Wymagany ostatni test urzadzeniowy: zablokowac telefon z otwarta aplikacja W001, odblokowac go i od razu uruchomic skan QR. Oczekiwane zachowanie: krotka synchronizacja, automatyczny restart kamery i brak falszywego komunikatu o nieznalezionym kodzie.

Data: 2026-07-27
Autor: AI Codex
Temat: Poprawne pokazanie zakonczonego CLEAN w panelach pulpitu
Test E2E W001:
- Jednorazowe zlecenie `codex-e2e-20260727-w001-lk003-bc1234` zostalo wykonane przez Rafala Dudka (`W001`) dla klienta `LK003` i strefy `BC1234`.
- Workday `WD-3d44deb5-7fe2-4be6-96cb-4a3ca4537f35` zostal poprawnie zamkniety: START `10:52:36`, STOP `13:38:54` Europe/Warsaw, czas `9978 s`.
- Event `EV-03b20cd6-d86a-4665-a1cf-fe39083eb2ec` zostal poprawnie zamkniety: CLEAN `10:52:51-11:08:48`, czas `956 s`, `MATCHED`, metoda `EXACT_IDS_UNIQUE`.
Diagnoza pulpitu:
- Portal odrzucal prawidlowy Event jako `STALE_PLAN_REVISION`, poniewaz aktualne `Task.updated_at` mialo milisekundy `.026`, a zapisany snapshot rewizji planu byl reprezentowany z dokladnoscia do sekundy `.000`.
- Osobny czysto legacyjny plan bez `serviceBlockId`, `allocationId` i `workSlotKey` byl blednie raportowany jako wyjatek korelacji, mimo ze nie mogl byc kandydatem do nowego modelu wykonania.
Zmieniono lokalnie:
- `serviceExecutionModel.js` porownuje rewizje planu z dokladnoscia odpowiadajaca utrwalonemu snapshotowi (sekunda). Nadal odrzuca rzeczywiste zmiany rewizji z innej sekundy i nie rozluznia dopasowania `taskId`, `serviceBlockId`, `allocationId` ani `workSlotKey`.
- Adapter pulpitu pomija tylko plany bez jakiejkolwiek utrwalonej tozsamosci wykonania. Czesciowo wypelnione lub sprzeczne plany nowego modelu nadal trafiaja do wyjatkow.
- Dodano dwa testy regresyjne: snapshot rewizji zaokraglony do sekundy oraz czysto legacyjny plan bez tozsamosci wykonania.
Weryfikacja:
- Po poprawce lokalny pulpit na rzeczywistych danych testu pokazuje `1 dzisiaj` oraz wpis `TEST E2E - AS Michal Herman [Activ Space] - Rafal Dudek`, godziny `10:52-11:08`.
- Panel `Postep uslug` poprawnie pokazuje `0 w toku` bez ostrzezen, poniewaz CLEAN zostal zakonczony.
- Test modułu: `18/18` OK. Pelne `npm test`: `214/214` OK. `npm --prefix web-app run lint`: OK. `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
Granice:
- Poprawka jest lokalna. Nie wykonano commita ani wdrozenia portalu na produkcje.
- Nie zmieniano ponownie danych produkcyjnych po zakonczeniu kontrolowanego testu W001.

Data: 2026-07-27
Autor: AI Codex
Temat: Ochrona przed planowaniem pracownika w roznych obiektach w tym samym czasie
Problem:
- Oś dnia nakladala dwa zaplanowane zlecenia Rafala Dudka (`W001`): staly plan Best Clean 08:30-16:30 oraz jednorazowy test E2E w innym obiekcie 10:27-11:37.
- Dotychczasowa kontrola kolizji dzialala tylko podczas przesuwania elementow w kalendarzu. Zapis formularza, import albo bezposredni zapis API mogly ominac te kontrole.
- Pasek dnia pracy byl pokazywany jak kolejna lokalizacja, chociaz START dnia potwierdza tylko miejsce rozpoczecia dnia, a nie nieprzerwana obecnosc w tym obiekcie.
Zmieniono lokalnie:
- Dodano wspolna polityke serwerowa `worker-schedule-conflict-policy.js`. Porownuje przydzialy po kanonicznym Worker ID, rozwija cykle oraz bloki uslug i wykrywa rzeczywiste nakladanie przedzialow czasu.
- Zapis jest blokowany kodem `WORKER_SCHEDULE_LOCATION_CONFLICT`, gdy ta sama osoba ma w tym samym czasie rozne albo niejednoznaczne lokalizacje. Sasiednie przedzialy sa dozwolone. Nakladajace sie wpisy z tym samym pewnym `clientId`, adresem albo GPS nie sa falszywa kolizja lokalizacji.
- Produkcyjny zapis API odbywa walidacje wewnatrz transakcji po blokadzie organizacji i przed UPSERT-em. Lokalny zapis plikowy rowniez waliduje caly wynikowy harmonogram przed zapisem.
- Frontend nie ma juz awaryjnej sciezki zapisu przez Data Connect, ktora moglaby ominac walidacje. Brak serwera walidujacego zatrzymuje zapis w trybie fail-closed.
- Kalendarz wykonuje preflight calego harmonogramu przed zapisem i pokazuje dialog z pracownikiem, terminem oraz kolidujacym zleceniem.
- Oś dnia rozklada nakladajace sie plany na osobnych torach, oznacza je jako `KOLIZJA PLANU`, a pasek Workday opisuje jako `Dzien pracy` z informacja, gdzie zeskanowano START dnia. Nie przedstawia juz obiektu START jako stalej lokalizacji pracownika.
Weryfikacja:
- Test polityki regresyjnej: `7/7` OK, w tym przypadek W001 Best Clean kontra test E2E, cykle, dni pominiete, sasiednie terminy i ten sam obiekt.
- Pelne `npm test`: `221/221` OK.
- `npm --prefix web-app run lint`: OK.
- `npm run build`: OK; pozostaje tylko istniejace ostrzezenie Vite o duzych chunkach.
Granice:
- Zmiana jest lokalna. Nie wykonano commita ani wdrozenia produkcyjnego.
- Nie usunieto i nie zmieniono istniejacego testowego zlecenia ani zadnych danych produkcyjnych. Jego ewentualne usuniecie wymaga osobnej, jednoznacznej zgody.

Data: 2026-07-27
Autor: AI Codex
Temat: Cykl zycia zlecenia bez utraty historii
Powod:
- Audyt wykazal, ze tabela `Task` nie miala stanu anulowania ani archiwizacji. Dotychczas interfejs mogl jedynie fizycznie usunac zlecenie, wiec pomijanie rzekomo anulowanych rekordow w kontroli kolizji nie byloby mozliwe.
Zmieniono lokalnie:
- Dodano addytywny stan `lifecycleStatus`: `ACTIVE`, `CANCELLED`, `ARCHIVED` oraz znaczniki czasu `cancelledAt` i `archivedAt`.
- Istniejace rekordy otrzymuja bezpieczny status domyslny `ACTIVE`; migracja nie usuwa ani nie nadpisuje danych biznesowych.
- Endpoint zlecen obsluguje `PATCH` po dokladnych `id_task`. Zmiana statusu jest wykonywana w transakcji po blokadzie organizacji.
- Ponowna aktywacja zlecenia przechodzi pelna kontrole kolizji przed zatwierdzeniem. W razie konfliktu transakcja jest wycofywana.
- `CANCELLED` i `ARCHIVED` pozostaja w bazie jako historia, ale nie sa wyswietlane jako aktywny plan i nie blokuja innych zlecen.
- W menu zlecenia na osi kalendarza dodano osobna akcje `Anuluj zlecenie`. Nie jest ona twardym usunieciem. Dla generowanego wystapienia serii pozostaje dotychczasowa, osobna obsluga pominiecia dnia.
- Twarde usuwanie pozostalo osobna akcja i nie zostalo automatycznie zastapione, aby nie zmieniac istniejacej semantyki bez decyzji biznesowej.
- Dodano migracje `dataconnect/migrations/20260727_task_lifecycle_additive.sql`, rozszerzono schema i operacje Data Connect oraz ponownie wygenerowano SDK.
Weryfikacja:
- Generator Data Connect 15.8.0: OK dla `iclean-room-service`.
- Testy polityki i cyklu zycia: `14/14` OK.
- Pelne `npm test`: `228/228` OK.
- `npm --prefix web-app run lint`: OK.
- `npm run build`: OK; pozostaja tylko istniejace ostrzezenia o rozmiarze duzych modulow i chunkow.
Granice:
- Nie uruchomiono migracji na produkcji.
- Nie zmieniono statusu testowego zlecenia E2E ani zadnych innych danych produkcyjnych.
- Nie wykonano commita ani wdrozenia.

Data: 2026-07-27
Autor: AI Codex
Temat: Ujednolicenie jakosci i responsywnosci portalu do wzorca Rentownosci kontraktow
Powod:
- Modul `Rentownosc kontraktow` mial najbardziej spojny jezyk wizualny portalu, natomiast pozostale widoki korzystaly z roznych naglowkow, promieni, cieni, ukladow filtrow i zachowan mobilnych.
Zmieniono lokalnie:
- Dodano koncowa, wspolna warstwe stylow `portalQuality.css`, ktora definiuje tokeny powierzchni, obramowan, promieni, cieni, akcji glownej, fokusu, KPI, filtrow, tabel i kart.
- Dodano jednolite naglowki stron dla pulpitu, zdarzen, zlecen, mapy zlecen, kalendarza, profilu klienta, profili i czasu pracownikow, stref, audytow, raportow oraz ustawien.
- Ujednolicono szerokosc tresci, rytm pionowy, karty KPI, pola formularzy, przyciski, tabele i panele danych bez zmiany istniejacych selektorow funkcjonalnych.
- Przy ekranach mobilnych panel boczny startuje zwiniety i zmienia sie w kompaktowy pasek z logo, akcja dodawania i przyciskiem rozwiniecia. Naglowki, filtry i KPI skladaja sie do jednej kolumny.
Weryfikacja:
- Porownanie wzorca z pulpitem: `output/portal-design-audit-20260727/14-reference-vs-dashboard.png`.
- Widok mobilny 390 x 844 px: `output/portal-design-audit-20260727/11-dashboard-mobile-390.png`.
- Pelny raport: `design-qa.md`, sekcja `Ujednolicenie portalu do jakosci Rentownosci kontraktow (2026-07-27)`.
- `npm test`: 228/228 OK.
- `npm --prefix web-app run lint`: OK.
- `npm --prefix web-app run build`: OK; pozostaje tylko istniejace ostrzezenie o duzych chunkach.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-28
Autor: AI Codex
Temat: Pulpit wariant 2 - plan dnia jako pierwszy ekran
Powod:
- Wybrany wariant 2 mial uporzadkowac pierwszy ekran wokol planu dnia, najblizszych rozpoczec, mapy operacyjnej, alarmow i operacji na zywo.
- Dane demonstracyjne ze wzorca nie mogly zastapic rzeczywistych danych portalu ani korelacji po identyfikatorach.
Zmieniono lokalnie:
- Dodano model planu dnia laczacy zlecenia, aktywne operacje i zakonczenia po stabilnych identyfikatorach.
- Na gorze pulpitu umieszczono `Plan dnia` oraz `Najblizsze 60 minut`.
- Ponizej zachowano funkcjonalna mape operacyjna, panel `Wymaga reakcji` i skrocona liste `Operacje na zywo`.
- Alarmy obejmuja opozniony START, nierozpoznany obiekt, brak GPS, bledy korelacji oraz brak QR STOP.
- Podglad operacji pokazuje trzy najnowsze pozycje, a pelna lista pozostaje dostepna z przycisku.
- Sekcje znajdujace sie nizej na pulpicie pozostaly bez zmian.
- Uklad jest responsywny i przy szerokosciach 1180 px oraz 760 px nie powoduje poziomego przewijania strony.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/commandCenterPlanModel.js`
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `test/dashboard-command-center-plan.test.js`
- `design-qa.md`
- `ReadMe.txt`
Weryfikacja:
- Testy modeli pulpitu i Operacji na zywo: 17/17 OK.
- Targetowany ESLint: OK.
- `npm run build`: OK.
- Zalogowany podglad 1440 x 1024 porownany obok wybranego wzorca: brak bledow P0/P1/P2.
- Filtry, zmiana widoku, pelna lista operacji, przejscie do kalendarza i powrot na pulpit: OK.
- Responsywnosc 1180 px i 760 px: OK, bez poziomego overflow.
- Ograniczenie lokalne: wygasla sesja Google Cloud application-default powoduje fallback zrodla harmonogramu, dlatego aktualny plan moze pokazywac `0 z 0`.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha, migracji ani wdrozenia produkcyjnego.

- Nie zmieniano logiki biznesowej, bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Centrum dowodzenia jako pierwszy ekran Pulpitu
Powod:
- Gorna czesc Pulpitu zostala dostosowana 1:1 do przekazanego wzorca „Dzien pod kontrola”, bez przebudowy modulow znajdujacych sie nizej.
Zmieniono lokalnie:
- Dodano nowy pierwszy ekran „Centrum dowodzenia”: naglowek LIVE, cztery KPI, duza mape operacyjna, panel „Operacje na zywo” oraz pasek „Insights AI”.
- Istniejace moduly nie zostaly zastapione atrapami. Mapa nadal korzysta z bieżących statusow pracownikow i lokalizacji GPS/planu, a operacje oraz zakonczenia nadal respektuja bezpieczna korelacje planu z Eventami CLEAN.
- KPI jakosci pokazuje udzial faktycznie potwierdzonych zakonczen w dzisiejszym planie. Przy braku bezpiecznego mianownika lub korelacji pokazuje jawny brak wyniku zamiast zgadywanej wartosci.
- Marza pozostaje oznaczona jako „wartosc pogladowa” i jest synchronizowana z istniejacym demonstracyjnym panelem rentownosci.
- Dodano dzialajace filtry statusow pinezek, przelacznik mapa/lista, wycentrowanie mapy, legendę, przejscie do kalendarza i rozwijane szczegoly potwierdzonych zadan.
- Dotychczasowy panel rentownosci, os dnia i wszystkie dalsze sekcje pozostaly ponizej bez zmian.
- Dodano responsywny uklad dla telefonow i tabletow.
Weryfikacja:
- Porownanie wzorca i implementacji: `output/command-center-qa-20260727/04-source-vs-implementation.png`.
- Desktop: `output/command-center-qa-20260727/02-command-center-desktop.png`.
- Widok listy: `output/command-center-qa-20260727/03-command-center-list.png`.
- Mobilny podglad 390 x 844 px: `output/command-center-qa-20260727/05-command-center-mobile-390.png`.
- Filtry faktycznie ukrywaja odpowiadajace im pinezki; przelacznik mapa/lista i panel szczegolow zostaly przeklikane na zalogowanym localhost.
- Brak zduplikowanych identyfikatorow DOM.
- `npm test`: 228/228 OK.
- `npm --prefix web-app run lint`: OK.
- `npm --prefix web-app run build`: OK; pozostaje tylko istniejace ostrzezenie o duzych chunkach.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.
- Nie zapisano ani nie zmieniono zadnych realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Mapa operacyjna wariant 3 z alarmem START na mapie
Powod:
- Wybrano wariant 3 wizualizacji: obiekt jest centralnym markerem, a pracownicy rozwijaja sie wokol niego. Alarm ma byc widoczny bezposrednio na mapie, a nie w osobnym, duzym oknie.
Zmieniono lokalnie:
- Zastapiono proste kropki markerami osob z przygotowanym miejscem na zdjecie profilowe i bezpiecznym fallbackiem inicjalow.
- Ustalono kolory: szary plan, niebieski praca, zielony zakonczenie, czerwony brak START po przekroczeniu planu o wiecej niz 10 minut.
- Osoby sa grupowane przy obiekcie tylko po dokladnym `clientId`. Nazwa klienta nie jest uzywana jako zastepczy identyfikator.
- Korelacja wykonania pobiera `clientId` rowniez z odpowiadajacego zdarzenia QR, co usuwa falszywe alarmy dla zakonczonych prac Best Clean.
- Klikniecie lub najechanie na obiekt rozwija pracownikow, klikniecie osoby pokazuje szczegoly i akcje `Otworz zadanie`.
- Filtry obsluguja wszystkie cztery statusy takze wewnatrz grup obiektow; licznik alarmow jest widoczny przy dzwonku.
- Obiekt pokazuje postep stref tylko przy dostepnym `serviceBlockId` lub `zoneId`; brak identyfikatorow jest jawnie oznaczony i nie jest zgadywany.
- Dodano wylacznie lokalny tryb QA `?mapAlarmPreview=1`, usuwany z buildu produkcyjnego.
Weryfikacja:
- Pelne `npm.cmd test`: `237/237` OK.
- Testy mapy i 10-minutowego bufora START: `9/9` OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
- Zalogowany localhost: rozwijanie obiektu, filtr czerwonego alarmu i statusy dzisiejszych danych Best Clean dzialaja.
- Porownanie wizualne: `output/operational-map-qa-20260727/04-reference-vs-implementation-focused.png`.
Granice:
- Nie zmieniono bazy ani realnych danych firmy.

- Nie wykonano commita, pusha ani wdrozenia produkcyjnego.
- Trwaly upload zdjecia w edycji pracownika nie zostal jeszcze dodany; mapa potrafi juz wyswietlic zapisany URL zdjecia.

Data: 2026-07-27
Autor: AI Codex
Temat: Domyslne ilustracyjne awatary i blizsze rozmieszczenie osob na mapie
Powod:
- Przy braku zdjecia profilowego marker osoby pokazywal inicjaly, a rozwijane markery pracownikow byly zbyt daleko od centralnego markera obiektu.
Zmieniono lokalnie:
- Dodano dwie lekkie, niehiperrealistyczne ilustracje domyslne: kobiete i mezczyzne.
- Zapisane zdjecie pracownika nadal ma pierwszenstwo. Fallback najpierw respektuje jawne pole plci, a przy jego braku dobiera ilustracje na podstawie imienia.
- Zmniejszono odleglosc siedmiu pozycji osob wokol centralnego markera obiektu, zachowujac czytelny odstep pomiedzy krawedziami markerow.
- Dodano testy jawnej plci, imienia w obu kolejnosciach oraz meskiego wyjatku `Kuba`.
Pliki:
- `web-app/public/assets/avatars/default-female.webp`
- `web-app/public/assets/avatars/default-male.webp`
- `web-app/apps/portal-web/src/features/dashboard/operationalMapModel.js`
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `test/operational-map-model.test.js`
Weryfikacja:
- `npm.cmd test`: 239/239 OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd run build`: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
- Obie ilustracje sprawdzono w finalnym rozmiarze 256 x 256 px; kazda ma ok. 5,3 KB.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Rozdzielenie licznika mapy i kontrolek zoomu
Powod:
- Etykieta `Mapa operacyjna / liczba osob` oraz kontrolki Leaflet `+/-` zajmowaly ten sam lewy gorny rog i nachodzily na siebie.
Zmieniono lokalnie:
- Etykieta mapy zaczyna sie teraz 56 px od lewej krawedzi na desktopie i 54 px na waskich ekranach.
- Kontrolki zoomu pozostaly w standardowym, latwo dostepnym polozeniu.
Weryfikacja:
- Zalogowany localhost: etykieta i zoom sa rozdzielone po zaladowaniu mapy z 25/34 osobami.
- Nie zmieniono logiki ani danych mapy.

Data: 2026-07-27
Autor: AI Codex
Temat: Chronologiczny strumien operacji na zywo
Powod:
- Panel `Operacje na zywo` pokazywal tylko prace trwajace i pozostawial duzy pusty obszar. Uzytkownik potrzebuje jednego przebiegu dnia z najnowszymi zdarzeniami u gory oraz zakonczonymi pracami zachowanymi w historii.
Zmieniono lokalnie:
- Polaczono operacje aktywne i zakonczone w jeden strumien sortowany malejaco po faktycznym czasie zdarzenia: START dla pracy trwajacej oraz STOP dla pracy zakonczonej.
- Pierwszy ekran pokazuje maksymalnie piec najnowszych wpisow. Przycisk `Zobacz wszystkie operacje (N)` pojawia sie tylko wtedy, gdy pozostaly dalsze zdarzenia.
- Dodano pelny, przewijany dialog wszystkich dzisiejszych operacji z licznikiem, obsluga Escape, klikniecia tla, petla fokusu i przywracaniem fokusu.
- Karty pokazuja obiekt, blok uslugi, pracownikow z ilustracyjnymi miniaturami, czas oraz zmierzony postep. Brak pelnego planu ma animowany stan nieokreslony zamiast wymyslonego procentu.
- Zakonczone operacje pozostaja na liscie ze statusem STOP i zielonym oznaczeniem.
- Klikniecie wpisu z kanonicznym `taskId` otwiera istniejace zadanie; brak identyfikatora nie uruchamia zgadywania.
- Dodano czysty model strumienia oraz testy kolejnosci i limitu podgladu.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/serviceOperationStreamModel.js`
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `test/dashboard-service-operation-stream.test.js`
- `design-qa.md`
Weryfikacja:
- `npm.cmd test`: 241/241 OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
- Porownanie wizualne: `output/command-operations-qa-20260727/04-source-vs-implementation.png`.
- Pelny dialog: `output/command-operations-qa-20260727/03-all-operations-modal.png`.
Granice:
- Sesja wlasciwego portalu wygasla przed koncowym podgladem, dlatego stan z wieloma wpisami sprawdzono w kontrolowanym renderze tego samego DOM i produkcyjnych arkuszy CSS. Model kolejnosci ma osobne testy automatyczne.
- Nie zmieniono bazy ani realnych danych firmy.
- Nie wykonano commita, pusha ani wdrozenia.

Data: 2026-07-27
Autor: AI Codex
Temat: Faktyczna aktywnosc CLEAN niezalezna od planu w Operacjach na zywo
Powod:
- Zalogowany pulpit pokazywal aktywnych pracownikow i ich obiekty na mapie oraz osi dnia, ale panel `Operacje na zywo` byl pusty, poniewaz przyjmowal tylko Eventy zaakceptowane przez scisla korelacje ze zleceniem.
- Obecnosc faktyczna i postep planu to dwa rozne fakty. Brak planu nie moze ukrywac rozpoczetego CLEAN, ale nie pozwala tez wyliczac procentu ani planowanej godziny konca.
Zmieniono lokalnie:
- Jawny Event `CLEAN` z dzisiejszym START jest teraz pokazywany jako faktyczna operacja takze bez zlecenia. Obiekt pochodzi z danych Eventu i przypisanego QR/strefy, a pracownik z kanonicznego rekordu zdarzenia.
- CLEAN bez potwierdzonego planu pokazuje stan `W toku`, godzine `od HH:MM`, informacje o braku planowanej godziny konca i animowany pasek nieokreslony. Nie otrzymuje wymyslonego procentu.
- CLEAN jednoznacznie powiazany ze zleceniem nadal korzysta ze scislego modelu ID. Tylko taki wpis moze pokazac procent i planowany koniec.
- Zamkniety CLEAN bez planu pozostaje w historii jako `Zakonczone`, ale nie jest liczony jako 100% wykonania planu ani jako potwierdzone ukończenie zlecenia.
- Eventy zaakceptowane przez scisly model sa wykluczane z listy obserwowanej po dokladnym `eventId`, aby nie dublowac operacji.
- KPI potwierdzonych zadan i osobny panel potwierdzonych ukonczen nadal licza tylko bezpiecznie skorelowane zakonczenia.
- Opis panelu wyjasnia, ze pokazuje faktyczne rozpoczecia i zakonczenia, a procent jest dostepny tylko przy potwierdzonym planie.
- Otwarty dzien pracy `START` na rozpoznanym obiekcie jest pokazywany jako faktyczna obecnosc nawet bez otwartego CLEAN. Wpis zawiera obiekt, pracownika i godzine rozpoczecia.
- Obecnosc bez jednoznacznego planu nie ma procentu ani godziny konca. Obecnosc laczy sie z planem tylko po dokladnych identyfikatorach klienta i pracownika oraz co najmniej jednej zapisanej referencji zadania, bloku, przydzialu lub slotu. Sam zgodny pracownik i obiekt nie tworza procentu.
- Otwarty CLEAN ma pierwszenstwo przed ogolnym dniem pracy tej samej osoby, dlatego aktywny pracownik nie jest pokazywany jednoczesnie w dwoch miejscach.
- Zamkniety dzien pracy pozostaje w chronologicznej historii, ale sam STOP dnia nie potwierdza wykonania zaplanowanego sprzatania.
- START bez rozpoznanego obiektu nie jest ukrywany. Panel pokazuje pracownika jako `Obiekt nierozpoznany` i oznacza rekord do uzupelnienia, nadal bez procentu.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/serviceOperationStreamModel.js`
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `test/dashboard-service-operation-stream.test.js`
- `design-qa.md`
Weryfikacja:
- Zalogowany localhost: panel pokazal faktyczne zakonczone sprzatanie Rafala Dudka na obiekcie `AS Michal Herman [Activ Space]`, mimo ze wpis wymaga weryfikacji korelacji z planem.
- Stan przed poprawka: `outputs/live-operations-audit-2026-07-27/01-before-empty-live-operations.png`.
- Stan po poprawce: `outputs/live-operations-audit-2026-07-27/02-after-actual-operations.png`.
- Stan z obecnosciami START i jednoznacznymi planami: `outputs/live-operations-audit-2026-07-27/03-after-workday-presence-and-plans.png`.
- Porownanie ze wzorcem: `outputs/live-operations-audit-2026-07-27/04-reference-vs-workday-operations.png`.
- Koncowy zweryfikowany widok: `outputs/live-operations-audit-2026-07-27/05-final-verified-live-operations.png`.
- Kompletny widok z brakujacym obiektem oznaczonym jawnie: `outputs/live-operations-audit-2026-07-27/06-final-complete-live-operations.png`.
- Zalogowany localhost pokazal `16 w toku` i `36` dzisiejszych operacji. Dla jednoznacznych planow widoczne byly procenty i godziny konca, m.in. `94%` dla GAPR; pozostale obecnosci pokazywaly START bez wymyslonego procentu.
- Test modelu operacji: `11/11` OK.
- Pelne `npm.cmd test`: `250/250` OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
Granice:
- W chwili koncowej kontroli nie bylo otwartego dzisiejszego CLEAN. Panel pokazal jednak faktyczne otwarte dni pracy na rozpoznanych obiektach; nie utozsamia ich z potwierdzonym wykonaniem sprzatania.
- Nie zmieniono bazy ani realnych danych firmy.
- Nie wykonano commita, pusha ani wdrozenia.

Data: 2026-07-27
Autor: AI Codex
Temat: Ograniczenie czasu synchronizacji zlecen na pulpicie
Powod:
- Lokalny endpoint `schedule-orders` potrafil zrywac polaczenie dopiero po okolo 45 sekundach (`ECONNRESET`). Pulpit czekal na ten wynik i przez caly czas zaslanial dane komunikatem `Synchronizuje dane...`.
Zmieniono lokalnie:
- Odczyt zlecen z backendu ma limit 12 sekund.
- Po przekroczeniu limitu zadanie sieciowe jest anulowane, niedostepny endpoint zostaje zapamietany dla biezacej sesji, a system korzysta z istniejacego zrodla zapasowego Firebase Data Connect.
- Dane operacyjne pulpitu nie czekaja juz na pelne zakonczenie synchronizacji planu. Plan jest dociagany w tle, a po zakonczeniu bezpiecznie przelicza widok.
- Zapisywanie, zmiana statusu i usuwanie zlecen zachowuja dotychczasowa scisla walidacje; limit dotyczy tylko odczytu listy.
Pliki:
- `web-app/apps/portal-web/src/services/scheduleTaskDataConnectService.js`
- `ReadMe.txt`
Weryfikacja:
- W powtornym pomiarze zalogowany localhost pokazal rzeczywiste dane pulpitu po okolo 2,7 s zamiast oczekiwania ponad 45 s.
- Synchronizacja planu zakonczyla sie w tle bez ponownego zaslaniania pulpitu.
- Po synchronizacji widoczne sa aktualne dane: 9 aktywnych pracownikow i 38 dzisiejszych operacji.
- Rafal Dudek jest pokazany jako `W toku` od 19:33 w Best Clean, bez wymyslonego procentu i bez planowanej godziny konca.
- ESLint dla zmienionego serwisu: OK.
- Build portalu: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Aktywne sesje zawsze nad zakonczonymi operacjami
Powod:
- Chronologiczne mieszanie wpisow powodowalo, ze nowsze zakonczenia zaslanialy nadal trwajace sesje w piecioelementowym podgladzie.
Zmieniono lokalnie:
- Wszystkie aktywne sesje sa teraz zawsze wyswietlane nad zakonczonymi operacjami.
- Aktywne sesje sa sortowane od najnowszego START, a zakonczone od najnowszego STOP.
- Ta sama kolejnosc obowiazuje w podgladzie pieciu pozycji i w pelnej liscie operacji.
- Opis pelnej listy zostal dostosowany do rzeczywistej zasady sortowania.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/serviceOperationStreamModel.js`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `test/dashboard-service-operation-stream.test.js`
- `ReadMe.txt`
Weryfikacja:
- Test modelu operacji: 12/12 OK.
- ESLint zmienionego modelu i interfejsu: OK.
- Build portalu: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
- Zalogowany localhost: 38 operacji, pozycje 1-9 aktywne, pierwsza zakonczona na pozycji 10; brak aktywnych wpisow ponizej zakonczonych.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Pelne kolory i kontrast w Operacjach na zywo
Powod:
- Globalna regula portalu dla przyciskow `disabled` wymuszala `opacity: .52 !important`. Wpisy bez przejscia do zadania sa technicznie nieklikalnymi przyciskami, dlatego caly ich wyglad byl przygaszony.
Zmieniono lokalnie:
- Wylacznie przyciski wpisow w `Operacjach na zywo` zachowuja teraz 100% krycia, pelne kolory i normalny kontrast, takze gdy nie maja dostepnych szczegolow zadania.
- Aktywne sesje maja niebieski akcent i jasne niebieskie tlo, a zakonczone zielony akcent i jasne zielone tlo.
- Przyciemniono kolor nazwy obiektu, opisu, pracownikow, czasu i informacji pod paskiem.
- Nie zmieniono logiki statusow, kolejnosci ani mozliwosci otwierania zadan.
Pliki:
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `ReadMe.txt`
Weryfikacja:
- Kontrola wizualna na zalogowanym localhost: aktywne wpisy w podgladzie i pelnej liscie nie sa juz wyszarzone; tekst, awatary, status i pasek maja pelne nasycenie.
- `git diff --check` dla zmienionego CSS: OK.
- Build portalu: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Warstwy markerow i usuniecie czarnego tooltipa mapy
Powod:
- Czarny pasek byl natywnym tooltipem przegladarki generowanym z pola `title` markera.
- Bialy dymek szczegolow mogl znalezc sie pod sasiednimi osobami z tej samej grupy albo pod markerem innego obiektu.
Zmieniono lokalnie:
- Usunieto natywne pola `title` z markerow obiektow i osob. Dostepne nazwy i opisy pozostaly w `alt` oraz `aria-label`.
- Rozwiniety obiekt, wybrana osoba oraz marker z widocznym dymkiem sa podnoszone ponad wszystkie pozostale markery Leaflet.
- Wybrana lub wskazana osoba ma najwyzsza warstwe wewnatrz grupy, a jej bialy dymek jest rysowany nad pozostalymi osobami i obiektami.
- Regula obejmuje klikniecie, najechanie myszka i fokus klawiatury.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `ReadMe.txt`
Weryfikacja:
- Zalogowany localhost po kliknieciu osoby: bialy dymek jest widoczny bez czarnego paska.
- DOM mapy zawiera 0 markerow z natywnym atrybutem `title`; wybrany marker otrzymuje podniesiona warstwe.
- Testy modelu mapy: 6/6 OK.
- ESLint dashboardu: OK.
- `git diff --check`: OK poza informacja o istniejacym przejsciu LF/CRLF.
- Build portalu: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Nazwy pracownikow po najechaniu i dane live obiektu po kliknieciu
Powod:
- Po rozwinieciu obiektu na mapie widoczne byly awatary pracownikow, ale bez stalej informacji, kto znajduje sie przy obiekcie.
- Klikniecie markera obiektu nie pokazywalo jednego, uporzadkowanego podsumowania jego aktualnej sytuacji.
Zmieniono lokalnie:
- Najechanie myszka, fokus klawiatury lub rozwiniecie obiektu pokazuje przy kazdym awatarze imie i nazwisko pracownika.
- Po wskazaniu konkretnej osoby jej krotka etykieta jest zastepowana pelnym bialym dymkiem szczegolow.
- Klikniecie obiektu otwiera przypiety bialy panel `Na zywo` z nazwa obiektu, liczba osob w pracy, zaplanowanych, zakonczonych i spoznionych oraz lista osob z aktualnym statusem i czasem.
- Panel pokazuje postep stref wyliczony wylacznie z zapisanych identyfikatorow stref. Strefa jest zakonczona dopiero wtedy, gdy wszystkie przypisane do niej osoby zakonczyly prace.
- Ponowne klikniecie obiektu zamyka panel; otwarcie innego obiektu lub osoby zamyka poprzedni panel.
- Otwarty panel i dymki sa podnoszone ponad pozostale markery, a mapa przesuwa wybrany obiekt tak, aby panel miescil sie w widoku.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/features/dashboard/operationalMapModel.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `test/operational-map-model.test.js`
- `ReadMe.txt`
Weryfikacja:
- Testy modelu mapy i podsumowania live: 8/8 OK.
- ESLint zmienionego dashboardu i modelu: OK.
- `git diff --check`: OK poza informacja o istniejacym przejsciu LF/CRLF w dashboardzie.
- Build portalu: OK; pozostaje istniejace ostrzezenie Vite o duzych chunkach.
- Zautomatyzowana kontrola zalogowanego widoku nie byla mozliwa, poniewaz wszystkie siedem otwartych kart localhost bylo wylogowanych.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Przygotowanie kontrolowanego wydania portalu bez publikacji produkcyjnej
Zakres:
- Sklasyfikowano caly lokalny zakres zmian portalu, backendu, polityk integralnosci, korelacji realizacji uslug, rentownosci, migracji i testow.
- Dodano ignorowanie lokalnych kopii Codex, katalogow wdrozen roboczych, renderow QA oraz plikow tymczasowych, aby nie trafily do commita wydaniowego.
- Potwierdzono po `git fetch cleanzi01 main --prune`, ze lokalny HEAD i `cleanzi01/main` wskazuja ten sam commit bazowy.
Weryfikacja:
- Pelny zestaw testow wydania po dodaniu bezpiecznego lokalnego gate TLS: 254/254 OK.
- ESLint aplikacji portalowej: OK.
- Build produkcyjny portalu: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- `git diff --check`: brak bledow tresci; widoczne sa tylko ostrzezenia Windows o przyszlej normalizacji LF/CRLF.
Warunki przed publikacja:
- Migracja `dataconnect/migrations/20260727_task_lifecycle_additive.sql` musi zostac potwierdzona na produkcji przed uruchomieniem zapisu lub zmiany statusu zlecen przez nowy backend.
- Modul rentownosci pozostaje fail-closed: bez schematu i jawnych uprawnien zwraca `PROFITABILITY_SCHEMA_NOT_READY` i nie udostepnia danych.
- Wymagany jest czysty test commita oraz test zalogowanego portalu na kontrolowanym podgladzie.
Granice:
- Na tym etapie nie wykonano migracji, pusha ani wdrozenia produkcyjnego.
- Nie zmieniono bazy ani realnych danych firmy.

Data: 2026-07-27
Autor: AI Codex
Temat: Jawny lokalny wyjątek TLS dla proxy sesji Vite
Powod:
- Lokalny backend potrafil korzystac z jawnego wyjatku TLS przy skanowaniu HTTPS przez Norton, ale waskie proxy `/api/auth/session-context` nadal wymuszalo `secure: true` i blokowalo zalogowany podglad.
Zmieniono lokalnie:
- Dodano `DEV_AUTH_SESSION_PROXY_TLS_REJECT_UNAUTHORIZED`, domyslnie rygorystyczne.
- Tylko jawna wartosc `0` lub `false` w lokalnym procesie Vite ustawia `secure: false` dla kanonicznego celu `https://portal.cleanzi.pl`.
- Niepoprawna wartosc zatrzymuje start stabilnym bledem; proxy nadal wymaga osobnego gate i nadal akceptuje wyłącznie kanoniczny host Cleanzi.
- Ustawienie nie jest konfigurowane w App Hosting i nie zmienia produkcyjnego transportu TLS.
Pliki:
- `.env.example`
- `web-app/vite.config.js`
- `test/vite-auth-session-proxy.test.js`
- `ReadMe.txt`
Granice:
- Wyjatek jest przeznaczony wylacznie do tymczasowego podgladu localhost, gdy lokalny skaner HTTPS zastepuje certyfikat.
- Nie zmieniono bazy, danych firmy ani produkcji.

Data: 2026-07-28
Autor: AI Codex
Temat: Zdjecie profilowe pracownika jako wspolna miniatura w portalu
Powod:
- Miniatury pracownikow na mapie i w kolejnych miejscach portalu powinny korzystac z jednego pola profilu, zamiast z przypadkowych ikon lub danych tylko lokalnych.
- Zdjecie ma byc dodawane w edycji pracownika i potem dostepne dla strony glownej, profilu, aplikacji pracownika oraz kolejnych modulow.
Zmieniono lokalnie:
- Dodano addytywne pole `photo_url` do modelu pracownika oraz zapytania Data Connect `WorkersForOrg`.
- Dodano migracje `dataconnect/migrations/20260728_worker_photo_url_additive.sql`.
- W backendzie tworzenia i edycji pracownika dodano obsluge `photoDataUrl`, `photoUrl` i usuwania zdjecia.
- Nowe zdjecie jest walidowane, ograniczone rozmiarem, zapisywane przez Admin SDK w Firebase Storage i dopiero jego URL trafia do rekordu pracownika.
- W profilu pracownika dodano wybor, podglad i usuniecie zdjecia; plik jest lokalnie kompresowany do miniatury WebP przed wyslaniem.
- Lista pracownikow pokazuje zdjecie, jesli istnieje, a w przeciwnym razie dotychczasowe inicjaly.
- Service pracownikow mapuje `photoUrl` / `profilePhotoUrl`, aby to samo pole moglo byc wykorzystane na stronie glownej, mapie, profilu i w aplikacji.
- Dodano regule Storage dla sciezki `orgs/{orgId}/worker-profiles/{workerLogin}/...`; zapisy nadal ida tylko przez backend Admin SDK.
Pliki:
- `dataconnect/schema/schema.gql`
- `dataconnect/connectors/example/queries.gql`
- `dataconnect/migrations/20260728_worker_photo_url_additive.sql`
- `index.js`
- `worker-repository.js`
- `storage.rules`
- `web-app/apps/portal-web/src/services/workerService.js`
- `web-app/apps/portal-web/src/features/workers/worker_list_profile/index.js`
- `web-app/apps/portal-web/src/features/workers/worker_list_profile/style.css`
- `web-app/apps/portal-web/src/features/workers/worker_list_profile/template.html`
- `web-app/apps/portal-web/src/dataconnect-generated/index.d.ts`
- `web-app/apps/portal-web/src/dataconnect-generated/README.md`
- `web-app/apps/portal-web/src/dataconnect-generated/react/README.md`
Weryfikacja:
- `firebase dataconnect:sdk:generate`: OK, SDK odswiezony z polem `photoUrl`.
- `node --check` dla zmienionych plikow JS: OK.
- `node --test --test-reporter=dot`: OK.
- `npm run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- `git diff --check`: na plikach zrodlowych OK; pelny diff pokazuje jedynie whitespace w README wygenerowanych przez Data Connect.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia.
- Migracja `20260728_worker_photo_url_additive.sql` musi byc uruchomiona przed uzyciem zapisu zdjec w srodowisku z realna baza.
- Zdjecia sa przygotowane jako wspolne pole profilu; podpiecie ich we wszystkich widokach mapy/aplikacji moze byc rozwijane etapami na bazie `photoUrl`.

Data: 2026-07-28
Autor: AI Codex
Temat: Widoczne dodawanie i zmiana zdjecia na koncie pracownika
Powod:
- Lokalny podglad na porcie 5173 byl uruchomiony ze starej kopii `.codex-tmp/release-verify-*`, dlatego gotowa kontrolka zdjecia w formularzu listy pracownikow nie byla widoczna.
- Szczegolowy profil pracownika nie mial wlasnej, jednoznacznej akcji dodania lub zmiany zdjecia.
Zmieniono lokalnie:
- Przy awatarze na karcie pracownika dodano staly przycisk aparatu. Jest dostepny z kazdej zakladki profilu i przenosi bezposrednio do edycji zdjecia.
- W zakladce `Konto` dodano sekcje `Zdjecie profilowe` z podgladem, wyborem pliku oraz usuwaniem zdjecia.
- Wybrane zdjecie jest kadrowane do kwadratu 320 x 320, kompresowane do WebP i zapisywane razem z danymi konta przez istniejacy backend profilu.
- Po zapisie ten sam `photoUrl` aktualizuje awatar profilu, liste pracownikow i przygotowane miniatury mapy/pulpitu.
- Kontrolki respektuja uprawnienia do edycji pracownikow i tryb edycji zakladki `Konto`.
Pliki:
- `web-app/apps/portal-web/src/features/workers/account/index.js`
- `web-app/apps/portal-web/src/features/workers/account/style.css`
- `web-app/apps/portal-web/src/features/workers/account/template.html`
- `ReadMe.txt`
Weryfikacja:
- `node --check web-app/apps/portal-web/src/features/workers/account/index.js`: OK.
- `npm run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- `git diff --check`: OK poza istniejacymi ostrzezeniami Windows o przyszlej normalizacji LF/CRLF.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha, migracji ani wdrozenia produkcyjnego.

Data: 2026-07-28
Autor: AI Codex
Temat: Rzeczywisty czas pracy w Operacjach na zywo
Powod:
- Karty aktywnych operacji pokazywaly tylko godzine START lub planowanego konca, bez jasnej informacji jak dlugo osoba juz pracuje.
- Po zakonczeniu brakowalo jednoczesnie godzin START-STOP, czasu operacji oraz lacznego czasu pracy tej osoby w biezacym dniu.
Zmieniono lokalnie:
- Aktywna operacja pokazuje licznik `Pracuje HH:MM`, godzine START, planowana godzine konca (jesli istnieje) i laczny czas dzisiejszej pracy pracownika.
- Zakonczona operacja pokazuje START, STOP, czas operacji oraz laczny czas dzisiejszej pracy.
- Dzienne odcinki pracy sa laczone przed zsumowaniem, dlatego nakladajace sie rewizje lub duplikaty nie zawyzaja czasu.
- Gdy ten sam podpis pracownika wskazuje na rozne identyfikatory, system nie pokazuje wspolnego czasu dziennego zamiast zgadywac.
- Widok korzysta z istniejacego minutowego zegara pulpitu; aktualizacja licznika nie powoduje dodatkowego odczytu bazy.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/features/dashboard/serviceOperationStreamModel.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `test/dashboard-service-operation-stream.test.js`
- `ReadMe.txt`
Weryfikacja:
- `node --check` dla zmienionych plikow JS: OK.
- Testy modelu Operacji na zywo: 14/14 OK.
- `npm run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- `git diff --check` dla plikow tej zmiany: OK.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-28
Autor: AI Codex
Temat: Optymalizacja czytelnosci Operacji na zywo
Powod:
- Panel mial duzo wolnej przestrzeni, a najwazniejsze informacje o osobie, statusie i czasie byly wyswietlane zbyt mala czcionka.
- Status byl powtorzony w dwoch miejscach tego samego wpisu, przez co dolny wiersz nie wykorzystywal calej szerokosci na dane czasu.
Zmieniono lokalnie:
- Powiekszono nazwe obiektu, pracownika, status, czas pracy oraz naglowek panelu.
- Usunieto powtorzony status z dolnego wiersza i przeznaczono cala dostepna szerokosc na START, STOP, plan oraz laczny czas dzisiejszy.
- Na glownym panelu ukryto drugorzedny opis rodzaju operacji; pozostaje on dostepny na pelnej liscie wszystkich operacji.
- Powiekszono awatary i pasek postepu, jednoczesnie zmniejszajac puste odstepy naglowka i korpusu.
- Zachowano piec najnowszych pozycji w podgladzie oraz istniejaca kolejnosc aktywnych i zakonczonych operacji.
Pliki:
- `web-app/apps/portal-web/src/features/dashboard/index.js`
- `web-app/apps/portal-web/src/ui/styles/commandCenter.css`
- `ReadMe.txt`
Weryfikacja:
- `node --check web-app/apps/portal-web/src/features/dashboard/index.js`: OK.
- Kontrola zalogowanego localhost przy rzeczywistej szerokosci panelu: OK.
- `npm run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- `git diff --check` dla plikow zmiany: OK.
Granice:
- Zmiana jest lokalna. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-28
Autor: AI Codex
Temat: Dane operacyjne i deterministyczny draft Karty Zlecenia
Powod:
- Jeden formularz `Dodaj zlecenie` nie zawieral jawnych decyzji potrzebnych do wygenerowania bezpiecznej Karty dla pracownika.
- Podglad wskazywal braki, ale operator nie mial w tym samym formularzu kontrolek pozwalajacych je uzupelnic.
Zmieniono lokalnie:
- W kroku `Opis i podsumowanie` dodano jedna sekcje danych operacyjnych: miejsce realizacji, rodzaj uslugi, zrodlo zalogi, dojazd, lidera, kierowce, pojazd, pakowanie, dostep, bezpieczenstwo, eskalacje, platnosc, wycene, kwote, kontrakt, termin odroczony i podpis.
- Cykliczny zakres domyslnie konczy sie 31 grudnia roku startowego, ale wymaga jawnego potwierdzenia autora zlecenia.
- Zwykly zapis utrwala draft i nie publikuje Karty. Kompilator zapisuje addytywny snapshot wraz z bledami blokujacymi publikacje oraz ostrzezeniami.
- Brak lidera lub kierowcy pozostaje wyraznym ostrzezeniem i nie jest zgadywany ani traktowany jako blad blokujacy.
- Dostep, zasady bezpieczenstwa i decyzja o pakowaniu musza byc uzupelnione albo jawnie oznaczone jako niewymagane.
- Podglad oraz zapis draftu korzystaja z tego samego kompilatora danych.
Pliki:
- `web-app/apps/portal-web/src/features/orders/jobCardDraftModel.js`
- `web-app/apps/portal-web/src/features/orders/index.js`
- `web-app/apps/portal-web/src/features/orders/list/template.html`
- `web-app/apps/portal-web/src/index.css`
- `test/job-card-draft-model.test.js`
- `test/job-card-preview-integration.test.js`
- `ReadMe.txt`
Weryfikacja:
- Testy Karty Zlecenia i integracji formularza: 12/12 OK.
- Pelne `npm test`: 778/778 OK.
- `npm --prefix web-app run lint`: OK; jedynie informacyjna uwaga Babel dla istniejacego duzego modulu kalendarza.
- `npm run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- Zalogowany localhost `http://localhost:5174/?jobCardPreview=1`: sekcja widoczna, zaleznosci kontrolek i walidacja live dzialaja, pracownik wybrany w zmianie jest dostepny jako lider/kierowca, a podglad zalogi nie powiela tej samej osoby; zadnego zlecenia nie zapisano.
Granice:
- Funkcja pozostaje ukryta bez flagi `VITE_ENABLE_JOB_CARD_PREVIEW`.
- Nie wykonano migracji, commita, pusha, publikacji Karty ani wdrozenia produkcyjnego.
- Backendowa publikacja, numer rewizji, hash, diff i projekcje Mobile sa kolejnym osobnym etapem.

Data: 2026-07-28
Autor: AI Codex
Temat: Wersjonowany katalog i kalkulator norm ISSA
Powod:
- Czasu uslugi nie wolno wyznaczac bez znajomosci powierzchni albo liczby elementow wymaganych przez konkretna norme.
- Kazda sugestia czasu musi byc odtwarzalna i wskazywac dokladne zrodlo, strone oraz numer czynnosci.
Zmieniono lokalnie:
- Utworzono odseparowany od interfejsu, wersjonowany katalog norm ISSA.
- Zarejestrowano zrodlo: Ben Walker, `612 oficjalnych norm czasu sprzatania ISSA`, plik `Normy_ISSA_do_druku_A4.pdf`, SHA-256 `7F881D963D82C9B1D0AF35AD6F6F4873455B9037E3BA4601AAECD215A792D612`.
- Pierwszy aktywny zakres obejmuje 24 rekordy (zadania 50-73) zweryfikowane wzrokowo na drukowanej stronie 12 / stronie PDF 6.
- Wzor przeliczeniowy zostal zapisany ze wskazaniem drukowanej strony 57 / strony PDF 39.
- Kalkulator wymaga `areaM2` dla norm powierzchniowych albo `itemCount` dla norm licznikowych. Brak wymaganej wartosci zwraca `INPUT_REQUIRED`, a nie wymyslony czas.
- Wynik bazowy jest liczony proporcjonalnie do normy zrodlowej. Korekta lub przedzial sa mozliwe tylko po jawnym podaniu wspolczynnikow.
- Kazdy wynik zawiera autora, tytul, nazwe pliku, strone PDF, strone drukowana i numer zadania.
- Funkcje katalogu zostaly wyeksportowane z modulu zlecen, aby mozna je bylo pozniej podlaczyc do Karty Zlecenia i innych ekranow bez kopiowania logiki.
Pliki:
- `web-app/apps/portal-web/src/features/orders/issa/catalog.v1.js`
- `web-app/apps/portal-web/src/features/orders/issa/estimator.js`
- `web-app/apps/portal-web/src/features/orders/issa/index.js`
- `web-app/apps/portal-web/src/features/orders/issa/README.md`
- `web-app/apps/portal-web/src/features/orders/index.js`
- `test/issa-norm-estimator.test.js`
- `ReadMe.txt`
Weryfikacja:
- Testy katalogu, wzoru, wymaganych danych, skalowania, jawnych korekt i cytowania: 8/8 OK.
- Testy kalkulatora ISSA oraz istniejacego modelu Karty Zlecenia: 16/16 OK.
- Pelne `npm test`: 786/786 OK.
- `npm run lint`: OK.
- `npm run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
Granice:
- Katalog ma status `PARTIAL_VERIFIED`: nie wolno twierdzic, ze wszystkie 612 norm sa juz zdigitalizowane.
- Pozostale strony PDF wymagaja kontroli wzrokowej i matematycznej przed aktywacja kolejnych rekordow.
- Oryginalny PDF nie zostal skopiowany do aplikacji; ewentualne rozpowszechnianie zrodla wymaga osobnego potwierdzenia praw.
- Kalkulator nie zostal jeszcze podlaczony do widocznego formularza. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

Data: 2026-07-28
Autor: AI Codex
Temat: Obowiazkowy obiekt w recznych zdarzeniach i ochrona edycji wlasnego czasu
Powod:
- Biezacy dzien Sabiny Dudek byl widoczny na pulpicie jako `Obiekt nierozpoznany`, poniewaz rekord nie mial identyfikatora strefy prowadzacego do obiektu.
- Formularz recznego zdarzenia pozwalal zapisac czas bez obiektu i strefy.
- Wspolna blokada edycji wlasnego czasu nie byla sprawdzana w zakladce `Zdarzenia`.
Zmieniono:
- Dokladny, otwarty rekord `EV-1785217209876-211` pracownika `W005` zostal powiazany ze strefa START `BC0873`, ktora w bazie nalezy do obiektu `Best Clean`.
- Nie zmieniono starszych dni Sabiny ani zadnego rekordu Marty Cisak.
- Przy dodawaniu recznego zdarzenia obiekt i nalezaca do niego strefa sa obowiazkowe; formularz odrzuca brak strefy oraz strefe z innego obiektu.
- Etykiete `Klient` zmieniono w tym formularzu na jednoznaczne `Obiekt`.
- Zakladka `Zdarzenia` korzysta teraz ze wspolnej blokady edycji wlasnego czasu. Obejmuje ona Sabine Dudek (`W005`) i Marte Cisak (`W002`), pozostawiajac mozliwosc korekty przez innego uprawnionego uzytkownika oraz dotychczasowy wyjatek `W001`.
- Nizsza warstwa `createEvent` rowniez odrzuca nowe reczne zdarzenie bez obiektu albo strefy i ponownie potwierdza, ze wskazana strefa nalezy do wybranego obiektu.
Pliki:
- `web-app/apps/portal-web/src/features/events/index.js`
- `web-app/apps/portal-web/src/features/events/template.html`
- `web-app/apps/portal-web/src/services/workdayService.js`
- `test/workday-edit-access.test.js`
- `test/manual-event-object-requirement.test.js`
- `ReadMe.txt`
Weryfikacja:
- Transakcyjna aktualizacja jednego rekordu i odczyt zwrotny: `utility_room_id=BC0873`, obiekt `Best Clean`, status nadal `RUNNING`.
- Testy blokady Sabiny/Marty i wymagania obiektu: 7/7 OK.
Granice:
- Zmiana rekordu dotyczyla danych biezacego dnia i zostala wykonana na wskazanym polaczeniu Cloud SQL.
- Zmiany kodu pozostaja lokalne; nie wykonano commita, pusha ani wdrozenia.

Data: 2026-07-28
Autor: AI Codex
Temat: Trwaly draft, publikacja i rewizje Karty Zlecenia
Powod:
- Formularz tworzyl kompletny `jobCardDraft`, ale dotychczas backend nie utrwalal go jako osobnego, audytowalnego dokumentu i nie istniala bezpieczna granica pomiedzy zapisem szkicu a publikacja.
- Aplikacja pracownika nie moze otrzymywac roboczych ani finansowych danych Karty przed swiadoma publikacja.
- Kolejne publikacje musza pozostawiac niezmienna historie rewizji zamiast nadpisywac poprzedni dokument.
Zmieniono lokalnie:
- Dodano backendowy model domenowy Karty Zlecenia z kanonicznym JSON, walidacja, deterministycznym SHA-256, lista bledow, ostrzezeniami i przewidywalnym diffem rewizji.
- Zapis zlecenia utrwala draft w tej samej transakcji co zadanie. Brak wymaganych tabel zatrzymuje zapis kodem `JOB_CARD_SCHEMA_MISSING` zamiast cichego pomijania Karty.
- Publikacja korzysta wylacznie z draftu zapisanego na serwerze, wymaga zgodnego hasha oraz osobnego potwierdzenia kazdego ostrzezenia.
- Identyczna tresc nie tworzy kolejnej rewizji. Zmieniona tresc tworzy nowa, niezmienna rewizje z numerem, hashem, diffem, autorem i czasem publikacji.
- Uprawnienie do publikacji wymaga aktywnego czlonkostwa uzytkownika w tej samej aktywnej organizacji. Nie ma awaryjnego obejscia przez role platformowa.
- Dodano osobny przycisk `Publikuj Karte`; zwykly `Zapisz` pozostaje zapisem draftu.
- Aplikacja mobilna otrzymuje tylko ostatnia opublikowana rewizje przypisana do zalogowanego pracownika oraz projekcje jego roli. Drafty, dane handlowe i finansowe nie sa wysylane.
- Projekcja mobilna jawnie pozostawia `backgroundGps`, `continuousGps` i `routeTracking` wylaczone.
- Usuniecie zlecenia usuwa tylko jego zmienny draft; opublikowane rewizje pozostaja historia audytowa.
- Przy zmianie zdjecia pracownika backend usuwa poprzedni plik tylko wtedy, gdy nalezy on do kontrolowanego katalogu profilu tego pracownika i nowy zapis bazy zakonczyl sie powodzeniem.
Pliki:
- `job-card/domain.js`
- `job-card/repository.js`
- `index.js`
- `dataconnect/migrations/20260728_job_card_publication_additive.sql`
- `web-app/apps/portal-web/src/services/jobCardService.js`
- `web-app/apps/portal-web/src/features/orders/index.js`
- `web-app/apps/portal-web/src/features/orders/list/template.html`
- `web-app/apps/portal-web/src/index.css`
- `test/job-card-api-integration.test.js`
- `test/job-card-publication-domain.test.js`
- `test/job-card-publication-migration.test.js`
- `test/job-card-publication-repository.test.js`
- `test/job-card-preview-integration.test.js`
- `test/worker-profile-photo.test.js`
- `ReadMe.txt`
Weryfikacja:
- Testy celowane Karty Zlecenia i zdjec pracownikow: 30/30 OK.
- Pelne `npm test`: 811/811 OK.
- `npm --prefix web-app run lint`: OK; pozostaje jedynie informacyjna uwaga Babel o istniejacym duzym module kalendarza.
- `npm --prefix web-app run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- `git diff --check`: brak bledow bialych znakow; PowerShell/Git informuje jedynie o mozliwej konwersji LF/CRLF.
Granice i kolejna bramka:
- Zmiany sa lokalne. Nie wykonano commita, pusha ani wdrozenia.
- Nie uruchomiono migracji `20260728_job_card_publication_additive.sql` ani `20260728_worker_photo_url_additive.sql`.
- Przed testem zapisu zdjec i publikacji Karty na realnej bazie trzeba osobno zatwierdzic srodowisko, uruchomic obie migracje addytywne, wykonac test zalogowanego uzytkownika i potwierdzic odczyt opublikowanej rewizji w aplikacji mobilnej.
- Funkcja podgladu Karty pozostaje za flaga `VITE_ENABLE_JOB_CARD_PREVIEW`.

Data: 2026-07-28
Autor: AI Codex
Temat: Bezpieczna bramka migracji Karty Zlecenia i zdjec pracownikow
Powod:
- Lokalny portal laczy sie z projektem `iclean-room` i baza `iclean-room-database`; nie ma skonfigurowanej osobnej bazy testowej.
- Przed zmiana realnego schematu potrzebny jest powtarzalny audyt tylko do odczytu, krotkie limity blokad oraz programowa ochrona przed przypadkowym uruchomieniem zapisu.
Zmieniono lokalnie:
- Obie migracje maja teraz `lock_timeout=5s`, `statement_timeout=60s` i osobne blokady doradcze.
- Migracja zdjec sprawdza istnienie tabeli `worker` oraz wymusza zgodna definicje nullable `text` bez defaultu.
- Migracja Karty sprawdza tabele nadrzedna, komplet typow i nullability, constrainty, poprawne i gotowe indeksy oraz aktywne triggery niezmiennosci rewizji wskazujace wlasciwa funkcje.
- Usunieto potrzebe kasowania i ponownego tworzenia triggerow przy bezpiecznym ponownym uruchomieniu migracji.
- Dodano runner `npm run migrate:job-card-photo`. Domyslnie wykonuje tylko audyt. Zapis wymaga jednoczesnie flagi `--apply`, projektu `iclean-room`, bazy `iclean-room-database` i dokladnego identyfikatora `CLZ-DB-20260728-JOBCARD-PHOTO-01`.
- Runner nie wyswietla hasla bazy ani sekretow i po zapisie sprawdza gotowosc obu tabel oraz kolumny zdjecia.
Pliki:
- `dataconnect/migrations/20260728_job_card_publication_additive.sql`
- `dataconnect/migrations/20260728_worker_photo_url_additive.sql`
- `scripts/migrate-job-card-photo.js`
- `package.json`
- `test/job-card-photo-migration-runner.test.js`
- `test/job-card-publication-migration.test.js`
- `test/worker-profile-photo.test.js`
- `ReadMe.txt`
Weryfikacja:
- Testy celowane migracji i zdjec: 7/7 OK.
- Pelne `npm test`: 813/813 OK.
- `node --check scripts/migrate-job-card-photo.js`: OK.
- `git diff --check` dla pakietu migracyjnego: OK.
Aktualny stan i blokada:
- Produkcyjna baza nie zostala zmieniona.
- ADC konta `biuro@bestclean.pl` zostalo odnowione po dodaniu waskich wylaczen HTTPS Nortona dla wymaganych uslug Google.
- Audyt tylko do odczytu potwierdzil cel: baza `iclean-room-database`, uzytkownik techniczny `portal_app`, schema `public`.
- Przed migracja nie istnieja tabele `job_card_draft` ani `job_card_revision`, a tabela `worker` nie ma kolumny `photo_url`. Jest to oczekiwany stan poczatkowy; audyt zwrocil `ready=false`.
- Nie wylaczono globalnie weryfikacji TLS i nie zmieniono konfiguracji `gcloud`.
- Przed zapisem na produkcji nadal wymagane jest osobne, dokladne zatwierdzenie `OK PRODUKCJA CLZ-DB-20260728-JOBCARD-PHOTO-01`.

Data: 2026-07-28
Autor: AI Codex
Temat: Premium i responsywny ekran logowania Cleanzi
Powod:
- Dotychczasowy ekran byl podzielony na dwa puste polpanele, a mala ilustracja nie budowala wiarygodnego obrazu nowoczesnej firmy.
- Uzytkownik mogl zobaczyc surowy komunikat `Dashboard feature is not initialized.` zamiast zrozumialego stanu aplikacji.
Zmieniono lokalnie:
- Zastapiono ilustracje dedykowanym, profesjonalnym zdjeciem operacyjnym z managerka i zespolem w nowoczesnym obiekcie.
- Zdjecie zapisano jako zoptymalizowany WebP 1536 x 1024 px o rozmiarze 87 774 B.
- Dodano pelna warstwe marki: logo, komunikat wartosci, obszary produktu i spokojniejszy formularz z czytelna hierarchia.
- Widok sklada sie responsywnie: desktop korzysta z ukladu 58/42, a telefon z pionowego ukladu bez poziomego przewijania.
- Automatyczne odswiezanie pulpitu uruchamia sie tylko wtedy, gdy modul pulpitu istnieje i aktywna trasa to pulpit.
- Techniczny blad niezainicjalizowanej funkcji jest mapowany na zrozumialy komunikat dla uzytkownika.
Pliki:
- `web-app/public/login-hero-operations-v1.webp`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `web-app/apps/portal-web/src/ui/portalApp.js`
- `web-app/apps/portal-web/src/index.css`
- `design-qa-login-desktop.png`
- `design-qa-login-mobile.png`
- `design-qa-login-comparison.png`
- `design-qa.md`
- `ReadMe.txt`
Weryfikacja:
- Targeted ESLint dla `layoutTemplate.js` i `portalApp.js`: OK.
- `npm --prefix web-app run build`: OK; pozostaje informacyjne ostrzezenie Vite o duzych chunkach.
- Pelne `npm test`: 813/813 OK.
- Swiezy start lokalnej karty `http://localhost:5174/?jobCardPreview=1`: brak bledow konsoli, obraz zaladowany, pola i CTA aktywne.
- Desktop 1536 x 912 i mobile 390 x 844: brak poziomego overflow.
- Wizualne QA `PRZED / PO`: brak otwartych problemow P0, P1 lub P2; `final result: passed`.
Granice:
- Zachowano istniejaca logike Firebase, wybor organizacji, reset hasla i MFA.
- Nie wykonano commita, pusha, wdrozenia ani migracji produkcyjnej.
- Produkcyjna migracja Karty Zlecenia i zdjec nadal wymaga osobnej, dokladnej zgody wskazanej powyzej.

Data: 2026-07-28 21:00 CEST
Autor: AI Codex
Temat: Produkcyjna migracja addytywna Karty Zlecenia i zdjec pracownikow
Autoryzacja:
- Uzytkownik podal dokladna zgode `OK PRODUKCJA CLZ-DB-20260728-JOBCARD-PHOTO-01`.
- Zakres zostal ograniczony do `20260728_job_card_publication_additive.sql` i `20260728_worker_photo_url_additive.sql` w projekcie `iclean-room`, bazie `iclean-room-database`, schemacie `public`.
Przebieg:
- Audyt przed zapisem potwierdzil konto Google Cloud `biuro@bestclean.pl`, uzytkownika bazy `portal_app`, brak obu tabel Karty oraz brak `worker.photo_url`.
- Pierwsze wywolanie przez wrapper `npm run` nie przekazalo flag i wykonalo ponownie tylko audyt; nie zmienilo bazy.
- Pierwsze bezposrednie wywolanie zapisu zostalo wycofane przez transakcje na bledzie PostgreSQL `42703`.
- Diagnostyka wskazala brak pola `expected_not_null` w rekordzie walidatora oraz zbyt wczesna walidacje tabeli rewizji.
- Poprawiono kolejnosc tworzenia tabel i komplet pol walidatora. Testy celowane 7/7, `git diff --check` oraz produkcyjny dry-run zakonczony `ROLLBACK` przeszly poprawnie.
- Ponowne wywolanie bezposrednie z tym samym zatwierdzonym identyfikatorem zastosowalo obie migracje.
Wynik produkcyjny:
- `job_card_draft`: istnieje, 17 kolumn, 4 constrainty, 2 indeksy, 0 rekordow.
- `job_card_revision`: istnieje, 16 kolumn, 4 constrainty, 4 indeksy, 0 rekordow.
- Dwa triggery niezmiennosci rewizji sa aktywne.
- `worker.photo_url`: nullable `text`, bez wartosci domyslnej.
- Istniejacych pracownikow: 86; rekordow z `photo_url`: 0. Migracja nie uzupelniala ani nie zmieniala danych pracownikow.
- Niezalezny audyt po migracji zwrocil `ready=true`.
Granice:
- Nie wykonano wdrozenia kodu portalu ani aplikacji mobilnej, commita, pusha ani publikacji Karty Zlecenia.
- Kolejnym krokiem jest wdrozenie kompatybilnego backendu/portalu i kontrolowany test zapisu zdjecia oraz szkicu/publikacji rewizji.

Data: 2026-07-28 21:21 CEST
Autor: AI Codex
Temat: Kandydat wydania portalu po migracji Karty Zlecenia i zdjec
Zakres:
- Produkcyjny build App Hosting jawnie wlacza interfejs Karty Zlecenia przez `VITE_ENABLE_JOB_CARD_PREVIEW=1`.
- Lista pracownikow i `photo_url` sa pobierane przez nowy, autoryzowany endpoint `GET /api/admin/workers`, wymagajacy tokenu Firebase, aktywnego czlonkostwa organizacji i dokladnego `orgId`.
- Portal nie wymaga produkcyjnego wdrozenia Data Connect do odczytu zdjec pracownikow.
- Dodano obsluge zdjec w profilu pracownika, nowy ekran logowania, Centrum dowodzenia, operacje na zywo, zabezpieczenia edycji czasu, wymaganie obiektu dla zdarzen manualnych oraz Karte Zlecenia.
Decyzja wdrozeniowa:
- Suchy przebieg `firebase deploy --dry-run --only dataconnect:iclean-room-service` ujawnil szeroki zestaw dodatkowych, niezaleznych zmian schematu.
- Data Connect i reguly Storage zostaja poza zakresem tego rolloutu. Backend zapisuje zdjecia przez Admin SDK, a portal czyta adres przez waski endpoint SQL.
- Docelowa sciezka publikacji to Firebase App Hosting backend `cleanzi-01`, z jednego dokladnego commita Git.
Weryfikacja:
- Pelne `npm test`: 815/815 OK, w tym kontrola konfiguracji App Hosting.
- Pelny ESLint portalu: OK.
- Produkcyjny build Vite z `VITE_ENABLE_JOB_CARD_PREVIEW=1`: OK.
- Artefakty builda zawieraja `/portal/job-cards`, tekst Karty Zlecenia i `/api/admin/workers`.
- `git diff --check`: OK; pozostaja jedynie informacyjne ostrzezenia o konwersji LF/CRLF.
Granice:
- Na tym etapie nie wykonano pusha, rolloutu App Hosting ani zmiany ruchu produkcyjnego.
- Produkcyjne wdrozenie portalu wymaga osobnej dokladnej zgody `OK PRODUKCJA CLZ-PORTAL-20260728-JOBCARD-PHOTO-01`.

Data: 2026-07-29 09:23 CEST
Autor: AI Codex
Temat: Produkcyjny rollout portalu Karty Zlecenia i zdjec pracownikow
Autoryzacja:
- Uzytkownik podal dokladna zgode `OK PRODUKCJA CLZ-PORTAL-20260728-JOBCARD-PHOTO-01`.
- Zakres ograniczono do Firebase App Hosting backendu `cleanzi-01` w projekcie `iclean-room`, regionie `europe-west4`.
- Poza zakresem pozostaly Data Connect, reguly Storage, aplikacja mobilna oraz jakiekolwiek dodatkowe zmiany bazy.
Wydanie:
- Branch: `codex/portal-release-20260727`.
- Commit: `8fed73b11507df446bf53934495df0ae61e22733`.
- Build: `build-2026-07-29-001`, stan `READY`.
- Rollout: `build-2026-07-29-001`, stan `SUCCEEDED`.
- Rewizja Cloud Run: `cleanzi-01-build-2026-07-29-001`, stan `CONDITION_SUCCEEDED`.
- Najnowsza gotowa rewizja jest rowna najnowszej utworzonej rewizji i obsluguje 100% ruchu.
Postflight:
- `https://portal.cleanzi.pl/`: HTTP 200.
- `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200.
- Produkcyjny ekran logowania renderuje nowy widok, obraz `login-hero-operations-v1.webp` ma naturalna szerokosc 1536 px, a konsola przegladarki nie zawiera bledow.
- `GET /api/admin/workers` bez tokenu zwraca 401 `UNAUTHENTICATED`.
- `GET /api/portal/job-cards` z pelnym zakresem i bez tokenu zwraca 401 `UNAUTHENTICATED`.
- Logi nowej rewizji od momentu wdrozenia: 0 wpisow o poziomie `ERROR` lub wyzszym.
Granice testu:
- Nie wykonywano produkcyjnej mutacji zdjecia, szkicu ani rewizji Karty Zlecenia, aby nie tworzyc danych demonstracyjnych w realnej firmie.
- Kolejnym bezpiecznym testem jest kontrolowany zapis na wskazanym pracowniku i wskazanym zleceniu po zalogowaniu uzytkownika portalu.

Data: 2026-07-29
Autor: AI Codex
Temat: Testowa fotografia wakacyjna ekranu logowania
Powod:
- Uzytkownik poprosil o tymczasowa, wyraznie wakacyjna grafike do testow wizualnych ekranu logowania.
Zmieniono lokalnie:
- Wygenerowano premium fotografie doroslej kobiety w eleganckim stroju kapielowym, odpoczywajacej z koktajlem na tropikalnej plazy pod palmami.
- Pierwszy, zbyt seksualizowany prompt zostal odrzucony przez system bezpieczenstwa generatora; finalny obraz zachowuje atrakcyjny charakter w estetyce luksusowej kampanii wakacyjnej bez erotycznego kadrowania.
- Obraz zapisano jako `login-hero-beach-v2.webp`, 1536 x 1024 px, 138 032 B.
- Ekran logowania wskazuje nowy, wersjonowany asset. Poprzedni `login-hero-operations-v1.webp` pozostaje w repozytorium jako bezpieczny rollback.
Pliki:
- `web-app/public/login-hero-beach-v2.webp`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `ReadMe.txt`
Weryfikacja:
- `npm --prefix web-app run lint` - OK.
- `npm --prefix web-app run build` - OK.
- `git diff --check` - OK (wylacznie informacyjne ostrzezenia o konwersji LF/CRLF).
- Plik WebP zostal odczytany i sprawdzony wizualnie w rozdzielczosci 1536 x 1024 px.
- Automatyczne otwarcie lokalnego ekranu logowania zostalo zablokowane przez polityke bezpieczenstwa przegladarki; nie stosowano obejsc.
Granice:
- Zmiana pozostaje kandydatem lokalnym. Nie wykonano pusha ani wdrozenia produkcyjnego.

Data: 2026-07-29 11:39 CEST
Autor: AI Codex
Temat: Produkcyjny rollout testowej fotografii wakacyjnej ekranu logowania
Autoryzacja:
- Uzytkownik podal dokladna zgode `OK PRODUKCJA CLZ-PORTAL-20260729-LOGIN-HERO-BEACH-01`.
- Zakres ograniczono do Firebase App Hosting backendu `cleanzi-01` w projekcie `iclean-room`, regionie `europe-west4`.
- Konto Firebase CLI: `biuro@bestclean.pl`.
Preflight:
- Branch: `codex/portal-release-20260727`.
- Commit produkcyjny: `ced87258738dc4fe8bc577ace70fe186a528c3f2` (`feat(portal): add beach login hero`).
- `npm test`: 815/815 OK.
- `npm --prefix web-app run lint`: OK.
- `npm --prefix web-app run build`: OK.
- Commit wypchnieto do repozytorium `biuro-del/Cleanzi-01`, powiazanego z App Hosting.
- Norton przechwytywal lokalne polaczenia TLS narzedzi Google. Nie wylaczano weryfikacji TLS; publiczny certyfikat `Norton Web/Mail Shield Root` przekazano tylko procesom Firebase w tej sesji przez `NODE_EXTRA_CA_CERTS`.
Wydanie:
- Build App Hosting: `build-2026-07-29-002`, stan `READY`.
- Rollout App Hosting: `build-2026-07-29-002`, stan `SUCCEEDED`.
- Rewizja Cloud Run: `cleanzi-01-build-2026-07-29-002`.
- Najnowsza gotowa rewizja jest rowna najnowszej utworzonej rewizji, warunek `Ready=True`, a rewizja obsluguje 100% ruchu.
Postflight:
- `https://portal.cleanzi.pl/`: HTTP 200.
- `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200.
- `https://portal.cleanzi.pl/login-hero-beach-v2.webp`: HTTP 200, `image/webp`, 138 032 B.
- Produkcyjny plik ma ten sam SHA-256 co asset z commita: `D84A7B80032DFB26779BDC38D98CE2620C4C35F69B5B1C5E098425E943125921`.
- Ekran logowania sprawdzono w przegladarce: obraz jest zaladowany, ma naturalny rozmiar 1536 x 1024 px i renderuje sie poprawnie w nowym ukladzie.
- `GET /api/admin/workers` bez tokenu nadal zwraca oczekiwane 401 `UNAUTHENTICATED`.
- Logi rewizji `cleanzi-01-build-2026-07-29-002` od wdrozenia: 0 wpisow o poziomie `ERROR` lub wyzszym.
Rollback:
- Poprzedni zatwierdzony build to `build-2026-07-29-001`, commit `8fed73b11507df446bf53934495df0ae61e22733`.
- Plik `login-hero-operations-v1.webp` pozostaje w repozytorium i moze zostac ponownie podpiety w osobnym, autoryzowanym wydaniu.

Data: 2026-07-29 11:45 CEST
Autor: AI Codex
Temat: Bardziej przezroczysta plansza i nowe haslo ekranu logowania
Zakres lokalnego kandydata:
- Zmieniono ciemne tlo planszy tekstowej z krycia 82% na polprzezroczysty gradient o kryciu 54-38%, aby fotografia pozostawala wyraznie widoczna.
- Zmniejszono rozmycie tla z 14 px do 8 px, dodano delikatna saturacje i lzejszy cien przy zachowaniu kontrastu bialego tekstu.
- Nowe haslo: `Wszystko idzie. W dobrym kierunku.`
- Nowy opis: `Cleanzi porzadkuje zlecenia, obecnosc i postep na biezaco, aby praca plynnie realizowala sie zgodnie z planem.`
- Nowy kicker: `SYSTEM, KTORY PROWADZI DZIEN`.
Pliki:
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `web-app/apps/portal-web/src/index.css`
- `ReadMe.txt`
Weryfikacja:
- `npm --prefix web-app run lint` - OK.
- `npm --prefix web-app run build` - OK.
- Zmiana nie dotyka backendu, bazy, logowania ani danych organizacji.
Granice:
- Zmiana jest lokalnym kandydatem i nie zostala wdrozona na produkcje.
- Produkcyjny rollout wymaga osobnej dokladnej zgody `OK PRODUKCJA CLZ-PORTAL-20260729-LOGIN-HERO-COPY-02`.

Data: 2026-07-29 11:55 CEST
Autor: AI Codex
Temat: Produkcyjny rollout przezroczystej planszy i nowego hasla logowania
Autoryzacja:
- Uzytkownik podal dokladna zgode `OK PRODUKCJA CLZ-PORTAL-20260729-LOGIN-HERO-COPY-02`.
- Zakres ograniczono do frontendu Firebase App Hosting backendu `cleanzi-01` w projekcie `iclean-room`, regionie `europe-west4`.
Wydanie:
- Branch: `codex/portal-release-20260727`.
- Commit produkcyjny: `14f7a955869bb60d6cb69483c4942d1450d21ba0` (`feat(portal): refine login hero message`).
- Build App Hosting: `build-2026-07-29-003`, stan `READY`.
- Rollout App Hosting: `build-2026-07-29-003`, stan `SUCCEEDED`.
- Rewizja Cloud Run: `cleanzi-01-build-2026-07-29-003`.
- Rewizja jest jednoczesnie najnowsza utworzona i gotowa, ma `Ready=True` i obsluguje 100% ruchu.
Weryfikacja:
- `npm test`: 815/815 OK.
- Wczesniejsze kontrole dokladnego commita: ESLint i produkcyjny build Vite - OK.
- `https://portal.cleanzi.pl/`: HTTP 200.
- `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200.
- Produkcyjny DOM zawiera haslo `Wszystko idzie. W dobrym kierunku.` oraz pelny nowy opis.
- Wyliczony styl planszy: gradient `rgba(4, 22, 52, 0.54)` do `rgba(4, 22, 52, 0.38)`, `backdrop-filter: blur(8px) saturate(1.15)`.
- Zdjecie `login-hero-beach-v2.webp` jest kompletne i ma naturalny rozmiar 1536 x 1024 px.
- Widok sprawdzono wizualnie w przegladarce; fotografia jest widoczna przez plansze, a bialy tekst zachowuje czytelnosc.
- `GET /api/admin/workers` bez tokenu nadal zwraca oczekiwane 401 `UNAUTHENTICATED`.
- Logi rewizji `cleanzi-01-build-2026-07-29-003`: 0 wpisow o poziomie `ERROR` lub wyzszym.
Rollback:
- Poprzedni zatwierdzony build to `build-2026-07-29-002`, commit `ced87258738dc4fe8bc577ace70fe186a528c3f2`.

Data: 2026-07-29 12:20 CEST
Autor: AI Codex
Temat: Lokalny kandydat kompaktowej planszy i jednoznacznego przekazu ekranu logowania
Zakres:
- Plansza na fotografii zostala zmniejszona z okolo 520 x 285 px do okolo 400 x 167 px w widoku 1280 x 720.
- Powierzchnia planszy spadla o okolo 55%, dzieki czemu nadal odslania brzuch, biodra i nogi postaci, a tekst jest wyraznie czytelniejszy.
- Usunieto drugorzedne etykiety `Pracownicy`, `Obiekty`, `Realizacja`.
- Nowy przekaz: `SYSTEM DO ZARZADZANIA PROCESEM SPRZATANIA`, `Sprzatanie. Pod kontrola.` oraz krotki opis planowania, monitoringu realizacji i kontroli jakosci.
- Opis formularza logowania wskazuje wprost, ze Cleanzi jest systemem do zarzadzania procesem sprzatania.
- Dla 390 x 844 plansza ma okolo 250 x 67 px i nie powoduje poziomego przewijania.
Pliki:
- `web-app/apps/portal-web/src/index.css`
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`
- `design-qa.md`
Weryfikacja:
- Produkcyjny widok i lokalnego kandydata porownano 1:1 przy 1280 x 720.
- Design QA: passed; brak problemow P0/P1/P2.
- Konsola lokalnego ekranu logowania: 0 bledow.
- `npm --prefix web-app run lint` - OK.
- `npm --prefix web-app run build` - OK.
- `npm test` - 815/815 OK.
- Zmiana nie dotyka backendu, bazy, autoryzacji ani danych firmy.
Granice:
- Zmiana jest lokalnym kandydatem i nie zostala wdrozona na produkcje.
- Produkcyjny rollout wymaga osobnej dokladnej zgody `OK PRODUKCJA CLZ-PORTAL-20260729-LOGIN-HERO-CARD-03`.

Data: 2026-07-29 12:54 CEST
Autor: AI Codex
Temat: Produkcyjny rollout kompaktowej planszy i jednoznacznego przekazu logowania
Autoryzacja:
- Uzytkownik podal dokladna zgode `OK PRODUKCJA CLZ-PORTAL-20260729-LOGIN-HERO-CARD-03`.
- Zakres ograniczono do frontendu Firebase App Hosting backendu `cleanzi-01` w projekcie `iclean-room`, regionie `europe-west4`.
Wydanie:
- Branch: `codex/portal-release-20260727`.
- Commit produkcyjny: `c6e580881cd9f5e67826f07b1207e6233ce5dc04` (`style(portal): rebalance login hero card`).
- Commit wypchnieto do repozytorium `biuro-del/Cleanzi-01`, powiazanego z App Hosting.
- Build App Hosting: `build-2026-07-29-004`, stan `READY`.
- Rollout App Hosting: `build-2026-07-29-004`, stan `SUCCEEDED`.
- Ruch produkcyjny: 100% na `build-2026-07-29-004`.
- Norton przechwytywal lokalne polaczenia TLS narzedzi Google. Nie wylaczano weryfikacji TLS; publiczny certyfikat `Norton Web/Mail Shield Root` przekazano tylko procesowi Firebase w tej sesji.
Weryfikacja:
- `npm --prefix web-app run lint` - OK.
- `npm --prefix web-app run build` - OK.
- `https://portal.cleanzi.pl/`: HTTP 200.
- `https://cleanzi-01--iclean-room.europe-west4.hosted.app/`: HTTP 200.
- Produkcyjny DOM zawiera jednoznaczny przekaz: `SYSTEM DO ZARZADZANIA PROCESEM SPRZATANIA`, `Sprzatanie. Pod kontrola.` oraz opis planowania, monitoringu realizacji i kontroli jakosci.
- Widok 1280 x 720: plansza 400 x 167 px, formularz 410 x 547 px, brak poziomego przewijania.
- Widok 390 x 844: plansza 250 x 67 px, formularz 362 x 500 px, brak poziomego przewijania.
- Ekran sprawdzono wizualnie w przegladarce na produkcji w wariancie desktopowym i mobilnym.
- Konsola produkcyjnego ekranu logowania: 0 bledow i 0 ostrzezen.
- Logi Cloud Run backendu `cleanzi-01` z 30 minut obejmujacych rollout: 0 wpisow o poziomie `ERROR` lub wyzszym.
Rollback:
- Poprzedni zatwierdzony build to `build-2026-07-29-003`, commit `14f7a955869bb60d6cb69483c4942d1450d21ba0`.

Data: 2026-08-01
Autor: AI Codex
Temat: Lokalny fundament centralnej bramy rejestracji Cleanzi
Powod:
- Rejestracja jest rozdzielona na kanal zarzadcy obiektu i kanal firmy sprzatajacej,
  ale oba kanaly korzystaja z jednego projektu Firebase oraz wspolnego UID.
- Samodzielne wdrozenie adaptera jednego kanalu mogloby zablokowac tworzenie kont w
  drugim kanale, dlatego potrzebna jest jedna centralna funkcja `beforeUserCreated`.
Dodano lokalnie:
- Nowy, izolowany katalog `registration-functions` z czystym kontraktem grantu,
  adapterem FACILITY_MANAGER, centralnym routerem i transakcyjnym magazynem Firestore.
- Preflight centralnej bramy wymaga jednoczesnie adapterow FACILITY_MANAGER i
  CLEANING_COMPANY; brak drugiego adaptera konczy sie `CENTRAL_GATE_INCOMPLETE`.
- Deterministyczny prywatny identyfikator dokumentu grantu, HMAC tozsamosci,
  dokladne powiazanie channel/action/provider, krotki TTL, jednokrotna konsumpcje,
  idempotentny retry tego samego eventId i UID oraz odmowe przy dwoch grantach.
- Dokument `docs/central-registration-gate.md` z granicami kanalow, warunkami
  aktywacji, rollbackiem i lista brakujacych elementow onboardingu providera.
Weryfikacja:
- `npm.cmd run check` - PASS.
- `node --test test/registration-contract.test.mjs` - 6/6 PASS.
- Lokalny emulator Firestore - 4/4 PASS: jednokrotna konsumpcja, rownolegly wyscig,
  fail-closed przy dwoch waznych grantach oraz idempotentny retry mimo pozniejszego
  wydania grantu w drugim kanale.
- `npm install --package-lock-only --offline` utworzyl powtarzalny lockfile.
- Lokalny Node 20 zglosil oczekiwane ostrzezenie engine; docelowy codebase wymaga
  Node 22 zgodnie z `registration-functions/package.json`.
Granice:
- Nie dodano adaptera CLEANING_COMPANY ani brokera Microsoft.
- Nie istnieje eksport `beforeUserCreated`, a root `firebase.json` nie rejestruje
  nowego codebase. Kod nie moze zostac wdrozony przez obecne polecenia projektu.
- Nie wlaczono Identity Platform, Blaze, App Check ani zadnych API i sekretow.
- Nie wykonano migracji, commita, pusha, wdrozenia ani zmiany produkcji.

Data: 2026-08-01
Autor: AI Codex
Temat: Lokalny broker rejestracji firmy sprzatajacej e-mail/haslo
Dodano lokalnie:
- Kanoniczny kontrakt kanalu `CLEANING_COMPANY` z obowiazkowym prywatnym tokenem
  proby, dokladna akcja Turnstile, planami GO+/PLUS/PRO, cyklem miesiecznym/rocznym
  i wersjonowanymi zgodami.
- Broker Firebase Admin tworzacy deterministyczny UID dopiero po walidacji hasla,
  Turnstile oraz autorytatywnej proby i zgod. Haslo nie trafia do snapshotu proby,
  Firestore, organizacji, logow ani telemetrii.
- Natychmiastowe idempotentne zlecenie utworzenia organizacji `cleaning_provider`,
  ownera i triala `TRIAL/TRIALING` na dokladnie 14 x 24 godziny, bez karty i bez
  automatycznej konwersji.
- Transakcyjny magazyn prywatnych operacji Firestore bez surowego e-maila, hasla,
  tokenu Turnstile, IP i User-Agent.
- Stany ponowien i awarii: bezpieczna kompensacja tylko dla potwierdzonego bledu
  sprzed commita, `RECOVERY_REQUIRED` przy nieznanym wyniku oraz idempotentna
  ponowna wysylka e-maila bez przedluzania triala.
- Polityke dostepu: brak wejscia przed potwierdzeniem e-maila, po potwierdzeniu tylko
  onboarding, a operacyjne API dopiero po ukonczeniu profilu i przy aktywnym trialu.
- Dokument `docs/password-registration-broker-contract.md` i serwerowy przyklad
  konfiguracji `registration-functions/.env.example` bez wartosci sekretow.
Zmieniono:
- Kontrakt integracyjny teraz jednoznacznie tworzy organizacje od razu po
  zarejestrowaniu administratora, ze statusem `IN_PROGRESS`, zamiast dopiero po
  potwierdzeniu e-maila.
- Warunek centralnej bramy opisuje broker zamiast niewykonalnego grantu haslowego
  `beforeCreate` oraz zachowuje twarda regule 14-dniowego triala.
Usunieto:
- Nic.
Testy/sprawdzenia:
- `npm.cmd run check` - PASS.
- `npm.cmd run test:unit` - 28/28 PASS: trial 14 dni, idempotencja sekwencyjna i
  rownolegla, polskie znaki, brak hasla/tokenu w zapisach, zgody, Turnstile, konflikt
  payloadu, awarie bazy i poczty, rekonsyliacja Firebase oraz bramki dostepu.
- `npm.cmd run test:emulator` - 8/8 PASS: granty i operacje Firestore, rownolegla
  rezerwacja, prywatnosc, idempotencja i konflikty stanow.
Granice:
- Nie dodano publicznego endpointu, adaptera zrodlowej polskiej bazy, provisionera
  Cloud SQL/Data Connect ani prawdziwej wysylki e-mail.
- Nie zmieniono repozytorium publicznej rejestracji ani ustawienia self-signup w
  Firebase Authentication.
- Nie dodano eksportu Functions i nie wykonano migracji, commita, pusha, wdrozenia
  ani jakiejkolwiek zmiany produkcji.
- Nastepny etap to podlaczenie zrodlowej proby i transakcyjnego provisionera w tym
  izolowanym kontrakcie, a potem test projektu testowego przed kontrolowanym cutoverem.

Korekta architektoniczna 2026-08-01:
- Oficjalna dokumentacja Identity Platform potwierdza, ze `beforeCreate` nie obejmuje
  e-mail/haslo ani custom auth.
- Docelowa granica to jedna centralna warstwa: funkcja blokujaca dla wspieranych
  zdarzen oraz broker Firebase Admin dla hasla i custom auth.
- Self-signup uzytkownikow koncowych musi zostac wylaczony przed uruchomieniem
  brokera; istniejace logowanie pozostaje dostepne.

Data: 2026-08-01
Autor: AI Codex
Temat: Lokalny adapter centralnej bramy dla firmy sprzatajacej
Dodano lokalnie:
- Adapter `CLEANING_COMPANY` z zarezerwowana akcja Turnstile
  `registration_cleaning_company`, osobnym HMAC i privacy-minimalnym kandydatem grantu.
- Kontrakt odrzuca klientowe zdarzenie haslowe kodem `PASSWORD_BROKER_REQUIRED`,
  poniewaz Identity Platform nie uruchamia `beforeCreate` dla e-mail/haslo.
- Nowe konta haslowe musza powstawac w centralnym brokerze po wylaczeniu self-signup;
  istniejace logowanie pozostaje dostepne, a onboarding i API wymagaja potwierdzenia
  e-maila.
- Claimy pochodzenia rejestracji, ktore nie sa rola, membershipem ani uprawnieniem.
- Testy rzeczywistego adaptera zamiast atrapy oraz test wyboru kanalu firmy
  sprzatajacej przez centralny router.
Ustalenia integracyjne:
- Zatwierdzony trial firmy sprzatajacej trwa 14 dni i nie wymaga karty.
- Publiczne plany to GO+, PLUS i PRO; cykl miesieczny lub roczny z rabatem 20%.
- ENTERPRISE pozostaje poza publicznym wyborem i wymaga oferty indywidualnej.
- Galaz `Rejestracja-31-07-2026` nie moze byc scalona bez zmian: zawiera trial
  7-dniowy i nie pobiera centralnego grantu przed utworzeniem konta.
- Dodano `docs/cleaning-company-registration-integration-handoff.md` z dokladna
  kolejnoscia e-mail/haslo i Google oraz granica odpowiedzialnosci trzech repozytoriow.
Granice:
- Nie dodano eksportu `beforeUserCreated`, endpointu wydajacego grant ani konfiguracji
  Firebase/Identity Platform.
- Nie wykonano migracji, commita, pusha, wdrozenia ani zmiany produkcji.

Data: 2026-08-02
Autor: AI Codex
Temat: Lokalna transakcja Cloud SQL i projekcja firmy sprzatajacej do Firestore
Dodano lokalnie:
- Adapter autorytatywnej proby PostgreSQL, ktory sprawdza hash jednorazowego tokenu,
  kanoniczne dane wlasciciela, plan, cykl i wersjonowane zgody przed utworzeniem Auth.
- Provisioner `SERIALIZABLE`, ktory w jednej transakcji tworzy organizacje
  `CLEANING_PROVIDER`, ownera, membership, szkic profilu, zgody, audyt i subskrypcje
  `TRIAL/TRIALING` na dokladnie 14 x 24 godziny.
- Jednorazowe `trial_redemption`, idempotencje po `broker_operation_id`, bezpieczna
  rekonsyliacje nieznanego wyniku COMMIT oraz transakcyjny outbox SQL.
- Idempotentna projekcje do `organizations`, podkolekcji `members` i
  `cleaningProviderProfiles` w Firestore.
- Celowy stan `onboarding`, ktory nie spelnia kontraktu backendu zaproszen, oraz
  osobne zdarzenie aktywacji dopiero po ukonczeniu profilu i podaniu nazwy prawnej.
- Migracje lokalna `registration-functions/sql/20260802_cleaning_company_password_registration.sql`
  i dokument `docs/cleaning-company-sql-firestore-projection-contract.md`.
- Serwerowy adapter Siteverify Turnstile z bezpiecznym retry tego samego tokenu,
  polityke hasla 15+ bez sztucznych regul skladu, k-anonimowa kontrole Pwned
  Passwords oraz atomowy limit naduzyc Firestore.
- Adapter Resend z prywatnym magazynem dostarczenia: ten sam klucz idempotencji
  moze byc ponawiany tylko w bezpiecznym oknie, a starszy nieznany wynik wymaga
  recznej rekonsyliacji zamiast ryzyka drugiej wiadomosci.
- Dokument `docs/registration-execution-adapters.md` z kontraktem prywatnosci,
  konfiguracji i warunkami podlaczenia.
Testy/sprawdzenia:
- `npm.cmd run check` - PASS.
- `npm.cmd run test:unit` - 47/47 PASS, w tym zrodlo proby, polskie znaki,
  transakcja, 14-dniowy trial, awarie przed i podczas COMMIT, outbox, retry,
  projekcja Firestore, wiele organizacji, blokada zaproszen, Turnstile, polityka
  hasla i trwala idempotencja wiadomosci.
- `npm.cmd run test:emulator` - 10/10 PASS: granty, operacje brokera, atomowe limity
  naduzyc i granica ponowien dostarczenia wiadomosci.
- Rzeczywista lokalna transakcja na schemacie zgodnym z testowym schematem galezi
  `origin/rejestracja-31-07-2026` przez `pg-mem` - PASS: po jednym rekordzie grafu,
  trzy zgody, idempotentny retry, dwa etapowe zdarzenia outboxa i katalogowy trial
  14 dni.
Granice:
- Nie zmieniono publicznego repozytorium rejestracji ani portalu klienta.
- Nie podlaczono publicznego endpointu, prawdziwych dostawcow, Cloud SQL ani workera
  outboxa; nie zmieniono Firebase Authentication ani App Check i nie wyslano e-maila.
- Migracja nie zostala wykonana. Nie wykonano commita, pusha ani wdrozenia.

Data: 2026-08-02
Autor: AI Codex
Temat: Wdrazalny lokalnie codebase Functions brokera firmy sprzatajacej
Dodano lokalnie:
- Osobny plik `firebase.registration.json` z codebase `cleanzi-registration`, bez
  hostingu, Firestore rules, Storage i Data Connect.
- Eksport `registerCleaningCompany` w regionie `europe-west3`, wymagajacy dokladnego
  originu, App Check z allowlista App ID, Turnstile, limitu naduzyc, polityki hasla
  i zrodlowego tokenu rejestracji.
- Prywatny przez IAM eksport `reconcileCleaningCompanyProjections` oraz harmonogram
  `drainCleaningCompanyProjectionOutbox` z ograniczona wspolbieznoscia.
- Kompozycje runtime Firebase Admin, Firestore, PostgreSQL, Pwned Passwords,
  Turnstile i Resend z sekretami odczytywanymi dopiero podczas wykonania funkcji.
- Ograniczony pool PostgreSQL oparty o istniejacy serwerowy sekret `DATABASE_URL`.
- Dokumenty `docs/cleaning-company-public-registration-change-contract.md` oraz
  `docs/cleaning-company-functions-deployment-runbook.md`.
- Testy HTTP dla CORS, App Check, limitu body, bezpiecznych kodow bledow, prywatnej
  rekonsyliacji i braku danych wrazliwych w diagnostyce.
Zmieniono:
- Turnstile i atomowy limit naduzyc sa sprawdzane przed zewnetrzna kontrola hasla;
  awaria dostawcy Turnstile ma osobny, retryowalny kod serwerowy.
- Opoznione zdarzenie rejestracji nie moze cofnac aktywnej projekcji providera ani
  nadpisac jego nazwy; konflikt klucza idempotencji aktywacji konczy sie fail-closed.
- Odrzucenie serwerowego sekretu Turnstile jest klasyfikowane jako niedostepnosc
  konfiguracji/dostawcy, a nie jako blad uzytkownika.
- `registration-functions` ma kompletny manifest Node.js 22, entrypoint Functions,
  blokujacy predeploy oraz jawne peer dependencies wymagane przez izolowany
  `firebase-admin`.
Testy/sprawdzenia:
- `node --check` na runtime Node 24 - PASS dla wszystkich plikow `src/*.js`.
- Testy jednostkowe po finalnej korekcie kolejnosci zabezpieczen i projekcji -
  67/67 PASS.
- Emulator Firestore - 10/10 PASS.
- Discovery Functions Emulator na projekcie `demo-cleanzi-registration` - PASS;
  rozpoznano trzy eksporty, region, invokery, parametry i przypisanie sekretow.
- `npm ls --depth=0` na runtime Node 24 - PASS; wszystkie bezposrednie zaleznosci
  sa obecne bez bledow drzewa pakietow.
- Po poprawnym odczytaniu manifestu wrapper `emulators:exec` nie zakonczyl procesu
  samodzielnie; pozostawiony lokalny proces Firebase CLI zostal zatrzymany recznie.
  Nie wywolano zadnego handlera ani uslugi chmurowej.
Granice:
- Repozytorium publicznego formularza pozostalo nietkniete; przygotowano tylko
  kontrakt zmian dla jego opiekuna.
- Nie ustawiono sekretow ani parametrow w Firebase, nie wlaczono App Check, nie
  wykonano migracji, nie wywolano prawdziwych dostawcow i nie wyslano e-maila.
- Nie wykonano commita, pusha ani wdrozenia.

Data: 2026-08-03
Autor: AI Codex
Temat: Lokalne poprawki po review PR #4 - wspolbieznosc i idempotencja brokera
Zmieniono lokalnie:
- Kompensacja Firebase Auth najpierw atomowo nabywa prawo do rollbacku. Nie usuwa
  konta, jezeli rownolegla operacja zdazyla juz utworzyc organizacje lub przejsc do
  pozniejszego stanu.
- Link weryfikacyjny powstaje pod pojedyncza dzierzawa i jest zapisywany przed
  wysylka jako prywatna koperta AES-256-GCM zwiazana z `operationId`. Ponowienie po
  awarii Resend uzywa dokladnie tego samego linku i fingerprintu payloadu.
- Jawny link oraz kod OOB nie sa zapisywane w Firestore, a zaszyfrowana koperta jest
  usuwana po potwierdzonym przejsciu operacji do `COMPLETED`.
- Rownolegle ponowienia wysylki zbiegaja sie do jednego zakonczonego stanu zamiast
  zwracac konflikt po udanej dostawie innego wywolania.
- E-mail dluzszy niz 180 znakow jest odrzucany przed zrodlowa baza i Firebase Auth,
  zgodnie z limitem autorytatywnego schematu rejestracji.
Testy/sprawdzenia:
- `npm run check` na runtime Node 24 - PASS dla wszystkich plikow `src/*.js`.
- Pelny zestaw testow jednostkowych - 71/71 PASS.
- Emulator Firestore - 12/12 PASS, w tym atomowa dzierzawa linku i bezpieczne
  nabycie prawa do kompensacji Auth.
- `npm ls --depth=0` na runtime Node 24 - PASS.
Granice:
- Nie ustawiono sekretow, nie wywolano Firebase, Cloud SQL, Resend ani innych
  prawdziwych dostawcow.
- Nie wykonano migracji, commita, pusha, odpowiedzi w review, scalenia ani wdrozenia.

Data: 2026-08-03
Autor: AI Codex
Temat: Druga lokalna runda poprawek po review PR #4
Zmieniono lokalnie:
- Przejsciowy blad `auth.getUser` podczas retry nie ustawia juz trwale
  `RECOVERY_REQUIRED`; stan operacji pozostaje niezmieniony i wywolanie mozna
  bezpiecznie ponowic. Definitywny brak UID lub niezgodnosc e-maila nadal wymaga
  rekonsyliacji.
- Fingerprint operacji zawiera domenowo rozdzielony HMAC znormalizowanego hasla.
  Retry z innym haslem konczy sie `IDEMPOTENCY_CONFLICT`, bez zapisywania hasla lub
  jego jawnego hasha w Firestore, bazie zrodlowej, organizacji ani logach.
- Zlozone `displayName` przekraczajace limit 200 znakow jest odrzucane przed
  wywolaniem bazy zrodlowej, Firebase Auth i mailera.
Testy regresji:
- Przejsciowa awaria Auth nie zatruwa zakonczonej operacji.
- Brak oczekiwanego UID nadal przechodzi do `RECOVERY_REQUIRED`.
- Zmiana hasla pod tym samym kluczem idempotencji jest odrzucana.
- Zbyt dlugie `displayName` nie tworzy konta ani proby zrodlowej.
- `npm run check` na runtime Node 24 - PASS.
- Pelny zestaw testow jednostkowych - 75/75 PASS.
- Emulator Firestore - 12/12 PASS.
- `npm ls --depth=0` na runtime Node 24 - PASS.
Granice:
- Zmiany zostaly zapisane w commicie `dbe0706` i wypchniete do PR #4.
- Nie wykonano migracji, scalenia, wdrozenia, konfiguracji ani wywolania
  prawdziwych dostawcow.

Data: 2026-08-03
Autor: AI Codex
Temat: Trzecia lokalna runda poprawek po review PR #4
Zmieniono lokalnie:
- Wyjscie z Pwned Passwords jest sprawdzane tylko przy przyjeciu nowej operacji.
  Retry istniejacej operacji potwierdza fingerprint, ale nie powtarza zmiennej
  kontroli hasla, ktora moglaby pozniej zablokowac ponowna wysylke tego samego linku.
- Prywatny magazyn operacji ma odczyt `find`, ktory nie tworzy dokumentu i wymaga
  zgodnosci fingerprintu, registrationId, HMAC e-maila, UID oraz orgId.
- Termin waznosci proby zrodlowej jest egzekwowany przed pierwszym zwiazaniem.
  Dokladny retry proby juz zwiazanej z tym samym UID, orgId i operationId pozostaje
  dozwolony bez ponownego uzycia wyczyszczonego tokenu.
- Brak rekordu `MARKETING` nie jest juz traktowany jak odmowa. Wymagany jest jawny
  rekord decyzji negatywnej z wersja, locale, czasem utworzenia i bez accepted_at.
Testy regresji:
- Retry po awarii maila przechodzi mimo pozniejszego wyniku `PASSWORD_COMPROMISED`.
- Zwiazana proba po terminie przechodzi tylko dla tych samych identyfikatorow;
  niezwiazana wygasla proba nadal jest odrzucana.
- Brak lub bledne locale odmownego rekordu `MARKETING` blokuje autoryzacje.
- Emulator sprawdza prywatny odczyt istniejacej operacji i konflikt fingerprintu.
- `npm run check` na runtime Node 24 - PASS.
- Pelny zestaw testow jednostkowych - 76/76 PASS.
- Emulator Firestore - 12/12 PASS.
- `npm ls --depth=0` na runtime Node 24 - PASS.
Granice:
- Zmiany zostaly zapisane w commicie `24bec9f` i wypchniete do PR #4.
- Nie wykonano migracji, scalenia, wdrozenia, konfiguracji ani wywolania
  prawdziwych dostawcow.

Data: 2026-08-03
Autor: AI Codex
Temat: Czwarta lokalna runda poprawek po review PR #4
Zmieniono lokalnie:
- Nowy owner i jego rekord `organization_member` maja stan `ONBOARDING`, a owner
  w `worker` pozostaje nieaktywny. Istniejace operacyjne zapytania Data Connect,
  ktore wymagaja membershipu `ACTIVE`, nie przepuszczaja konta przed aktywacja.
- Poczatkowa projekcja Firestore zachowuje membership `onboarding`; dopiero
  zdarzenie `CLEANING_PROVIDER_ACTIVATED` przechodzi do `active`.
- Zaufana transakcja konczaca onboarding wymaga zgodnego UID oraz
  `email_verified=true`, sprawdza ukonczony profil, a nastepnie atomowo aktywuje
  organizacje, membership i ownera przed zapisaniem zdarzenia projekcji.
- Aktywacja wymaga aktywnej transakcji PostgreSQL i zaklada savepoint. Blad
  dowolnego UPDATE lub outboxa cofa wszystkie zmiany tej aktywacji.
- Organizacja zawieszona, zablokowana, zarchiwizowana albo soft-deleted nie moze
  zostac przywrocona do `ACTIVE` przez ponowne wywolanie aktywacji.
- `joined_at` pozostaje pusty podczas `ONBOARDING` i jest ustawiany dopiero przy
  skutecznej aktywacji membershipu.
- Deterministyczny `INVALID_DISPLAY_NAME` jest zwracany jako blad klienta HTTP 400,
  a nie maskowany jako awaria serwera 500.
Testy regresji:
- Niezweryfikowany e-mail i obcy UID sa odrzucane przed pierwszym zapytaniem SQL.
- Membership `ONBOARDING` nie spelnia kontraktu operacyjnego ani zaproszen.
- Aktywacja po weryfikacji i ukonczeniu onboardingu przechodzi do `ACTIVE`, a
  opozniona projekcja rejestracji nie cofa aktywnego stanu.
- `npm run check` na runtime Node 24 - PASS.
- Pelny zestaw testow jednostkowych - 80/80 PASS.
- Emulator Firestore - 12/12 PASS.
- `npm ls --depth=0` na runtime Node 24 - PASS.
Granice:
- Glowna poprawka zostala zapisana w `7096b0b`; zabezpieczenia fail-closed sa
  przygotowane jako follow-up przed ponownym review PR #4.
- Nie wykonano migracji, scalenia, wdrozenia, konfiguracji ani wywolania
  prawdziwych dostawcow.
