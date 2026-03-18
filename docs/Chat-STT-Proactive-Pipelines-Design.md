# AIRI Interaction Pipelines

Documentation of the three primary surfaces for LLM ingestion and interaction.

## 1. Chat UI Pipeline
- **Surface**: `packages/stage-layouts/src/components/Widgets/ChatArea.vue`
- **Trigger**: Direct text input by the user through the chat box.
- **Tools**: `widgetsTools` (passed via props/orchestrator).
- **Execution**: Calls `chatStore.ingest(text, options)`.
- **Inscription**: Handled by `performSend` in `chatStore.ts` which adds the message to the current session history and triggers the assistant response (unless `skipAssistant: true`).

## 2. Microphone Pipeline (STT -> LLM)
- **Surface**: `apps/stage-tamagotchi/src/renderer/pages/index.vue` and `apps/stage-web/src/pages/index.vue`.
- **Trigger**: Voice activity detection (VAD) or manual microphone trigger.
- **Flow**:
  1. `hearingPipeline.transcribeForMediaStream` processes audio.
  2. `onSentenceEnd(delta)` callback receives the transcription.
  3. Transcription is posted to the caption overlay broadcast channel.
  4. Calls `chatStore.ingest(text, { tools: widgetsTools, ... })`.
- **Tools**: Specifically registered `widgetsTools` in both desktop and web VAD handlers.
- **Note**: Both the main page and the `ChatArea` component can listen for speech events. Coordination is needed to avoid duplicate ingestion.

## 3. Proactivity Pipeline (Heartbeat -> LLM)
- **Surface**: `packages/stage-ui/src/stores/proactivity.ts`
- **Trigger**: Periodic heartbeat check (based on idle time or sensor changes).
- **Tools**: Dynamic registration via `proactivityStore.registerTools(tools)`. Built-in tools are registered in `App.vue` (Tamagotchi).
- **Execution**: Direct call to `llmStore.generate(model, provider, messages, { tools, supportsTools: true })`.
- **Context**: Injected sensor data (location, time, computer metrics) into the prompt to evaluate if the agent should proactively interact.
- **Multi-step**: Supported via `maxSteps: 10` in `llmStore.generate` to allow complex tool-use logic during heartbeats.
