# Phase gate: Phase 1 -> Phase 2

Run this before opening ANY Phase-2 milestone (M14c, M6, M11, M12, M13). Both boxes must be checked. Mark is the only decider; a milestone merge never auto-opens the gate. Full rationale: PLAN.md Section 1 "The Phase gate" and R-13.

Read condition (1) off the PASSIVE artifact `app.getPath('userData')/home-opens.json` (written by M14e), not recall:

- [ ] **5-day landing (read from `home-opens.json`).** With `startupView:'home'` set and R-10 Option A (land on Home without auto-restoring tabs), the artifact shows Home was the GENUINE first surface (`landedOnHome:true`) on at least 5 working days. (Not "the app supports clicking Home"; the recorded landed surface.)
- [ ] **Named friction.** Mark has written one concrete Phase-1 friction that a specific Phase-2 milestone addresses:

      ___________________________________________  -> addressed by M____

## Kill check (fail = Phase 2 does NOT ship), now falsifiable from data

- [ ] `home-opens.json` does NOT show Home was the landed surface on the MAJORITY of opens over the window; OR Mark reverted `startupView` to `'lastSession'`; OR the open count itself collapsed.

If the kill check trips, the core bet (a calm board earns daily opens) is judged false from the artifact, not from self-report. Phase 2 is shelved, not shipped on sequence. The lane does not roll from the last Phase-1 milestone into M6 because the doc lists them in order.
