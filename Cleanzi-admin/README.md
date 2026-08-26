# Cleanzi Admin

Wydzielony moduł „Panel admina” do zarządzania organizacjami, subskrypcjami i rozliczeniami. Moduł nie tworzy nowego uwierzytelniania: korzysta z obecnego Firebase Auth, `platform_admin`, MFA, prywatnego audytu oraz kontekstu organizacji.

Pełny opis struktury strony, modułów i integracji znajduje się w [`ReadMe.txt`](../ReadMe.txt). Minimalny kontrakt hosta opisuje [`docs/host-integration.md`](./docs/host-integration.md), a politykę planów, onboarding i konfigurację Firebase/GUS/Stripe dokumentuje [`docs/portal-plans-onboarding.md`](../docs/portal-plans-onboarding.md).

## Struktura

- `frontend/` — polski, responsywny i dostępny panel osadzony w aktualnym portalu;
- `backend/` — zapytania, operacje transakcyjne i dostawco-niezależny adapter rozliczeń;
- `migrations/` — idempotentne rozszerzenie obecnego PostgreSQL;
- `scripts/` — audyt schematu i kontrolowane uruchamianie migracji;
- `test/` — testy kontraktów migracji, operacji i adaptera;
- `docs/` — architektura, provisioning i checklista przeniesienia środowiska.

## Zasady bezpieczeństwa

- wejście wymaga zweryfikowanego tokenu Firebase, aktywnego `platform_admin`, dokładnego claimu `PLATFORM_OWNER`, zweryfikowanego emaila i MFA;
- mutacje wymagają uwierzytelnienia nie starszego niż 5 minut;
- każda mutacja wymaga powodu oraz audytu `REQUESTED`, a potem `SUCCEEDED` lub `FAILED`;
- `SUCCEEDED` jest zapisywany w tej samej transakcji SQL co zmiana biznesowa;
- ręczne operacje finansowe używają klucza idempotencji i kwot `BIGINT` w najmniejszych jednostkach;
- dane finansowe i audyt są dostępne tylko przez `/api/platform/*`;
- tożsamość PLATFORM_OWNER nie jest zapisywana w polach tenantowych.

## Lokalne sprawdzenie

```text
npm test
npm --prefix web-app run lint
npm --prefix web-app run build
npm run migrate:cleanzi-admin:audit
```

Ostatnie polecenie łączy się z bazą wskazaną przez środowisko i wykonuje wyłącznie odczyt. Migrację stosuje osobne polecenie `npm run migrate:cleanzi-admin:apply`; nie należy go uruchamiać na zdalnej bazie bez osobnej zgody właściciela systemu.

## Świadomie poza zakresem

Moduł nie udostępnia internetowego checkoutu, nie wdraża aplikacji, nie zmienia projektu Firebase i nie uruchamia migracji automatycznie. Synchronizacja statusu płatności odbywa się osobnym, podpisanym webhookiem Stripe; `BILLING_PROVIDER=NONE` pozostaje bezpiecznym ustawieniem panelu ręcznego.
