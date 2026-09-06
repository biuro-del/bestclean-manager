# Grafik: kontrolowana aktywacja prawdziwych danych

Ten runbook dotyczy wyłącznie niezależnego modułu `Grafik`. Nie aktywuje
Zleceń, Kalendarza, aplikacji pracownika, powiadomień ani żadnego downstreamu.
Każdy etap zmieniający produkcję wymaga osobnej zgody i kończy się własnym
postflightem. Zgoda na jeden etap nie obejmuje następnego.

## Stan wyjściowy — 2026-09-06

Ostatni audyt tylko do odczytu zakończył się wynikiem **NO-GO**:

- Cloud SQL `iclean-room-instance` działa na PostgreSQL 17 w `europe-west3`;
- nie istnieją jeszcze role `workforce_schedule_session`,
  `workforce_schedule_app`, `workforce_schedule_owner` i `migration_runner`;
- nie istnieje schemat `workforce_schedule_*` ani sekrety runtime Grafiku;
- konto runtime ma role Cloud SQL Client i Cloud SQL Instance User, ale nie ma
  jeszcze dostępu do nieistniejących sekretów Grafiku;
- `organization_kind` organizacji Best Clean jest pusty, podczas gdy Grafik
  dopuszcza wyłącznie `CLEANING_PROVIDER`;
- bieżące konto bazodanowe nie ma `CREATEROLE`;
- Firebase CLI wymaga ponownej autoryzacji.

To jest migawka, nie stałe założenie. Każdy etap zaczyna się od ponownego audytu
bieżącego stanu i porównania rewizji aplikacji z kandydatem.

## Niezmienne zabezpieczenia

Przez cały rollout muszą pozostać spełnione wszystkie warunki:

- `WORKFORCE_SCHEDULE_DELIVERY_ENABLED=false`;
- `WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED=false`;
- `WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED=false`;
- backend jest źródłem prawdy dla dostępu organizacji;
- pierwszy rollout używa `WORKFORCE_SCHEDULE_ROLLOUT_MODE=CANARY` oraz dokładnej,
  pojedynczej wartości w `WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS`;
- `ALL` nie jest częścią pierwszej aktywacji;
- frontend pozostaje `VITE_WORKFORCE_SCHEDULE_MODE=disabled`, dopóki backend,
  baza i uwierzytelniony smoke nie przejdą poprawnie;
- żaden token, URI z hasłem ani wartość sekretu nie trafia do repozytorium,
  argumentów procesu, logów lub raportu;
- raw migration SQL nie jest wykonywany bezpośrednio.

## Etap 0 — kandydat lokalny

1. Potwierdź bazowy SHA, czysty status przed zmianami i pełny diff kandydata.
2. Uruchom pełne testy, lint, build portalu i `git diff --check`.
3. Potwierdź testami, że tryb domyślny to `OFF`, nieznany tryb przechodzi do
   `OFF`, a pusty lub wadliwy allowlist w `CANARY` zamyka dostęp.
4. Potwierdź, że odrzucona organizacja nie otwiera połączenia z bazą.
5. Potwierdź, że reset sesji i zmiana organizacji unieważniają wcześniejsze
   odpowiedzi asynchroniczne.

Ten etap nie wymaga ani nie daje zgody produkcyjnej.

## Etap 1 — ponowny preflight tylko do odczytu

Sprawdź i zapisz bez wartości sekretów:

- konto, projekt, usługę, najnowszą rewizję i konto runtime;
- dokładną instancję Cloud SQL, bazę, region, wersję i stan primary;
- istnienie oraz cechy czterech ról Grafiku;
- brak albo stan schematu `workforce_schedule_*`;
- rodzaj, status, onboarding, plan, członkostwo i aktywny profil pracownika
  organizacji canary;
- istnienie aktywnych wersji wymaganych sekretów i IAM per sekret;
- wszystkie `WORKFORCE_SCHEDULE_*` w rewizji, bez ujawniania ich wartości
  wrażliwych;
- możliwość wskazania poprzedniej zdrowej rewizji do rollbacku.

Każda rozbieżność daje **NO-GO**. W szczególności nie wolno obchodzić pustego
`organization_kind`; jego ewentualna korekta jest osobną zmianą danych.

## Etap 2 — role bazy

Po osobnej zgodzie DBA wykonuje wyłącznie preprovisioning opisany w
`docs/workforce-schedule-role-preprovisioning.md`. Postflight musi potwierdzić
cechy i graf `SET ROLE`, brak źródłowych ACL dla loginu/runtime oraz brak dostępu
`portal_app` do Grafiku.

Przykładowy identyfikator osobnej zgody:

`OK PRODUKCJA GRAFIK ROLE <SHA>-01`

## Etap 3 — migracja schematu

Po osobnej zgodzie wykonaj wyłącznie chroniony wrapper opisany w
`docs/workforce-schedule-core-migration.md`. Jedynym punktem wejścia jest
`dataconnect/admin/20260906_workforce_schedule_core_apply.psql`.

Przykładowy identyfikator osobnej zgody:

