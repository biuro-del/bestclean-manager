const DEFAULT_LANGUAGE_CODE = 'PL'
const ENABLED_LANGUAGE_CODES = new Set(['PL', 'Si'])

export const LOGIN_LANGUAGE_OPTIONS = [
  { code: 'EN', nativeName: 'English', enabled: false },
  { code: 'ES', nativeName: 'Español', enabled: false },
  { code: 'PL', nativeName: 'Polski', enabled: true },
  { code: 'Si', nativeName: 'Śląski', enabled: true },
  { code: 'D', nativeName: 'Deutsch', enabled: false },
  { code: 'FR', nativeName: 'Français', enabled: false },
  { code: 'IT', nativeName: 'Italiano', enabled: false },
  { code: 'UA', nativeName: 'Українська', enabled: false },
  { code: 'RU', nativeName: 'Русский', enabled: false },
]

const TEXTS = {
  PL: {
    'common.ok': 'OK',
    'common.close': 'Zamknij',
    'common.back': 'Wróć',
    'common.loadingData': 'Wczytywanie danych...',
    'common.syncingData': 'Synchronizacja danych...',
    'common.operationInProgress': 'Trwa operacja.',
    'common.waitServer': 'Czekaj na odpowiedź serwera...',
    'common.language': 'Język',
    'header.homeAria': 'Strona główna',
    'header.settingsAria': 'Ustawienia',
    'header.logoAria': 'Best Clean - ekran główny',
    'login.title': 'Logowanie',
    'login.loginLabel': 'Login',
    'login.passwordLabel': 'Hasło',
    'login.submit': 'Zaloguj',
    'login.submitPending': 'Logowanie...',
    'login.changeLanguage': 'Zmień język',
    'login.languageSelectAria': 'Wybór języka',
    'hud.workTime': 'Twój czas pracy',
    'hud.pauseAria': 'Pauza',
    'hud.startAria': 'Start',
    'hud.stopAria': 'Stop',
    'hud.noStart': 'BRAK START',
    'settings.title': 'Ustawienia',
    'settings.loggedInAs': 'Zalogowano',
    'settings.organization': 'Organizacja',
    'settings.language': 'Zmień język',
    'settings.logout': 'Wyloguj',
    'settings.logoutHint': 'Wylogowanie z urządzenia',
    'scan.titleDefault': 'Skanuj QR',
    'scan.subtitleDefault': 'Wpisz kod QR lub roomId.',
    'scan.status.scanning': 'Skanuje...',
    'scan.status.enterCode': 'Wpisz kod QR lub roomId.',
    'scan.status.codeRead': 'Odczytano kod: {code}',
    'scan.cameraFail': 'Nie udało się uruchomić kamery.',
    'scan.flashlightOn': 'Latarka: ON',
    'scan.flashlightOff': 'Latarka: OFF',
    'scan.flashlightUnavailable': 'Latarka niedostępna',
    'scan.manualShow': 'Wpisz ręcznie',
    'scan.manualHide': 'Ukryj wpisywanie',
    'scan.manualPrompt': 'Wpisz lub wklej kod QR / roomId.',
    'scan.inputPlaceholder': 'Kod QR / roomId',
    'scan.commentPlaceholder': 'Komentarz (opcjonalnie)',
    'scan.submit': 'Zatwierdź',
    'scan.submitPending': 'Przetwarzanie...',
    'menu.cleaningTitle': 'Sprzątanie',
    'menu.cleaningSub': 'Skanuj strefy',
    'menu.scheduleTitle': 'Grafik',
    'menu.scheduleSub': 'Tydzień',
    'schedule.title': 'Grafik pracy',
    'schedule.updatedTitle': 'Grafik zaktualizowany',
    'menu.workTimeTitle': 'Czas pracy',
    'menu.workTimeSub': 'Podsumowanie',
    'menu.coordinatorTitle': 'Koordynator',
    'menu.coordinatorSub': 'Audyt / QR',
    'pause.title': 'Pauza',
    'pause.activeBreak': 'Trwająca przerwa',
    'pause.netDayTime': 'Czas netto dnia',
    'pause.noActive': 'Brak aktywnej przerwy.',
    'pause.scanToResume': 'Skanuj QR, aby wrócić do pracy',
    'pause.returnToWork': 'Wróć do pracy',
    'workflow.scanQrButton': 'Skanuj QR',
    'workflow.todayTasksButton': 'Dzisiejsze zadania',
    'workflow.progressLabel': 'Postęp dzisiejszej pracy',
    'workflow.startTitle': 'Rozpocznij pracę',
    'workflow.scanTitle': 'Skanuj strefę',
    'workflow.cleanTitle': 'W trakcie sprzątania',
    'workflow.endTitle': 'Kończenie dnia',
    'workflow.clientLabel': 'Klient',
    'workflow.zoneLabel': 'Strefa',
    'workflow.locationLabel': 'Lokalizacja',
    'workflow.zoneTimeLabel': 'Czas strefy',
    'workflow.autoCloseIn': 'Auto-zamknięcie za',
    'workflow.startHelp': 'Skanuj kod QR, aby przejść dalej.',
    'workflow.endHelp': 'Zeskanuj STOP0, STOP5, STOP10 lub STOP15.',
    'workflow.scanImportant': 'WAŻNE: czas pracy już się nalicza.',
    'workflow.scanStep1': 'Kliknij „Skanuj QR”.',
    'workflow.scanStep2': 'Zeskanuj kod strefy przed rozpoczęciem sprzątania.',
    'workflow.scanStep3': 'Przy każdej zmianie strefy zeskanuj nowy kod QR.',
    'workflow.endNow': 'Zakończ teraz',
    'workflow.endNowPending': 'Trwa zamykanie...',
    'runtime.sessionExpired': 'Sesja wygasła. Zaloguj się ponownie.',
    'runtime.scanProcessingFailed': 'Nie udało się przetworzyć skanu.',
    'runtime.noActiveWorkdayStartFirst': 'Brak aktywnego dnia pracy. Najpierw zeskanuj START.',
    'runtime.pauseOnlyRunning': 'Pauza jest dostępna tylko podczas aktywnego dnia (RUNNING).',
    'runtime.pauseStarted': 'Rozpoczęto przerwę.',
    'runtime.pauseAlreadyOpen': 'Masz już aktywną przerwę.',
    'runtime.pauseNotOpen': 'Brak aktywnej przerwy.',
    'runtime.pauseEndedBackToScan': 'Przerwa zakończona. Wróć do skanowania stref.',
    'runtime.pauseEnded': 'Przerwa zakończona.',
    'runtime.pauseStartFailed': 'Nie udało się rozpocząć przerwy.',
    'runtime.workdayCloseFailed': 'Nie udało się zakończyć dnia pracy.',
    'runtime.workdayAlreadyActive': 'Dzień pracy jest już aktywny.',
    'runtime.workdayStarted': 'Rozpoczęto dzień pracy.',
    'runtime.workdayStartedStart': 'Rozpoczęto dzień pracy (START).',
    'runtime.enterQrCode': 'Wpisz kod QR.',
    'runtime.qrNotFoundInZones': 'Nie znaleziono kodu QR w tabeli stref.',
    'runtime.noActiveWorkdayScanStart': 'Brak aktywnego dnia. Najpierw zeskanuj START.',
    'runtime.pauseResumeByCleanQr': 'Aktywna pauza. Aby wrócić do pracy, zeskanuj QR CLEAN, zlecenia indywidualnego lub strefy specjalnej.',
    'runtime.noActiveWorkdayScanStartOrZone': 'Brak aktywnego dnia. Zeskanuj START lub kod strefy/zlecenia.',
    'runtime.qrDataLoaded': 'Wczytano dane QR.',
    'runtime.cleanStartedWithZone': 'Rozpoczęto sprzątanie: {zone}.',
    'runtime.cleanStartedWorkdayAndZone': 'Rozpoczęto dzień i sprzątanie strefy.',
    'runtime.zoneChangedTo': 'Zmiana strefy na: {zone}.',
    'runtime.zoneCleaningFinished': 'Zakończono sprzątanie tej strefy.',
    'runtime.workdayClosingStarted': 'Rozpoczęto kończenie dnia.',
    'runtime.workdayClosed': 'Zakończono dzień pracy.',
    'runtime.graceMinutesAdded': 'Doliczono {minutes} min (STOP{stop}).',
    'runtime.additionalClosedEntries': 'Dodatkowo zamknięto {count} zaległych wpisów dnia.',
    'runtime.loginInvalid': 'Niepoprawny login lub hasło.',
    'runtime.loginEmailInvalid': 'Niepoprawny format email (użyj np. login@bestclean.pl).',
    'runtime.loginProviderDisabled': 'W Firebase Auth jest wyłączony provider Email/Password.',
    'runtime.loginTooManyRequests': 'Za dużo prób logowania. Spróbuj ponownie za chwilę.',
    'runtime.authNoConnection': 'Brak połączenia z Firebase Auth.',
    'runtime.loginFailed': 'Nie udało się zalogować do Firebase Auth.',
    'runtime.enterLoginAndPassword': 'Podaj login i hasło.',
    'runtime.dataLoadFailed': 'Nie udało się pobrać danych.',
    'runtime.cameraPermissionHint': 'Nie udało się uruchomić kamery. Sprawdź uprawnienia do aparatu.',
  },
  Si: {
    'common.ok': 'OK',
    'common.close': 'Zawrzij',
    'common.back': 'Nazod',
    'common.loadingData': 'Laduja sie dane...',
    'common.syncingData': 'Synchranizacyjo danych...',
    'common.operationInProgress': 'Trwo ôperacyjo.',
    'common.waitServer': 'Poczekej na ôdpowiydź serwera...',
    'common.language': 'Godka',
    'header.homeAria': 'Strona głowno',
    'header.settingsAria': 'Sztelōngi',
    'header.logoAria': 'Best Clean - głowny ekran',
    'login.title': 'Kto żeś je?',
    'login.loginLabel': 'Login',
    'login.passwordLabel': 'Hasło',
    'login.submit': 'Zaonacz',
    'login.submitPending': 'Wchodzi...',
    'login.changeLanguage': 'Zmiyń godka',
    'login.languageSelectAria': 'Wybōr godki',
    'hud.workTime': 'Twoja szychta',
    'hud.pauseAria': 'Pauza',
    'hud.startAria': 'Start',
    'hud.stopAria': 'Stop',
    'hud.noStart': 'BRAK START',
    'settings.title': 'Sztelōngi',
    'settings.loggedInAs': 'Zalogowany',
    'settings.organization': 'Ôrganizacyjo',
    'settings.language': 'Zmiyń godka',
    'settings.logout': 'Wyloguj',
    'settings.logoutHint': 'Wylogowanie z ôrzdzynio',
    'scan.titleDefault': 'Zaōnacz QR',
    'scan.subtitleDefault': 'Wpisz kod QR abo roomId.',
    'scan.status.scanning': 'Zaōnacz...',
    'scan.status.enterCode': 'Wpisz kod QR abo roomId.',
    'scan.status.codeRead': 'Ôdczytany kod: {code}',
    'scan.cameraFail': 'Niy szło ôdpolić kamery.',
    'scan.flashlightOn': 'Latarka: ON',
    'scan.flashlightOff': 'Latarka: OFF',
    'scan.flashlightUnavailable': 'Latarka niydostympno',
    'scan.manualShow': 'Wpisz ryncznie',
    'scan.manualHide': 'Skryj wpisowanie',
    'scan.manualPrompt': 'Wpisz abo wklij kod QR / roomId.',
    'scan.inputPlaceholder': 'Kod QR / roomId',
    'scan.commentPlaceholder': 'Kōmyntorz (niyobowionzkowo)',
    'scan.submit': 'Zatwiyrdź',
    'scan.submitPending': 'Przetworzanie...',
    'menu.cleaningTitle': 'Sprzōntanie',
    'menu.cleaningSub': 'Zaōnacz strefy',
    'menu.scheduleTitle': 'Nasztelowane szychty',
    'menu.scheduleSub': 'Tydziyń',
    'schedule.title': 'Nasztelowane szychty',
    'schedule.updatedTitle': 'Nasztelowane szychty zaktualizowane',
    'menu.workTimeTitle': 'Czas roboty',
    'menu.workTimeSub': 'Wszyjsko do kupy',
    'menu.coordinatorTitle': 'Majster',
    'menu.coordinatorSub': 'Audyt / QR',
    'pause.title': 'Pauza',
    'pause.activeBreak': 'Aktiwno pauza',
    'pause.netDayTime': 'Twoja szychta',
    'pause.noActive': 'Niy ma aktywnej pauzy.',
    'pause.scanToResume': 'Zaōnacz QR, coby wrōcić do roboty',
    'pause.returnToWork': 'Wroć do roboty',
    'workflow.scanQrButton': 'Zaōnacz QR',
    'workflow.todayTasksButton': 'Dzisiejsze zadania',
    'workflow.progressLabel': 'Postymp dzisiejszyj roboty',
    'workflow.startTitle': 'Zacznij robota',
    'workflow.scanTitle': 'Zaōnacz strefa',
    'workflow.cleanTitle': 'W czasie sprzōntanio',
    'workflow.endTitle': 'Kōńczenie dnia',
    'workflow.clientLabel': 'Klijynt',
    'workflow.zoneLabel': 'Strefa',
    'workflow.locationLabel': 'Lokalizacyjo',
    'workflow.zoneTimeLabel': 'Czas strefy',
    'workflow.autoCloseIn': 'Auto-zawarcie za',
    'workflow.startHelp': 'Zaōnacz kod QR, coby iść dali.',
    'workflow.endHelp': 'Zaōnacz STOP0, STOP5, STOP10 abo STOP15.',
    'workflow.scanImportant': 'WAZNE: czas roboty już leci.',
    'workflow.scanStep1': 'Kliknij „Zaōnacz QR”.',
    'workflow.scanStep2': 'Zaōnacz kod strefy przed zaczynciem sprzōntanio.',
    'workflow.scanStep3': 'Przi każdej zmianie strefy zaōnacz nowy kod QR.',
    'workflow.endNow': 'Zakōńcz terozki',
    'workflow.endNowPending': 'Zawiyranie trwo...',
    'runtime.sessionExpired': 'Sesyjo wygasła. Zaloguj sie zaś.',
    'runtime.scanProcessingFailed': 'Niy szło przetworzić skanu.',
    'runtime.noActiveWorkdayStartFirst': 'Niy ma aktywnego dnia roboty. Nejprzōd zaōnacz START.',
    'runtime.pauseOnlyRunning': 'Pauza je ino przi aktywnym dniu (RUNNING).',
    'runtime.pauseStarted': 'Pauza zaczęto.',
    'runtime.pauseAlreadyOpen': 'Możesz już aktywno pauza.',
    'runtime.pauseNotOpen': 'Niy ma aktywnej pauzy.',
    'runtime.pauseEndedBackToScan': 'Pauza zakōńczono. Wroć do skanowanio stref.',
    'runtime.pauseEnded': 'Pauza zakōńczono.',
    'runtime.pauseStartFailed': 'Niy szło zaczōnć pauzy.',
    'runtime.workdayCloseFailed': 'Niy szło zakōńczyć dnia roboty.',
    'runtime.workdayAlreadyActive': 'Dziyń roboty już je aktywny.',
    'runtime.workdayStarted': 'Dziyń roboty zaczęty.',
    'runtime.workdayStartedStart': 'Dziyń roboty zaczęty (START).',
    'runtime.enterQrCode': 'Wpisz kod QR.',
    'runtime.qrNotFoundInZones': 'Niy szło znaleźć kodu QR w tabeli stref.',
    'runtime.noActiveWorkdayScanStart': 'Niy ma aktywnego dnia. Nejprzōd zaōnacz START.',
    'runtime.pauseResumeByCleanQr': 'Aktywno pauza. Coby wrōcić do roboty, zaōnacz QR CLEAN, zlecenio indywidualne abo strefa specjalno.',
    'runtime.noActiveWorkdayScanStartOrZone': 'Niy ma aktywnego dnia. Zaōnacz START abo kod strefy/zlecenio.',
    'runtime.qrDataLoaded': 'Dane QR wgrane.',
    'runtime.cleanStartedWithZone': 'Zaczęto sprzōntanie: {zone}.',
    'runtime.cleanStartedWorkdayAndZone': 'Zaczęto dziyń i sprzōntanie strefy.',
    'runtime.zoneChangedTo': 'Zmiana strefy na: {zone}.',
    'runtime.zoneCleaningFinished': 'Sprzōntanie tyj strefy zakōńczone.',
    'runtime.workdayClosingStarted': 'Zaczęto kōńczenie dnia.',
    'runtime.workdayClosed': 'Zakōńczono dziyń roboty.',
    'runtime.graceMinutesAdded': 'Doliczono {minutes} min (STOP{stop}).',
    'runtime.additionalClosedEntries': 'Dodatkowo zawrzōno {count} zaległych wpisōw dnia.',
    'runtime.loginInvalid': 'Niypoprawny login abo hasło.',
    'runtime.loginEmailInvalid': 'Niypoprawny format emaila (np. login@bestclean.pl).',
    'runtime.loginProviderDisabled': 'W Firebase Auth je wyłōnczōny provider Email/Password.',
    'runtime.loginTooManyRequests': 'Za moc prōb logowanio. Sprōbuj za chwila.',
    'runtime.authNoConnection': 'Niy ma skuplowania z Firebase Auth.',
    'runtime.loginFailed': 'Niy szło zalogować do Firebase Auth.',
    'runtime.enterLoginAndPassword': 'Podej login i hasło.',
    'runtime.dataLoadFailed': 'Niy szło pobrać danych.',
    'runtime.cameraPermissionHint': 'Niy szło ôdpolić kamery. Sprawdź prawa do aparatu.',
  },
}

