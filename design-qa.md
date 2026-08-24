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
# Design QA — short-height responsive release gate

## Source, implementation and normalization

- Source visual truth: `C:\Users\rafal\.codex\generated_images\01a02950-61b9-7e22-b381-efc6e1d1030d\exec-2a3d7509-beac-4545-b215-509e9cf34d3b.png`.
- Latest browser-rendered desktop: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-final-desktop-1440x1024-20260823.png`.
- Full-view combined comparison: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-final-comparison-1440x1024-20260823.png`.
- Focused responsive evidence, login error: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-landscape-error-844x390-20260823.png`.
- Focused responsive evidence, e-mail registration error: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-landscape-email-error-844x390-20260823.png`.
- Source pixels: 1488 × 1058, normalized to 1440 × 1024. Desktop implementation: 1440 × 1024 CSS px and pixels at density 1. Focused short-height implementation: 844 × 390 CSS px and pixels at density 1.
- States: default desktop; landscape login with local validation error; company-registration choice; landscape e-mail registration with local validation error. No real authentication, OAuth, e-mail send or company creation was performed.

## Findings and fidelity surfaces

- The release audit found one P1 after the earlier pass: the short-screen branch was limited to widths up to 620 px. At 844 × 390 the login error state measured a 817 px document, scrolled to `y=370`, with the 634.75 px card extending from `y=-218` to `y=416.75`. A boundary review then found the same discontinuity immediately above the first 700 px and 620 px height cut-offs.
- Fix: the hero-removal branch now covers widths up to 920 px at heights up to 820 px; the 680 px high compact branch is independent of width; a 480 px high branch further tightens non-interactive spacing and hides only the repeated security note.
- Typography and accessibility: the very-short layout retains the existing font family and hierarchy, uses a 26 px title, preserves 44 px fields and primary/secondary controls, and keeps the 16 px mobile input text from the mobile-width rule.
- Spacing and layout rhythm: the 844 × 390 error-state card now measures 350.45 px and sits fully inside the viewport at `y=19.77–370.22`. Registration choice measures 347.80 px; e-mail registration with error measures 346.05 px. No horizontal or vertical page overflow remains.
- Colors and tokens: navy, blue, borders, validation red, focus treatment and shadows remain unchanged from the accepted option 1 composition.
- Image quality and assets: canonical Cleanzi SVG and optimized hero photo remain unchanged. The photo is intentionally omitted only where short height would otherwise displace the core task.
- Copy and content: login and registration copy is unchanged. On viewports at most 480 px high the repeated security note is omitted; the action, fields, registration entry and validation message remain visible.
- Icons and interactions: the existing Phosphor eye and lock treatments remain. Password visibility, login validation, registration choice and e-mail validation continue to use the existing functional controls.
- Longer organization and MFA states retain bounded internal overflow on short screens; the core public login and registration states do not require page or internal scrolling.
- Browser console: no error or warning was recorded in the verified public states.

## Post-fix viewport evidence with a visible validation message

- 768 × 700: document 768 × 700, card `y=20–654.75`, no page scroll.
- 768 × 701 and 768 × 800: document exactly matches the viewport, card `y=20–654.75`, no page scroll.
- 920 × 700: document 920 × 700, card `y=20–654.75`, no page scroll.
- 920 × 820: document 920 × 820, card `y=20–654.75`; at 920 × 821 the hero returns and the card remains within `y=152–786.75`. Neither boundary scrolls.
- 921 × 700: document 921 × 700, card `y=37–596.28`, no page scroll.
- 1280 × 600: document 1280 × 600, card `y=12–426.36`, no page scroll.
- 1280 × 621, 1280 × 632 and 1280 × 680: document exactly matches the viewport, card `y=12–426.36`; at 1280 × 681 the standard card returns within `y=37–596.28`. None of these boundaries scrolls.
- 320 × 568: document 320 × 568, card `y=12–437.64`, no page scroll.
- 390 × 844: document 390 × 844, card `y=146–653.95`, no page scroll.
- 921 × 480, 920 × 480 and 1280 × 480: document height 480, e-mail error card `y=66.97–413.02`, no page scroll.
- Every measurement used `max(document.documentElement.scrollHeight, document.body.scrollHeight)` and also verified card top, card bottom, `scrollY=0` and document width equal to viewport width.

