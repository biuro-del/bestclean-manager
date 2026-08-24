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

# Design QA — punktowa edycja zdarzeń czasu pracy

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-97370a8b-0bd5-49da-97a8-058bc87225b4.png` (850 × 809 px).
- Implementation URL: `http://localhost:5174/`.
- Implementation screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\work-time-editor-implementation.png` (1280 × 720 px).
- Combined comparison: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\work-time-editor-comparison.png`.
- State: modal dnia 23.07.2026 z rozwiniętą edycją pojedynczego zdarzenia CLEAN.
- Density: natywny zrzut przeglądarki przy `devicePixelRatio = 1`.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Modal został poszerzony do maksymalnie 820 px i nie ma poziomego przewijania.
- Usunięto zbiorcze akcje „Edytuj START, STOP i strefy”, „Edytuj sesję” oraz sekcję „Naprawa i dane dnia”.
- Każdy START, STOP i wpis operacyjny ma własne menu trzech pionowych kropek umieszczone bezpośrednio obok wskaźnika GPS.
- Formularz rozwija się pod wybranym wpisem, zachowuje kontekst klienta i strefy oraz nie przesuwa pozostałych pól poza modal.
- Hierarchia, kolory, promienie i znaczniki START/STOP pozostają zgodne z dotychczasowym wyglądem Cleanzi.
- Na wąskich ekranach pola edycji przechodzą do jednej kolumny bez poziomego overflow.

## Interaction and technical QA

- Kliknięcie menu zamyka inny otwarty edytor i otwiera wyłącznie formularz wskazanego wpisu.
- `Anuluj`, przycisk zamknięcia i `Escape` zamykają lokalny formularz bez zapisu.
- `Zapisz zmianę` waliduje wybrany wpis i od razu wysyła jego korektę; nie wymaga drugiego globalnego zapisu.
- Automatyczny powód audytu pozostaje po stronie aplikacji, więc użytkownik nie musi uzupełniać dodatkowej sekcji naprawy.
- Konsola renderowanego podglądu: 0 błędów.
- ESLint: passed.
- Pełny zestaw testów: 522/522 passed.
- Production build: passed; wyłącznie istniejące ostrzeżenia o rozmiarze części paczek.

## Comparison history

- P2 w referencji: trzy równoległe sposoby edycji powodowały nakładanie pól, poziomy scrollbar i niejasny proces zapisu.
- Fix: edycję sprowadzono do jednego punktowego menu przy rekordzie, a modal poszerzono bez zmiany stylu kart.
- Kontrola po poprawce: pełny i zbliżony widok potwierdzają czytelny układ, poprawne odstępy, brak nachodzenia oraz jednoznaczny przycisk „Zapisz zmianę”.

final result: passed

---

# Design QA — modal START/STOP pracownika (03.08.2026)

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-f6ffe7cf-bc05-4b93-9c2e-92959b167c37.png` (567 × 387 px).
- Implementation: modal `#waTimeCodesOverlay` w portalu lokalnym `http://localhost:5174/`.
- Implementation screenshot: niedostępny — przeglądarka poprawnie wyrenderowała DOM, lecz każda próba `Page.captureScreenshot` przekroczyła limit czasu.
- Viewport pomiarowy: 1280 × 720 px, `devicePixelRatio = 1`; kontrola responsywna: 375 × 667 px.
- Stan: jedna zamknięta sesja, dwa kody START/STOP, bez problemów integralności.

## Dowody z renderu

- Modal: 560 × 403 px; nagłówek: 510 × 44 px.
- Każdy wiersz START/STOP: 510 × 76 px.
- Pasek łącznego czasu: 510 × 58 px; obszar akcji: 510 × 38 px.
- Przy szerokości 375 px dokument, modal i oba wiersze miały `scrollWidth === clientWidth`; brak poziomego przepełnienia.
- DOM potwierdził kolejno: tytuł, liczbę kodów, osobny START, osobny STOP, jeden łączny czas i przycisk `Gotowe`.

## Findings

