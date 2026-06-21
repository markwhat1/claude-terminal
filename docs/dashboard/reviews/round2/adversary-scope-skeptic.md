# Adversary Review (Round 2): Scope / YAGNI Skeptic

Target: `docs/dashboard/PLAN.md` (round-2 revision, dated 2026-06-20), the ClaudeTerminal in-app Home / dashboard plan.
Lens: is this secretly two (or three) products fused again? over-engineered? will Phase 1 truly ship and be testable? attack untestable claims and scope creep.
Posture: hostile. The job is to find where this breaks or bloats, not to praise the prep.

Verdict up front: the round-2 plan answered some of round-1's scope objections honestly (D7 fetch-mechanism collapse, D6 scrubber-deferred, D4 ranker-only-with-real-producers, D2 pure-helper testing, the 1a/1b MVP line). Credit where due. But it answered them by ADDING milestones, not by cutting Phase 1. Round-1 attacked Phase 1 for being eleven milestones. Round-2's Phase 1 is now SEVENTEEN milestones (M0, M0b, M1, M3, M4, M5, M6, M7, M7b, M8a, M8b, M9, M10, M11, M12, M13, M14), and it pulled three J.O.T./coaching features (capture store, stall pattern-interrupt, commitment-mirror lock-in) OUT of Phase 2 and INTO Phase 1. The "two products fused" defect the lens was told to hunt is not gone; it got a third product (the productivity-methodology engine) partially welded into Phase 1 while the plan still calls Phase 2 "the todo store." And the single biggest concrete hole: the plan's remote-parity claims are written entirely against `App.tsx`, but the remote surface is a SEPARATE renderer (`src/web-client/main.tsx`, `RemoteApp`) that no milestone touches, so "Home rendering: works-remotely / full UI" (Section 3.5) is an untestable assertion with zero build steps behind it.

Citations re-verified against the `dashboard` worktree at HEAD `ce2e9e0` (confirmed via `git rev-parse`). `src/web-client/{main.tsx,ws-bridge.ts}` read directly; `components/ui/` confirmed missing card/skeleton/tooltip; the 17 milestone headers counted via grep.

---

## D1 (HIGH) — Phase 1 grew from 11 to 17 milestones. The fix for "too big" was to add more, and to pull Phase-2 coaching features forward.

Round-1 D1 said Phase 1 was ~2x its stated "verified data-reader" goal at eleven milestones. The round-2 response (PLAN line 18, 474-477) draws an internal 1a/1b line, which is the right instinct. But the net Phase-1 milestone count went UP, not down:

- Phase 1a: M0, M1, M3, M4, M5, M7b, M8a (7 milestones before first paint).
- Phase 1b: M0b, M6, M7, M8b, M9, M10, M11 (7 more).
- Then M12 (capture store + remote-enabled IPC channel), M13 (stall pattern-interrupt / Focus mode), M14 (commitment-mirror lock-in) (3 more), and "Phase 1 ships after M14" (line 604).

That is 17 milestones to "ship Phase 1." Worse, M12-M14 are the J.O.T./coaching product. Section 1.3 admits the capture store "is the smallest store that satisfies object permanence" and M12 builds a NEW remote-enabled IPC channel with full AGENTS.md treatment plus a `todos.json` store plus a `Ctrl+Shift+K` capture bar plus an `Inbox(N)` counter. Round-1 D9 explicitly warned: the todo/capture/horizons/categories/parking apparatus "is not a todo store; it is a personal-productivity methodology engine," and "when Phase 2 is actually scoped, it will face the same 'is this fused?' question." Round-2 responded by moving the FIRST slice of that engine into Phase 1. The plan even names the carrots as "first-class Phase-1 features, not Phase-2 sketches" (line 31). That is the fusion, restated as a feature.

The 1a subset (M0, M1, M3, M4, M5, M7b, M8a) IS the honest "verified data-reader," and it is genuinely shippable and dogfoodable. Everything from M8b onward is the attention/ranking product, and M12-M14 are the methodology product. The plan should stop calling the whole thing "Phase 1."

