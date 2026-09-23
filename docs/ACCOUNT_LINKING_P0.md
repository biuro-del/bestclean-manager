# Account Linking P0

## Zasada bezpieczeństwa

E-mail służy do wykrycia istniejącego konta i rozpoczęcia kontrolowanego łączenia. Dostęp do organizacji nadal wynika wyłącznie z aktywnego `organization_member.uid` zgodnego z Firebase UID oraz z powiązanego `worker.auth_uid`.

Nie wolno automatycznie przyznawać dostępu na podstawie samej domeny ani podobieństwa adresu. Konto właściciela organizacji nie jest podmieniane.

## Audyt

```powershell
$env:NODE_EXTRA_CA_CERTS = (gcloud config get-value core/custom_ca_certs_file)
npm run account-linking:audit -- --email=<VERIFIED_EMAIL> --org=<EXACT_ORG_ID>
```

Audyt musi potwierdzić:

- dokładnie jednego aktywnego użytkownika Firebase z potwierdzonym e-mailem;
- brak istniejącego członkostwa i brak referencji jego UID w bazie;
- aktywną organizację i dokładnie jednego właściciela;
- `allowDuplicateEmails=false`.

## Kontrolowane dopięcie istniejącego konta

To jest operacja produkcyjna i wymaga świeżego audytu oraz osobnej zgody na dokładny UID, e-mail i organizację.

```powershell
npm run account-linking:link-membership -- `
  --email=<VERIFIED_EMAIL> `
  --org=<EXACT_ORG_ID> `
  --confirm=CLZ-ACCOUNT-LINKING-P0-LINK-MEMBERSHIP-20260923-01 `
  --confirm-email=<VERIFIED_EMAIL> `
  --confirm-org=<EXACT_ORG_ID> `
  --confirm-uid=<EXACT_FIREBASE_UID> `
  --role=ADMIN `
  --display-name="<DISPLAY_NAME>"
```

Operacja wykonuje jedną transakcję: blokuje równoległe zmiany tożsamości, ponownie sprawdza konflikty, rezerwuje nowy identyfikator pracownika, dodaje rekord `ADMIN`, wykonuje ścisły postflight i w razie błędu robi rollback.

## Zachowanie portalu

- Ten sam e-mail istniejącego konta: rejestracja drugiej organizacji jest zatrzymana.
- Konflikt Google z istniejącym kontem hasłowym: użytkownik potwierdza stare konto, a poświadczenie Google jest dopinane do tego samego UID wyłącznie w bieżącej sesji.
- Nowy, nieużywany e-mail: zwykła rejestracja nowej organizacji działa bez zmian.
- Kilka kandydatów lub niespójne dane: fail closed i ręczny audyt.

Po dopięciu należy wylogować użytkownika, zalogować ponownie przez Google i potwierdzić, że `/api/auth/session-context` zwraca organizację docelową oraz że portal otwiera właściwy panel.
