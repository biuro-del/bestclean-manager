# Design QA — wariant 2 „Plan dnia”

- Source visual truth: `C:\Users\rafal\.codex\generated_images\019f8611-d2eb-7520-afe2-15652be5b2cf\call_7hAO21mT0gXXmyVStgbaXjxr.png`
- Implementation URL: `http://localhost:5173/`
- Primary viewport: 1440 × 1024 CSS px
- Source pixels: 1500 × 1004
- Implementation screenshot: `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-implementation-final.png`
- Combined comparison: `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-comparison-final.png`
- Responsive captures:
  - `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-responsive-1180.png`
  - `C:\Users\rafal\Desktop\app to react\.codex-tmp\dashboard-option-2-responsive-760.png`
- Density normalization: reference scaled proportionally into a 1440 × 1024 comparison pane; implementation captured at native 1440 × 1024.

## Findings

- No actionable P0, P1 or P2 visual mismatch remains.
- The first-screen hierarchy, two-column plan area, operational map, reaction panel and live operations match the selected direction.
- Differences in counts, object names, map markers and empty plan state are intentional: the implementation renders the current portal data instead of copying demonstration values from the reference.
- The local schedule source currently falls back because the local Google Cloud application-default session is expired. This leaves `Plan dnia` at `0 z 0` and is a local data-source limitation, not a visual regression.

## Interaction QA

- Filters panel opens and closes.
- View control switches between map and list and restores the map.
- `Zobacz wszystkie operacje` opens the full operation dialog; active sessions remain first; the dialog closes correctly.
- `Otwórz kalendarz` navigates to the calendar and the dashboard navigation returns to the first screen.
- Operational map loads tiles and remains interactive after the dashboard finishes loading.
- At 1180 px and 760 px the layout stacks without horizontal page overflow.

## Technical QA

- Focused command-center and service-operation model tests: 17/17 passed.
- Targeted ESLint: passed.
- Production build: passed.
- Targeted `git diff --check`: passed; only existing Windows line-ending warnings remain.
- Browser console: no runtime error; known warnings concern the expired local Google Cloud application-default session and local data fallbacks.

## Comparison history

- Initial pass: blocked by unauthenticated dashboard.
- Authenticated pass: first-screen composition compared side by side; no P0/P1/P2 mismatch found.
- Final pass: map tiles loaded, interactions verified and responsive widths checked.

final result: passed

---

# Design QA - Events editor footer buttons (2026-08-25)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-62c7b130-197e-40c4-bf68-9c8f21084fec.png` (963 x 128 px).
- Browser-rendered implementation: `C:\Users\dosta\.codex\visualizations\2026\08\25\01a037c0-c40b-7331-82ec-13524a0a1722\events-footer-after-963x128.png` (963 x 128 px).
- Focused comparison: `C:\Users\dosta\.codex\visualizations\2026\08\25\01a037c0-c40b-7331-82ec-13524a0a1722\events-footer-comparison.png`.
- Browser CSS viewport: 963 x 160 px at device scale factor 1; the implementation was cropped without resampling to the same 963 x 128 px region as the source.
- State: neutral edit-mode footer with Delete, Cancel, and Save actions visible. The authenticated portal was unavailable in the in-app browser, so the focused browser render used the production template markup and the same portal and Events stylesheets.

## Findings and required fidelity surfaces

- No actionable P0, P1, or P2 difference remains for the requested button consistency.
- Fonts and typography: all three actions resolve to Manrope, 12.5 px, weight 700, 15 px line height, and zero added letter spacing, matching `Zapisz zmiany`.
- Spacing and layout: all three buttons resolve to 44 px height, 10 x 16 px padding, 10 px radius, and a 7 px icon gap. Existing placement and footer alignment are preserved.
- Colors and tokens: violet remains the primary save action, red remains destructive, and white/navy remains neutral; this intentional semantic distinction prevents competing primary actions.
- Image and icon fidelity: the existing Phosphor trash, cancel, and check icons are retained and all resolve to 14 px. No custom or placeholder asset was introduced.
- Copy and content: `Usuń zdarzenie`, `Anuluj`, and `Zapisz zmiany` remain unchanged.

## Interaction and technical QA

- Each of the three focused buttons resolved uniquely and accepted a click in the browser harness.
- Browser console: no warnings or errors.
- Focused UI contract test, ESLint, production build, and `git diff --check` are recorded after the final implementation pass.
- Focused region comparison was sufficient because the request changes only the editor footer controls and intentionally preserves the surrounding modal.

## Comparison history

1. The supplied state showed stronger and clearer primary-action typography than the Delete and Cancel variants.
2. Shared footer geometry, type, and icon rules were applied to all three controls while preserving semantic colors and widths.
3. The equal-size browser comparison confirmed consistent height, radius, typography, icon size, and padding with no actionable P0/P1/P2 mismatch.

## Implementation checklist

- [x] Match Delete and Cancel typography to Save.
- [x] Match button height, radius, padding, icon size, and spacing.
- [x] Preserve semantic colors, labels, behavior, and responsive footer layout.
- [x] Verify the focused browser render, interactions, console, tests, lint, build, and diff.

final result: passed

---

# Design QA - Role cards and Orders table alignment (2026-08-25)

## Reference and verification state

- Source visuals: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-3e556146-9dec-4c85-9a05-30e7f2a5319e.png` and `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-848d08fe-11aa-4771-946f-e88c0d00e1c2.png`.
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\roles-final.png` and `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\orders-final.png`.
- Focused comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-roles-orders-comparison.png`.
- Browser viewports: 1920 x 911, 1440 x 900, and 1024 x 820 CSS px.
- State: authenticated Best Clean account, Agata Zalewska profile, Roles and Orders tabs.

## Evidence and findings

- The role controls and permission preview now have identical 220 px outer heights and aligned 127 px inner surfaces.
- Both role cards use the existing Manrope, navy, violet, border, radius, and shadow tokens; no asset or business-logic change was needed.
- The Orders table, header, empty state, and rows now span the card from border to border. Browser measurement reports one pixel on each side, matching the card border itself.
- The Orders table remains centered and keeps its existing five-column grid, page-size selector, pager identifiers, and horizontal safety behavior.
- At 1440 px both role cards remain equal and side by side; at 1024 px they stack with the same width and height. The only document overflow observed at 1024 px comes from the pre-existing global header, not the worker panel.
- The final authenticated flow produced zero browser console errors.

## Technical QA

- Full test suite: 654/654 passed.
- Focused worker-account UI tests: 8/8 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check` and conflict-marker scan: passed for the changed UI contract and stylesheet.

## Implementation checklist

- [x] Equalize and visually refine both Roles and access cards.
- [x] Align their inner content and preserve form identifiers and edit behavior.
- [x] Remove the nested side strips from the Orders table.
- [x] Center the table within its card while preserving data, pagination, and empty states.
- [x] Verify authenticated rendering at desktop and 1024 px widths.

final result: passed

---

# Design QA - Simplified worker header and security deactivation (2026-08-25)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-3a5811bb-3cac-4fc5-9356-085f4e543bdf.png` (494 x 83 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-security-deactivation-1920.png` (1905 x 904 px).
- Focused source/implementation comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-security-deactivation-comparison.png` (1500 x 690 px).
- Browser viewport: 1920 x 911 CSS px at device scale factor 1; safety check at 1024 x 768 CSS px.
- State: authenticated Best Clean session, Agata Zalewska profile, `Bezpieczenstwo` tab.

## Evidence and findings

- The former white title/status/action header is removed. The top region has exactly one child: the existing `Lista Pracownikow` back button.
- The worker name and active-status badge remain available in the sticky employee card, avoiding duplicate identity content above the page.
- The existing deactivation control appears exactly once, inside a dedicated danger section in `Bezpieczenstwo`; its enabled state and Admin permission logic are unchanged.
- At 1024 px the back control and the complete deactivation action remain inside the visible viewport. The portal keeps its existing desktop-first horizontal canvas outside this scoped change.
- The back button was exercised and returned to the worker list. The profile and `Bezpieczenstwo` tab were then reopened for handoff.
- Browser logs contain only Vite connection messages and the React development notice; no errors were recorded.
- No actionable P0, P1, P2, or P3 mismatch remains for the requested removal and relocation.

## Required fidelity surfaces

- Typography: the existing Manrope hierarchy, weights, and sizes are preserved; no new font treatment was introduced.
- Spacing and layout: the framed 82 px header is replaced by a compact, unboxed back-navigation row; the danger action uses the existing card rhythm.
- Colors and tokens: the security action uses the established danger border, background, and text tokens.
- Image and icon fidelity: the existing Phosphor arrow and user-minus icons are reused; no image asset was added or approximated.
- Copy and content: the redundant employee name/status copy was removed from the top; deactivation copy was moved and clarified without changing the operation.

## Technical QA

- Full test suite: 654/654 passed.
- Focused worker-account UI tests: 8/8 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check`: passed for the changed worker-account files and UI contract.

## Implementation checklist

- [x] Leave only the worker-list back button above the profile layout.
- [x] Remove the redundant worker title and active-status badge from the top block.
- [x] Move the existing deactivation action into `Bezpieczenstwo` without duplicating it.
- [x] Preserve permissions, disabled states, confirmation flow, and handler binding.
- [x] Verify visual state, navigation, focused contract, full tests, lint, and build.

final result: passed

---

