# Prompt Enhancer V3 — Clarity Engine

A Chrome MV3 extension that turns a rough request into an explicit, reviewable goal before compiling a model-ready prompt.

The product loop is now:

```text
capture rough request
  → identify the real goal and desired outcome
  → interpret ambition signals such as “master” or “the best”
  → expose assumptions and material ambiguity
  → optionally collect focused clarification answers
  → compile a lean prompt
  → replace the draft in ChatGPT or Gemini
```

The extension never auto-sends.

## Why V3 exists

V2 primarily classified and reformatted prompts. V3 treats prompt quality as a goal-understanding problem.

The engine distinguishes between:

- **material ambiguity** — a missing detail that could substantially change the result
- **ambition signals** — language such as “master”, “ultimate”, “professional”, or “production-grade” that raises the quality bar but is not itself a specification
- **optional preference gaps** — details that can be handled with a transparent default instead of interrupting the user

The side panel shows **What I think you mean** before showing the compiled prompt.

## Providers

V3 supports:

- OpenAI through the Responses API with strict structured output
- OpenRouter through Chat Completions with strict JSON Schema output
- a managed/custom endpoint
- an honest deterministic clarity fallback when no API provider is configured or a request fails

Default OpenAI model: `gpt-5.6-terra`. Change this to `gpt-5.6-sol` for maximum capability or `gpt-5.6-luna` for lower-cost, high-volume use.

## Privacy and API keys

For private development, provider keys can be stored in Chrome local storage on the device. They are not stored in synced settings.

For a public release, do not distribute a shared provider key in the extension. Use:

```text
extension → authenticated backend → OpenAI/OpenRouter
```

The backend should handle authentication, rate limiting, usage metering, request validation and secret management.

## Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open the extension settings and configure OpenAI, OpenRouter or a managed endpoint.
6. Open ChatGPT or Gemini and write a rough request.
7. Trigger the extension using the toolbar, inline button or `Alt + Shift + U`.

## Core files

- `src/clarity-provider.js` — OpenAI, OpenRouter and managed provider adapters plus the strict clarity schema
- `src/heuristic-engine.js` — deterministic goal extraction and ambiguity classification
- `src/engines.js` — provider selection, fallback and schema repair
- `src/service-worker.js` — capture, run, refinement and optional local history orchestration
- `sidepanel/` — interpretation-first review and clarification workflow
- `options/` — provider, model, reasoning and clarification settings

## Validation

```bash
npm install
npm test
```

The existing provider DOM fixtures remain in place because prompt capture and replacement are still the highest-fragility browser surfaces.

## Current limitations

- Direct BYOK storage is suitable for private testing, not the final hosted product architecture.
- Provider model availability and structured-output support can differ on OpenRouter.
- The clarification loop recompiles from the original request plus answers; persisted Responses API reasoning is not yet used.
- Live ChatGPT and Gemini composer DOMs should be rechecked before a Chrome Web Store release.
