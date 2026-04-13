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

## Remaining limitations
1. Adapters still rely on DOM heuristics and need regression tests against provider snapshots.
2. Contenteditable handling can still break if provider editors radically change event contracts.
3. No telemetry/diagnostics yet for field-detection failures in the wild.
4. Manifest permissions should still be reviewed before store submission.
