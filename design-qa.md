# Dashboard overview actions - Design QA

## Zakres i stan

- Modul: `Przeglad` na pulpicie portalu.
- Zmiana: interaktywne kafelki `Pracownicy`, `Brak QR STOP`, `Obiekty` i `Zaplanowane zlecenia` otwieraja pelne listy oraz prowadza do wlasciwych, istniejacych widokow szczegolowych.
- `Postep ogolny` pozostaje nieinteraktywny do czasu zdefiniowania wzoru w kolejnym module.
- Implementacja: `http://127.0.0.1:5173/`, zalogowany pulpit Best Clean.
- Weryfikacja byla tylko do odczytu; formularze zamknieto bez zapisu.

## Dowody bazowe

- Referencja modulu: `C:\Users\rafal\Documents\Codex\2026-07-21\mam\dashboard-overview-qa\dashboard-five-cards-904x698.png`.
- Wczesniejszy stan zamkniety: `C:\Users\rafal\Documents\Codex\2026-07-21\mam\dashboard-overview-qa\dashboard-action-default-904x698.png`.
- Wczesniejsza lista QR STOP: `C:\Users\rafal\Documents\Codex\2026-07-21\mam\dashboard-overview-qa\dashboard-action-list-904x698.png`.
- Wczesniejsza lista QR STOP na telefonie: `C:\Users\rafal\Documents\Codex\2026-07-21\mam\dashboard-overview-qa\dashboard-action-list-390x844.png`.
- Biezacy test funkcjonalny wykonano w rzeczywistym DOM przegladarki Chrome na zywych danych, bez operacji zapisujacych.

## Macierz interakcji

| Kafelek | Wartosc w chwili testu | Liczba wierszy | Cel po wybraniu wiersza | Wynik |
| --- | ---: | ---: | --- | --- |
| Pracownicy | 9 | 9 | Dzisiejszy raport czasu wybranej osoby | OK |
| Brak QR STOP | 3 | 3 | Edytor wybranego historycznego dnia pracy | OK, zamknieto bez zapisu |
| Obiekty | 6 | 6 | Historia wybranego klienta/obiektu | OK, NZOZ SWIERKLANY |
| Zaplanowane zlecenia | 5 | 5 | Edytor konkretnego zlecenia i wystapienia | OK, Best Clean |
| Postep ogolny | —% | nie dotyczy | Brak akcji | Zgodnie z zalozeniem |

## Wynik wizualny i responsywnosc

- Kafelki zachowuja istniejaca typografie, wysokosc, rytm i neutralny stan kart informacyjnych.
- Interaktywne karty maja wspolny hover, stan otwarcia i wyrazny, niebieski wskaznik fokusu.
- Opisy akcji sa mniejsze od metryki, ale maja kontrast zgodny z pozostalym tekstem pomocniczym.
- Dialog uzywa pelnej listy z ograniczona wysokoscia i przewijaniem; liczba rekordow nie zmienia wysokosci pulpitu.
- Przy viewportcie 390 x 844 px dialog zlecen mial szerokosc 370,4 px, lewa krawedz 10 px i prawa 380,4 px.
- `documentElement.scrollWidth` byl rowny `innerWidth` (390 px), wiec komponent nie powodowal poziomego overflow.
- Zmiana nie dodaje obrazow, ikon ani zastepczych elementow graficznych.

## Dostepnosc

- Cztery aktywne kafelki sa natywnymi elementami `button` z `aria-haspopup="dialog"`, `aria-controls` i aktualizowanym `aria-expanded`.
- `Postep ogolny` jest elementem `article`, a nie przyciskiem.
- Po otwarciu fokus trafia na pierwszy wiersz listy; przy pustej liscie trafia na przycisk zamkniecia.
- Tab oraz Shift+Tab pozostaja wewnatrz otwartego dialogu.
- Escape i przycisk zamkniecia chowaja dialog oraz przywracaja fokus na kafelek.
- Zmiana rozmiaru lub przewijanie podczas pracy z dialogiem nie pozostawia zagubionego fokusu.

## Historia poprawek QA

- P1: przejscie z raportu pracownika do obiektu moglo pozostawic poprzedni tryb raportu. Funkcja czeka teraz na zakonczenie `go('reports')`; ponowny test otworzyl raport `Klienci` dla NZOZ SWIERKLANY.
- P2: ten sam obiekt mogl byc liczony osobno po ID i nazwie. Dodano kontrolowane scalanie aliasow oraz zachowanie ID tylko wtedy, gdy pasuje do widocznej nazwy.
- P2: komunikat `od` aktywnego obiektu mogl uzywac czasu wczesniejszej, zakonczonej sesji. Teraz korzysta tylko z aktywnych sesji.
- P2: blad pobrania lub budowania listy zlecen byl przedstawiany jako `0`, a cache mogl pozostac klikalny. Teraz widoczny jest stan `—`, a dialog pokazuje wylacznie komunikat bledu bez przyciskow starych rekordow.
- P2: dialog nie zatrzymywal fokusu, a male teksty i outline mialy zbyt niski kontrast. Dodano cykl fokusu i ciemniejsze kolory.
- P2: prawdziwe ID zlecenia moglo mieszac sie z kluczem slotu. ID edytora jest teraz przechowywane osobno, z zachowaniem kontekstu cyklu i bloku uslugi.
- Nie pozostaly usterki P0/P1/P2 w zakresie kafelkow, list, nawigacji i responsywnosci.

## Ograniczenia

- Gdy aktywnosc QR nie ma kanonicznego `clientId`, historia obiektu uzywa istniejacego dopasowania po nazwie. Dwie identyczne nazwy klientow wymagalyby wzbogacenia zrodla QR o jednoznaczne ID.
- Lista QR STOP korzysta z istniejacego limitu pobrania 12000 rekordow Workday.
- Faktycznego zapisu nie testowano, aby nie zmieniac danych firmy.

## Mapa aktywnych pracownikow - Design QA (2026-07-22)

### Zakres i zrodlo prawdy

- Nowy wiersz znajduje sie pomiedzy `Przegladem` i `Osia dnia dzisiejszego`.
- Lewy panel `Obiekty` zawiera mala mape, licznik dostepnych pozycji GPS i tekstowa liste aktywnych pracownikow.
- `Postep uslug` oraz `Potwierdzone ukonczenie zadan` sa celowo tylko neutralnymi placeholderami bez wymyslonej logiki.
- Referencja: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-200e602d-3f11-407c-bfe9-bc45b0183f7b.png`.
- Implementacja desktop: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-desktop.png`.
- Implementacja mobile: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-mobile.png`.
- Wspolny obraz porownawczy referencja + implementacja: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-comparison.png`.

### Porownanie wizualne

- Zachowano kompozycje referencji: biala karta, tytul u gory, kompaktowa mapa z pinezkami i lista pod mapa.
- Lista zostala swiadomie zmieniona z obiektow z referencji na aktywnych pracownikow, zgodnie z biezacym wymaganiem.
- Typografia korzysta z istniejacego stosu `Manrope` / `Segoe UI`; tytuly, opisy i wartosci maja hierarchie zgodna z kartami `Przegladu`.
- Odstepy 16 px, promien 16 px, cien i obramowanie korzystaja z istniejacego jezyka wizualnego portalu.
- Mapa ma jasne, niskokontrastowe tlo i zielone pinezki; nie dodano recznie rysowanych ikon ani atrap mapy w kodzie produktu.
- Dwa panele bez logiki maja jednolity, neutralny stan z linia przerywana i znakiem `—`, wiec nie sugeruja istnienia danych.

### Dane i stany

- Pinezka powstaje tylko dla pracownika `isRunning`, ktorego surowy wpis z dzisiaj zawiera prawidlowe wspolrzedne GPS.
- Dopasowanie osoby jest hierarchiczne: kanoniczne ID, nastepnie login, a nazwa tylko wtedy, gdy jest jednoznaczna wsrod aktywnych osob.
- Wszystkie wpisy GPS w `dayGps`, `gps`, `dayComment` i `comment` sa analizowane; wygrywa najnowszy poprawny czas `at`, a czas wiersza jest tylko fallbackiem.
- Wspolrzedne spoza zakresu oraz `0,0` sa odrzucane. Brak GPS nie tworzy sztucznej pinezki.
- Interfejs mowi o `ostatniej zarejestrowanej pozycji`, a nie o sledzeniu na zywo, oraz pokazuje proporcje `X / Y z GPS`.
- Zmiana nie zapisuje wspolrzednych do podsumowania i nie dodaje nowych zapisow danych firmy.

### Interakcje

- Rolkowanie nad mapa zmienilo przyblizenie z poziomu 11 do 13.
- Przeciagniecie mapy przy zoomie 13 zmienilo dlugosc srodka z `18.521490` na `18.509476`.
- Klikniecie `Anna Kowalska` na liscie ustawilo widok na pinezce i otworzylo dymek z pracownikiem, obiektem oraz godzina GPS.
- Szybka sciezka ponownego renderu wywoluje `resize`, dzieki czemu mapa odzyskuje prawidlowy rozmiar po powrocie z ukrytej zakladki.
- Sygnatura markerow obejmuje osobe, obiekt, czas i wspolrzedne, wiec dymek nie pozostaje nieaktualny po zmianie danych w tym samym miejscu.

### Responsywnosc i dostepnosc

- Desktop: trzy rowne kolumny; ponizej 1080 px uklad `2 + 1`; ponizej 760 px jedna kolumna.
- Przy viewportcie `390 x 844` wszystkie karty mialy szerokosc `359.2 px`, a `scrollWidth` byl rowny `clientWidth` (`390 px`), bez poziomego overflow.
- Mapa jest regionem z nazwa, `aria-describedby`, aktualizowanym `aria-busy` i wyraznym niebieskim `focus-visible`.
- Lista zawiera wszystkie osoby z GPS, a nie tylko pierwsze cztery; przy wiekszej liczbie jest przewijana w stalym obszarze.
- Tekstowa lista jest alternatywa dla markerow i pozostaje dostepna, gdy dostawca mapy jest chwilowo niedostepny.

