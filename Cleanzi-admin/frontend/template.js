import adminMarkUrl from './admin-mark.svg?url'

export const platformAdminTemplate = `
  <section class="cleanzi-admin" id="platformCenter" hidden aria-labelledby="platformCenterTitle">
    <div class="cleanzi-admin__shell">
      <aside class="cleanzi-admin__sidebar">
        <div class="cleanzi-admin__brand" aria-label="Cleanzi Admin Panel">
          <img src="${adminMarkUrl}" alt="" width="46" height="46" />
          <div>
            <strong>Cleanzi</strong>
            <span>Admin Panel</span>
          </div>
        </div>

        <nav class="cleanzi-admin__nav" aria-label="Widoki Panelu admina">
          <span class="cleanzi-admin__nav-label">Zarządzanie</span>
          <button class="cleanzi-admin__nav-button is-active" type="button" data-platform-view="dashboard" aria-current="page"><i class="ph ph-squares-four" aria-hidden="true"></i><span>Dashboard</span></button>
          <button class="cleanzi-admin__nav-button" type="button" data-platform-view="organizations"><i class="ph ph-buildings" aria-hidden="true"></i><span>Organizacje</span></button>
        </nav>

        <div class="cleanzi-admin__sidebar-footer">
          <p><i class="ph ph-shield-check" aria-hidden="true"></i><span>Prywatny panel<br />PLATFORM_OWNER</span></p>
          <button class="btn2 danger" id="platformCenterLogout" type="button"><i class="ph ph-sign-out" aria-hidden="true"></i>Wyloguj</button>
        </div>
      </aside>

      <main class="cleanzi-admin__content">
        <header class="cleanzi-admin__header">
          <div>
            <span class="cleanzi-admin__kicker"><i class="ph ph-shield-check" aria-hidden="true"></i>Administracja platformą</span>
            <h1 id="platformCenterTitle">Panel admina</h1>
            <p>Organizacje, subskrypcje i rozliczenia w jednym prywatnym panelu.</p>
          </div>
          <div class="cleanzi-admin__header-actions">
            <button class="btn2 primary" id="platformAdminRefresh" type="button"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>Odśwież dane</button>
          </div>
        </header>

        <div class="cleanzi-admin__message" id="platformCenterMessage" aria-live="polite" aria-atomic="true"></div>

      <section class="cleanzi-admin__view" id="platformAdminDashboard" aria-labelledby="platformAdminDashboardTitle">
        <div class="cleanzi-admin__section-heading">
          <div>
            <h2 id="platformAdminDashboardTitle">Dashboard platformy</h2>
            <p id="platformAdminDashboardTimestamp">Dane nie zostały jeszcze pobrane.</p>
          </div>
        </div>
        <div class="cleanzi-admin__metrics" id="platformAdminMetrics" aria-live="polite"></div>
      </section>

      <section class="cleanzi-admin__view" id="platformAdminOrganizations" hidden aria-labelledby="platformAdminOrganizationsTitle">
        <div class="cleanzi-admin__filter-card">
          <div class="cleanzi-admin__section-heading">
            <div class="cleanzi-admin__section-title">
              <span class="cleanzi-admin__section-icon" aria-hidden="true"><i class="ph ph-buildings"></i></span>
              <div>
                <h2 id="platformAdminOrganizationsTitle">Organizacje</h2>
                <p>Wyniki są filtrowane i sortowane po stronie serwera.</p>
              </div>
            </div>
            <button class="btn2" id="platformAdminClearFilters" type="button"><i class="ph ph-funnel-simple-x" aria-hidden="true"></i>Wyczyść filtry</button>
          </div>

          <form class="cleanzi-admin__filters" id="platformAdminFilters" role="search">
          <label class="cleanzi-admin__field cleanzi-admin__field--wide">
            <span>Wyszukaj</span>
            <span class="cleanzi-admin__control"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input id="platformOrganizationSearch" type="search" placeholder="Nazwa, orgId, Owner lub email" autocomplete="off" /></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Status organizacji</span>
            <span class="cleanzi-admin__control"><select id="platformOrganizationStatus">
              <option value="">Wszystkie</option>
              <option value="ACTIVE">Aktywne</option>
              <option value="SUSPENDED">Zawieszone</option>
              <option value="EXPIRED">Wygasłe</option>
            </select></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Onboarding</span>
            <span class="cleanzi-admin__control"><select id="platformOrganizationOnboarding">
              <option value="">Wszystkie</option>
              <option value="PENDING">Oczekuje</option>
              <option value="IN_PROGRESS">W toku</option>
              <option value="COMPLETED">Zakończony</option>
            </select></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Plan</span>
            <span class="cleanzi-admin__control"><select id="platformOrganizationPlan">
              <option value="">Wszystkie</option>
              <option value="TRIAL">Trial</option>
              <option value="GO_PLUS">GO+</option>
              <option value="PLUS">PLUS</option>
              <option value="PRO">PRO</option>
            </select></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Status subskrypcji</span>
            <span class="cleanzi-admin__control"><select id="platformOrganizationSubscriptionStatus">
              <option value="">Wszystkie</option>
              <option value="TRIALING">Trial aktywny</option>
              <option value="PENDING_PAYMENT">Oczekuje na płatność</option>
              <option value="ACTIVE">Aktywna</option>
              <option value="SUSPENDED">Zawieszona</option>
              <option value="PAST_DUE">Zaległa</option>
              <option value="CANCELED">Anulowana</option>
              <option value="EXPIRED">Wygasła</option>
            </select></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Trial kończy się</span>
            <span class="cleanzi-admin__control"><i class="ph ph-calendar-blank" aria-hidden="true"></i><select id="platformOrganizationTrialWindow">
              <option value="">Dowolnie</option>
              <option value="3">w ciągu 3 dni</option>
              <option value="7">w ciągu 7 dni</option>
              <option value="14">w ciągu 14 dni</option>
              <option value="30">w ciągu 30 dni</option>
            </select></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Usunięcie</span>
            <span class="cleanzi-admin__control"><i class="ph ph-trash" aria-hidden="true"></i><select id="platformOrganizationDeletion">
              <option value="">Wszystkie</option>
              <option value="active">Nieusunięte</option>
              <option value="deleted">Usunięte</option>
            </select></span>
          </label>
          <label class="cleanzi-admin__field">
            <span>Na stronie</span>
            <span class="cleanzi-admin__control"><i class="ph ph-article" aria-hidden="true"></i><select id="platformOrganizationPageSize">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select></span>
          </label>
          </form>
        </div>

        <label class="cleanzi-admin__context-reason">
          <span><i class="ph ph-file-text" aria-hidden="true"></i>Powód wejścia do organizacji</span>
          <textarea id="platformAccessReason" maxlength="1000" rows="2" placeholder="Np. zgłoszenie #1234 – weryfikacja rozliczenia"></textarea>
          <small>Powód wejścia jest zapisywany w prywatnym audycie platformy.</small>
        </label>

        <div class="cleanzi-admin__results">
          <div class="cleanzi-admin__organization-summary" id="platformOrganizationSummary" aria-live="polite"></div>
          <div class="cleanzi-admin__table-wrap" tabindex="0" aria-label="Przewijana tabela organizacji">
            <table class="cleanzi-admin__table">
            <thead>
              <tr>
                <th scope="col"><button type="button" data-platform-sort="name"><i class="ph ph-buildings" aria-hidden="true"></i>Organizacja</button></th>
                <th scope="col"><button type="button" data-platform-sort="createdAt">Rejestracja</button></th>
                <th scope="col"><button type="button" data-platform-sort="owner">Owner</button></th>
                <th scope="col"><button type="button" data-platform-sort="status">Status</button></th>
                <th scope="col"><button type="button" data-platform-sort="planCode">Plan</button></th>
                <th scope="col"><button type="button" data-platform-sort="subscriptionStatus">Subskrypcja</button></th>
                <th scope="col"><button type="button" data-platform-sort="endsAt">Koniec / dni</button></th>
                <th scope="col"><button type="button" data-platform-sort="lastPaymentAt">Ostatnia płatność</button></th>
                <th scope="col"><span class="sr-only">Operacje</span></th>
              </tr>
            </thead>
            <tbody id="platformOrganizationList"></tbody>
            </table>
          </div>
          <div class="cleanzi-admin__pagination" aria-label="Paginacja organizacji">
            <button class="btn2" id="platformOrganizationsPrev" type="button">Poprzednia</button>
            <span id="platformOrganizationsPage">Strona 1</span>
            <button class="btn2" id="platformOrganizationsNext" type="button">Następna</button>
          </div>
        </div>
      </section>

      <section class="cleanzi-admin__details" id="platformOrganizationEditor" hidden aria-labelledby="platformOrganizationEditorTitle">
        <header class="cleanzi-admin__details-header">
          <div>
            <span class="cleanzi-admin__kicker">Aktywny kontekst organizacji</span>
            <h2 id="platformOrganizationEditorTitle">Szczegóły organizacji</h2>
            <p id="platformOrganizationEditorSubtitle"></p>
          </div>
          <div class="cleanzi-admin__header-actions">
            <button class="btn2" id="platformEditorEnter" type="button">Wejdź do organizacji</button>
            <button class="btn2" id="platformOrganizationEditorClose" type="button">Zamknij kontekst</button>
          </div>
        </header>
        <div class="cleanzi-admin__tabs" role="tablist" aria-label="Szczegóły organizacji">
          <button role="tab" aria-selected="true" aria-controls="platformTabSummary" id="platformTabButtonSummary" data-platform-tab="summary" type="button">Podsumowanie</button>
          <button role="tab" aria-selected="false" aria-controls="platformTabSubscription" id="platformTabButtonSubscription" data-platform-tab="subscription" type="button" tabindex="-1">Subskrypcja</button>
          <button role="tab" aria-selected="false" aria-controls="platformTabBilling" id="platformTabButtonBilling" data-platform-tab="billing" type="button" tabindex="-1">Płatności i faktury</button>
          <button role="tab" aria-selected="false" aria-controls="platformTabHistory" id="platformTabButtonHistory" data-platform-tab="history" type="button" tabindex="-1">Historia zmian</button>
          <button role="tab" aria-selected="false" aria-controls="platformTabAudit" id="platformTabButtonAudit" data-platform-tab="audit" type="button" tabindex="-1">Prywatny audyt</button>
        </div>
        <div class="cleanzi-admin__tab-panel" id="platformTabSummary" role="tabpanel" aria-labelledby="platformTabButtonSummary"></div>
        <div class="cleanzi-admin__tab-panel" id="platformTabSubscription" role="tabpanel" aria-labelledby="platformTabButtonSubscription" hidden></div>
        <div class="cleanzi-admin__tab-panel" id="platformTabBilling" role="tabpanel" aria-labelledby="platformTabButtonBilling" hidden></div>
        <div class="cleanzi-admin__tab-panel" id="platformTabHistory" role="tabpanel" aria-labelledby="platformTabButtonHistory" hidden></div>
        <div class="cleanzi-admin__tab-panel" id="platformTabAudit" role="tabpanel" aria-labelledby="platformTabButtonAudit" hidden></div>
      </section>
      </main>
    </div>

    <div class="cleanzi-admin__dialog-backdrop" id="platformOperationDialog" hidden>
      <section class="cleanzi-admin__dialog" role="dialog" aria-modal="true" aria-labelledby="platformOperationDialogTitle" aria-describedby="platformOperationDialogDescription">
        <header>
          <div>
            <span class="cleanzi-admin__kicker">Operacja ręczna</span>
            <h2 id="platformOperationDialogTitle">Potwierdź operację</h2>
            <p id="platformOperationDialogDescription"></p>
          </div>
          <button class="cleanzi-admin__dialog-close" id="platformOperationDialogClose" type="button" aria-label="Zamknij dialog">×</button>
        </header>
        <form id="platformOperationForm" novalidate>
          <div class="cleanzi-admin__operation-fields" id="platformOperationFields"></div>
          <label class="cleanzi-admin__field cleanzi-admin__field--full">
            <span>Powód operacji</span>
            <textarea id="platformOperationReason" maxlength="1000" rows="3" required></textarea>
          </label>
          <div class="cleanzi-admin__operation-preview" id="platformOperationPreview" aria-live="polite"></div>
          <div class="cleanzi-admin__dialog-actions">
            <button class="btn2" id="platformOperationCancel" type="button">Anuluj</button>
            <button class="btn2" id="platformOperationPreviewButton" type="submit">Pokaż zmiany</button>
            <button class="btn2 primary" id="platformOperationConfirmButton" type="button" hidden>Potwierdź i zapisz</button>
          </div>
        </form>
      </section>
    </div>
  </section>
`
