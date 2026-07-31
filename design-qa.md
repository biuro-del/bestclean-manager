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
