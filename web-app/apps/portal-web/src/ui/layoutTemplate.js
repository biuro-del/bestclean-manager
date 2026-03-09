export const portalLayoutTemplate = `
<div class="login-screen" id="loginScreen" style="display:flex;">
  <div class="login-card" role="dialog" aria-label="Logowanie">
    <div class="login-brand">
      <div class="login-logo">
        <img src="/logotyp.jpg" alt="Best Clean" />
      </div>
      <div class="login-title">Panel WWW</div>
      <div class="login-subtitle">Zaloguj się do panelu zarządzania</div>
    </div>

    <div class="login-field">
      <label for="loginLogin">Login</label>
      <input id="loginLogin" type="text" autocomplete="username" placeholder="login@bestclean.pl" />
    </div>

    <div class="login-field">
      <label for="loginPass">Hasło</label>
      <input id="loginPass" type="password" autocomplete="current-password" placeholder="Wpisz hasło" />
    </div>

    <div class="login-error" id="loginErr" style="display:none;"></div>

    <button class="btn primary login-submit" id="loginBtn" type="button">Zaloguj</button>
  </div>
</div>

<div class="app-bg" id="portalRoot" style="display:none;">
  <div class="app-shell">
    <header class="header">
      <div class="header-left">
        <div class="logo-block" aria-label="Logo">
          <img src="/logotyp.jpg" alt="Best Clean" />
        </div>
        <div class="brand">
          <div class="brand-title">PORTAL @SK</div>
        </div>
      </div>

      <div class="header-right">
        <div class="user-chip" id="userChip" title="Użytkownik">
          <span class="name" id="userName">-</span>
          <span class="dot" id="userDot" aria-hidden="true"></span>
        </div>
        <button class="btn2 danger" id="logoutBtn" type="button" title="Wyloguj">Wyloguj</button>
      </div>
    </header>

    <div class="app-body">
      <aside class="sidebar">
        <div class="sidebar-title">Menu</div>

        <div class="menu">
          <button class="menu-item active" data-route="dashboard" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 11.5L12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Pulpit</span>
          </button>
          <button class="menu-item" data-route="schedule" type="button">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </span>
            <span class="mi-label">Grafik pracy</span>
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
            <button class="submenu-item" data-route="events" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Zdarzenia</span>
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
            <button class="submenu-item" data-route="checklists" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 9l1.5 1.5L12 8M8 14l1.5 1.5L12 13M14 9h3M14 14h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Checklisty</span>
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
            <button class="submenu-item" data-route="audits" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.8-3 7.8-7 9-4-1.2-7-4.2-7-9V6l7-3z" stroke="currentColor" stroke-width="1.8"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="mi-label">Audyty</span>
            </button>
            <button class="submenu-item" data-route="coordinator" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="8" r="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 20a5 5 0 0 1 10 0M14 20a4 4 0 0 1 8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Koordynator</span>
            </button>
          </div>

          <button class="menu-section" type="button" data-toggle="settings">
            <span class="mi-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15l1.2 2.1-2.1 2.1-2.1-1.2a8 8 0 0 1-2 .8L14 21h-4l-.4-2.2a8 8 0 0 1-2-.8l-2.1 1.2-2.1-2.1L4.6 15a8 8 0 0 1-.8-2L1.6 12l2.2-1a8 8 0 0 1 .8-2L3.4 6.9l2.1-2.1 2.1 1.2a8 8 0 0 1 2-.8L10 3h4l.4 2.2a8 8 0 0 1 2 .8l2.1-1.2 2.1 2.1-1.2 2.1a8 8 0 0 1 .8 2l2.2 1-2.2 1a8 8 0 0 1-.8 2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            </span>
            <span class="mi-label">Ustawienia</span><span class="chev">▼</span>
          </button>
          <div class="submenu" id="submenu-settings">
            <button class="submenu-item" data-route="settings" type="button">
              <span class="mi-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h10M4 17h16M14 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="mi-label">Ustawienia</span>
            </button>
          </div>
        </div>
      </aside>

      <main class="main">
        <section id="view-dashboard">
          <h1 class="welcome">Pulpit</h1>
          <p class="subwelcome">Widok startowy portalu.</p>

          <div class="dash-grid">
            <div class="card dash-pulse dash-overview-panel">
              <div class="card-title-row">
                <div class="card-title">Przegląd</div>
              </div>

              <div class="dash-summary">
                <button class="sum-block" id="sumOpenBlock" type="button">
                  <div class="sum-num" id="sumOpenCount">-</div>
                  <div class="sum-label">Otwarte zdarzenia (brak STOP)</div>
                  <div class="sum-sub" id="sumOpenNames"></div>
                </button>

                <button class="sum-block" id="sumOver9Block" type="button">
                  <div class="sum-num" id="sumOver9Count">-</div>
                  <div class="sum-label">Przekroczone 9h (zakończone dni)</div>
                  <div class="sum-sub" id="sumOver9Names"></div>
                </button>
              </div>
            </div>

            <div class="card dash-feedback dash-activity-panel">
              <div class="card-title-row">
                <div class="card-title">Aktywni w dniu dzisiejszym</div>
                <div class="dash-activity-actions">
                  <button class="btn2 secondary dash-refresh-btn" id="dashRefreshBtn" type="button">Odśwież</button>
                  <span class="pill" id="dashEventsPill">0</span>
                </div>
              </div>
              <div class="dash-last-refresh" id="dashLastRefresh">Ostatnie odświeżenie: - (autoodświeżenie co 15 min)</div>

              <div class="dash-events">
                <div class="dash-events-head">
                  <div>Osoba</div>
                  <div>Wpisy</div>
                  <div>Aktywna strefa</div>
                  <div>Lokalizacja strefy</div>
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

            <aside class="card dash-goals dash-side-panel">
              <div class="card-title-row">
                <div class="card-title">Szybkie przejścia</div>
              </div>

              <div class="dash-side-group">
                <div class="mini-actions">
                  <button class="mini-link" type="button" data-route="events">Zdarzenia</button>
                  <button class="mini-link" type="button" data-route="schedule">Grafik pracy</button>
                  <button class="mini-link" type="button" data-route="workerTime">Czas pracy</button>
                </div>
              </div>

              <div class="dash-side-group">
                <div class="card-title-row">
                  <div class="card-title">Najczęściej używane</div>
                </div>
                <div class="mini-actions">
                  <button class="mini-link" type="button" data-route="clientsList">Lista klientów</button>
                  <button class="mini-link" type="button" data-route="zones">Strefy</button>
                  <button class="mini-link" type="button" data-route="reports">Zestawienia</button>
                </div>
                <p class="dash-side-note">Układ paneli jest zoptymalizowany pod duże ekrany i responsywny na mniejszych.</p>
              </div>
            </aside>
          </div>
        </section>

        <section id="view-events" style="display:none;"></section>
        <section id="view-zones" style="display:none;"></section>
        <section id="view-workerProfile" style="display:none;"></section>
        <section id="view-workerTime" style="display:none;"></section>
        <section id="view-workerTimeDetail" style="display:none;"></section>
        <section id="view-clientsList" style="display:none;"></section>
        <section id="view-audits" style="display:none;"></section>
        <section id="view-individualOrders" style="display:none;"></section>
        <section id="view-clientProfile" style="display:none;"></section>
        <section id="view-checklists" style="display:none;"></section>
        <section id="view-reports" style="display:none;"></section>

        <section id="view-placeholder" style="display:none !important;">
          <h1 class="welcome" id="phTitle">W budowie</h1>
          <p class="subwelcome" id="phText">Ten moduł dodamy w kolejnym etapie.</p>
        </section>
      </main>
    </div>
  </div>
</div>
`
