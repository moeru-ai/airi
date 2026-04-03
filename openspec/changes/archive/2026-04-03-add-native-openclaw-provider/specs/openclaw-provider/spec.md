## ADDED Requirements

### Requirement: OpenClaw provider configuration
The system SHALL expose a native `openclaw` provider configuration that models OpenClaw as an agent-aware chat provider rather than a generic OpenAI-compatible provider.

| Example | Input | Expected outcome |
|---|---|---|
| Minimal valid config | `baseUrl=http://localhost:18789`, `apiKey=token`, default values | Provider can be saved as `openclaw` with `agentId=default` and `apiMode=chat_completions` |
| Explicit agent config | `agentId=planner`, `sessionStrategy=auto` | Provider remains a native OpenClaw provider and routes to the planner agent |
| Manual continuity config | `sessionStrategy=manual` with explicit session key | Provider preserves the manual routing key instead of deriving one automatically |

#### Scenario: User configures required OpenClaw fields
- **WHEN** the user selects the `openclaw` provider in AIRI settings
- **THEN** the system SHALL expose configuration fields for `baseUrl`, `apiKey`, `agentId`, `sessionStrategy`, and `apiMode`

#### Scenario: OpenClaw uses safe defaults
- **WHEN** a new `openclaw` provider configuration is created
- **THEN** the system SHALL default `agentId` to `default`
- **AND** the system SHALL default `apiMode` to `chat_completions`

#### Scenario: Default config maps to the default agent
- **WHEN** a user saves an OpenClaw provider without changing the default `agentId`
- **THEN** the provider configuration SHALL remain valid with `agentId=default`
- **AND** subsequent chat requests SHALL be eligible to target `openclaw/default`

#### Scenario: OpenClaw is distinguished from generic providers
- **WHEN** the OpenClaw provider is displayed in provider selection or editing UI
- **THEN** the system SHALL identify it as a dedicated provider type instead of labeling it as a generic OpenAI-compatible endpoint only

### Requirement: OpenClaw provider validation
The system SHALL validate an OpenClaw provider using OpenClaw-aware connectivity and chat probes.

| Example | Probe result | Expected outcome |
|---|---|---|
| HTTP API enabled | `/v1/models` reachable, minimal chat probe succeeds | Validation passes |
| HTTP API disabled | `/v1/models` returns setup error | Validation fails with setup guidance |
| Unauthorized token | `/v1/models` or chat probe returns 401/403 | Validation fails with credential-specific reason |
| Network unreachable | Connection timeout or DNS failure | Validation fails with connectivity-specific reason |

#### Scenario: Connectivity probe checks model endpoint
- **WHEN** the user validates an OpenClaw provider configuration
- **THEN** the system SHALL perform a connectivity check against `/v1/models`

#### Scenario: Chat probe verifies minimal request path
- **WHEN** the user validates an OpenClaw provider configuration
- **THEN** the system SHALL perform a minimal chat probe against the configured OpenClaw chat endpoint

#### Scenario: Validation reports HTTP API availability failures clearly
- **WHEN** OpenClaw rejects validation because its HTTP API is disabled, unreachable, or unauthorized
- **THEN** the system SHALL return a failure result with a provider-facing reason that distinguishes those causes from generic unknown errors

#### Scenario: Validation fails when HTTP API is disabled
- **WHEN** `/v1/models` responds with an OpenClaw setup error indicating that the HTTP API is not enabled
- **THEN** validation SHALL fail
- **AND** the returned reason SHALL instruct the user to enable the OpenClaw HTTP API instead of reporting a generic network error only

#### Scenario: Validation fails when credentials are rejected
- **WHEN** `/v1/models` or the minimal chat probe returns an unauthorized response
- **THEN** validation SHALL fail
- **AND** the returned reason SHALL indicate that the configured `apiKey` is missing, invalid, or unauthorized

### Requirement: Agent-aware request routing
The system SHALL route AIRI chat requests to OpenClaw using agent-aware target mapping.

| Example | AIRI config / input | Expected OpenClaw routing |
|---|---|---|
| Default agent | `agentId=default` | Request targets `openclaw/default` or equivalent supported default target |
| Named agent | `agentId=planner` | Request targets `openclaw/planner` or equivalent supported target |
| Backend override | `agentId=planner`, override model=`gpt-4.1` | Agent target stays `planner`; override is sent separately |

#### Scenario: Agent target format is supported explicitly
- **WHEN** AIRI sends a chat request through the OpenClaw provider
- **THEN** the request SHALL support `openclaw`, `openclaw/default`, and `openclaw/<agentId>` as officially supported agent-target formats

