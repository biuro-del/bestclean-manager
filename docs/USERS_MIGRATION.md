# Users Migration (Workers sheet -> Firebase Auth + Firestore users)

## What this script does

Script location:

- `functions/scripts/migrateWorkersToFirebase.mjs`

It reads workers from the legacy Google Sheet and upserts:

1. Firebase Auth users
2. Firestore documents in `users/{uid}`
3. Custom claims: `roles`

## Safety model

- Default mode is `dry-run` (no writes).
- Use `--apply` only after checking dry-run output.

## Required prerequisites

1. Service account with access to:
   - Firebase project `iclean-room`
   - Legacy spreadsheet with workers data
2. `GOOGLE_APPLICATION_CREDENTIALS` set to service account JSON path.
3. Dependencies installed in `functions/`:
   - `npm install`

## Commands

Run from `functions/` directory:

```bash
npm run migrate:workers:dry-run
```

Apply changes:

```bash
npm run migrate:workers:apply
```

## Configuration via env vars

- `FIREBASE_PROJECT_ID` (default: `iclean-room`)
- `WORKERS_SPREADSHEET_ID` (default: legacy spreadsheet from config)
- `WORKERS_SHEET_GID` (default: `976340991`)
- `AUTH_LOGIN_DOMAIN` (default: `auth.iclean.local`)
- `AUTH_EMAIL_MODE`
  - `technical` (default): auth email = `<login>@auth.iclean.local`
  - `prefer_sheet_email`: use sheet email when present, fallback to technical email
- `UPDATE_EXISTING_PASSWORDS`
  - `false` (default): do not overwrite passwords for existing users
  - `true`: update passwords from sheet for existing users

## Notes

- Login uniqueness is enforced by script (duplicates in sheet are reported as errors).
- If row is invalid (for example bad login format), it is skipped and reported.
- New users require password value in sheet.
