# Cleanzi — dostarczalność wiadomości rejestracyjnych

## Cel

Produkcyjna wiadomość ma być wysyłana jako markowy komunikat Cleanzi, z domeny
`auth.cleanzi.pl` i po polsku. Projekty testowe nie mogą domyślnie wysyłać
prawdziwych wiadomości.

## Stan wejściowy potwierdzony 2026-08-23

- produkcja wysyłała z technicznego adresu `noreply@iclean-room.firebaseapp.com`;
- domyślny szablon był angielski i używał technicznej nazwy projektu;
- Gmail zaklasyfikował wiadomość jako spam mimo przyjęcia żądania przez Firebase bez opóźnienia;
- projekt `cleanzi-portal-klienta-test` również wysłał prawdziwy mail na zwykły adres;
- `cleanzi.pl` ma DKIM i DMARC `p=none`; publiczny odczyt nie wykazał rekordu SPF na domenie głównej;
- język szablonów Firebase jest ustawiony na angielski, nazwa nadawcy nie jest podana,
  a niestandardowy SMTP jest wyłączony;
- Email/Password, Google oraz Email link (logowanie bez hasła) są włączone;
- `portal.cleanzi.pl` jest domeną autoryzowaną, a `auth.cleanzi.pl` nie ma jeszcze
  konfiguracji DNS wymaganej przez Firebase.

## Konfiguracja docelowa

- domena nadawcza: `auth.cleanzi.pl`;
- nadawca: `Cleanzi <rejestracja@auth.cleanzi.pl>`;
- Reply-To: `kontakt@cleanzi.pl`;
- temat i treść: `ops/firebase-auth/email-signin-template.pl.json` oraz
  `ops/firebase-auth/email-signin.pl.html`;
- globalny Action URL pozostaje przy domyślnej obsłudze Firebase. To ustawienie dotyczy
  wszystkich szablonów, także resetu hasła, odzyskania adresu i weryfikacji e-mail;
  zmiana wymaga osobnego wdrożenia obsługi trybów `resetPassword`, `recoverEmail`
  i `verifyEmail`;
- dostawca Email link pozostaje aktywny wyłącznie w produkcji;
- testy korzystają z Firebase Auth Emulator. Awaryjne włączenie prawdziwej wysyłki
  w nieprodukcyjnym buildzie wymaga jawnego `VITE_AUTH_EMAIL_DELIVERY_MODE=firebase-test-explicit`.

## Preflight przed zmianą produkcji

1. Odczytać bieżący szablon, metodę wysyłki i konfigurację domeny z Firebase Auth.
2. W Firebase Authentication > Templates rozpocząć konfigurację własnej domeny
   nadawczej `auth.cleanzi.pl` i skopiować wygenerowane przez Firebase rekordy TXT/CNAME.
3. Dodać rekordy w DNS bez tworzenia drugiego rekordu SPF. Jeśli Firebase wymaga SPF
   na domenie głównej, połączyć mechanizmy w jednym rekordzie; preferowana jest
   izolacja na `auth.cleanzi.pl`.
4. Poczekać na status `Verification complete`; samo zapisanie DNS nie jest dowodem.
5. Po weryfikacji domeny ustawić język polski, nazwę nadawcy `Cleanzi`, adres
   `rejestracja@auth.cleanzi.pl` i Reply-To `kontakt@cleanzi.pl`. Nie zmieniać
   globalnego Action URL w tym wydaniu.
6. Wgrać polski temat i treść wyłącznie metodą potwierdzoną jako obsługiwana przez
   bieżącą konfigurację Identity Platform. Jeżeli konsola nadal blokuje edycję treści,
   nie obchodzić tego ograniczenia niezweryfikowanym wywołaniem API.
7. W projekcie testowym wyłączyć Email link sign-in albo skierować go wyłącznie
   do emulatora; nie wykonywać testu na zwykłym adresie bez osobnej zgody.

## Odbiór

- jedna kontrolowana wiadomość na jawnie zatwierdzoną skrzynkę testową;
- czas od żądania do pojawienia się wiadomości zapisany oddzielnie od folderu docelowego;
- nagłówki potwierdzają `SPF=PASS`, `DKIM=PASS` oraz `DMARC=PASS` i zgodność domen;
- nadawca, temat i polska treść są zgodne z kandydatem;
- link nadal korzysta ze zweryfikowanej domyślnej obsługi akcji Firebase i po
  zalogowaniu przekierowuje do `portal.cleanzi.pl`;
- link działa tylko dla adresu, na który go wysłano, i prowadzi do onboardingu;
- drugie kliknięcie oraz link po wygaśnięciu kończą się bez utworzenia firmy;
- niezmienione pozostają Google Sign-In i logowanie istniejącego użytkownika.

## Rollback

- natychmiast wyłączyć publiczną rejestrację istniejącym przełącznikiem;
- przywrócić poprzedni szablon/metodę nadawania w Firebase Auth;
- wycofać rewizję portalu; rekordów DNS nie usuwać przed potwierdzeniem, że poprzedni
  nadawca znów działa.
