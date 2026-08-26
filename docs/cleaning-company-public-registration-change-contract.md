# Kontrakt zmiany publicznego formularza rejestracji firmy sprzątającej

Status: gotowy kontrakt przekazania, bez zmian w repozytorium
`registration-cleanzi-current`, bez publikacji i bez wdrożenia.

## Dlaczego obecny przepływ musi się zmienić

Obecny formularz tworzy konto w przeglądarce przez
`createUserWithEmailAndPassword`, wysyła wiadomość przez klientowy
`sendEmailVerification`, a organizację tworzy dopiero po potwierdzeniu e-maila przez
`POST /api/registration/complete`. Ten porządek jest niezgodny z centralną bramką:
samodzielny signup omija walidację źródłowej próby, Turnstile i jednorazowego
grantu, a późniejsza finalizacja mogłaby utworzyć drugą organizację.

Nowy przepływ korzysta z istniejącego `registrationApi` jako źródła próby i zgód,
a z izolowanego codebase `cleanzi-registration` wyłącznie jako z brokera konta,
organizacji, triala, weryfikacji e-mail i projekcji. Nie powstaje trzeci magazyn
rejestracji.

## Zmiana w istniejącym `registrationApi`

W tym samym `registrationApi` należy dodać trasę:

```http
POST /api/registration/authorize-password
Content-Type: application/json
X-Firebase-AppCheck: <ważny token App Check>
```

Trasa wykonuje jedną transakcję PostgreSQL:

1. blokuje `registration_attempt` po `registrationId`;
2. zapisuje ostateczny e-mail, imię, nazwisko, opcjonalny telefon, `PL`, `pl-PL`,
   `Europe/Warsaw`, wybrany GO+/PLUS/PRO oraz cykl miesięczny/roczny;
3. zapisuje wersjonowane decyzje `TERMS`, `PRIVACY_POLICY` oraz niezależną decyzję
   `MARKETING` w `registration_consent`;
4. generuje kryptograficznie losowy token o co najmniej 32 bajtach;
5. zapisuje wyłącznie SHA-256 tokenu w `registration_attempt.access_token_hash`;
6. zwraca surowy `registrationToken` tylko w tej odpowiedzi.

Hasło, token Turnstile i token App Check nie trafiają do PostgreSQL. Ponowienie po
utraconej odpowiedzi może obrócić token, ale tylko zanim próba zostanie związana z
UID i organizacją. Po związaniu próby endpoint nie wydaje nowego tokenu.

## Wywołanie centralnego brokera

Formularz pobiera:

- nowy token App Check dla aplikacji webowej rejestracji;
- nowy, jednorazowy token Turnstile z akcją
  `registration_cleaning_company`;
- `registrationToken` z opisanej wyżej trasy źródłowej.

Następnie wywołuje wyłącznie endpoint Functions:

```http
POST https://europe-west3-<PROJECT_ID>.cloudfunctions.net/registerCleaningCompany
Origin: https://cleanzi.pl
Content-Type: application/json
X-Firebase-AppCheck: <ważny token>
```

```json
{
  "registrationId": "registrationID_123",
  "registrationToken": "<jednorazowy token źródłowy>",
  "idempotencyKey": "<stały klucz tej próby>",
  "email": "anna@example.com",
  "password": "<tylko pamięć żądania>",
  "firstName": "Anna",
  "lastName": "Żółć",
  "phone": "+48123123123",
  "selectedPlanCode": "PLUS",
  "billingCycle": "ANNUAL",
  "locale": "pl-PL",
  "timezone": "Europe/Warsaw",
  "consents": {
    "termsVersion": "2026-07-16",
    "privacyVersion": "2026-07-16",
    "newsletterConsent": false,
    "newsletterVersion": null
  },
  "turnstileToken": "<jednorazowy token>"
}
```

Mapowanie produktu:

- GO+ → `GO_PLUS`;
- PLUS → `PLUS`;
- PRO → `PRO`;
- miesięcznie → `MONTHLY`;
- rocznie z rabatem 20% → `ANNUAL`;
- ENTERPRISE nie jest dozwolony w publicznym payloadzie.

