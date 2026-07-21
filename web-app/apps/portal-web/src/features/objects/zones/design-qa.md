# Design QA — generator kodów QR

- Source visual truth: `C:/Users/dosta/AppData/Local/Temp/codex-clipboard-b59fb453-0710-4959-9988-c19e4c3210ec.png`
- Implementation screenshot: `C:/Users/dosta/.codex/visualizations/2026/07/20/019f7ef6-4b73-7b23-aaa3-72b2d55a3253/zones-qr-wider-left-panel.png`
- Combined comparison: `C:/Users/dosta/.codex/visualizations/2026/07/20/019f7ef6-4b73-7b23-aaa3-72b2d55a3253/zones-qr-padding-comparison.png`
- Additional rendered states:
  - `C:/Users/dosta/.codex/visualizations/2026/07/20/019f7ef6-4b73-7b23-aaa3-72b2d55a3253/zones-qr-compact.png`
  - `C:/Users/dosta/.codex/visualizations/2026/07/20/019f7ef6-4b73-7b23-aaa3-72b2d55a3253/zones-qr-labels-25mm.png`
- Viewport: 1616 × 975 px (browser capture content: 1601 × 966 px)
- State: desktop, jasny motyw, 1 × START; dodatkowo 2 × START + 2 × STOP w formacie 100 × 120 mm oraz 10 etykiet stref 25 × 25 mm.

## Findings

Brak pozostałych problemów P0/P1/P2. Lewa kolumna ma 620 px przy widoku 1616 px, a nagłówki sekcji 1, 2 i 3 zaczynają się dokładnie na pozycji x = 38 px. Układ zachowuje hierarchię referencji: zwarty nagłówek, cztery sekcje formularza po lewej, duży podgląd po prawej, widoczne akcje nad zgięciem oraz spójne karty z ikonami i stanami wyboru.

### Wymagane powierzchnie zgodności

- Fonts and typography: wykorzystano istniejącą typografię portalu i jej wagi; hierarchia tytułu, legend, opisów i metadanych odpowiada gęstości referencji. W izolowanym podglądzie kontrolnym działa awaryjny fallback `Inter, Arial`.
- Spacing and layout rhythm: sekcje mają wspólne odstępy, promienie i liniowe separatory; formaty mieszczą się w dwóch równych blokach, a akcje pozostają widoczne w docelowym widoku.
- Colors and visual tokens: zachowano granat, turkus, czerwony, błękit i fiolet z referencji oraz istniejącego modułu; stany aktywne mają jednoznaczne turkusowe obramowanie i jasne tło.
- Image quality and asset fidelity: logo Cleanzi pochodzi z istniejącego zasobu; ikony pochodzą z jednego zestawu SVG; QR jest generowany jako wektor z białym marginesem i renderowany przez ten sam PDF co wydruk.
- Copy and content: nazwy START, STOP, Strefa (CLEAN), Strefa specjalna oraz wszystkie nowe rozmiary i pojemności stron są widoczne i spójne z logiką generatora.

## Focused region comparison

Porównano osobno sekcję funkcji, sekcję formatów i obszar podglądu. Dodatkowe zbliżenie nie było potrzebne: teksty, ikony, kontrolki i render QR pozostają czytelne w połączonym obrazie porównawczym, a warianty 100 × 120 mm i 25 × 25 mm zostały sprawdzone jako oddzielne pełne rendery.

## Comparison history

1. Pierwsze porównanie — P2: sekcja „Akcje” znajdowała się poniżej dolnej krawędzi widoku 1616 × 975, a blok formatów był zbyt wysoki.
2. Fix: opcje rozmiaru ustawiono poziomo wewnątrz kart, zmniejszono pionowe paddingi oraz wysokości kontrolek, zachowując minimalne obszary klikalne i czytelność.
3. Post-fix evidence: `zones-qr-large.png` i `zones-qr-comparison.jpg` pokazują komplet czterech sekcji wraz z akcjami oraz większy podgląd PDF w tym samym widoku.
4. Kolejne porównanie — P2: użytkownik wskazał zbyt wąską lewą kolumnę oraz różny optyczny padding nagłówka pierwszego `fieldset` względem sekcji drugiej.
5. Fix: kolumnę konfiguracji poszerzono z 540 do 620 px, a `legend` przeniesiono do zwykłego przepływu blokowego z pełną szerokością i takim samym paddingiem sekcji jak nagłówki `h3`.
6. Post-fix evidence: `zones-qr-wider-left-panel.png` i `zones-qr-padding-comparison.png`; pomiar przeglądarkowy potwierdza x = 38 px dla nagłówków sekcji 1, 2 i 3.

## Primary interactions tested

- render dużego plakatu START/STOP: 2 na A4 poziomo;
- render plakatu 100 × 120 mm: 4 na A4 pionowo;
- render etykiet 25 × 25 mm: automatyczna siatka 88 na stronę;
- przeliczenie paginacji dla 40 mm, 25 mm, formatów czasu i układu mieszanego;
- brak błędów i ostrzeżeń w konsoli izolowanego podglądu.

## Follow-up polish

- P3: pasek narzędzi podglądu z makiety nie został odwzorowany 1:1, ponieważ istniejący podgląd produktu używa własnej nawigacji stron i automatycznego skalowania PDF; nie wpływa to na podstawowy przepływ ani zgodność wydruku.

## Implementation checklist

- [x] Nowe formaty powiązane z jednym layout engine.
- [x] Podgląd i finalny PDF korzystają z tych samych opcji układu.
- [x] Karty, ikony, stany aktywne i akcje dopasowane do referencji.
- [x] Warianty desktopowe i mieszane zweryfikowane.
- [x] Konsola podglądu bez błędów.

final result: passed
