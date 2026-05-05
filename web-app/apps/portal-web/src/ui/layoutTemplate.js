export const portalLayoutTemplate = `
<div class="login-screen" id="loginScreen" style="display:flex;">
  <div class="login-card" role="dialog" aria-label="Logowanie">
    <div class="login-brand">
      <div class="login-logo">
        <img src="/logotyp.jpg" alt="Best Clean" />
      </div>
      <p class="login-claim">Sprz&#261;tanie z nami to czysta przyjemno&#347;&#263;.</p>
    </div>

    <div class="login-field">
      <label for="loginLogin">Login</label>
      <input id="loginLogin" type="text" autocomplete="username" />
    </div>

    <div class="login-field">
      <label for="loginPass">Hasło</label>
      <input id="loginPass" type="password" autocomplete="current-password" />
    </div>

    <div class="login-error" id="loginErr" style="display:none;"></div>

    <button class="btn primary" id="loginBtn" type="button">Zaloguj</button>
  </div>
</div>

<div class="app-bg" id="portalRoot" style="display:none;">
  <div class="app-shell">
    <header class="header">
      <button
        class="header-left header-home-link"
        data-route="dashboard"
        type="button"
        aria-label="Przejdź do strony głównej"
        title="Strona główna"
      >
        <div class="logo-block logo-block--bestclean" aria-label="Logo Best Clean">
          <img src="/logotyp.jpg" alt="Best Clean" />
        </div>
        <div class="brand">
          <div class="brand-claim">Sprz&#261;tanie z nami to czysta przyjemno&#347;&#263;.</div>
        </div>
      </button>

      <div class="header-right">
        <div class="user-chip" id="userChip" title="Użytkownik">
          <span class="name" id="userName">-</span>
          <span class="dot" id="userDot" aria-hidden="true"></span>
        </div>
        <button class="btn2 danger" id="logoutBtn" type="button" title="Wyloguj">Wyloguj</button>
      </div>
    </header>

    <div class="app-body">
      <aside class="sidebar" id="portalSidebar">
        <div class="sidebar-head">
          <div class="sidebar-title">Menu</div>
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
          <button class="menu-order-add" id="sidebarOrdersAddBtn" type="button">
            <span class="menu-order-add-icon" aria-hidden="true">+</span>
            <span class="mi-label">Dodaj zlecenie</span>
          </button>
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
          <button class="menu-item" data-route="coordinator" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="8" r="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 20a5 5 0 0 1 10 0M14 20a4 4 0 0 1 8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Koordynator</span>
          </button>

          <button class="menu-section" type="button" data-toggle="clients">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8a3 3 0 1 1 0 6M22 20v-1a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Klienci</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-clients">
            <button class="submenu-item" data-route="clientsList" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 9h10M7 13h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Lista klientów</span>
            </button>
            <button class="submenu-item" data-route="individualOrders" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h6M8 12h6M8 16h4M20 14v6M17 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Zlecenie indywidualne</span>
            </button>
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

          <button class="menu-section" type="button" data-toggle="workers">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 14a4 4 0 0 1 8 0M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Pracownicy</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-workers">
            <button class="submenu-item" data-route="workerTime" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l4 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Czas pracy pracownika</span>
            </button>
            <button class="submenu-item" data-route="workerProfile" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Profil pracownika</span>
            </button>
          </div>

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
                <div class="card-title">Aktywni w dniu dzisiejszym</div>
                <div class="dash-activity-actions">
                  <button
                    class="btn2 secondary dash-refresh-btn dash-refresh-btn--icon"
                    id="dashRefreshBtn"
                    type="button"
                    aria-label="Odśwież pulpit"
                    title="Odśwież pulpit"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M20 6v6h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M4 18v-6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7.5 9a7 7 0 0 1 11-2.5L20 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M16.5 15a7 7 0 0 1-11 2.5L4 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <span class="pill" id="dashEventsPill">0</span>
                </div>
              </div>
              <div class="dash-last-refresh" id="dashLastRefresh">Ostatnie odświeżenie: - (autoodświeżenie co 15 min)</div>

              <div class="dash-events">
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
        <section id="view-workerTime" style="display:none;"></section>
        <section id="view-workerTimeDetail" style="display:none;"></section>
        <section id="view-clientsList" style="display:none;"></section>
        <section id="view-audits" style="display:none;"></section>
        <section id="view-individualOrders" style="display:none;"></section>
        <section id="view-clientProfile" style="display:none;"></section>
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
`
