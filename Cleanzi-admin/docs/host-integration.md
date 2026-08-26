# Kontrakt integracji z hostem Cleanzi-01

Repozytorium `cleanzi-admin-panel` jest dystrybucją modułu, a nie samodzielną aplikacją. Ten dokument definiuje minimalne obowiązki hosta bez kopiowania zwykłego portalu organizacji.

## Frontend

Host musi:

1. importować `platformAdminTemplate` z `Cleanzi-admin/frontend/template.js` i osadzić go wewnątrz chronionego układu aplikacji;
2. utworzyć `createCleanziAdminPanel(...)` po zainicjalizowaniu routera i sesji;
3. przekazać kontrolerowi wyłącznie funkcje sesji, routingu, aktywacji organizacji, wylogowania i przełączania widoczności;
4. udostępnić `platformAuthHeaders({ requireContext, forceRefresh })`, które pobiera token z nazwanej aplikacji Firebase platformy, dodaje identyfikator prywatnego kontekstu i prywatny token MFA email;
5. otwierać logowanie administratora przez kontrolowany zakres platformowy, obecnie `?panel=admin`;
6. nie udostępniać konfiguracji backendowej, sekretów SMTP, Cloud SQL ani operatora płatności w bundlu przeglądarki.

`createCleanziAdminPanel` oczekuje następujących zależności hosta:

- `router`;
- `acceptPlatformContext`;
- `clearPlatformContextSession`;
- `getSession`;
- `logout`;
- `resetPortalState`;
- `setUserChip`;
- `activatePortalSession`;
- `showPortal`;
- `showLoginScreen`;
- `showLoginCredentials`.

Host odpowiada za zachowanie sesji organizacyjnych bez zmian. PLATFORM_OWNER nie może zostać zapisany jako tenantowy aktor podczas wejścia do organizacji.

## Backend

Host montuje `createPlatformApi(...)` przed ogólnym fallbackiem routingu i przekazuje:

- zweryfikowaną tożsamość Firebase;
- aktywny `platform_admin`;
- pulę PostgreSQL;
- prywatny kontekst żądania oparty na `AsyncLocalStorage`;
- bezpieczny mechanizm odpowiedzi JSON;
- gateway Data Connect ograniczony listą nazwanych operacji.

Obsługa `/api/platform/*` musi następować wyłącznie po pełnej weryfikacji tokenu. Backend nie może ufać emailowi, roli przesłanej przez klienta ani dowolnemu identyfikatorowi organizacji bez aktywnego kontekstu.

Pliki platformowe publikowane w katalogu głównym dystrybucji zachowują relacje importów z pełnym repozytorium:

- `platform-api.js` — routing i walidacja wejścia;
- `platform-repository.js` — polityka dostępu, prywatny audyt i delegacja operacji do repozytorium modułu;
- `platform-policy.js` — claim, email, MFA i świeżość uwierzytelnienia;
- `platform-request-context.js` — prywatny kontekst żądania;
- `platform-email-mfa.js` — prywatne wyzwanie MFA email;
- `scripts/platform-admin.js` — provisioning i odebranie PLATFORM_OWNER.

## Baza danych

Host zachowuje istniejące `organizations`, `organization_subscription`, `platform_admin`, `worker` i `organization_member`. Migracja modułu jest idempotentna i nie może być uruchamiana automatycznie przy starcie.

Skrypt migracyjny korzysta z istniejącego hostowego pomocnika połączenia z bazą (`createPool` i `loadSecretManagerDatabaseConfig`). Dystrybucja nie kopiuje całego skryptu migracji pracowników, ponieważ zawiera on funkcje niezwiązane z Panelem admina.

## Punkty integracyjne pozostające w Cleanzi-01

Następujące pliki hosta zawierają jednocześnie logikę tenantową, dlatego nie są kopiowane do dystrybucji:

- główny `index.js` serwera;
- `web-app/apps/portal-web/src/ui/portalApp.js`;
- `web-app/apps/portal-web/src/ui/layoutTemplate.js`;
- `web-app/apps/portal-web/src/auth/authService.js`;
- `web-app/apps/portal-web/src/services/platformDataConnectService.js`;
- główne manifesty `package.json` i konfiguracja Vite.

Ich obowiązki integracyjne są opisane powyżej. Kopiowanie całych plików naruszałoby granicę „tylko Panel admina”, ponieważ zawierają zwykły portal organizacji.

## Warunki bezpieczeństwa

- wszystkie mutacje są backendowe i transakcyjne;
- `REQUESTED` musi powstać przed operacją;
- zmiana biznesowa i `SUCCEEDED` powstają w jednej transakcji;
- po rollbacku zapisywany jest `FAILED`;
- operacje wrażliwe wymagają `auth_time` nie starszego niż 5 minut;
- dane finansowe i audyt nie są dostępne z tenantowych endpointów;
- sekrety nie trafiają do logów, audytu ani frontendu;
- konfiguracja pochodzi wyłącznie ze środowiska.

## Weryfikacja integracji

W pełnym repozytorium hosta należy wykonać:

```text
npm test
npm --prefix web-app run lint
npm --prefix web-app run build
npm run migrate:cleanzi-admin:audit
```

`migrate:cleanzi-admin:apply` wymaga oddzielnej zgody na konkretną bazę. Publikacja tej dystrybucji nie wykonuje migracji ani wdrożenia.
