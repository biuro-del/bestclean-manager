# Design QA — wariant 2 „Plan dnia”

- Source visual truth: `C:\Users\rafal\.codex\generated_images\019f8611-d2eb-7520-afe2-15652be5b2cf\call_7hAO21mT0gXXmyVStgbaXjxr.png`
- Implementation URL: `http://localhost:5173/`
- Primary viewport: 1440 × 1024 CSS px
- Source pixels: 1500 × 1004
- Implementation screenshot: `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-implementation-final.png`
- Combined comparison: `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-comparison-final.png`
- Responsive captures:
  - `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-responsive-1180.png`
  - `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-responsive-760.png`
- Density normalization: reference scaled proportionally into a 1440 × 1024 comparison pane; implementation captured at native 1440 × 1024.

## Findings

- No actionable P0, P1 or P2 visual mismatch remains.
- The first-screen hierarchy, two-column plan area, operational map, reaction panel and live operations match the selected direction.
- Differences in counts, object names, map markers and empty plan state are intentional: the implementation renders the current portal data instead of copying demonstration values from the reference.
- The local schedule source currently falls back because the local Google Cloud application-default session is expired. This leaves `Plan dnia` at `0 z 0` and is a local data-source limitation, not a visual regression.

## Interaction QA

- Filters panel opens and closes.
- View control switches between map and list and restores the map.
- `Zobacz wszystkie operacje` opens the full operation dialog; active sessions remain first; the dialog closes correctly.
- `Otwórz kalendarz` navigates to the calendar and the dashboard navigation returns to the first screen.
- Operational map loads tiles and remains interactive after the dashboard finishes loading.
- At 1180 px and 760 px the layout stacks without horizontal page overflow.

## Technical QA

- Focused command-center and service-operation model tests: 17/17 passed.
- Targeted ESLint: passed.
- Production build: passed.
- Targeted `git diff --check`: passed; only existing Windows line-ending warnings remain.
- Browser console: no runtime error; known warnings concern the expired local Google Cloud application-default session and local data fallbacks.

## Comparison history

- Initial pass: blocked by unauthenticated dashboard.
- Authenticated pass: first-screen composition compared side by side; no P0/P1/P2 mismatch found.
- Final pass: map tiles loaded, interactions verified and responsive widths checked.

final result: passed

---

# Design QA — kompaktowa karta logowania Cleanzi

- Source visual truth: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\production-before-1280x720.jpg`
- Implementation URL: `http://127.0.0.1:5173/`
- Implementation screenshot: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\local-final-1280x720.jpg`
- Full-view comparison: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\comparison-production-left-local-right.jpg`
- Focused card comparison: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\comparison-card-focus-production-left-local-right.jpg`
- Viewport and state: niezalogowany ekran portalu, 1280 × 720 CSS px.
- Source and implementation pixels: 1280 × 720.
- Density normalization: bez skalowania; lokalny `devicePixelRatio = 1`, a oba obrazy porównawcze mają identyczny rozmiar pikselowy.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Karta komunikatu zmalała z około 520 × 285 px do około 400 × 167 px. Jej powierzchnia jest mniejsza o około 55%, dlatego nadal odsłania brzuch, biodra i nogi postaci, a tekst jest czytelniejszy.
- Zastąpiono ogólny slogan jednoznacznym komunikatem `SYSTEM DO ZARZĄDZANIA PROCESEM SPRZĄTANIA` oraz krótkim opisem planowania, monitoringu realizacji i kontroli jakości.
- Usunięto trzy drugorzędne etykiety, które powiększały kartę bez dodawania kluczowej informacji.

## Required fidelity surfaces

- Fonts and typography: zachowano rodzinę, wagę i hierarchię Cleanzi; mniejszy nagłówek pozostaje czytelny i mieści się w dwóch liniach.
- Spacing and layout rhythm: karta ma mniejsze wymiary, padding, promień i cień; nie powoduje poziomego przepełnienia.
- Colors and visual tokens: zachowano paletę Cleanzi oraz szklaną kartę; obniżona opacity lepiej odsłania fotografię bez utraty kontrastu tekstu.
- Image quality and asset fidelity: fotografia hero, jej proporcje, ostrość i kadrowanie pozostają bez zmian.
- Copy and content: przekaz opisuje produkt wprost jako system do zarządzania procesem sprzątania.

## Responsive evidence

- 900 × 900: karta około 330 × 118 px, brak poziomego przepełnienia.
- 390 × 844: karta około 250 × 67 px, brak poziomego przepełnienia; fotografia zajmuje mniej miejsca, ale twarz i sylwetka pozostają widoczne.

## Interaction and technical QA

- Główne pola email i hasła oraz przycisk `Zaloguj` są pojedyncze, widoczne i aktywne.
- Konsola lokalnego ekranu logowania: 0 błędów.
- ESLint: passed.
- Production build: passed.
- Pełny zestaw testów: 815/815 passed.

## Comparison history

- Pierwszy wariant po zwężeniu: P2 — nagłówek nadal łamał się na trzy linie, więc karta zajmowała zbyt dużą wysokość i częściowo zasłaniała biodro.
- Fix: po korekcie użytkownika dobrano kompromis 400 px szerokości, nagłówek do 38 px i opis 12 px; drugorzędne etykiety pozostają usunięte.
- Kontrola po poprawce: karta ma około 45% pierwotnej powierzchni, nagłówek mieści się w dwóch liniach, sylwetka pozostaje odsłonięta, a przekaz produktu jest jednoznaczny i wygodniejszy do odczytania.

final result: passed

---

# Design QA — premium ekran logowania

- Source visual truth: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-07baf063-d121-442d-9ff2-55e45f4f09e3.png` oraz wygenerowany asset hero `C:\Users\rafal\.codex\generated_images\019f8611-d2eb-7520-afe2-15652be5b2cf\call_L2yU7OG0REGOqIDdZXAs3E2x.png`.
- Implementation URL: `http://localhost:5174/?jobCardPreview=1`
- State: publiczny ekran logowania, pola gotowe do użycia, brak widocznego błędu.
- Primary viewport: 1536 × 912 CSS px, density 1.
- Source pixels: 1515 × 893; przed porównaniem proporcjonalnie znormalizowane do 768 × 456.
- Implementation screenshot: `C:\Users\rafal\Desktop\app to react\design-qa-login-desktop.png` (1536 × 912 px).
- Mobile screenshot: `C:\Users\rafal\Desktop\app to react\design-qa-login-mobile.png` (390 × 844 px).
- Combined comparison: `C:\Users\rafal\Desktop\app to react\design-qa-login-comparison.png` (1536 × 500 px).