# Design QA - Activity employee comment modal (2026-08-25)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-b529c21c-b06b-44a5-8226-0096eaf9b31c.png` (632 x 314 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-comment-modal.png` (1920 x 855 px).
- Focused before/after comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-comment-comparison.png` (1540 x 600 px).
- Browser viewports: 1920 x 855 and 1024 x 768 CSS px.
- State: authenticated Best Clean account, Agata Zalewska profile, Activity tab, first August event whose source comment contains multiline GPS metadata and `STOP BC0823`.

## Evidence and findings

- The native JavaScript alert is replaced by a portal-styled modal with a Phosphor icon, heading, empty state, close control, and primary `Gotowe` action.
- Multiline `[[GPS ...]]` blocks, timestamps, source markers, and the generated `STOP BC0823` marker are excluded from the employee-facing comment while the underlying record remains unchanged.
- The affected real record is labelled `Brak komentarza pracownika`, and its modal shows a neutral empty state without coordinates, technical markers, or a native browser dialog.
- The dialog measured 520 x 415 px at 1920 px and stayed fully within the 1024 x 768 viewport without clipping.
- Focus starts on the close button, Tab cycles between the two modal controls, Escape and `Gotowe` close the dialog, and focus returns to the originating comment button.
- No actionable P0, P1, P2, or P3 visual mismatch remains. Browser console verification returned zero errors in the tested flow.

## Required fidelity surfaces

- Typography and colors follow the existing worker-account Manrope, navy, violet, border, and shadow tokens.
- The modal uses the existing Phosphor icon library and no new raster, SVG, or placeholder asset.
- The Activity table columns, event data, pagination, APIs, and stored source comment are unchanged.
- The comparison confirms that the source problem was the native alert and raw technical payload, while the implemented state is a focused employee-comment surface.

## Technical QA

- Full test suite: 653/653 passed.
- Focused work-interval and worker-account UI tests: 35/35 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- Browser interactions: native dialog absent; technical payload absent; Escape, Tab loop, focus restoration, and `Gotowe` verified.

## Implementation checklist

- [x] Strip GPS metadata and generated START/STOP markers from the visible employee comment.
- [x] Preserve the original event data and all Activity-table behavior.
- [x] Replace the native alert with an accessible, portal-styled modal.
- [x] Add a clear empty state when no employee-written comment remains.
- [x] Verify the authenticated rendered state at desktop and 1024 px, comparison evidence, tests, lint, and build.

final result: passed

---

# Design QA - Activity table edge-to-edge and editor names (2026-08-24)

## Reference and verification state

- Source table: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-c20f1197-8744-4be5-956d-d852ba94bf41.png` (1222 x 419 px).
- Source annotation: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-22162ccf-c921-410d-bb2e-be68bc1388ed.png` (573 x 404 px).
- Activity implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-edge-editor-name-1920.jpg` (1905 x 848 px).
- Time implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-editor-name-1920.jpg` (1905 x 848 px).
- Side-by-side comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-editor-comparison.png` (2468 x 520 px).
- CSS viewport: 1920 x 855 px at device scale factor 1.
- State: authenticated Best Clean worker account for Agnieszka Orzoł, with the Activity and Time tabs populated from the live local data source.

## Full-view and focused evidence

- The Activity table now cancels only the 18 px content-card inset, so its header and records meet the inner edge of the outer card without disturbing the section heading or pagination.
- The outer card measures 1212 px and the table, header, first row, and last row each use the complete 1210 px inner width from x=645 to x=1855.
- The nested table border and radius are removed and `scrollbar-gutter` resolves to `auto`; horizontal scrolling remains available when the viewport cannot contain every column.
- Every visible Activity row shows `Agnieszka Orzoł` in the Editor column. The Time tab also resolves all 17 rendered editor values to `Agnieszka Orzoł` instead of the login.

## Required fidelity surfaces

- Typography: existing Manrope font, table scale, row density, weights, and navy hierarchy remain unchanged.
- Spacing and layout rhythm: only the accidental side gutters are removed; header content, pagination, and row padding retain the established dashboard rhythm.
- Colors and visual tokens: existing white card, pale table header, alternating rows, semantic time pills, and subtle dividers are preserved.
- Image and icon fidelity: worker avatars and Phosphor icons use the existing shared renderers without replacement or scaling changes.
- Copy and data: the raw author identifiers are not changed. A presentation-only resolver maps the identifier to the matching worker or session display name.
- Responsiveness and accessibility: column order, semantics, focus behavior, controls, and the horizontal overflow fallback remain intact.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains.
- Final authenticated verification produced no new browser console errors after switching back to Activity.

## Comparison history

1. The Time-table annotation established the required edge-to-edge treatment and exposed the same stable-scrollbar gutter pattern used by Activity.
2. The Activity wrapper now uses the same table-only negative inset, border reset, and automatic scrollbar gutter while leaving the card shell untouched.
3. A shared display-name resolver was applied to Activity and Time, replacing login presentation without modifying APIs, records, sorting, filtering, exports, or reconciliation.
4. The post-fix side-by-side image and browser measurements confirm the full-width treatment and readable editor names.

## Technical QA

- Full test suite: 651/651 passed.
- Focused worker-account and reconciliation tests: 42/42 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- Browser measurement: table border 0 px; table radius 0 px; `scrollbar-gutter: auto`; table `clientWidth` and `scrollWidth` both 1210 px.
- Final browser log delta: 0 new entries and 0 new errors.

## Implementation checklist

- [x] Resolve editor identifiers to worker display names in Activity and Time.
- [x] Remove Activity-table side strips without changing the surrounding card layout.
- [x] Preserve data loading, events, permissions, filtering, pagination, exports, and reconciliation logic.
- [x] Verify authenticated browser states, side-by-side comparison, tests, lint, and build.

final result: passed

---

# Design QA - Time table alignment, missing STOP state, and selection removal (2026-08-24)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-833c6428-6bb4-462e-940b-6402ee06c1b3.png` (413 x 485 px).
- Browser-rendered Time table: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-no-checkbox-yellow-row-1920.jpg` (1905 x 848 px).
- Browser-rendered History dialog: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-history-total-right-1920.jpg` (1905 x 848 px).
- Focused before/after comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-cleanup-comparison.png` (1028 x 589 px).
- Primary CSS viewport: 1920 x 855 px at device scale factor 1. Additional responsive checks used 1440 x 900 px and 1024 x 900 px.
- State: authenticated Best Clean worker account for Agata Zalewska, Time tab, first available History dialog open for final delivery.

## Full-view and focused evidence

- The Time table now uses eight aligned columns: User, Date, Start, Stop, Time, History, Break, and Edited. Header and first-row center coordinates match at 1920, 1440, and 1024 px.
- Header and row checkboxes are absent. The evidence exporter still consumes every loaded row from the active date range, so downloading the current month does not depend on row selection.
- A historical day with an open session uses a full pale-yellow row with an amber inset marker. The Stop cell shows only `BRAK`; no secondary `Brak STOP sesji` badge is rendered.
- The History summary keeps a single combined duration and aligns its value to the right edge of the summary bar.
- At narrower desktop widths the table owns its horizontal overflow. The existing global portal header remains the source of page-level overflow at 1024 px and was not changed by this scoped worker-account update.

## Required fidelity surfaces

- Fonts and typography: the existing Manrope hierarchy and tabular time treatment remain unchanged; time pills sit directly beneath the Time heading without secondary wrapping.
- Spacing and layout rhythm: the revised eight-track grid distributes the removed selection space across useful columns while keeping semantic time controls centered.
- Colors and visual tokens: green Start, red Stop, violet Time, pale-yellow missing-Stop state, navy text, and blue History controls reuse the existing worker-account tokens.
- Image quality and asset fidelity: the worker avatar and Phosphor icons remain unchanged and render sharply at device scale factor 1.
- Copy and content: only the requested missing-Stop copy changed to `BRAK`; reconciliation, History details, comments, GPS actions, and editing content are preserved.
- Responsiveness and accessibility: the table remains keyboard-readable, the History trigger is still a button, and the modal retains its dialog structure and close action.

## Findings

- No actionable P0, P1, or P2 visual differences remain.
- One historical Leaflet console error occurred while resizing a separate map-bearing state. A fresh final Time-table and History-dialog interaction produced no new runtime errors.

## Primary interactions and runtime checks

- Opened the worker Time tab and verified five rendered day rows with no checkbox controls.
- Confirmed matching header and row alignment at 1920, 1440, and 1024 px.
- Opened the History dialog and confirmed that exactly one combined duration is visible and right-aligned.
- Reset the browser viewport, reopened the final History dialog, and confirmed zero new console errors after the final interaction.

## Comparison history

1. The supplied state showed a selection column, a two-line Time cell for missing Stop, and a long `Brak STOP` label that crowded the grid.
2. Selection state and controls were removed, the grid was reduced to eight tracks, and the Time cell was normalized to one centered value.
3. The missing-Stop condition was moved to the full row background, Stop copy was shortened to `BRAK`, and the History total was aligned right.
4. The post-fix side-by-side comparison confirms clean column alignment, a quieter warning state, and retained design-system fidelity.

## Technical QA

- Focused worker-account and reconciliation tests: 42/42 passed.
- Full test suite: 651/651 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check`: passed with expected Windows line-ending notices.
- Conflict-marker scan: passed; the repeated equals sign in `ReadMe.txt` is a separator, not a merge marker.

## Implementation checklist

- [x] Remove header and row checkboxes from the Time table.
- [x] Keep export scoped to the full active month/date range, independent of row selection.
- [x] Align Time data directly below its header.
- [x] Render missing Stop as `BRAK` and highlight the complete row in pale yellow.
- [x] Remove the secondary `Brak STOP sesji` label.
- [x] Right-align the single combined duration in the History dialog.
- [x] Verify browser behavior, responsive widths, tests, lint, build, diff, and conflict markers.

final result: passed

---

# Design QA — panel pracownika i siedem zakładek (2026-08-24)

## Źródło i stan

- Punkt wyjścia: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-31a8edd2-a1b3-446d-8531-98bc4c341d1f.png` (1600 × 781 px).
- Wzorce produktu: istniejący Pulpit oraz odświeżona Lista pracowników w uwierzytelnionym portalu.
- Implementacja: `http://localhost:5174/`, konto Agaty Zalewskiej, dane produkcyjnego zestawu testowego.
- Porównanie w tym samym stanie i rozmiarze okna: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-account-comparison.png`.
- Porównanie detalu: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-account-comparison-focused.png`.
- Dodatkowe widoki: wszystkie siedem zakładek przy 1920 px, Czas pracy przy 1440 px oraz Konto przy 1024 px zapisano w `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa`.

## Wymagane powierzchnie wierności

- Typografia: Manrope, granatowa hierarchia tekstu i skala nagłówków są zgodne z Pulpitem i Listą pracowników; długie dane są ograniczone bez kolizji z sąsiednimi polami.
- Układ i odstępy: nagłówek, przyklejona karta pracownika, pasek zakładek i białe karty mają spójny rytm, promienie, obramowania i cienie. Konto, Bezpieczeństwo, Role i dostęp, Zlecenia, Aktywność, Czas pracy i Pliki zachowują własne funkcje, lecz używają wspólnego języka wizualnego.
- Kolory i stany: fioletowy akcent, neutralne powierzchnie oraz semantyczne kolory statusów, błędów i brakującego QR STOP zachowują kontrast i istniejące znaczenie.
- Ikony i zasoby: ręcznie osadzone SVG-y zastąpiono ikonami Phosphor; istniejące zdjęcie pracownika i wszystkie rzeczywiste dane pozostały bez zmian.
- Responsywność: przy 1920 i 1440 px boczna karta pozostaje przyklejona; przy 1024 px przechodzi w bezpieczny, statyczny układ kart. Moduł nie generuje poziomego overflow (`scrollWidth - clientWidth = 0`); tabela czasu pracy przewija się we własnej karcie.
- Dostępność i interakcje: aktywne zakładki, focus, hover, etykiety przycisków, widoczność hasła, edycja/zapis/anulowanie, paginacja, eksport i okno szczegółów czasu pracy zostały sprawdzone w przeglądarce.

