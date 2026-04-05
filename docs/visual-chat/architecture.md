# Visual Chat Architecture

## Six-Layer Architecture

```
+------------------------------------------------------------+
| Layer 6: Distribution & Observability                      |
| (visual-chat-ops, visual-chat-observability)               |
+------------------------------------------------------------+
| Layer 5: Output Adaptation                                 |
| (visual-chat-sdk, plugins, stage-visual-chat-ops)          |
+------------------------------------------------------------+
| Layer 4: Fixed Worker Backend                              |
| (visual-chat-worker-minicpmo -> ollama-lite)               |
+------------------------------------------------------------+
| Layer 3: Normalization & Scheduling                        |
| (visual-chat-runtime, visual-chat-gateway)                 |
+------------------------------------------------------------+
| Layer 2: Transport & Session                               |
| (AIRI session WS)                                          |
+------------------------------------------------------------+
| Layer 1: Signal Acquisition                                |
| (browser camera/screen, phone page, desktop page)      |
+------------------------------------------------------------+
```

## Fixed Worker Pipeline

- worker proxies `infer-stream` to Ollama
- gateway keeps persisted conversation history, the latest frame state, and a hidden rolling scene memory in AIRI
- AIRI presents one shared realtime conversation feed back to desktop and phone clients
- LiveKit token and webhook routes exist as optional integration surfaces, but they are not the primary media path for the current shipped desktop + phone flow

## Fixed Interaction Mode

- `vision-text-realtime`
- The current shipped path is realtime screen/camera frame streaming plus typed text prompts.
- Native duplex audio transport is intentionally not enabled in `ollama-lite` mode.

## Context Engineering

The fixed context path is intentionally narrow:

1. user turns are persisted as explicit dialogue messages
2. manual `Observe` produces a visible assistant reply
3. `Continuous Observation` updates a hidden rolling scene memory instead of appending public assistant chatter
4. every user-visible inference reads:
   - the latest active frame
   - recent dialogue history
   - the rolling scene memory
5. auto-observation does not replay dialogue history; it only refreshes the hidden rolling scene memory
6. scene memory updates are deduplicated before persistence so unchanged notes are not re-fed as fresh context
7. worker output is sanitized before it is shown

This keeps the visible conversation readable while still giving the model continuity across source switches and repeated scene questions.

## Record Management

- Every session writes metadata and `messages.json` under the visual chat data directory.
- Metadata also stores a persisted scene-memory timeline so users can inspect what private continuity notes were saved.
- Session records survive process restarts.
- Restoring a saved conversation recreates an active AIRI session with the same `sessionId`.
- The settings page shows saved conversations and lets the user continue one directly.

## Data Flow

1. Desktop and phone clients publish camera and screen data into the AIRI session websocket.
2. The AIRI gateway keeps session state, merges sources, maintains persisted dialogue history, and updates rolling scene memory.
3. The gateway selects the active frame from the currently chosen input source.
4. The worker sends that frame, the text turn, recent dialogue history, and the rolling scene memory instructions into the fixed Ollama model path.
5. AIRI broadcasts response chunks back to subscribed clients and persists completed dialogue turns.
