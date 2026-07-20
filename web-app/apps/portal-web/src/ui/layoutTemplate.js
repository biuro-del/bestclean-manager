const loginCleaningIllustrationUrl = new URL('../graphics/cleaning service-01.svg', import.meta.url).href

export const portalLayoutTemplate = `
<div class="login-screen" id="loginScreen" style="display:grid;">
  <section class="login-visual" aria-hidden="true">
    <img class="login-illustration" src="${loginCleaningIllustrationUrl}" alt="" />
  </section>
  <section class="login-panel">
    <form class="login-card" id="loginForm" role="dialog" aria-labelledby="loginTitle" novalidate>
      <div class="login-brand">
        <h1 class="login-title" id="loginTitle">Witaj!</h1>
        <p class="login-copy" id="loginCopy">Zaloguj si&#281; do portalu Cleanzi.</p>
      </div>

      <div id="loginCredentialsPanel">
        <div class="login-field">
          <label for="loginLogin">Email</label>
          <input id="loginLogin" type="email" maxlength="160" autocomplete="username" inputmode="email" spellcheck="false" />
        </div>

        <div class="login-field">
          <label for="loginPass">Hasło</label>
          <input id="loginPass" type="password" autocomplete="current-password" />
        </div>

        <button class="btn primary login-submit" id="loginBtn" type="submit">Zaloguj</button>
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
        <button class="login-organization-cancel" id="loginOrganizationCancel" type="button">Anuluj i wyloguj</button>
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
    </form>
  </section>
</div>

<div class="app-bg" id="portalRoot" style="display:none;">
  <section class="platform-center" id="platformCenter" hidden aria-labelledby="platformCenterTitle">
    <div class="platform-center-shell">
      <header class="platform-center-header">
        <div>
          <span class="platform-center-kicker">Cleanzi</span>
          <h1 id="platformCenterTitle">Centrum platformy</h1>
          <p>Wybierz organizację i podaj powód wejścia. Dostęp zostanie zapisany w prywatnym audycie platformy.</p>
        </div>
        <button class="btn2 danger" id="platformCenterLogout" type="button">Wyloguj</button>
      </header>
      <div class="platform-center-filters">
        <label>Wyszukaj<input id="platformOrganizationSearch" type="search" placeholder="Nazwa lub ID organizacji" /></label>
        <label>Status<select id="platformOrganizationStatus"><option value="">Wszystkie</option><option value="ACTIVE">Aktywne</option><option value="SUSPENDED">Zawieszone</option><option value="EXPIRED">Wygasłe</option></select></label>
        <label>Pakiet<select id="platformOrganizationPlan"><option value="">Wszystkie</option><option value="TRIAL">Trial</option><option value="START">Start</option><option value="PRO">Pro</option></select></label>
        <label>Usunięcie<select id="platformOrganizationDeletion"><option value="">Wszystkie</option><option value="active">Nieusunięte</option><option value="deleted">Usunięte</option></select></label>
      </div>
      <label class="platform-center-reason">Powód wejścia do organizacji<textarea id="platformAccessReason" maxlength="1000" rows="2" placeholder="Np. zgłoszenie #1234 – korekta konfiguracji"></textarea></label>
      <div class="platform-center-message" id="platformCenterMessage" aria-live="polite"></div>
      <section class="platform-organization-editor" id="platformOrganizationEditor" hidden aria-labelledby="platformOrganizationEditorTitle">
        <div class="platform-organization-editor-header">
          <div>
            <span class="platform-center-kicker">Aktywny kontekst</span>
            <h2 id="platformOrganizationEditorTitle">Zarządzaj organizacją</h2>
            <p id="platformOrganizationEditorSubtitle"></p>
          </div>
          <button class="btn2" id="platformOrganizationEditorClose" type="button">Zamknij kontekst</button>
        </div>
        <div class="platform-organization-editor-grid">
          <label>ID organizacji<input id="platformEditorOrgId" type="text" readonly /></label>
          <label>Nazwa<input id="platformEditorName" type="text" maxlength="120" /></label>
          <label>Status organizacji
            <select id="platformEditorStatus">
              <option value="ACTIVE">Aktywna</option>
              <option value="SUSPENDED">Zawieszona</option>
              <option value="EXPIRED">Wygasła</option>
            </select>
          </label>
          <label>Status onboardingu<input id="platformEditorOnboardingStatus" type="text" maxlength="30" placeholder="np. COMPLETED" /></label>
          <label>Pakiet
            <select id="platformEditorPlanCode">
              <option value="TRIAL">Trial</option>
              <option value="START">Start</option>
              <option value="PRO">Pro</option>
            </select>
          </label>
          <label>Status subskrypcji<input id="platformEditorSubscriptionStatus" type="text" maxlength="30" placeholder="np. ACTIVE" /></label>
          <label>Koniec Trial<input id="platformEditorTrialEndsAt" type="datetime-local" /></label>
          <label>Koniec okresu płatnego<input id="platformEditorCurrentPeriodEndsAt" type="datetime-local" /></label>
          <label>Worker ID nowego Ownera<input id="platformEditorOwnerWorkerId" type="text" maxlength="128" /></label>
        </div>
        <div class="platform-organization-editor-message" id="platformOrganizationEditorMessage" aria-live="polite"></div>
        <div class="platform-organization-editor-actions">
          <button class="btn2 primary" id="platformEditorSaveOrganization" type="button">Zapisz organizację</button>
          <button class="btn2 primary" id="platformEditorSaveSubscription" type="button">Zapisz subskrypcję</button>
          <button class="btn2" id="platformEditorTransferOwner" type="button">Przekaż własność</button>
          <button class="btn2 danger" id="platformEditorToggleDeletion" type="button">Usuń organizację</button>
          <button class="btn2" id="platformEditorEnter" type="button">Wejdź do organizacji</button>
        </div>
      </section>
      <div class="platform-organization-list" id="platformOrganizationList"></div>
      <div class="platform-center-pagination">
        <button class="btn2" id="platformOrganizationsPrev" type="button">Poprzednia</button>
        <span id="platformOrganizationsPage">Strona 1</span>
        <button class="btn2" id="platformOrganizationsNext" type="button">Następna</button>
      </div>
    </div>
  </section>
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
            <span class="mi-label">Kanban</span>
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
          <button class="menu-item" data-route="schedule" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Grafik pracy</span>
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

          <button class="menu-section" type="button" data-toggle="settings">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15l1.2 2.1-2.1 2.1-2.1-1.2a8 8 0 0 1-2 .8L14 21h-4l-.4-2.2a8 8 0 0 1-2-.8l-2.1 1.2-2.1-2.1L4.6 15a8 8 0 0 1-.8-2L1.6 12l2.2-1a8 8 0 0 1 .8-2L3.4 6.9l2.1-2.1 2.1 1.2a8 8 0 0 1 2-.8L10 3h4l.4 2.2a8 8 0 0 1 2 .8l2.1-1.2 2.1 2.1-1.2 2.1a8 8 0 0 1 .8 2l2.2 1-2.2 1a8 8 0 0 1-.8 2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Ustawienia</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-settings">
            <button class="submenu-item" data-route="settingsStyles" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.3 4.7 5.2.8-3.8 3.7.9 5.2L12 15.8l-4.6 2.5.9-5.2-3.8-3.7 5.2-.8L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Style</span>
            </button>
            <button class="submenu-item" data-route="settingsBackup" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 7a2 2 0 0 1 2-2h9l5 5v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 5v5h5M8 14h8M8 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Kopia zapasowa</span>
            </button>
          </div>
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
            <div class="organization-chip" id="organizationChip" title="Aktywna organizacja" hidden>
              <span class="organization-chip-label">Organizacja</span>
              <span class="organization-chip-name" id="organizationName"></span>
            </div>
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

              <div class="dash-summary dash-summary--no-comments" id="dashSummaryTables">
                <div class="dash-summary-table dash-summary-table--today" data-dashboard-section="overview" aria-label="Dzień dzisiejszy i błędy w systemie">
                  <div class="dash-summary-block">
                    <div class="dash-summary-table-title">Dzień dzisiejszy</div>
                    <div class="dash-summary-table-rows dash-summary-table-rows--compact">
                      <button class="dash-summary-row dash-summary-row--compact" type="button" data-dash-metric="activeNow">
                        <span class="dash-summary-row-label">Aktywni teraz</span>
                        <span class="dash-summary-row-value" id="sumActiveNowCount">0</span>
                      </button>
                      <button class="dash-summary-row dash-summary-row--compact" type="button" data-dash-metric="finishedToday">
                        <span class="dash-summary-row-label">Zakończone (START + STOP)</span>
                        <span class="dash-summary-row-value" id="sumFinishedTodayCount">0</span>
                      </button>
                      <div class="dash-summary-row dash-summary-row--compact dash-summary-row--static">
                        <span class="dash-summary-row-label">Suma godzin dzisiaj</span>
                        <span class="dash-summary-row-value" id="sumTotalHoursToday">00:00</span>
                      </div>
                    </div>
                  </div>

                  <div class="dash-summary-block dash-summary-errors-block">
                    <div class="dash-summary-table-title dash-summary-table-title--sub">Błędy w systemie</div>
                    <div class="dash-summary-table-rows dash-summary-table-rows--compact">
                      <button class="dash-summary-row dash-summary-row--compact" type="button" data-dash-metric="openStartStopYesterday">
                        <span class="dash-summary-row-label">Nie zamknięte START-STOP</span>
                        <span class="dash-summary-row-value" id="sumOpenStartStopYesterdayCount">0</span>
                      </button>
                      <button class="dash-summary-row dash-summary-row--compact" type="button" data-dash-metric="openCleanYesterday">
                        <span class="dash-summary-row-label">Nie zamknięte CLEAN</span>
                        <span class="dash-summary-row-value" id="sumOpenCleanYesterdayCount">0</span>
                      </button>
                      <button class="dash-summary-row dash-summary-row--compact" type="button" data-dash-metric="cleanTooLong">
                        <span class="dash-summary-row-label">CLEAN &gt; 1,5h</span>
                        <span class="dash-summary-row-value" id="sumCleanTooLongCount">0</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="dash-summary-table dash-kanban-panel" id="dashKanbanTasksPanel" data-dashboard-section="tasks" aria-label="Dzisiejsze zadania i zaległe">
                  <div class="dash-kanban-title-row">
                    <div>
                      <div class="dash-summary-table-title">Dzisiejsze zadania i zaległe</div>
                    </div>
                    <span class="pill dash-kanban-count" id="dashKanbanTasksCount">0</span>
                  </div>
                  <div class="dash-kanban-list" id="dashKanbanTasksList">
                    <div class="dash-kanban-empty">Brak dzisiejszych i zaległych zadań.</div>
                  </div>
                </div>

              </div>
            </div>

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

            <aside class="card dash-goals dash-side-panel dash-schedule-panel" data-dashboard-section="schedule">
              <div class="card-title-row">
                <div class="card-title">Grafik dnia</div>
                <button
                  class="btn2 secondary dash-refresh-btn dash-refresh-btn--icon"
                  id="dashScheduleRefreshBtn"
                  type="button"
                  aria-label="Odśwież grafik dnia"
                  title="Odśwież grafik dnia"
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v6h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M4 18v-6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7.5 9a7 7 0 0 1 11-2.5L20 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M16.5 15a7 7 0 0 1-11 2.5L4 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>

              <div class="dash-schedule-sync" id="dashScheduleSync">Ostatnia synchronizacja: -</div>
              <div class="dash-schedule-legend" aria-label="Legenda kolorów grafiku">
                <span class="dash-schedule-legend-item is-missing-start">Czerwony: brak START</span>
                <span class="dash-schedule-legend-item is-upcoming">Pomarańczowy: start do 1h</span>
                <span class="dash-schedule-legend-item is-started">Zielony: QR START</span>
                <span class="dash-schedule-legend-item">Domyślny: start &gt; 1h</span>
              </div>

              <div class="dash-schedule-daybar">
                <button class="btn2 dash-schedule-nav" id="dashSchedulePrevBtn" type="button" aria-label="Poprzedni dzień">&lt;</button>
                <div class="dash-schedule-dayinfo">
                  <div class="dash-schedule-dayname" id="dashScheduleDayName">-</div>
                  <div class="dash-schedule-daydate" id="dashScheduleDayDate">-</div>
                </div>
                <button class="btn2 dash-schedule-nav" id="dashScheduleNextBtn" type="button" aria-label="Następny dzień">&gt;</button>
              </div>

              <div class="dash-schedule-cards" id="dashScheduleCards">
                <div class="dash-schedule-empty">Wczytywanie grafiku...</div>
              </div>
            </aside>
          </div>

          <div class="dash-metric-popover" id="dashMetricPopover" style="display:none;" role="dialog" aria-live="polite">
            <div class="dash-metric-popover-title" id="dashMetricPopoverTitle">Szczegóły</div>
            <div class="dash-metric-popover-list" id="dashMetricPopoverList"></div>
          </div>
        </section>

        <section id="view-schedule" style="display:none;"></section>
        <section id="view-calendar" style="display:none;"></section>
        <section id="view-kanban" style="display:none;"></section>
        <section id="view-events" style="display:none;"></section>
        <section id="view-orders" style="display:none;"></section>
        <section id="view-ordersMap" style="display:none;"></section>
        <section id="view-zones" style="display:none;"></section>
        <section id="view-workerProfile" style="display:none;"></section>
        <section id="view-workerAccount" style="display:none;"></section>
        <section id="view-workerTime" style="display:none;"></section>
        <section id="view-workerTimeDetail" style="display:none;"></section>
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