## Findings

- Nie pozostała żadna rozbieżność P0, P1 ani P2.
- Typografia: hierarchia nagłówka, opisu, etykiet i CTA jest czytelna na desktopie i telefonie; zastosowane wagi i interlinie nie powodują obcięć ani niekontrolowanego zawijania.
- Rytm i układ: desktop zachowuje proporcję 58/42 między zdjęciem i formularzem, a mobile składa sekcje pionowo bez poziomego overflow.
- Kolory: granat, błękit i mięta pozostają zgodne z identyfikacją Cleanzi; kontrast pól, CTA i tekstów jest wystarczający.
- Obraz: dedykowany asset WebP ma 1536 × 1024 px i 87 774 B, jest ostry w obu kadrach i nie zawiera napisów ani obcych znaków.
- Copy: ekran komunikuje centrum operacyjne, a nie ogólny formularz; surowy komunikat `Dashboard feature is not initialized.` nie jest już pokazywany użytkownikowi.
- P3: na bardzo szerokich monitorach można w przyszłości delikatnie zwiększyć maksymalną szerokość panelu narracyjnego, ale nie jest to potrzebne do akceptacji.

## Full-view comparison evidence

- Porównanie `PRZED / PO` potwierdza zastąpienie małej ilustracji pełnowartościowym zdjęciem, poprawę hierarchii marki, usunięcie agresywnego półpanelu w jednolitym błękicie i uspokojenie formularza.
- Wersja mobilna mieści zdjęcie, komunikat i cały formularz w 390 × 844 px bez przewijania poziomego.
- Focused region comparison nie był potrzebny: formularz i tekst hero pozostają czytelne w pełnym widoku przy natywnej gęstości 1.

## Interaction and technical QA

- Pola email i hasła oraz przycisk `Zaloguj` przechodzą ze stanu sprawdzania sesji do aktywnego stanu.
- Dedykowany świeży start karty nie wygenerował błędów w konsoli.
- Obraz hero jest załadowany przed zakończeniem kontroli ekranu.
- Targeted ESLint: passed.
- Production build: passed.
- Desktop overflow X: 0 px.
- Mobile overflow X: 0 px.

## Comparison history

- Pierwsza kontrola mobilna: P2 — siatka centrowała dwie sekcje i zostawiała pusty pasek nad zdjęciem.
- Fix: dodano jawne wiersze siatki i `align-content: start` dla szerokości poniżej 920 px.
- Kontrola po poprawce: zdjęcie zaczyna się od górnej krawędzi, formularz pozostaje w całości dostępny, overflow X wynosi 0.

final result: passed

---

# Design QA — logo i baner logowania Cleanzi

## Zakres