## Ustalenia i historia poprawek

1. Pierwsza kontrola wykryła P1: nadrzędna reguła `display` mogła pokazywać przyciski Zapisz i Anuluj mimo atrybutu `hidden`. Dodano jednoznaczną regułę `[hidden] { display: none !important; }` dla akcji edycji.
2. Kontrola 1440 px wykryła P2: filtry czasu pracy i cztery miesięczne KPI były zbyt ciasne. Przy szerokości do 1500 px filtry oraz podsumowanie przechodzą teraz w czytelny układ pionowy.
3. Ponowna kontrola 1440 px potwierdziła pełną szerokość filtrów, osobny rząd KPI oraz brak overflow całego modułu.
4. Kontrola 1024 px potwierdziła układ jednokolumnowy, statyczną kartę boczną, poziomo przewijalny pasek zakładek i brak nakładania treści.
5. Końcowy log przeglądarki nie zawiera błędów ani ostrzeżeń. Nie pozostały żadne problemy P0, P1 ani P2.

## Weryfikacja techniczna

- Pełny `npm test`: 649/649 testów zaliczonych.
- Testy skupione na panelu pracownika i uzgadnianiu czasu: 46/46 zaliczonych.
- ESLint w `web-app`: zaliczony.
- Produkcyjny build Vite: zaliczony; pozostało jedynie istniejące ostrzeżenie o rozmiarze części chunków.
- `node --check` dla modułu konta: zaliczony.
- `git diff --check` i kontrola znaczników konfliktów dla zmienionych plików: zaliczone; Git zgłasza wyłącznie informacyjne ostrzeżenia o przyszłej konwersji LF do CRLF.

final result: passed

---

# Design QA — lista pracowników: filtry, akcje i typografia (2026-08-24)

## Źródło i stan

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-e587f1e6-93de-4c96-aca3-64c1e7ee7f20.png`.
- Implementation URL: `http://localhost:5174/`.
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-list-actions-desktop.png`.
- Focused implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-action-trigger.png`.
- Focused comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-action-trigger-comparison.png`.
- Open-menu state: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-action-menu-open.png`.
- Primary viewport: 1905 × 904 CSS px at density 1.
- Pixel dimensions: source 59 × 57; full implementation 1905 × 904; focused implementation 50 × 38. No density normalization was required.
- State: authenticated portal, `Lista pracowników`, action trigger closed and first-row action menu open.

## Comparison evidence

- Full-view evidence covers the split filter/search workspace, separate quick-actions card, worker table, removed contact column, and the compact action control.
- Focused comparison places the supplied reference beside the implemented gear-and-caret control. Border, neutral background, compact rectangular shape, icon hierarchy, and affordance match the reference; the implementation is deliberately larger to satisfy the requested icon/control enlargement.
- The open-state capture confirms that the shared menu remains above the table surface and exposes exactly: `Zobacz`, `Edycja`, and `Usuń użytkownika`.

## Required fidelity surfaces

- Fonts: existing portal Manrope typography retained; non-user table labels and icons enlarged without changing user-name/avatar sizing.
- Spacing and layout: filters/search and operational actions are separate dashboard-style cards; desktop, stacked, tablet, and mobile arrangements are defined at 1380, 1080, 720, and 520 px.
- Colors: existing dashboard neutrals and indigo action color reused; both quick-action buttons now share one treatment.
- Icons and assets: existing Phosphor icon system reused; no new raster UI asset was introduced.
- Copy: existing labels and business actions retained; only the contact presentation column was removed.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains.
- The focused action control matches the supplied reference while preserving the portal's visual system and accessible hit area.
- Residual P3 test gap: this environment did not expose browser viewport emulation for a separate mobile screenshot. Responsive breakpoints and horizontal table containment were verified structurally and by contract tests.

## Primary interactions tested

- The row action control opens and closes its menu and exposes all three requested commands.
- `Edycja` opens the existing worker-edit modal.
- `Dodaj pracownika` opens the existing add-user modal.
- `Pobierz ewidencję pracy` opens the existing export flow after selecting a row.
- No delete operation or other backend-changing action was executed during visual QA.

## Technical QA

- Full test suite: 645/645 passed.
- ESLint: passed.
- Production build: passed; only the existing bundle-size advisory was emitted.
- JavaScript syntax check: passed.
- Browser surface did not provide a console-capture channel; no visible runtime error appeared in the verified states.

## Comparison history

1. First implemented pass was compared at full-view and focused-control levels.
2. No P0, P1, or P2 issue remained after the comparison, so no further visual correction pass was required.

final result: passed

---

# Design QA — punktowa edycja zdarzeń czasu pracy

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-97370a8b-0bd5-49da-97a8-058bc87225b4.png` (850 × 809 px).
- Implementation URL: `http://localhost:5174/`.
- Implementation screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\work-time-editor-implementation.png` (1280 × 720 px).
- Combined comparison: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\work-time-editor-comparison.png`.
- State: modal dnia 23.07.2026 z rozwiniętą edycją pojedynczego zdarzenia CLEAN.
- Density: natywny zrzut przeglądarki przy `devicePixelRatio = 1`.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Modal został poszerzony do maksymalnie 820 px i nie ma poziomego przewijania.
- Usunięto zbiorcze akcje „Edytuj START, STOP i strefy”, „Edytuj sesję” oraz sekcję „Naprawa i dane dnia”.
- Każdy START, STOP i wpis operacyjny ma własne menu trzech pionowych kropek umieszczone bezpośrednio obok wskaźnika GPS.
- Formularz rozwija się pod wybranym wpisem, zachowuje kontekst klienta i strefy oraz nie przesuwa pozostałych pól poza modal.
- Hierarchia, kolory, promienie i znaczniki START/STOP pozostają zgodne z dotychczasowym wyglądem Cleanzi.
- Na wąskich ekranach pola edycji przechodzą do jednej kolumny bez poziomego overflow.

## Interaction and technical QA

- Kliknięcie menu zamyka inny otwarty edytor i otwiera wyłącznie formularz wskazanego wpisu.
- `Anuluj`, przycisk zamknięcia i `Escape` zamykają lokalny formularz bez zapisu.
- `Zapisz zmianę` waliduje wybrany wpis i od razu wysyła jego korektę; nie wymaga drugiego globalnego zapisu.
- Automatyczny powód audytu pozostaje po stronie aplikacji, więc użytkownik nie musi uzupełniać dodatkowej sekcji naprawy.
- Konsola renderowanego podglądu: 0 błędów.
- ESLint: passed.
- Pełny zestaw testów: 522/522 passed.
- Production build: passed; wyłącznie istniejące ostrzeżenia o rozmiarze części paczek.

## Comparison history

- P2 w referencji: trzy równoległe sposoby edycji powodowały nakładanie pól, poziomy scrollbar i niejasny proces zapisu.
- Fix: edycję sprowadzono do jednego punktowego menu przy rekordzie, a modal poszerzono bez zmiany stylu kart.
- Kontrola po poprawce: pełny i zbliżony widok potwierdzają czytelny układ, poprawne odstępy, brak nachodzenia oraz jednoznaczny przycisk „Zapisz zmianę”.
# Design QA — short-height responsive release gate

## Source, implementation and normalization

- Source visual truth: `C:\Users\rafal\.codex\generated_images\01a02950-61b9-7e22-b381-efc6e1d1030d\exec-2a3d7509-beac-4545-b215-509e9cf34d3b.png`.
- Latest browser-rendered desktop: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-final-desktop-1440x1024-20260823.png`.
- Full-view combined comparison: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-final-comparison-1440x1024-20260823.png`.
- Focused responsive evidence, login error: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-landscape-error-844x390-20260823.png`.
- Focused responsive evidence, e-mail registration error: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-landscape-email-error-844x390-20260823.png`.
- Source pixels: 1488 × 1058, normalized to 1440 × 1024. Desktop implementation: 1440 × 1024 CSS px and pixels at density 1. Focused short-height implementation: 844 × 390 CSS px and pixels at density 1.
- States: default desktop; landscape login with local validation error; company-registration choice; landscape e-mail registration with local validation error. No real authentication, OAuth, e-mail send or company creation was performed.

## Findings and fidelity surfaces

- The release audit found one P1 after the earlier pass: the short-screen branch was limited to widths up to 620 px. At 844 × 390 the login error state measured a 817 px document, scrolled to `y=370`, with the 634.75 px card extending from `y=-218` to `y=416.75`. A boundary review then found the same discontinuity immediately above the first 700 px and 620 px height cut-offs.
- Fix: the hero-removal branch now covers widths up to 920 px at heights up to 820 px; the 680 px high compact branch is independent of width; a 480 px high branch further tightens non-interactive spacing and hides only the repeated security note.
- Typography and accessibility: the very-short layout retains the existing font family and hierarchy, uses a 26 px title, preserves 44 px fields and primary/secondary controls, and keeps the 16 px mobile input text from the mobile-width rule.
- Spacing and layout rhythm: the 844 × 390 error-state card now measures 350.45 px and sits fully inside the viewport at `y=19.77–370.22`. Registration choice measures 347.80 px; e-mail registration with error measures 346.05 px. No horizontal or vertical page overflow remains.
- Colors and tokens: navy, blue, borders, validation red, focus treatment and shadows remain unchanged from the accepted option 1 composition.
- Image quality and assets: canonical Cleanzi SVG and optimized hero photo remain unchanged. The photo is intentionally omitted only where short height would otherwise displace the core task.
- Copy and content: login and registration copy is unchanged. On viewports at most 480 px high the repeated security note is omitted; the action, fields, registration entry and validation message remain visible.
- Icons and interactions: the existing Phosphor eye and lock treatments remain. Password visibility, login validation, registration choice and e-mail validation continue to use the existing functional controls.
- Longer organization and MFA states retain bounded internal overflow on short screens; the core public login and registration states do not require page or internal scrolling.
- Browser console: no error or warning was recorded in the verified public states.

## Post-fix viewport evidence with a visible validation message