### Historia poprawek QA

- P1: nazwa mogla polaczyc GPS dwoch roznych osob. Dodano hierarchiczne dopasowanie i jednoznaczny fallback po nazwie.
- P1: wspolrzedne ze starego START mogly otrzymac czas nowszego zdarzenia. Dodano parsowanie wszystkich wpisow i wybor najnowszego `at`.
- P2: marker zachowywal stary obiekt lub czas przy niezmienionych wspolrzednych. Rozszerzono sygnature renderu.
- P2: po powrocie z ukrytej zakladki mapa mogla miec zly rozmiar. Dodano wywolanie `resize`.
- P2: lista alternatywna ukrywala nazwy po czwartej osobie. Wszystkie rekordy sa teraz dostepne w przewijanej liscie.
- P2: fokus mapy mial za slaby kontrast i brakowalo powiazania ze statusem. Dodano pelny outline, `aria-describedby` i `aria-busy`.
- Po ponownym porownaniu referencji i implementacji nie pozostaly usterki P0/P1/P2 w zakresie nowego wiersza paneli.

### Weryfikacja techniczna i ograniczenia

- `node --check`: wszystkie zmienione moduly przechodza.
- `vite build --mode portal`: 375 modulow, wynik poprawny; pozostaje istniejace ostrzezenie o duzych chunkach.
- `npm test`: runner przechodzi, ale repo nie zawiera testow (`0 tests`).
- ESLint nie zglosil nowych bledow; pozostaja dwa wczesniejsze nieuzywane symbole poza ta zmiana.
- Sesje lokalnego portalu w obu przegladarkach byly wylogowane, dlatego pelny test wizualny wykonal lokalny harness z tym samym HTML i produkcyjnym CSS oraz kontrolowanymi punktami testowymi.
- Kod produktu korzysta z istniejacego loadera Google Maps. Harness uzywal jasnych kafelkow mapowych bez klucza, poniewaz lokalny klucz Google odrzucal dodatkowa sciezke QA; nie zmienia to kodu ani dostawcy mapy w portalu.
- Faktycznych zapisow, wdrozenia i operacji na danych firmy nie wykonywano.

## Statusy pracowników i powiększana mapa - Design QA (2026-07-22)

### Zakres i źródła

- Referencja użytkownika: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-b653e636-ed64-4087-a95c-3a1406add86d.png`.
- Widok małej mapy: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-status-mini.png`.
- Widok mapy w popupie: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-status-expanded.png`.
- Wspólne porównanie referencji i implementacji: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-status-comparison.png`.
- Kontrolowany podgląd korzystał z właściwych klas i produkcyjnego arkusza `index.css`; dane osób i współrzędne były testowe.

### Logika statusów

- Zielona pinezka oznacza wyłącznie osobę z trwającym dniem pracy (`isRunning === true`).
- Czerwona pinezka oznacza wyłącznie zakończony dzisiejszy dzień z rzeczywistym czasem STOP; zamknięty lub niepełny rekord bez STOP nie jest błędnie oznaczany na czerwono.
- Jeśli ta sama osoba występuje w kilku wpisach, trwający dzień ma pierwszeństwo przed zakończonym; w obrębie tego samego statusu wybierany jest najnowszy START albo STOP.
- Status jest częścią sygnatury mapy, więc zmiana z zielonego na czerwony odświeża marker nawet przy niezmienionej pozycji GPS.
- Dymek i lista tekstowa pokazują status; dla zakończonego dnia dymek dodatkowo podaje godzinę STOP.

### Interakcja popupu

- Kliknięcie tła mapy, bezpośrednio pinezki albo przycisku `Powiększ mapę` otwiera modal z większą wersją tej samej mapy.
- Ta sama instancja mapy jest przenoszona do modala i z powrotem, dlatego zachowuje przybliżenie, przesunięcie oraz otwarty dymek.
- Enter lub Spacja na fokusie mapy również otwiera modal.
- `Zamknij`, Escape i kliknięcie przyciemnionego tła zamykają popup, zdejmują blokadę przewijania strony i przywracają fokus na element, który go otworzył.
- Tab i Shift+Tab pozostają w obrębie otwartego dialogu.

### Wyniki testu w przeglądarce

- W kontrolowanym zestawie powstały dokładnie 3 zielone i 3 czerwone pinezki.
- Kliknięcie pustego obszaru mapy zmieniło jej rodzica z `dashActiveWorkersMapHome` na `dashActiveWorkersMapModalHost`; rozmiar wzrósł z `464 x 184` do `1118 x 523,7` px.
- Kliknięcie zielonej pinezki również otworzyło modal oraz dymek `Anna Nowak / W pracy / Galeria Żory / Ostatni GPS: 11:42`.
- Rolkowanie w popupie przełączyło kafelki OpenStreetMap z poziomu 9 na 12, a przeciągnięcie zmieniło transformację panelu mapy. Po zamknięciu pozostał poziom 12, co potwierdza zachowanie stanu tej samej instancji.
- Escape przeniósł mapę z powrotem do małej karty i oddał fokus mapie; zamknięcie po otwarciu przyciskiem oddało fokus przyciskowi `Powiększ mapę`.
- Przy `390 x 844` px dialog miał położenie `x=8`, szerokość `374` px i prawą krawędź `382` px; `scrollWidth` dokumentu pozostał równy `390` px. Przycisk zamknięcia był w pełni widoczny.
- Konsola kontrolowanego podglądu nie zawierała błędów ani ostrzeżeń.

### Porównanie wizualne i dostępność

- Zachowano istniejący kompaktowy panel i mapę z referencji, dodając tylko wymagany drugi kolor, legendę i jawny przycisk powiększenia.
- Zielony i czerwony mają dodatkowe odpowiedniki tekstowe `W pracy` oraz `Dzień zakończony`, więc stan nie jest przekazywany samym kolorem.
- Dialog ma semantykę `role="dialog"`, nazwę, opis, `aria-modal`, aktualny licznik GPS i widoczny stan fokusu.
- Na telefonie popup zajmuje prawie cały ekran, ale zachowuje margines 8 px i dostępny przycisk zamknięcia.

### Weryfikacja techniczna i ograniczenia

- `node --check` dla zmienionych modułów JavaScript: OK.
- `npm.cmd test`: OK, repozytorium nie zawiera testów automatycznych (`0 tests`).
- `npm.cmd run build` w `web-app`: OK, Vite przetworzył 375 modułów; pozostało wcześniejsze ostrzeżenie o dużych chunkach.
- Targetowany ESLint nie wykazał nowych problemów; pozostaje wcześniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`.
- `git diff --check`: OK; tylko standardowe ostrzeżenia LF/CRLF.
- Końcowa sesja właściwego portalu była wylogowana, dlatego integracji z aktualnymi danymi firmy nie oceniano wizualnie. Reguły statusów sprawdzono w kodzie, a wygląd i interakcje w kontrolowanym lokalnym podglądzie.
- Nie wykonano zapisu danych firmy, commita, pusha ani wdrożenia.

## Niebieskie pinezki dla dzisiejszych przydzialow - Design QA (2026-07-22)

### Regula biznesowa i dane

- Niebieski kolor oznacza osobe przypisana do co najmniej jednego dzisiejszego, niezrealizowanego zlecenia.
- Przydzial ma pierwszenstwo wizualne przed zielonym lub czerwonym kolorem, aby osoba z zadaniem byla widoczna na niebiesko takze po rozpoczeciu albo zakonczeniu dnia pracy.
- Faktyczny stan dnia nie jest tracony: lista i dymek nadal pokazuja `W pracy` albo `Dzien zakonczony` obok informacji `Zadanie na dzis`.
- Zrodlem przydzialu sa te same dzisiejsze zlecenia, ktore zasilaja kafelek i os dnia. Dla kilku zlecen jednej osoby wybierane jest aktualne, a nastepnie najblizsze nadchodzace zadanie.
- Pracownik jest dopasowywany po kanonicznym ID lub loginie; nazwa jest tylko jednoznacznym fallbackiem.
- Gdy istnieje GPS dnia pracy, niebieska pinezka pozostaje na tej pozycji. Dla osoby bez GPS moze zostac uzyta zapisana lokalizacja `lat/lng` zlecenia, opisana jawnie jako lokalizacja zadania.
- Brak GPS i brak wspolrzednych zlecenia nie tworzy sztucznej pinezki i nie uruchamia geokodowania.

### Wynik na aktualnych danych lokalnej sesji

- Portal odczytal 5 dzisiejszych grup zlecen z 10 unikalnymi przydzielonymi osobami.
- W koncowym tescie na mapie widoczne bylo `26 / 35 na mapie`: 16 zielonych, 5 niebieskich i 5 czerwonych pozycji.
- Piec przydzielonych osob mialo w chwili koncowego testu dostepna pozycje mapowa. Pozostale przydzielone osoby bez GPS i bez zapisanych wspolrzednych zlecenia pozostaly w mianowniku, ale bez falszywej lokalizacji.
- Klikniecie niebieskiego wiersza otworzylo odpowiednia pinezke, a powiekszenie zachowalo dymek w obrebie mapy bez kolizji z kontrolkami zoomu.
- Dymek zawieral zadanie, planowane godziny i obiekt oraz rzeczywisty status dnia pracy i ostatni czas GPS.
- Po pelnym odswiezeniu strony ponowiono klikniecie niebieskiego wiersza i powiekszenie mapy; konsola od chwili odswiezenia nie zawierala bledow ani ostrzezen.
- Aktualny zrzut QA: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-dashboard-map-blue-live.png`.

### Weryfikacja techniczna

- `node --check` dla dashboardu i layoutu: OK.
- `npm.cmd test`: OK; repozytorium nie zawiera testow automatycznych (`0 tests`).
- `npm.cmd run build` w `web-app`: OK, Vite przetworzyl 375 modulow; pozostalo istniejace ostrzezenie o duzych chunkach.
- Targetowany ESLint nie wykazal problemow tej zmiany; nadal zglasza wczesniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- Test byl tylko do odczytu. Nie zapisano danych firmy, zlecen ani statusow START/STOP; nie wykonano commita, pusha ani wdrozenia.

