# Pierwszy obiekt zarządcy

Ten etap tworzy wyłącznie własny obiekt organizacji typu `FACILITY_MANAGER`. Nie tworzy klienta firmy sprzątającej, strefy QR, zlecenia ani połączenia między organizacjami.

## Kontrakt produktu

- Po zalogowaniu zarządca trafia na ekran **Moje obiekty**, a nie na pulpit firmy sprzątającej.
- Pierwszy obiekt wymaga: nazwy, adresu, kodu pocztowego i miejscowości. Oznaczenie wewnętrzne jest opcjonalne.
- Zarządca ma nadal dostęp `FREE / UNLIMITED`; jego dostęp do portalu pozostaje oparty na aktywnym ownerze/administratorze i membershipie.
- Dodanie obiektu jest idempotentne: powtórzenie tego samego `clientActionId` zwraca wcześniej utworzony obiekt, a użycie tego klucza dla innych danych jest odrzucane.
- Usunięcie w API jest archiwizacją, nie fizycznym kasowaniem.

## Granice bezpieczeństwa

- `orgId` przychodzi z aktywnej sesji, lecz serwer niezależnie weryfikuje Firebase UID, aktywne membership, aktywnego workera, rolę `OWNER`/`ADMIN` oraz `organization_kind = FACILITY_MANAGER`.
- Każdy odczyt i zapis jest zakresowany przez zweryfikowany `orgId`; API nie przyjmuje UID, typu organizacji, statusu ani czasu jako danych z przeglądarki.
- Tabela `facility_manager_object` ma własność wyłącznie po stronie zarządcy. Nie wolno jej zastępować `public.client` ani tabelą operacyjnego obiektu firmy sprzątającej.
- Wpisy `CREATED`, `UPDATED` i `ARCHIVED` trafiają do osobnego, minimalnego audytu bez pełnego powielania adresu w historii.

## API

`/api/facility-manager/objects`

- `GET ?orgId=...` — aktywne obiekty aktywnego panelu zarządcy.
- `POST` — utworzenie z `clientActionId`.
- `PATCH` — pełna edycja z `expectedVersion`.
- `DELETE` — archiwizacja z `expectedVersion`.

## Kolejność wydania

1. Wykonać wyłącznie odczytowy audyt: `npm run migrate:facility-manager-object -- --audit`. Skrypt otwiera bazę w transakcji `READ ONLY` i odrzuca inny projekt lub bazę.
2. Zweryfikować wynik preflightu SQL oraz fizyczny schemat: kolumny, PK/FK/check/unikalność, definicje indeksów i uprawnienia runtime `portal_app`.
3. Dopiero po osobnej zgodzie produkcyjnej wykonać migrację z dokładnym tokenem wymaganym przez skrypt. DDL ma limit oczekiwania na blokadę i limit czasu wykonania.
4. Wdrożyć build aplikacji i sprawdzić prawdziwą sesję Google zarządcy: zapis obiektu, ponowienie zapisu oraz odczyt po odświeżeniu.
5. Dopiero potem zbudować zaproszenie firmy sprzątającej. Połączenie musi być zaakceptowane przez właściciela/admina firmy i przypisane do konkretnego obiektu.