const DIRECT_RUNTIME_TEXT_TO_KEY = {
  'Sesja wygasła. Zaloguj się ponownie.': 'runtime.sessionExpired',
  'Nie udało się przetworzyć skanu.': 'runtime.scanProcessingFailed',
  'Brak aktywnego dnia pracy. Najpierw zeskanuj START.': 'runtime.noActiveWorkdayStartFirst',
  'Pauza jest dostępna tylko podczas aktywnego dnia (RUNNING).': 'runtime.pauseOnlyRunning',
  'Rozpoczęto przerwę.': 'runtime.pauseStarted',
  'Masz już aktywną przerwę.': 'runtime.pauseAlreadyOpen',
  'Brak aktywnej przerwy.': 'runtime.pauseNotOpen',
  'Przerwa zakończona. Wróć do skanowania stref.': 'runtime.pauseEndedBackToScan',
  'Przerwa zakończona.': 'runtime.pauseEnded',
  'Nie udało się rozpocząć przerwy.': 'runtime.pauseStartFailed',
  'Nie udało się zakończyć dnia pracy.': 'runtime.workdayCloseFailed',
  'Niepoprawny login lub hasło.': 'runtime.loginInvalid',
  'Niepoprawny format email (użyj np. login@bestclean.pl).': 'runtime.loginEmailInvalid',
  'W Firebase Auth jest wyłączony provider Email/Password.': 'runtime.loginProviderDisabled',
  'Za dużo prób logowania. Spróbuj ponownie za chwilę.': 'runtime.loginTooManyRequests',
  'Brak połączenia z Firebase Auth.': 'runtime.authNoConnection',
  'Nie udało się zalogować do Firebase Auth.': 'runtime.loginFailed',
  'Podaj login i hasło.': 'runtime.enterLoginAndPassword',
  'Nie udało się pobrać danych.': 'runtime.dataLoadFailed',
  'Dzień pracy jest już aktywny.': 'runtime.workdayAlreadyActive',
  'Rozpoczęto dzień pracy.': 'runtime.workdayStarted',
  'Rozpoczęto dzień pracy (START).': 'runtime.workdayStartedStart',
  'Wpisz kod QR.': 'runtime.enterQrCode',
  'Nie znaleziono kodu QR w tabeli stref.': 'runtime.qrNotFoundInZones',
  'Brak aktywnego dnia. Najpierw zeskanuj START.': 'runtime.noActiveWorkdayScanStart',
  'Aktywna pauza. Aby wrócić do pracy, zeskanuj QR CLEAN, zlecenia indywidualnego lub strefy specjalnej.': 'runtime.pauseResumeByCleanQr',
  'Brak aktywnego dnia. Zeskanuj START lub kod strefy/zlecenia.': 'runtime.noActiveWorkdayScanStartOrZone',
  'Wczytano dane QR.': 'runtime.qrDataLoaded',
  'Rozpoczęto dzień i sprzątanie strefy.': 'runtime.cleanStartedWorkdayAndZone',
  'Zakończono sprzątanie tej strefy.': 'runtime.zoneCleaningFinished',
  'Rozpoczęto kończenie dnia.': 'runtime.workdayClosingStarted',
  'Zakończono dzień pracy.': 'runtime.workdayClosed',
  'Skanuje...': 'scan.status.scanning',
  'Nie udało się uruchomić kamery.': 'scan.cameraFail',
  'Nie udało się uruchomić kamery. Sprawdź uprawnienia do aparatu.': 'runtime.cameraPermissionHint',
}

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeLanguageCode(value) {
  const code = toText(value)
  if (TEXTS[code]) return code
  return DEFAULT_LANGUAGE_CODE
}