- Typografia i copy: tytuł oraz etykiety odpowiadają wzorcowi; czas pozostaje dokładny w `HH:MM:SS`, zgodnie z kontraktem rozliczeń.
- Rytm i układ: wysokości wierszy oraz paska czasu odpowiadają proporcjom źródła; naprawa dnia jest schowana w zwijanym panelu i pojawia się tylko wtedy, gdy zapis jest dostępny i potrzebny.
- Kolory: zachowane semantyczne zielone START, czerwone STOP, niebieski pasek sumy i fioletowa akcja `Gotowe`.
- Obrazy i assety: wzorzec nie zawiera obrazów rastrowych; ikony pochodzą z istniejącego systemu komponentów portalu.
- Responsywność: pomiary nie wykazały poziomego przepełnienia na telefonie.
- Bloker: brak zrzutu implementacji uniemożliwia wymagane wspólne porównanie pikselowe źródła i renderu.

## Comparison history

- P1 przed poprawką: modal pokazywał połączone karty sesji, dwa konkurencyjne podsumowania i stale widoczne narzędzia naprawy.
- Fix: przywrócono osobne wiersze kodów START/STOP, jeden pasek `Łączny czas pracy`, kompaktową szerokość 560 px oraz pojedynczy przycisk `Gotowe` w zwykłym podglądzie.
- Kontrola po poprawce: kontrakt DOM i pomiary układu przeszły; pikselowe porównanie pozostaje zablokowane przez błąd przechwytywania zrzutu.

final result: blocked

---

# Design QA — przycisk „Zaloguj się przez Google” (2026-07-31)

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-66cdba5f-29d0-4165-adf5-961e21d74d4f.png`.
- Source pixels: 320 × 89 px; widoczny przycisk około 285 × 69 px.
- Implementation URL: `http://localhost:5174/`.
- Implementation full screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\login-screen-google-button.png`.
- Implementation focused screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\google-button-implementation.png`.
- Mobile screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\login-google-mobile.png`.
- Desktop viewport: 1280 × 720 CSS px, density 1; przycisk 311.59 × 64 px.
- Mobile viewport: 390 × 844 CSS px, density 1; przycisk 312 × 64 px, bez poziomego overflow.
- State: publiczny formularz logowania, przycisk widoczny i aktywny.

## Findings

- Brak rozbieżności P0, P1 i P2 w zakresie wskazanego komponentu.
- Fonts and typography: 16 px, waga 600, czarny tekst; dłuższa polska etykieta zachowuje czytelność i nie zawija się.
- Spacing and layout rhythm: kapsułowy promień, wysokość 64 px, logo 24 px i odstęp 13 px odpowiadają proporcjom wzorca.
- Colors and visual tokens: białe tło oraz cienkie obramowanie `#747775` odpowiadają neutralnej stylistyce Google; focus używa czytelnego niebieskiego obrysu.
- Image quality and asset fidelity: prawdziwy wielokolorowy znak Google jest pobierany z `gstatic.com`; renderuje się ostro w rozmiarze 24 × 24 px i nie został zastąpiony literą ani rysunkiem CSS.
- Copy and content: zachowano jednoznaczną polską akcję „Zaloguj się przez Google”.

## Comparison evidence

- Focused comparison otworzył źródło i kadr implementacji razem. Kształt, obramowanie, białe tło, wyśrodkowanie znaku oraz rytm ikona–tekst są zgodne; różnica szerokości wynika z dłuższej polskiej etykiety i jest akceptowalna.
- Pełny widok potwierdza spójność komponentu z kartą logowania Cleanzi.
- Wersja mobilna nie zawija tekstu i nie powoduje overflow.

## Interaction and technical QA

- Przycisk ma pojedynczą nazwę dostępną, jest widoczny i aktywny.
- Zachowano istniejący handler Google Auth; zmiana dotyczy wyłącznie znacznika ikony i stylów.
- Zweryfikowano stany hover, active, disabled i focus-visible w arkuszu stylów.
- Konsola lokalnego ekranu logowania: 0 błędów.

## Comparison history

