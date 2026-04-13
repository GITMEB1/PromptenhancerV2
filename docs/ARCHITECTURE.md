# Architecture notes

## Current build shape
- MV3 extension
- provider core + provider adapters for target detection
- content script orchestration for capture/writeback
- side panel for preview/apply
- service worker for orchestration
- heuristic fallback engine
- optional built-in AI route
- optional remote route
- adapter regression tests
- routing tests
- schema validation tests

## Why heuristic fallback exists
This starter is meant to be usable immediately without pretending that:
- Chrome built-in AI is always available
- a remote backend already exists

The heuristic engine keeps the UX and system contracts testable from day one.

## v0.2 milestone 1 status: provider adapter extraction + writeback hardening
- ChatGPT and Gemini target selection now runs through a dedicated adapter layer.
- Editable target selection is ranked/scored instead of taking the first generic match.
- Writeback verifies replacement text and preserves clipboard fallback when verification fails.

## v0.2 milestone 2 status: provider DOM regression harness
- Added sanitized ChatGPT/Gemini HTML fixtures to model composer DOM shape with decoys.
- Added adapter DOM tests that assert target selection picks the intended prompt field and rejects decoys.
- Exposed candidate-collection helpers from `provider-adapters` so scoring can be validated deterministically.
- Added a project-level `npm test` command (`node --test tests/*.test.cjs`) so adapter/core checks run consistently.

## Remaining limitations / blind spots
1. Fixture harness is static and cannot cover live provider experiments that radically alter selector contracts.
2. JSDOM-based tests approximate layout; runtime event semantics (real keyboard/composition behavior) are still unverified.
3. No telemetry/diagnostics yet for field-detection failures in the wild.
4. Manifest permissions should still be reviewed before store submission.


## v0.3 milestone 1 status: engine routing hardening + route test spine
- Route selection is policy-first and returns explicit `decision` labels for branch-level reasoning.
- Built-in AI checks now probe callable API shape and availability instead of checking global symbols alone.
- Built-in availability is cached briefly to reduce repeated probing overhead during rapid invocations.
- Remote transport now enforces timeout/abort, HTTP status guards, JSON content-type validation, and classified transport errors.
- Added targeted routing tests for route decisions, built-in capability probing, and remote failure-to-heuristic fallback behavior.

## v0.3 milestone 2 status: remote contract hardening + settings/config alignment

### Bugs fixed
- `remoteTimeoutMs` was read by `runRemoteUpgrade()` but absent from `DEFAULT_SETTINGS`, the options page, and the install handler. It always silently fell through to the hardcoded 8000ms. Now a persisted, user-configurable setting.
- Service worker settings retrieval used `Object.keys(DEFAULT_SETTINGS)` which could miss newly added keys. Now uses `chrome.storage.sync.get(null)` for complete reads.

### Schema validation hardened
- `validateUpgradeResult()` now delegates to `collectSchemaErrors()`, which returns **all** violations instead of just the first.
- `VALID_TASK_TYPES` exported as a constant for documentation and reuse.
- 10 new schema validation tests (happy path, individual field rejection, multi-error collection, edge cases).

### Upgrade diagnostics surfaced
- `runUpgrade()` now returns `fallbackReason` (string) and `schemaErrors` (string array) alongside existing fields.
- When remote transport fails, the error message is captured in `fallbackReason`.
- When remote response fails schema validation, all violations are captured in `schemaErrors`.
- Side panel now renders:
  - Route decision label in Engine facts
  - Fallback notice block with reason and schema error list (only shown when relevant)

### Settings/config alignment
- Options page now exposes `remoteTimeoutMs` with numeric input (1000–60000ms range, clamped on save).
- Remote endpoint URL is validated on save (must be http/https or empty).
- `isValidRemoteUrl()` exported from `engines.js` for reuse and testing.
- 3 new remote contract tests (schema failure → heuristic-repair with diagnostics, timeout propagation, URL validation).

### Test coverage
- Total tests: 24 (was 11)
  - 7 provider adapter/core tests (unchanged)
  - 7 engine routing tests (was 4, added 3)
  - 10 schema validation tests (new)

