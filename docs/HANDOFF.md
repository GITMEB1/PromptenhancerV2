# Agent Handoff — PromptenhancerV2

> **Last updated**: 2026-04-13  
> **Repo**: https://github.com/GITMEB1/PromptenhancerV2  
> **Test baseline**: 29/29 passing (`npm test`)  
> **Current version label**: v0.4.2

---

## 1. What this product IS

This is a Chrome MV3 extension that does **one thing**:

```
capture rough prompt → upgrade it → replace it in the same ChatGPT/Gemini page
```

That is the entire product. The user writes a draft in ChatGPT or Gemini, triggers an upgrade (toolbar icon, keyboard shortcut, or inline button), sees a stronger prompt in the side panel, and replaces it in-page. They send manually. **Never auto-send.**

### Non-negotiable rules (read AGENTS.md)
1. **No fake AI** — Do not claim model capabilities that are unavailable. The heuristic fallback is honest and explicit.
2. **No auto-send** — Replacement only updates the draft field. Never submit.
3. **No scope creep** — This is not a prompt marketplace, workspace, or autonomous agent system.
4. **Minimal permissions** — Do not add extension permissions unless strictly required.

---

## 2. How it actually works (the real flow, not the ideal)

### Trigger → Capture → Upgrade → Display → Replace

```
User clicks toolbar icon / presses shortcut / clicks inline ⚡ button
    ↓
service-worker.js: triggerUpgradeForTab(tabId)
    ↓
    ├── Sets session storage: { status: 'processing', sourceDraft, provider }
    ├── Opens side panel (shows spinner immediately)
    ├── Sends CAPTURE_PROMPT to content-script.js
    │       ↓
    │       content-script.js → providerAdapter.findEditableTarget(document)
    │       → provider-adapters.js → provider-core.js (scoring/ranking)
    │       → Returns { ok, text, meta }
    ↓
    ├── Calls runUpgrade({ draft, settings, context })
    │       ↓
    │       engines.js: chooseRoute() picks engine (remote > local > heuristic)
    │       → Runs chosen engine (or falls back with diagnostics)
    │       → Returns { result, route, engineUsed, fallbackReason?, schemaErrors? }
    ↓
    └── Sets session storage: { status: 'ready', ...upgrade }
            ↓
            sidepanel.js: detects storage change → renders result
```

### The side panel lifecycle states
```
null/undefined → Idle (gray badge, "Trigger an upgrade...")
processing    → Processing (blue pulsing badge, spinner, draft preview)
ready         → Ready (green badge, full result with tabs/variants)
error         → Error (red badge, error message)
```

### Where things can break (fragility map)

| Surface | Fragility | Why |
|---------|-----------|-----|
| `provider-adapters.js` target detection | **HIGH** | Provider UIs change frequently. Selectors break silently. |
| `content-script.js` writeback | **HIGH** | ChatGPT uses React controlled components + ProseMirror. The native setter + synthetic event trick works today but is inherently fragile. |
| `engines.js` remote fetch | **MEDIUM** | Network failures, schema mismatches, timeout edge cases. Now hardened with classified errors and diagnostics. |
| `service-worker.js` orchestration | **LOW** | Simple message routing. Chrome manages lifecycle. |
| `sidepanel.js` rendering | **LOW** | Pure rendering from session storage. No complex state. |

---

## 3. File map with purpose and coupling

### Core pipeline (changes here affect the product loop)
| File | Role | Imports from | Loaded as |
|------|------|-------------|-----------|
| `src/service-worker.js` | Orchestration hub: routes messages, triggers upgrades, manages session storage | `defaults.js`, `engines.js` | ES module (manifest `type: module`) |
| `src/content-script.js` | Runs in provider pages: captures prompt text, writes back replacements, manages inline button | `provider-adapters` and `provider-core` via globals | Plain script (IIFE context — **cannot use ES imports**) |
| `src/engines.js` | Route selection + engine dispatch: chooses remote/local/heuristic, handles fallback | `heuristic-engine.js`, `schema.js` | ES module |
| `src/heuristic-engine.js` | Always-available prompt transformer (no AI required) | `defaults.js` | ES module |
| `src/schema.js` | Validates upgrade result objects, collects all schema violations | None | ES module |

### Provider layer (changes here affect target detection)
| File | Role | Pattern |
|------|------|---------|
| `src/provider-core.js` | Provider inference, selector plans, candidate scoring, writeback verification | IIFE on `globalThis` |
| `src/provider-adapters.js` | ChatGPT/Gemini adapter layer: finds editable target using scored candidates | IIFE on `globalThis` |

