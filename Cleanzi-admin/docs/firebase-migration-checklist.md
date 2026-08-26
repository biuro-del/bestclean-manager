# Checklista przeniesienia Firebase i środowiska

## 1. Konfiguracja bez zmian w kodzie

- [ ] Utwórz docelowy projekt Firebase i Web App.
- [ ] Ustaw `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` i `VITE_FIREBASE_APP_ID`.
- [ ] Ustaw backendowe `FIREBASE_PROJECT_ID` oraz bezpieczne poświadczenia Firebase Admin.
- [ ] Ustaw niezależnie `FIREBASE_DATACONNECT_LOCATION`, `FIREBASE_DATACONNECT_SERVICE` i `FIREBASE_DATACONNECT_CONNECTOR`.
- [ ] Ustaw `VITE_PLATFORM_API_BASE` albo pozostaw same-origin `/api`.
- [ ] Ustaw połączenie Cloud SQL przez `DATABASE_URL` albo `CLOUD_SQL_CONNECTION_NAME`/`DB_*`.
- [ ] Pozostaw `BILLING_PROVIDER=NONE`, dopóki nie zostanie wdrożony i zatwierdzony adapter.
- [ ] Umieść sekrety MFA, SMTP, bazy i przyszłego operatora w Secret Manager.
- [ ] Dla szablonu `apphosting.yaml` utwórz sekrety `CLEANZI_FIREBASE_WEB_API_KEY`, `CLEANZI_FIREBASE_AUTH_DOMAIN`, `CLEANZI_FIREBASE_PROJECT_ID`, `CLEANZI_FIREBASE_APP_ID`, `CLEANZI_DATACONNECT_LOCATION`, `CLEANZI_DATACONNECT_SERVICE`, `CLEANZI_DATACONNECT_CONNECTOR`, `CLEANZI_CLOUD_SQL_CONNECTION_NAME` i `CLEANZI_DB_NAME`.

## 2. Firebase Auth i PLATFORM_OWNER

- [ ] Włącz obsługiwane metody logowania i MFA w docelowym Firebase Auth.
- [ ] Utwórz konto PLATFORM_OWNER i oznacz email jako zweryfikowany.
- [ ] Skonfiguruj co najmniej jeden wspierany drugi składnik.
- [ ] Nadaj custom claim `{ "platformRole": "PLATFORM_OWNER" }` z uprzywilejowanego skryptu provisioningowego.
- [ ] Dodaj odpowiadający aktywny rekord `platform_admin` w tej samej bazie.
- [ ] Zweryfikuj, że UID nie występuje w `worker`, `organization_member` ani innym tenantowym członkostwie.
- [ ] Wymuś odświeżenie tokenu po zmianie claimu.

Nie wolno autoryzować przez email. Adres konta jest cechą tokenu, ale dostęp wynika łącznie z poprawnego tokenu, claimu, MFA i rekordu `platform_admin`.

## 3. Baza danych

- [ ] Wykonaj backup i zaplanuj okno migracyjne.
- [ ] Na kopii lokalnej uruchom `npm run migrate:cleanzi-admin:audit`.
- [ ] Uruchom testy migracji przez `npm test`.
- [ ] Na lokalnej/kontrolnej bazie uruchom `npm run migrate:cleanzi-admin:apply` dwa razy; drugie uruchomienie ma być no-op.
- [ ] Sprawdź zgodność sum kontrolnych w `platform_schema_migration`.
- [ ] Zweryfikuj istniejące rekordy `organization_subscription` i puste historie.
- [ ] Uzupełnij ceny planów dopiero po zatwierdzeniu cennika; do tego czasu MRR ma pozostać niedostępny.

Uruchomienie migracji na zdalnym Cloud SQL wymaga osobnej, jawnej zgody. Aplikacja nie uruchamia jej przy starcie.

## 4. Test akceptacyjny przed wdrożeniem

- [ ] `npm test` przechodzi.
- [ ] `npm --prefix web-app run lint` nie ma nowych błędów.
- [ ] `npm --prefix web-app run build` przechodzi.
- [ ] PLATFORM_OWNER z MFA widzi dashboard i wszystkie organizacje.
- [ ] OWNER/ADMIN organizacji otrzymuje 403.
- [ ] Mutacja ze starym uwierzytelnieniem otrzymuje `PLATFORM_REAUTH_REQUIRED`.
- [ ] Rollback nie zostawia częściowej subskrypcji, historii ani `SUCCEEDED`.
- [ ] Ponowienie tej samej płatności nie tworzy drugiej transakcji.
- [ ] PLATFORM_OWNER nie pojawia się w danych ani logach organizacji.
- [ ] Audyt platformy nie zawiera tokenów, haseł, kodów MFA ani sekretów.

## 5. Czynności niewykonywane przez to wdrożenie

- brak deployu do obecnego Firebase lub App Hosting;
- brak zmian w zdalnym Auth, custom claims i kontach;
- brak migracji zdalnego Cloud SQL;
- brak konfiguracji prawdziwego operatora i brak pobierania pieniędzy;
- brak modyfikacji tenantowych uprawnień zwykłych użytkowników.