- Pierwsza kontrola: zgodność bez P0/P1/P2; nie była potrzebna iteracja naprawcza.
- P3: implementacja ma dłuższą etykietę niż krótki napis „Google” ze wzorca, lecz lepiej opisuje działanie i mieści się na 390 px.

final result: passed

---

# Design QA — „Zdarzenia” w stylu „Pulpitu”

- Source visual truth: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-source.png`.
- Browser-rendered implementation: `http://localhost:5173/qa-events-style.html` podczas kontroli; tymczasowy harness został po QA usunięty, a właściwy portal pozostaje pod `http://localhost:5173/`.
- Desktop screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-desktop-viewport.jpg`.
- Focused table screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-table-final.jpg`.
- Tablet screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-tablet-stage.jpg`.
- Mobile screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-mobile-final.jpg`.
- Modal screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-modal.jpg`.
- Combined comparison: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-comparison.jpg`.
- Source pixels: 646 × 794.
- Implementation pixels: desktop 1265 × 712; tablet and mobile stages 1280 × 720.
- CSS viewports: desktop 1280 × 720, tablet frame 768 × 680, mobile frame 390 × 680.
- Density normalization: `devicePixelRatio = 1`; porównanie zestawia pełny wzorzec z nieskalowanym, browser-rendered regionem wdrożenia.
- State: wypełnione metryki i filtry, dwie kategorie problemów, reprezentatywne wiersze tabeli oraz otwarty modal kategorii.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Fonts and typography: Manrope, ciemnogranatowe nagłówki, wagi 650–860 i mniejsze teksty pomocnicze odpowiadają hierarchii „Pulpitu”; nie ma obciętych nagłówków tabeli.
- Spacing and layout rhythm: powierzchnia 20 px, karty 15–17 px, odstępy 12–16 px i lekkie cienie tworzą ten sam spokojny rytm co wzorzec.
- Colors and visual tokens: wdrożenie używa `#19243d`, `#253149`, `#68758e`, `#dfe5ef`, `#edf0f5` i `#5b52eb`; semantyczna czerwień, zieleń i bursztyn pozostały stonowane.
- Image and icon fidelity: widok nie wymaga nowych rasterów; wszystkie ikony pochodzą z używanej już biblioteki Phosphor i mają spójne rozmiary 14–16 px oraz okrągłe, lekkie tła.
- Copy and content: zachowano terminologię modułu, dodając jedynie czytelny nagłówek i opis filtrów oraz dostępne etykiety paginacji.
- Responsiveness: tablet przechodzi na metryki 2 × 2 i trzy pola filtrów w rzędzie; przy 390 px metryki pozostają 2 × 2, akcje są jednokolumnowe, a poziome przewijanie jest ograniczone do tabeli.

## Full-view and focused comparison evidence

- Wspólne porównanie potwierdza tę samą białą powierzchnię, cienkie obramowania, promienie, gęstość, akcent fioletowy i semantyczne kolory co na „Pulpicie”.
- Focused table check potwierdza kompletne nagłówki `Pracownik`–`Akcje`, płaskie wiersze z separatorami, czytelne znaczniki czasu i zintegrowaną paginację.
- Focused modal check potwierdza ten sam język kart: biała powierzchnia, delikatna ramka, mała ikonografia, przyciski obrysowane i czytelne liczniki.

## Interaction and technical QA

- Rozwinięcie filtra strefy pokazało listę i prawidłowy stan `aria-expanded`.
- Kliknięcie kafelka problemu otworzyło właściwy dialog; X zamknął go i przywrócił `aria-hidden="true"`. Kontrakt Escape, tła i powrotu fokusu pozostaje pokryty testem modułu.
- Mobile modal ma 374 px szerokości w widoku 390 px i zachowuje 8 px marginesu.
- Desktop page overflow X: 0 px.
- Mobile page overflow X: 0 px; tabela: 331 px viewport / 1142 px przewijalnej treści.
- Browser console: 0 błędów; wyłącznie komunikaty debug połączenia Vite.
- Targeted Events tests: 10/10 passed.
- Targeted ESLint: passed.
- Production portal build: passed.
- Pełne `npm test`: jedna istniejąca, niezwiązana porażka `Cleanzi-admin/test/portability-contract.test.js` dotycząca obecnego identyfikatora projektu; testy „Zdarzeń” przeszły.