### UI layer
| File | Role |
|------|------|
| `sidepanel/sidepanel.{html,js,css}` | Side panel: displays upgrade results, tabs for variants, replace/copy buttons |
| `options/options.{html,js}` | Settings page: privacy mode, remote endpoint, timeout, toggles |

### Support files
| File | Role |
|------|------|
| `src/defaults.js` | `DEFAULT_SETTINGS` object — single source of truth for all setting defaults |
| `src/utils.js` | Shared utilities (currently just `debounce`) — ES module for testable code |
| `manifest.json` | Extension manifest |
| `AGENTS.md` | Agent rules (read this first, every time) |

### Module system gotcha
**Content scripts in MV3 cannot use ES module imports.** That's why `provider-core.js` and `provider-adapters.js` use IIFE patterns and attach to `globalThis`. That's why `content-script.js` inlines its own `debounce` instead of importing from `utils.js`. Do not try to refactor these to ES modules — they will break silently in the extension context.

---

## 4. Test structure

```
tests/
├── provider-adapters-dom.test.cjs   # 7 tests — JSDOM adapter tests against HTML fixtures
├── provider-core.test.cjs           # (part of the 7 above, same runner)
├── engines-routing.test.js          # 7 tests — route decisions, remote contract, URL validation
├── schema.test.js                   # 10 tests — schema validation happy/sad paths
├── utils.test.js                    # 5 tests — debounce utility
└── fixtures/
    ├── chatgpt-compose.html         # Sanitized ChatGPT DOM with decoy elements
    └── gemini-compose.html          # Sanitized Gemini DOM with decoy elements
```

**Run**: `npm test`  
**Pattern**: CJS tests run first (adapter/JSDOM), then ESM tests (engines, schema, utils).

### Testing philosophy
- Tests cover **pure logic** and **deterministic behavior**. We don't test Chrome APIs or live DOM.
- Provider fixtures model real DOM shapes with deliberate decoys (wrong textareas, hidden elements).
- When you add a feature, ask: "Can I test the logic without Chrome?" If yes, write a test. If no, add a fixture or mock.
- **Always run `npm test` before committing.** The baseline is 29/29 green.

---

## 5. The settings system

All settings live in `src/defaults.js`:

```js
export const DEFAULT_SETTINGS = {
  privacyMode: 'hybrid',
  remoteEndpoint: '',
  remoteApiKey: '',
  remoteModelLabel: '',
  remoteTimeoutMs: 8000,
  diagnosticsEnabled: false,
  saveLocalHistory: false,
  inlineButtonEnabled: true
};
```

### How settings flow
1. `onInstalled` handler in service worker seeds any missing keys into `chrome.storage.sync`.
2. Service worker reads ALL settings via `chrome.storage.sync.get(null)` on every trigger.
3. Settings are passed to `runUpgrade()` as the `settings` object.
4. Options page reads/writes `chrome.storage.sync`.
5. Side panel reads `diagnosticsEnabled` from sync storage on init and live-updates via change listener.

### Settings wiring status
| Setting | Wired? | Where consumed |
|---------|--------|---------------|
| `privacyMode` | ✅ | `chooseRoute()` in `engines.js` |
| `remoteEndpoint` | ✅ | `runRemoteUpgrade()` in `engines.js` |
| `remoteApiKey` | ✅ | `runRemoteUpgrade()` Authorization header |
| `remoteModelLabel` | ✅ | Side panel Engine facts (when remote used) |
| `remoteTimeoutMs` | ✅ | `runRemoteUpgrade()` AbortController timeout |
| `diagnosticsEnabled` | ✅ | Side panel gates route decision row |
| `saveLocalHistory` | ❌ | **Not wired. Collected in UI but does nothing.** |
| `inlineButtonEnabled` | ✅ | Content script checks on init |

---

## 6. Prioritized next milestones

### Milestone A: Wire `saveLocalHistory` (estimated: 1 session)

**Why first**: It's the only setting that lies to the user — the toggle exists but does nothing. This is a trust violation.

**Implementation plan**:

1. **Storage schema**: Append to a `chrome.storage.local` key (not sync — history can be large).
   ```js
   // Suggested shape for each entry:
   {
     id: crypto.randomUUID(),
     timestamp: Date.now(),
     provider: 'chatgpt',
     sourceDraft: 'original text...',
     improvedPrompt: 'upgraded text...',
     engineUsed: 'heuristic',
     taskType: 'write',
     confidence: 0.48
   }
   ```
