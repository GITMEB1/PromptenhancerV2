# Changelog

All notable changes to this project are documented in this file.

## [0.4.2] — 2026-04-13 — Content script + inline button hardening

### Performance
- Debounced MutationObserver (100ms trailing) — previously fired on every single DOM mutation across the entire page, causing hundreds of target-detection scans per second on ChatGPT during streaming.
- Debounced focusin/click handlers (50ms trailing) to prevent excessive target detection bursts.
- Removed `attributes: true` from MutationObserver — attribute changes (class toggles, style updates) were the largest source of spurious callbacks and are irrelevant to button positioning.

### Shadow DOM isolation
- Inline button now renders inside a closed Shadow DOM on a custom `<prompt-upgrader-button>` element.
- Host page CSS (ChatGPT/Gemini resets, utility classes) can no longer break or style the button.
- Button styles use `all: initial` for complete inherited-style reset.

### Content-aware visibility
- Inline button only appears when the editable field has text content (was showing "Upgrade" on empty fields).
- Button hidden when target scrolls offscreen or is removed from DOM.

### Reliability
- Double-trigger guard (`upgradeInFlight` flag) prevents dispatching multiple upgrade messages while one is processing.
- Inline button shows "Upgrading…" with reduced opacity during in-flight upgrades.
- Button position clamped within viewport boundaries.

### New files
- `src/utils.js` — shared `debounce(fn, delayMs)` utility with `cancel()` method.
- `tests/utils.test.js` — 5 debounce tests.

### Test count: 29 (was 24)


## [0.4.1] — 2026-04-13 — Side panel lifecycle + UX trust hardening

### Processing state
- Service worker emits `processing` status to session storage before running the upgrade engine.
- Side panel opens immediately during processing, showing a spinner animation and the user's original draft.
- Upgrade result transitions automatically via storage change listener when engine completes.
- Replace/Copy buttons disabled during processing.

### Original draft display
- Both processing and result screens show a collapsible "Original draft" section.
- Users can compare their input with the upgrade directly in the side panel.

### Badge state differentiation
- Status badge is color-coded: Idle (gray), Processing (blue + pulse animation), Ready (green), Error (red).

### Copy feedback
- Copy button briefly shows "Copied ✓" with green accent styling for 1.8 seconds.

### Settings wired
- `diagnosticsEnabled` now gates the route decision row in Engine facts. Live-updated via storage listener.
- `remoteModelLabel` displayed in Engine facts when remote engine is used.

### Bug fixes
- Removed stale no-op `chrome.storage.session.onChanged?.addListener(() => {})` listener.
- Side panel now handles all lifecycle transitions via a single unified `chrome.storage.onChanged` listener.

### Test count: 24 (unchanged — this milestone was UI state management)


## [0.3.2] — 2026-04-13 — Remote contract hardening + settings/config alignment

### Bugs fixed
- `remoteTimeoutMs` was read by `runRemoteUpgrade()` but absent from `DEFAULT_SETTINGS`, options page, and install handler. It silently fell through to the hardcoded 8000ms. Now a persisted, user-configurable setting (1000–60000ms).
- Service worker settings retrieval used `Object.keys(DEFAULT_SETTINGS)` which could miss newly added keys. Now uses `chrome.storage.sync.get(null)`.

### Schema validation hardened
- `validateUpgradeResult()` delegates to new `collectSchemaErrors()`, returning **all** violations instead of just the first.
- `VALID_TASK_TYPES` exported as a reusable constant.

### Upgrade diagnostics surfaced
- `runUpgrade()` returns `fallbackReason` (string) and `schemaErrors` (string[]) alongside existing fields.
- Side panel renders fallback notice block with reason and schema error list.

### Settings/config alignment
- Options page exposes `remoteTimeoutMs` with numeric input and range clamping.
- Remote endpoint URL validated on save (must be http/https or empty).
- `isValidRemoteUrl()` exported from `engines.js`.

### New files
- `tests/schema.test.js` — 10 schema validation tests.

