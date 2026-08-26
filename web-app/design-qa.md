# Design QA — postęp bez zakresu i rytm osi dnia

## Evidence

- Source visual truth: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\source-dashboard-spacing.png`
- Original user screenshot: `C:\Users\dosta\AppData\Local\Temp\codex-clipboard-45f13dab-9a7e-4902-9621-2ce4a0c62b09.png`
- Focused timeline implementation: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\implementation-dashboard-spacing.png`
- Focused live-operations implementation: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\implementation-dashboard-live-indeterminate.png`
- Combined source/implementation comparison: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\comparison-dashboard-spacing.png`
- Full browser-rendered implementation: `C:\Users\dosta\cleanzi-version-4.0\web-app\design-qa-assets\implementation-dashboard-latest-full.png`
- Browser viewport: 1920 × 903 CSS px.
- Device pixel ratio: 1.
- Source pixels: 1103 × 100.
- Focused implementation pixels: 1103 × 100.
- Live-operations focused pixels: 720 × 275.
- Full implementation pixels: 1920 × 903.
- Density normalization: none; source and focused implementation are both 1:1 at DPR 1.
- State: active operation without a planned range, completed operation without a planned range, and a two-lane timeline row with plan, active work and a late-start alert.

The local dashboard data endpoint returned `Failed to fetch` during this pass. To keep the visual comparison deterministic, the final production CSS and exact production component markup were rendered in a temporary browser-only QA page. No product logic was replaced or modified for this check.

## Full-view comparison evidence

The full capture confirms that the live-operation card, timeline panel, employee/client identity, semantic status colors and component density remain consistent with the existing dashboard. The new indeterminate state fits the same hierarchy as percentage-based progress, while a completed unplanned operation still displays a fully green 100% bar.

## Focused comparison evidence

The combined 1103 × 252 comparison was required because the vertical gaps are too small to judge reliably in a full dashboard capture. Measured browser geometry:

- plan → active work: 4 px,
- active work → alert: 4 px,
- alert → lower track edge: 5 px,
- timeline track height: 74 px.

The active unplanned operation exposes `role="progressbar"`, `aria-busy="true"`, no `aria-valuenow`, and the visible label `W trakcie pracy`. Its fill uses the CSS animation `dash-command-operation-progress` with a 1.55 s duration. No timer, request, polling callback or data refresh was added.

## Findings

- No remaining P0, P1 or P2 finding in the requested scope.
- Fonts and typography: passed. The new label uses the existing compact dashboard type hierarchy and remains readable in both the result column and progress track.
- Spacing and layout rhythm: passed. Both inter-item gaps are exactly 4 px; the alert keeps a 5 px lower breathing area.
- Colors and visual tokens: passed. Blue remains active/in-progress, green remains completed, indigo remains planned and red remains late/attention.
- Image quality and asset fidelity: passed. Existing Phosphor icons and avatar assets are retained.
- Copy and content: passed. Active work without a planned range reads `W trakcie pracy`; completed work without a planned range remains `100%`.
- Accessibility and motion: passed. The indeterminate progressbar omits a misleading numeric value, exposes an accessible busy state, and the existing reduced-motion media query disables the animation.

## Comparison history

1. The source and first implementation capture used different crop offsets and horizontal data positions; these were normalization differences, not product mismatches.
2. The QA state was aligned to the same 1103 × 100 crop and the same visible plan/work/alert content.
3. The normalized combined comparison found no actionable P0/P1/P2 difference in the requested spacing or alert containment. No production visual fix was required after this normalized pass.

## Primary interactions and runtime checks

- Verified the active unplanned progressbar is indeterminate and has no numeric `aria-valuenow`.
- Verified the CSS animation runs continuously at 1.55 s without JavaScript refresh logic.
- Verified the completed unplanned example reports `100%` and `aria-valuenow="100"`.
- Verified the late-start alert remains keyboard-focusable and retains its detailed tooltip text.
- Browser-rendered QA page showed no runtime error notice; the main dashboard's local data request failure is recorded above as an environment issue.
- Production build completed successfully.

## Open Questions

- None for the requested scope.

## Implementation Checklist

- [x] Show `W trakcie pracy` for active operations without a planned range.
- [x] Use a CSS-only continuous loading animation.
- [x] Preserve 100% for completed operations without a planned range.
- [x] Set equal 4 px gaps between plan, active work and alert.
- [x] Preserve alert containment and lower breathing room.
- [x] Verify production build and rendered visual states.

## Follow-up Polish

- No blocking or P3 follow-up identified in this focused pass.

final result: passed