2. **Service worker**: After setting `latestUpgrade` with `status: 'ready'`, check `settings.saveLocalHistory`. If true, append entry to `chrome.storage.local` history array. Cap at ~100 entries (FIFO).
3. **Side panel**: Add a "History" section or tab. Show recent upgrades as a scrollable list with timestamp, provider pill, task type, and truncated draft preview. Clicking an entry loads it into the result view.
4. **Options page**: Add "Clear history" button that wipes the local storage key.
5. **Test**: Write a unit test for the history append/cap logic as a pure function (extract it from the service worker).

**Thinking traps to avoid**:
- Don't over-engineer the history UI. A simple reverse-chronological list is enough.
- Don't store the full `result` object per entry — it's too large. Store only the fields needed for the list view and the improved prompt.
- Don't use `chrome.storage.sync` for history — it has a 100KB total limit and is meant for settings.

---

### Milestone B: Provider adapter resilience (estimated: 1–2 sessions)

**Why next**: This is the highest-fragility surface. When ChatGPT/Gemini push UI updates, this is what breaks.

**Implementation plan**:

1. **Capture fresh DOM snapshots**: Open ChatGPT and Gemini in a browser. Inspect the current composer DOM. Compare against existing fixtures in `tests/fixtures/`. Note differences.
2. **Add new fixture variants**: Create `chatgpt-compose-v2.html` if the DOM has changed. Include the new shapes alongside old ones — don't delete old fixtures. Provider experiments are A/B tested, so both shapes may be live simultaneously.
3. **ProseMirror awareness**: ChatGPT has been moving toward ProseMirror-based editors. Check if the current `contenteditable` writeback path works with ProseMirror's DOM structure. If not, add a ProseMirror-specific writeback strategy:
   - ProseMirror uses `document.execCommand('insertText')` internally
   - You may need to dispatch `beforeinput` with `inputType: 'insertText'` instead of `insertReplacementText`
   - Test this empirically — load the extension on ChatGPT and check if writeback sticks
4. **Consider `data-testid` selectors**: Some providers add stable test IDs. These are more durable than class-based selectors. Add them as primary selectors if found, with class-based as fallback.
5. **Test**: Every new fixture should have a corresponding test case asserting correct target selection.

**Thinking traps to avoid**:
- Don't try to build a universal adapter. Each provider is different and that's fine.
- Don't trust `innerText` for ProseMirror — use the ProseMirror state if accessible, or fall back to `textContent`.
- Don't remove old selectors when adding new ones. Provider A/B tests mean old DOM shapes are still live for some users.

---

### Milestone C: Active remote endpoint health check (estimated: 0.5 sessions)

**Implementation plan**:

1. Add a "Test connection" button next to the remote endpoint URL field in `options/options.html`.
2. On click, send a minimal probe request:
   ```js
   {
     draft: "Hello, this is a connection test.",
     context: { provider: "test" },
     response_schema: "prompt_upgrader_v1"
   }
   ```
3. Validate the response with `validateUpgradeResult()`.
4. Show inline success ("✓ Connected, schema valid") or failure ("✗ HTTP 401: Unauthorized" / "✗ Schema errors: missing task_type, ...") in the options page.
5. **Important**: Don't import all of `engines.js` into the options page for this. Extract a lightweight `probeRemoteEndpoint(url, apiKey, timeoutMs)` function into a new `src/remote-probe.js` module, or add it to `schema.js`.

**Why this import matters**: `options.js` currently imports `isValidRemoteUrl` from `engines.js`, which pulls in `heuristic-engine.js` and `schema.js` transitively. This works but is wasteful. For the probe, you'd be pulling in even more. Consider whether `isValidRemoteUrl` should live in `utils.js` instead.

---

### Milestone D: Heuristic engine quality (ongoing, incremental)

**Context**: The heuristic engine is what 100% of first-time users experience. It currently works but has some rough edges:

- Confidence is hardcoded at 0.48 — could be draft-length-adaptive
- The `agent_spec` variant is generic — could be more structured
- Missing constraint detection covers basics but could be domain-aware (tone, audience, timeline)
- The task type classifier uses simple keyword matching — could use TF-IDF-style scoring

**Approach**: Make small, testable improvements. Each change should be accompanied by a test case that asserts the output quality for a specific input prompt.

---

### Milestone E: Manifest + security review (required before store publish)

- Review all permissions in `manifest.json` for least-privilege
- Add CSP headers to all HTML pages
- Create extension icons (16, 32, 48, 128px)
- Remove `<all_urls>` if possible — restrict to specific provider domains
- Check Chrome Web Store developer program policies

---

## 7. Mindset guidance

### Think like an extension developer, not a web app developer
- Extension code runs in multiple isolated contexts (service worker, content script, side panel, options page). They communicate via messages and storage, not function calls.
- The service worker can be terminated at any time by Chrome. Don't rely on in-memory state persisting.
- Content scripts share a DOM with the provider page but run in an isolated JS context. They can't access the page's JS variables directly.

