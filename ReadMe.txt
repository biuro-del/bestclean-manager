Cleanzi 01 v2.5 - dokument techniczny dla programistów i AI
=============================================================

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

Uwaga: zmiana dokumentacji nie wymaga builda. Przy zmianach w JS/React/API minimum sprawdź `node --check index.js`, `node --check build-webapp.js`, lint lub build frontendu, zależnie od zakresu zmiany.


Główne katalogi i pliki
-----------------------
`index.js`
Główny backend Node.js. To nie jest Express, tylko ręczny serwer HTTP oparty o `http.createServer`. Obsługuje statyczny frontend z `web-app/dist`, endpointy API, proxy do wdrożonego hostingu/API oraz lokalne tryby pracy z Cloud SQL/Firebase Admin.

`package.json`
Skrypty główne projektu. `npm run dev` uruchamia `scripts/dev-local.js`, a `npm run build` uruchamia `build-webapp.js`.

`build-webapp.js`
Wrapper buildu portalu. Normalizuje target do `portal`, sprawdza zależności `web-app` i uruchamia `npm run build:portal`.

`scripts/dev-local.js`
Lokalny orchestrator developerski. Uruchamia backend na porcie z `.env.local` albo `8080` oraz frontend Vite na `127.0.0.1:5173`. Sprawdza konflikt portu, konfigurację Firebase Admin, lokalną bazę i TLS.

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
- `/api/auth/provision-worker` - tworzenie konta Firebase Auth dla pracownika.
- `/api/auth/rollback-worker` - rollback tworzenia konta pracownika.
- `/api/admin/worker-password/reveal` - podgląd zaszyfrowanego hasła pracownika dla admina.
- `/api/admin/worker-password/set` - zapis/reset hasła pracownika.
- `/api/admin/worker-profile/update` - aktualizacja profilu pracownika.
- `/api/admin/worker-profile/delete` - usuwanie profilu pracownika.
- `/api/auth/session-context` - kontekst sesji i organizacji.
- `/api/admin/users` - administracyjne operacje/lista użytkowników.
- `/api/**` - fallback proxy do zdalnego API.

Są też legacy aliasy dla części funkcji, np. `/authProvisionWorker`, `/authRollbackWorker`, `/adminWorkerPasswordReveal`, `/adminWorkerPasswordSet`, `/adminWorkerProfileUpdate`, `/adminWorkerProfileDelete`.

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
- `WORKER_PROFILE_STORAGE_MODE` - np. `db` albo `dataconnect` dla części operacji worker profile.
- `WORKER_PASSWORD_SECRET` - sekret szyfrowania haseł pracowników. Nie zmieniać bez planu migracji, bo stare hasła mogą przestać być czytelne.

Backend ma własne helpery do:
- nagłówków security/CSP,
- czytania i limitowania JSON body,
- normalizacji błędów,
- łączenia z Cloud SQL,
- Firebase Admin/Auth,
- szyfrowania/decryptowania haseł pracowników,
- Data Connect REST/GraphQL,
- lokalnych plików `.local-data`.


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
- `web-app/apps/portal-web/src/auth/authService.js` - logowanie, sesja, role, kontekst organizacji, bootstrap membership.
- `web-app/apps/portal-web/src/firebase/firebaseClient.js` - klient Firebase/Data Connect i gotowość auth.

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
- `features/dashboard`, `features/calendar`, `features/kanban`, `features/events`, `features/reports`, `features/schedule` - sekcje samodzielne.

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

`features/schedule`
Grafik pracy / board harmonogramu.

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
Lista i profil pracowników, tworzenie/edycja, status online, eksporty ewidencji.

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
- `workerService.js` - pracownicy, konta, hasła, profile.
- `workdayService.js` - workdays, eventy, aktywni pracownicy, podsumowania.
- `zoneService.js` - strefy/obiekty.
- `scheduleService.js` - board grafiku.
- `portalTaskService.js` - `/api/portal/tasks`.
- `scheduleTaskDataConnectService.js` - taski grafiku przez Data Connect.
- `backupService.js` - backup/restore/download/automatyzacja.
- `styleService.js` - style UI organizacji i użytkowników.
- `orgService.js` - organizacje.

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
- `OrgUiStyle`, `UserUiStylePreference`
- `Worker`, `WorkerCredential`
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

Firebase Hosting:
- `firebase.json` hostuje `web-app/dist` i ma rewrites do funkcji/API.


Zasady bezpiecznej edycji
-------------------------
Przed zmianami:
- sprawdź `git status --short`,
- przeczytaj odpowiednie pliki feature/serwis/backend,
- ustal, czy plik jest generowany,
- sprawdź, czy są cudze zmiany w tych samych plikach.

Podczas zmian:
- trzymaj zmiany blisko zadania,
- nie przenoś dużej logiki bez potrzeby,
- nie mieszaj refaktoru z poprawką biznesową,
- nie usuwaj fallbacków/proxy bez sprawdzenia trybów lokalnych i produkcyjnych,
- przy zmianach w uprawnieniach sprawdź role: `ADMIN`, `MANAGER`, `COORDINATOR`, `WORKER`.

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
