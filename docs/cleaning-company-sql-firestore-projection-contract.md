# Cloud SQL i projekcja Firestore firmy sprzątającej

Status: implementacja znajduje się w PR #4, bez wykonania migracji, podłączenia
publicznego formularza, ustawienia sekretów i wdrożenia.

## Źródło prawdy

Cloud SQL pozostaje źródłem prawdy dla próby rejestracji, dowodu zgód,
organizacji, ownera, profilu firmy, subskrypcji i wykorzystania triala. Firestore
jest wyłącznie prywatną projekcją potrzebną backendowi zaproszeń. Błąd Firestore
nie może wycofać organizacji ani zmienić dat triala w Cloud SQL.

Adapter `postgres-registration-attempt-authority.js` w jednej transakcji
`REPEATABLE READ READ ONLY` sprawdza:

- `registrationId`, hash jednorazowego tokenu i niewygasłą próbę przed pierwszym
  związaniem; po związaniu dopuszcza wyłącznie dokładny retry tego samego UID,
  `orgId` i `broker_operation_id`, także po pierwotnym terminie ważności;
- e-mail, właściciela, telefon, plan, cykl, locale i strefę czasową;
- zaakceptowane, wersjonowane `TERMS` i `PRIVACY_POLICY`;
- jawny rekord niezależnej decyzji `MARKETING`, także dla odmowy, zgodny z wyborem
  newslettera, locale i wymaganym pochodzeniem dowodu;
- przy retry: ten sam deterministyczny UID, `orgId` i `broker_operation_id`.

Surowy token występuje tylko w pamięci adaptera. Provisioner otrzymuje wyłącznie
jego SHA-256. Hasło nigdy nie trafia do tego adaptera ani do SQL.

## Transakcja organizacji

`postgres-cleaning-company-provisioner.js` ponownie blokuje i sprawdza próbę,
a następnie w jednej transakcji `SERIALIZABLE` tworzy:

- organizację `CLEANING_PROVIDER` ze statusem onboardingu `IN_PROGRESS`;
- ownera w `worker` oraz nieoperacyjny membership `OWNER/ONBOARDING`;
- pusty szkic `organization_company_profile` — prawdziwa nazwa prawna jest
  obowiązkowa dopiero przy końcu onboardingu;
- subskrypcję `TRIAL/TRIALING` na dokładnie `14 × 24 h`, bez karty i bez
  automatycznej konwersji;
- jednorazowe `trial_redemption`, zdarzenie subskrypcji, zgody użytkownika i audyt;
- zdarzenie `CLEANING_PROVIDER_REGISTERED` w outboxie;
- powiązanie źródłowej próby z UID, organizacją i operacją brokera oraz zużycie
  hasha tokenu.

Powtórzenie operacji odczytuje istniejący graf i nie wydłuża triala. Potwierdzony
błąd przed `COMMIT` pozwala brokerowi usunąć dopiero co utworzone konto Auth.
Nieznany wynik `COMMIT` jest najpierw rekonsyliowany po `broker_operation_id`;
jeśli wynik nadal jest nieznany, operacja przechodzi do `RECOVERY_REQUIRED` i konto
Auth nie jest automatycznie usuwane.

## Projekcja i aktywacja zaproszeń

Transakcja SQL zapisuje outbox, a osobny worker wykonuje idempotentną projekcję:

- `organizations/{orgId}`;
- `organizations/{orgId}/members/{uid}`;
- `cleaningProviderProfiles/{uid}`.

Pierwsze zdarzenie ustawia organizację i profil na `onboarding`. To celowo nie
spełnia kontraktu backendu zaproszeń. Użytkownik nie może występować jako aktywna
firma sprzątająca, dopóki nie poda prawdziwej nazwy prawnej i nie ukończy
obowiązkowego onboardingu.

Po ukończeniu onboardingu portal musi, wewnątrz tej samej zaufanej transakcji SQL,
wywołać `enqueueCleaningProviderActivation(...)` z tokenem zweryfikowanym przez
Firebase Admin. Funkcja wymaga zgodnego UID, `email_verified=true`,
`onboarding_status=COMPLETED`, roli `OWNER`, membershipu `ONBOARDING` lub
idempotentnego `ACTIVE` i niepustej nazwy prawnej. Następnie atomowo aktywuje
organizację, ownera i membership oraz zapisuje zdarzenie
`CLEANING_PROVIDER_ACTIVATED`. Do tej chwili istniejące zapytania Data Connect,
które wymagają membershipu `ACTIVE`, nie udostępniają operacyjnego API. Dopiero
projekcja aktywacji ustawia również status `active` zgodny z backendem zaproszeń.

Jeżeli owner ma kilka organizacji, projekcja nie nadpisuje istniejącego
`defaultOrganizationId`. Autoryzacja operacyjna nadal musi używać jawnego membershipu
wybranej organizacji; profil Firestore nie jest źródłem uprawnień.

## Migracja lokalna

Plik `registration-functions/sql/20260802_cleaning_company_password_registration.sql`:

- wymaga wcześniejszych migracji publicznej rejestracji `003` i `004`;
- dodaje identyfikator operacji brokera oraz typ organizacji;
- tworzy transakcyjny outbox z leasingiem, retry i stanem dostarczenia;
- ustawia katalogowy trial `TRIAL` na 14 dni.

Migracja nie została wykonana. Przed uruchomieniem trzeba porównać ją z faktycznym
schematem docelowego Cloud SQL, wykonać backup, przygotować rollback i użyć
osobnej zgody właściciela.

## Pozostałe podłączenia

- publiczny formularz musi zapisać ownera i zgody przed wywołaniem brokera oraz
  przestać używać klientowego `createUserWithEmailAndPassword`;
- host Functions musi zbudować prywatny pool PostgreSQL i wstrzyknąć adaptery;
- trzeba dodać zatwierdzony adapter Resend, politykę haseł i limit nadużyć;
- worker outboxa musi być uruchamiany cyklicznie i monitorowany;
- portalowy koniec onboardingu musi zapisywać zdarzenie aktywacji w swojej
  transakcji SQL;
- test projektu testowego musi objąć Auth, Cloud SQL, Firestore, App Check,
  Turnstile, e-mail i rollback. Produkcja pozostaje poza zakresem.