## v0.4 milestone 1 status: side panel lifecycle + UX trust hardening

### Processing state
- Service worker now emits a `processing` status to session storage **before** running the upgrade engine.
- Side panel opens immediately during processing, showing a spinner and the original draft.
- When the upgrade completes, session storage updates to `ready` and the side panel transitions automatically.
- Action buttons (Replace, Copy) are disabled during processing and re-enabled on completion.

### Original draft display
- Both the processing screen and the result screen include a collapsible "Original draft" section.
- Users can compare their original input with the upgraded version directly in the side panel.

### Badge state differentiation
- Status badge is now color-coded per lifecycle state:
  - **Idle** — neutral gray
  - **Processing** — blue with pulse animation
  - **Ready** — green
  - **Error** — red

### Copy feedback
- Copy button shows a brief "Copied ✓" state with green accent styling for 1.8 seconds.

### `diagnosticsEnabled` wired
- Route decision row in Engine facts is now gated behind the `diagnosticsEnabled` setting.
- The setting is read on panel init and live-updated via storage change listener.

### `remoteModelLabel` displayed
- When the remote engine is used and a model label is configured, it appears in the Engine facts block.

### Bug fixes
- Removed stale no-op `chrome.storage.session.onChanged?.addListener(() => {})` listener.
- Side panel now correctly handles all lifecycle transitions via a single unified `chrome.storage.onChanged` listener.

## v0.4 milestone 2 status: content script + inline button hardening

### Performance
- **Debounced MutationObserver** (100ms trailing) — previously fired `positionInlineButton()` on every single DOM mutation across the entire page. On ChatGPT during streaming, this caused hundreds of calls per second, each running full `querySelectorAll()` target detection.
- **Debounced focusin/click handlers** (50ms trailing) — prevents excessive target detection bursts.
- **Removed `attributes: true`** from MutationObserver options — attribute changes (class toggles, style updates during streaming) were the largest source of spurious mutations and are irrelevant to button positioning.

### Shadow DOM isolation
- Inline button is now rendered inside a closed Shadow DOM attached to a custom `<prompt-upgrader-button>` element.
- Host page CSS (ChatGPT/Gemini global resets, utility classes) cannot style or break the button.
- Button uses `all: initial` to completely reset inherited styles.

### Content-aware visibility
- Inline button only appears when the detected editable field **has text content**. Previously showed "Upgrade" on empty fields.
- Button is hidden when target is offscreen (scrolled out of viewport).
- Proper DOM containment check — if target element is removed, button hides.

### Position clamping
- Button position is clamped within the viewport boundaries. Previously could land outside the visible area on narrow fields or edge positioning.

### Double-trigger guard
- `upgradeInFlight` flag prevents the inline button from dispatching multiple `PAGE_TRIGGER_UPGRADE` messages while a previous upgrade is still processing.
- Inline button shows "Upgrading…" state with reduced opacity during in-flight upgrades.

### Utility module
- `src/utils.js` exports a `debounce(fn, delayMs)` function with `cancel()` method.
- Content script inlines its own copy (content scripts cannot use ES module imports in MV3).
- 5 new debounce tests (delayed invocation, argument forwarding, cancellation, timer reset, repeated usage).

### Test coverage
- Total tests: 29 (was 24)
  - 7 provider adapter/core tests (unchanged)
  - 7 engine routing tests (unchanged)
  - 10 schema validation tests (unchanged)
  - 5 utility tests (new)

## Known remaining limitations
1. Built-in AI availability can change mid-session (flags/device constraints); cache is intentionally short-lived but still approximate.
2. Remote endpoint validation is client-side only (URL format check). No active health check or schema probe against the endpoint.
3. Route decision heuristics still rely on lightweight task-type inference and complexity scoring, so niche prompts may route conservatively.
4. `saveLocalHistory` setting is collected but not yet wired to functional behavior.
5. No E2E or integration tests against real provider UIs.
6. Content script debounce is inlined rather than imported from `src/utils.js` due to MV3 content script module constraints.