#### Scenario: Default agent target is normalized consistently
- **WHEN** the configured agent is `default`
- **THEN** the provider SHALL normalize the chat request to a supported default-agent target format
- **AND** the system SHALL not require the user to handcraft a raw model id string

#### Scenario: Model list is treated as agent targets
- **WHEN** the OpenClaw provider loads entries from `/v1/models`
- **THEN** the system SHALL treat the returned ids as OpenClaw agent targets rather than as a generic underlying model catalog

#### Scenario: Underlying model override is separate from agent target
- **WHEN** the request includes an underlying model override
- **THEN** the system SHALL preserve the selected OpenClaw agent target
- **AND** the system SHALL send the override separately using the OpenClaw-supported override mechanism rather than replacing the agent target id

#### Scenario: Agent routing remains stable during model override
- **WHEN** the configured `agentId` is `planner` and the underlying model override is `gpt-4.1`
- **THEN** the request SHALL continue routing to the `planner` agent target
- **AND** the override SHALL be transmitted independently from the agent target field

### Requirement: Session continuity mapping
The system SHALL provide stable OpenClaw session continuity for multi-turn AIRI conversations.

| Example | Conversation state | Expected continuity behavior |
|---|---|---|
| Auto strategy, repeated turns | Same AIRI session sends turn 1 and turn 2 | Both turns reuse the same derived continuity value |
| Manual strategy | Explicit session key=`team-room-1` | Requests keep using `team-room-1` |
| Session reuse | Same chat session reopened later | Provider continues using the same stable routing source unless user changes it |

#### Scenario: Auto session strategy derives stable routing value
- **WHEN** the OpenClaw provider is configured with `sessionStrategy=auto`
- **THEN** the system SHALL derive a stable per-conversation routing value from the AIRI session or conversation identity

#### Scenario: Session continuity is sent to OpenClaw
- **WHEN** AIRI sends consecutive turns through the same OpenClaw-backed conversation
- **THEN** the system SHALL send the derived continuity value using `user`, `x-openclaw-session-key`, or both according to the configured strategy

#### Scenario: Auto strategy keeps consecutive turns on the same session
- **WHEN** the same AIRI conversation sends two or more consecutive turns with `sessionStrategy=auto`
- **THEN** those turns SHALL reuse the same derived continuity value
- **AND** the provider SHALL not generate a new random session identifier for each turn

#### Scenario: Manual session strategy preserves explicit keying
- **WHEN** the OpenClaw provider is configured with a manual session strategy
- **THEN** the system SHALL preserve the user-specified session routing behavior instead of silently falling back to a new random session identifier per request

#### Scenario: Manual session key is preserved exactly
- **WHEN** the provider is configured with `sessionStrategy=manual` and an explicit session key such as `team-room-1`
- **THEN** repeated requests SHALL continue using `team-room-1`
- **AND** the provider SHALL not overwrite it with an auto-derived value

### Requirement: Streaming and API mode readiness
The system SHALL support OpenClaw streaming behavior for the default chat-completions path and remain extensible to Responses API mode.

| Example | Mode / request | Expected outcome |
|---|---|---|
| Default streaming | `apiMode=chat_completions`, streaming enabled | Incremental events flow through the existing AIRI streaming pipeline |
| Responses switch | Existing provider changed to `apiMode=responses` | Same provider record is reused and requests route through `/v1/responses` |
| Non-streaming fallback avoided | OpenClaw provider with supported streaming endpoint | Provider stays streaming-capable and is not downgraded just because it is OpenClaw |

#### Scenario: Chat completions remains the default mode
- **WHEN** the user does not explicitly change the API mode
- **THEN** the OpenClaw provider SHALL send requests through the chat-completions path

#### Scenario: Streaming works through the selected OpenClaw mode
- **WHEN** AIRI requests a streaming response from the OpenClaw provider
- **THEN** the provider SHALL preserve streaming behavior supported by the configured OpenClaw API mode

#### Scenario: Chat completions streaming remains incremental
- **WHEN** `apiMode=chat_completions` and AIRI requests a streaming reply
- **THEN** the provider SHALL forward incremental streaming events through the existing AIRI streaming pipeline
- **AND** the response SHALL not be downgraded to a non-streaming request solely because the provider is OpenClaw

#### Scenario: Responses mode remains a supported provider option
- **WHEN** the user selects `apiMode=responses`
- **THEN** the system SHALL route the request through the OpenClaw Responses API path without requiring the provider to be redefined as a different provider type

