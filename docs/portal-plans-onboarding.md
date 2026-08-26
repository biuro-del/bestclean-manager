# Plany, logowanie i onboarding portalu

Stan kontraktu: 31 lipca 2026. Ten dokument opisuje konfigurację i bezpieczne uruchomienie zmian. Migracja i wdrożenie nie są wykonywane automatycznie.

## Polityka planów

Jedynym źródłem polityki jest `plan-policy.js`. Nowe zapisy przyjmują wyłącznie `TRIAL`, `GO_PLUS`, `PLUS` i `PRO`. Odczyt zachowuje zgodność z aliasami `DEMO → TRIAL`, `START → PLUS`, `ENTERPRISE → PRO` oraz wariantami nazwy GO+. Nieznana wartość daje `UNKNOWN` i nie przyznaje dostępu.

| Funkcja | TRIAL | GO_PLUS | PLUS | PRO |
| --- | --- | --- | --- | --- |
| Czas pracy, QR/NFC, lokalizacja, mapa, obecność | tak | tak | tak | tak |
| Dyspozycyjność, nieobecności, grafik, obsada, plan/wykonanie | nie | nie | tak | tak |
| Strefy, checklisty/dowody, jakość/SLA, rentowność, portal klienta | nie | nie | nie | tak |

`TRIAL` ma dokładnie możliwości `GO_PLUS`, lecz działa tylko ze statusem `TRIALING` i przed `trialEndsAt` (7 dni / 168 godzin od `complete-company`). Płatne plany działają wyłącznie ze statusem `ACTIVE`. Pozostałe statusy nie przyznają funkcji płatnych.

W abonamencie jest 10 aktywnych stanowisk pracowniczych. PRO zawiera jeden aktywny obiekt PRO i 20 stref na obiekt. Są to jednostki rozliczeniowe: backend zwraca `limits` i `usage` z wartością `overage`; nie blokuje zapisów po przekroczeniu.

## Firebase Auth

1. W projekcie tenantowym Firebase włącz dostawców Email/Password oraz Google.
2. Dodaj domeny portalu do listy autoryzowanych domen Firebase Auth.
3. Skonfiguruj zmienne `VITE_FIREBASE_*` frontendu i serwerowe `FIREBASE_PROJECT_ID` / `FIREBASE_WEB_API_KEY` zgodnie z istniejącą konfiguracją środowiska.
4. Nowe konto tenantowe musi mieć `email_verified=true`. Konto istniejące przed `TENANT_EMAIL_VERIFICATION_REQUIRED_FROM` zachowuje dostęp do swoich członkostw po UID bez historycznego potwierdzenia. Domyślna granica to `2026-08-01T00:00:00.000Z`; backend preferuje datę utworzenia konta Firebase, a datę członkostwa/pracownika wykorzystuje wyłącznie jako fallback zgodności. Konto bez daty i konto bez członkostwa są blokowane. Portal pozwala wysłać wiadomość ponownie i odświeżyć token po potwierdzeniu.

UID Firebase jest jedynym kluczem członkostwa. Backend nie dopasowuje dostępu po adresie e-mail. Reset hasła pozostaje ogólnym mechanizmem Firebase; interfejs nie ujawnia, jaki dostawca jest przypisany do podanego adresu. Logowanie administratora platformy pozostaje oddzielne.

## GUS BIR1

Klucz `GUS_BIR1_API_KEY` jest wyłącznie sekretem backendu. Opcjonalny `GUS_BIR1_ENDPOINT` służy do wskazania środowiska usługi. Adapter waliduje sumę kontrolną NIP, ma limit 10 zapytań na minutę na UID, timeout 8 sekund i pamięć podręczną na 6 godzin. Klucza nie wolno dodawać do zmiennych `VITE_*`.

## Stripe

Endpoint webhooka: `POST /api/billing/stripe/webhook`.

Wymagane sekrety:

