# Best Clean - React + Firebase migration

Repozytorium zawiera nową aplikację React, która zastąpi wersję Google Apps Script.

## Dokumenty projektu

- Plan migracji: `docs/MIGRATION_PLAN.md`
- Mapowanie danych: `docs/DATA_MODEL_MAP.md`
- Migracja użytkowników: `docs/USERS_MIGRATION.md`
- Status workday/cycles API: `docs/WORKDAY_CYCLES_STATUS.md`

## Lokalne uruchomienie frontendu

```bash
npm install
npm run dev
```

## Konfiguracja Firebase (szkielet)

W repo są dodane pliki:

- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/` (backend API scaffold)

Przed pierwszym deployem ustaw prawidłowy Firebase `projectId` (małe litery) w `.firebaserc`.

## Lokalne uruchomienie Functions

```bash
cd functions
npm install
npm run serve
```

## Priorytet prac

1. Najpierw parytet funkcjonalny 1:1 względem źródła.
2. Następnie pełna migracja danych i walidacja.
3. Na końcu redesign UI.

## Aktualny status logowania

- Logowanie wspiera `login` lub `e-mail`.
- Login bez `@` mapuje się do technicznego adresu auth: `<login>@auth.iclean.local` (konfigurowalne przez `VITE_AUTH_LOGIN_DOMAIN`).
- Single-device jest aktywne: nowe logowanie unieważnia poprzednią sesję.
- Konto z `users/{uid}.active = false` jest blokowane przy logowaniu.