## Comparison history

1. Earlier pass: portrait phone and normal laptop states passed, but the 621–920 px wide short-height range was not exercised.
2. Independent release review found the P1 at 844 × 390 and identified the same risk at 768 × 700 and 1280 × 600.
3. A second boundary review found discontinuities just above 700 px and 620 px; the final limits were therefore moved to 820 px for the narrow hero branch and 680 px for the width-independent compact branch.
4. The height-aware responsive rules were generalized without using `transform: scale()`, CSS `zoom` or root overflow clipping.
5. Post-fix browser verification passed all listed exact boundary sizes and the login, registration-choice and e-mail-error states. The standard 1440 × 1024 comparison remains visually unchanged. No P0, P1 or P2 finding remains open.

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

---

# Design QA — Cleanzi cleaning-company login

## Reference and implementation

- Selected direction: option 1, “Spokojna precyzja”.
- Source visual: `C:\Users\rafal\.codex\generated_images\01a02950-61b9-7e22-b381-efc6e1d1030d\exec-2a3d7509-beac-4545-b215-509e9cf34d3b.png`.
- Final implementation capture: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-desktop-final-verified-20260823.png`.
- Source size: 1488 × 1058, normalized for comparison to 1440 × 1024.
- Implementation viewport: 1440 × 1024 CSS px, device scale factor 1.
- Tested state: default login, no focus, no autofill, no validation error. Public registration was enabled only by a read-only local legal-document fixture.

## Comparison evidence

- Full view: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-comparison-full-final-20260823.png`.
- Focused form: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-comparison-form-final-20260823.png`.
- Focused hero caption: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-comparison-caption-final-20260823.png`.
- Mobile: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-mobile-final-verified-390x844-20260823.png`.
- Laptop: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-laptop-final-verified-1280x720-20260823.png`.
- Tablet: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-tablet-final-verified-768x1024-20260823.png`.

## Interaction and responsive verification

- Password reveal toggles `password` ↔ `text`, updates the eye icon, `aria-pressed`, and the accessible label.
- “Załóż firmę” opens the existing company-registration choices; Google and e-mail paths remain available; “Mam już konto” returns to login.
- No real authentication or external registration submission was made during visual QA.
- At 390 × 844 the page has no horizontal or vertical overflow in the default state (`390 × 844` document size).
- At 1280 × 720 the page has no horizontal or vertical overflow in the default state (`1280 × 720` document size).
- At 768 px the 480 px form card is centered within the available content width.
- Browser inspection showed no application error in the verified default state.

## Iteration log

1. Pass 1 found P2 drift in card width, vertical rhythm, caption wrapping, and typography. Mobile also had P1 clipping and a P2 stacked registration row. The layout, spacing, type scale, and mobile breakpoints were corrected.
2. Passes 2–4 refined the split ratio, hero crop, logo scale, field geometry, divider, security note, and caption position against the reference.
3. Final code review found a P0 cascade issue: `display: grid !important` on the login screen would have overridden the authenticated portal transition. It was removed and protected with a regression assertion.
4. Final responsive review found a P2 tablet alignment issue at 621–920 px. The form panel is now centered in that range.
5. Final review reports no remaining P0, P1, or P2 defects.

## Accepted residual differences

- The generated reference re-rendered the Cleanzi logo and photo content. The implementation intentionally uses the canonical production SVG logo and the existing optimized production photo instead of rasterizing generated brand or photographic details.
- Minor font rasterization and anti-aliasing differences are platform-dependent.

Result: passed

---

# Design QA — compact 80% login composition

## Source and state

- Source visual truth: `C:\Users\rafal\.codex\generated_images\01a02950-61b9-7e22-b381-efc6e1d1030d\exec-2a3d7509-beac-4545-b215-509e9cf34d3b.png`.
- Product constraint added after the selected visual: retain the option 1 composition while reducing its real layout dimensions to about 80% and reserving space for subsequent messages.
- Browser-rendered implementation: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-desktop-1440x1024-20260823.png`.
- Source pixels: 1488 × 1058, normalized to 1440 × 1024.
- Implementation pixels and CSS viewport: 1440 × 1024 at density 1.
- State: public cleaning-company login, no autofill and no focus. Error and registration states were verified separately.