## Rentownosc kontraktow - dane demonstracyjne - Design QA (2026-07-22)

### Zrodla i normalizacja porownania

- Glowny wzorzec wypelnionej karty: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-dda55b5e-fc0b-49f0-a464-e896fa076c64.png` (`682 x 497 px`).
- Stan przed zmiana przekazany przez uzytkownika: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-def53dde-da54-4278-936a-80d0cb8e7921.png` (`970 x 403 px`).
- Implementacja przy viewportcie `1280 x 720`, `devicePixelRatio=1`: karta CSS `946 x 405,8 px`, kadr `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-sample-card.png` (`946 x 406 px`).
- Wspolny obraz wzorzec + implementacja po normalizacji wysokosci: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-sample-reference-comparison.png` (`1519 x 406 px`).
- Widok mobilny: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-sample-mobile.png` przy `390 x 844`, `devicePixelRatio=1`.
- Pelna karta jest kadrem szczegolowym: tytul, oznaczenie demonstracyjne, KPI, zmiana, wykres, ranking i stopka sa czytelne bez dodatkowego zblizenia.

### Historia porownania i poprawek

- P2: pierwszy zestaw rankingu nie byl arytmetycznie zgodny z naglowkiem `23,8%`. Wartosci zmieniono na `28,5 / 25,4 / 23,9 / 21,8 / 19,4%`; ich srednia wynosi dokladnie `23,8%`.
- P2: pierwszy opis dostepnosci wykresu wymienial nieaktualna wartosc poczatkowa. `aria-label` zostal poprawiony i podaje dokladnie cztery widoczne wartosci `18,4 / 21,2 / 20,6 / 23,8%`.
- Zmiana miesiac do miesiaca jest spojna z wykresem: `23,8% - 20,6% = +3,2 p.p.`.
- Po poprawkach wspolne porownanie nie wykazalo pozostalych problemow P0, P1 ani P2.

### Wymagane powierzchnie wiernosci

- Typografia: istniejacy `Manrope` / `Segoe UI`, tytul 19 px, KPI 34 px oraz naglowki sekcji 11-12 px zachowuja hierarchie wzorca i pozostalych kart pulpitu.
- Rytm i uklad: desktop utrzymuje podzial okolo `55/45`, padding 24 px, promien 16 px, subtelny cien oraz pionowy separator. Na telefonie sekcje skladaja sie w jedna kolumne.
- Kolory: granatowy tekst, chlodne szarosci, fioletowa linia i obszar trendu oraz zielony badge dodatniej zmiany sa zgodne z wzorcem i tokenami dashboardu.
- Jakosc assetow i wykresu: karta nie zawiera fotografii ani ikon. Wykres jest rysowany z danych na responsywnym `canvas`; przy desktopie bitmapa ma `410 x 120` dla CSS `410,5 x 120`, a na telefonie `265 x 120` dla CSS `265 x 120`, wiec linia pozostaje ostra.
- Copy: badge `Przykladowe dane`, zdanie `Dane demonstracyjne - nie pochodza z danych firmy`, nazwy `Kontrakt demonstracyjny A-E` i etykieta wykresu jednoznacznie odrozniaja podglad od danych firmy.
- Responsywnosc: przy `390 x 844` karta ma `355 x 701 px`, caly modul jest czytelny, a poziomy overflow dokumentu wynosi `0`. Desktop przy `1280 x 720` rowniez ma overflow `0`.

### Dane, zachowanie i weryfikacja

- Wartosci sa stale i demonstracyjne: `23,8%`, `+3,2 p.p.`, trend czterech miesiecy oraz piec przykladowych kontraktow. Nie sa odczytywane z bazy ani zapisywane do danych firmy.
- Etykiety miesiecy nadal sa wyliczane wzgledem aktualnej daty; w tescie mialy wartosci `Kwi / Maj / Cze / Lip`.
- `Zobacz wszystkie kontrakty` pozostaje elementem tylko do wyswietlania z `aria-disabled=true`, poniewaz nie istnieje trasa raportu rentownosci.
- Po pelnym odswiezeniu localhost konsola nie zawierala bledow ani ostrzezen.
- `node --check`, `git diff --check` i `npm.cmd run build` w `web-app`: OK; Vite przetworzyl 375 modulow i pokazal tylko istniejace ostrzezenie o duzych chunkach. `npm.cmd test`: OK, repo nie zawiera testow automatycznych (`0 tests`).
- Targetowany ESLint nadal zglasza jedynie wczesniejszy `no-unused-vars` dla `openDashboardActivityEventEditor`; nie jest zwiazany z tym modulem.
- Nie zapisano danych firmy. Nie wykonano commita, pusha ani wdrozenia.

## Lista pracownikow pod mapa - wyrownanie do lewej - Design QA (2026-07-22)

### Zrodla i porownanie

