## Why

AIRI 目前已支援一般 OpenAI-compatible providers，但 OpenClaw 的 `model` 實際上代表 agent target，且還承載 session routing、agent orchestration 與更進階的 Responses API 能力。若繼續把 OpenClaw 當成一般模型供應商，會讓多輪對話 continuity、不同行為模式的 UI 表達，以及後續進階能力整合都變得不穩定且語意錯位。

## What Changes

- 新增原生 `openclaw` chat provider，而不是沿用通用 OpenAI-compatible provider。
- 為 OpenClaw provider 增加專屬設定欄位：`baseUrl`、`apiKey`（對應 OpenClaw operator-level token）、`agentId`、`sessionStrategy`、`apiMode`。
- 新增 OpenClaw 專屬驗證流程，至少覆蓋 `/v1/models` 與最小化聊天探測，並對 HTTP API 未啟用、連線失敗、驗證失敗提供明確錯誤原因。
- 將 AIRI 對話請求映射為 OpenClaw agent target，預設以 `openclaw/{agentId}` 或等價 routing 語意呼叫 OpenClaw。
- 新增 OpenClaw session continuity 策略，讓 AIRI session 能穩定映射到 `user`、`x-openclaw-session-key` 或兩者。
- 在 provider UI 中加入 OpenClaw 類型與設定表單，並為後續 agent-first UX 與 underlying model override 預留擴充點。
- 首版以 chat completions 為預設傳輸模式，同時在設定與架構上保留切換到 Responses API 的能力。
- 在原生 OpenClaw provider 路線中保留並擴充 tool calling 能力，讓 OpenClaw 作為 chat provider 時也能承接工具定義、tool call 回應與後續結果整合。
- 明確分析並處理原生 OpenClaw chat provider 與既有 `packages/stage-ui/src/tools/openclaw.ts` tool-call bridge 的共存行為，避免出現「OpenClaw provider 再透過 OpenClaw tool 呼叫自己」的迴圈。
- 此 capability 的驗收將以 example-driven spec 進行，明確覆蓋 validation、agent routing、session continuity、streaming 與安全提示等代表性情境。

## Capabilities

### New Capabilities
- `openclaw-provider`: 讓 AIRI 以原生 provider 方式連接 OpenClaw 的 OpenAI-compatible HTTP API，支援 agent-aware routing、驗證、session continuity、聊天、tool calling 與串流回應。

### Modified Capabilities
- 無

## Impact

- 影響 `packages/stage-ui/src/libs/providers/providers/` 下的 provider 定義、`packages/stage-ui/src/libs/providers/validators/` 下的驗證流程，以及 model listing 流程。
- 影響 provider 設定 UI、provider selector / model selector 顯示方式，以及對 OpenClaw agent 的文案與使用者提示。
- 影響 `packages/stage-ui/src/stores/llm.ts` 與既有 chat / streaming pipeline，因為 OpenClaw session continuity 與 underlying model override 需要 per-request header injection。
- 影響既有 tools / tool-calling pipeline，因為原生 OpenClaw provider 需要明確定義 native tool calling 與 `delegate_openclaw_task` bridge 工具之間的界線與避迴圈規則。
- 影響 `packages/stage-ui/src/tools/openclaw.ts` 與既有 spark:command → `openclaw-bridge` 整合路線，因為原生 provider 上線後必須明確定義兩條 OpenClaw 路徑的共存與避迴圈規則。
- 影響 i18n provider 文案、錯誤訊息與設定欄位描述。
- 需考慮與既有 OpenClaw bridge / docs 保持語意一致，避免 renderer 端原生 provider 與 service-side bridge 在 session、agent target 與 API mode 上出現漂移。
- 回滾策略為停用 `openclaw` provider 註冊，保留既有通用 OpenAI-compatible provider 與 service-side OpenClaw bridge 路徑不變。
