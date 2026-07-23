# Design QA — listy w filtrach zdarzeń

## Materiał porównawczy

- Source visual truth: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-3ff203dd-9f64-4dcc-b896-4ed4079e0c7a.png`
- Implementation screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\22\019f88a6-80e7-7e01-8c45-464fb8135d5b\events-filter-selects-desktop.png`
- Responsive screenshot: `C:\Users\dosta\.codex\visualizations\2026\07\22\019f88a6-80e7-7e01-8c45-464fb8135d5b\events-filter-selects-mobile.png`
- Full-view comparison: `C:\Users\dosta\.codex\visualizations\2026\07\22\019f88a6-80e7-7e01-8c45-464fb8135d5b\events-filter-selects-comparison.png`
- Source pixels: 1577 × 434.
- Implementation pixels: 1280 × 720, CSS viewport 1280 × 720, DPR 1.
- Responsive implementation: CSS viewport 640 × 900, DPR 1.
- Normalization: source retained at native density; implementation retained at DPR 1 and placed in the same comparison canvas. The in-app browser width limit of 1280 px is labelled in the comparison.
- State: light theme, filter placeholders visible, lists populated with realistic workers, zones and clients.

## Findings

- No actionable P0/P1/P2 differences remain.
- Typography: placeholder text is light and selected values switch to the existing dark navy token and stronger weight.
- Spacing and layout rhythm: list fields retain the same 41 px height, 10 px radius, alignment and grid density as the reference.
- Colors and tokens: borders, placeholder text, selected text and focus behavior use the existing Cleanzi filter tokens.
- Image and asset fidelity: the control uses the browser-native select chevron; no raster or custom-drawn asset is required.
- Copy and content: the empty selections preserve the source examples “np. Marta”, “np. Biuro” and “np. PSP Racibórz”.
- Accessibility and affordances: each select keeps a visible label, keyboard navigation and a clear dropdown indicator.
- Responsive behavior: at 640 px each list expands to the full filter-column width without horizontal overflow.

## Primary interactions tested

- Worker list renders three realistic options.
- Selecting “Agnieszka Ostrowska” updates the value and selected-state color.
- Browser console errors and warnings checked: none.
- Desktop and responsive layouts rendered successfully.

## Focused comparison

No separate focused crop was needed because the combined comparison keeps the three changed select controls and their chevrons legible at native density.

## Comparison history

- Pass 1: the three list controls matched the source’s closed-field appearance; no actionable P0/P1/P2 mismatch was found.
- Post-check evidence: desktop capture, responsive capture, selected worker state and empty console log.

## Implementation checklist

- [x] Replace datalist suggestions with real select controls.
- [x] Populate workers, zones and clients from reference data.
- [x] Preserve stored filter values and worker login mapping.
- [x] Match placeholder and selected-value styling.
- [x] Verify desktop, responsive and keyboard-native behavior.

final result: passed
