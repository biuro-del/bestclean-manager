# Finanse i rentowność — domena backendowa

Ten katalog zawiera odseparowaną domenę, repozytorium i testy obliczeń
rentowności używane przez trasę HTTP portalu. Migracja modelu znajduje się w
`dataconnect/migrations/20260722_profitability_domain.sql`. Plik migracji jest
przeznaczony do przeglądu; utworzenie go nie zmienia bazy danych.

## Granice modelu

- `Client` jest stroną umowy, a `ServiceObject` (`service_object`) jest fizycznym
  obiektem świadczenia usługi. Jeden klient może mieć wiele obiektów.
- `Zone` należy do `ServiceObject`. Istniejące rekordy `zone`, `task` i `event`
  otrzymują nullable `object_id`, aby można było wykonać kontrolowany backfill bez
  zgadywania relacji na danych firmy.
- Każdy rekord finansowy jest kluczowany przez `org_id` i `object_id`.
- Czas pracy pozostaje w istniejącym `event`; migracja dodaje jednoznaczne
  powiązanie z obiektem, zadaniem i pracą okresową. Nie powstaje drugi model
  obecności.
- Przedziały dat są półotwarte: `[start, end)`. Przykładowy lipiec to
  `2026-07-01` — `2026-08-01`.

## Pieniądze i procenty

- Kwoty w PostgreSQL mają typ `bigint` i przechowują najmniejsze jednostki
  waluty. W JavaScript kalkulator używa `BigInt`.
- Repozytorium pozostawia wartości `bigint` z `pg` jako ciągi dziesiętne; nie
  konwertuje ich do `Number`.
- Waluty przechodzą walidację kodu ISO 4217.
- Procenty są liczone w punktach bazowych (`10000` = `100,00%`).
- Snapshot JSON zapisuje `BigInt` jako ciąg dziesiętny, ponieważ JSON nie obsługuje
  natywnie `BigInt`.

## Reguły kalkulacji

Główną funkcją jest `calculateObjectProfitability(input)`:

1. rozpoznaje przychody i cykliczne koszty w zadanym okresie,
2. wybiera efektywnie datowaną stawkę kosztu pracodawcy dla dnia sesji,
3. liczy czas `START/STOP` z istniejących zdarzeń,
4. rozpoznaje zakup jednorazowo albo przez amortyzację — nigdy oba sposoby,
5. koszt sesji pracy okresowej włącza do kosztu pracy obiektu tylko raz,
6. zwraca `INCOMPLETE` i wartości `null`, jeśli brakuje stawki lub `STOP`,
7. rozlicza zdarzenia starsze przez strefę, jeśli ta ma jednoznaczny
   `object_id`; obecność bez możliwego mapowania blokuje wynik zamiast dawać
   koszt pracy równy zero,
8. dla modeli `HOURLY`, `PER_SERVICE` i `MIXED` wymaga zaksięgowanego przychodu
   zmiennego, dopóki nie istnieje wiarygodna liczba godzin/usług do automatycznej
   wyceny,
9. nie liczy rentowności procentowej przy zerowym przychodzie.

Obok wartości końcowych zwracane są `knownCostMinor`, `issues`, kompletność,
porównanie planu z wykonaniem oraz przekroje kosztu pracy według pracownika,
strefy i zadania. `aggregateClientProfitability(results)` sumuje wyniki wielu
obiektów tego samego klienta, organizacji, okresu i waluty.

## Historia i zamknięcie okresu

`createProfitabilitySnapshot` tworzy niemutowalny, serializowalny wynik.
Migracja blokuje `UPDATE` i `DELETE` na `profitability_snapshot` oraz
`profitability_audit`. Korekta zamkniętego okresu jest nowym snapshotem ze
wskaźnikiem `correction_of_snapshot_id`, nigdy nadpisaniem historii.

## Dostęp

Centralną bramką jest istniejąca polityka
`profitability-entitlement-policy.js` i capability `profitabilityModule`.