### Test count: 24 (was 11)


## [0.3.1] — Pre-existing — Engine routing hardening + route test spine

*(This milestone was completed before this work session began.)*

- Route selection is policy-first with explicit `decision` labels.
- Built-in AI probing verifies callable API shape, not just global symbols.
- Remote transport enforces timeout/abort, HTTP status guards, JSON content-type validation, classified transport errors.

### Test count: 11


## [0.2.2] — Pre-existing — Provider DOM regression harness

- Sanitized ChatGPT/Gemini HTML fixtures with decoys.
- JSDOM-based adapter DOM tests.
- Project-level `npm test` introduced.


## [0.2.1] — Pre-existing — Provider adapter extraction + writeback hardening

- ChatGPT/Gemini selection through adapter layer.
- Ranked/scored editable target selection.
- Writeback verification with clipboard fallback.


---

## Next steps (prioritized)

### 1. Wire `saveLocalHistory` (high value, bounded)
The setting exists in the UI but does nothing. Implementation:
- On each successful upgrade, append `{ sourceDraft, result, engineUsed, timestamp, provider }` to `chrome.storage.local`.
- Add a "History" tab or section to the side panel showing past upgrades.
- Add a "Clear history" option.
- Respect the toggle — only persist when enabled.
- This makes the extension stickier and lets users compare upgrade quality over time.

### 2. Provider adapter resilience (high value, ongoing)
- Add more fixture variants (mobile layouts, A/B experiments, ProseMirror-based editors).
- ChatGPT has been shifting toward ProseMirror editors — the `contenteditable` writeback path may need updating for newer DOM structures.
- Add fixtures for ChatGPT's newer `div[contenteditable]` composer shapes.
- Consider adding a `data-testid`-based selector as a primary selector (more stable than class-based).

### 3. Active remote endpoint health check (medium value)
- Add a "Test connection" button to the options page that sends a lightweight probe to the configured endpoint.
- Could send a minimal `{ draft: "test", context: {}, response_schema: "prompt_upgrader_v1" }` and validate the response shape.
- Surface success/failure directly in the options UI.

### 4. Heuristic engine quality (medium value, incremental)
- The heuristic engine is the baseline every user experiences. Current confidence is hardcoded at 0.48.
- Consider draft-length-adaptive confidence scoring.
- The agent_spec variant could be stronger with structured output format hints.
- Missing constraint detection could cover more domains (e.g., tone, timeline).

### 5. Manifest + security review for store submission (required before publish)
- Review all permissions for least-privilege.
- Add CSP headers to HTML pages.
- Review for Chrome Web Store policy compliance.
- Add extension icons.

### 6. Production telemetry (future)
- Field-level diagnostics for target-detection failures.
- Route decision logging for understanding real-world routing behavior.
- Opt-in only, gated behind `diagnosticsEnabled`.

---

## Architectural notes for future developers

### The core loop is the product
```
capture rough prompt → upgrade it → replace it in the same page
```
Every change should strengthen this loop. Do not expand scope into general AI workspaces, prompt marketplaces, or autonomous agents.

### The heuristic engine is a feature, not an embarrassment
It is the honest baseline that keeps the product usable when no AI routes are available. Do not remove or obscure it.

### Content scripts are the most fragile surface
Provider UIs change frequently. The adapter/selector/fixture architecture exists specifically to make these changes testable. When a provider UI breaks target detection, add a fixture first, then fix the selector.

### Shadow DOM isolation was a conscious choice
The inline button uses a closed Shadow DOM specifically because ChatGPT and Gemini both use aggressive CSS resets that break injected elements. If you need to add more injected UI, use the same pattern.

### Module boundaries matter
- Content scripts cannot use ES module imports in MV3 (they run in a non-module context). This is why `debounce` is inlined in the content script rather than imported from `utils.js`.
- The service worker and options page CAN use ES modules (loaded with `type="module"`).
- `provider-core.js` and `provider-adapters.js` use IIFE patterns because they load as plain scripts in the content script context.