- Widok: ekran logowania portalu Cleanzi.
- Stan: użytkownik niezalogowany, formularz pusty.
- Źródła:
  - `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-0147107a-6048-436c-b9e5-afa56a8f1407.png` — logo wzorcowe, 309 × 120 px.
  - `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-af96d254-6249-4f51-a530-3eae59697b8d.png` — wcześniejszy baner, 565 × 303 px.
- Implementacja: `http://127.0.0.1:5174/`.

## Dowody implementacji

- `design-qa-assets/login-desktop-1440x900.png`
- `design-qa-assets/login-tablet-900x900.png`
- `design-qa-assets/login-mobile-390x844.png`
- `design-qa-assets/login-compact-760x650.png`

Źródła i aktualne zrzuty zostały ocenione wspólnie w jednym porównaniu wizualnym.

## Sprawdzone powierzchnie

1. **Kompozycja:** baner ma stabilne położenie, nie zasłania twarzy ani formularza; na niskim ekranie część wizualna jest ukrywana.
2. **Typografia:** nagłówek skaluje się płynnie i na dużym oraz tabletowym ekranie zajmuje dwa wiersze zamiast czterech.
3. **Branding:** ten sam plik logo jest używany na ekranie logowania, w karcie logowania, w menu portalu, w eksporcie zdarzeń i jako ikona strony.
4. **Responsywność:** zweryfikowano 1440 × 900, 900 × 900, 390 × 844 i 760 × 650.
5. **Czytelność i kontrast:** półprzezroczyste ciemne tło, jasny tekst i ograniczona szerokość akapitu zachowują czytelność na zdjęciu.

## Historia usterek

- **P2 — nagłówek łamał się na cztery wiersze:** naprawiono przez zwiększenie szerokości karty, usunięcie sztywnego łamania oraz zastosowanie płynnej skali typografii i `text-wrap: balance`.
- **P2 — znak marki nachodził na twarz w widoku tabletowym:** naprawiono przez ukrycie dodatkowej etykiety i zmniejszenie obszaru logo dla szerokości do 920 px.
- **P2 — branding był niespójny:** widoczne użycia starego logo zostały zastąpione jednym źródłowym assetem.

## Kontrole techniczne

- Konsola przeglądarki: brak ostrzeżeń i błędów.
- Lint: zakończony poprawnie.
- Build produkcyjny portalu: zakończony poprawnie; pozostają wyłącznie istniejące ostrzeżenia o rozmiarze części paczek.

## Wynik

passed

---

# Design QA — główny komunikat banera logowania

- Source visual truth: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-c2313690-618c-41d3-b395-169ab77b141c.png` (407 × 36 px).
- Implementation URL: `http://127.0.0.1:5174/`.
- Desktop evidence: `design-qa-assets/login-hierarchy-desktop-1440x900.png` (1440 × 900 px).
- Mobile evidence: `design-qa-assets/login-hierarchy-mobile-390x844.png` (390 × 844 px).
- State: publiczny ekran logowania, pusty formularz.
- Density normalization: natywne zrzuty przy `devicePixelRatio = 1`; referencja była wycinkiem badanego nagłówka.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Typografia: komunikat `SYSTEM DO ZARZĄDZANIA FIRMĄ SPRZĄTAJĄCĄ` ma 36,72 px na desktopie i 22,62 px na telefonie, przez co jednoznacznie dominuje nad pozostałą treścią.
- Rytm i układ: główny komunikat mieści się w dwóch wierszach; wspierające hasło ma mniejszą skalę, a opis operacyjny znika na telefonie.
- Kolory: biały komunikat główny ma najwyższy kontrast; miętowy tekst wspierający zachowuje identyfikację Cleanzi bez konkurowania z nagłówkiem.
- Obraz: fotografia, logo i kadrowanie pozostały bez zmian i bez utraty ostrości.
- Copy: hierarchia odpowiada intencji użytkownika — najpierw kategoria produktu, potem korzyść i dopiero na końcu szczegóły.
- Mobile: brak poziomego przepełnienia.

## Comparison history

- P2 w referencji: nazwa kategorii produktu była najmniejszym elementem banera i nie pełniła roli głównego komunikatu.
- Fix: przeniesiono ją do semantycznego nagłówka, zwiększono skalę i wagę; dotychczasowe hasło przeniesiono do roli wspierającej.
- Kontrola po poprawce: desktop i telefon pokazują tę samą hierarchię bez obcięć, nakładania ani niekontrolowanego łamania.
- Źródło i oba zrzuty implementacji oceniono wspólnie w jednym porównaniu wizualnym; dodatkowe zbliżenie nie było potrzebne, ponieważ główny tekst jest czytelny w pełnym widoku.

## Kontrole techniczne

