# One-Click Prompt Upgrader

A real Chrome extension starter for upgrading rough prompts **inside ChatGPT and Gemini** with one action.

This build is designed to be honest and usable now:
- it includes a **heuristic fallback** that always works
- it can try **Chrome built-in AI APIs** when they are available in the browser
- it can route to **your own remote endpoint** if you configure one

It is **not** pretending to ship production-grade AI in every environment by default.

## What it does
- Detects the active prompt field on supported pages
- Captures the current draft
- Produces:
  - a default upgraded prompt
  - concise variant
  - rigorous variant
  - agent-spec variant
- Lets you replace the text directly in the page or copy it
- Uses a Side Panel UI for review

## Supported pages in this starter
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://gemini.google.com/*`

## Load it in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder
5. Open ChatGPT or Gemini
6. Use the toolbar button or keyboard shortcut:
   - Windows/Linux: `Alt + Shift + U`
   - macOS: `Command + Shift + U`

## Routing behaviour
### 1. Heuristic fallback
Always available. Useful for:
- rough drafts
- structure upgrades
- variant generation
- local development and UI testing

### 2. Chrome built-in AI
The extension will try local built-in AI routes when available.

Important reality:
- Chrome built-in AI APIs are environment-dependent and not universally available.
- The Prompt and Rewriter APIs are still evolving and may require Chrome versions, origin trials, or hardware conditions depending on the API and release track.
- This starter therefore falls back cleanly instead of pretending those routes always exist.

### 3. Remote endpoint
If you set a remote endpoint in the options page, the extension can route complex upgrades there.

Configurable settings:
- **Remote endpoint URL** — must be `https://` or `http://` (validated on save)
- **Remote API key** — sent as `Bearer` token in the `Authorization` header
- **Remote model label** — informational label for your endpoint
- **Request timeout** — how long to wait before falling back to heuristic (1000–60000ms, default 8000)

Expected request shape:

```json
{
  "draft": "raw user draft",
  "context": {
    "provider": "chatgpt",
    "url": "https://chatgpt.com/...",
    "title": "page title"
  },
  "response_schema": "prompt_upgrader_v1"
}
```

Expected response shape:
- must match the `PromptUpgradeResult` contract used in `src/schema.js`
- if the response fails schema validation, the extension falls back to heuristic and surfaces the specific violations in the side panel


### Routing model (v0.3 milestone 1)
Routing is now an explicit policy ladder with a decision label for each branch:

1. `local-only` privacy mode always blocks remote routes (`policy-local-only` / `policy-local-only-fallback`).
2. `cloud-preferred` with a configured endpoint always chooses remote (`policy-cloud-preferred`).
3. Complex build/research drafts can route remote in hybrid mode (`complex-task-remote`).
4. If built-in AI capability probes pass, local AI is used (`local-fast-path`).
5. If local AI is unavailable but a remote endpoint exists, remote is used (`remote-availability-fallback`).
6. Otherwise, heuristic fallback is used (`heuristic-only`).

Built-in API probing does **not** trust symbol presence alone. It now verifies method shape (`availability` + `create`) and probes runtime availability with short-lived caching.

Remote routing hardening includes timeout + abort behavior, HTTP status checks, JSON content-type validation, transport error classification (`timeout`, `network`, `http_status`, `invalid_content_type`, `invalid_json`, `invalid_payload`), and schema validation of remote responses with diagnostic output.

## Project structure
- `manifest.json` - extension manifest
- `src/service-worker.js` - orchestration, routing, commands
- `src/provider-core.js` - provider inference, selector plans, candidate scoring, writeback verification helpers
- `src/provider-adapters.js` - ChatGPT/Gemini adapter layer for editable-target detection
- `src/content-script.js` - orchestration for capture/writeback using provider adapters
- `src/engines.js` - local/remote/heuristic engine routing
- `src/heuristic-engine.js` - always-available prompt transformation fallback
- `src/schema.js` - upgrade result schema validation with multi-error collection
- `src/utils.js` - shared utilities (debounce)
- `sidepanel/` - persistent review/apply UI
- `options/` - settings UI

## Test harness
- Sanitized provider fixtures live in `tests/fixtures/chatgpt-compose.html` and `tests/fixtures/gemini-compose.html`.
- `tests/provider-adapters-dom.test.cjs` validates adapter target selection against realistic prompt-field decoys.
- `tests/engines-routing.test.js` validates route decisions, remote contract, schema repair, timeout propagation, and URL validation.
- `tests/schema.test.js` validates the upgrade result schema validator itself (happy path, individual fields, multi-error, edge cases).
- `tests/utils.test.js` validates the debounce utility (delay, cancellation, timer reset, repeated usage).
- Run all tests via:

```bash
npm test
```

29 tests total (7 adapter/core, 7 routing/remote, 10 schema, 5 utility).

## Important limitations
This is a strong starter, not a finished product.

It still needs:
- broader fixture coverage for provider UI variants (mobile layouts, A/B experiments, localization changes)
- richer provider adapters as provider UIs evolve
- production telemetry
- active remote endpoint health checking (currently validate-on-save only)
- a hardened remote backend if you want cloud quality
- stricter security review and store-prep work

## Build intent
This starter is based on a product direction where the highest-value action is:

**capture rough prompt -> upgrade it -> replace it in the same page**

That is the thing worth making excellent.
