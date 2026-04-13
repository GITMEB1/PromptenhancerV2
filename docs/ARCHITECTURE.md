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

## Known routing limitations
1. Built-in AI availability can change mid-session (flags/device constraints); cache is intentionally short-lived but still approximate.
2. Remote endpoint validation currently enforces JSON responses but does not perform deep schema-aware endpoint diagnostics.
3. Route decision heuristics still rely on lightweight task-type inference and complexity scoring, so niche prompts may route conservatively.