- Konsola przeglądarki: 0 ostrzeżeń i 0 błędów.
- Lint: zakończony poprawnie.
- Build produkcyjny portalu: zakończony poprawnie; pozostały wyłącznie istniejące ostrzeżenia o rozmiarze części paczek.

final result: passed

---

# Calendar Variant 3 — planowanie obsady i Dziś na żywo

## Zakres

- Branch: `codex/calendar-staffing-live-20260731`.
- Widok: lokalny kalendarz portalu Cleanzi, domyślnie planowanie tygodniowe.
- Źródło kierunku wizualnego: wybrany przez użytkownika wariant 3 — bufor nieobsadzonych, macierz pracowników i dni oraz przypięty panel bieżącej realizacji.
- Implementacja lokalna: `http://127.0.0.1:5174/`.

## Sprawdzone powierzchnie

1. **Bufor nieobsadzonych:** osobny, czytelny obszar dla wystąpień bez pracownika; karta ma alternatywę kliknięcia/klawiatury poza przeciąganiem.
2. **Macierz tygodnia:** pracownicy pozostają widoczni także wtedy, gdy nie mają jeszcze zlecenia, aby mogli być poprawnym celem DnD.
3. **DnD:** przeniesienie zachowuje godzinę zlecenia i zmienia dzień zgodnie z wybraną komórką; komórka pozostaje celem również nad istniejącą kartą.
4. **Dziś na żywo:** dane dnia bieżącego są niezależne od aktualnie oglądanego tygodnia; aktywne i wymagające uwagi operacje są nad zakończonymi, a pełna lista rozwija się na żądanie.
5. **Korelacja:** potwierdzenie związku plan–realizacja wymaga stabilnych ID i zgodnej daty wystąpienia; podobna nazwa, opis lub godzina nie wystarczają.
   Sprzeczny identyfikator tego samego typu (`task`, `block`, `allocation`, `workslot`) jest twardym veto dla korelacji.
6. **Widoki klasyczne:** `Dzień` i `3 dni` nie otrzymują dodatkowych realnych pasków usług, więc nie dublują istniejących torów czasu pracy.
7. **Publikacja:** kontrolka publikacji jest świadomie nieaktywna do czasu dostarczenia bezpiecznego, wersjonowanego endpointu z obsługą konfliktów; interfejs jawnie informuje o natychmiastowym zapisie przypisań i przyczynie blokady publikacji.
8. **Puste i niepełne dane:** bufor rozróżnia brak planu od pełnej obsady, a panel live pokazuje ostrzeżenie, gdy część źródeł nie została pobrana.
9. **Responsywność:** przy 1024 i 768 px nagłówek składa się pionowo, a macierz i live pozostają dostępne jeden pod drugim; szerokie tabele mają własne przewijanie.
10. **Gęstość desktopowa:** od 1200 px kalendarz ma kompaktowe odstępy, kontrolki i wiersze odpowiadające w przybliżeniu pracy przy powiększeniu Chrome 80%, bez użycia `zoom`, `transform: scale()` ani skalowania pozostałych modułów portalu.

## Ocena jakości

- Hierarchia oddziela planowanie przyszłości od realizacji bieżącego dnia.
- Kolory i statusy mają znaczenie operacyjne, a nie dekoracyjne.
- Interakcje widoczne w interfejsie odpowiadają rzeczywistym funkcjom; nie dodano pozornej publikacji ani korelacji opartej na zgadywaniu.
- Układ zachowuje dostęp do bufora, pracowników i operacji live bez konieczności zmiany modułu.
- `artifacts/` i `design-qa-assets/` pozostają poza zakresem kandydata.

## Stan kontroli

- Kontrakt i kierunek interfejsu: passed.
- Kontrola przeglądarkowa: render tygodnia bez ucięcia; macierz zawiera 57 pracowników, w tym wolnych 0h; pełna obsada zgłasza czytelny komunikat; publikacja pozostaje zablokowana i ma widoczny opis; panel live jest odrębny od planowanego tygodnia.
- Pomiar 1885, 1024 i 768 px: przy 1024/768 nagłówek ma pełną szerokość, macierz i live układają się pionowo, a ich szerokie dane przewijają się wewnętrznie. Istniejący globalny nagłówek portalu (`header-right`) nadal powiększa dokument o 65 px przy 768 px; nie pochodzi to z kalendarza i pozostaje poza zakresem tego kandydata.
- Pomiar gęstości przy 1885 i 1440 px: wiersz pracownika ma 56 px zamiast bazowych 70 px, panel `Dziś na żywo` 166 px zamiast 202/203 px, a w macierzy widać jednocześnie 6 pracowników. Przy 1024 i 768 px reguła desktopowa nie jest aktywna, więc dotychczasowe zachowanie responsywne pozostaje bez zmian.
- Porównanie wzorca i implementacji na wspólnym obrazie: passed. Zachowano najważniejszą hierarchię wariantu 3 (bufor, macierz tygodnia, przypięte live), przy czym lokalny ekran świadomie pokazuje prawdziwe dane i stan pełnej obsady zamiast demonstracyjnych kart.
- Walidacja techniczna: pełne `npm test` 860/860 po zmianach logiki i gęstości; finalne testy wariantu 3 14/14, lint, build i `git diff --check` zakończone poprawnie. Nieblokujące ostrzeżenia dotyczą rozmiaru istniejących paczek i LF -> CRLF.
- Brak wdrożenia produkcyjnego, zmian bazy danych i zapisów backendowych.