- Referencja stanu przed zmiana: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-597b319f-baa1-4f14-ad6f-f56a4b5bf053.png` (`306 x 265 px`).
- Implementacja po zmianie: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-map-list-left-aligned.png` (`300 x 260 px`) przy viewportcie `1280 x 720`, `devicePixelRatio=1`.
- Wspolny kadr przed + po: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-map-list-left-aligned-comparison.png` (`618 x 265 px`).
- Porownanie jest kadrem szczegolowym calego zmienionego obszaru: legenda, opis i cztery widoczne wiersze listy sa czytelne, dlatego dodatkowy crop nie byl potrzebny.

### Wynik i historia porownania

- W stanie przed zmiana `justify-content:space-between` rozkladal wolna przestrzen miedzy znacznikiem, nazwiskiem i czasem GPS, przez co nazwiska zaczynaly sie daleko od lewej strony.
- W stanie po zmianie wiersz uzywa trzech jawnych kolumn `9px / minmax(0,1fr) / auto` i odstepu 8 px. Dla pierwszego wiersza lewa krawedz przycisku wynosi `x=311`, znacznika `x=314`, a tekstu `x=331`; nazwisko zaczyna sie 20 px od lewej krawedzi wiersza.
- Czas GPS nadal jest wyrownany do prawej (`x=522,7`), a kolumna tekstu ma elastyczna szerokosc `183,7 px`.
- Pierwsze porownanie po wdrozeniu nie wykazalo pozostalych problemow P0, P1 ani P2.

### Wymagane powierzchnie wiernosci

- Typografia: rozmiary, wagi, wysokosci linii, wielokropek i hierarchia imie/nazwisko nad obiektem pozostaly bez zmian.
- Rytm i uklad: usunieto przypadkowe rozsuniecie elementow; znacznik, tekst i czas tworza teraz zwarty, przewidywalny wiersz. Wysokosc 44 px i padding pozostaly bez zmian.
- Kolory: zielony, niebieski i czerwony status oraz kolory tekstu i czasu GPS pozostaly bez zmian.
- Jakosc assetow: zmiana nie dodaje ani nie modyfikuje obrazow, ikon lub mapy; wykorzystuje istniejace znaczniki statusu.
- Copy: imiona, nazwiska, nazwy obiektow, statusy i czas GPS nie zostaly zmienione.
- Dostepnosc i interakcja: kazdy wiersz nadal jest pelnym przyciskiem. Klikniecie `Paulina Fojcik` ustawilo pinezke i otworzylo dymek z pracownikiem, statusem, obiektem i czasem GPS.

### Weryfikacja techniczna

- Dokument przy `1280 x 720` nie ma poziomego overflow (`0 px`).
- Konsola po odswiezeniu i kliknieciu wiersza nie zawierala bledow ani ostrzezen.
- `git diff --check`: OK; tylko standardowe ostrzezenie LF/CRLF.
- `npm.cmd run build` w `web-app`: OK, Vite przetworzyl 375 modulow; pozostaje istniejace ostrzezenie o duzych chunkach.
- Zmiana dotyczy wylacznie CSS. Nie zapisano danych firmy i nie wykonano commita, pusha ani wdrozenia.

## Kompaktowy modul Przeglad - Design QA (2026-07-22)

### Zrodla, stan i normalizacja

- Zrodlo stanu przed zmiana: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-c00d18bc-3e68-4f08-b490-b0a9f0d36fd9.png` (`958 x 417 px`).
- Implementacja po zmianie: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-overview-compact-panel-final.png` (`946 x 202 px`).
- Pelny zrzut implementacji: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-overview-compact-after-final.jpg` (`1265 x 712 px`) przy viewportcie CSS `1280 x 720`, `devicePixelRatio=1`.
- Wspolny obraz przed + po: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-overview-compact-comparison.png` (`998 x 737 px`). Oba kadry maja niemal identyczna szerokosc i pokazuja caly modul.
- Stan porownania: pulpit po zaladowaniu danych, bez otwartego popovera. Liczby pracownikow i obiektow zmienily sie wraz z biezacymi danymi; porownanie dotyczy geometrii, hierarchii i czytelnosci, nie wartosci biznesowych.
- Dodatkowy kadr szczegolowy nie byl potrzebny: caly zmieniony panel ma `946 px` szerokosci, a wszystkie etykiety, wartosci, opisy i akcje sa czytelne we wspolnym obrazie.

### Historia porownania i poprawek

- Stan poczatkowy: breakpoint `max-width:1280px` wymuszal trzy kolumny. Rzad `3 + 2` mial `324,9 px`, a caly panel `388,9 px` wysokosci.
- Pierwsza kompaktowa wersja miescila piec kart w jednym rzedzie, ale zbyt mocno zmniejszala tekst pomocniczy. Przywrocono rozmiary `12 px` dla etykiet, `30 px` dla KPI, `11 px` dla opisu i `10 px` dla akcji.
- P2: w pierwszym finalnym kadrze wartosc `-%` w karcie postepu lamala sie na dwie linie. Wartosc otrzymala `white-space:nowrap` i stala szerokosc flex, a status elastyczna kolumne.
- Po poprawce caly panel ma `201,4 px` wysokosci, czyli jest nizszy o `187,5 px` (`48,2%`). Piec kart ma po `137,4 px` wysokosci i okolo `174,4 px` szerokosci.
- Kazda karta ma `clientHeight=scrollHeight=135 px` oraz `clientWidth=scrollWidth=172 px`; zadna tresc nie jest ucieta. Dokument ma `0 px` poziomego overflow.
- Finalne wspolne porownanie nie wykazalo pozostalych problemow P0, P1 ani P2.

### Wymagane powierzchnie wiernosci

- Typografia: zachowano rodzine `Manrope / Segoe UI`, wagi i podstawowe rozmiary `12 / 30 / 11 / 10 px`. KPI nadal dominuja, a linki akcji sa czytelne.
- Rytm i uklad: piec kart tworzy jeden rzad z odstepem `10 px`; padding kart zmniejszono do `12 / 11 px`, promien do `12 px`. Panel zachowal szerokosc `946 px`, tytul i zewnetrzny rytm dashboardu.
- Kolory i tokeny: biale karty, granatowe KPI, niebieskie akcje, szare opisy, obramowania, fokus i cienie pozostaly zgodne z istniejacym dashboardem.
- Jakosc assetow: modul nie zawiera fotografii ani nowych ikon. Zmiana nie dodaje atrap, SVG ani generowanych assetow.
- Copy i zawartosc: wszystkie piec nazw, opisy, wartosci, podglad zlecenia i komunikat postepu pozostaly widoczne. Zmieniono tylko prezentacje CSS.
- Responsywnosc: powyzej `1120 px` jest piec kolumn, do `1120 px` trzy, do `820 px` dwie, a do `760 px` jedna. Karty maja tylko `min-height`, wiec dluzsza tresc moze zwiekszyc ich wysokosc zamiast zostac ucieta.

### Interakcje i weryfikacja techniczna

- Przycisk `Pracownicy 7` byl jednoznaczny (`count=1`). Klikniecie ustawilo `aria-expanded=true` i otworzylo liste `Pracownicy - wybierz aktywna osobe` o rozmiarze `440 x 445,4 px` z realnymi pozycjami pracownikow.
- Po tescie popover zostal zamkniety i przywrocono widok `Pulpit`; zmiana CSS nie naruszyla nawigacji ani ARIA.
- Konsola po odswiezeniu i interakcji: brak bledow oraz ostrzezen.
- `npm.cmd run build` w `web-app`: OK, Vite przetworzyl 375 modulow; pozostaje istniejace ostrzezenie o duzych chunkach.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- Nie zapisano danych firmy. Nie wykonano commita, pusha ani wdrozenia.

## Postęp usług i potwierdzone ukończenia - Design QA (2026-07-22)

### Źródła i porównanie

- Wzorzec pustego panelu `Postęp usług`: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-3c2939ab-833a-4a30-9dee-7acb9dc4ee37.png` (`321 x 555 px`).
- Wzorzec pustego panelu ukończeń: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-871953be-3439-4f46-9a97-cf29a5fa2977.png` (`486 x 415 px`).
- Dodatkowe wzorce semantyki czasu i pasków: `codex-clipboard-6bf7f595-3859-4146-a3f8-8413f1360c8d.png`, `codex-clipboard-4504a83b-2093-4ec9-bbad-57fd9437772c.png` i `codex-clipboard-935c9bcb-b646-4672-a459-2fa3e8a63d7d.png`.
- Pełny zrzut zalogowanego localhost: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-service-panels-live.png` (`1060 x 4408 px`).
- Wspólny obraz wzorców i implementacji: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-service-panels-comparison.png` (`1450 x 1120 px`). Porównanie obejmuje całe zmienione karty i czytelne wiersze danych.

### Reguły danych i historia poprawek

- `Postęp usług` korzysta wyłącznie z jawnych zdarzeń `Event` z rzeczywistym `startAt`, statusem otwartym, bez `endAt` i typem `CLEAN`. Planowane, ale nierozpoczęte zlecenie oraz zakończone zdarzenie nie przechodzą filtra.
- `Potwierdzone ukończenie zadań` wymaga jawnego eventu obiektowego, rzeczywistego START-u i późniejszego STOP-u z dzisiejszego dnia. Zamknięty sam `Workday`, marker STOP dnia i GPS nie są dowodem ukończenia obiektu.
- Wyjątek `STOP_END_DAY` jest poprawnym zakończeniem tylko dla jawnego eventu z konkretną strefą i dodatnim czasem; odpowiada mobilnemu zamknięciu otwartego sprzątania przy końcu dnia.
- Obiekty są grupowane po jednoznacznym `clientId`. Fallback strefy wymaga jednego klienta, a fallback nazwy dokładnie jednego klienta w katalogu; wątpliwy rekord jest pomijany zamiast zgadywany.
- P1: pierwsza wersja dopuszczała do zamkniętych każdy explicit event z `endAt`. Dodano kontrolę typu `CLEAN` oraz wąski, strefowy wyjątek dla `STOP_END_DAY` / `WORKDAY_STOP`, dzięki czemu marker dnia nie może sam oznaczyć obiektu jako wysprzątanego.
- P1: pierwsza wersja uznawała samo `requiredWorkMinutes` za wystarczający plan. Po poprawce procent liczony jest tylko wtedy, gdy źródłowe zlecenie lub przydział ma zapisany początek i koniec; godziny `08:00 / +60 min` tworzone przez fallback kalendarza nie są pomiarem. Bez jawnych godzin pozostaje opisane orientacyjne `50%`.
- P2: wybór rewizji eventu został zmieniony z preferowania każdego rekordu ze STOP-em na najnowszy `updatedAt`; kompletność pól rozstrzyga dopiero remis.
- P2: do źródła panelu dołączono rozpoczęte wcześniej i nadal otwarte explicit `CLEAN` z już pobieranego szerszego zakresu. Nocna usługa blokuje więc przedwczesne ukończenie obiektu.
- Dla wielu pracowników grupa jest aktywna, gdy istnieje co najmniej jeden running event. Ukończenie pojawia się dopiero przy pustych `runningEvents` i `blockingEvents`, z godziną maksymalnego STOP-u.

### Wygląd, dostępność i responsywność

- Na zalogowanym localhost widoczna była 1 aktualnie realizowana usługa: `Urzad Miasta Rybnik (UM)`, z jawnie orientacyjnym `50%`, pracownikiem i godziną realnego START-u.
- Panel ukończeń pokazał 4 obiekty posortowane malejąco po STOP-ie; `Heliosz Med` miał dwóch pracowników i pojawił się dopiero z czasem ostatniego STOP-u `20:33`.
- Przy viewportcie CSS `1075 x 687`, `devicePixelRatio=1.25`, mapa i postęp miały po `454 x 517,25 px`; panel ukończeń zajmował kolejny rząd `924 x 430,45 px`. Dokument miał `clientWidth=scrollWidth=1060 px`.
- Listy miały własny pionowy scroll bez poziomego przepełnienia. Ich pozycja jest zachowywana podczas okresowego odświeżenia, a identyczny render nie wymienia niepotrzebnie DOM-u.
- Każdy pasek ma `role=progressbar`, zakres `0-100`, `aria-valuenow` i opis `aria-valuetext`. Orientacyjne `50%` jest nazwane jako orientacyjne, nie mierzone.
- Godziny STOP są elementami `time` z pełnym `datetime`. Liczniki używają `aria-live=polite`, listy nie ogłaszają całej zawartości przy każdym pięciominutowym przeliczeniu.
- Scrollowane listy mają `tabindex=0` i widoczny fokus. Tekst pomocniczy oraz status ukończenia mają po końcowej korekcie co najmniej `10 px`.
- Breakpointy zachowują trzy kolumny na szerokim desktopie, dwa panele plus trzeci pełny rząd do `1080 px` i jedną kolumnę do `760 px`.

### Weryfikacja techniczna i granice

- Ręczne odświeżenie zalogowanego pulpitu zachowało `1 w toku / 4 dzisiaj`; konsola nie zawierała błędów ani ostrzeżeń.
- `node --check` dla dashboardu i layoutu: OK. `git diff --check`: OK; tylko standardowe ostrzeżenia LF/CRLF.
- `npm.cmd test`: OK, repozytorium nadal nie zawiera testów automatycznych (`0 tests`).
- `npm.cmd run build` w `web-app`: OK, Vite przetworzył 375 modułów; pozostało istniejące ostrzeżenie o dużych chunkach.
- Targetowany ESLint nie wykazał nowego problemu. Jedyny błąd to wcześniejszy `no-unused-vars` dla `openDashboardActivityEventEditor` w tym samym dużym module.
- GPS może wspierać podgląd obecności na mapie, ale nie tworzy aktywnej usługi i nigdy nie kończy zadania. Brak jednoznacznego powiązania eventu z obiektem skutkuje pominięciem, nie zgadywaniem.
- Nie wykonano zapisu danych firmy, zdarzeń ani zleceń. Nie wykonano commita, pusha ani wdrożenia produkcyjnego.

final result: passed

## Faktyczna aktywnosc CLEAN a postep planu (2026-07-27)

### Zakres i cel

- Sprawdzono zalogowany pierwszy ekran Pulpitu oraz panel `Operacje na zywo`.
- Celem bylo pokazanie rzeczywistego START/STOP sprzatania na obiekcie nawet wtedy, gdy pracownik nie ma zaplanowanego zadania, bez zgadywania procentu lub godziny konca.

### Stan przed poprawka

- Mapa i os dnia pokazywaly aktywnych pracownikow oraz ich obiekty, a panel operacji pozostawal pusty.
- Przyczyna byla strukturalna: panel przyjmowal tylko Eventy `CLEAN` zaakceptowane przez scisly model korelacji planu.
- Dowod: `outputs/live-operations-audit-2026-07-27/01-before-empty-live-operations.png`.

### Stan po poprawce

- Jawny dzisiejszy CLEAN jest widoczny jako fakt operacyjny niezaleznie od wyniku korelacji planu.
- Bez potwierdzonego planu karta nie pokazuje procentu ani planowanego konca. Aktywny wpis pokazuje `od HH:MM` i stan nieokreslony, a zakonczony wpis pokazuje `STOP HH:MM` i `Zakonczone`.
- Procent, planowany koniec, KPI jakosci i potwierdzone ukończenie pozostaja dostepne tylko dla Eventu zaakceptowanego przez pelna korelacje ID.
- Na aktualnych danych zobaczono zakonczony CLEAN Rafala Dudka na obiekcie `AS Michal Herman [Activ Space]`. Nie bylo otwartego dzisiejszego CLEAN; przed dolaczeniem obecnosci START licznik uslug pokazywal dlatego `0 w toku`.
- Dowod: `outputs/live-operations-audit-2026-07-27/02-after-actual-operations.png`.
- Otwarty dzien pracy START na rozpoznanym obiekcie jest rowniez widoczny jako faktyczna obecnosc. Nie wymaga otwartego CLEAN, ale bez jednoznacznego planu nie otrzymuje procentu ani godziny konca.
- Plan jest dopasowywany tylko po zapisanych identyfikatorach klienta i pracownika oraz dostepnych identyfikatorach wykonania. Przy wielu pasujacych planach system nie wybiera zadnego.
- Otwarty CLEAN ma pierwszenstwo przed ogolna obecnoscia tej samej osoby, co zapobiega jednoczesnemu pokazaniu pracownika w dwoch miejscach.
- START bez rozpoznanego obiektu pozostaje widoczny jako `Obiekt nierozpoznany`, zamiast znikac z listy.
- Na danych Best Clean panel pokazal `16 w toku` i `36 operacji`. Dla jednoznacznie rozpoznanych planow widoczne byly procenty i planowane godziny konca, a dla pozostalych obecnosci tylko faktyczny START.
- Dowod: `outputs/live-operations-audit-2026-07-27/03-after-workday-presence-and-plans.png`.
- Porownanie ze wzorcem: `outputs/live-operations-audit-2026-07-27/04-reference-vs-workday-operations.png`.
- Koncowy zweryfikowany widok: `outputs/live-operations-audit-2026-07-27/05-final-verified-live-operations.png`.
- Kompletny widok: `outputs/live-operations-audit-2026-07-27/06-final-complete-live-operations.png`.

### Zdrowie kroku i ograniczenia dowodowe

1. Wejscie na Pulpit - zdrowe; sesja i dane organizacji Best Clean zostaly odczytane.
2. Odczyt mapy i osi dnia - zdrowe; widoczne sa obecnosci oraz obiekty pracownikow.
3. Odczyt Operacji na zywo - zdrowe po poprawce; faktyczny zakonczony CLEAN jest widoczny mimo wyjatku korelacji.
4. Aktywny CLEAN bez planu - zdrowy w modelu i testach; brak takiego otwartego rekordu w chwili wizualnej kontroli.
5. Aktywna obecnosc START bez planu - zdrowa na realnych danych; obiekt, pracownik i godzina sa widoczne bez procentu.
6. Aktywna obecnosc START z jednoznacznym planem - zdrowa na realnych danych; procent i planowana godzina konca sa widoczne.
7. START bez rozpoznanego obiektu - zdrowy jako jawny wyjatek danych; pracownik pozostaje widoczny, ale bez planu i procentu.

### Weryfikacja techniczna

- Testy modelu strumienia: `11/11` OK.
- Pelne testy: `250/250` OK.
- Lint: OK.
- Build portalu: OK; pozostaje tylko istniejace ostrzezenie o duzych chunkach.
- Nie zmieniono danych firmy ani produkcji.

final result: passed

## Chronologiczny strumień „Operacje na żywo” (2026-07-27)

### Źródło prawdy i stan

- Wzorzec: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-f7b0bfb1-96e2-4942-b1a8-1342a94f4a60.png` (`1333 x 833 px`).
- Implementacja panelu: `output/command-operations-qa-20260727/02-implementation.png` (`1280 x 720 px`, CSS viewport `1280 x 720`, DPR 1).
- Pełny widok wszystkich operacji: `output/command-operations-qa-20260727/03-all-operations-modal.png` (`1280 x 720 px`, CSS viewport `1280 x 720`, DPR 1).
- Wspólny obraz porównawczy: `output/command-operations-qa-20260727/04-source-vs-implementation.png` (`825 x 575 px`).
- Stan porównania: kontrolowany dzisiejszy strumień zawierający dwie operacje trwające, trzy zakończone i jedną operację bez pełnego planu czasu. Podgląd korzysta z produkcyjnego DOM komponentu, arkuszy CSS i rzeczywistych ilustracyjnych awatarów; nie korzysta z danych firmy.

