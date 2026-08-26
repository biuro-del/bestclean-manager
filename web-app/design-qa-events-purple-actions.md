# Design QA — fioletowe akcje w Zdarzeniach

## Evidence

- Source visual truth — unresolved action: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\events-purple-actions-source-unresolved.png` (366 × 123 px).
- Source visual truth — historical action: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\events-purple-actions-source-history.png` (328 × 157 px).
- Source visual truth — add action: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\events-purple-actions-source-add.png` (387 × 91 px).
- Existing component reference: the production `Pobierz` trigger rendered from the Events feature stylesheet.
- Combined source and implementation comparison: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\events-purple-actions-comparison.png` (1265 × 712 px).
- Browser viewport: 1280 × 720 CSS px; device pixel ratio 1.
- Density normalization: none; source images and implementation were displayed at native density inside one comparison view.
- State: unresolved entry, historical entry and Add event footer with enabled primary action.

## Full-view comparison evidence

The combined browser capture places all three reported source regions beside their final production selectors and keeps the `Pobierz` trigger visible as the component reference. Both purple actions now use the same flat 10 px radius, shadow-free treatment, compact padding and regular Phosphor icon rhythm while preserving the requested purple fill.

## Focused region comparison evidence

A focused comparison was required because the task concerns small UI labels. The final browser measurements are:

- `Pokaż zdarzenia`: 40 px height, 12 px text, weight 700, 10 px radius, no shadow.
- `Dodaj zdarzenie`: 44 px height, 12.5 px text, weight 700, 10 px radius, no shadow.
- `Pobierz` reference: 40 px height, 11 px text, 10 px radius, no shadow.
- Both updated buttons preserve a white foreground on `#5b52eb` and expose a 3 px focus outline with a 2 px offset.

## Findings

- No remaining P0, P1 or P2 findings in the requested scope.
- Fonts and typography: passed. Text is larger and uses a calmer 700 weight with normal letter spacing and no text shadow.
- Spacing and layout rhythm: passed. Padding follows the compact `Pobierz` rhythm; the primary Add action remains slightly larger to preserve hierarchy.
- Colors and visual tokens: passed. The requested purple background and white foreground are retained; hover uses the existing darker purple token.
- Image quality and asset fidelity: passed. No raster replacement was needed; production Phosphor icons are used.
- Copy and content: passed. Button labels are unchanged.
- Accessibility: passed. Focus treatment remains visible and both controls meet the existing minimum action height.

## Comparison history

1. The first rendered comparison found a P2 specificity issue: a global button rule reduced both actions to 38 px despite the new local sizing.
2. The feature selectors were strengthened with important minimum heights of 40 px and 44 px.
3. The revised implementation was recaptured at the same viewport. Measured dimensions now match the intended hierarchy and no P0/P1/P2 difference remains.

## Primary interactions and runtime checks

- Both updated action types received keyboard-focus styling after activation.
- Existing click handlers and button labels remain unchanged.
- The focused comparison page produced no browser warnings or errors.

## Implementation Checklist

- [x] Match the flat visual treatment of `Pobierz`.
- [x] Keep the action background purple.
- [x] Increase label legibility and reduce visual heaviness.
- [x] Replace the long arrow with a compact caret.
- [x] Replace the circled Add icon with a simple check.
- [x] Verify focus, final dimensions and browser console.

## Follow-up Polish

- No blocking or P3 follow-up identified in this focused pass.

final result: passed
