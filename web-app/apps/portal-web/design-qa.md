# Design QA — scroll tabeli i lista stref

## Materiały

- Źródło scrolla: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-5a25bc67-cee8-471d-a634-1e700d181157.png`
- Źródło listy stref: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-1e3153ee-1f5b-4d39-b972-deca0345b71b.png`
- Implementacja: `C:\Users\dosta\cleanzi-version-4.0\web-app\test\events-scroll-zone-cleanup.png`
- Porównanie źródeł i implementacji: `C:\Users\dosta\cleanzi-version-4.0\web-app\test\events-scroll-zone-comparison.png`

## Normalizacja

- Źródło scrolla: `1617 × 174 px`.
- Źródło listy stref: `423 × 287 px`.
- Implementacja: viewport CSS `1615 × 720`, DPR `1`, zrzut `1615 × 720 px`.
- Stan: jasny motyw, otwarta lista „Strefa”, jeden zakończony rekord i pager.
- Porównanie skupione obejmuje dół tabeli oraz rozwinięty filtr strefy; oba źródła i odpowiadające im fragmenty implementacji znajdują się w jednym obrazie.

## Wyniki

Nie pozostały błędy P0, P1 ani P2.

- Typografia: nazwy stref są jednowierszowe, pogrubione i czytelne. Lista używa tych samych nazw oraz kolejności co sekcja „Strefy”.
- Układ i odstępy: opcje mają wysokość `30 px`, zwarty rytm i szerokość równą polu filtra.
- Kolory: zaznaczona strefa ma jasne fioletowe tło zgodne z referencją; zachowano biel i niebieskie obramowanie pola.
- Obraz i zasoby: nie dodano nowych zasobów; lista korzysta z istniejących elementów i ikon interfejsu.
- Treść: opcje zaczynają się od „Biuro”, „Aneks kuchenny”, „WC / Prysznic”, „Szatnia”, „Ciąg komunikacyjny”, „Sala konferencyjna” i „Recepcja”.

## Kontrola funkcjonalna

- Tabela przy `1615 px`: `clientWidth = 1573`, `scrollWidth = 1573`, brak poziomego przepełnienia.
- Desktop: `overflow-x: hidden` dla tabeli zdarzeń.
- Dodatkowy pływający scrollbar pomija tabelę `#view-events .events-table`.
- Mniejsze ekrany zachowują natywne przewijanie tabeli.
- Filtr „Strefa” pozostaje polem combobox, więc można wpisać fragment nazwy.
- Nazwy stref korzystają ze wspólnej listy `DEFAULT_ZONE_TYPE_OPTIONS` z sekcji „Strefy”.

## Historia iteracji

1. Źródło wykazało dwa poziome paski: natywny scrollbar tabeli i globalny pasek pływający.
2. Tabela została dopasowana do szerokości desktopu, a globalny pasek przestał obsługiwać tabelę zdarzeń.
3. Pierwszy render listy miał zbyt wysokie opcje i ucinał ostatnią widoczną nazwę.
4. Zmniejszono wysokość opcji do `30 px`, zachowano kierunek strzałki i potwierdzono widoczność wszystkich siedmiu pozycji referencyjnych.

## Walidacja techniczna

- `node --check` — PASS
- `npm run lint` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

final result: passed
