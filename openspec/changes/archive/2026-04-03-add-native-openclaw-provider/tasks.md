## 0. Prerequisites and provider entry metadata

- [x] 0.1 Confirm whether an OpenClaw icon exists in the current icon sets; if not, choose an approved fallback icon or iconImage strategy for the provider catalog entry.

## 1. Provider definition and request mapping

- [x] 1.1 Add a native `openclaw` provider definition under `packages/stage-ui/src/libs/providers/providers/openclaw/` and register it in the existing provider registry.
- [x] 1.2 Define the OpenClaw config schema with `baseUrl`, `apiKey`, `agentId`, `sessionStrategy` (`auto` / `manual`), and `apiMode` (`chat_completions` / `responses`), including safe defaults and field metadata for settings UI.
- [x] 1.3 Implement OpenClaw request mapping so chat requests can target `openclaw`, `openclaw/default`, and `openclaw/<agentId>` as supported agent-target formats, while keeping any underlying model override separate from the agent target.
- [x] 1.4 Add a centralized OpenClaw request/response normalization layer inside `packages/stage-ui/src/libs/providers/providers/openclaw/` that can switch between chat-completions and responses endpoints without changing the provider type, including a placeholder code path for `responses` mode.
- [x] 1.5 Add OpenClaw branding metadata for the provider entry, including icon / iconImage selection and provider copy consistent with existing provider catalog patterns.
- [x] 1.6 Extend the OpenClaw normalization layer so the native provider can carry tool definitions, tool-call payloads, and tool results through the chat-completions path while keeping a tool-calling-ready placeholder for `responses` mode.

## 2. Validation, model listing, and session continuity

- [x] 2.1 Implement OpenClaw-specific config validation and runtime validation for `/v1/models` plus a minimal chat probe, following the Ollama-style pattern of custom `validateConfig` plus reused `createOpenAICompatibleValidators()` provider checks.
- [x] 2.2 Add OpenClaw-aware validation errors that distinguish disabled HTTP API, connectivity failures, authorization failures, and invalid agent routing from generic unknown errors.
- [x] 2.3 Implement `extraMethods.listModels` in `packages/stage-ui/src/libs/providers/providers/openclaw/index.ts` so `/v1/models` results are treated as agent targets and mapped into `ModelInfo` consistently through the provider store bridge, including how `id`, `name`, and `description` communicate that these entries are agent targets rather than generic models.
- [x] 2.4 Document and wire the confirmed AIRI-side source of truth for OpenClaw session continuity, using `chatSession.activeSessionId` as the first-release session identifier source and aligning it with the existing `conversationId` convention.
- [x] 2.5 Implement `sessionStrategy` handling so the chosen AIRI conversation identity maps stably to `user`, `x-openclaw-session-key`, or both across repeated turns.
- [x] 2.6 Implement the per-request header injection path by combining an Azure-style custom fetch wrapper for transport rewriting with chat-pipeline `StreamOptions.headers` injection for dynamic session- or override-dependent headers.

## 3. Settings UI and user guidance

- [x] 3.1 Expose the OpenClaw provider in provider selection and editing flows, ensuring it is presented as a dedicated provider rather than a generic OpenAI-compatible endpoint.
- [x] 3.2 Add OpenClaw-specific field labels, descriptions, placeholders, and provider copy in `packages/i18n` for configuration, validation, and troubleshooting states.
- [x] 3.3 Surface operator-safety guidance in the settings experience, including localhost/private-network recommendations and the high-trust nature of the token.
- [x] 3.4 Ensure the current provider/model selection UI can present OpenClaw agent targets without breaking existing providers, and decide whether shared types such as `ModelInfo` need a minimal extension or descriptive fallback to distinguish agent targets from generic models.

## 4. Streaming and verification

- [x] 4.1 Connect the OpenClaw provider to the existing chat streaming pipeline and verify streaming works in the default chat-completions mode.
- [x] 4.2 Add focused tests for config validation, including valid config, missing `baseUrl`, missing `apiKey`, invalid enum values, and invalid agent-target input handling.
- [x] 4.3 Add focused tests for model listing and validation failures, including normal `/v1/models` responses, empty results, network failures, unauthorized responses, and disabled HTTP API cases.
- [x] 4.4 Add focused tests for session continuity and request mode switching, including stable auto session mapping, manual session mapping, chat-completions endpoint selection, responses endpoint selection, and dynamic header injection behavior.
- [x] 4.5 Run the required verification commands, including `pnpm typecheck`, `pnpm lint:fix`, and targeted tests or smoke checks covering the OpenClaw provider path.
- [x] 4.6 Add coexistence tests with unit-test-first coverage using `vi.mock`, verifying that the native OpenClaw provider does not implicitly delegate back into `delegate_openclaw_task`, while non-OpenClaw providers keep the existing bridge path available.
- [x] 4.7 Add focused native tool-calling tests with unit-test-first coverage using `vi.mock`, including forwarding tool definitions, handling tool-call continuations, preserving the same conversation across tool results, and keeping `responses` mode tool-calling-ready without forcing a full implementation in the first release.