### Porównanie i wymagane powierzchnie wierności

- Typografia: zachowano używany w Centrum dowodzenia stos `Manrope` / `Segoe UI`, mocne nazwy obiektów, małe opisy usług i prawostronną hierarchię procentu oraz czasu.
- Rytm i układ: panel utrzymuje kompaktową kolumnę wzorca, pięć widocznych wierszy, cienkie separatory, liniowe paski postępu i stałą stopkę. Zakończone wpisy nie zwiększają bez końca wysokości pierwszego ekranu.
- Kolory: aktywne operacje używają fioletowo-niebieskiego akcentu Centrum dowodzenia, zakończone zielonego statusu i subtelnego zielonego tła; neutralne tło, obramowania i cień są zgodne z istniejącymi tokenami portalu.
- Obrazy: miniatury korzystają z zapisanych, niehiperrealistycznych awatarów kobiety i mężczyzny. Dla kilku osób pokazuje się stos miniatur i licznik nadmiarowych osób.
- Treść: nazwa obiektu jest informacją główną, pod nią widoczne są blok usługi i pracownicy; po prawej znajduje się postęp oraz rzeczywisty lub przewidywany czas. Brak pełnego planu nie tworzy sztucznego procentu.

### Kolejność i zachowanie

- Aktywne i zakończone operacje są łączone w jeden strumień oraz sortowane malejąco po faktycznym czasie najnowszego zdarzenia: START dla trwającej pracy i STOP dla zakończonej.
- Nowo zakończona operacja trafia nad starszą operację nadal trwającą. Zakończone wpisy pozostają widoczne na pierwszym ekranie.
- Podgląd ma limit pięciu wierszy. Przycisk `Zobacz wszystkie operacje (N)` pojawia się tylko wtedy, gdy istnieją dalsze wpisy.
- Pełna lista jest przewijanym dialogiem z licznikiem, zamknięciem przez przycisk, kliknięcie tła lub Escape oraz pętlą fokusu Tab/Shift+Tab.
- Kliknięcie operacji z kanonicznym `taskId` prowadzi do istniejącego zadania w kalendarzu; wpis bez identyfikatora pozostaje informacyjny i nie zgaduje celu.

### Historia porównania

- Pierwszy render kontrolny nie załadował arkusza portalu z powodu błędnej ścieżki zasobu w pomocniczym podglądzie. Nie był to błąd produktu.
- Poprawiono wyłącznie ścieżkę arkusza podglądu i wykonano ponowny render `02-implementation.png`.
- Ponowne porównanie wykazało właściwą gęstość, hierarchię, kolory statusów, jakość awatarów i czytelność stopki. Nie pozostały różnice P0, P1 ani P2.
- Otwarty dialog `03-all-operations-modal.png` nie powoduje przycięcia listy ani utraty przycisku zamknięcia. Nie znaleziono P0/P1/P2.

### Weryfikacja techniczna i granice

- `npm.cmd test`: `241/241` OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaje istniejące ostrzeżenie Vite o dużych chunkach.
- Sesja właściwego portalu wygasła przed końcowym podglądem, dlatego wizualny stan z wieloma wpisami sprawdzono w kontrolowanym lokalnym renderze tego samego komponentu. Model kolejności ma osobne testy automatyczne.
- Nie zmieniono bazy, realnych zleceń ani statusów firmy. Nie wykonano commita, pusha ani wdrożenia.

final result: passed

## Domyslne awatary i gestszy uklad mapy (2026-07-27)

- Dodano dwie spojne ilustracje 2.5D: `public/assets/avatars/default-female.webp` i `public/assets/avatars/default-male.webp`.
- Obie miniatury maja 256 x 256 px, sa czytelne po przycieciu do kola 40 px i nie przedstawiaja realnych osob.
- Wlasne zdjecie profilowe ma pierwszenstwo; ilustracja jest uzywana wylacznie jako fallback.
- Srodek pierwszych szesciu markerow osob jest teraz oddalony od obiektu o ok. 72-82 px zamiast ok. 92-112 px; dolny siodmy marker jest na 76 px.
- W zalogowanym podgladzie z 27.07 mapa nie miala dzisiejszych pracownikow, dlatego stan danych nie pozwalal pokazac markerow bez tworzenia sztucznych rekordow firmy. Same assety zostaly sprawdzone bezposrednio, a logika doboru i pozycje sa objete testem i kontrola kodu.
- `npm.cmd test`: OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd run build`: OK.

final result: passed

## Centrum dowodzenia na pierwszym ekranie Pulpitu (2026-07-27)

### Źródło prawdy i wynik

- Referencja użytkownika: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-f7b0bfb1-96e2-4942-b1a8-1342a94f4a60.png` (`1333 x 833 px`).
- Implementacja desktopowa: `C:\Users\rafal\Desktop\app to react\output\command-center-qa-20260727\02-command-center-desktop.png` (`1703 x 904 px`).
- Wspólny obraz referencji i implementacji: `C:\Users\rafal\Desktop\app to react\output\command-center-qa-20260727\04-source-vs-implementation.png`.
- Mobilny podgląd `390 x 844 px`: `C:\Users\rafal\Desktop\app to react\output\command-center-qa-20260727\05-command-center-mobile-390.png`.
- Implementacja zachowuje hierarchię wzorca: status LIVE i tytuł, rząd czterech KPI, dominującą mapę, prawy panel operacji na żywo oraz dolny pasek informacji. Niższe moduły Pulpitu pozostały w dotychczasowej kolejności i nie zostały przebudowane.