- 768 × 700: document 768 × 700, card `y=20–654.75`, no page scroll.
- 768 × 701 and 768 × 800: document exactly matches the viewport, card `y=20–654.75`, no page scroll.
- 920 × 700: document 920 × 700, card `y=20–654.75`, no page scroll.
- 920 × 820: document 920 × 820, card `y=20–654.75`; at 920 × 821 the hero returns and the card remains within `y=152–786.75`. Neither boundary scrolls.
- 921 × 700: document 921 × 700, card `y=37–596.28`, no page scroll.
- 1280 × 600: document 1280 × 600, card `y=12–426.36`, no page scroll.
- 1280 × 621, 1280 × 632 and 1280 × 680: document exactly matches the viewport, card `y=12–426.36`; at 1280 × 681 the standard card returns within `y=37–596.28`. None of these boundaries scrolls.
- 320 × 568: document 320 × 568, card `y=12–437.64`, no page scroll.
- 390 × 844: document 390 × 844, card `y=146–653.95`, no page scroll.
- 921 × 480, 920 × 480 and 1280 × 480: document height 480, e-mail error card `y=66.97–413.02`, no page scroll.
- Every measurement used `max(document.documentElement.scrollHeight, document.body.scrollHeight)` and also verified card top, card bottom, `scrollY=0` and document width equal to viewport width.

## Comparison history

1. Earlier pass: portrait phone and normal laptop states passed, but the 621–920 px wide short-height range was not exercised.
2. Independent release review found the P1 at 844 × 390 and identified the same risk at 768 × 700 and 1280 × 600.
3. A second boundary review found discontinuities just above 700 px and 620 px; the final limits were therefore moved to 820 px for the narrow hero branch and 680 px for the width-independent compact branch.
4. The height-aware responsive rules were generalized without using `transform: scale()`, CSS `zoom` or root overflow clipping.
5. Post-fix browser verification passed all listed exact boundary sizes and the login, registration-choice and e-mail-error states. The standard 1440 × 1024 comparison remains visually unchanged. No P0, P1 or P2 finding remains open.

final result: passed

---

# Design QA — modal START/STOP pracownika (03.08.2026)

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-f6ffe7cf-bc05-4b93-9c2e-92959b167c37.png` (567 × 387 px).
- Implementation: modal `#waTimeCodesOverlay` w portalu lokalnym `http://localhost:5174/`.
- Implementation screenshot: niedostępny — przeglądarka poprawnie wyrenderowała DOM, lecz każda próba `Page.captureScreenshot` przekroczyła limit czasu.
- Viewport pomiarowy: 1280 × 720 px, `devicePixelRatio = 1`; kontrola responsywna: 375 × 667 px.
- Stan: jedna zamknięta sesja, dwa kody START/STOP, bez problemów integralności.

## Dowody z renderu

- Modal: 560 × 403 px; nagłówek: 510 × 44 px.
- Każdy wiersz START/STOP: 510 × 76 px.
- Pasek łącznego czasu: 510 × 58 px; obszar akcji: 510 × 38 px.
- Przy szerokości 375 px dokument, modal i oba wiersze miały `scrollWidth === clientWidth`; brak poziomego przepełnienia.
- DOM potwierdził kolejno: tytuł, liczbę kodów, osobny START, osobny STOP, jeden łączny czas i przycisk `Gotowe`.

## Findings

- Typografia i copy: tytuł oraz etykiety odpowiadają wzorcowi; czas pozostaje dokładny w `HH:MM:SS`, zgodnie z kontraktem rozliczeń.
- Rytm i układ: wysokości wierszy oraz paska czasu odpowiadają proporcjom źródła; naprawa dnia jest schowana w zwijanym panelu i pojawia się tylko wtedy, gdy zapis jest dostępny i potrzebny.
- Kolory: zachowane semantyczne zielone START, czerwone STOP, niebieski pasek sumy i fioletowa akcja `Gotowe`.
- Obrazy i assety: wzorzec nie zawiera obrazów rastrowych; ikony pochodzą z istniejącego systemu komponentów portalu.
- Responsywność: pomiary nie wykazały poziomego przepełnienia na telefonie.
- Bloker: brak zrzutu implementacji uniemożliwia wymagane wspólne porównanie pikselowe źródła i renderu.

## Comparison history

- P1 przed poprawką: modal pokazywał połączone karty sesji, dwa konkurencyjne podsumowania i stale widoczne narzędzia naprawy.
- Fix: przywrócono osobne wiersze kodów START/STOP, jeden pasek `Łączny czas pracy`, kompaktową szerokość 560 px oraz pojedynczy przycisk `Gotowe` w zwykłym podglądzie.
- Kontrola po poprawce: kontrakt DOM i pomiary układu przeszły; pikselowe porównanie pozostaje zablokowane przez błąd przechwytywania zrzutu.

final result: blocked

---

# Design QA — przycisk „Zaloguj się przez Google” (2026-07-31)

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-66cdba5f-29d0-4165-adf5-961e21d74d4f.png`.
- Source pixels: 320 × 89 px; widoczny przycisk około 285 × 69 px.
- Implementation URL: `http://localhost:5174/`.
- Implementation full screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\login-screen-google-button.png`.
- Implementation focused screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\google-button-implementation.png`.
- Mobile screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\31\019fb74a-1278-7c20-b857-753058ada7e4\login-google-mobile.png`.
- Desktop viewport: 1280 × 720 CSS px, density 1; przycisk 311.59 × 64 px.
- Mobile viewport: 390 × 844 CSS px, density 1; przycisk 312 × 64 px, bez poziomego overflow.
- State: publiczny formularz logowania, przycisk widoczny i aktywny.

## Findings

- Brak rozbieżności P0, P1 i P2 w zakresie wskazanego komponentu.
- Fonts and typography: 16 px, waga 600, czarny tekst; dłuższa polska etykieta zachowuje czytelność i nie zawija się.
- Spacing and layout rhythm: kapsułowy promień, wysokość 64 px, logo 24 px i odstęp 13 px odpowiadają proporcjom wzorca.
- Colors and visual tokens: białe tło oraz cienkie obramowanie `#747775` odpowiadają neutralnej stylistyce Google; focus używa czytelnego niebieskiego obrysu.
- Image quality and asset fidelity: prawdziwy wielokolorowy znak Google jest pobierany z `gstatic.com`; renderuje się ostro w rozmiarze 24 × 24 px i nie został zastąpiony literą ani rysunkiem CSS.
- Copy and content: zachowano jednoznaczną polską akcję „Zaloguj się przez Google”.

## Comparison evidence

- Focused comparison otworzył źródło i kadr implementacji razem. Kształt, obramowanie, białe tło, wyśrodkowanie znaku oraz rytm ikona–tekst są zgodne; różnica szerokości wynika z dłuższej polskiej etykiety i jest akceptowalna.
- Pełny widok potwierdza spójność komponentu z kartą logowania Cleanzi.
- Wersja mobilna nie zawija tekstu i nie powoduje overflow.

## Interaction and technical QA

- Przycisk ma pojedynczą nazwę dostępną, jest widoczny i aktywny.
- Zachowano istniejący handler Google Auth; zmiana dotyczy wyłącznie znacznika ikony i stylów.
- Zweryfikowano stany hover, active, disabled i focus-visible w arkuszu stylów.
- Konsola lokalnego ekranu logowania: 0 błędów.

## Comparison history

- Pierwsza kontrola: zgodność bez P0/P1/P2; nie była potrzebna iteracja naprawcza.
- P3: implementacja ma dłuższą etykietę niż krótki napis „Google” ze wzorca, lecz lepiej opisuje działanie i mieści się na 390 px.

final result: passed

---

# Design QA — „Zdarzenia” w stylu „Pulpitu”

- Source visual truth: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-source.png`.
- Browser-rendered implementation: `http://localhost:5173/qa-events-style.html` podczas kontroli; tymczasowy harness został po QA usunięty, a właściwy portal pozostaje pod `http://localhost:5173/`.
- Desktop screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-desktop-viewport.jpg`.
- Focused table screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-table-final.jpg`.
- Tablet screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-tablet-stage.jpg`.
- Mobile screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-mobile-final.jpg`.
- Modal screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-modal.jpg`.
- Combined comparison: `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-dashboard-style-comparison.jpg`.
- Source pixels: 646 × 794.
- Implementation pixels: desktop 1265 × 712; tablet and mobile stages 1280 × 720.
- CSS viewports: desktop 1280 × 720, tablet frame 768 × 680, mobile frame 390 × 680.
- Density normalization: `devicePixelRatio = 1`; porównanie zestawia pełny wzorzec z nieskalowanym, browser-rendered regionem wdrożenia.
- State: wypełnione metryki i filtry, dwie kategorie problemów, reprezentatywne wiersze tabeli oraz otwarty modal kategorii.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Fonts and typography: Manrope, ciemnogranatowe nagłówki, wagi 650–860 i mniejsze teksty pomocnicze odpowiadają hierarchii „Pulpitu”; nie ma obciętych nagłówków tabeli.
- Spacing and layout rhythm: powierzchnia 20 px, karty 15–17 px, odstępy 12–16 px i lekkie cienie tworzą ten sam spokojny rytm co wzorzec.
- Colors and visual tokens: wdrożenie używa `#19243d`, `#253149`, `#68758e`, `#dfe5ef`, `#edf0f5` i `#5b52eb`; semantyczna czerwień, zieleń i bursztyn pozostały stonowane.
- Image and icon fidelity: widok nie wymaga nowych rasterów; wszystkie ikony pochodzą z używanej już biblioteki Phosphor i mają spójne rozmiary 14–16 px oraz okrągłe, lekkie tła.
- Copy and content: zachowano terminologię modułu, dodając jedynie czytelny nagłówek i opis filtrów oraz dostępne etykiety paginacji.
- Responsiveness: tablet przechodzi na metryki 2 × 2 i trzy pola filtrów w rzędzie; przy 390 px metryki pozostają 2 × 2, akcje są jednokolumnowe, a poziome przewijanie jest ograniczone do tabeli.

## Full-view and focused comparison evidence

- Wspólne porównanie potwierdza tę samą białą powierzchnię, cienkie obramowania, promienie, gęstość, akcent fioletowy i semantyczne kolory co na „Pulpicie”.
- Focused table check potwierdza kompletne nagłówki `Pracownik`–`Akcje`, płaskie wiersze z separatorami, czytelne znaczniki czasu i zintegrowaną paginację.
- Focused modal check potwierdza ten sam język kart: biała powierzchnia, delikatna ramka, mała ikonografia, przyciski obrysowane i czytelne liczniki.

## Interaction and technical QA

