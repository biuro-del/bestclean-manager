# mobile-web

Nowa aplikacja mobilna web oparta o `stary_skrypt_mobile`, podlaczona do tej samej bazy Firebase/Data Connect.

## Co jest gotowe

- osobny entry: `apps/mobile-web/mobile.html`
- React app: `apps/mobile-web/src`
- Firebase:
  - `firebase/app`
  - `firebase/auth`
  - `firebase/data-connect`
  - `firebase/analytics`
- logowanie przez Firebase Auth + pobranie `orgId` przez `myOrganizations`
- pobieranie danych z bazy:
  - `WorkersForOrg`
  - `ZonesForOrg`
  - `ClientsForOrg`
  - `WorkdaysForOrg`
  - `EventsForOrg`
- logika workflow zblizona do starego skryptu:
  - START dnia przez kod START
  - STOP0/5/10/15
  - start/stop strefy
  - zmiana strefy (stop aktywnej + start nowej)
  - kod indywidualny moze uruchomic dzien + cykl
  - auto-domkniecie statusu `ENDING` po czasie
- widoki:
  - login
  - home (status dnia, aktywna strefa, timery)
  - skan (manual input QR)
  - zestawienie (START/STOP dnia + historia stref)
  - modal ustawien

## Co zostalo do dopiecia

- fizyczny skaner kamery QR (obecnie manual input kodu)
- pelna obsluga pauz i audytow jak w starym skrypcie
- rozszerzenie walidacji i scenariuszy granicznych (np. wielo-urzadzeniowe konflikty)