result: passed

---

# Calendar Variant 3 — finalne porównanie 1:1

## Źródła

- Referencja: `K:\Mój dysk\Aplikacja\DEMO - ekrany\exec-17b5e40d-92cb-40cf-84c6-42d01b7bf892.png` (1487 × 1058 px).
- Implementacja: `http://127.0.0.1:5174/`.
- Finalny render: `artifacts/calendar-reference-fidelity-final.png` (1487 × 1058 px).
- Porównanie na jednej planszy: `artifacts/calendar-reference-comparison.png`.

## Pomiary końcowe

| Powierzchnia | Implementacja |
|---|---:|
| Sidebar | 235 px |
| Główna treść | 1205 px |
| Hero | 1205 × 83 px |
| Bufor zadań | 311 × 532 px |
| Macierz tygodnia | 878 × 532 px |
| Toolbar macierzy | 39 px |
| Kolumna pracownika | 161 px |
| Wiersz pracownika | 64 px |
| Panel `Dziś na żywo` | 1203 × 299 px |

## Werdykt

- Układ, proporcje, rytm, wysokości sekcji i gęstość informacji odpowiadają zatwierdzonemu projektowi w natywnym widoku 1487 × 1058 px.
- Zachowano dane rzeczywiste Best Clean. Referencja zawiera dane demonstracyjne, dlatego nazwy zleceń, obsada, kolory kart i statusy live nie są kopiowane sztucznie.
- Nie zmieniono bezpiecznej logiki korelacji, zachowania DnD ani blokady publikacji niewersjonowanego planu.
- Wspólna plansza referencja/implementacja została oceniona bez aktywnych problemów P0, P1 ani P2.

## Kontrole techniczne

- Testy kontraktowe kalendarza: 14/14.
- Pełny zestaw testów: 860/860.
- Lint: passed.
- Build portalu: passed; wyłącznie istniejące ostrzeżenie o rozmiarze części chunków.
- `git diff --check`: passed; wyłącznie informacyjne ostrzeżenia LF → CRLF.
- Brak wdrożenia produkcyjnego, zmian bazy, stage, commita i pusha.

final result: passed

---

# Calendar Variant 3 - finalny szlif kluczowego modulu

## Zakres kontroli

- Zachowano zatwierdzony uklad 1:1: bufor zadan, macierz obsady i panel `Dzis na zywo`.
- Nie zmieniono kontraktow danych, bezpiecznej korelacji po stabilnych ID, logiki DnD ani blokady niewersjonowanej publikacji.
- Zmiany obejmuja wyłącznie czytelnosc stanow, zachowanie interfejsu po odswiezeniu, responsywnosc, dostepnosc i precyzje geometrii.

## Poprawione detale

- Stan filtrow, wyszukiwania, zwijania, przewijania i fokusu jest odtwarzany po ponownym renderze kalendarza.
- Przycisk publikacji ma jednoznaczny stan nieaktywny, a przycisk wspomagania uczciwa etykiete `Pokaz braki obsady`.
- Naglowek `Dzis na zywo` odzyskal dwuwierszowa hierarchie i miesci sie w wysokosci 40 px zgodnej ze wzorcem.
- Macierz tygodnia przewija sie wewnetrznie; naglowki dni i kolumna pracownika pozostaja przyklejone.
- Panel konfliktu pozostaje dostepny ponizej 1440 px zamiast znikac.
- Widoki 1200, 1024, 768 i 390 px ukladaja sekcje pionowo, bez odbierania dostepu do danych lub dzialan naprawczych.
- Sterowanie klawiatura obsluguje Escape, przywraca fokus, ma widoczny focus ring i respektuje ograniczenie animacji.
- Cele dotykowe najwazniejszych kontrolek maja co najmniej 40 px na telefonie.
- Pusty wynik filtrow i aktualny licznik widocznych zadan sa komunikowane w interfejsie.
- Przelaczanie `Dzien` / `Tydzien` zachowuje wybrana date i nie cofa planisty do dzisiejszego dnia.
- Przy 768 i 390 px dokument oraz toolbar kalendarza nie maja poziomego overflow; przy 390 px wszystkie widoczne kontrolki kalendarza przechodza prog 40 px.