Minimal fix: rename. Phase 1 = the 1a set (M0, M1, M3, M4, M5, M7b, M8a): read the board, paint board-order needs-you, four states, Copy only. Phase 2 = the ranking/strip/actions set (M0b, M6-M11). Phase 3 = the J.O.T./coaching set (M12-M14 plus the current Phase-2 M15-M19). Each phase ships and gets used before the next is built. The work does not change; the gate does. A 17-milestone "Phase 1" will not all land and get dogfooded before scope drifts, which is the exact failure mode the lens exists to catch.

---

## D2 (HIGH) — Remote Home rendering is asserted, not built. The web client is a SEPARATE renderer no milestone touches.

Section 3.5 (line 250) states: "Home rendering | works-remotely | renderer-only; data via forwarded `onTabUpdate`/`tabs:sync`... | full UI; program region shows 'not available remotely' empty state." Section 2.6 (line 169) lists `isRemote` as a HomeView prop. M10 (line 571) says "thread `isRemote`... render PowerShell AND Open-Claude-with-query disabled... when `isRemote`."

But the desktop UI and the remote UI are two different React trees. The desktop root is `App.tsx`. The remote root is `RemoteApp` in `src/web-client/main.tsx` (read directly: it has its own `useState` tabs/activeTabId, its own `onTabUpdate`/`onTabRemoved` listeners at `:266-290`, its own render map `{tabs.map(...)}` at `:386-394`, its own keyboard handler). It imports `TabBar`, `Terminal`, `StatusBar` from `renderer/components` but NOT `App` and NOT (after this plan) `HomeView`. Every App.tsx seam the plan specifies (the sibling render `{activeTabId === HOME_TAB_ID && <HomeView/>}`, the separate Home slot, the `onTabRemoved` route-to-Home, `handleSelectTab` short-circuit, the `isRemote` prop) exists ONLY in `App.tsx`. None of it exists in `RemoteApp`.

Consequences the plan does not address:
- For Home to render remotely AT ALL, `RemoteApp` needs the same synthetic-Home slot, the same render seam, the same select short-circuit, the same `onTabRemoved`-to-Home routing, plus the program-board IPC stubbed through `ws-bridge.ts` (which M5 does stub) AND a HomeView mount. No milestone does any of this. So "works-remotely / full UI" is false as planned: remotely, Home does not render at all.
- `isRemote` has no source in `RemoteApp` that the plan names. Section 3.2 says "Thread `isRemote` from `src/web-client/main.tsx` (the sole mounter of `bridge.api`, `main.tsx:35`)." That line (`(window as any).claudeTerminal = bridge.api`) sets the API; it does not render HomeView. There is no HomeView in that file to pass `isRemote` to. The prop is specified for a component that is never mounted in the renderer where `isRemote` would be true.
- The round-1 D3 objection already flagged this: "A Home tab living outside that array means the remote path needs the SAME `[homeTab, ...tabs]` special-casing in a SECOND renderer (`web-client/main.tsx`), which the plan does not mention." Round-2 switched to the sibling-render form (dropping `[homeTab, ...tabs]`), which sidesteps the array-spread specifics, but the dual-renderer gap is unchanged: a second renderer still needs the entire Home seam and a HomeView mount, and round-2 still does not mention it.

This is the load-bearing untestable claim of the plan. The per-action parity table (3.5) reads as if remote Home is a solved, tested surface. It is neither built nor scheduled.

