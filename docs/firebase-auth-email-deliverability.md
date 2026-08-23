# Cleanzi — dostarczalność wiadomości rejestracyjnych

## Cel

Produkcyjna wiadomość ma być wysyłana jako markowy komunikat Cleanzi, z domeny
`auth.cleanzi.pl`, po polsku i z linkiem powiązanym z domeną Cleanzi. Projekty testowe
nie mogą domyślnie wysyłać prawdziwych wiadomości.

## Stan wejściowy potwierdzony 2026-08-23

- produkcja wysyłała z technicznego adresu `noreply@iclean-room.firebaseapp.com`;
- domyślny szablon był angielski i używał technicznej nazwy projektu;
- Gmail zaklasyfikował wiadomość jako spam mimo przyjęcia żądania przez Firebase bez opóźnienia;
- projekt `cleanzi-portal-klienta-test` również wysłał prawdziwy mail na zwykły adres;
- `cleanzi.pl` ma DKIM i DMARC `p=none`; publiczny odczyt nie wykazał rekordu SPF na domenie głównej.

## Konfiguracja docelowa

- domena nadawcza i domena akcji: `auth.cleanzi.pl`;
- nadawca: `Cleanzi <rejestracja@auth.cleanzi.pl>`;
- Reply-To: `kontakt@cleanzi.pl`;
- temat i treść: `ops/firebase-auth/email-signin-template.pl.json` oraz
  `ops/firebase-auth/email-signin.pl.html`;
- dostawca Email link pozostaje aktywny wyłącznie w produkcji;
- testy korzystają z Firebase Auth Emulator. Awaryjne włączenie prawdziwej wysyłki
  w nieprodukcyjnym buildzie wymaga jawnego `VITE_AUTH_EMAIL_DELIVERY_MODE=firebase-test-explicit`.

## Preflight przed zmianą produkcji

1. Odczytać bieżący szablon, metodę wysyłki i konfigurację domeny z Firebase Auth.
2. W Firebase Authentication > Templates > Email link sign-in dodać `auth.cleanzi.pl`
   i skopiować wygenerowane przez Firebase rekordy TXT/CNAME.
3. Dodać rekordy w DNS bez tworzenia drugiego rekordu SPF. Jeśli Firebase wymaga SPF
   na domenie głównej, połączyć mechanizmy w jednym rekordzie; preferowana jest
   izolacja na `auth.cleanzi.pl`.
4. Poczekać na status `Verification complete`; samo zapisanie DNS nie jest dowodem.
5. Wgrać polski szablon i ustawić markowego nadawcę dopiero po weryfikacji domeny.
6. W projekcie testowym wyłączyć Email link sign-in albo skierować go wyłącznie
   do emulatora; nie wykonywać testu na zwykłym adresie bez osobnej zgody.

## Odbiór

- jedna kontrolowana wiadomość na jawnie zatwierdzoną skrzynkę testową;
- czas od żądania do pojawienia się wiadomości zapisany oddzielnie od folderu docelowego;
- nagłówki potwierdzają `SPF=PASS`, `DKIM=PASS` oraz `DMARC=PASS` i zgodność domen;
- nadawca, temat, polska treść, link `auth.cleanzi.pl` i przekierowanie do
  `portal.cleanzi.pl` są zgodne z kandydatem;
- link działa tylko dla adresu, na który go wysłano, i prowadzi do onboardingu;
- drugie kliknięcie oraz link po wygaśnięciu kończą się bez utworzenia firmy;
- niezmienione pozostają Google Sign-In i logowanie istniejącego użytkownika.

## Rollback

- natychmiast wyłączyć publiczną rejestrację istniejącym przełącznikiem;
- przywrócić poprzedni szablon/metodę nadawania w Firebase Auth;
- wycofać rewizję portalu; rekordów DNS nie usuwać przed potwierdzeniem, że poprzedni
  nadawca znów działa.