### The fragility hierarchy
When debugging or planning work, think about where the fragility actually lives:

```
Most fragile:  Provider DOM selectors (external dependency, changes without notice)
               Writeback to controlled components (React/ProseMirror fight you)
               
Medium:        Remote endpoint behavior (network, schema, timeout)
               Built-in AI availability (Chrome flags, device constraints)
               
Least fragile: Heuristic engine (pure functions, fully controlled)
               Side panel rendering (reads from storage, no external deps)
               Settings management (simple CRUD on chrome.storage)
```

### When you're about to write code, ask yourself:
1. **Does this change strengthen the core loop?** If not, should you be doing it?
2. **Can I test this without Chrome?** If yes, write a test. If no, can you restructure so the logic IS testable?
3. **Am I adding a permission?** If yes, is there a way that doesn't require it?
4. **Am I importing across module boundaries correctly?** Remember: content scripts = IIFE/globals. Service worker + options + side panel = ES modules.
5. **Am I making the heuristic worse?** The heuristic is the baseline experience. Don't accidentally degrade it while working on other things.

### When you encounter a bug:
1. Run `npm test` first. Is the test suite still green?
2. Check if it's a provider DOM change (selectors breaking) vs. a logic bug.
3. For provider issues: capture the current DOM, create a fixture, write a failing test, then fix.
4. For logic issues: find the specific function, add a test for the failing case, then fix.

### What I would do differently
- **I should have extracted `isValidRemoteUrl` to `utils.js` instead of `engines.js`.** The options page imports from `engines.js` just for this one function, which pulls in the entire engine tree unnecessarily. This is a good early cleanup task.
- **I should have added an `input` event listener to the content script** that updates button visibility when the user types (currently only updates on focusin/click/mutation, so there's a brief delay before the button appears after typing in an empty field).
- **The inline debounce in content-script.js is code duplication.** I documented why (MV3 module constraints), but a build step (even a simple concatenation script) could eliminate this. Worth considering if the codebase grows.
- **I didn't verify the extension loads and runs in Chrome.** All my testing was unit-level (`npm test`). The first thing the next session should do is load the extension in Chrome, open ChatGPT, and verify the full loop works end-to-end. If it doesn't, that's the highest priority fix.

---

## 8. Quick-start for the next agent

```bash
# 1. Understand the rules
cat AGENTS.md

# 2. Verify tests pass
npm test
# Expected: 29/29 green

# 3. Read these files in order to understand the flow:
#    src/service-worker.js    (orchestration)
#    src/engines.js           (routing + engine dispatch)  
#    src/content-script.js    (capture/writeback)
#    src/schema.js            (validation)
#    sidepanel/sidepanel.js   (rendering)

# 4. Check the known limitations in docs/ARCHITECTURE.md (bottom)
# 5. Check CHANGELOG.md for full history and next steps
# 6. Ask the user what they'd like to work on next
```

---

## 9. Reference: Chrome extension message types

| Message type | Direction | Purpose |
|-------------|-----------|---------|
| `CAPTURE_PROMPT` | SW → content script | Read the current prompt text |
| `WRITE_PROMPT` | SW → content script | Replace prompt with upgraded text |
| `PAGE_TRIGGER_UPGRADE` | content script → SW | Inline button clicked, start upgrade |
| `GET_LATEST_RESULT` | side panel → SW | Load most recent upgrade result |
| `APPLY_VARIANT` | side panel → SW → content script | Replace prompt with selected variant |
| `COPY_TO_CLIPBOARD` | side panel → SW | Clipboard fallback storage |

---

## 10. Reference: Session storage shape

```js
// During processing
{ status: 'processing', sourceDraft: string, provider: string, timestamp: number }

// On success
{
  status: 'ready',
  provider: string,
  sourceDraft: string,
  captureMeta: { kind, provider, path },
  remoteModelLabel: string,
  result: {
    task_type: string,      // 'write' | 'edit' | 'explain' | 'research' | 'build' | 'plan'
    improved_prompt: string,
    assumptions: string[],
    missing_constraints: string[],
    clarifying_questions: string[],
    variants: { concise: string, rigorous: string, agent_spec: string },
    safety_notes: string[],
    confidence: number      // 0–1
  },
  route: { engine: string, decision: string, reason: string },
  engineUsed: string,
  fallbackReason?: string,
  schemaErrors?: string[],
  timestamp: number
}

// On error
{ status: 'error', error: string, provider: string, timestamp: number }
```
