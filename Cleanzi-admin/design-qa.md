# Design QA — Cleanzi Admin

## Zakres

Zweryfikowano wyłącznie Panel admina z aktywnym widokiem „Organizacje”. Zwykły portal organizacji nie otrzymał tego motywu. Porównanie wykonano w tym samym stanie i rozmiarze widoku 1600 × 1000.

## Materiał porównawczy

- `qa/admin-organizations-reference-1600.png` — źródłowy ekran przekazany przez użytkownika.
- `qa/admin-organizations-current-1600.png` — końcowy render implementacji.
- `qa/admin-organizations-current-comparison.png` — źródło i implementacja obok siebie, w skali 1:1.

## Sprawdzone elementy

1. Układ: boczna nawigacja 248 px, obszar treści, nagłówek, karta filtrów, wymagany powód, pasek statystyk, tabela i paginacja.
2. Styl: ciemne powierzchnie navy, fioletowo-niebieskie akcje, obramowania, zwarte kontrolki, statusy i spójne ikony Phosphor.
3. Gęstość: początek filtrów, sekcji powodu, statystyk i tabeli odpowiada referencji z tolerancją kilku pikseli.
4. Responsywność: siatki filtrów i statystyk przechodzą kolejno do trzech, dwóch i jednej kolumny; tabela zachowuje kontrolowane przewijanie.
5. Dostępność: struktura `nav`, nagłówki, etykiety pól, `aria-current`, `aria-live`, cele klawiaturowe oraz wyraźny `:focus-visible` pozostały zachowane.
6. Izolacja: zmiany stylu dotyczą selektorów `.cleanzi-admin`; wygląd logowania platformowego pozostaje ograniczony do `data-auth-scope="platform"`.

## Kontrola funkcjonalna i techniczna

- Zachowano istniejące identyfikatory kontrolek oraz punkty podpięcia logiki nawigacji, filtrów, sortowania, paginacji i operacji.
- Świeża karta podglądu nie wykazała błędów konsoli.
- Odczyty Panelu admina mają bezpieczny tryb zgodności ze starszym schematem; test kontraktowy potwierdza brak 503 dla dashboardu, planów, szczegółów, historii, płatności i dokumentów.
- `npm test`: 71/71 testów.
- `npm --prefix web-app run lint`: passed.
- `npm --prefix web-app run build`: passed.
- Nie znaleziono problemów P0, P1 ani P2.

## Iteracje

1. Przeniesiono strukturę i paletę referencji na istniejący moduł, bez budowania drugiego panelu.
2. Po porównaniu 1600 × 1000 skorygowano szerokość treści, model pudełkowy i pionową gęstość sekcji.
3. Końcowe porównanie potwierdziło zgodność układu i brak poziomego przepełnienia całej strony.

final result: passed
