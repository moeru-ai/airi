# Visual Chat Context And Records

## One Session, One Context Path

Visual Chat now uses one fixed context path:

1. the selected camera or screen source provides the latest live frame
2. typed text is stored as explicit user turns
3. manual `Observe` produces a visible assistant reply
4. `Continuous Observation` updates a hidden rolling scene memory instead of adding noisy assistant turns
5. every visible assistant reply reads:
   - the latest live frame
   - recent dialogue history
   - the rolling scene memory
6. every auto-observation pass reads:
   - the newest live frame
   - the current rolling scene memory
   - no visible dialogue replay

This keeps the public conversation readable while still preserving continuity across repeated scene questions.

## Output Hygiene

- worker output is sanitized before display
- system instructions explicitly forbid exposing hidden reasoning or internal prompts
- when the scene is uncertain, the assistant should say it is uncertain instead of inventing details

## Record Storage

Each visual chat session is persisted under the visual chat data directory:

- `metadata.json`: title, summary, timestamps, rolling scene memory, and the scene-memory timeline shown in the settings page
- `messages.json`: persisted dialogue turns

These records are used for:

- restoring previous conversations
- showing saved conversations in the settings page
- continuing a prior session with the same `sessionId`