## Comparison history

- Pierwsza kontrola tabeli: P2 — suma szerokości kolumn przekraczała kartę, przez co przyklejona kolumna akcji zasłaniała część nagłówka `Edytował`.
- Fix: dopasowano lokalny kontrakt szerokości kolumn do 1142 px i usunięto wtórne ramki z komórek klienta, strefy i lokalizacji.
- Kontrola po poprawce: wszystkie nagłówki mieszczą się, `scrollWidth` i `clientWidth` tabeli na desktopie wynoszą 1181 px, a wiersze są płaskie i czytelne.
- Pierwsza kontrola mobile: P2 — breakpoint 420 px składał cztery metryki w jedną kolumnę również na typowym telefonie 390 px.
- Fix: układ 2 × 2 pozostaje do 341 px, a jedna kolumna włącza się dopiero poniżej 340 px.
- Kontrola po poprawce: przy 390 px siatka ma dwie kolumny po 162,5 px, strona nie ma poziomego overflow, a filtry pozostają jednokolumnowe.

final result: passed

---

# Design QA — kompaktowy panel problemów w „Zdarzeniach”

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-5161fcb3-c791-4d79-b85e-6e3035ef0544.png`.
- Source pixels: 1308 × 707.
- Implementation URL: `http://localhost:5173/qa-events-integrity.html` — odizolowany stan QA korzystający z produkcyjnego szablonu i arkuszy stylów modułu „Zdarzenia”.
- Desktop implementation:
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-compact-desktop.png`
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-modal-desktop.png`
- Mobile implementation:
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-compact-mobile.png`
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-modal-mobile.png`
- Combined comparison:
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-comparison.png`
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-modal-comparison.png`
- Viewports: 1308 × 739 CSS px oraz 390 × 844 CSS px; zrzuty zapisano przy density 1, bez skalowania implementacji.
- State: dwie kategorie z danych referencyjnych (`83` nierozstrzygnięte, `38` historyczne), otwarty modal nierozstrzygniętych oraz zamknięcie okna.

## Findings

- Brak aktywnych rozbieżności P0, P1 lub P2.
- Panel zajmuje jeden kompaktowy blok i od razu odsłania nagłówek oraz pierwszy wiersz tabeli, zamiast renderować wszystkie grupy pracowników na stronie.
- Czerwony i bursztynowy kolor pozostały semantycznymi akcentami; duże, intensywne powierzchnie alarmowe zostały usunięte.
- Modal zachowuje hierarchię problem → podsumowanie → pracownik → akcja, a lista ma własny scroll i stałą stopkę.

## Required fidelity surfaces

- Fonts and typography: istniejący Manrope i dotychczasowe wagi portalu zostały zachowane; tytuły, metadane i liczniki nie nachodzą na siebie.
- Spacing and layout rhythm: desktop mieści dwa kafelki w jednym rzędzie, a mobile układa je pionowo; panel, tabela i modal nie kolidują.
- Colors and visual tokens: zastosowano istniejącą paletę Cleanzi, subtelne neutralne powierzchnie oraz czerwone/bursztynowe akcenty o czytelnym kontraście.
- Image quality and asset fidelity: moduł nie wymaga nowych rasterów; wszystkie ikony pochodzą z używanej już biblioteki Phosphor.
- Copy and content: nazwy czterech kategorii, liczby pracowników/rekordów i opis wpływu problemu są spójne z istniejącą klasyfikacją danych.

## Focused-region and responsive evidence

- Porównanie pełnego regionu potwierdza istotne skrócenie sekcji i zachowanie tabeli nad foldem.
- Porównanie modalne potwierdza, że dotychczasowe informacje o pracowniku, obiekcie/QR oraz liczniku pozostały dostępne po kliknięciu kategorii.
- Przy 390 × 844 modal ma niemal pełną wysokość, przewijaną listę, pełnoszerokie akcje i nie powoduje poziomego overflow.

