# Provisioning PLATFORM_OWNER

Poniższa procedura opisuje kontrolowany proces operacyjny; nie jest wykonywana automatycznie przez aplikację.

1. Utwórz użytkownika w docelowym Firebase Auth i zweryfikuj jego email.
2. Dodaj metodę MFA zgodną z polityką środowiska.
3. Korzystając z Firebase Admin SDK i poświadczeń operatora, ustaw dokładny custom claim `platformRole: "PLATFORM_OWNER"`. Nie dodawaj tego uprawnienia po stronie klienta.
4. W transakcji administracyjnej dodaj aktywny rekord do `platform_admin` z tym samym Firebase UID.
5. Sprawdź zapytaniami tylko do odczytu, że UID nie występuje jako pracownik ani członek żadnej organizacji. W przypadku kolizji przerwij provisioning.
6. Unieważnij poprzednie tokeny/wyloguj konto i zaloguj je ponownie, aby otrzymało aktualny claim i świeży `auth_time`.
7. Zweryfikuj odmowę dostępu bez MFA, ze złym claimem, niezweryfikowanym emailem, nieaktywnym `platform_admin` i z członkostwem tenantowym.
8. Zachowaj dowód wykonania procedury poza tenantowymi logami. Nie zapisuj hasła, tokenu, kodu MFA ani sekretu.

Usunięcie uprawnień wykonuje się przez dezaktywację `platform_admin`, usunięcie claimu oraz unieważnienie tokenów. Sam email — w tym `cleanzi@admin.com` — nie nadaje żadnych uprawnień.