#### Scenario: Responses mode preserves provider identity
- **WHEN** the user switches an existing OpenClaw provider from `chat_completions` to `responses`
- **THEN** the provider record SHALL remain the same provider type
- **AND** the system SHALL change the transport path without requiring the user to recreate the provider configuration

### Requirement: OpenClaw native provider supports tool calling
The system SHALL preserve tool-calling capability when OpenClaw is used as the active native chat provider.

| Example | Native provider state | Expected tool behavior |
|---|---|---|
| Chat-completions tools | `apiMode=chat_completions`, tools enabled | Tool definitions are sent through the native OpenClaw provider path |
| Tool call result | OpenClaw emits a tool call and receives tool output | AIRI continues the response using the same native provider conversation |
| Responses placeholder | `apiMode=responses` | Provider keeps a tool-calling-ready normalization path even if full responses tooling is phased in later |

#### Scenario: Native provider forwards tool definitions
- **WHEN** AIRI invokes the native OpenClaw provider with tools enabled
- **THEN** the provider SHALL forward tool definitions through the selected OpenClaw API mode instead of silently dropping them

#### Scenario: Native provider processes tool call continuation
- **WHEN** OpenClaw requests a tool call and AIRI obtains the corresponding tool result
- **THEN** the system SHALL continue the same OpenClaw-backed conversation with the returned tool result instead of treating it as a disconnected second request

#### Scenario: Responses mode remains tool-calling-ready
- **WHEN** the OpenClaw provider is configured with `apiMode=responses`
- **THEN** the provider SHALL retain a request/response normalization path that can carry tool-related payloads even if the first release only enables a minimal subset of Responses features

### Requirement: OpenClaw security and operator guidance
The system SHALL surface OpenClaw-specific operational guidance when users configure or validate the provider.

| Example | User context | Expected guidance |
|---|---|---|
| Editing credentials | User opens OpenClaw auth settings | UI explains `apiKey` is an operator-level secret |
| Validation failure | Endpoint reachable but misconfigured | UI shows setup / deployment guidance instead of opaque generic error |
| Reviewing connection setup | User edits base URL and network settings | UI recommends localhost or private-network exposure over public internet exposure |

#### Scenario: Operator credential risk is disclosed
- **WHEN** the user views or edits OpenClaw authentication settings
- **THEN** the system SHALL indicate that the token is an operator-level credential or equivalent high-trust secret

#### Scenario: Network deployment guidance is visible
- **WHEN** validation fails or the user reviews OpenClaw setup guidance
- **THEN** the system SHALL provide guidance that localhost or private-network deployment is recommended over public exposure

#### Scenario: Security guidance is shown during configuration
- **WHEN** the user edits OpenClaw connection settings
- **THEN** the UI SHALL present guidance that OpenClaw is intended for localhost or private-network exposure
- **AND** the UI SHALL avoid implying that public internet exposure is the recommended default

### Requirement: Native provider coexistence with the existing OpenClaw bridge
The system SHALL define deterministic coexistence rules between the native OpenClaw chat provider and the existing `delegate_openclaw_task` bridge path.

| Example | Active path combination | Expected outcome |
|---|---|---|
| Native provider active | Active chat provider=`openclaw` | The existing OpenClaw tool path is disabled or isolated to avoid self-delegation loops |
| Non-OpenClaw provider active | Active chat provider=`openai`, OpenClaw bridge available | Tool-call delegation to `openclaw-bridge` continues working as before |
| Shared terminology | Both routes visible in product | UI and troubleshooting copy distinguish native chat provider vs. delegated bridge path |

#### Scenario: Native OpenClaw provider avoids self-delegation
- **WHEN** the active chat provider is the native `openclaw` provider
- **THEN** the system SHALL prevent `delegate_openclaw_task` from creating an implicit OpenClaw-to-OpenClaw delegation loop by default

#### Scenario: Native tool calling remains distinct from bridge delegation
- **WHEN** the native OpenClaw provider handles ordinary tool-calling within the active chat conversation
- **THEN** the system SHALL treat that flow as native provider tool calling
- **AND** it SHALL not reinterpret it as a spark:command bridge delegation unless the user or implementation explicitly opts into the bridge route

#### Scenario: Existing bridge path remains available for other providers
- **WHEN** the active chat provider is not `openclaw`
- **THEN** the existing spark:command → `openclaw-bridge` delegation path SHALL remain available according to current tool-calling rules

#### Scenario: Session continuity remains route-specific
- **WHEN** both the native provider route and the bridge route exist in the product
- **THEN** the native provider SHALL keep using its own `sessionStrategy`-driven continuity mapping
- **AND** the bridge route SHALL continue using its existing delegated `conversationId` metadata unless a future shared-session design is explicitly introduced