function replaceTemplate(template, vars) {
  if (!vars || typeof vars !== 'object') {
    return template
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`))
}

export function normalizeMobileLanguageCode(value) {
  const code = normalizeLanguageCode(value)
  if (ENABLED_LANGUAGE_CODES.has(code)) return code
  return DEFAULT_LANGUAGE_CODE
}

export function t(languageCode, key, vars) {
  const lang = normalizeLanguageCode(languageCode)
  const fromCurrent = TEXTS[lang]?.[key]
  const fromDefault = TEXTS[DEFAULT_LANGUAGE_CODE]?.[key]
  const template = fromCurrent ?? fromDefault ?? key
  return replaceTemplate(String(template), vars)
}

export function translateRuntimeMessage(languageCode, message) {
  const text = toText(message)
  if (!text) return ''

  const lang = normalizeMobileLanguageCode(languageCode)
  if (lang === DEFAULT_LANGUAGE_CODE) {
    return text
  }

  const directKey = DIRECT_RUNTIME_TEXT_TO_KEY[text]
  if (directKey) {
    return t(lang, directKey)
  }

  let out = text

  out = out.replace(/^Odczytano kod:\s*(.+)$/u, (_, code) => t(lang, 'scan.status.codeRead', { code: toText(code) }))
  out = out.replace(/^Rozpoczęto sprzątanie:\s*(.+)\.$/u, (_, zone) => t(lang, 'runtime.cleanStartedWithZone', { zone: toText(zone) }))
  out = out.replace(/^Zmiana strefy na:\s*(.+)\.$/u, (_, zone) => t(lang, 'runtime.zoneChangedTo', { zone: toText(zone) }))
  out = out.replace(/Doliczono\s+(\d+)\s+min\s+\(STOP(\d+)\)\./gu, (_, minutes, stop) =>
    t(lang, 'runtime.graceMinutesAdded', { minutes, stop }),
  )
  out = out.replace(/Dodatkowo zamknięto\s+(\d+)\s+zaległych wpisów dnia\./gu, (_, count) =>
    t(lang, 'runtime.additionalClosedEntries', { count }),
  )
  out = out.replace('Przerwa zakończona. ', `${t(lang, 'runtime.pauseEnded')} `)
  out = out.replace('Rozpoczęto kończenie dnia.', t(lang, 'runtime.workdayClosingStarted'))
  out = out.replace('Zakończono dzień pracy.', t(lang, 'runtime.workdayClosed'))
  out = out.replace('Zakończono sprzątanie tej strefy.', t(lang, 'runtime.zoneCleaningFinished'))

  return out
}
