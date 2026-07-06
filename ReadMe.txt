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
- W `scripts/dev-local.js` usunięto mylące ostrzeżenie o braku lokalnej DB, gdy worker-profile działa w trybie Data Connect.
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