## Weryfikacja

- Wspolna plansza wzorzec/implementacja: `artifacts/calendar-final-comparison.png`.
- Finalne renderingi: `design-qa-assets/calendar-final-01-1487-full.png`, `calendar-final-02-1200-clip.png`, `calendar-final-03-1024.png`, `calendar-final-04-768.png` i `calendar-final-05-390.png`.
- Kontrola przegladarkowa: 1487, 1200, 1024, 768 i 390 px; ustawienia zamykaja sie klawiszem Escape i oddaja fokus, bufor poprawnie sie zwija i rozwija, a wybrany tydzien pozostaje zachowany po zmianie widoku.
- Testy kontraktowe kalendarza: 18/18 passed.
- Lint aplikacji webowej: passed.
- Build portalu: passed; pozostaje jedynie istniejace ostrzezenie Vite o rozmiarze czesci chunkow.
- `git diff --check`: passed; wyłącznie informacyjne ostrzezenia LF -> CRLF.
- Pelny `npm test` przekroczyl limit 120 s procesu kontrolnego; ukierunkowany zestaw kalendarza zakonczyl sie poprawnie.
- Lokalny backend okresowo zwraca niepelne dane przez brak pelnej lokalnej konfiguracji bazy; nie jest to blad warstwy wizualnej kalendarza i nie zostal zamaskowany danymi demonstracyjnymi.
- Brak stage, commita, pusha, wdrozenia, migracji i zmian danych produkcyjnych.

final result: passed

---

# Kalendarz - kontrolki bez kolizji i 30 najświeższych operacji

## Źródła prawdy wizualnej

- Bufor zadań: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-ba6b74aa-1582-4b7f-b216-4d1245fcd732.png` (369 x 194 px).
- Pasek tygodnia: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-f9ddfe7b-cb81-4803-8552-efb2a3b1a1c4.png` (1247 x 75 px).
- Panel operacji: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-59b5206f-47fd-46a7-a9d2-644eb3f729b9.png` (285 x 99 px).
- Implementacja po poprawkach: `design-qa-assets/calendar-controls-responsive-after.png` (1265 x 712 px).
- Kontrola wykonana w zalogowanym widoku tygodniowym Best Clean przy viewport 1280 x 720 CSS px i DPR 1.

## Wykryte problemy

- Trzy filtry bufora konkurowały o szerokość w panelu 311 px i ich etykiety nachodziły na siebie.
- Natywne przyciski przewijania paska tygodnia wyglądały jak dodatkowe strzałki przy ustawieniach.
- Nawigacja, zakres tygodnia, przełącznik widoku i ustawienia nie miały stabilnych, niezależnych kolumn przy węższym desktopie.
- Panel operacji ograniczał widok do 6 elementów i nie traktował czasu zakończenia jako świeżości zakończonej operacji.

## Zastosowane poprawki

- Filtry bufora otrzymały trzy mierzone kolumny siatki, kontrolowane odstępy, elipsę i pełną szerokość pól.
- Pasek tygodnia rozdzielono na cztery stabilne obszary, ukryto niepotrzebne pole daty i natywne przyciski scrollbara.
- Na starcie wyświetlanych jest maksymalnie 30 pozycji; aktywne sesje pozostają nad pozostałymi, a w każdej grupie najnowsze zdarzenia są wyżej.
- Dla zakończonych operacji świeżość wyznacza STOP, dla aktywnych START, a dla oczekujących planowana godzina rozpoczęcia.
- Przycisk `Pokaż wszystkie (X)` pojawia się tylko wtedy, gdy operacji jest więcej niż 30.

## Porównanie i dowody po poprawkach

- Pełny widok oraz oba wskazane wycinki zostały zestawione w jednym wejściu porównawczym; po poprawkach kontrolki nie nachodzą na siebie i zachowują hierarchię zatwierdzonego projektu.
- W aktualnych danych widoku było 14 operacji: żadna nie była ukryta i przycisk rozwijania celowo się nie pojawił.
- Typografia, kolory, obramowania i istniejące ikony pozostały zgodne z systemem wizualnym; zmieniono wyłącznie geometrię kontrolek i tekst akcji na `Pokaż wszystkie`.
- Konsola przeglądarki nie zawierała błędów aplikacji.
- Test kontraktowy obejmuje limit 30, reguły świeżości, etykietę rozwijania oraz zabezpieczenia geometrii obu problematycznych obszarów.

## Kontrole techniczne

- Testy kontraktowe kalendarza: 18/18 passed.
- Build portalu: passed; wyłącznie istniejące ostrzeżenie Vite o rozmiarze części chunków.
- Brak zmian produkcyjnych, migracji bazy, zapisu danych firmy, stage, commita i pusha.

final result: passed

---

# Dodaj zlecenie - spojny proces planu zespolu i Karty Zlecenia

## Zakres kontroli

- Zachowano istniejacy system wizualny portalu i trzyetapowy model formularza.
- Jeden formularz prowadzi przez: `Klient i obiekt`, `Termin i obsada` oraz `Zakres i publikacja`.
- Karta Zlecenia powstaje z tych samych danych; uzytkownik nie przepisuje drugi raz klienta, obiektu, planu, obsady ani zakresu.
- Zapis i publikacja sa rozdzielone komunikacyjnie: zapis tworzy plan oraz edytowalny szkic Karty, publikacja ma udostepnic pracownikom niezmienna rewizje.

## Poprawione zachowania

- Nowe zlecenie nie wybiera juz domyslnie klienta jednorazowego; decyzja o kliencie jest jawna.
- Naglowek, kroki, podsumowanie i stopka pokazuja kontekst planowania, stan szkicu i nastepny skutek dzialania.
- Brakujaca obsada jest opisana jako miejsce kierowane do BUFORA, z poprawna odmiana dla jednego miejsca.
- Przejscie wstecz nie jest blokowane walidacja kolejnych krokow; walidacja dziala przy przejsciu naprzod.
- Wszystkie zmiany pol, obsady, zmian, zadan, stref i wyposazenia oznaczaja formularz jako niezapisany.
- Zamkniecie formularza, Escape i powrot do listy uruchamiaja wlasny dialog ochronny. Odrzucenie zmian usuwa nowy szkic albo odtwarza migawke edytowanego zlecenia.
- Zapis ma stan zajetosci i blokade podwojnego wyslania.
- Uklad zachowuje czytelnosc i priorytet glownej akcji na desktopie oraz sklada stopke i naglowek na mniejszych szerokosciach.

## Porownanie i dowody

- Wspolny obraz przed/po: `design-qa-assets/job-order-flow-20260801/05-before-after-comparison.png`.
- Finalne stany: `01-new-step-client-object.png`, `02-new-step-schedule-buffer.png`, `03-new-step-scope-publish.png` oraz `04-unsaved-changes-guard.png` w tym samym katalogu.
- Porownanie potwierdza prostszy start bez przypadkowego klienta, jasniejsza hierarchie, wyrazny BUFOR oraz czytelne rozdzielenie zapisu od publikacji.
- Test przegladarkowy wykonano na `http://127.0.0.1:5174/` bez zapisu i bez publikacji danych.