- Rozwinięcie filtra strefy pokazało listę i prawidłowy stan `aria-expanded`.
- Kliknięcie kafelka problemu otworzyło właściwy dialog; X zamknął go i przywrócił `aria-hidden="true"`. Kontrakt Escape, tła i powrotu fokusu pozostaje pokryty testem modułu.
- Mobile modal ma 374 px szerokości w widoku 390 px i zachowuje 8 px marginesu.
- Desktop page overflow X: 0 px.
- Mobile page overflow X: 0 px; tabela: 331 px viewport / 1142 px przewijalnej treści.
- Browser console: 0 błędów; wyłącznie komunikaty debug połączenia Vite.
- Targeted Events tests: 10/10 passed.
- Targeted ESLint: passed.
- Production portal build: passed.
- Pełne `npm test`: jedna istniejąca, niezwiązana porażka `Cleanzi-admin/test/portability-contract.test.js` dotycząca obecnego identyfikatora projektu; testy „Zdarzeń” przeszły.

## Comparison history

- Pierwsza kontrola tabeli: P2 — suma szerokości kolumn przekraczała kartę, przez co przyklejona kolumna akcji zasłaniała część nagłówka `Edytował`.
- Fix: dopasowano lokalny kontrakt szerokości kolumn do 1142 px i usunięto wtórne ramki z komórek klienta, strefy i lokalizacji.
- Kontrola po poprawce: wszystkie nagłówki mieszczą się, `scrollWidth` i `clientWidth` tabeli na desktopie wynoszą 1181 px, a wiersze są płaskie i czytelne.
- Pierwsza kontrola mobile: P2 — breakpoint 420 px składał cztery metryki w jedną kolumnę również na typowym telefonie 390 px.
- Fix: układ 2 × 2 pozostaje do 341 px, a jedna kolumna włącza się dopiero poniżej 340 px.
- Kontrola po poprawce: przy 390 px siatka ma dwie kolumny po 162,5 px, strona nie ma poziomego overflow, a filtry pozostają jednokolumnowe.

final result: passed

---

# Design QA — kompaktowy panel problemów w „Zdarzeniach”

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-5161fcb3-c791-4d79-b85e-6e3035ef0544.png`.
- Source pixels: 1308 × 707.
- Implementation URL: `http://localhost:5173/qa-events-integrity.html` — odizolowany stan QA korzystający z produkcyjnego szablonu i arkuszy stylów modułu „Zdarzenia”.
- Desktop implementation:
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-compact-desktop.png`
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-modal-desktop.png`
- Mobile implementation:
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-compact-mobile.png`
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-modal-mobile.png`
- Combined comparison:
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-comparison.png`
  - `C:\Users\dosta\.codex\visualizations\2026\07\29\019faded-51e7-7d82-8029-b49b6261728d\events-integrity-modal-comparison.png`
- Viewports: 1308 × 739 CSS px oraz 390 × 844 CSS px; zrzuty zapisano przy density 1, bez skalowania implementacji.
- State: dwie kategorie z danych referencyjnych (`83` nierozstrzygnięte, `38` historyczne), otwarty modal nierozstrzygniętych oraz zamknięcie okna.

## Findings

- Brak aktywnych rozbieżności P0, P1 lub P2.
- Panel zajmuje jeden kompaktowy blok i od razu odsłania nagłówek oraz pierwszy wiersz tabeli, zamiast renderować wszystkie grupy pracowników na stronie.
- Czerwony i bursztynowy kolor pozostały semantycznymi akcentami; duże, intensywne powierzchnie alarmowe zostały usunięte.
- Modal zachowuje hierarchię problem → podsumowanie → pracownik → akcja, a lista ma własny scroll i stałą stopkę.

## Required fidelity surfaces

- Fonts and typography: istniejący Manrope i dotychczasowe wagi portalu zostały zachowane; tytuły, metadane i liczniki nie nachodzą na siebie.
- Spacing and layout rhythm: desktop mieści dwa kafelki w jednym rzędzie, a mobile układa je pionowo; panel, tabela i modal nie kolidują.
- Colors and visual tokens: zastosowano istniejącą paletę Cleanzi, subtelne neutralne powierzchnie oraz czerwone/bursztynowe akcenty o czytelnym kontraście.
- Image quality and asset fidelity: moduł nie wymaga nowych rasterów; wszystkie ikony pochodzą z używanej już biblioteki Phosphor.
- Copy and content: nazwy czterech kategorii, liczby pracowników/rekordów i opis wpływu problemu są spójne z istniejącą klasyfikacją danych.

## Focused-region and responsive evidence

- Porównanie pełnego regionu potwierdza istotne skrócenie sekcji i zachowanie tabeli nad foldem.
- Porównanie modalne potwierdza, że dotychczasowe informacje o pracowniku, obiekcie/QR oraz liczniku pozostały dostępne po kliknięciu kategorii.
- Przy 390 × 844 modal ma niemal pełną wysokość, przewijaną listę, pełnoszerokie akcje i nie powoduje poziomego overflow.

## Interaction and technical QA

- Kafelki mają semantykę przycisku, `aria-haspopup="dialog"` i jednoznaczne etykiety.
- Modal otwiera właściwą kategorię, zamyka się przez Escape i kliknięcie tła, a fokus wraca do kafelka.
- Przycisk `Pokaż zdarzenia` korzysta z istniejącej dokładnej grupy diagnostycznej; kontrakt powrotu, strony i filtrów jest objęty testem modułu.
- Browser console: 0 błędów w stanie QA.
- Test panelu: 9/9 passed.
- Targeted ESLint modułu: passed.
- Production build portalu: passed.
- Pełny lint pozostaje czerwony przez pięć istniejących, niezwiązanych błędów `no-unused-vars` w `workerService.js` i `portalApp.js`.
- Pełny `npm test` dochodzi do testów panelu, lecz całość pozostaje czerwona przez istniejący test przenośności Cleanzi Admin wykrywający identyfikator aktualnego projektu.

## Comparison history

- Pierwsza próba pełnego portalu: zablokowana na ekranie logowania, bez używania danych logowania lub obchodzenia autoryzacji.
- Kontrola komponentu: produkcyjny szablon i CSS wyrenderowano z reprezentatywnymi danymi ze screena; nie wykryto problemów P0/P1/P2.
- Kontrola mobilna i interakcyjna: modal, scroll, Escape, kliknięcie tła, fokus i konsola przeszły weryfikację.

final result: passed

---

# Design QA — lista stref i edytor zdarzeń

- Source visual truth:
  - `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-4331352e-1218-4bb1-b3e9-434fdd3ebbf3.png` — dotychczasowa lista stref, 465 × 309 px.
  - `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-6d0a3a52-86f6-4fab-95e6-eb132408db6f.png` — docelowy wzorzec listy klienta, 491 × 252 px.
  - `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-e25c4149-6165-4866-9dc3-0062d932b9b1.png` — edytor zdarzenia przed dopracowaniem, 1146 × 879 px.
- Implementation URL: `http://localhost:5174/`
- Implementation screenshot: unavailable — local application requires an authenticated portal session in the in-app browser.
- Viewport: unavailable before authentication.
- CSS size and density normalization: not evaluated because the implementation state could not be opened.
- State reached: portal login screen.

## Full-view comparison evidence

The source visuals were opened at original resolution. The implementation could not be captured in the corresponding Events view because the local in-app browser has no authenticated portal session.

## Focused-region comparison evidence

Focused comparison of the zone dropdown and event editor is blocked by the same authentication requirement.

## Findings

- [P1] Browser verification is blocked by authentication.
  - Location: local portal, Events view.
  - Evidence: the browser reaches the Cleanzi login dialog instead of the Events screen.
  - Impact: typography, spacing, icons, open dropdown state, add mode and edit mode cannot yet be visually approved.
  - Fix: sign in to the local portal in the open in-app browser, then capture and compare the zone dropdown plus add/edit modal states.

## Required fidelity surfaces

- Fonts and typography: implemented with the existing Manrope family; browser comparison pending.
- Spacing and layout rhythm: updated in CSS; browser comparison pending.
- Colors and visual tokens: existing Cleanzi blue, green and red semantic tokens retained; browser comparison pending.
- Image quality and asset fidelity: no raster assets were added; icons use the existing Phosphor icon library.
- Copy and content: existing Polish labels and application behavior retained; zone placeholder now matches the client picker.

## Comparison history

- Initial pass: blocked at the portal login screen. No implementation screenshot was available for a valid same-state comparison.

## Implementation checklist

- Sign in to the local portal.
- Open Events and expand the zone filter.
- Capture the zone and client dropdowns in the same viewport.
- Open both Add event and Edit event states.
- Check focus, hover, keyboard selection and responsive layout.
- Review browser console errors.

final result: blocked

---

# Design QA — kompaktowa karta logowania Cleanzi

- Source visual truth: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\production-before-1280x720.jpg`
- Implementation URL: `http://127.0.0.1:5173/`
- Implementation screenshot: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\local-final-1280x720.jpg`
- Full-view comparison: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\comparison-production-left-local-right.jpg`
- Focused card comparison: `C:\Users\rafal\Desktop\app to react\artifacts\login-card-qa\comparison-card-focus-production-left-local-right.jpg`
- Viewport and state: niezalogowany ekran portalu, 1280 × 720 CSS px.
- Source and implementation pixels: 1280 × 720.
- Density normalization: bez skalowania; lokalny `devicePixelRatio = 1`, a oba obrazy porównawcze mają identyczny rozmiar pikselowy.

## Findings

- Brak aktywnych problemów P0, P1 lub P2.
- Karta komunikatu zmalała z około 520 × 285 px do około 400 × 167 px. Jej powierzchnia jest mniejsza o około 55%, dlatego nadal odsłania brzuch, biodra i nogi postaci, a tekst jest czytelniejszy.
- Zastąpiono ogólny slogan jednoznacznym komunikatem `SYSTEM DO ZARZĄDZANIA PROCESEM SPRZĄTANIA` oraz krótkim opisem planowania, monitoringu realizacji i kontroli jakości.
- Usunięto trzy drugorzędne etykiety, które powiększały kartę bez dodawania kluczowej informacji.

## Required fidelity surfaces

- Fonts and typography: zachowano rodzinę, wagę i hierarchię Cleanzi; mniejszy nagłówek pozostaje czytelny i mieści się w dwóch liniach.
- Spacing and layout rhythm: karta ma mniejsze wymiary, padding, promień i cień; nie powoduje poziomego przepełnienia.
- Colors and visual tokens: zachowano paletę Cleanzi oraz szklaną kartę; obniżona opacity lepiej odsłania fotografię bez utraty kontrastu tekstu.
- Image quality and asset fidelity: fotografia hero, jej proporcje, ostrość i kadrowanie pozostają bez zmian.
- Copy and content: przekaz opisuje produkt wprost jako system do zarządzania procesem sprzątania.