### Wierność i świadome dostosowanie do produktu

- Typografia, promienie, białe powierzchnie, delikatne obramowania, podział KPI, fioletowa akcja widoku i zielony status zostały odtworzone w języku wizualnym Cleanzi.
- Mapa zajmuje dominującą część obszaru roboczego i korzysta z istniejącego, działającego mechanizmu Leaflet/OpenStreetMap na localhost. Kolory pinezek zachowują znaczenie: zielony — w pracy, niebieski — zadanie na dziś, czerwony — dzień zakończony.
- Nie użyto wygenerowanych twarzy ani fikcyjnych danych pracowników. Wzorcowe awatary zostały świadomie zastąpione aktualnymi pinezkami statusu, ponieważ portal nie ma bezpiecznego źródła zdjęć pracowników, a fikcyjne fotografie myliłyby operatora.
- Panel „Operacje na żywo” pokazuje wyłącznie dane jednoznacznie połączone z planem. Aktualny stan pusty oraz ostrzeżenie o jednym wyjątku są rzeczywistym wynikiem danych, a nie brakiem implementacji.
- KPI potwierdzenia używa liczby ukończonych bloków i dzisiejszego planu. Przy niedostępnej korelacji lub braku mianownika wyświetla `—%`, nie wartość wymyśloną.
- Marża `23,8%` pozostaje jawnie opisana jako wartość poglądowa i jest synchronizowana z demonstracyjnym modułem rentowności.

### Interakcje i responsywność

- Przeklikano filtry mapy. Wyłączenie „Zadanie na dziś” usuwało z widocznego DOM odpowiadające mu pinezki; po teście filtr został przywrócony.
- Przełącznik `Widok` zmienia mapę na listę pracowników i udostępnia akcję powrotu `Mapa`. Dowód: `03-command-center-list.png`.
- `Szczegóły` rozwijają realną listę potwierdzonych ukończeń i zmieniają akcję na `Ukryj`.
- Zachowano działające powiększenie mapy, listę pracowników, przejście do kalendarza, metryczne popupy i widoczny fokus klawiatury.
- W mobilnym podglądzie KPI składają się do układu `2 x 2`, akcje nagłówka przechodzą do ikon, a mapa i panel operacji układają się pionowo. Nie stwierdzono poziomego wyjścia nowego modułu poza kontener.

### Weryfikacja techniczna i granice

- Brak zduplikowanych `id` w `layoutTemplate.js`.
- `npm.cmd test`: `228/228` testów.
- `npm.cmd run lint` w `web-app`: OK.
- `npm.cmd run build` w `web-app`: OK; pozostaje wyłącznie istniejące ostrzeżenie Vite o dużych chunkach.
- `git diff --check` dla plików zmiany: OK; wyświetlone zostały tylko standardowe ostrzeżenia LF/CRLF.
- Nie wystąpił ekran błędu ani overlay Vite podczas testów rzeczywistego DOM. Narzędzie podglądu nie udostępnia pełnego strumienia konsoli, dlatego runtime dodatkowo zweryfikowano przez interakcje, lint, testy i produkcyjny build.
- Nie wykonano commita, pusha ani wdrożenia. Nie zmieniono bazy ani realnych danych firmy.
- Nie pozostały problemy P0, P1 ani P2.

final result: passed

## Ujednolicenie portalu do jakości Rentowności kontraktów (2026-07-27)

### Źródło prawdy i zakres

- Źródłem wizualnym był działający lokalnie widok `Rentowność kontraktów`: `output\portal-design-audit-20260727\01-profitability-reference-desktop.png`.
- Implementację porównano na zalogowanych widokach pulpitu, zdarzeń, zleceń, kalendarza, profilu klienta, raportów i Centrum zadań.
- Wspólny obraz porównawczy źródła i wdrożonego pulpitu: `output\portal-design-audit-20260727\14-reference-vs-dashboard.png`.
- Widoki desktop były sprawdzane przy `1703 x 904 px`, `devicePixelRatio=1`.
- Widok mobilny pulpitu był sprawdzany przy `390 x 844 px`, `devicePixelRatio=1`: `output\portal-design-audit-20260727\11-dashboard-mobile-390.png`.
- Zmiana obejmuje tylko prezentację, układ oraz zachowanie responsywne. Nie zmienia danych, reguł biznesowych, tras API ani mechanizmów zapisu.

### Porównanie i historia poprawek

- P1: poszczególne ekrany miały różne nagłówki, szerokości treści i rytm pionowy. Dodano wspólny komponent nagłówka strony oraz ograniczenie szerokości zgodne z modułem rentowności.
- P2: karty, filtry, KPI, pola formularzy i tabele używały różnych promieni, obramowań, cieni i stanów fokusu. Dodano końcową warstwę tokenów i komponentów w `portalQuality.css`, ładowaną po stylach funkcji.
- P2: pulpit mobilny otwierał pełny boczny panel i pozostawiał zbyt mało miejsca na treść. Przy małym ekranie panel startuje zwinięty i ma kompaktowy pasek z logo, akcją dodawania oraz kontrolką rozwinięcia.
- P2: filtry zdarzeń i karty KPI nie miały jednego kontrolowanego układu na szerokościach pośrednich. Dodano siatki `4 → 3 → 2 → 1` oraz bezpieczne przewijanie tabel.
- Po ponownym porównaniu całych widoków i kluczowych regionów nie pozostają usterki P0, P1 ani P2 w zakresie tej warstwy wizualnej.

### Wierność wizualna i responsywność

- Zachowano język wzorca: chłodne tło, białe powierzchnie, granatową hierarchię tekstu, fioletową akcję główną, subtelne obramowania, promienie 14–18 px i delikatny cień.
- Nagłówki stron mają tę samą hierarchię tytułu, krótkiego opisu i kontekstowego badge'a co moduł rentowności.
- KPI zachowują wspólny rozmiar metryki, etykiety i opisu. Formularze mają jednolite pola, fokus i przyciski.
- Tabele mają czytelne nagłówki, separatory, hover oraz przewijanie bez rozpychania dokumentu.
- Na telefonie nagłówek, wyszukiwarka, hero i karty przechodzą w jedną kolumnę. Zrzut `390 x 844 px` nie wykazuje poziomego overflow ani uciętych głównych akcji.
- Centrum zadań zachowuje własny roboczy charakter tablicy, ale korzysta z tych samych obramowań, promieni, cieni i stanów elementów.

### Interakcje i stany

- Przeklikano nawigację do pulpitu, zdarzeń, zleceń, kalendarza, profilu klienta, raportów i Centrum zadań.
- Zweryfikowano stan załadowanych danych na pulpicie oraz stany pusty/ładowania widoczne podczas nawigacji.
- Kontrolki zachowują istniejące selektory i identyfikatory, więc zmiana nie odłącza obsługi modułów.
- Widoczny stan `focus-visible` został ujednolicony dla przycisków, pól, selectów i elementów z `tabindex`.
- Nie wykonywano zapisów formularzy ani zmian danych firmy podczas QA.

### Weryfikacja techniczna i granice

- `npm.cmd test`: `228/228` testów.
- `npm.cmd run lint` w `web-app`: OK.
- `npm.cmd run build` w `web-app`: OK, 399 modułów; pozostaje wyłącznie istniejące ostrzeżenie o dużych chunkach.
- `git diff --check` dla plików tej zmiany: OK; tylko standardowe ostrzeżenia LF/CRLF.
- W przeglądarce nie wystąpił ekran błędu ani overlay Vite na sprawdzanych trasach. Narzędzie przeglądarki nie udostępnia pełnego strumienia konsoli, dlatego runtime dodatkowo zweryfikowano przez przejścia po rzeczywistym DOM, lint i produkcyjny build.
- Nie wykonano commita, pusha ani wdrożenia produkcyjnego.

final result: passed

## Zwijane panele operacyjne pulpitu (2026-07-23)

### Zrodlo prawdy i dowody