## Interaction and technical QA

- Kafelki mają semantykę przycisku, `aria-haspopup="dialog"` i jednoznaczne etykiety.
- Modal otwiera właściwą kategorię, zamyka się przez Escape i kliknięcie tła, a fokus wraca do kafelka.
- Przycisk `Pokaż zdarzenia` korzysta z istniejącej dokładnej grupy diagnostycznej; kontrakt powrotu, strony i filtrów jest objęty testem modułu.
- Browser console: 0 błędów w stanie QA.
- Test panelu: 9/9 passed.
- Targeted ESLint modułu: passed.
- Production build portalu: passed.
- Pełny lint pozostaje czerwony przez pięć istniejących, niezwiązanych błędów `no-unused-vars` w `workerService.js` i `portalApp.js`.
- Pełny `npm test` dochodzi do testów panelu, lecz całość pozostaje czerwona przez istniejący test przenośności Cleanzi Admin wykrywający identyfikator aktualnego projektu.

## Comparison history

- Pierwsza próba pełnego portalu: zablokowana na ekranie logowania, bez używania danych logowania lub obchodzenia autoryzacji.
- Kontrola komponentu: produkcyjny szablon i CSS wyrenderowano z reprezentatywnymi danymi ze screena; nie wykryto problemów P0/P1/P2.
- Kontrola mobilna i interakcyjna: modal, scroll, Escape, kliknięcie tła, fokus i konsola przeszły weryfikację.

final result: passed

---

# Design QA — lista stref i edytor zdarzeń

- Source visual truth:
  - `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-4331352e-1218-4bb1-b3e9-434fdd3ebbf3.png` — dotychczasowa lista stref, 465 × 309 px.
  - `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-6d0a3a52-86f6-4fab-95e6-eb132408db6f.png` — docelowy wzorzec listy klienta, 491 × 252 px.
  - `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-e25c4149-6165-4866-9dc3-0062d932b9b1.png` — edytor zdarzenia przed dopracowaniem, 1146 × 879 px.
- Implementation URL: `http://localhost:5174/`
- Implementation screenshot: unavailable — local application requires an authenticated portal session in the in-app browser.
- Viewport: unavailable before authentication.
- CSS size and density normalization: not evaluated because the implementation state could not be opened.
- State reached: portal login screen.

## Full-view comparison evidence

The source visuals were opened at original resolution. The implementation could not be captured in the corresponding Events view because the local in-app browser has no authenticated portal session.

## Focused-region comparison evidence

Focused comparison of the zone dropdown and event editor is blocked by the same authentication requirement.

## Findings

- [P1] Browser verification is blocked by authentication.
  - Location: local portal, Events view.
  - Evidence: the browser reaches the Cleanzi login dialog instead of the Events screen.
  - Impact: typography, spacing, icons, open dropdown state, add mode and edit mode cannot yet be visually approved.
  - Fix: sign in to the local portal in the open in-app browser, then capture and compare the zone dropdown plus add/edit modal states.

## Required fidelity surfaces

- Fonts and typography: implemented with the existing Manrope family; browser comparison pending.
- Spacing and layout rhythm: updated in CSS; browser comparison pending.
- Colors and visual tokens: existing Cleanzi blue, green and red semantic tokens retained; browser comparison pending.
- Image quality and asset fidelity: no raster assets were added; icons use the existing Phosphor icon library.
- Copy and content: existing Polish labels and application behavior retained; zone placeholder now matches the client picker.

## Comparison history

- Initial pass: blocked at the portal login screen. No implementation screenshot was available for a valid same-state comparison.

## Implementation checklist

- Sign in to the local portal.
- Open Events and expand the zone filter.
- Capture the zone and client dropdowns in the same viewport.
- Open both Add event and Edit event states.
- Check focus, hover, keyboard selection and responsive layout.
- Review browser console errors.

final result: blocked

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