## Responsive evidence

- 900 × 900: karta około 330 × 118 px, brak poziomego przepełnienia.
- 390 × 844: karta około 250 × 67 px, brak poziomego przepełnienia; fotografia zajmuje mniej miejsca, ale twarz i sylwetka pozostają widoczne.

## Interaction and technical QA

- Główne pola email i hasła oraz przycisk `Zaloguj` są pojedyncze, widoczne i aktywne.
- Konsola lokalnego ekranu logowania: 0 błędów.
- ESLint: passed.
- Production build: passed.
- Pełny zestaw testów: 815/815 passed.

## Comparison history

- Pierwszy wariant po zwężeniu: P2 — nagłówek nadal łamał się na trzy linie, więc karta zajmowała zbyt dużą wysokość i częściowo zasłaniała biodro.
- Fix: po korekcie użytkownika dobrano kompromis 400 px szerokości, nagłówek do 38 px i opis 12 px; drugorzędne etykiety pozostają usunięte.
- Kontrola po poprawce: karta ma około 45% pierwotnej powierzchni, nagłówek mieści się w dwóch liniach, sylwetka pozostaje odsłonięta, a przekaz produktu jest jednoznaczny i wygodniejszy do odczytania.

final result: passed

---

# Design QA — premium ekran logowania

- Source visual truth: `C:\Users\rafal\AppData\Local\Temp\codex-clipboard-07baf063-d121-442d-9ff2-55e45f4f09e3.png` oraz wygenerowany asset hero `C:\Users\rafal\.codex\generated_images\019f8611-d2eb-7520-afe2-15652be5b2cf\call_L2yU7OG0REGOqIDdZXAs3E2x.png`.
- Implementation URL: `http://localhost:5174/?jobCardPreview=1`
- State: publiczny ekran logowania, pola gotowe do użycia, brak widocznego błędu.
- Primary viewport: 1536 × 912 CSS px, density 1.
- Source pixels: 1515 × 893; przed porównaniem proporcjonalnie znormalizowane do 768 × 456.
- Implementation screenshot: `C:\Users\rafal\Desktop\app to react\design-qa-login-desktop.png` (1536 × 912 px).
- Mobile screenshot: `C:\Users\rafal\Desktop\app to react\design-qa-login-mobile.png` (390 × 844 px).
- Combined comparison: `C:\Users\rafal\Desktop\app to react\design-qa-login-comparison.png` (1536 × 500 px).

## Findings

- Nie pozostała żadna rozbieżność P0, P1 ani P2.
- Typografia: hierarchia nagłówka, opisu, etykiet i CTA jest czytelna na desktopie i telefonie; zastosowane wagi i interlinie nie powodują obcięć ani niekontrolowanego zawijania.
- Rytm i układ: desktop zachowuje proporcję 58/42 między zdjęciem i formularzem, a mobile składa sekcje pionowo bez poziomego overflow.
- Kolory: granat, błękit i mięta pozostają zgodne z identyfikacją Cleanzi; kontrast pól, CTA i tekstów jest wystarczający.
- Obraz: dedykowany asset WebP ma 1536 × 1024 px i 87 774 B, jest ostry w obu kadrach i nie zawiera napisów ani obcych znaków.
- Copy: ekran komunikuje centrum operacyjne, a nie ogólny formularz; surowy komunikat `Dashboard feature is not initialized.` nie jest już pokazywany użytkownikowi.
- P3: na bardzo szerokich monitorach można w przyszłości delikatnie zwiększyć maksymalną szerokość panelu narracyjnego, ale nie jest to potrzebne do akceptacji.

## Full-view comparison evidence

- Porównanie `PRZED / PO` potwierdza zastąpienie małej ilustracji pełnowartościowym zdjęciem, poprawę hierarchii marki, usunięcie agresywnego półpanelu w jednolitym błękicie i uspokojenie formularza.
- Wersja mobilna mieści zdjęcie, komunikat i cały formularz w 390 × 844 px bez przewijania poziomego.
- Focused region comparison nie był potrzebny: formularz i tekst hero pozostają czytelne w pełnym widoku przy natywnej gęstości 1.

## Interaction and technical QA

- Pola email i hasła oraz przycisk `Zaloguj` przechodzą ze stanu sprawdzania sesji do aktywnego stanu.
- Dedykowany świeży start karty nie wygenerował błędów w konsoli.
- Obraz hero jest załadowany przed zakończeniem kontroli ekranu.
- Targeted ESLint: passed.
- Production build: passed.
- Desktop overflow X: 0 px.
- Mobile overflow X: 0 px.

## Comparison history

- Pierwsza kontrola mobilna: P2 — siatka centrowała dwie sekcje i zostawiała pusty pasek nad zdjęciem.
- Fix: dodano jawne wiersze siatki i `align-content: start` dla szerokości poniżej 920 px.
- Kontrola po poprawce: zdjęcie zaczyna się od górnej krawędzi, formularz pozostaje w całości dostępny, overflow X wynosi 0.

final result: passed

---

# Design QA — Cleanzi cleaning-company login

## Reference and implementation

- Selected direction: option 1, “Spokojna precyzja”.
- Source visual: `C:\Users\rafal\.codex\generated_images\01a02950-61b9-7e22-b381-efc6e1d1030d\exec-2a3d7509-beac-4545-b215-509e9cf34d3b.png`.
- Final implementation capture: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-desktop-final-verified-20260823.png`.
- Source size: 1488 × 1058, normalized for comparison to 1440 × 1024.
- Implementation viewport: 1440 × 1024 CSS px, device scale factor 1.
- Tested state: default login, no focus, no autofill, no validation error. Public registration was enabled only by a read-only local legal-document fixture.

## Comparison evidence

- Full view: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-comparison-full-final-20260823.png`.
- Focused form: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-comparison-form-final-20260823.png`.
- Focused hero caption: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-comparison-caption-final-20260823.png`.
- Mobile: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-mobile-final-verified-390x844-20260823.png`.
- Laptop: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-laptop-final-verified-1280x720-20260823.png`.
- Tablet: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-option1-tablet-final-verified-768x1024-20260823.png`.

## Interaction and responsive verification

- Password reveal toggles `password` ↔ `text`, updates the eye icon, `aria-pressed`, and the accessible label.
- “Załóż firmę” opens the existing company-registration choices; Google and e-mail paths remain available; “Mam już konto” returns to login.
- No real authentication or external registration submission was made during visual QA.
- At 390 × 844 the page has no horizontal or vertical overflow in the default state (`390 × 844` document size).
- At 1280 × 720 the page has no horizontal or vertical overflow in the default state (`1280 × 720` document size).
- At 768 px the 480 px form card is centered within the available content width.
- Browser inspection showed no application error in the verified default state.

## Iteration log

1. Pass 1 found P2 drift in card width, vertical rhythm, caption wrapping, and typography. Mobile also had P1 clipping and a P2 stacked registration row. The layout, spacing, type scale, and mobile breakpoints were corrected.
2. Passes 2–4 refined the split ratio, hero crop, logo scale, field geometry, divider, security note, and caption position against the reference.
3. Final code review found a P0 cascade issue: `display: grid !important` on the login screen would have overridden the authenticated portal transition. It was removed and protected with a regression assertion.
4. Final responsive review found a P2 tablet alignment issue at 621–920 px. The form panel is now centered in that range.
5. Final review reports no remaining P0, P1, or P2 defects.

## Accepted residual differences

- The generated reference re-rendered the Cleanzi logo and photo content. The implementation intentionally uses the canonical production SVG logo and the existing optimized production photo instead of rasterizing generated brand or photographic details.
- Minor font rasterization and anti-aliasing differences are platform-dependent.

Result: passed

---

# Design QA — compact 80% login composition

## Source and state

- Source visual truth: `C:\Users\rafal\.codex\generated_images\01a02950-61b9-7e22-b381-efc6e1d1030d\exec-2a3d7509-beac-4545-b215-509e9cf34d3b.png`.
- Product constraint added after the selected visual: retain the option 1 composition while reducing its real layout dimensions to about 80% and reserving space for subsequent messages.
- Browser-rendered implementation: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-desktop-1440x1024-20260823.png`.
- Source pixels: 1488 × 1058, normalized to 1440 × 1024.
- Implementation pixels and CSS viewport: 1440 × 1024 at density 1.
- State: public cleaning-company login, no autofill and no focus. Error and registration states were verified separately.

## Comparison evidence

- Full view: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-comparison-1440x1024-20260823.png`.
- Focused form: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-comparison-form-focus-20260823.png`.
- Laptop with login message: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-laptop-error-1280x720-20260823.png`.
- Mobile default: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-mobile-390x844-20260823.png`.
- Small mobile with login message: `C:\Users\rafal\.codex\visualizations\2026\08\22\01a02950-61b9-7e22-b381-efc6e1d1030d\cleanzi-login-compact80-mobile-error-viewport-320x568-20260823.png`.

## Findings

- No actionable P0, P1, or P2 issue remains.
- Typography and spacing: the form card is 384 px instead of 480 px; the title, logo, fields, CTA, dividers, caption, margins, and padding follow the requested compact scale without `transform: scale()` or CSS `zoom`.
- Responsive layout: mobile inputs retain a 16 px font and interactive controls remain at least 44 px high. The short-screen branch removes only the photographic hero, preserving all login information and controls.
- Colors and assets: the option 1 palette, canonical Cleanzi SVG, canonical optimized hero photo, borders, focus treatment, and Phosphor icons are unchanged.
- Copy and content: login, company-registration, confirmation, reset, organization, and MFA panels retain their existing content and IDs. Longer organization and MFA collections are bounded inside their own panel on very short phones so they cannot expand the page.
- Browser console: no errors or warnings in the verified states.
- Residual test gap: organization selection and authenticated MFA require dedicated test-session fixtures, so their visual content was source-reviewed and constrained but not opened through a real authenticated browser session. This does not affect the tested public login and registration path.

## Responsive and interaction evidence