Minimal fix: pick ONE and state it. Either (a) Home is desktop-only in Phase 1: drop the "works-remotely / full UI" row, drop `isRemote` from the HomeView prop set, and add one sentence that remote reconnect lands on the first real tab with no Home (which the plan already half-says in Section 2.1's remote-truth note); or (b) if remote Home is in scope, add an explicit milestone that mounts HomeView in `RemoteApp` with its own Home slot + render seam + `isRemote=true` hardcoded there + the `ws-bridge.ts` board stub, and a web-client render test. Do not leave a parity table claiming a surface that has no build step.

---

## D3 (HIGH) — M8a (the 1a MVP paint) ships a hero whose primary button does nothing until M10. The "demoable MVP" is a read-only mock with dead CTAs.

Line 476 calls Phase 1a "demoable real data" and M8a "the dogfoodable MVP" (line 552). But M8a renders the hero card, and the hero card's whole point is its ONE primary action button (Section 1.1 line 37: "The hero carries one primary action button"; Section 6.3: "One primary `Button` from `pickPrimaryAction`"). The actions are not wired until M10 (`composeClaudeQuery`, `openClaudeWithQuery`, PowerShell, Copy). `pickPrimaryAction` is M6. So M8a paints a hero with either no primary button or a non-functional one. The only action the plan says 1a ships is "Copy only" (line 476), but Copy on the hero is a secondary/quiet action by the plan's own dominance spec, not the hero's primary CTA.

So the 1a "MVP" is: real board data, real states, real hero card, and a primary call-to-action that is absent or inert. For an ADHD user the entire thesis (Sections 1.5-1.7: "make the finish pay out," "reframe-as-review is the headline affordance," "the hero pays the whole initiation cost in one click") is exactly the part 1a does not have. That is a demo, not a dogfoodable tool. The plan oversells 1a as "first user-visible value" when the value (one-click action) is in 1b/M10.

This interacts with D1: it means the genuinely useful unit is M0..M10, which is back to ~the round-1 eleven-milestone Phase 1. The 1a/1b split is real for the data SEAM but not for user value.

Minimal fix: be honest in the plan about what 1a is: "a verified, dogfoodable read-only board view (hero + needs-you list + states + Copy), no primary action." Then make Copy the hero's primary action in 1a (paste-ready, canned, per Section 3.3) so the hero is not a dead button, and move ONE action (Open-Claude-with-query, the highest-value one) up so the first usable hero CTA lands earlier. Or accept that "usable" starts at M10 and stop labeling M8a the MVP.

---

## D4 (MEDIUM) — M3 still folds two unrelated changes and one of its DoDs is not a test.

Round-1 D2 attacked M3 for being untestable (mount-App fiction) and self-contradictory (render-map vs separate-slot). Round-2 fixed the testability honestly: M3a/M3b now test extracted PURE helpers (`selectActiveView`, `computeTabCounts`, `nextActiveOnRemove`, the `onTabUpdate` guard), explicitly "no App mount" (line 498). Good fix, credit given.

Residual: M3a still bundles five distinct edits (TabType add, Home state slot, render seam, `onTabUpdate` guard, `handleSelectTab` short-circuit) under "one change, one rollback point" (line 470 promises boringly-small milestones). Of those, only the `onTabUpdate` guard and `computeTabCounts`/`selectActiveView` are covered by the stated pure tests. The "render seam" itself ("`{activeTabId === HOME_TAB_ID && <HomeView/>}` placeholder") has DoD "Home renders as a placeholder" (line 499), which is a manual observation, not a test, and the plan's own rule (line 472) is "each DoD is a green test plus one observable, never a manual smoke run." With no App mount and no web-client mount, the render seam has no automated proof in M3a at all. It first gets exercised in M8a's `HomeView.test.tsx`, which mounts HomeView directly, not the App seam. So the seam wiring (does selecting `HOME_TAB_ID` actually show HomeView in the real App?) is never tested, in any milestone.

Minimal fix: either extract the seam decision into a pure `shouldRenderHome(activeTabId, homeId): boolean` and test that (trivial but honest), or state plainly that the App<->HomeView wiring is verified by manual dogfooding at the 1a checkpoint and is the one intentional manual-verify step, so it is a decision not an omission.

---

## D5 (MEDIUM) — The capture store (M12) is a new remote-enabled IPC channel + JSON store + keybinding, sold as "minimal." It is the Phase-2 product's foundation, shipped in Phase 1.

Section 1.3 frames capture as "the smallest store that satisfies object permanence." But M12 (line 583-588) is not small: a new `todos.json` store owned by main, a NEW IPC channel pair with the FULL five-part AGENTS.md treatment (handler + preload + `global.d.ts` + registration test + explicit remote decision), AND it is REMOTE-ENABLED (handler in `WebRemoteServer.handleMessage()` + a real `ws-bridge.ts` send), plus the `Ctrl+Shift+K` bar, plus the `Inbox(N)` counter. This is the single most plumbing-heavy milestone in Phase 1, and it is the first brick of the Section 8 todo store, which the plan itself describes as extending "the Phase-1 `todos.json` (M12) with horizons, categories, parking, and the full ritual" (line 610).

So the plan's own architecture says: M12 is Phase 2's store, built in Phase 1. The schema is even versioned for it (`{version, items:[{id,text,createdAt}]}` in Phase 1, "horizons/categories/parking are Phase-2 additions to the same file," line 51). That is the fusion seam in plain sight. The justification (object permanence, "items live in Mark's head and decay") is a real ADHD need, but it is a Phase-2 need by the plan's OWN phase definition (Phase 2 = "a separate new todo store," line 21). You cannot define Phase 2 as "the todo store" and then ship the todo store's foundation, including a brand-new remote channel, in Phase 1.

Minimal fix: move M12 to the front of Phase 2 (it already IS Phase 2's M-something by data lineage). If object permanence must exist sooner, ship the absolute floor in Phase 1: append-only `todos.json`, LOCAL-ONLY (no remote channel, no `WebRemoteServer` handler, no `ws-bridge` send), captured via the existing capture path, displayed as `Inbox(N)`. Defer the remote-enabled channel (the expensive, AGENTS.md-heavy part) to Phase 2 with the rest of the store. A remote-enabled capture channel in Phase 1 is YAGNI: the plan gives no Phase-1 consumer that requires capturing FROM the phone before the rest of the todo store exists to act on captures.

---

## D6 (MEDIUM) — M13 (stall pattern-interrupt) and M14 (commitment-mirror) are coaching features with no Phase-1 data dependency and weak testability; they belong in the coaching phase.

M13 (Focus-mode collapse on a 25s stall timer, default ON, settings toggle) and M14 (lock-in "today's one thing" with a per-day pinned-hero-id) are pure ADHD-coaching behaviors. Neither needs the board, the ranker, or any Phase-1 data the other milestones produce; both are renderer-state-only. They are in Phase 1 because Section 1 declared the carrots "first-class Phase-1 features" (line 31), not because the build requires them there.

Two specific problems:
- M13's DoD is "the interrupt fires only on detected stall" (line 594), tested with fake timers. Fine for the timer mechanics. But "default ON" for an auto-collapsing Focus mode is a significant, opinionated UX intervention to ship before the base board has been used for a single day. The plan's own open question 6 (line 716) asks the user whether default ON is acceptable. Shipping a default-ON behavior-modifying timer in the same phase as "can the app even read the board" is putting a coaching opinion ahead of a verified base. That is the methodology product leaking into the data-reader phase.
- M14 depends on the "per-day pinned-hero-id slot" that M3b introduces (line 501) and on `rankItems` (M6) for "pinned above auto-rank." So M14 is only meaningful after M6/M8b. It is correctly late, but it is still inside "Phase 1," extending the fusion.

Minimal fix: M13 and M14 move to the coaching phase (the renamed Phase 3 from D1), and ship default OFF until the base board has real-use feedback. The base board must earn the user's trust before it starts collapsing their screen on a timer.

---

## D7 (MEDIUM) — `rankItems` (M6) still builds tiers and tie-breaks with no Phase-1 producer, despite the round-1 fix.

Round-1 D4 attacked the six-tier ranker for building four tiers with no Phase-1 data. Round-2 responded well in prose: line 373 ("in 1a, `rankItems` is NOT built"), line 529 ("Build only tiers with a Phase-1 producer... leave Tier 1/Tier 5 stubs"). Credit given; this is the right call and a real improvement.

Residual creep: M6's stated test surface (line 530, pointing at Section 5.6) still includes Tier-1-beats-Tier-2 ordering and "an avoidance item with `ageColor:green` and no recency still appears in Tier 5" (line 409). Tier 1 (time_sensitive) has no live producer (the board shows it null, line 389 admits "No live producer yet") and Tier 5 (avoidance/todos) has no Phase-1 producer (todos arrive via M12's bare store with no `avoidanceCategory`; the classifier is Phase 2, Section 8.4). So Section 5.6's test list still asserts tiers M6 is told NOT to build. The test surface and the build scope contradict each other by exactly the round-1 amount, just smaller. A builder following Section 5.6 writes tests for stubs; a builder following line 529 does not, and M6's DoD ("every assertion green") becomes ambiguous about WHICH assertions.

Minimal fix: split Section 5.6 explicitly into "Phase-1b assertions (Tier 2/3/4, tie-breaks, determinism, `pickPrimaryAction`)" and "deferred (Tier 1/Tier 5, built with their producers)." Make M6's DoD reference only the Phase-1b subset. One paragraph; removes the contradiction.

---

## D8 (LOW) — "Phase 1 ships as a read-only board with no accountability ritual, so the gap is a decision" (line 99) is contradicted by shipping M14 in Phase 1.

Section 1.9 (line 99) hedges: "If even this slips, Section 1 and the risks state plainly that Phase 1 ships as a read-only board with no accountability ritual... (Current plan: ship the minimal lock-in.)" But the current plan DOES ship the lock-in (M14, inside Phase 1). So the escape-hatch sentence is dead text describing a plan that is not the current plan. It reads like a leftover from an earlier draft where the ritual was cut. Either the ritual is in (M14 exists) or the fallback is live (M14 cut); the plan asserts both.

Minimal fix: delete the conditional hedge, or, if D1/D6 are accepted and M14 moves to Phase 3, restore it as the accurate description of the new Phase 1. Pick one to match the milestone list.

---

## D9 (LOW) — `parseProgramBoardTime` is sold as "solved in exactly one place," but the plan has it serving two callers with two branches; the single-helper framing hides a real fork.

Section 2.7 (line 173) and 9.2 sell one shared `parseProgramBoardTime` so "the naive-local-vs-offset timezone trap is solved in exactly one place." But the helper has TWO branches (line 337, 672): one parses `generated_at` as naive-local, one parses `last_commit.iso`/`last_touched` as offset-aware, and "the two are never run through the same parse." That is two parsers behind one function name with a caller-supplied discriminator. The risk the plan claims to eliminate (a caller using the wrong branch) is not eliminated; it is moved to "which branch does the caller ask for," which is exactly the same mistake surface. A single function that does opposite things based on a flag is not "solved in one place"; it is a flag the next contributor can pass wrong.

Minimal fix: make them TWO named functions, `parseNaiveLocal(s)` and `parseOffsetAware(s)`, each with a test. The compiler and the name then prevent the misuse. "One file" is fine; "one function with a mode flag" is the trap dressed as the fix.

---

## What I am NOT objecting to (so a wrong result is easy to trace)

- The recon (R1-R6) remains sound and the round-2 corrections it forced (write-after-ready primary, idle+hadActivity spine, watch-the-directory, producer-driven `dodAlmost` without the `>=2` guard, naive-local `generated_at`) are correct and well-cited. Verified HEAD `ce2e9e0`, web-client/main.tsx, missing ui primitives.
- Round-2 genuinely fixed round-1 D2 (M3 now tests pure helpers, no App-mount fiction), D6 (scrubber deferred, no Phase-1 caller, canned-only default), D7 (fetch collapsed to poll-primary + optional watcher + cold-file-only HTTP), and largely D4 (ranker built only with real producers). These are real improvements, not cosmetic.
- The "Home renderer-only, never in TabManager" core decision (Section 2.1) and the security choke-point work (branded `ClaudeQueryLine`, M0b logger gate, canned templates, scheme allowlist, path validation) are correct and proportionate to the PHI-adjacency.
- The 1a milestone SET (M0, M1, M3, M4, M5, M7b, M8a) is the right minimal data-reader. My objection is the label "Phase 1" stretched over 17 milestones, not the existence of the 1a set.

The defect pattern is consistent: round-2 answered "too much in Phase 1" by adding structure (1a/1b) and more milestones rather than by moving the attention product and the coaching product out of Phase 1. It then asserted a remote Home surface (Section 3.5) that no milestone builds, against a renderer (`web-client/main.tsx`) the plan never edits. Cut Phase 1 to the 1a data-reader, push ranking/actions to Phase 2 and the J.O.T./coaching carrots (M12-M14) to Phase 3, and either build or disclaim remote Home. Then Phase 1 will actually ship and be dogfooded before the scope question comes back.