- `STRIPE_SECRET_KEY`;
- `STRIPE_WEBHOOK_SECRET`;
- `STRIPE_PRICE_GO_PLUS`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`.

Każda subskrypcja Stripe musi mieć metadata `cleanzi_org_id` z identyfikatorem organizacji. Obsługiwane zdarzenia to `invoice.paid`, `invoice.payment_failed` i `customer.subscription.deleted`. Podpis i maksymalny wiek zdarzenia są weryfikowane przed połączeniem z bazą. `invoice.paid` dodatkowo pobiera subskrypcję z API Stripe i sprawdza jej status, Price ID, organizację oraz kompletność profilu rozliczeniowego. Rejestr `billing_provider_event` zapewnia idempotencję.

Portal nie tworzy Checkout samodzielnie. Registration API po idempotentnym `complete-company` może zwrócić krótkotrwały URL Stripe Checkout; portal akceptuje wyłącznie HTTPS na `checkout.stripe.com`. Organizacja pozostaje w `PAYMENT_PENDING`/`INCOMPLETE`, a dostęp może aktywować tylko zweryfikowany webhook. Ręczna aktywacja płatnego planu jest odrzucana.

## Portalowy przepływ rejestracji

Produkcja używa `VITE_REGISTRATION_API_BASE_URL=https://registration-cleanzi.web.app`; lokalnie wartość może wskazywać emulator. `registrationId` jest publicznym identyfikatorem próby. Opcjonalny `registrationToken` wraca wyłącznie w fragmencie URL, jest natychmiast usuwany z paska adresu, przechowywany krótko w `sessionStorage` i wysyłany tylko przy pierwszym bindzie `/api/registration/account`.

Kolejność portalu to: uwierzytelnienie Firebase, bind konta, zapis zgód, weryfikacja, dane właściciela i firmy, a następnie `complete-company` z Firebase Bearer tokenem i stabilnym `Idempotency-Key`. Profil jest zapisywany kanonicznie w `organization_company_profile`; `organization_profile` pozostaje wyłącznie warstwą zgodności. Użytkownik posiadający inne organizacje najpierw wybiera wejście do istniejącej organizacji albo jawnie kontynuuje nową rejestrację.

Przy wznowieniu próby `AUTH_CREATED` portal sprawdza `consentsComplete`. Zapisane już zgody prowadzą bezpośrednio do `verify` (lub ekranu potwierdzenia emaila), więc użytkownik nie musi akceptować ich ponownie.

## Migracja i uruchomienie

Migracja `Cleanzi-admin/migrations/20260731_portal_plans_onboarding.sql` jest addytywna: dopisuje definicje GO_PLUS i PLUS oraz tworzy profil organizacji i rejestr zdarzeń. Nie aktualizuje ani nie usuwa istniejących subskrypcji z kodami historycznymi.

Przed zastosowaniem migracji:

1. Odśwież poświadczenia ADC (`gcloud auth application-default login`) lub wskaż zatwierdzone konto serwisowe.
2. Wykonaj tylko audyt: `npm run migrate:cleanzi-admin:audit`.
3. Przejrzyj wynik, kopię zapasową i okno wdrożeniowe.
4. Dopiero po osobnej zgodzie uruchom `npm run migrate:cleanzi-admin:apply`.

Po migracji skonfiguruj sekrety App Hosting: `CLEANZI_API_PROXY_TARGET`, `CLEANZI_GUS_BIR1_API_KEY`, klucze Stripe i trzy Price ID. Następnie wdrażaj backend przed frontendem.

## Checklista manualna

- rejestracja e-mail, blokada przed weryfikacją, ponowne wysłanie i wznowienie sesji;
- logowanie Google oraz bezpieczny reset hasła;
- pracownik jednej firmy tworzy własną firmę i przełącza aktywną organizację bez przecieku stanu;
- transakcja `complete-company` daje OWNER, pracownika-właściciela, kanoniczny profil i dokładnie 7-dniowy Trial;
- nieukończony profil blokuje OWNER, ale nie zaproszonego pracownika; OWNER i ADMIN mogą profil edytować;
- wyszukanie poprawnego i błędnego NIP oraz obsługa timeoutu/limitu GUS;
- identyczne funkcje TRIAL i GO_PLUS oraz wygaśnięcie Trial;
- widoczność nadwyżek stanowisk, obiektów i stref bez twardej blokady;
- oddzielne blokady START/STOP oraz kodów QR z zadaniami strefowymi;
- podpis, powtórzone zdarzenie, nieznany Price ID, płatność udana/nieudana i usunięcie subskrypcji Stripe;
- `npm test`, `npm --prefix web-app run lint` i `npm run build`.