- 1280 × 720: default form 503 px high; form with login error 559 px high; page height remains 720 px.
- 768 × 1024: form with login error ends at 916 px; page height remains 1024 px.
- 768 × 900: form with login error ends at 787 px; page height remains 900 px.
- 390 × 844: default form 460 px high; form with error 508 px high; registration 454 px high; email registration with error 499 px high; page height remains 844 px.
- 390 × 667: form with error ends at 528 px; page height remains 667 px.
- 360 × 640: form with error ends at 540 px; page height remains 640 px.
- 320 × 568: form with error ends at 438 px; page height remains 568 px.
- Every height check used `max(document.documentElement.scrollHeight, document.body.scrollHeight)` and verified that the full form stayed within the viewport.
- Tested browser interactions: empty login displays its validation message; company registration opens; e-mail registration opens; empty e-mail registration displays its validation message; no external authentication or registration submission was made.

## Comparison history

1. Baseline P0: login errors caused 53 px of page scroll at 1280 × 720 and 89 px at 390 × 844. Small phones already scrolled without an error.
2. Fix: all physical dimensions were reduced around the requested 80% ratio. Mobile hero, spacing, and short-height branches were compacted further while retaining 44 px touch targets and 16 px input text.
3. Baseline P0: arbitrary organization or MFA content could grow the whole page. Fix: their short-phone content regions now have bounded internal height and overscroll containment.
4. Post-fix browser evidence: login and registration messages fit without page scroll at every recorded viewport, including 320 × 568.

## Technical QA

- Focused onboarding tests: 7/7 passed.
- ESLint: passed.
- Production build: passed.
- `git diff --check`: passed apart from expected Windows line-ending notices.

final result: passed

---

# Design QA — lista pracowników: wyrównanie skali rekordów (2026-08-24)

## Źródło i stan

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-08765d69-939b-4f2f-af20-4e7c2d25be3c.png`.
- Implementation URL: `http://localhost:5174/`.
- Browser-rendered full view: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-list-type-scale-final.png`.
- Focused implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-list-type-scale-focused.png`.
- Focused side-by-side comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-list-type-scale-comparison.png`.
- Browser viewport: 1920 × 911 CSS px at density 1.
- Pixel dimensions: source 1565 × 112; focused implementation 1540 × 112; full implementation 1920 × 911. No density normalization was required.
- State: authenticated portal, `Lista pracowników`, first 50 worker records loaded, action menus closed.

## Full-view and focused evidence

- The full view confirms the reduced height and icon scale of both quick-action buttons without changing the surrounding filter or table layout.
- The focused comparison places the supplied row beside the rendered first row. Both show 34 × 34 px user and role/type visual containers and consistent 12.5 px record typography.
- Browser measurements: username 12.5 px; type/role text 12.5 px; status 12.5 px; online 12.5 px; avatar 34 × 34 px; type/role icon container 34 × 34 px.
- Quick actions measure 42 px high with 11.5 px labels and 17 px icons, reduced from 50 px, 13 px, and 20 px.

## Required fidelity surfaces

- Fonts and typography: existing Manrope family, weights, and wrapping retained; requested record labels now share the username size.
- Spacing and layout: column tracks, row height, alignment, and responsive containment remain unchanged; only the requested component sizing changed.
- Colors and tokens: existing dashboard colors, status tones, borders, and indigo quick-action treatment are unchanged.
- Image quality and assets: existing worker avatar and Phosphor icons are retained; no new visual asset was introduced.
- Copy and content: all labels, worker data, and actions remain unchanged.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- The implementation matches the supplied table-row proportions while maintaining the existing portal layout.
- No visible runtime error appeared in the verified state.

## Comparison history

1. Initial focused comparison found no P0, P1, or P2 issue after the requested size adjustments.
2. No additional correction iteration was required.

## Technical QA

- Full test suite: 646/646 passed.
- Focused UI tests: 4/4 passed.
- ESLint: passed.
- Production build: passed; only the existing bundle-size advisory was emitted.
- `git diff --check`: passed for the changed worker UI files.

final result: passed

## Worker account tables and role layout QA — 2026-08-24

### Reference and verification state

- Source: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-3e556146-9dec-4c85-9a05-30e7f2a5319e.png` (1265 × 422).
- Implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-roles-equal-1920-final.png` (1920 × 911).
- Focused side-by-side comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-roles-comparison.png` (2530 × 466).
- Verified in the authenticated Best Clean worker account for Agata Zalewska at 1920, 1440, and 1024 px viewport widths.

### Fidelity surfaces

- Typography: Manrope remains consistent across account fields, training summary, shared table cells, badges, and helper text.
- Spacing and layout: the two role cards now use equal grid tracks and matching stretched heights; account fields align to the shared form grid; tables remain contained by their module and scroll internally where required.
- Colors and tokens: existing navy text, violet accent, pale status colors, white cards, borders, and subtle shadows are retained.
- Assets: worker rows reuse the same dashboard avatar asset selection, with a profile photo taking precedence where available.
- Content: full login text wraps without truncation; the three tables expose the requested common and tab-specific columns.

### Interaction and responsive QA

- Role cards measured equal at 1440 px (363 × 221 each) and 1920 px (580 × 207 each).
- The complete login `zalewska.agata@bestclean.pl` remains visible and wraps at 1024 px.
- Activity contains five rendered rows and no edit controls.
- Time contains five rendered rows and five working History buttons; the first dialog opened as `Start i stop - 19.08.2026` and closed correctly.
- Orders, Activity, and Time use the same worker/date/client row treatment and remain free of module-level horizontal overflow at 1440 and 1024 px.
- Browser console inspection after tab changes and the History-dialog interaction returned no errors or warnings.

### Comparison history

1. The original role layout used unequal column widths. Equal `minmax(0, 1fr)` tracks and stretched child cards corrected the mismatch.
2. The first shared-table pass produced 44 px of module-level overflow at 1440 px. Constraining the outer table card and retaining horizontal scrolling inside the table reduced module overflow to 0 px.
3. The first Time client cell combined the friendly client name with a raw identifier. Filtering redundant identifiers left the readable client label only.

### Technical QA

- Full test suite: 651/651 passed.
- Focused worker-account and reconciliation tests: 48/48 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check`: passed.
- Conflict-marker scan: passed.

final result: passed

---

# Design QA - worker Activity and Time table scaling (2026-08-24)

## Reference and verification state

- Source Activity: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-2b77ec9d-c9c1-46db-b771-8a6da91d716c.png` (1271 x 575).
- Source Time: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-00d24def-6d8a-42f2-b134-81fab0cda7ce.png` (1238 x 511).
- Implementation Activity: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-scaling-1440-v2.png` (1440 x 900).
- Implementation Time: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-scaling-1440.png` (1440 x 900).
- Side-by-side review board: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-scaling-comparison.png`.
- Verified in the authenticated Best Clean worker account for Agata Zalewska at 1920, 1440, and 1271 px widths.

## Fidelity surfaces

- Typography: record text now renders at 12.5 px (13 px computed in the browser), table headers at 10.5 px (11 px computed), and time/status pills at 12 px. The stronger weight and line height match the rest of the worker-account UI.
- Layout: column tracks were rebalanced around the information density of each tab. Activity uses a 1080 px internal table width; Time uses 1060 px. Both fit without module overflow at 1920 px and retain intentional horizontal table scrolling in narrower content areas.
- Alignment: Start, Stop, Time, History, Break, and Comment cells are centered consistently while descriptive fields remain left aligned.
- Assets: worker avatars remain the same dashboard-derived assets and now render at 36 x 36 px.
- Content: the secondary login line was removed from every shared worker cell. Only the worker display name remains visible.

## Interaction and responsive QA

- Activity rendered five rows with the expected columns and no secondary login labels.
- Time rendered five rows with the expected columns and no secondary login labels.
- At 1920 px the Activity table measured 1186/1186 px client/scroll width and the Time table 1156/1156 px, with zero panel overflow.
- At 1271 px the table remains contained and uses its own horizontal scroll instead of overflowing the page.
- Browser console contained only Vite connection/HMR and React DevTools informational messages; no runtime error or warning was present.

## Comparison history

1. The supplied views used a visually small type scale and a secondary login line that competed with the worker name.
2. The worker cell was simplified to avatar plus display name, with a larger avatar and stronger single-line hierarchy.
3. The Activity and Time grids were rebalanced and their minimum widths reduced from 1240/1120 px to 1080/1060 px, improving legibility and alignment without changing row actions or data.

## Technical QA

