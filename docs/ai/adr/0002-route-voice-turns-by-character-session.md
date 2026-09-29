# Route turns by character session

Status: accepted

Each turn belongs to one character session. Changing the selected character does not change a turn that is already active.
Different sessions can generate text together. Requests within one session remain ordered.

The runtime reads character settings when a queued turn starts and before each later model request.
Each request keeps its resolved provider configuration. Media projection uses that configuration and preserves stored recordings and transcripts.

Chat hooks carry the session ID. Cross-window events use this ID instead of the window selection.
Chat surfaces select their stream from the session map. Cancellation affects only the specified session.

Each speech turn keeps its character and voice settings. A new turn cancels speech only within its own chat session.
A character selection change does not cancel another character's speech.

`ensureSessionForCharacter(characterId)` resolves a canonical session without changing the visible session.
Concurrent callers share creation through the synchronized authority. Account changes invalidate pending resolution.