- `OWNER` i `FINANCE_ADMIN` mają dostęp wewnętrzny.
- zwykłe role `ADMIN` i `MANAGER` nie dziedziczą dostępu finansowego; `ADMIN`
  staje się administratorem finansowym dopiero po zaufanym grancie
  `profitability:edit` odczytanym z bazy;
- osobny grant `profitability:close-period` pozwala `ADMIN` odczytać i zamknąć
  okres, ale nie pozwala zmieniać kontraktów, kosztów ani sprzętu;
- `COORDINATOR` może wyłącznie czytać po jawnym grancie dla obiektu.
- `WORKER` nie ma dostępu nawet po błędnym dodaniu kodu uprawnienia.
- kod `profitability:view-client-summary` jest zarezerwowany pod przyszły,
  ograniczony widok panelu klienta i nie daje dostępu do wewnętrznego API;
- repozytorium odczytuje rolę, subskrypcję i granty z bazy, a każde zapytanie o
  dane finansowe zawiera `org_id` i `object_id`.

Repozytorium nie implementuje własnej macierzy planów: przekazuje `plan_code` i
status z istniejącego `organization_subscription` do centralnej polityki. Tym
samym warunek PRO/ENTERPRISE pozostaje w jednym miejscu.

## Kontrolowane uruchomienie danych

Migracja nie tworzy obiektów ani nie przypisuje stref na podstawie podobnych
nazw, adresów lub współrzędnych. Przed włączeniem modułu dla organizacji trzeba:

1. utworzyć uzgodnione rekordy `service_object` dla klientów,
2. jawnie przypisać `zone.object_id`,
3. sprawdzić raport `UNMAPPED_LEGACY_ATTENDANCE`,
4. uzupełnić stawki pracowników i aktywne wersje kontraktów,
5. dopiero po weryfikacji zamknąć pierwszy okres.

Po przypisaniu strefy migracja uzupełnia wyłącznie brakujące `object_id` w
zadaniach i zdarzeniach z tej samej strefy. Nie zgaduje relacji dla zdarzeń bez
strefy; takie rekordy blokują wynik jako niepełny.

## Publiczne API

`profitability/index.js` eksportuje:

- obliczenia: `calculateObjectProfitability`, `aggregateClientProfitability`,
  `calculateLaborCost`, `calculateEntries`,
  `calculateEquipmentCostForPeriod`, `createProfitabilitySnapshot`;
- walidację: `minorUnits`, `normalizeCurrency`, `normalizePeriod`, `assertScope`;
- dostęp: `PROFITABILITY_ACTIONS`, `PROFITABILITY_CAPABILITY`,
  `resolveProfitabilityAccess`, `assertProfitabilityAccess`;
- repozytorium: `ProfitabilityRepository`, `createProfitabilityRepository`.

Stabilne metody `ProfitabilityRepository` dla warstwy HTTP:

- odczyt: `verifyServiceObjectScope`, `getSummary`, `listAudit` / `listHistory` /
  `getHistory`, `loadObjectCalculationInput`;
- zapis: `createContractVersion` / `upsertContract`,
  `createFinancialEntry` / `createCost` / `createRevenue`,
  `createWorkerRateVersion`, `createEquipment` / `upsertAsset`,
  `createOpenPeriod`, `closePeriod`, `saveSnapshot`, `appendAudit`.

Zapisy kontraktu, kosztu i sprzętu obejmują w jednej transakcji właściwy rekord
oraz wpis historii. `closePeriod` ponownie liczy wynik po stronie backendu,
blokuje zamknięcie niepełnych danych i dopiero potem utrwala snapshot.

## Testy

Z katalogu głównego repozytorium:

```powershell
$tests = Get-ChildItem -LiteralPath .\profitability -Filter '*.test.js' |
  ForEach-Object { $_.FullName }
node --test $tests
```

Testy nie wymagają bazy i nie wykonują migracji.