- Referencja uzytkownika: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-f0fd31cd-6eb9-49b8-b3c9-19ed88cf5eba.png` (`1441 x 541 px`). Pokazuje stan rozwiniety trzech paneli przed dodaniem kontrolek.
- Implementacja rozwinieta: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-insight-collapse\dashboard-expanded-viewport.png` (`1747 x 912 px`) przy viewportcie CSS `1747 x 912`, `devicePixelRatio=1`.
- Kadr rozwinietych paneli: `1413 x 518 px`; kazda karta miala `460,3 x 517,6 px`.
- Implementacja zwinieta: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-insight-collapse\dashboard-collapsed-viewport.png`; kadr trzech miniatur ma `1413 x 122 px`, a kazda karta `460,3 x 121,4 px`.
- Widok mobilny: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-insight-collapse\insights-collapsed-mobile.png` przy viewportcie CSS `390 x 844`, `devicePixelRatio=1`; karty maja `355 px` szerokosci.
- Wspolny obraz zrodla, stanu rozwinietego i stanu zwinietego: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-insight-collapse\comparison-source-and-implementation.png` (`1413 x 1310 px`). Zrodlo zostalo proporcjonalnie znormalizowane z `1441 x 541` do `1413 x 532`; implementacja zachowuje natywna gestosc `1x`.

### Pelne i skupione porownanie

- Stan rozwiniety zachowuje trzykolumnowa kompozycje, wysokosc paneli, typografie, kolory statusow, promienie, cienie, mape, listy i puste pole ukończonych zadan. Jedyna celowa zmiana to mala kontrolka `Zwin` przy liczniku kazdej karty.
- Zawartosc mapy jest aktualna i dlatego kadr mapy moze pokazywac inny obszar lub zestaw kafli niz referencja; nie jest to dryf ukladu.
- Stan zwiniety redukuje wysokosc rzedu z `517,6 px` do `121,4 px` (okolo `76,5%`) i zachowuje tytul, licznik oraz najwazniejszy odczyt z danych live.
- `Obiekty` pokazuja liczbe osob na mapie oraz rozklad `W pracy / Zadanie na dzis / Dzien zakonczony`. `Postep uslug` pokazuje najbardziej zaawansowana z aktualnie trwajacych uslug. `Potwierdzone ukonczenie` pokazuje ostatni zamkniety obiekt albo jednoznaczny stan pusty.
- Skupiony osobny crop nie byl potrzebny: wspolny obraz ma ponad 1400 px szerokosci, a przyciski, liczniki i tekst miniatur sa czytelne w natywnej gestosci.

### Wymagane powierzchnie wiernosci

- Typografia: zachowano istniejacy stos `Manrope / Segoe UI`, wagi tytulow, licznikow i tekstu pomocniczego. Miniatura nie wprowadza nowej hierarchii typograficznej.
- Rytm i uklad: rozwiniete karty zachowuja dotychczasowe proporcje. Zwiniete karty maja wspolny rytm `naglowek + kompaktowy odczyt`, a kazda moze byc zwijana niezaleznie.
- Kolory i tokeny: pozostaly istniejace biele, szarosci, granat, zielony i niebieski status. Kontrolki sa neutralne i nie konkuruja z licznikami.
- Jakosc assetow: zmiana nie dodaje ani nie zastepuje mapy, ikon, obrazow, SVG lub wykresow. Istniejaca mapa Leaflet jest po rozwinieciu ponownie przeliczana.
- Copy: krotkie etykiety `Zwin` i `Rozwin` sa jednoznaczne, a pelne nazwy akcji pozostaja w `aria-label` i `title`.

### Interakcja, dostepnosc i historia porownania

- Wszystkie trzy natywne przyciski zmieniaja `aria-expanded`, steruja wskazanym `aria-controls`, rzeczywiscie ukrywaja pelne body przez `hidden` i pokazuja osobne podsumowanie.
- Widoczna kontrolka ma `28 px` wysokosci zamiast dotychczasowych `40 px`; niewidoczny obszar klikniecia jest rozszerzony do co najmniej `44 px`, a fokus klawiatury pozostaje wyrazny.
- Stan kazdej karty jest zapisywany oddzielnie w `localStorage`, z kluczem rozdzielonym wedlug organizacji i uzytkownika. Ponowne zaladowanie zachowalo trzy zwiniete panele.
- Ponowne rozwiniecie `Obiektow` przywrocilo karte `517,6 px`, mape `424,3 x 184 px` oraz poprawna etykiete `Zwin panel obiektow`.
- Na telefonie rzad paneli ma `clientWidth=scrollWidth=355 px`; nowe miniatury nie tworza poziomego overflow. Istniejacy szerszy obszar osi dnia pozostaje poza zakresem tej zmiany.
- Pierwszy wspolny przeglad obrazu zrodla i implementacji nie wykazal problemow P0, P1 ani P2, dlatego nie byl potrzebny dodatkowy cykl korekty wizualnej. Widoczny obrys ostatnio kliknietego przycisku jest oczekiwanym stanem fokusu.
- Po poprawnym przeladowaniu i wszystkich interakcjach nie pojawily sie nowe bledy ani ostrzezenia konsoli. Trzy stare wpisy `Dashboard feature is not initialized` pochodza z wczesniejszego, przerwanego hot-reloadu o `08:15:33` i nie powtorzyly sie w zweryfikowanym stanie.

### Weryfikacja techniczna i granice

- `node --check` dla dashboardu i layoutu: OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd test`: 60/60.
- `npm.cmd --prefix web-app run build`: OK, 383 moduly; pozostaje istniejace ostrzezenie o duzych chunkach.
- `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- Nie zmieniono danych firmy, zdarzen, pozycji GPS ani logiki wyliczania postepu. Nie wykonano commita, pusha ani wdrozenia produkcyjnego.

final result: passed

## Zwijana miniatura Rentownosci kontraktow (2026-07-23)

### Zrodlo prawdy i dowody

- Referencja uzytkownika: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-6a3f3bc2-d554-42e3-a463-cbc0e139ad6b.png` (`1440 x 448 px`).
- Zalogowany localhost, pelny panel: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-collapse\expanded-scrolled.png` przy viewportcie CSS `1747 x 912`, `devicePixelRatio=1`.
- Kadr pelnej karty: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-collapse\expanded-card.png` (`1413 x 406 px`).
- Zalogowany localhost, miniatura: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-collapse\collapsed-scrolled.png`.
- Kadr miniatury: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-collapse\collapsed-card.png` (`1413 x 130 px`).
- Miniatura mobilna: `C:\Users\rafal\Desktop\app to react\.codex-tmp\qa-profitability-collapse\collapsed-mobile-viewport.png` przy `390 x 844`, `devicePixelRatio=1`; karta CSS `355 x 271,3 px`.
- Wspolne porownania w jednym obrazie: `comparison-reference-expanded.png` oraz `comparison-reference-collapsed.png` w tym samym katalogu.

### Pelne i skupione porownanie

- Pelny widok zachowuje kompozycje wzorca: tytul i badge, KPI po lewej, trend pod KPI, ranking po prawej oraz aktywna akcje na dole. Jedyna celowa zmiana to neutralny przycisk `Zwin panel` w prawym gornym rogu.
- Skupione porownanie normalizuje karte wzorca do `1412 x 404 px` i implementacje do `1413 x 406 px`; proporcje, pionowy separator, wykres, promien, padding oraz gestosc rankingu pozostaly zgodne.
- Miniatura ma `130 px` wysokosci zamiast `405,8 px`. Zachowuje srednia marze, zmiane miesiac do miesiaca, najlepszy kontrakt i jego wynik oraz przejscie do calej analizy.
- Dodatkowy crop nie byl potrzebny: oba kadry kart maja ponad 1400 px szerokosci, a wszystkie etykiety, liczby i kontrolki sa czytelne w obrazie porownawczym.

### Wymagane powierzchnie wiernosci

- Typografia: zachowano istniejacy stos `Manrope / Segoe UI`, hierarchie tytulu, KPI i tekstu pomocniczego. Miniatura korzysta z tych samych wag i nie tworzy nowego stylu typograficznego.
- Rytm i uklad: pelna karta jest praktycznie tej samej wielkosci co wzorzec; miniatura sklada kluczowe dane w jeden rzad na desktopie i w logiczne sekcje na telefonie.
- Kolory i tokeny: biel, granat, szarosci, fioletowe akcje i zielony status pochodza z istniejacego panelu. Przycisk zwijania jest neutralny i nie konkuruje z KPI.
- Jakosc assetow: zmiana nie dodaje obrazow, ikon, SVG ani atrap. Wykres pozostaje istniejacym responsywnym `canvas` i jest przerysowywany po rozwinieciu.
- Copy: `Zwin panel`, `Rozwin panel`, `Najlepszy kontrakt` i `Otworz analize` jednoznacznie opisuja akcje i zawartosc miniatury. Oznaczenie `Przykladowe dane` pozostaje widoczne w obu stanach.

### Interakcja, dostepnosc i historia poprawek

- Klikniecie `Zwin panel` zmienilo wysokosc karty z `405,8` na `130 px`, ukrylo pelne body i pokazalo osobne podsumowanie. `aria-expanded` zmienilo sie z `true` na `false`.
- Klikniecie `Rozwin panel` przywrocilo wykres i ranking oraz `aria-expanded=true`. Fokus pozostal na natywnym elemencie `button`.
- P2: pierwsza wersja jedynie przestawiala widoczne elementy pelnego body, wiec `aria-expanded=false` nie odpowiadalo semantycznie calkowicie ukrytej sekcji. Naprawiono to przez osobna miniaturke i rzeczywiste `hidden` na pelnej zawartosci.
- P2: pierwsza wersja przycisku miala `36 px` wysokosci. Minimalna wysokosc zostala podniesiona do `40 px`, z widocznym `focus-visible`.
- Na telefonie nie wystapil poziomy overflow (`scrollWidth - clientWidth = 0`). Pelny tekst najwazniejszych wartosci pozostal widoczny.
- Konsola po interakcjach nie zawierala bledow ani ostrzezen aplikacji.
- Nie pozostaly usterki P0, P1 ani P2.

### Weryfikacja techniczna i granice

- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd test`: 60/60.
- `npm.cmd --prefix web-app run build`: OK, 383 moduly; pozostaje istniejace ostrzezenie o duzych chunkach.
- `node --check` i `git diff --check`: OK; tylko standardowe ostrzezenia LF/CRLF.
- Preferencja zwiniecia jest lokalna i rozdzielona wedlug organizacji oraz uzytkownika. Niedostepny `localStorage` nie blokuje samego przelacznika.
- Nie zapisano danych firmy i nie wykonano commita, pusha ani wdrozenia.

final result: passed

## Profil klienta - wariant 1 i finanse (2026-07-22)

### Źródło i końcowe porównanie

- Wybrany wzorzec: `C:\Users\rafal\.codex\generated_images\019f8611-d2eb-7520-afe2-15652be5b2cf\exec-0c087324-57a4-4364-b53d-4ad01fb304b2.png` (`1487 x 1058 px`).
- Końcowy viewport implementacji: `C:\Users\rafal\Desktop\app to react\.codex-tmp\client-profile-qa\implementation-analytics-final.png` (`1265 x 712 px`) przy viewportcie CSS `1280 x 720`.
- Dolne sekcje analityczne: `C:\Users\rafal\Desktop\app to react\.codex-tmp\client-profile-qa\implementation-analytics-lower-final.png`.
- Wspólny obraz wzorca i implementacji: `C:\Users\rafal\Desktop\app to react\.codex-tmp\client-profile-qa\comparison-analytics-final.png`.
- Implementacja zachowuje układ wariantu 1: kompaktowy nagłówek klienta, działania po prawej, główne zakładki bezpośrednio pod nagłówkiem oraz finansowy obszar roboczy poniżej.
- Świadoma różnica względem wzorca: zamiast czterech kart pokazano sześć KPI wymaganych przez specyfikację; podgląd lokalny używa kompletnego testu 30 000 / 23 500 / 6500 / 21,67% i jest jawnie oznaczony.

### Widok, hierarchia i responsywność

- Profil dzieli treści na cztery główne grupy: `Podsumowanie`, `Operacje`, `Dokumenty i kontakt` oraz `Koszty i rentowność`; każda zakładka przełącza właściwy panel.
- Moduł finansowy ma szerokość `946 px` w kontrolowanym desktopie. Dokument ma `clientWidth=scrollWidth=1265 px`, więc nie występuje poziomy overflow strony.
- Karty KPI przechodzą w układ `3 x 2` w kontenerze profilu. Plan, trend i ranking tworzą jeden rząd trzech równych paneli, a tabele kosztów i prac okresowych mają pełną szerokość `944 px`.
- Breakpointy kontenerowe i viewportowe przechodzą do dwóch, a następnie jednej kolumny. Tabele zachowują własny bezpieczny scroll, bez rozpychania dokumentu.
- Typografia, kolory, obramowania, promienie, odstępy i akcje wykorzystują istniejące tokeny i wzorce portalu Cleanzi.

### Dane, stany i bezpieczeństwo prezentacji

- Sześć KPI obejmuje przychód netto, koszt całkowity, koszt pracy, marżę, rentowność i kompletność danych.
- Statusy są opisane tekstem (`Powyżej celu`, `Poniżej celu`, `Wynik ujemny`, `Niepełne dane`, `Nie można obliczyć`) i nie opierają się wyłącznie na kolorze.
- Plan i wykonanie pokazują czas, koszt, różnicę oraz najwyższy koszt według pracowników. Trend korzysta z 12 historycznych snapshotów; bez snapshotów pokazuje jawny stan pusty.
- Widoczne są ranking obiektów, struktura kosztów, tabela kosztów i tabela prac okresowych. Prace okresowe pokazują przychód, koszt i marżę bez ponownego doliczania alokowanego czasu pracy.
- Zweryfikowano stany ładowania, błędu, braku dostępu, pustych tabel i niepełnych danych w kodzie i semantyce DOM.
- Fixture jest aktywny tylko przy `import.meta.env.DEV`, localhost i parametrze `profitabilityPreview=1`. Końcowy `dist` nie zawiera fixture, tekstu podglądu ani przykładowych nazw.

### Interakcje i dostępność

- Kliknięcie obiektu aktualizuje strukturę kosztów, plan, ranking i obie tabele bez zmiany profilu klienta.
- Formularz umowy dynamicznie pokazuje wyłącznie właściwe pola dla `MONTHLY_FIXED`, `HOURLY`, `PER_SERVICE` i `MIXED`; przełączenie na `HOURLY` ukryło wartość miesięczną i pokazało stawkę za godzinę.
- Zweryfikowano modale: umowa, koszt, przychód zmienny, stawka pracownika, sprzęt, ostrzeżenia i historia. Fokus trafia do pierwszego pola, `Escape`/`Zamknij` przywraca fokus wywołującemu, a pola mają etykiety i wymagane ograniczenia.
- Trend ma opis dostępności, tabele używają nagłówków kolumn, statusy i komunikaty błędów mają semantyczne role, a wszystkie akcje mają widoczny fokus.
- Konsola kontrolowanego podglądu nie zawiera błędów ani ostrzeżeń aplikacji; widoczne były wyłącznie komunikaty Vite i informacja React DevTools.

### Weryfikacja techniczna i granice

- `npm.cmd test`: 60/60 testów.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; tylko istniejące informacyjne ostrzeżenie o dużych chunkach.
- `node --check` kluczowych plików oraz `git diff --check`: OK.
- Migracja finansowa nie została uruchomiona. Nie zmieniono bazy, realnych danych firmy, rejestracji, Stripe, cennika ani aplikacji pracownika.
- Nie wykonano commita, pusha ani wdrożenia produkcyjnego.

final result: passed

## Aktualny wynik QA - zwijana miniatura rentownosci (2026-07-23)

- Pelny raport `Zwijana miniatura Rentownosci kontraktow (2026-07-23)` znajduje sie powyzej i zawiera zrodlo prawdy, viewporty, wymiary, wspolne obrazy porownawcze, historie poprawek, interakcje oraz wszystkie wymagane powierzchnie wiernosci.
- Dowody koncowe: `.codex-tmp\qa-profitability-collapse\comparison-reference-expanded.png`, `.codex-tmp\qa-profitability-collapse\comparison-reference-collapsed.png` i `.codex-tmp\qa-profitability-collapse\collapsed-mobile-viewport.png`.
- Po koncowej weryfikacji nie pozostaly problemy P0, P1 ani P2.

final result: passed

## Aktualny wynik QA - zwijane panele operacyjne pulpitu (2026-07-23)

- Pelny raport `Zwijane panele operacyjne pulpitu (2026-07-23)` znajduje sie powyzej i obejmuje zrodlo, viewporty, wymiary, wspolny obraz porownawczy, trzy stany danych live, responsywnosc, interakcje oraz wymagane powierzchnie wiernosci.
- Dowody koncowe: `.codex-tmp\qa-insight-collapse\comparison-source-and-implementation.png`, `.codex-tmp\qa-insight-collapse\dashboard-collapsed-viewport.png` i `.codex-tmp\qa-insight-collapse\insights-collapsed-mobile.png`.
- Po koncowej weryfikacji nie pozostaly problemy P0, P1 ani P2.

final result: passed

## Mapa operacyjna - wariant 3 i alarm START (2026-07-27)

### Źródło i porównanie

- Wybrany wzorzec: `C:\Users\rafal\.codex\generated_images\019f8611-d2eb-7520-afe2-15652be5b2cf\call_fuwBb8r3Zzq8F5lPNJjgVvjX.png`.
- Zalogowany podgląd desktopowy `1333 x 833 px`: `output/operational-map-qa-20260727/02-implementation-desktop.png`.
- Skupiony kadr modułu: `output/operational-map-qa-20260727/03-implementation-map-focused.png`.
- Wspólny obraz wzorca i implementacji: `output/operational-map-qa-20260727/04-reference-vs-implementation-focused.png`.
- Mapa zachowuje istniejący układ pierwszego ekranu Pulpitu i jego prawdziwe dane. Wzorzec został przełożony na istniejący Leaflet/OpenStreetMap, bez wprowadzania drugiego silnika map.

### Hierarchia, statusy i dane

- Osoby są markerami z miniaturą zdjęcia, jeśli rekord pracownika zawiera bezpieczny URL zdjęcia; przy braku zdjęcia jest czytelny fallback z inicjałami.
- Kolor pierścienia jest zgodny z uzgodnioną semantyką: szary `zaplanowany`, niebieski `w pracy`, zielony `zakończony`, czerwony `nie rozpoczął w czasie`.
- Czerwony alarm pojawia się dopiero po przekroczeniu planowanego START o więcej niż 10 minut. Dokładnie w `+10:00` status pozostaje zaplanowany.
- Osoby są łączone w obiekt wyłącznie przez ten sam, niepusty `clientId`; etykieta tekstowa nie jest używana jako identyfikator korelacji.
- Powiązanie planu z wykonaniem wykorzystuje właściwy `clientId` również z odpowiadającego zdarzenia QR. Test na dzisiejszych danych potwierdził, że zakończone osoby Best Clean są zielone i nie otrzymują fałszywego alarmu.
- Obiekt pokazuje liczbę potwierdzonych i zaplanowanych stref tylko wtedy, gdy istnieje `serviceBlockId` lub `zoneId`. Przy braku tych danych system pokazuje jawne `Strefy: brak danych`, bez zgadywania.
- Dev-only parametr `mapAlarmPreview=1` działa wyłącznie na localhost i służy do kontroli stanu alarmowego. Build produkcyjny usuwa tę gałąź.

### Interakcje i dostępność

- Kliknięcie lub najechanie na obiekt rozwija osoby wokół centralnego markera; ponowne kliknięcie zwija grupę.
- Kliknięcie osoby wybiera marker i otwiera kartę z planem START oraz działającym przejściem `Otwórz zadanie`.
- Filtr czerwonego statusu ukrywa zarówno osobę w grupie, jak i licznik alarmu obiektu; po ponownym włączeniu oba elementy wracają.
- Licznik przy dzwonku pokazuje liczbę aktualnych alarmów mapy.
- Alarm ma łagodną animację, wyłączaną przez `prefers-reduced-motion`.
- Nie pozostały zauważalne problemy P0, P1 ani P2 w kontrolowanym podglądzie.

### Weryfikacja techniczna i granice

- `npm.cmd test`: `237/237` OK.
- Testy polityki mapy i bufora START: `9/9` OK.
- `npm.cmd --prefix web-app run lint`: OK.
- `npm.cmd --prefix web-app run build`: OK; pozostaje istniejące ostrzeżenie Vite o dużych chunkach.
- `node --check` i `git diff --check`: OK; tylko standardowe ostrzeżenia LF/CRLF.
- Sprawdzono na zalogowanym localhost: rozwijanie obiektu, statusy prawdziwych danych Best Clean, kartę alarmu oraz filtr czerwonych markerów.
- Nie zmieniono bazy ani realnych danych firmy. Nie wykonano commita, pusha ani wdrożenia.
- Dodawanie i trwały zapis pliku zdjęcia w edycji pracownika pozostaje osobnym krokiem backendowym; mapa jest już gotowa do wyświetlania zapisanych pól `photoUrl`, `profilePhotoUrl`, `avatarUrl` lub `imageUrl`.

final result: passed

## Aktualny wynik QA - chronologiczny strumień operacji (2026-07-27)

- Pełny raport `Chronologiczny strumień „Operacje na żywo” (2026-07-27)` znajduje się powyżej i obejmuje źródło, viewport, wspólny obraz porównawczy, panel, pełny dialog, kolejność zdarzeń oraz wymagane powierzchnie wierności.
- Dowody końcowe: `output/command-operations-qa-20260727/02-implementation.png`, `output/command-operations-qa-20260727/03-all-operations-modal.png` i `output/command-operations-qa-20260727/04-source-vs-implementation.png`.
- Po końcowym porównaniu nie pozostały problemy P0, P1 ani P2.

final result: passed
