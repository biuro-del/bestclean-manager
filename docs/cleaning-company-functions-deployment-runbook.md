# Izolowany codebase Functions rejestracji firmy sprzątającej

Status: przygotowany lokalnie, bez konfiguracji projektu Firebase, migracji,
sekretów, wysyłki e-maili i wdrożenia.

## Zakres codebase

Plik `firebase.registration.json` definiuje wyłącznie codebase
`cleanzi-registration` ze źródłem `registration-functions`. Nie zawiera hostingu,
Firestore rules, Storage ani Data Connect, więc zakresowe polecenie nie obejmuje
pozostałych części portalu.

Eksporty:

- `registerCleaningCompany` — publiczny POST, ale dopiero po dokładnym CORS,
  App Check, Turnstile, limicie nadużyć i autoryzacji źródłowej próby;
- `drainCleaningCompanyProjectionOutbox` — prywatny harmonogram co minutę,
  idempotentnie przenoszący projekcję SQL → Firestore;
- `reconcileCleaningCompanyProjections` — prywatny przez Cloud IAM ręczny POST do
  ograniczonego uruchomienia jednego batcha.

Region wszystkich trzech funkcji to `europe-west3`, zgodny z Cloud SQL i Data
Connect. Runtime to Node.js 22. Codebase używa osobnej nazwy, aby wdrożenie nie
proponowało usuwania funkcji należących do innych repozytoriów.

## Sekrety

W Secret Manager muszą istnieć i być związane tylko z wymagającymi ich funkcjami:

- `DATABASE_URL` — istniejący serwerowy URL tej samej źródłowej bazy rejestracji;
- `CLEANZI_REGISTRATION_HMAC_SECRET` — nowy losowy sekret co najmniej 32-bajtowy;
- `TURNSTILE_SECRET_KEY` — istniejący serwerowy sekret widgetu rejestracji;
- `RESEND_API_KEY` — istniejący serwerowy klucz konta Cleanzi.

Nie zapisujemy wartości w repozytorium, `.firebaserc`, zmiennych `NEXT_PUBLIC_*`,
`VITE_*` ani dokumentacji. Ustawianie sekretów i nadawanie IAM wymagają osobnej
zgody właściciela.

## Parametry niesekretne

Przed testowym wdrożeniem trzeba jawnie ustawić:

- `CLEANZI_REGISTRATION_APP_CHECK_APP_IDS` — dokładny App ID publicznej aplikacji
  webowej; bez wartości wdrożenie ma się zatrzymać;
- `CLEANZI_REGISTRATION_ALLOWED_ORIGINS`;
- `CLEANZI_REGISTRATION_ALLOWED_HOSTNAMES`;
- `CLEANZI_VERIFICATION_CONTINUE_URL`;
- `CLEANZI_VERIFICATION_FROM` i opcjonalny reply-to;
- nazwy trzech prywatnych kolekcji Firestore, jeżeli mają różnić się od domyślnych.

Pliki `.env.<projectId>` są ignorowane przez Git. Nie należy ich kopiować między
projektem testowym a produkcyjnym.

## Bramka przed wdrożeniem testowym

1. `npm ci` w `registration-functions` na Node.js 22 lub nowszym;
2. `npm run verify:deploy`;
3. `npm run test:emulator`;
4. audyt migracji `sql/20260802_cleaning_company_password_registration.sql`;
5. potwierdzony App Check dla aplikacji webowej;
6. potwierdzone domeny Turnstile i zweryfikowany nadawca Resend;
7. testowa baza lub zatwierdzony izolowany schemat — nigdy automatycznie produkcja;
8. plan rollbacku bez kasowania UID przy nieznanym wyniku commita.

Zakresowe polecenie po osobnej zgodzie musi zawsze wskazywać projekt testowy:

```powershell
firebase --config firebase.registration.json `
  --project <TEST_PROJECT_ID> `
  deploy --only functions:cleanzi-registration
```

Nie używać szerokiego `firebase deploy`. Nie wykonywać powyższego polecenia dla
`iclean-room` bez osobnej zgody produkcyjnej.

## Manualna rekonsyliacja projekcji

Prywatny endpoint ma `invoker: "private"`; sam URL nie stanowi autoryzacji. Po
wdrożeniu testowym można nadać minimalnej wskazanej tożsamości rolę invokera i
wywołać POST z body `{ "limit": 20 }`. Odpowiedź zawiera wyłącznie liczniki
`claimed`, `delivered`, `failed`, bez danych organizacji.

`RECOVERY_REQUIRED` z nieznanego wyniku commita organizacji nie jest automatycznie
naprawiany przez ten endpoint. Najpierw należy porównać Firebase UID, źródłowy
`registration_attempt`, graf organizacji i outbox; dopiero potem podjąć jawnie
udokumentowaną decyzję. Automatyczne usunięcie UID jest zabronione.
