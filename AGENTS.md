# PromptenhancerV2 Agent Instructions

## Project purpose
Build a Chrome MV3 extension that reliably performs the core loop: capture rough prompt -> upgrade it -> replace it in the same ChatGPT/Gemini page.

## Scope boundaries
- Prioritize content-script capture/writeback reliability and adapter architecture.
- Keep changes incremental and testable; avoid broad redesigns outside the current milestone.

## No fake AI
- Do not claim model capabilities that are unavailable in-browser.
- Keep heuristic fallback and route behavior explicit and honest in code/docs.

## No auto-send
- Never auto-submit prompts/messages after writeback.
- Replacement must only update the editable field content.

## Minimal permissions
- Avoid adding new extension permissions unless strictly required.
- Prefer least-privilege host and API usage.

## Validation expectations
- Run narrow, relevant checks for changed areas.
- Add/maintain targeted tests for pure logic where practical.
- Keep docs aligned with implemented behavior and known limitations.
