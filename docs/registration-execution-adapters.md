# Adaptery wykonawcze brokera rejestracji

Status: implementacja i eksporty Functions gotowe lokalnie. Nie wykonano prawdziwej
walidacji Turnstile, zapytania Pwned Passwords ani wysyłki Resend. Nie dodano
wartości sekretów, nie zmieniono projektu Firebase i nie wykonano wdrożenia.

Wiązanie adapterów znajduje się w `registration-runtime.js`, a eksporty w
`index.js`. Publiczny handler wymaga dokładnego originu i App Check przed wejściem
do brokera. Harmonogram i ręczny endpoint rekonsyliacji korzystają wyłącznie z
sekretu bazy oraz nie zwracają danych organizacji.

## Turnstile

`cloudflare-turnstile-verifier.js` wywołuje wyłącznie serwerowe Siteverify,
przekazuje sekret i token jako `application/x-www-form-urlencoded`, wymaga zwrotu
akcji `registration_cleaning_company` i pozostawia brokerowi ostateczną kontrolę
hosta. Przejściowa awaria może być ponowiona maksymalnie raz z tym samym,
deterministycznym UUID `idempotency_key`; token ani sekret nie są zapisywane.

Kontrakt odpowiada oficjalnej dokumentacji Cloudflare: token jest ważny pięć minut,
jest jednorazowy, a serwerowa walidacja oraz kontrola akcji i hosta są obowiązkowe:
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

## Polityka hasła

`password-policy.js`:

- normalizuje hasło do Unicode NFC przed polityką i Firebase Auth;
- wymaga co najmniej 15 znaków Unicode i pozwala na długie frazy bez reguł składu;
- odrzuca znaki kontrolne/formatujące, hasła kontekstowe Cleanzi/użytkownika oraz
  hasła obecne w bazie skompromitowanych;
- korzysta z Pwned Passwords przez k-anonimowość: wysyła tylko pierwsze pięć znaków
  SHA-1 i żąda paddingu odpowiedzi; pełne hasło nie opuszcza procesu;
- działa fail-closed, gdy zewnętrzna kontrola jest niedostępna.

Zasady długości, braku sztucznych reguł składu i obowiązkowej listy blokad wynikają
z NIST SP 800-63B:
https://pages.nist.gov/800-63-4/sp800-63b.html

Kontrakt k-anonimowości i `Add-Padding`:
https://haveibeenpwned.com/API/V3#PwnedPasswords

## Limit nadużyć

`firestore-registration-abuse-guard.js` prowadzi dwa atomowe liczniki w prywatnej
kolekcji Firestore: dla próby rejestracji oraz HMAC e-maila. Dokumenty nie zawierają
surowego e-maila, registrationId, IP ani User-Agent. Awaria Firestore blokuje
rejestrację. Parametry limitów pozostają konfiguracją serwerową.

## Resend i trwała idempotencja

`resend-verification-mailer.js` wysyła przez serwerowe `POST /emails`, używa stałego
`Idempotency-Key`, bezpiecznego HTML i wyłącznie polskiego szablonu weryfikacyjnego.
Klucz API występuje tylko w nagłówku serwerowego wywołania.

Resend przechowuje idempotency key przez 24 godziny. Dlatego
`firestore-verification-delivery-store.js` utrzymuje prywatny stan dostarczenia bez
adresu e-mail i pełnego payloadu. Nieznany wynik może zostać ponowiony z tym samym
kluczem tylko przez 23 godziny. Po tej granicy stan przechodzi do
`RECOVERY_REQUIRED`; automatyczne użycie nowego klucza jest zabronione, aby nie
wysłać duplikatu.

Oficjalny kontrakt Resend:
https://resend.com/docs/dashboard/emails/idempotency-keys

## Warunki podłączenia

- sekrety muszą pochodzić z Secret Manager/sekretów Functions;
- produkcja i staging muszą mieć osobne widgety Turnstile;
- kolekcje Firestore muszą pozostać całkowicie niedostępne dla klienta;
- trzeba dodać monitoring stanów `RECOVERY_REQUIRED` bez logowania e-maila/hasła;
- zależność Pwned Passwords oraz treść wiadomości wymagają zatwierdzenia w planie
  publikacji i informacji o podmiotach przetwarzających, jeżeli będzie to wymagane;
- przed wdrożeniem potrzebny jest kontrolowany test z testowymi kluczami, bez
  wysyłania wiadomości do prawdziwych klientów.
