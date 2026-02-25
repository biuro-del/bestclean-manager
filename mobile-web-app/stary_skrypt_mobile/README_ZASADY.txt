ZASADY PRAC POPRAWKOWYCH (Best Clean Monitor / V0.107)

1) ZMIANY ROBIMY MAŁYMI KROKAMI
- Jedna funkcja / jeden błąd na raz → test → dopiero następna zmiana.

2) BRAK ZGADYWANIA
- Jeśli brakuje informacji (kolumny, statusy, zachowanie edge-case) – zadajemy krótkie pytania i dopiero potem zmiana.

3) BRAK REGRESJI
Po każdej zmianie testujemy minimum:
- logowanie + single-device
- START dnia (biuro) + START indywidualne
- sprzątanie: start/stop tej samej strefy
- sprzątanie: zmiana strefy (stopAndStart)
- STOP dnia: STOP0 oraz STOP5/10/15
- przerwa: start/stop
- strefa koordynatora + audyt
- edycja QR + lokalizacja
- lista zdarzeń + podsumowanie (CLOSED)

4) ZASADA „BAZA = SOURCE OF TRUTH”
- STOP/START rozpoznajemy wg Strefy (Funkcja) i odświeżamy stopRules automatycznie.
- Audyt zapisuje tylko do Coordinator_Log.
- Arkusz 629711994 używany jest wyłącznie do CLEAN/czasu pracy.

5) WYDAWANIE PLIKÓW
- Zawsze pełne pliki (.txt), nie fragmenty.
- Przy aktualizacjach wysyłamy tylko pliki zmienione.
- Każda zmiana aktualizuje „baseline” (ostatni komplet).

6) NAZWY I WERSJE
- Aktualna wersja: V0.128
- Zmiany UI/logic wprowadzamy zachowując kompatybilność wstecz, chyba że użytkownik powie inaczej.