## Comparison evidence

- Full view: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-comparison-1440x1024-20260823.png`.
- Focused form: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-comparison-form-focus-20260823.png`.
- Laptop with login message: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-laptop-error-1280x720-20260823.png`.
- Mobile default: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-mobile-390x844-20260823.png`.
- Small mobile with login message: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-mobile-error-viewport-320x568-20260823.png`.

## Findings

- No actionable P0, P1, or P2 issue remains.
- Typography and spacing: the form card is 384 px instead of 480 px; the title, logo, fields, CTA, dividers, caption, margins, and padding follow the requested compact scale without `transform: scale()` or CSS `zoom`.
- Responsive layout: mobile inputs retain a 16 px font and interactive controls remain at least 44 px high. The short-screen branch removes only the photographic hero, preserving all login information and controls.
- Colors and assets: the option 1 palette, canonical Cleanzi SVG, canonical optimized hero photo, borders, focus treatment, and Phosphor icons are unchanged.
- Copy and content: login, company-registration, confirmation, reset, organization, and MFA panels retain their existing content and IDs. Longer organization and MFA collections are bounded inside their own panel on very short phones so they cannot expand the page.
- Browser console: no errors or warnings in the verified states.
- Residual test gap: organization selection and authenticated MFA require dedicated test-session fixtures, so their visual content was source-reviewed and constrained but not opened through a real authenticated browser session. This does not affect the tested public login and registration path.

## Responsive and interaction evidence

- 1280 × 720: default form 503 px high; form with login error 559 px high; page height remains 720 px.
- 768 × 1024: form with login error ends at 916 px; page height remains 1024 px.
- 768 × 900: form with login error ends at 787 px; page height remains 900 px.
- 390 × 844: default form 460 px high; form with error 508 px high; registration 454 px high; email registration with error 499 px high; page height remains 844 px.
- 390 × 667: form with error ends at 528 px; page height remains 667 px.
- 360 × 640: form with error ends at 540 px; page height remains 640 px.
- 320 × 568: form with error ends at 438 px; page height remains 568 px.
- Every height check used `max(document.documentElement.scrollHeight, document.body.scrollHeight)` and verified that the full form stayed within the viewport.
- Tested browser interactions: empty login displays its validation message; company registration opens; e-mail registration opens; empty e-mail registration displays its validation message; no external authentication or registration submission was made.

## Comparison history

1. Baseline P0: login errors caused 53 px of page scroll at 1280 × 720 and 89 px at 390 × 844. Small phones already scrolled without an error.
2. Fix: all physical dimensions were reduced around the requested 80% ratio. Mobile hero, spacing, and short-height branches were compacted further while retaining 44 px touch targets and 16 px input text.
3. Baseline P0: arbitrary organization or MFA content could grow the whole page. Fix: their short-phone content regions now have bounded internal height and overscroll containment.
4. Post-fix browser evidence: login and registration messages fit without page scroll at every recorded viewport, including 320 × 568.

## Technical QA

- Focused onboarding tests: 7/7 passed.
- ESLint: passed.
- Production build: passed.
- `git diff --check`: passed apart from expected Windows line-ending notices.

final result: passed
