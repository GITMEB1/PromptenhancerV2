# Architecture notes

## Current build shape
- MV3 extension
- content script for capture/writeback
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

## Next hardening steps
1. Replace generic DOM handling with stronger provider adapters
2. Add regression tests against real ChatGPT/Gemini DOM snapshots
3. Add remote endpoint with strict schema enforcement
4. Add metrics and diagnostic views
5. Review manifest permissions before any store submission
