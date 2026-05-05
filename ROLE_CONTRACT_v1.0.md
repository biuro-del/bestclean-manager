# Kontrakt Rol Systemu v1.0 (zamrozony)

Data bazowa: 4 marca 2026

Obowiazuje:
- https://mobile-web--iclean-room.europe-west4.hosted.app/
- https://iclean-room.web.app/

## 1. Zrodlo prawdy

- Tabela: `workers`.
- Uzytkownik jest aktywny, gdy spelnia jednoczesnie:
  - `workers.orgId = "bestclean"`
  - `workers.active = true`
  - `workers.role` jest jedna z: `WORKER`, `COORDINATOR`, `MANAGER`, `ADMIN`
  - powiazanie konta jest poprawne (`auth_uid` / `loginEmail` zgodne z kontem logowania)
- Brak tych warunkow oznacza brak dostepu do operacji.

## 2. Uprawnienia per rola

- `WORKER`:
  - START dnia pracy
  - STOP dnia pracy
  - CLEAN (start/stop strefy)
  - podglad grafiku
  - podglad czasu pracy
  - brak dostepu do strefy koordynatora
  - brak recznego wpisywania QR

- `COORDINATOR`:
  - wszystko jak `WORKER`
  - dostep do strefy koordynatora

- `MANAGER`:
  - identycznie jak `COORDINATOR`

- `ADMIN`:
  - wszystko jak `COORDINATOR`
  - reczne wpisywanie QR podczas skanowania

## 3. Reguly kiedy akcja jest dozwolona

- `START`: tylko gdy brak aktywnego dnia pracy.
- `CLEAN`: tylko gdy dzien pracy jest aktywny.
- Zamkniecie strefy CLEAN:
  - skan tego samego QR (`QR_SAME`) albo
  - skan nowej strefy (`QR_SWITCH`) zamyka poprzednia i uruchamia nowa.
- `STOP`: tylko gdy dzien pracy jest aktywny.
- Logika kodow `STOPx`:
  - `STOP0` = +0 min
  - `STOP5` = +5 min
  - `STOP10` = +10 min
  - `STOP15` = +15 min
- Auto status `ENDING`: o polnocy, zgodnie z ustalona regula nieaktywnosci.

## 4. Zasady zapisu danych

- GPS dla START/STOP zapisujemy do `workdays.gps`.
- Komentarz przy zamknieciu strefy/dnia: opcjonalny.
- Czas jest zapisywany w czasie lokalnym urzadzenia z offsetem oraz dodatkowo UTC.

## 5. Niezmiennosc kontraktu

- Ten kontrakt jest zamrozony jako `v1.0`.
- Kazda zmiana wymaga nowej wersji kontraktu (`v1.1+`) i jawnej akceptacji.
- Nie wprowadzamy cichych zmian rol/uprawnien miedzy etapami.