- Focused worker-account and reconciliation tests: 42/42 passed.
- Full test suite: 651/651 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check`: passed with expected Windows line-ending notices.
- Conflict-marker scan: passed.

final result: passed

---

# Design QA - Time table client removal and history summary (2026-08-24)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-7a0133e6-7b8a-432f-8c71-b47ce33e5bee.png` (874 x 606 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-history-single-total-1440.png` (1440 x 900 px).
- Time-table implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-no-client-1440.png` (1440 x 900 px).
- Focused side-by-side comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-history-comparison.png` (1832 x 742 px).
- CSS viewport: 1440 x 900 px at device scale factor 1. The implementation screenshot was cropped to the 829 x 507 px modal region and centered next to the source without density resampling.
- State: authenticated Best Clean worker account for Agata Zalewska, Time tab, first available History dialog open. The dates and number of CLEAN activities differ because the comparison uses live local data; the component state and interaction are equivalent.

## Full-view and focused evidence

- Full-view table evidence confirms that the Time table now contains User, Date, Start, Stop, Time, History, Break, and Edited columns, with no Client column. The table scroll remains internal at 1440 px and the page itself has no horizontal overflow.
- The focused board compares the supplied modal directly with the rendered modal. Both retain the same Start/CLEAN/Stop hierarchy, semantic color chips, location controls, rounded cards, and primary Done action.
- The implementation intentionally removes the duplicated right-side duration and keeps one centered combined duration. This directly implements the requested correction rather than reproducing the source defect.

## Required fidelity surfaces

- Fonts and typography: Manrope hierarchy, compact metadata, bold event labels, and tabular duration treatment remain consistent with the worker-account design system. No clipping or unintended wrapping is visible.
- Spacing and layout rhythm: modal header, cards, activity rows, total bar, and footer action have aligned gaps and consistent radii. The total bar uses a stable three-column grid so the single duration remains optically centered.
- Colors and visual tokens: navy text, pale blue surfaces, green START, red STOP, blue total, subtle borders, and violet primary action match the existing portal tokens and supplied reference.
- Image quality and asset fidelity: no raster imagery is required in the modal; all visible controls use the existing Phosphor icon system and remain sharp at device scale factor 1.
- Copy and content: labels remain in Polish and preserve existing dynamic data. Only the redundant Client table column and duplicate technical duration display were removed.
- Responsiveness and accessibility: no page-level overflow at 1440 px; the technical provisional duration is explicitly hidden even when shared span styling is applied. Dialog labeling, close control, focusable actions, and keyboard-oriented modal structure remain intact.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The source shows the combined duration twice; the implementation deliberately shows it once, centered, as requested.

## Primary interactions and runtime checks

- Opened the Time tab and confirmed five rendered day rows.
- Opened and closed a History dialog, then reopened it for final delivery state.
- Confirmed the provisional summary node computes to `display: none` and only the label plus one duration are visible.
- Browser console contains only Vite connection/HMR messages and React DevTools information; no runtime errors or warnings were found.

## Comparison history

1. Initial inspection identified that shared `.wa-time-codes-total > span` styling overrode the HTML `hidden` attribute, exposing the technical provisional value as a duplicate total.
2. Added an explicit hidden-child rule, rebalanced the summary bar, refined modal spacing and borders, and removed the Client table track and renderer.
3. Post-fix comparison shows a single centered total, retained action hierarchy, and no actionable visual or responsive mismatch.

## Technical QA

- Full test suite: 651/651 passed.
- Focused worker-account and reconciliation tests: 42/42 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check`: passed with expected Windows line-ending notices.
- Conflict-marker scan: passed.

## Implementation checklist

- [x] Remove Client from the Time table header, rows, empty-state colspan, and grid tracks.
- [x] Keep one centered combined duration in the History dialog.
- [x] Preserve data loading, History actions, GPS controls, editing flows, and reconciliation logic.
- [x] Verify the authenticated browser state, console, tests, lint, build, diff, and conflict markers.

final result: passed

---

# Design QA - Time table edge-to-edge spacing (2026-08-24)

## Reference and verification state

- Source table: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-c20f1197-8744-4be5-956d-d852ba94bf41.png` (1222 x 419 px).
- Source annotation: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-22162ccf-c921-410d-bb2e-be68bc1388ed.png` (573 x 404 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-edge-to-edge-1920.jpg` (1905 x 848 px).
- Side-by-side comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-time-edge-comparison.png` (2516 x 573 px).
- CSS viewport: 1920 x 855 px at device scale factor 1. The implementation comparison uses a 1220 x 475 px crop around the same Time-table state.
- State: authenticated Best Clean worker account for Agata Zalewska, Time tab, five August rows including the missing-Stop state.

## Full-view and focused evidence

- Before the fix, the table card reserved a 16 px inner padding and the global operational-table rule reserved scrollbar gutters on both sides. Together they produced the visible white vertical strips highlighted in the annotation.
- After the fix, the outer card retains its one-pixel border while the table, header, first row, and last row all measure exactly 1210 px from x=645 to x=1855.
- The table has no nested border or radius, uses `scrollbar-gutter: auto`, and clips only vertical overflow. The outer card remains responsible for the visible rounded corners.
- The pagination keeps its own 16 px horizontal inset, so removing the table gutter does not crowd the footer controls.

## Required fidelity surfaces

- Fonts and typography: unchanged Manrope hierarchy, weights, and table alignment.
- Spacing and layout rhythm: the unintended nested 16 px padding and 11 px scrollbar gutters are removed; header and rows now extend continuously to both card edges.
- Colors and visual tokens: existing white card, pale header, alternating rows, yellow missing-Stop state, borders, and semantic time pills are unchanged.
- Image quality and asset fidelity: the existing worker avatar and Phosphor icons are preserved without scaling changes.
- Copy and content: no labels, values, dates, statuses, or actions changed.
- Responsiveness and accessibility: horizontal table scrolling remains available when required; the change does not alter focus, controls, DOM order, or row semantics.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains.
- The browser console still records an existing Leaflet `offsetWidth` error from the unrelated map component. No Time-table code path or interaction generated an additional table-specific error.

## Comparison history

1. Initial capture confirmed that removing only the parent padding was insufficient because the global `scrollbar-gutter: stable both-edges` rule continued reserving strips inside the table.
2. The table override now removes the nested border and radius, disables vertical overflow, and restores `scrollbar-gutter: auto`.
3. Post-fix measurement and side-by-side evidence confirm that the header and every row use the full 1210 px inner card width.

## Technical QA

- Full test suite: 651/651 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- Browser measurement: card padding 0 px; table border 0 px; table radius 0 px; header/rows/table width 1210 px.
- `git diff --check`: checked after implementation.

## Implementation checklist

- [x] Remove the Time-card inner padding.
- [x] Remove the nested table border and radius.
- [x] Remove stable scrollbar gutters and the resulting side strips.
- [x] Preserve pagination spacing and horizontal scrolling.
- [x] Verify the authenticated browser state, side-by-side comparison, tests, lint, and build.

final result: passed

---

# Design QA - Removal of Activity KPI cards (2026-08-24)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-fe9ab121-d1c7-407e-ba5d-df4aeef4adf0.png` (1260 x 156 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-kpis-removed-1920.png` (1440 x 900 px).
- Focused before/after comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-activity-kpis-removal-comparison.png` (1260 x 870 px).
- Browser viewport: 1440 x 900 CSS px at device scale factor 1.
- State: authenticated Best Clean account, Agnieszka Orzoł profile, Activity tab with five loaded rows.

## Evidence and findings

- The four selected KPI cards are absent and the Activity panel begins directly with the `Ostatnie zdarzenia` table card.
- Browser DOM verification found zero `.worker-account-kpi-grid` elements and none of the four retired element identifiers.
- The first Activity-panel element is the existing table card and its offset from the panel top is 0 px, so no blank spacer remains.
- The table, tabs, sidebar employee summary, typography, colors, avatars, and copy are unchanged. No image or icon asset was added or replaced.
- No actionable P0, P1, P2, or P3 mismatch remains for the requested deletion scope.
- A focused comparison is sufficient because the source contains only the four components selected for deletion; the full implementation screenshot verifies the surrounding worker-account layout is preserved.

## Removed implementation logic

- Removed the four Activity KPI nodes and their dedicated CSS rules.
- Removed the four DOM updates, the Activity-only `eventCount` input, and the now-unused monthly event-count reducer.
- Retained the independent sidebar KPI calculations and all Activity table loading, filtering, pagination, and rendering behavior.

## Technical QA

- Full test suite: 652/652 passed.
- Focused worker-account UI tests: 6/6 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- Final tab-switch verification: 0 new browser log entries and 0 new errors.

## Implementation checklist

- [x] Remove only the four selected Activity KPI cards.
- [x] Remove their dedicated calculations, DOM updates, and styles.
- [x] Preserve the Activity table and every other worker-account surface.
- [x] Verify the authenticated rendered state, tests, lint, and build.

final result: passed

---

# Design QA - Stacked basic information values (2026-08-25)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-bf488aa6-cce7-4698-8659-c6f60e2403d4.png` (360 x 291 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-basic-info-stacked-1920.png` (1905 x 848 px).
- Focused before/after comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-basic-info-stacked-comparison.png` (1560 x 650 px).
- Browser viewports: 1920 x 855 and 1024 x 768 CSS px.
- State: authenticated Best Clean account, Agata Zalewska profile, Account tab, complete `Informacje podstawowe` card.

## Evidence and findings

- Every metadata record now uses one shared two-row structure: icon with label first and the value directly below.
- `zalewska.agata@bestclean.pl` renders at its full length in one line; browser measurement reports a 13.5 px element height against a 13.5 px line height.
- All five values are positioned below their labels and share the full 274 px content width of the 310 px card.
- The same card remains fully visible at 1024 px, where it keeps its 310 px width and the login remains unwrapped.
- No actionable P0, P1, P2, or P3 mismatch remains. The tested profile flow produced zero browser console errors.

## Required fidelity surfaces

- Typography: existing Manrope sizes, weights, and navy/muted hierarchy are preserved; values keep their current emphasis.
- Spacing: the former two-column metadata rows become a consistent one-column rhythm with a 5 px label-to-value gap and aligned value inset.
- Colors and tokens: existing card background, divider, border, shadow, and icon colors are unchanged.
- Image and icon fidelity: existing Phosphor icons are reused; no image asset changes were needed.
- Copy and content: identifiers, login, phone, created date, and edited date are unchanged; only their layout changed.

## Technical QA

- Full test suite: 653/653 passed.
- Focused worker-account UI tests: 7/7 passed.
- ESLint: passed; only the existing Babel large-file optimization note was emitted.
- Production build: passed; only the existing chunk-size advisory was emitted.
- `git diff --check`: passed for the changed stylesheet and UI contract.

## Implementation checklist

- [x] Place every metadata value below its icon-and-label row.
- [x] Keep the complete login on one line.
- [x] Apply the layout consistently to all five records.
- [x] Preserve data bindings, icons, colors, and card behavior.
- [x] Verify desktop and 1024 px rendering, comparison evidence, tests, lint, and build.

final result: passed

---

# Design QA - Enlarged worker-list back button (2026-08-25)

## Reference and verification state

- Source visual truth: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-back-button-before.png` (1920 x 911 px).
- Browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-back-button-after.png` (1920 x 911 px).
- Focused comparison: `C:\Users\dosta\cleanzi-version-4.0\.codex-tmp\design-qa\worker-account-back-button-comparison.png`.
- Browser viewports: 1920 x 911 and 1024 x 820 CSS px at device scale factor 1.
- State: authenticated Best Clean account, Agata Zalewska profile, Account tab.

## Findings and fidelity surfaces

- No actionable P0, P1, or P2 mismatch remains. The back control is visibly larger without shifting the worker dashboard cards.
- Typography: Manrope and the existing violet emphasis are preserved; the label increases from 11 px to 14 px.
- Spacing and layout: the hit target increases from 16 px to 40 px high, with 10 px horizontal padding and alignment preserved by the matching negative inline offset.
- Colors and tokens: the existing violet tokens remain unchanged; hover and keyboard focus use the existing soft-violet surface.
- Image and icon fidelity: the existing Phosphor arrow is preserved and increases from 16 px to 20 px; no image asset changes were needed.
- Copy and content: `Lista Pracowników` and its navigation target are unchanged.
- The control remains fully visible at 1024 px, the return interaction was exercised successfully, and the authenticated flow produced zero console errors.

## Technical QA

- Full test suite: 654/654 passed.
- Focused worker-account UI tests: 8/8 passed.
- ESLint and production build: passed; only the existing Babel optimization note and chunk-size advisory were emitted.
- `git diff --check` and conflict-marker scan: passed for the changed stylesheet and UI contract.

## Implementation checklist

- [x] Enlarge the label, arrow, and clickable target.
- [x] Preserve the existing route and visual language.
- [x] Verify desktop, 1024 px, keyboard focus, click behavior, tests, lint, and build.

final result: passed