## Kontrole techniczne

- Testy kontraktowe formularza i kalendarza: 29/29 passed.
- Build portalu: passed; pozostaje jedynie istniejace ostrzezenie Vite o rozmiarze czesci chunkow.
- `git diff --check`: passed; wylacznie informacyjne ostrzezenia LF -> CRLF.
- Brak zmian produkcyjnych, migracji bazy, zapisu danych firmy, stage, commita i pusha.

final result: passed

---

# Dodaj zlecenie V2 - kontrola finalnego kreatora

## Zrodla porownania

- Widok zrodlowy starego modalu: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-c77c4774-7139-4520-b09d-420c9d175f19.png`.
- Aktualny kreator V2: `design-qa-assets/order-create-v2-20260801/order-create-v2-current.png`.
- Wspolne porownanie przed/teraz: `design-qa-assets/order-create-v2-20260801/source-vs-v2.png`.
- Kontrola wykonana w zalogowanym portalu Best Clean przy viewport 1504 x 872 CSS px.

## Wynik kontroli wizualnej

- Stary trzyetapowy modal zostal zastapiony pelnym obszarem roboczym w powloce portalu.
- Piec krokow ma czytelna kolejnosc, jednoznaczny aktywny stan i nie konkuruje z trescia formularza.
- Centralna kolumna zachowuje przestrzen na dane operacyjne, a stale podsumowanie po prawej pokazuje gotowosc bez zaslaniania pol.
- Dolny pasek akcji pozostaje widoczny i wyraznie rozdziela zapis szkicu od przechodzenia do kolejnego kroku.
- Typografia, kolory, promienie, obramowania i kontrolki sa zgodne z istniejacym systemem wizualnym portalu.
- Na porownaniu nie stwierdzono nakladania kontrolek, przypadkowego kadrowania ani utraty waznych elementow.

## Kontrola zachowania

- Globalny przycisk `Dodaj zlecenie` otwiera kreator V2; stary modal nie pojawia sie w sciezce tworzenia.
- Sprawdzono wybor obiektu oraz przejscia do `Zasady` i `Zakres prac`.
- Proba przejscia do `Obsada` bez wymaganej nazwy uslugi zostala poprawnie zatrzymana komunikatem walidacyjnym.
- Nie uzyto `Zapisz szkic` ani `Opublikuj`; test byl w calosci bez zapisu danych.
- Konsola po otwarciu i przejsciu przez kreator: 0 bledow, 0 ostrzezen.

## Kontrole techniczne

- Pelny zestaw testow: 897/897 passed.
- Lint aplikacji webowej: passed.
- Build portalu: passed; pozostaje tylko istniejace ostrzezenie Vite o rozmiarze czesci chunkow.
- `git diff --check`: passed; wylacznie informacyjne ostrzezenia LF -> CRLF.
- Brak migracji, zmian produkcyjnych, zapisu danych firmy, stage, commita, pusha i wdrozenia.

final result: passed

---

# Dodaj zlecenie V2 - widoczne wymagania krokow

## Problem i cel

- Poprzedni widok podawal laczna liczbe brakow z calego kreatora, ale nie wyjasnial, co blokuje aktualny krok.
- Po kliknieciu `Dalej` uzytkownik otrzymywal jedynie maly komunikat w stopce bez wskazania pola.
- Celem bylo pokazanie wymaganych danych przed proba przejscia oraz jednoznaczne prowadzenie do pierwszego braku.

## Wynik kontroli

- Nad zawartoscia kazdego kroku widoczna jest zwarta lista wymaganych elementow tylko dla tego kroku.
- Pola obowiazkowe maja lokalne oznaczenia, a elementy alternatywne jasno komunikuja warunek, np. opis dostepu albo potwierdzenie braku zasad.
- Podsumowanie pokazuje oddzielnie braki biezace i przyszle; pozycje biezace sa aktywnymi skrotami do kontrolek.
- Po kliknieciu `Dalej` komunikat zmienia hierarchie na alarmowa, kontrolki otrzymuja stan bledu, a fokus trafia do pierwszego brakujacego potwierdzenia.
- Po uzupelnieniu dwoch brakow kroku `Zakres prac` stan zmienia sie na kompletny i kreator przechodzi do `Obsada`.
- Uklad zachowuje czytelnosc w waskim widoku: lista wymagan zawija sie, etykiety nie nakladaja sie na pola, a glowna akcja pozostaje widoczna.

## Kontrole techniczne

- Testy kontraktowe kreatora: 8/8 passed.
- Lint aplikacji webowej: passed.
- Build portalu: passed; jedynie istniejace ostrzezenie Vite o rozmiarze czesci chunkow.
- Kontrola przegladarkowa wykorzystala wylacznie fikcyjne dane i nie zapisala ani nie opublikowala zlecenia.
- Brak migracji, zmian produkcyjnych, stage, commita i pusha.

final result: passed

---

# Dodaj zlecenie V2 - zapis roboczego zlecenia

## Odtworzenie problemu

- W kroku `Obiekt` mozna bylo wybrac `Best Clean`, ale proba zapisu konczyla sie komunikatem `Wybierz obiekt zapisany w organizacji.`.
- Po usunieciu pierwszej niespojnosci backend ujawnil blad PostgreSQL `inconsistent types deduced for parameter $1` podczas zapisu odlaczonego szkicu.

## Przyczyna i poprawka

- Widok ponownie dodawal klienta bez adresu jako obiekt, lecz adapter zapisu odfiltrowywal ten sam rekord. Ujednolicono zrodlo obiektow: brak adresu nie usuwa obiektu, tylko pozostaje widocznym brakiem przed realizacja.
- Parametry `org_id` i `source_order_id` sa teraz jawnie typowane w zapytaniu `job_card_draft`, lacznie z podzapytaniem numeru bazowej rewizji.
- Dolne akcje maja rozlaczne nazwy: `Zapisz robocze zlecenie` oraz `Zatwierdz i wyslij do realizacji`.

## Wynik kontroli

- Przeklikano pelny proces: obiekt, zasady, zakres ze strefa i zadaniem, bufor obsady oraz zatwierdzenie.
- Robocze zlecenie `Test zapisu roboczego zlecenia` zostalo zapisane o 20:49.
- Nie kliknieto akcji wyslania do realizacji; szkic nie utworzyl aktywnego zadania ani wystapienia kalendarza.

## Kontrole techniczne

- Testy domeny, API i kreatora: 47/47 passed.
- Lint aplikacji webowej: passed.
- Build portalu: passed; jedynie istniejace ostrzezenie Vite o rozmiarze czesci chunkow.
- Brak migracji, stage, commita, pusha i wdrozenia.

final result: passed