Każda nowa firma zaczyna od `TRIAL/TRIALING` na dokładnie 14 × 24 godziny bez
karty. Wybrany pakiet i cykl są intencją późniejszego zakupu przez Stripe, a nie
klientowym nadaniem uprawnień.

## Odpowiedź i sesja

Broker nie zwraca UID ani `orgId`. Odpowiedź ma wyłącznie stan procesu:

```json
{
  "status": "EMAIL_VERIFICATION_REQUIRED",
  "trialStartedAtMs": 1785657600000,
  "trialEndsAtMs": 1786867200000,
  "trialDays": 14,
  "emailVerified": false,
  "operationalAccess": false
}
```

Po sukcesie frontend może użyć `signInWithEmailAndPassword` z tym samym hasłem,
które nadal jest chwilowo w pamięci formularza. Ta operacja wyłącznie loguje do
utworzonego już konta; nie wolno ponownie używać `createUserWithEmailAndPassword`.
Następnie frontend usuwa z pamięci hasło, powtórzenie hasła, `registrationToken`,
token Turnstile i token App Check. Żaden z nich nie trafia do `localStorage`, URL,
telemetrii ani komunikatu błędu.

Przed potwierdzeniem e-maila reguły dostępu blokują portal. Po potwierdzeniu
użytkownik może wejść wyłącznie do obowiązkowego onboardingu profilu firmy.
Tworzenie klientów, pracowników i obsługa zaproszeń pozostają zablokowane do
ukończenia profilu i aktywacji projekcji.

Jeżeli odpowiedź ma `EMAIL_DELIVERY_PENDING`, formularz nie uznaje rejestracji za
utraconą. Zachowuje dane wyłącznie w pamięci bieżącej karty, pobiera nowy token
Turnstile i ponawia identyczną operację z tym samym `idempotencyKey`. Trial nie jest
przedłużany, a konto i organizacja nie są duplikowane.

## Elementy starego przepływu do usunięcia

- klientowe `createUserWithEmailAndPassword` i `sendEmailVerification` z rejestracji;
- finalizację, która po weryfikacji tworzy organizację, ownera i subskrypcję;
- odzyskiwanie przez tworzenie nowej próby po tym, gdy broker mógł już związać UID;
- przechowywanie flagi `authAccountCreated` jako źródła prawdy;
- klientowe uznawanie wybranego planu, ceny, statusu lub dat triala za autorytatywne.

Istniejący endpoint Stripe i finalizacja płatności pozostają osobnym etapem. Nie
wolno ich przepinać na produkcji razem z brokerem bez testu cutoveru.

## Minimalne testy repozytorium formularza

1. przed brokerem zapisano właściciela i trzy decyzje zgód;
2. hasło nie trafia do `registrationApi`, draftu, localStorage ani logów;
3. brak App Check, zły origin albo zła akcja Turnstile blokuje wywołanie;
4. ponowienie używa tego samego `idempotencyKey`, ale nowego Turnstile;
5. frontend nigdy nie tworzy konta klientowym Firebase Auth;
6. po sukcesie następuje wyłącznie sign-in, wyczyszczenie sekretów i ekran weryfikacji;
7. polskie znaki przechodzą bez utraty lub podwójnej normalizacji;
8. GO+/PLUS/PRO i MONTHLY/ANNUAL mapują się dokładnie;
9. `EMAIL_DELIVERY_PENDING` nie uruchamia drugiej organizacji ani nowego triala;
10. po potwierdzeniu e-maila użytkownik ma tylko dostęp onboardingowy.

## Kolejność kontrolowanego cutoveru

1. wdrożyć migrację SQL i zweryfikować ją audytem;
2. skonfigurować App Check i sekrety w projekcie testowym;
3. wdrożyć wyłącznie codebase `cleanzi-registration` do projektu testowego;
4. wdrożyć do projektu testowego zmianę `registrationApi` i formularza;
5. wykonać pełny test nowej oraz istniejącej rejestracji/logowania;
6. dopiero w zsynchronizowanym oknie wyłączyć klientowy self-signup nowych kont;
7. osobno zatwierdzić publikację produkcyjną.