`OK PRODUKCJA GRAFIK MIGRACJA <SHA>-01`

Sukces wymaga pełnego postflightu RLS, ACL, grafu ról, allowlisty funkcji oraz
izolacji dwóch organizacji. Sam komunikat końcowy `psql` nie wystarcza.

## Etap 4 — sekrety i minimalne IAM

Po osobnej zgodzie:

1. ustaw login runtime dokładnie jako `workforce_schedule_session`;
2. ustaw hasło wyłącznie w dedykowanym sekrecie;
3. nadaj kontu runtime Secret Accessor tylko na sekretach Grafiku, nigdy na
   poziomie całego projektu;
4. dodaj referencje runtime dopiero do osobnego kandydata aktywacyjnego;
5. pozostaw backend `OFF` i frontend `disabled`;
6. sprawdź nową rewizję oraz logi bez wykonywania endpointu Grafiku.

Przykładowy identyfikator osobnej zgody:

`OK PRODUKCJA GRAFIK SEKRETY-IAM <SHA>-01`

## Etap 5 — backend tylko dla canary

Osobny kandydat backendowy musi ustawić jednocześnie:

```text
WORKFORCE_SCHEDULE_ENABLED=true
WORKFORCE_SCHEDULE_ROLLOUT_MODE=CANARY
WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS=<EXACT_CANARY_ORG_ID>
WORKFORCE_SCHEDULE_DELIVERY_ENABLED=false
WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED=false
WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED=false
VITE_WORKFORCE_SCHEDULE_MODE=disabled
```

Najpierw sprawdź organizację spoza allowlisty: sesja nie może dostać capability,
a endpoint ma zwrócić kontrolowane `404` bez otwarcia poola Grafiku. Następnie
uruchom uwierzytelniony smoke `bootstrap` tylko dla canary:

```powershell
$env:WORKFORCE_SCHEDULE_SMOKE_BASE_URL='https://portal.cleanzi.pl'
$env:WORKFORCE_SCHEDULE_SMOKE_ORG_ID='<EXACT_CANARY_ORG_ID>'
$env:WORKFORCE_SCHEDULE_SMOKE_FROM='<YYYY-MM-DD>'
$env:WORKFORCE_SCHEDULE_SMOKE_TO='<YYYY-MM-DD>'
$secureToken = Read-Host 'Wklej krótko ważny Firebase ID token' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $env:WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN = `
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  npm.cmd run smoke:workforce-schedule:bootstrap
} finally {
  Remove-Item Env:WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  $secureToken.Dispose()
}
```

Raport może zawierać wyłącznie status HTTP, bezpieczny request ID, liczności i
kształt odpowiedzi. Nie może wypisywać tokenu ani danych osób i obiektów.
Token wpisany w ukrytym promptcie nie trafia do historii poleceń. Skrypt Node
celowo odrzuca `--id-token`; nie wolno zastępować promptu literałem w komendzie.

Przykładowy identyfikator osobnej zgody:

`OK PRODUKCJA GRAFIK BACKEND-CANARY <SHA>-01`

## Etap 6 — frontend tylko po zdrowym backendzie

Dopiero po `bootstrap = 200`, kontroli logów i zachowaniu izolacji ustaw
`VITE_WORKFORCE_SCHEDULE_MODE=live` w nowej rewizji. Backend nadal musi pozostać
w `CANARY` z pojedynczą organizacją. Test przeglądarkowy obejmuje:

1. brak menu w organizacji spoza allowlisty;
2. menu i bootstrap w organizacji canary;
3. konfigurację Grafiku;
4. jednorazową synchronizację katalogów osób i obiektów;
5. utworzenie, edycję i archiwizację zmiany;
6. publikację wyłącznie wewnętrzną;
7. potwierdzenie zerowych SMS, e-maili, push, zapisów Zleceń, Kalendarza,
   ewidencji pracy i aplikacji pracownika.

Przykładowy identyfikator osobnej zgody:

`OK PRODUKCJA GRAFIK FRONTEND-CANARY <SHA>-01`

## Stop i rollback

Przed każdym deployem zapisz identyfikator poprzedniej zdrowej rewizji. Przerwij
rollout przy dowolnym `5xx`, naruszeniu allowlisty, błędzie roli/schematu,
niezgodnym kształcie odpowiedzi, danych innej organizacji albo efekcie
zewnętrznym.

Rollback aplikacyjny polega na przywróceniu poprzedniej zdrowej rewizji lub
wdrożeniu rewizji z backendem `OFF` i frontendem `disabled`. Ponieważ flaga
frontendu jest build-time, sama zmiana runtime nie ukryje menu w już zbudowanym
artefakcie. Addytywnego schematu nie usuwa się automatycznie; po pierwszym
zapisie może zawierać historię biznesową.

Po rollbacku ponownie wykonaj test organizacji spoza allowlisty, kontrolę sesji,
`/healthz` jako test procesu oraz potwierdź, że endpoint Grafiku jest wyłączony.
`/healthz` nigdy nie zastępuje uwierzytelnionego `bootstrap` jako dowodu
gotowości Grafiku.
