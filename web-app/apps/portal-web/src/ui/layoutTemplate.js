import { platformAdminTemplate } from '../../../../../Cleanzi-admin/frontend/template.js'

export const portalLayoutTemplate = `
<div class="login-screen" id="loginScreen" data-auth-scope="organization" style="display:grid;">
  <section class="login-visual" aria-labelledby="loginHeroTitle">
    <img
      class="login-hero-image"
      src="/login-hero-operations-v1.webp"
      alt=""
      width="1536"
      height="1024"
      fetchpriority="high"
    />
    <div class="login-visual-overlay" aria-hidden="true"></div>
    <div class="login-visual-brand">
      <img src="/cleanzi-logo.svg" alt="Cleanzi" width="180" height="50" />
      <span>Panel firmy sprz&#261;taj&#261;cej</span>
    </div>
    <div class="login-visual-story">
      <span class="login-visual-kicker">SYSTEM DO ZARZ&#260;DZANIA PROCESEM SPRZ&#260;TANIA</span>
      <h2 id="loginHeroTitle">Sprz&#261;tanie.<br />Pod kontrol&#261;.</h2>
      <p>Planuj zlecenia, monitoruj realizacj&#281; i kontroluj jako&#347;&#263; &mdash; wszystko w jednym miejscu.</p>
    </div>
  </section>
  <section class="login-panel">
    <div class="login-panel__stack">
      <div class="platform-login-heading" id="platformLoginHeading" aria-hidden="true">
        <strong>Cleanzi</strong>
        <span>Admin Panel</span>
      </div>
      <form class="login-card" id="loginForm" role="dialog" aria-labelledby="loginTitle" novalidate>
      <div class="login-brand">
        <span class="login-card-kicker">PANEL FIRMY SPRZ&#260;TAJ&#260;CEJ</span>
        <h1 class="login-title" id="loginTitle">Zaloguj si&#281;</h1>
        <p class="login-copy" id="loginCopy">Logowanie do panelu firmy sprz&#261;taj&#261;cej Cleanzi.</p>
      </div>

      <div id="loginCredentialsPanel">
        <select id="loginAuthScope" autocomplete="off" hidden aria-hidden="true" tabindex="-1">
          <option value="organization">Portal organizacji</option>
          <option value="platform">Panel admina</option>
        </select>

        <div class="login-field">
          <label for="loginLogin">Email</label>
          <input id="loginLogin" type="email" maxlength="160" autocomplete="username" inputmode="email" spellcheck="false" placeholder="np. imie@firma.pl" />
        </div>

        <div class="login-field">
          <label for="loginPass">Hasło</label>
          <div class="login-password-control">
            <input id="loginPass" type="password" autocomplete="current-password" placeholder="Wpisz hasło" />
            <button class="login-password-toggle" id="loginPasswordToggle" type="button" aria-label="Pokaż hasło" aria-pressed="false">
              <i class="ph ph-eye" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <button class="btn primary login-submit" id="loginBtn" type="submit">Zaloguj</button>
        <div class="login-provider-divider" id="loginProviderDivider"><span>lub</span></div>
        <button class="btn login-google" id="loginGoogleBtn" type="button">
          <img
            class="login-google-logo"
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            width="24"
            height="24"
            alt=""
            aria-hidden="true"
          />
          <span class="login-google-label">Zaloguj się przez Google</span>
        </button>

        <div class="login-company-entry" id="loginCompanyEntry" hidden>
          <span>Nie masz jeszcze konta?</span>
          <button class="login-company-start" id="loginCompanyStart" type="button">Za&#322;&#243;&#380; firm&#281;</button>
        </div>
      </div>

      <div class="login-company-panel" id="loginCompanyPanel" hidden>
        <p class="login-company-lead">Za&#322;&#243;&#380; konto dla firmy sprz&#261;taj&#261;cej i od razu zacznij prac&#281; w Cleanzi.</p>
        <button class="login-company-google" id="loginCompanyGoogle" type="button"><i class="ph ph-google-logo" aria-hidden="true"></i><span>Kontynuuj z Google</span></button>
        <div class="login-company-divider" aria-hidden="true"><span>lub</span></div>
        <button class="login-company-email-open" id="loginCompanyEmailOpen" type="button">Zarejestruj si&#281; e-mailem</button>
        <p class="login-company-note">Przy rejestracji e-mailem wy&#347;lemy link. Konto zostanie potwierdzone dopiero po jego otwarciu.</p>
        <button class="login-reset-back" id="loginCompanyBack" type="button">Mam ju&#380; konto &mdash; zaloguj si&#281;</button>
      </div>

      <div class="login-company-email-panel" id="loginCompanyEmailPanel" hidden>
        <div class="login-field">
          <label for="loginCompanyEmail">Email firmowy</label>
          <input id="loginCompanyEmail" type="email" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false" placeholder="np. biuro@firma.pl" />
        </div>
        <button class="btn primary login-submit" id="loginCompanyEmailSend" type="submit">Wy&#347;lij link potwierdzaj&#261;cy</button>
        <p class="login-company-note">Link wysy&#322;amy na podany adres. Otw&#243;rz go, aby potwierdzi&#263; email i przej&#347;&#263; dalej.</p>
        <button class="login-reset-back" id="loginCompanyEmailBack" type="button">Wr&#243;&#263; do sposob&#243;w rejestracji</button>
      </div>

      <div class="login-company-email-panel" id="loginCompanyEmailLinkPanel" hidden>
        <div class="login-field">
          <label for="loginCompanyEmailLink">Potwierd&#378; adres email</label>
          <input id="loginCompanyEmailLink" type="email" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false" placeholder="Adres, na kt&#243;ry wys&#322;ano link" />
        </div>
        <button class="btn primary login-submit" id="loginCompanyEmailLinkConfirm" type="submit">Potwierd&#378; email</button>
        <p class="login-company-note">U&#380;ywamy tego adresu wy&#322;&#261;cznie do bezpiecznego doko&#324;czenia linku potwierdzaj&#261;cego.</p>
      </div>

      <div class="login-reset-panel" id="loginResetPanel" hidden>
        <div class="login-field">
          <label for="loginResetEmail">Email</label>
          <input id="loginResetEmail" type="email" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false" />
        </div>

        <button class="btn primary login-submit" id="loginResetSend" type="submit">Wyślij link</button>
        <button class="login-reset-back" id="loginResetBack" type="button">Wróć do logowania</button>
      </div>

      <div class="login-organization-panel" id="loginOrganizationPanel" hidden>
        <div class="login-organization-list" id="loginOrganizationList" role="list"></div>
        <button class="btn primary login-submit" id="loginOrganizationCreateOpen" type="button">Zarejestruj nową firmę</button>
        <button class="login-organization-cancel" id="loginOrganizationCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-registration-panel" id="loginRegistrationConsentsPanel" hidden>
        <p class="login-registration-plan" id="loginRegistrationPlan"></p>
        <label class="login-registration-consent">
          <input id="loginRegistrationTerms" type="checkbox" />
          <span>Akceptuję <a href="https://registration-cleanzi.web.app/regulamin" target="_blank" rel="noopener noreferrer">regulamin Cleanzi</a>.</span>
        </label>
        <label class="login-registration-consent">
          <input id="loginRegistrationPrivacy" type="checkbox" />
          <span>Potwierdzam zapoznanie się z <a href="https://registration-cleanzi.web.app/polityka-prywatnosci" target="_blank" rel="noopener noreferrer">polityką prywatności</a>.</span>
        </label>
        <label class="login-registration-consent">
          <input id="loginRegistrationMarketing" type="checkbox" />
          <span>Chcę otrzymywać informacje marketingowe (opcjonalnie).</span>
        </label>
        <button class="btn primary login-submit" id="loginRegistrationConsentsSave" type="button">Zapisz zgody i kontynuuj</button>
        <button class="login-registration-existing" id="loginRegistrationChooseExisting" type="button">Wybierz istniejącą organizację</button>
        <button class="login-organization-cancel" id="loginRegistrationCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-registration-panel login-registration-company" id="loginRegistrationCompanyPanel" hidden>
        <p class="login-registration-plan" id="loginRegistrationCompanyPlan"></p>
        <div class="login-registration-grid">
          <div class="login-field">
            <label for="loginRegistrationOwnerFirstName">Imię właściciela</label>
            <input id="loginRegistrationOwnerFirstName" type="text" maxlength="80" autocomplete="given-name" />
          </div>
          <div class="login-field">
            <label for="loginRegistrationOwnerLastName">Nazwisko właściciela</label>
            <input id="loginRegistrationOwnerLastName" type="text" maxlength="80" autocomplete="family-name" />
          </div>
          <div class="login-field login-registration-wide">
            <label for="loginRegistrationOwnerPhone">Telefon właściciela (opcjonalnie)</label>
            <input id="loginRegistrationOwnerPhone" type="tel" maxlength="40" autocomplete="tel" />
          </div>
          <div class="login-field login-registration-wide">
            <label for="loginRegistrationLegalName">Pełna nazwa prawna</label>
            <input id="loginRegistrationLegalName" type="text" maxlength="180" autocomplete="organization" />
          </div>
          <div class="login-field">
            <label for="loginRegistrationCountry">Kraj rejestracji i adresu</label>
            <select id="loginRegistrationCountry">
              <option value="PL">Polska</option>
              <option value="DE">Niemcy</option>
              <option value="GB">Wielka Brytania</option>
              <option value="US">Stany Zjednoczone</option>
            </select>
          </div>
          <div class="login-field">
            <label for="loginRegistrationTaxType">Typ identyfikatora podatkowego</label>
            <select id="loginRegistrationTaxType">
              <option value="NIP">NIP</option>
              <option value="TIN">TIN / Tax ID</option>
              <option value="EIN">EIN</option>
              <option value="VAT_ID">VAT ID</option>
              <option value="OTHER">Inny</option>
            </select>
          </div>
          <div class="login-field">
            <label for="loginRegistrationTaxId">NIP / identyfikator podatkowy</label>
            <input id="loginRegistrationTaxId" type="text" maxlength="64" autocomplete="off" />
          </div>
          <button class="btn login-registration-lookup" id="loginRegistrationLookup" type="button">Pobierz dane po NIP</button>
          <div class="login-field login-registration-wide">
            <label for="loginRegistrationAddress">Ulica i numer</label>
            <input id="loginRegistrationAddress" type="text" maxlength="180" autocomplete="street-address" />
          </div>
          <div class="login-field">
            <label for="loginRegistrationPostalCode">Kod pocztowy</label>
            <input id="loginRegistrationPostalCode" type="text" maxlength="20" autocomplete="postal-code" />
          </div>
          <div class="login-field">
            <label for="loginRegistrationLocality">Miasto / miejscowość</label>
            <input id="loginRegistrationLocality" type="text" maxlength="100" autocomplete="address-level2" />
          </div>
          <div id="loginRegistrationBillingFields" class="login-registration-billing login-registration-wide" hidden>
            <div class="login-field">
              <label for="loginRegistrationBillingEmail">E-mail rozliczeniowy</label>
              <input id="loginRegistrationBillingEmail" type="email" maxlength="180" autocomplete="email" />
            </div>
            <div class="login-field">
              <label for="loginRegistrationInvoiceEmail">E-mail do faktur (opcjonalnie)</label>
              <input id="loginRegistrationInvoiceEmail" type="email" maxlength="180" autocomplete="email" />
            </div>
            <div class="login-field login-registration-wide">
              <label for="loginRegistrationBillingPhone">Telefon rozliczeniowy (opcjonalnie)</label>
              <input id="loginRegistrationBillingPhone" type="tel" maxlength="40" autocomplete="tel" />
            </div>
          </div>
        </div>
        <button class="btn primary login-submit" id="loginRegistrationCompanySave" type="button">Utwórz firmę</button>
        <button class="login-registration-existing" id="loginRegistrationCompanyExisting" type="button">Wybierz istniejącą organizację</button>
        <button class="login-organization-cancel" id="loginRegistrationCompanyCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-registration-panel" id="loginRegistrationPaymentPanel" hidden>
        <p class="login-mfa-help">Firma została utworzona, ale dostęp pozostaje zablokowany do potwierdzenia płatności przez Stripe.</p>
        <button class="btn primary login-submit" id="loginRegistrationPaymentCheck" type="button">Sprawdź status płatności</button>
        <button class="login-registration-existing" id="loginRegistrationPaymentExisting" type="button">Wybierz istniejącą organizację</button>
        <button class="login-organization-cancel" id="loginRegistrationPaymentCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-registration-panel" id="loginRegistrationUnavailablePanel" hidden>
        <p class="login-mfa-help">Nie znaleziono aktywnej próby rejestracji. Rozpocznij lub wznów rejestrację na stronie Cleanzi.</p>
        <button class="btn primary login-submit" id="loginRegistrationRestart" type="button">Przejdź do rejestracji</button>
        <button class="login-registration-existing" id="loginRegistrationUnavailableExisting" type="button">Wybierz istniejącą organizację</button>
        <button class="login-organization-cancel" id="loginRegistrationUnavailableCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-registration-panel" id="loginOrganizationCreatePanel" hidden>
        <p class="login-mfa-help">Nowa firma wymaga prawidłowej próby rejestracji. Portal nie tworzy organizacji ani Triala bez tego procesu.</p>
        <button class="btn primary login-submit" id="loginOrganizationCreate" type="button">Przejdź do rejestracji</button>
        <button class="login-reset-back" id="loginOrganizationCreateBack" type="button">Wróć</button>
      </div>

      <div class="login-organization-panel" id="loginEmailVerificationPanel" hidden>
        <p class="login-mfa-help">Potwierdź adres email, aby bezpiecznie korzystać z organizacji Cleanzi.</p>
        <button class="btn primary login-submit" id="loginEmailVerificationCheck" type="button">Sprawdź ponownie</button>
        <button class="login-reset-back" id="loginEmailVerificationSend" type="button">Wyślij wiadomość ponownie</button>
        <button class="login-organization-cancel" id="loginEmailVerificationCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-mfa-panel" id="loginMfaChallengePanel" hidden>
        <div class="login-field">
          <label for="loginMfaFactor">Drugi składnik</label>
          <select id="loginMfaFactor"></select>
        </div>
        <button class="login-reset-back" id="loginMfaSendCode" type="button">Wyślij kod SMS</button>
        <div class="login-field">
          <label for="loginMfaCode">Kod weryfikacyjny</label>
          <input id="loginMfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" />
        </div>
        <button class="btn primary login-submit" id="loginMfaConfirm" type="button">Potwierdź</button>
        <button class="login-reset-back" id="loginMfaCancel" type="button">Anuluj i wyloguj</button>
        <div id="loginMfaRecaptcha"></div>
      </div>

      <div class="login-mfa-panel" id="loginMfaEnrollmentPanel" hidden>
        <div class="login-mfa-methods">
          <button class="login-reset-back" id="loginMfaChooseTotp" type="button">Aplikacja TOTP</button>
          <button class="login-reset-back" id="loginMfaChooseSms" type="button">Kod SMS</button>
          <button class="login-reset-back" id="loginMfaChooseEmail" type="button">Kod email</button>
        </div>
        <div id="loginMfaTotpSetup" hidden>
          <p class="login-mfa-help">Dodaj klucz w aplikacji uwierzytelniającej, a następnie wpisz wygenerowany kod.</p>
          <code class="login-mfa-secret" id="loginMfaTotpSecret"></code>
        </div>
        <div id="loginMfaPhoneSetup" hidden>
          <div class="login-field">
            <label for="loginMfaPhone">Telefon z kodem kraju</label>
            <input id="loginMfaPhone" type="tel" autocomplete="tel" placeholder="+48123123123" />
          </div>
          <button class="login-reset-back" id="loginMfaPhoneSend" type="button">Wyślij kod SMS</button>
          <div id="loginMfaEnrollRecaptcha"></div>
        </div>
        <div id="loginMfaEmailSetup" hidden>
          <p class="login-mfa-help">Na razie możesz podać dowolny adres. Docelowo kod będzie wysyłany wyłącznie na email konta Firebase.</p>
          <div class="login-field">
            <label for="loginMfaEmail">Email do kodu</label>
            <input id="loginMfaEmail" type="email" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false" />
          </div>
          <button class="login-reset-back" id="loginMfaEmailSend" type="button">Wyślij kod email</button>
        </div>
        <div class="login-field">
          <label for="loginMfaEnrollCode">Kod weryfikacyjny</label>
          <input id="loginMfaEnrollCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" />
        </div>
        <button class="btn primary login-submit" id="loginMfaEnrollConfirm" type="button">Potwierdź kod</button>
        <button class="login-reset-back" id="loginMfaEnrollCancel" type="button">Anuluj i wyloguj</button>
      </div>

      <div class="login-error" id="loginErr" aria-live="polite" aria-atomic="true" style="display:none;"></div>
      <button class="login-reset-open" id="loginResetOpen" type="button" hidden>Zresetuj hasło</button>
      <p class="login-security-note"><i class="ph ph-lock-key" aria-hidden="true"></i><span>Bezpieczne logowanie do chronionego środowiska Cleanzi.</span></p>
      </form>
    </div>
  </section>
</div>

<section class="company-basics-overlay" id="companyBasicsOverlay" hidden role="dialog" aria-modal="true" aria-labelledby="companyBasicsTitle" aria-describedby="companyBasicsCopy">
  <div class="company-basics-backdrop" aria-hidden="true"></div>
  <form class="company-basics-card" id="companyBasicsForm" novalidate>
    <div class="company-basics-brand">
      <img src="/cleanzi-logo.svg" alt="Cleanzi" width="132" height="38" />
      <span>Zak&#322;adanie firmy</span>
    </div>
    <div class="company-basics-heading">
      <span class="company-basics-kicker">PRAWIE GOTOWE</span>
      <h1 id="companyBasicsTitle">Podstawowe dane firmy</h1>
      <p id="companyBasicsCopy">Zapisz dane potrzebne do uruchomienia Twojej firmy sprz&#261;taj&#261;cej w Cleanzi.</p>
    </div>

    <div class="company-basics-grid">
      <div class="company-basics-field">
        <label for="companyBasicsNip">NIP</label>
        <input id="companyBasicsNip" name="nip" type="text" required maxlength="13" inputmode="numeric" autocomplete="off" placeholder="np. 856-734-62-15" pattern="[0-9 -]{10,13}" />
      </div>
      <div class="company-basics-field company-basics-field-wide">
        <label for="companyBasicsLegalName">Pe&#322;na nazwa firmy</label>
        <input id="companyBasicsLegalName" name="legalName" type="text" required minlength="2" maxlength="160" autocomplete="organization" placeholder="np. Cleanzi sp. z o.o." />
      </div>
      <div class="company-basics-field">
        <label for="companyBasicsEmployeeCount">Deklarowana liczba pracownik&#243;w</label>
        <input id="companyBasicsEmployeeCount" name="declaredEmployeeCount" type="number" required min="0" max="100000" step="1" inputmode="numeric" placeholder="np. 12" />
        <small>Mo&#380;esz wpisa&#263; 0, je&#347;li zaczynasz samodzielnie.</small>
      </div>
    </div>

    <fieldset class="company-basics-consents">
      <legend>Wymagane potwierdzenia</legend>
      <label class="company-basics-check">
        <input id="companyBasicsTerms" type="checkbox" required />
        <span>Akceptuj&#281; <a id="companyBasicsTermsLink" href="https://cleanzi.pl/regulamin" target="_blank" rel="noopener noreferrer">Regulamin Cleanzi <span id="companyBasicsTermsVersion">(wersja 2026-07-16)</span></a>.</span>
      </label>
      <label class="company-basics-check">
        <input id="companyBasicsPrivacy" type="checkbox" required />
        <span>Potwierdzam zapoznanie si&#281; z <a id="companyBasicsPrivacyLink" href="https://cleanzi.pl/polityka-prywatnosci" target="_blank" rel="noopener noreferrer">Polityk&#261; prywatno&#347;ci <span id="companyBasicsPrivacyVersion">(wersja 2026-07-30)</span></a>.</span>
      </label>
    </fieldset>

    <fieldset class="company-basics-consents company-basics-marketing">
      <legend>Zgody marketingowe <span>(opcjonalne)</span></legend>
      <p>Mo&#380;esz je zmieni&#263; p&#243;&#378;niej. Brak zgody nie ogranicza dost&#281;pu do Cleanzi.</p>
      <label class="company-basics-check"><input id="companyBasicsMarketingEmail" type="checkbox" /> <span>Chc&#281; otrzymywa&#263; informacje marketingowe e-mailem.</span></label>
      <label class="company-basics-check"><input id="companyBasicsMarketingSms" type="checkbox" /> <span>Chc&#281; otrzymywa&#263; informacje marketingowe SMS.</span></label>
      <label class="company-basics-check"><input id="companyBasicsMarketingPhone" type="checkbox" /> <span>Wyra&#380;am zgod&#281; na kontakt marketingowy telefonicznie.</span></label>
    </fieldset>

    <div class="company-basics-error" id="companyBasicsError" aria-live="polite" aria-atomic="true" hidden></div>
    <div class="company-basics-actions">
      <button class="btn primary company-basics-submit" id="companyBasicsSubmit" type="submit">Zapisz i uruchom portal</button>
      <button class="company-basics-signout" id="companyBasicsSignOut" type="button">Wyloguj</button>
    </div>
  </form>
</section>

<div class="app-bg" id="portalRoot" style="display:none;">
  <div class="company-profile-overlay" id="companyProfileOverlay" role="dialog" aria-modal="true" aria-labelledby="companyProfileTitle" hidden>
    <form class="company-profile-card" id="companyProfileForm">
      <div>
        <span class="login-card-kicker">PROFIL FIRMY</span>
        <h2 id="companyProfileTitle">Uzupełnij dane organizacji</h2>
        <p id="companyProfileCopy">Dane są wymagane od Ownera. Możesz wrócić do formularza po ponownym zalogowaniu.</p>
      </div>
      <div class="company-profile-grid">
        <label>NIP<input id="companyProfileNip" name="nip" inputmode="numeric" maxlength="13" required /></label>
        <button class="btn2" id="companyProfileLookup" type="button">Pobierz z GUS</button>
        <label class="company-profile-wide">Nazwa prawna<input id="companyProfileLegalName" name="legalName" maxlength="300" required /></label>
        <label class="company-profile-wide">Pełny adres<input id="companyProfileAddress" name="registeredAddress" maxlength="1000" required /></label>
        <label>REGON<input id="companyProfileRegon" name="regon" maxlength="14" /></label>
        <label>Kod pocztowy<input id="companyProfilePostalCode" name="postalCode" maxlength="12" /></label>
        <label>Miasto<input id="companyProfileCity" name="city" maxlength="120" /></label>
        <label class="company-profile-wide">Imię i nazwisko właściciela<input id="companyProfileOwnerName" name="ownerFullName" maxlength="200" required /></label>
        <label class="company-profile-wide">Nazwa do rozliczeń<input id="companyProfileBillingName" name="billingName" maxlength="300" /></label>
        <label>NIP do rozliczeń<input id="companyProfileBillingNip" name="billingNip" maxlength="13" /></label>
        <label>Email rozliczeniowy<input id="companyProfileBillingEmail" name="billingEmail" type="email" maxlength="160" /></label>
        <label class="company-profile-wide">Adres rozliczeniowy<input id="companyProfileBillingAddress" name="billingAddress" maxlength="1000" /></label>
        <label>Kod pocztowy rozliczeń<input id="companyProfileBillingPostalCode" name="billingPostalCode" maxlength="12" /></label>
        <label>Miasto rozliczeń<input id="companyProfileBillingCity" name="billingCity" maxlength="120" /></label>
      </div>
      <div class="company-profile-message" id="companyProfileMessage" aria-live="polite"></div>
      <div class="company-profile-actions">
        <button class="btn primary" id="companyProfileSave" type="submit">Zapisz profil firmy</button>
        <button class="btn2" id="companyProfileClose" type="button">Zamknij</button>
        <button class="btn2" id="companyProfileLogout" type="button">Wyloguj</button>
      </div>
    </form>
  </div>
  ${platformAdminTemplate}
  <div class="app-shell">
    <div class="app-body">
      <aside class="sidebar" id="portalSidebar">
        <button
          class="sidebar-brand"
          data-route="dashboard"
          type="button"
          aria-label="Przejdź do strony głównej"
        >
          <span class="sidebar-brand-logo logo-block logo-block--cleanzi">
            <img src="/cleanzi-logo.svg" alt="Cleanzi" />
          </span>
        </button>

        <button class="menu-order-add" id="sidebarOrdersAddBtn" type="button">
          <span class="menu-order-add-icon" aria-hidden="true">+</span>
          <span class="mi-label">Dodaj zlecenie</span>
        </button>

        <div class="sidebar-head">
          <div class="sidebar-title">G&#321;&#211;WNE</div>
          <button
            class="sidebar-toggle-btn"
            id="sidebarToggleBtn"
            type="button"
            aria-label="Zwin menu"
            aria-pressed="false"
            title="Zwin menu"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="menu">
          <button class="menu-item active" data-route="dashboard" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 11.5L12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Pulpit</span>
          </button>
          <button class="menu-item" data-route="events" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Zdarzenia</span>
          </button>
          <button class="menu-section" type="button" data-toggle="orders">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M8 4h8l2 2v14H6V6l2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 10h6M9 14h6M9 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Zlecenia</span>
            <span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-orders">
            <button class="submenu-item" data-route="orders" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Lista zlecen</span>
            </button>
            <button class="submenu-item" data-route="ordersMap" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>
              </span>
              <span class="mi-label">Mapa</span>
            </button>
          </div>
          <button class="menu-item" data-route="calendar" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Kalendarz</span>
            <span class="menu-task-badge" id="menuCalendarTaskDueCount" hidden>0</span>
          </button>
          <button class="menu-section" type="button" data-toggle="kanban">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="5" height="14" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="10.5" y="5" width="5" height="10" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="17" y="5" width="3" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>
            </span>
            <span class="mi-label">Centrum zadań</span>
            <span class="menu-task-badge" id="menuKanbanTaskDueCount" hidden>0</span>
            <span class="chev">▼</span>
          </button>
          <div class="submenu submenu-kanban" id="submenu-kanban">
            <button class="submenu-item" type="button" data-kanban-menu-section="home">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/></svg>
              </span>
              <span class="mi-label">Strona główna</span>
            </button>
            <button class="submenu-item" type="button" data-kanban-menu-section="tasks">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="m8.5 12.2 2.2 2.2 4.8-5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>
              </span>
              <span class="mi-label">Moje zadania</span>
              <span class="menu-task-badge kanban-submenu-count" data-kanban-my-count hidden>0</span>
            </button>
            <button class="submenu-item" type="button" data-kanban-menu-section="inbox">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 18h14l-1.4-2.2V11a5.6 5.6 0 0 0-11.2 0v4.8L5 18Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>
              </span>
              <span class="mi-label">Skrzynka odbiorcza</span>
              <span class="kanban-submenu-dot" data-kanban-inbox-dot hidden></span>
            </button>
            <button class="submenu-item kanban-submenu-create" id="kanbanMenuCreateBtn" type="button">
              <span class="mi-ico" aria-hidden="true">+</span>
              <span class="mi-label">Utwórz zadanie</span>
            </button>
            <div class="kanban-menu-heading">Projekty / klienci</div>
            <div class="kanban-menu-dynamic" id="kanbanPortalMenuProjects"></div>
            <button class="kanban-menu-more" id="kanbanPortalMenuShowMore" type="button" hidden>Pokaż więcej</button>
          </div>
          <button class="menu-item" data-route="contractProfitability" data-profitability-entry type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m4 7 5-4 6 5 5-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Rentowność kontraktów</span>
          </button>
          <div class="menu-group-title">OPERACJE</div>

          <button class="menu-section" type="button" data-toggle="clients">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8a3 3 0 1 1 0 6M22 20v-1a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Klienci</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-clients">
            <button class="submenu-item" data-route="clientProfile" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M14 10h4M14 14h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Profil klienta</span>
            </button>
          </div>

          <button class="menu-section" type="button" data-toggle="objects">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 9l9-5 9 5-9 5-9-5zM3 14l9 5 9-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Obiekty</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-objects">
            <button class="submenu-item" data-route="zones" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>
              </span>
              <span class="mi-label">Strefy</span>
            </button>
            <button class="submenu-item" data-route="audits" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.8-3 7.8-7 9-4-1.2-7-4.2-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Audyty</span>
            </button>
          </div>

          <div class="menu-group-title">ZASOBY</div>

          <button class="menu-section" type="button" data-toggle="workers">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 14a4 4 0 0 1 8 0M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Pracownicy</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-workers">
            <button class="submenu-item" data-route="workerProfile" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Lista pracowników</span>
            </button>
            <button class="submenu-item" data-route="workdayStopProposals" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="17" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h8M8 14l2 2 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Godziny do weryfikacji</span>
            </button>
          </div>

          <div class="menu-group-title">RAPORTY</div>

          <button class="menu-section" type="button" data-toggle="reports">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V9M10 19V5M16 19v-8M22 19V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 20h19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Raporty</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-reports">
            <button class="submenu-item" data-route="reports" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Zestawienia</span>
            </button>
          </div>

          <div class="menu-group-title">USTAWIENIA</div>

          <button class="menu-item" type="button" data-route="settings">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15l1.2 2.1-2.1 2.1-2.1-1.2a8 8 0 0 1-2 .8L14 21h-4l-.4-2.2a8 8 0 0 1-2-.8l-2.1 1.2-2.1-2.1L4.6 15a8 8 0 0 1-.8-2L1.6 12l2.2-1a8 8 0 0 1 .8-2L3.4 6.9l2.1-2.1 2.1 1.2a8 8 0 0 1 2-.8L10 3h4l.4 2.2a8 8 0 0 1 2 .8l2.1-1.2 2.1 2.1-1.2 2.1a8 8 0 0 1 .8 2l2.2 1-2.2 1a8 8 0 0 1-.8 2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Ustawienia</span>
          </button>
        </div>
      </aside>

      <div class="content-shell">
        <header class="header">
          <div class="topbar-search" id="topbarGlobalSearch" role="search" aria-label="Szukaj sekcji, podsekcji i pracowników">
            <span class="topbar-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
                <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>
            <input
              class="topbar-search-input"
              id="topbarGlobalSearchInput"
              type="search"
              placeholder="Szukaj sekcji, podsekcji i pracowników..."
              autocomplete="off"
              aria-label="Szukaj sekcji, podsekcji i pracowników"
              aria-expanded="false"
              aria-controls="topbarGlobalSearchResults"
            />
            <button class="topbar-search-clear" id="topbarGlobalSearchClear" type="button" aria-label="Wyczyść wyszukiwanie" hidden>×</button>
            <div class="topbar-search-results" id="topbarGlobalSearchResults" role="listbox" aria-label="Wyniki wyszukiwania" hidden></div>
          </div>

          <div class="header-right">
            <button class="topbar-action-btn" type="button" aria-label="Powiadomienia" title="Powiadomienia">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9a6 6 0 1 1 12 0v4.5l1.4 2.3a1 1 0 0 1-.9 1.5H5.5a1 1 0 0 1-.9-1.5L6 13.5V9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="topbar-action-btn" type="button" aria-label="Szybkie akcje" title="Szybkie akcje">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
            <div class="subscription-chip" id="subscriptionChip" data-tone="active" title="Pakiet organizacji" hidden>
              <span class="subscription-chip-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 7.5 8.2 4l3.8 3.5L15.8 4 20 7.5 18.2 18H5.8L4 7.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                  <path d="M7 14.5h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="subscription-chip-copy">
                <span class="subscription-chip-label">Pakiet</span>
                <span class="subscription-chip-plan" id="subscriptionPlanName">-</span>
              </span>
              <span class="subscription-chip-remaining">
                <strong id="subscriptionRemainingValue">-</strong>
                <span id="subscriptionRemainingLabel">dni</span>
              </span>
            </div>
            <button class="organization-chip" id="organizationChip" type="button" title="Aktywna organizacja" hidden>
              <span class="organization-chip-label">Organizacja</span>
              <span class="organization-chip-name" id="organizationName"></span>
            </button>
            <button class="btn2" id="companyProfileOpen" type="button" hidden>Profil firmy</button>
            <div class="user-chip" id="userChip" title="Użytkownik">
              <span class="user-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M5 21a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="name" id="userName">-</span>
              <span class="dot" id="userDot" aria-hidden="true"></span>
            </div>
            <button class="btn2 danger" id="logoutBtn" type="button" title="Wyloguj">Wyloguj</button>
          </div>
        </header>

        <main class="main">
        <section id="view-dashboard">
          <section class="dash-command-center" id="dashCommandCenter" aria-labelledby="dashCommandCenterTitle">
            <header class="dash-command-center__header">
              <div class="dash-command-center__heading">
                <div class="dash-command-center__eyebrow">
                  <span class="dash-command-center__live"><i class="ph ph-broadcast" aria-hidden="true"></i> LIVE</span>
                  <span>Centrum dowodzenia</span>
                </div>
                <h1 id="dashCommandCenterTitle">Dzień pod kontrolą</h1>
                <p id="dashCommandCenterDate">Dzisiaj</p>
              </div>
              <div class="dash-command-center__actions">
                <button
                  class="dash-command-center__action"
                  id="dashCommandFiltersBtn"
                  type="button"
                  aria-controls="dashCommandFiltersPanel"
                  aria-expanded="false"
                >
                  <i class="ph ph-funnel-simple" aria-hidden="true"></i>
                  <span>Filtry</span>
                </button>
                <button
                  class="dash-command-center__action dash-command-center__action--primary"
                  id="dashCommandViewBtn"
                  type="button"
                  aria-pressed="false"
                >
                  <i class="ph ph-squares-four" aria-hidden="true"></i>
                  <span>Widok</span>
                </button>
                <button
                  class="dash-command-center__notification"
                  type="button"
                  data-route="events"
                  aria-label="Otwórz zdarzenia i powiadomienia"
                  title="Zdarzenia i powiadomienia"
                >
                  <i class="ph ph-bell" aria-hidden="true"></i>
                  <span id="dashCommandNotificationCount" hidden>0</span>
                </button>
              </div>
            </header>

            <div
              class="dash-command-center__filters"
              id="dashCommandFiltersPanel"
              aria-label="Szybkie filtry Centrum dowodzenia"
              hidden
            >
              <div class="dash-command-center__filter-copy">
                <strong>Widoczność na mapie</strong>
                <span>Wybierz statusy pracowników.</span>
              </div>
              <label class="dash-command-center__filter">
                <input type="checkbox" data-command-map-filter="active" checked />
                <span class="is-active" aria-hidden="true"></span>
                W pracy
              </label>
              <label class="dash-command-center__filter">
                <input type="checkbox" data-command-map-filter="planned" checked />
                <span class="is-planned" aria-hidden="true"></span>
                Zaplanowany
              </label>
              <label class="dash-command-center__filter">
                <input type="checkbox" data-command-map-filter="finished" checked />
                <span class="is-finished" aria-hidden="true"></span>
                Zakończony
              </label>
              <label class="dash-command-center__filter">
                <input type="checkbox" data-command-map-filter="late" checked />
                <span class="is-late" aria-hidden="true"></span>
                Nie rozpoczął w czasie
              </label>
              <button
                class="dash-command-center__quick-alert"
                id="dashCommandOpenQrStopCard"
                type="button"
                data-dash-metric="openStartStopYesterday"
                data-dash-metric-view="list"
                aria-controls="dashMetricPopover"
                aria-haspopup="dialog"
                aria-expanded="false"
              >
                <i class="ph ph-warning-circle" aria-hidden="true"></i>
                <span>Brak QR STOP</span>
                <strong id="dashCommandOpenQrStopCount">0</strong>
              </button>
              <button
                class="dash-command-center__quick-alert"
                id="dashCommandPlannedOrdersCard"
                type="button"
                data-dash-metric="plannedOrders"
                data-dash-metric-view="list"
                aria-controls="dashMetricPopover"
                aria-haspopup="dialog"
                aria-expanded="false"
              >
                <i class="ph ph-calendar-blank" aria-hidden="true"></i>
                <span>Plan na dziś</span>
                <strong id="dashCommandPlannedOrdersCount">0</strong>
                <span class="dash-command-center__plan-data" id="dashCommandPlannedOrdersStrip">Brak przypisanych zleceń.</span>
              </button>
            </div>

            <div class="dash-command-overview" data-dashboard-section="command-center">
              <article class="dash-command-plan" aria-labelledby="dashCommandPlanTitle">
                <header>
                  <h2 id="dashCommandPlanTitle">Plan dnia</h2>
                </header>
                <div class="dash-command-plan__body">
                  <div
                    class="dash-command-plan__ring"
                    id="dashCommandPlanRing"
                    role="progressbar"
                    aria-label="Postęp planu dnia"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="0"
                  >
                    <strong id="dashCommandPlanPercent">—%</strong>
                  </div>
                  <div class="dash-command-plan__summary">
                    <div class="dash-command-plan__headline">
                      <strong><span id="dashCommandPlanCompleted">0</span> z <span id="dashCommandPlanTotal">0</span> ukończonych</strong>
                      <span>Postęp planu na dziś</span>
                    </div>
                    <div class="dash-command-plan__progress" aria-hidden="true">
                      <span id="dashCommandPlanProgress"></span>
                    </div>
                    <div class="dash-command-plan__footer">
                      <dl class="dash-command-plan__states">
                        <div class="is-active"><dt id="dashCommandPlanActive">0</dt><dd>w toku</dd></div>
                        <div class="is-waiting"><dt id="dashCommandPlanWaiting">0</dt><dd>oczekuje</dd></div>
                        <div class="is-cancelled"><dt id="dashCommandPlanCancelled">0</dt><dd>anulowanych</dd></div>
                      </dl>
                      <button class="dash-command-plan__calendar" type="button" data-route="calendar">
                        <i class="ph ph-calendar-blank" aria-hidden="true"></i>
                        Otwórz kalendarz
                      </button>
                    </div>
                  </div>
                </div>
              </article>

              <article class="dash-command-upcoming" aria-labelledby="dashCommandUpcomingTitle">
                <header>
                  <span><i class="ph ph-clock" aria-hidden="true"></i></span>
                  <h2 id="dashCommandUpcomingTitle">Najbliższe 60 minut</h2>
                </header>
                <div class="dash-command-upcoming__list" id="dashCommandUpcomingList">
                  <p>Brak zaplanowanych rozpoczęć w ciągu godziny.</p>
                </div>
                <button class="dash-command-upcoming__footer" type="button" data-route="calendar">
                  Zobacz pełny kalendarz
                  <i class="ph ph-arrow-right" aria-hidden="true"></i>
                </button>
              </article>
            </div>

            <div class="dash-command-center__workspace">
              <article
                class="dash-command-map"
                id="dashCommandMapPanel"
                aria-labelledby="dashCommandMapTitle"
              >
                <div class="dash-command-map__topbar">
                  <div class="dash-command-map__title">
                    <strong id="dashCommandMapTitle">Mapa operacyjna</strong>
                    <span class="dash-command-map__count" id="dashCommandMapCount">0 / 0 na mapie</span>
                  </div>
                  <div class="dash-command-map__stats">
                    <button
                      class="dash-command-map-stat"
                      id="dashCommandActiveWorkersCard"
                      type="button"
                      data-dash-metric="activeNow"
                      data-dash-metric-view="list"
                      aria-controls="dashMetricPopover"
                      aria-haspopup="dialog"
                      aria-expanded="false"
                    >
                      <i class="ph ph-users-three" aria-hidden="true"></i>
                      <strong id="dashCommandActiveWorkersCount">0</strong>
                      <span>aktywnych</span>
                    </button>
                    <button
                      class="dash-command-map-stat"
                      id="dashCommandActiveObjectsCard"
                      type="button"
                      data-dash-metric="activeObjects"
                      data-dash-metric-view="list"
                      aria-controls="dashMetricPopover"
                      aria-haspopup="dialog"
                      aria-expanded="false"
                    >
                      <i class="ph ph-buildings" aria-hidden="true"></i>
                      <strong id="dashCommandActiveObjectsCount">0</strong>
                      <span>obiekty</span>
                    </button>
                  </div>
                </div>
                <div class="dash-command-map__host" id="dashCommandMapHost"></div>
                <div class="dash-command-map__controls">
                  <button id="dashCommandLegendBtn" type="button" aria-expanded="false">
                    <i class="ph ph-stack" aria-hidden="true"></i>
                    Legenda
                    <i class="ph ph-caret-up" aria-hidden="true"></i>
                  </button>
                  <button id="dashCommandLocateBtn" type="button">
                    <i class="ph ph-crosshair" aria-hidden="true"></i>
                    Wyśrodkuj
                  </button>
                </div>
                <div class="dash-command-map__legend" id="dashCommandLegend" hidden>
                  <span><i class="is-active" aria-hidden="true"></i>W pracy</span>
                  <span><i class="is-planned" aria-hidden="true"></i>Zaplanowany</span>
                  <span><i class="is-finished" aria-hidden="true"></i>Zakończony</span>
                  <span><i class="is-late" aria-hidden="true"></i>Nie rozpoczął w czasie</span>
                </div>
              </article>

              <div class="dash-command-side">
                <article class="dash-command-alerts" aria-labelledby="dashCommandAlertsTitle">
                  <header>
                    <span><i class="ph ph-warning" aria-hidden="true"></i></span>
                    <h2 id="dashCommandAlertsTitle">Wymaga reakcji</h2>
                    <strong id="dashCommandAlertsCount">0</strong>
                  </header>
                  <div class="dash-command-alerts__list" id="dashCommandAlertsList">
                    <p>Brak bieżących alertów operacyjnych.</p>
                  </div>
                </article>

                <article
                  class="dash-command-live"
                  id="dashCommandLivePanel"
                  aria-labelledby="dashCommandLiveTitle"
                >
                  <header class="dash-command-live__header">
                    <div>
                      <h2 id="dashCommandLiveTitle">Operacje na żywo</h2>
                      <p>Faktyczne rozpoczęcia i zakończenia. Procent tylko przy potwierdzonym planie.</p>
                    </div>
                    <span class="dash-command-live__status">
                      <i aria-hidden="true"></i>
                      <span id="dashCommandLiveCount">0 w toku</span>
                    </span>
                  </header>
                  <div class="dash-command-live__body" id="dashCommandOperationsHost"></div>
                  <button
                    class="dash-command-live__footer"
                    id="dashCommandAllOperations"
                    type="button"
                    aria-haspopup="dialog"
                    aria-controls="dashCommandOperationsOverlay"
                    hidden
                  >
                    Zobacz wszystkie operacje
                    <i class="ph ph-arrow-right" aria-hidden="true"></i>
                  </button>
                </article>
              </div>
            </div>

            <section class="dash-command-insight" aria-labelledby="dashCommandInsightTitle" hidden>
              <div class="dash-command-insight__brand">
                <span><i class="ph ph-sparkle" aria-hidden="true"></i></span>
                <strong id="dashCommandInsightTitle">Insights AI</strong>
              </div>
              <div class="dash-command-insight__copy">
                <i class="ph ph-check-circle" aria-hidden="true"></i>
                <span>
                  <strong id="dashCommandInsightHeadline">Wszystko zgodnie z planem</strong>
                  <small id="dashCommandInsightMeta">Brak krytycznych odchyleń w realizacji.</small>
                </span>
              </div>
              <button id="dashCommandDetailsBtn" type="button" aria-controls="dashCommandDetailsPanel" aria-expanded="false">
                Szczegóły
                <i class="ph ph-arrow-right" aria-hidden="true"></i>
              </button>
            </section>

            <section class="dash-command-details" id="dashCommandDetailsPanel" hidden>
              <article id="dashCommandCompletedPanel" aria-labelledby="dashCommandCompletedTitle">
                <header>
                  <div>
                    <h2 id="dashCommandCompletedTitle">Potwierdzone ukończenie zadań</h2>
                    <p>Bloki, w których zamknięto wszystkie wymagane przydziały.</p>
                  </div>
                  <span id="dashCommandCompletedCount">0 dzisiaj</span>
                </header>
                <div id="dashCommandCompletedHost"></div>
              </article>
            </section>

            <section
              class="dash-command-operations-overlay"
              id="dashCommandOperationsOverlay"
              hidden
              aria-hidden="true"
            >
              <div
                class="dash-command-operations-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashCommandOperationsDialogTitle"
                aria-describedby="dashCommandOperationsDialogDescription"
              >
                <header class="dash-command-operations-dialog__header">
                  <div>
                    <span class="dash-command-operations-dialog__eyebrow">Dzisiejszy przebieg pracy</span>
                    <h2 id="dashCommandOperationsDialogTitle">Wszystkie operacje</h2>
                    <p id="dashCommandOperationsDialogDescription">
                      Aktywne sesje są zawsze na górze. W każdej grupie najnowsze zdarzenia są pierwsze.
                    </p>
                  </div>
                  <div class="dash-command-operations-dialog__actions">
                    <span id="dashCommandOperationsDialogCount">0 operacji</span>
                    <button id="dashCommandOperationsClose" type="button" aria-label="Zamknij listę wszystkich operacji">
                      <i class="ph ph-x" aria-hidden="true"></i>
                    </button>
                  </div>
                </header>
                <ul
                  class="dash-operational-list dash-command-operations-dialog__list"
                  id="dashCommandAllOperationsList"
                  tabindex="0"
                  aria-label="Wszystkie dzisiejsze operacje od najnowszych"
                >
                  <li class="dash-operational-empty">Brak operacji do wyświetlenia.</li>
                </ul>
              </div>
            </section>
          </section>

          <header class="portal-page-hero portal-page-hero--compact">
            <div class="portal-page-hero__copy">
              <div class="portal-page-hero__title-row">
                <h1>Pulpit operacyjny</h1>
                <span class="portal-page-hero__badge">Dzisiaj</span>
              </div>
              <p>Najważniejsze informacje o pracownikach, obiektach, zadaniach i realizacji usług.</p>
            </div>
          </header>

          <div
            class="dashboard-loading-overlay"
            id="dashboardLoadingOverlay"
            style="display:none;"
            aria-live="polite"
            aria-busy="false"
            aria-label="Wczytywanie danych pulpitu"
          >
            <div class="dashboard-loading-card">
              <span class="dashboard-loading-spinner" aria-hidden="true"></span>
              <span class="dashboard-loading-text">Synchronizuję dane...</span>
            </div>
          </div>
          <div class="dash-grid">
            <div class="card dash-pulse dash-overview-panel">
              <div class="card-title-row">
                <div class="card-title">Przegląd</div>
              </div>

              <div
                class="dash-overview-kpi-grid"
                id="dashSummaryTables"
                data-dashboard-section="overview"
                aria-label="Najważniejsze informacje o dzisiejszej pracy"
              >
                <button
                  class="dash-overview-kpi dash-overview-kpi--workers dash-overview-kpi--action"
                  id="dashOverviewActiveWorkersCard"
                  type="button"
                  data-dash-metric="activeNow"
                  data-dash-metric-view="list"
                  aria-labelledby="dashOverviewActiveWorkersLabel sumActiveNowCount"
                  aria-describedby="dashOverviewActiveWorkersMeta dashOverviewActiveWorkersHint"
                  aria-controls="dashMetricPopover"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >
                  <span class="dash-overview-kpi-label" id="dashOverviewActiveWorkersLabel">Pracownicy</span>
                  <span class="dash-overview-kpi-value" id="sumActiveNowCount">0</span>
                  <span class="dash-overview-kpi-meta" id="dashOverviewActiveWorkersMeta">Aktywni teraz</span>
                  <span class="dash-overview-kpi-action-hint" id="dashOverviewActiveWorkersHint">Otwórz listę aktywnych pracowników</span>
                </button>

                <button
                  class="dash-overview-kpi dash-overview-kpi--open-stop dash-overview-kpi--action"
                  id="dashOverviewOpenQrStopCard"
                  type="button"
                  data-dash-metric="openStartStopYesterday"
                  data-dash-metric-view="list"
                  aria-labelledby="dashOverviewOpenQrStopLabel dashOverviewOpenQrStopCount"
                  aria-describedby="dashOverviewOpenQrStopMeta dashOverviewOpenQrStopHint"
                  aria-controls="dashMetricPopover"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >
                  <span class="dash-overview-kpi-label" id="dashOverviewOpenQrStopLabel">Brak QR STOP</span>
                  <span class="dash-overview-kpi-value" id="dashOverviewOpenQrStopCount">0</span>
                  <span class="dash-overview-kpi-meta" id="dashOverviewOpenQrStopMeta">Niezamknięte dni sprzed dzisiaj</span>
                  <span class="dash-overview-kpi-action-hint" id="dashOverviewOpenQrStopHint">Otwórz listę do uzupełnienia</span>
                </button>

                <button
                  class="dash-overview-kpi dash-overview-kpi--objects dash-overview-kpi--action"
                  id="dashOverviewActiveObjectsCard"
                  type="button"
                  data-dash-metric="activeObjects"
                  data-dash-metric-view="list"
                  aria-labelledby="dashOverviewActiveObjectsLabel dashOverviewActiveObjectsCount"
                  aria-describedby="dashOverviewActiveObjectsMeta dashOverviewActiveObjectsHint"
                  aria-controls="dashMetricPopover"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >
                  <span class="dash-overview-kpi-label" id="dashOverviewActiveObjectsLabel">Obiekty</span>
                  <span class="dash-overview-kpi-value" id="dashOverviewActiveObjectsCount">0</span>
                  <span class="dash-overview-kpi-meta" id="dashOverviewActiveObjectsMeta">Sprzątane lub wysprzątane dziś</span>
                  <span class="dash-overview-kpi-action-hint" id="dashOverviewActiveObjectsHint">Otwórz listę aktywnych obiektów</span>
                </button>

                <button
                  class="dash-overview-kpi dash-overview-kpi--orders dash-overview-kpi--action"
                  id="dashOverviewPlannedOrdersCard"
                  type="button"
                  data-dash-metric="plannedOrders"
                  data-dash-metric-view="list"
                  aria-labelledby="dashOverviewPlannedOrdersLabel dashOverviewPlannedOrdersCount"
                  aria-describedby="dashOverviewPlannedOrdersMeta dashOverviewPlannedOrdersStrip dashOverviewPlannedOrdersHint"
                  aria-controls="dashMetricPopover"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >
                  <span class="dash-overview-kpi-label" id="dashOverviewPlannedOrdersLabel">Zaplanowane zlecenia</span>
                  <span class="dash-overview-kpi-value" id="dashOverviewPlannedOrdersCount">0</span>
                  <span class="dash-overview-kpi-meta" id="dashOverviewPlannedOrdersMeta">Na dziś</span>
                  <span class="dash-overview-plan-strip" id="dashOverviewPlannedOrdersStrip">Brak przypisanych zleceń.</span>
                  <span class="dash-overview-kpi-action-hint" id="dashOverviewPlannedOrdersHint">Otwórz pełną listę zleceń</span>
                </button>

                <article class="dash-overview-kpi dash-overview-kpi--progress">
                  <div class="dash-overview-kpi-label">Postęp ogólny</div>
                  <div class="dash-overview-progress-row">
                    <div class="dash-overview-kpi-value" id="dashOverviewProgressValue">—%</div>
                    <span class="dash-overview-progress-status" id="dashOverviewProgressStatus">W kolejnym module</span>
                  </div>
                  <div class="dash-overview-kpi-meta">Zestawienie postępu dnia</div>
                  <div
                    class="dash-overview-progress-track"
                    id="dashOverviewProgressBar"
                    role="progressbar"
                    aria-label="Postęp ogólny"
                    aria-valuetext="Wzór postępu do zdefiniowania"
                  >
                    <span></span>
                  </div>
                </article>
              </div>
            </div>

            <div
              class="dash-insights-row"
              data-dashboard-section="insights"
              role="region"
              aria-label="Operacyjny podgląd dnia"
            >
              <article
                class="card dash-insights-panel dash-insights-panel--objects"
                id="dashActiveWorkersPanel"
                aria-labelledby="dashActiveWorkersMapTitle"
              >
                <div class="dash-insights-panel-head">
                  <div>
                    <h2 class="dash-insights-panel-title" id="dashActiveWorkersMapTitle">Obiekty</h2>
                    <p class="dash-insights-panel-subtitle">Dzisiejsi pracownicy na obiektach</p>
                  </div>
                  <div class="dash-insights-panel-actions">
                    <span class="dash-insights-count" id="dashActiveWorkersMapCount">0 / 0 na mapie</span>
                    <button
                      class="dash-panel-collapse-toggle"
                      id="dashActiveWorkersPanelToggle"
                      type="button"
                      aria-controls="dashActiveWorkersPanelBody"
                      aria-expanded="true"
                      aria-label="Zwiń panel obiektów"
                      title="Zwiń panel obiektów"
                    >
                      Zwiń
                    </button>
                  </div>
                </div>

                <div
                  class="dash-insights-panel-compact"
                  id="dashActiveWorkersPanelCompact"
                  aria-live="polite"
                  hidden
                >
                  <strong id="dashActiveWorkersPanelCompactHeadline">Brak pracowników na mapie</strong>
                  <span id="dashActiveWorkersPanelCompactMeta">W pracy 0 · Zaplanowani 0 · Zakończeni 0 · Alarm 0</span>
                </div>

                <div class="dash-insights-panel-body" id="dashActiveWorkersPanelBody">
                  <div class="dash-active-workers-map-shell" id="dashActiveWorkersMapHome">
                    <div
                      class="dash-active-workers-map is-loading"
                      id="dashActiveWorkersMap"
                      role="region"
                      tabindex="0"
                      aria-label="Mapa pozycji GPS i zaplanowanych lokalizacji dzisiejszych pracowników"
                      aria-describedby="dashActiveWorkersMapStatus"
                      aria-busy="true"
                    >
                      <div class="dash-active-workers-map-empty">Ładowanie mapy...</div>
                    </div>
                    <button
                      class="dash-active-workers-map-expand"
                      id="dashActiveWorkersMapExpand"
                      type="button"
                      aria-controls="dashActiveWorkersMapOverlay"
                      aria-haspopup="dialog"
                      disabled
                    >
                      Powiększ mapę
                    </button>
                  </div>

                  <div class="dash-active-workers-map-legend" aria-label="Legenda statusów pracowników">
                    <span><i class="is-active" aria-hidden="true"></i>W pracy</span>
                    <span><i class="is-planned" aria-hidden="true"></i>Zaplanowany</span>
                    <span><i class="is-finished" aria-hidden="true"></i>Zakończony</span>
                    <span><i class="is-late" aria-hidden="true"></i>Nie rozpoczął w czasie</span>
                  </div>

                  <p class="dash-active-workers-map-status" id="dashActiveWorkersMapStatus" role="status" aria-live="polite">
                    Alarm pojawia się po przekroczeniu planu START o więcej niż 10 minut. Pozycja pochodzi z GPS, a przy jego braku z lokalizacji zadania.
                  </p>

                  <ul class="dash-active-workers-location-list" id="dashActiveWorkersLocationList" aria-label="Dzisiejsi pracownicy z pozycją GPS lub lokalizacją zadania">
                    <li class="dash-active-workers-location-empty">Brak pozycji GPS i lokalizacji zaplanowanych zadań.</li>
                  </ul>
                </div>
              </article>

              <article
                class="card dash-insights-panel dash-insights-panel--progress"
                id="dashServiceProgressPanel"
                aria-labelledby="dashServiceProgressTitle"
              >
                <div class="dash-insights-panel-head">
                  <div>
                    <h2 class="dash-insights-panel-title" id="dashServiceProgressTitle">Postęp usług</h2>
                    <p class="dash-insights-panel-subtitle">Tylko wykonanie jednoznacznie powiązane z planem</p>
                  </div>
                  <div class="dash-insights-panel-actions">
                    <span class="dash-insights-count dash-insights-count--active" id="dashServiceProgressCount" aria-live="polite">0 w toku</span>
                    <button
                      class="dash-panel-collapse-toggle"
                      id="dashServiceProgressPanelToggle"
                      type="button"
                      aria-controls="dashServiceProgressPanelBody"
                      aria-expanded="true"
                      aria-label="Zwiń panel postępu usług"
                      title="Zwiń panel postępu usług"
                    >
                      Zwiń
                    </button>
                  </div>
                </div>
                <div
                  class="dash-insights-panel-compact"
                  id="dashServiceProgressPanelCompact"
                  aria-live="polite"
                  hidden
                >
                  <strong id="dashServiceProgressPanelCompactHeadline">Brak usług realizowanych teraz</strong>
                  <span id="dashServiceProgressPanelCompactMeta">0 usług w toku</span>
                </div>
                <div class="dash-insights-panel-body" id="dashServiceProgressPanelBody">
                  <p
                    class="dash-service-correlation-status"
                    id="dashServiceCorrelationStatus"
                    role="status"
                    aria-live="polite"
                    hidden
                  ></p>
                  <ul
                    class="dash-operational-list dash-service-progress-list"
                    id="dashServiceProgressList"
                    tabindex="0"
                    aria-label="Najnowsze rozpoczęte i zakończone operacje"
                  >
                    <li class="dash-operational-empty">Brak usług realizowanych w tej chwili.</li>
                  </ul>
                </div>
              </article>

              <article
                class="card dash-insights-panel dash-insights-panel--completed"
                id="dashConfirmedTasksPanel"
                aria-labelledby="dashConfirmedTasksTitle"
              >
                <div class="dash-insights-panel-head">
                  <div>
                    <h2 class="dash-insights-panel-title" id="dashConfirmedTasksTitle">Potwierdzone ukończenie zadań</h2>
                    <p class="dash-insights-panel-subtitle">Bloki, w których zamknięto wszystkie wymagane przydziały</p>
                  </div>
                  <div class="dash-insights-panel-actions">
                    <span class="dash-insights-count dash-insights-count--completed" id="dashConfirmedTasksCount" aria-live="polite">0 dzisiaj</span>
                    <button
                      class="dash-panel-collapse-toggle"
                      id="dashConfirmedTasksPanelToggle"
                      type="button"
                      aria-controls="dashConfirmedTasksPanelBody"
                      aria-expanded="true"
                      aria-label="Zwiń panel ukończonych zadań"
                      title="Zwiń panel ukończonych zadań"
                    >
                      Zwiń
                    </button>
                  </div>
                </div>
                <div
                  class="dash-insights-panel-compact"
                  id="dashConfirmedTasksPanelCompact"
                  aria-live="polite"
                  hidden
                >
                  <strong id="dashConfirmedTasksPanelCompactHeadline">Brak ukończonych zadań dzisiaj</strong>
                  <span id="dashConfirmedTasksPanelCompactMeta">0 obiektów wysprzątanych dzisiaj</span>
                </div>
                <div class="dash-insights-panel-body" id="dashConfirmedTasksPanelBody">
                  <ul
                    class="dash-operational-list dash-completed-task-list"
                    id="dashConfirmedTasksList"
                    tabindex="0"
                    aria-label="Bloki zadań potwierdzone jako ukończone dzisiaj"
                  >
                    <li class="dash-operational-empty">Brak zakończonych sprzątań dzisiaj.</li>
                  </ul>
                </div>
              </article>
            </div>

            <section
              class="dash-active-workers-map-overlay"
              id="dashActiveWorkersMapOverlay"
              hidden
              aria-hidden="true"
            >
              <div
                class="dash-active-workers-map-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashActiveWorkersMapDialogTitle"
                aria-describedby="dashActiveWorkersMapDialogDescription"
              >
                <div class="dash-active-workers-map-dialog-head">
                  <div>
                    <span class="dash-active-workers-map-dialog-eyebrow">Mapa pracowników</span>
                    <h2 id="dashActiveWorkersMapDialogTitle">Pozycje pracowników</h2>
                    <p id="dashActiveWorkersMapDialogDescription">
                      Zielone pinezki oznaczają osoby w pracy, czerwone zakończony dzień, a niebieskie przydział do zadania na dziś. Pozycja pochodzi z GPS lub lokalizacji zadania.
                    </p>
                  </div>
                  <div class="dash-active-workers-map-dialog-actions">
                    <span class="dash-insights-count" id="dashActiveWorkersMapDialogCount">0 / 0 na mapie</span>
                    <button class="dash-active-workers-map-dialog-close" id="dashActiveWorkersMapClose" type="button">
                      Zamknij
                    </button>
                  </div>
                </div>
                <div class="dash-active-workers-map-modal-host" id="dashActiveWorkersMapModalHost"></div>
                <div class="dash-active-workers-map-dialog-foot">
                  <div class="dash-active-workers-map-legend" aria-label="Legenda statusów pracowników">
                    <span><i class="is-active" aria-hidden="true"></i>W pracy</span>
                    <span><i class="is-planned" aria-hidden="true"></i>Zaplanowany</span>
                    <span><i class="is-finished" aria-hidden="true"></i>Zakończony</span>
                    <span><i class="is-late" aria-hidden="true"></i>Nie rozpoczął w czasie</span>
                  </div>
                  <span>Przeciągnij mapę lub użyj kółka myszy, aby zmienić widok.</span>
                </div>
              </div>
            </section>

            <div class="card dash-feedback dash-activity-panel" data-dashboard-section="active">
              <div class="card-title-row">
                <div class="card-title" id="dashActivityTitle">Widok dnia dzisiejszego</div>
                <div class="dash-activity-actions">
                  <button
                    class="btn2 secondary dash-refresh-btn dash-refresh-btn--source"
                    id="dashRefreshBtn"
                    type="button"
                    aria-label="Odśwież dane pulpitu u źródła"
                    title="Odśwież dane pulpitu u źródła"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M20 11a8 8 0 0 0-14.2-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                      <path d="M6 5H3V2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M4 13a8 8 0 0 0 14.2 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                      <path d="M18 19h3v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Odśwież</span>
                  </button>
                  <button
                    class="btn2 secondary dash-refresh-btn dash-refresh-btn--icon"
                    id="dashActivitySettingsBtn"
                    type="button"
                    aria-label="Ustaw widok panelu"
                    aria-expanded="false"
                    title="Ustaw widok panelu"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="currentColor" stroke-width="2.1"/>
                      <path d="M12 2.5v3" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="M12 18.5v3" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="M4.5 12h-3" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="M22.5 12h-3" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="M6.7 6.7 4.6 4.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="m19.4 19.4-2.1-2.1" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="m17.3 6.7 2.1-2.1" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                      <path d="m4.6 19.4 2.1-2.1" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="dash-activity-view-popover" id="dashActivityViewPopover" hidden>
                <div class="dash-activity-view-popover-title">Widoczność panelu</div>
                <button class="dash-activity-view-option" type="button" data-dash-activity-view="today-calendar" aria-pressed="true">
                  <span class="dash-activity-view-option-name">Oś dnia dzisiejszego</span>
                  <span class="dash-activity-view-option-note">Kalendarz z aktualnym czasem na środku</span>
                </button>
                <button class="dash-activity-view-option" type="button" data-dash-activity-view="active-list" aria-pressed="false">
                  <span class="dash-activity-view-option-name">Lista aktywnych pracowników</span>
                  <span class="dash-activity-view-option-note">Dotychczasowy widok aktywnych osób</span>
                </button>
              </div>
              <div class="dash-last-refresh" id="dashLastRefresh">Ostatnie odświeżenie: -</div>

              <div class="dash-activity-calendar" id="dashActivityCalendar" data-dash-activity-view-panel="today-calendar">
                <div class="dash-activity-calendar-empty">Ładowanie widoku dnia...</div>
              </div>

              <div class="dash-events" data-dash-activity-view-panel="active-list" hidden>
                <div class="dash-events-head">
                  <div>Osoba</div>
                  <div>Wpisy</div>
                  <div>Klient</div>
                  <div>Aktywna strefa</div>
                  <div class="ta-right">Czas</div>
                </div>

                <div class="list dash-events-list" id="dashEventsList">
                  <div class="list-row dash-events-row">
                    <div class="muted">-</div><div class="muted">-</div><div class="muted">-</div>
                    <div class="muted">-</div>
                    <div class="muted ta-right">-</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div class="dash-metric-popover" id="dashMetricPopover" style="display:none;" role="dialog" aria-modal="false" aria-labelledby="dashMetricPopoverTitle">
            <div class="dash-metric-popover-title">
              <span id="dashMetricPopoverTitle">Szczegóły</span>
              <button class="dash-metric-popover-close" id="dashMetricPopoverClose" type="button" aria-label="Zamknij listę">×</button>
            </div>
            <div class="dash-metric-popover-list" id="dashMetricPopoverList"></div>
          </div>
        </section>

        <section id="view-calendar" style="display:none;"></section>
        <section id="view-kanban" style="display:none;"></section>
        <section id="view-contractProfitability" style="display:none;"></section>
        <section id="view-events" style="display:none;"></section>
        <section id="view-orders" style="display:none;"></section>
        <section id="view-ordersMap" style="display:none;"></section>
        <section id="view-zones" style="display:none;"></section>
        <section id="view-workerProfile" style="display:none;"></section>
        <section id="view-workerAccount" style="display:none;"></section>
        <section id="view-workerTime" style="display:none;"></section>
        <section id="view-workerTimeDetail" style="display:none;"></section>
        <section id="view-workdayStopProposals" style="display:none;"></section>
        <section id="view-audits" style="display:none;"></section>
        <section id="view-clientProfile" style="display:none;"></section>
        <section id="view-clientProfileDetails" style="display:none;"></section>
        <section id="view-reports" style="display:none;"></section>
        <section id="view-settings" style="display:none;"></section>

        <section id="view-placeholder" style="display:none !important;">
          <h1 class="welcome" id="phTitle">W budowie</h1>
          <p class="subwelcome" id="phText">Ten moduł dodamy w kolejnym etapie.</p>
        </section>
        </main>
      </div>
    </div>
  </div>
</div>
`
