# Katalog norm ISSA dla Karty Zlecenia

Katalog przechowuje źródłowe normy czasu oddzielnie od formularza i logiki UI.
Nie wolno wyliczać ani prezentować czasu usługi, jeżeli brakuje danych wymaganych
przez daną normę.

## Źródło

- Ben Walker, „612 oficjalnych norm czasu sprzątania ISSA”.
- Plik przekazany przez użytkownika: `Normy_ISSA_do_druku_A4.pdf`.
- SHA-256: `7F881D963D82C9B1D0AF35AD6F6F4873455B9037E3BA4601AAECD215A792D612`.
- Wzór przeliczeniowy: drukowana strona 57, strona PDF 39.
- Pierwszy zweryfikowany zakres danych: zadania 50-73, drukowana strona 12,
  strona PDF 6.

Plik PDF nie jest kopiowany do aplikacji. Przed ewentualnym rozpowszechnianiem
źródła należy osobno potwierdzić prawa do jego dystrybucji.

## Zasady użycia

1. Kalkulator korzysta wyłącznie z rekordów `VERIFIED_VISUALLY`.
2. Norma powierzchniowa wymaga powierzchni strefy w m².
3. Norma licznikowa wymaga liczby właściwych jednostek, np. biurek.
4. Brak danych daje `INPUT_REQUIRED`, a nie wymyślony czas.
5. Wynik bazowy wynika wyłącznie z proporcji normy źródłowej.
6. Korekta lub przedział wymaga jawnych współczynników przekazanych przez
   użytkownika lub zaakceptowaną politykę organizacji.
7. Każda sugestia zawiera cytowanie źródła z numerem zadania i strony.

## Rozbudowa katalogu

Pozostałe tabele z 39-stronicowego PDF zostały zinwentaryzowane, ale nie są
jeszcze aktywne. OCR może służyć jako pomoc w imporcie, lecz każdy rekord musi
przejść kontrolę wzrokową i kontrolę matematyczną przed zmianą statusu na
`VERIFIED_VISUALLY`.
