## Context

AIRI 現在的 chat provider 架構主要圍繞「model provider」語意建構，`packages/stage-ui/src/libs/providers/providers/openai-compatible/index.ts` 等實作也預設把 `/v1/models` 視為一般模型清單，並以通用 OpenAI-compatible validators 做連線與聊天探測。這對一般 OpenAI-compatible 服務成立，但對 OpenClaw 會產生語意偏差：OpenClaw 的 `model` 代表 agent target，而非單純底層模型名稱；此外它還把 session continuity、custom headers、Responses API 與 agent routing 放在同一個相容層之上。

repo 內同時已存在一條完整的 OpenClaw tool-call bridge 路線：`packages/stage-ui/src/tools/openclaw.ts` 會把 `delegate_openclaw_task` 注入到 `packages/stage-ui/src/stores/llm.ts` 的 tools 集合，再透過 spark:command / server channel 把任務送往 `openclaw-bridge` plugin，並使用 `conversationId` 與 result waiting 機制維持委託生命週期。這條路線的語意是「AIRI 或其他 chat provider 為主，OpenClaw 作為被委託的工具 / 執行通道」；而本變更的原生 provider 路線則是「OpenClaw 本身作為 chat provider」。兩者用途、憑據邊界、session continuity 與失敗模式都不同，因此必須在設計上明確區分，而不能只視為同一件事的不同 UI 包裝。

倉庫內已存在一條 service-side OpenClaw bridge 路線，並在文件中明確指出 OpenClaw API 目前同時提供 `/v1/models`、`/v1/chat/completions`、`/v1/responses` 與 session key / model override 等能力。這代表 renderer 端若要新增原生 provider，不應只是複製 `openai-compatible` provider 再換名字，而需要把「agent-aware provider」的語意明確建模，同時避免與既有 bridge 文件在 agent id、session key、API mode 與安全提示上出現漂移。

此變更的相關利害關係人包括：
- 使用者：需要能在設定頁直接配置 OpenClaw，並理解它是 agent provider 而不是普通模型供應商。
- `stage-ui` provider 基礎設施：需要在不破壞既有 provider 的前提下容納 OpenClaw 特有欄位與行為。
- 文件與後續實作者：需要一個與 OpenClaw 官方 HTTP API 相符、且能向 Responses API 演進的穩定整合點。

這份設計文件對應的驗收契約將以 `specs/openclaw-provider/spec.md` 中的 example-driven scenarios 與 example tables 為準；也就是說，validation、agent routing、session continuity、streaming 與安全提示等設計決策，都必須能直接覆蓋那些代表性範例，而不只是停留在抽象能力描述。

另外，repo 內已歸檔的 service-side 路線 `openspec/changes/archive/2026-04-02-airi-openclaw-integration/design.md` 已經定義了一條「由 AIRI server / bridge 代理 OpenClaw」的方案。本變更不是要推翻那條路線，而是補上一條 renderer-side native provider 路徑，兩者必須在術語、session key、agent target、API mode 與安全提示上保持一致。

## Goals / Non-Goals

**Goals：**
- 在現有 provider registry 中新增原生 `openclaw` provider，讓 AIRI 可以直接對接 OpenClaw 的 OpenAI-compatible HTTP API。
- 讓 provider 設定、驗證、model list、聊天與串流流程理解 OpenClaw 的 agent-aware routing 語意。
- 為 AIRI session 與 OpenClaw session continuity 建立穩定映射規則，避免多輪對話在 provider 層漂移。
- 在 UI 與文案上明確區分 agent target、underlying model override 與 API mode，並保留往 Responses API 演進的空間。
- 將 OpenClaw 的安全約束顯式呈現在設定與錯誤訊息中，例如 HTTP API 可能預設未啟用、建議使用 localhost / private network、token 屬於 operator-level credential。
- 讓原生 OpenClaw provider 在既有 AIRI tool-calling pipeline 中保有可用的工具能力，同時避免與 `delegate_openclaw_task` bridge 工具形成語意重疊或自我委託循環。

**Non-Goals：**
- 不在此變更中重寫 AIRI 既有 chat orchestration、memory、persona shaping 或 service-side OpenClaw bridge。
- 不在此變更中導入 OpenClaw Gateway WebSocket protocol、approval event UI、agent lifecycle 視覺化或 multi-agent 面板。
- 不在此變更中把所有 provider UI 全面改造成 agent-first；首版只為 OpenClaw provider 補足必要語意與擴充點。
- 不要求首版完整落地 OpenClaw 所有 Responses API 特性，例如 tool lifecycle、structured output UI、previous_response_id 狀態回放面板。
- 不在此變更中重新設計 AIRI 全域 tool system；此變更只處理 OpenClaw 作為原生 provider 時必須支援的 native tool-calling 邊界與最小整合。

## Decisions

1. **以新 provider 而非擴充通用 OpenAI-compatible provider 落地 OpenClaw**
   OpenClaw 應以獨立 `openclaw` provider 存在於 `packages/stage-ui/src/libs/providers/providers/`，而不是在 `openai-compatible` provider 上以說明文字或祕密 header 方式「偽裝」。這樣可以把 OpenClaw 專屬設定欄位、驗證邏輯、agent list 正規化、session 策略與未來 Responses API 路徑集中在同一個邊界。

   考慮過的替代方案：
   - 直接沿用 `openai-compatible` provider，只靠 `baseUrl` 與手動 model name 輸入接入 OpenClaw。
   - 在 `openai-compatible` 上增加一個 `providerFlavor=openclaw` 的進階選項。

   前者會把 agent target 誤導成普通模型名稱，後者則會把愈來愈多 OpenClaw 特例塞進通用 provider，增加維護成本與 UI 混亂。

2. **沿用既有 provider registry / zod schema / validator 架構，但為 OpenClaw 補上專屬欄位與錯誤語意**
   OpenClaw 應遵循現有 `defineProvider`、`createProviderConfig`、`validationRequiredWhen` 與 `validators` 模式，以降低整體改動面。設定欄位至少包括：`baseUrl`、`apiKey`、`agentId`、`sessionStrategy`、`apiMode`，其中 `apiMode` 預設 `chat_completions`，並保留 `responses` 作為可配置選項。

   驗證流程應分成兩層：
   - 設定層：檢查 base URL、apiKey、agentId 與 enum 欄位。
   - 執行層：探測 `/v1/models` 與最小化聊天請求，並把「HTTP API 未開啟」、「連不到服務」、「agent target 無效」等錯誤轉成可理解的訊息。

   在技術策略上，這裡應優先採用 **composite reuse + override**：以 `createOpenAICompatibleValidators()` 為基礎，重用既有 config check、connectivity check、chat probe 與 cache / mutex 行為，再透過 `connectivityFailureReason`、`modelListFailureReason`、`additionalHeaders`、必要時的 OpenClaw 專屬 `validateConfig` 或 `validateProvider` 補足錯誤語意。只有當現有 hook 無法表達需求時，才新增完全獨立的 validator，而不是從零複製整套 OpenAI-compatible 驗證管線。

   考慮過的替代方案：
   - 完全複用 `createOpenAICompatibleValidators()` 而不覆寫任何行為。
   - 只驗證 `/v1/models`，跳過聊天探測。

   第一種做法無法正確表達 OpenClaw 特有錯誤；第二種則無法在設定階段提早發現 session/header/chat path 的兼容性問題。

3. **將 `/v1/models` 的結果視為 agent target 清單，而不是底層模型清單**
   OpenClaw provider 的 `listModels` 應把 `/v1/models` 視為 agent selector 的資料來源，至少能正確處理 `openclaw`、`openclaw/default`、`openclaw/<agentId>` 等 target。實作上必須顯式提供 `extraMethods.listModels`，而不是依賴 `converters.ts` 的 generic fallback，這樣才能控制 `id`、`name`、`description` 如何表達「這是 agent target，不是底層模型」。UI 首版可先沿用既有 model selection 元件，但顯示文案與描述必須明確告知此處實際是在選 agent target，而不是 provider model catalog。

   考慮過的替代方案：
   - 完全隱藏 model list，只讓使用者手動輸入 agentId。
   - 直接把 `/v1/models` 原樣當底層模型清單呈現。

   前者會降低可發現性；後者會讓使用者誤以為 OpenClaw 是一般模型 API，與官方語意相衝突。

4. **session continuity 由 AIRI session 穩定映射到 OpenClaw `user` 或 `x-openclaw-session-key`**
   為了讓 multi-turn continuity 穩定，OpenClaw provider 應明確定義 session 映射策略：
   - `auto`：以 AIRI 現有 session / conversation identity 產生穩定值，優先映射到 `x-openclaw-session-key`，必要時同步帶入 `user`。
   - `manual`：允許使用者在設定中自行提供明確 session key 或關閉自動映射。

   此策略要封裝在 provider 層，而不是散落在 UI 或各聊天呼叫點，避免後續 streaming、retry、Responses API 切換時 session 行為不一致。

   考慮過的替代方案：
   - 只使用 `user` 欄位，不處理 header。
   - 每次請求都重新生成隨機 session key。

   前者在官方 session routing 語意下不夠明確；後者則會直接破壞多輪 continuity。

5. **per-request headers 採用「custom fetch wrapper + chat pipeline dynamic headers」雙層模式**
   `ProviderDefinition.createProvider()` 建立出的 provider instance 會被快取，因此不能把每次請求才知道的 session 狀態直接塞進靜態 provider config。最可行的方案是參考 `packages/stage-ui/src/libs/providers/providers/azure-openai/index.ts` 的 custom fetch wrapper 做法：
   - provider wrapper：仿照 Azure OpenAI 的 `fetch` 包裝模式，處理 OpenClaw transport 層的 request/response 重寫、固定 auth header、endpoint mode 切換，以及任何與當前請求 body 相關但不依賴全域 session 狀態的轉換；
   - chat pipeline call-site：利用 `packages/stage-ui/src/stores/llm.ts` 已支援的 `options.headers`，在每次送出請求時注入真正依賴當前 AIRI session / conversation identity 的動態 headers，例如 `x-openclaw-session-key`、`x-openclaw-model`。

   這樣可以保持 provider definition 的職責清晰，同時避免把 session 狀態快取進 provider instance，導致跨 session 污染。

   考慮過的替代方案：
   - 只在 provider wrapper 中做所有 header 注入。
   - 只在 chat pipeline 直接拼接所有 OpenClaw 特例。

   第一種不易拿到每次請求的最新 session 狀態；第二種則會把 OpenClaw 特例散落到通用 chat pipeline，增加耦合。Azure OpenAI 的 custom fetch wrapper 提供了 transport mutation 的既有先例，而 `stores/llm.ts` 則提供了動態 headers 的現成注入點，兩者組合最符合現有基礎設施。

6. **首版聊天執行以 chat completions 為主，但 provider 介面需預留 Responses API 路徑**
   OpenClaw 官方同時支援 `/v1/chat/completions` 與 `/v1/responses`。首版應預設走 `chat_completions`，因為它與既有 xsai / provider pipeline 的整合成本最低；但 `apiMode` 需成為正式設定欄位，並在實作上集中一個 request mapping 層，讓未來切換到 `responses` 時只需替換 endpoint、payload 與 response normalization，而不需要重寫整個 provider UI 與 session 邏輯。

   考慮過的替代方案：
   - 首版直接只做 Responses API。
   - 首版完全不暴露 `apiMode`，等未來再擴充。

   第一種風險較高，第二種則會讓設定模型與實作模型脫鉤，未來擴充時容易產生破壞性變更。

7. **native provider 必須支援 OpenClaw tool calling，並以原生 API 語意承接工具流程**
   當 OpenClaw 作為 active chat provider 時，AIRI 仍可能透過既有 `stores/llm.ts` pipeline 傳入 tools，因此 native provider 的 request/response normalization 必須能承接工具定義、tool call 回應與結果回寫，而不能因為 provider 是 OpenClaw 就直接失去 tool-calling 能力。首版可先以 `chat_completions` 的工具語意為主要對接面，並在 `responses` mode 保留對應 plumbing 與 placeholder path。

   這裡的重點是技術邊界：native provider tool calling 代表 OpenClaw API 原生支援的 tool semantics，應沿用 active chat conversation 的同一條 provider 路徑處理，而不是另開一條 bridge delegation 流程。

   考慮過的替代方案：
   - 原生 OpenClaw provider 完全不支援 tools。
   - 只保留 `delegate_openclaw_task`，把所有 OpenClaw tool 行為都視為 bridge tool。

   前者會削弱 OpenClaw 作為 agent-first provider 的價值；後者則會混淆原生 provider tool semantics 與 service-side delegation 邊界。

8. **OpenClaw 專屬 header 與安全提示必須顯式建模，而不是隱藏在 request 魔法字串中**
   OpenClaw 的 `Authorization`、`x-openclaw-session-key`、`x-openclaw-model` 等 header 會直接影響 routing 與安全性。這些欄位必須由明確的設定或推導邏輯產生，並在 UI / 驗證訊息中顯示風險說明，例如 token 為 operator-level credential，服務應優先部署在 localhost 或 private network，且 HTTP API 可能預設為關閉。

   考慮過的替代方案：
   - 將所有 header 當成自由輸入 key-values。
   - 把安全說明只留在 README，不進入 UI。

   第一種會使 session / model override 失去約束；第二種則會讓設定失敗時缺乏就地可見的指引。

9. **validator 採用「自訂 config 檢查 + reuse OpenAI-compatible provider checks」的混合模式**
   OpenClaw 的驗證不應從零重寫整條驗證管線，而應參考 `packages/stage-ui/src/libs/providers/providers/ollama/index.ts` 的做法：針對 OpenClaw 額外欄位（例如 `agentId`、`sessionStrategy`、`apiMode`）自訂 `validateConfig`，同時重用 `createOpenAICompatibleValidators()` 產生的 connectivity / model-list / chat probe provider checks，再透過 OpenClaw 專屬 failure-reason hooks 補足錯誤語意。這樣能最大化重用現有 cache、schedule 與 chat-ping UI 行為，並把差異聚焦在 OpenClaw 特有語意上。

   考慮過的替代方案：
   - 完全複製一份 OpenAI-compatible validators 作為 OpenClaw 專用版本。
   - 完全不做 OpenClaw 專屬 config validator，只依賴通用 baseUrl/apiKey 檢查。

   前者維護成本太高；後者則會漏掉 agent id、api mode 與 session strategy 的合法性檢查。

10. **renderer-side native provider 與 service-side bridge / tool-call bridge 必須作為並存路線明確區分，且需避免自我委託迴圈**
   renderer-side native provider 適合使用者在本機或私網中直接把 AIRI 連到自己控制的 OpenClaw HTTP API，追求較少中介層、直接把 OpenClaw 當聊天 provider 使用的場景。service-side bridge 則適合 AIRI server 需要代理 OpenClaw、保護憑據、管理任務生命週期、保留 execution history ownership，或把 OpenClaw 作為工具 / 任務委託通道而非聊天主 provider 的場景。

   兩者可以同時存在，但必須避免被同一段 UI 文案或設定流程混為一談：native provider 是 provider catalog 中的一個 chat provider；bridge 是另一條服務側整合路徑；`tools/openclaw.ts` 則是把 bridge 暴露成 tool-call 入口。若同時啟用，應共享同一套 OpenClaw 術語與 request semantics，但不共享設定存放與生命週期 ownership。

   首版的 canonical 共存策略是：native provider 與 tool-call bridge 可以同時在產品中存在，但當 active chat provider 已經是 `openclaw` 時，預設應停用或隱藏 `delegate_openclaw_task`，避免形成「OpenClaw 經由 tool-call 再委託 OpenClaw」的自我呼叫循環。session continuity 也應先視為兩條獨立路徑：native provider 使用 `sessionStrategy` 與 HTTP headers；tool-call bridge 繼續使用既有 `conversationId` metadata。若未來需要共享 session，應作為後續專題，而不是首版隱式耦合。

   考慮過的替代方案：
   - 只保留 native provider，移除 bridge。
   - 只保留 bridge，拒絕 renderer-side direct connect。

   前者會破壞既有 service-side 方案；後者則無法滿足使用者自行配置原生 OpenClaw provider 的需求。若不加入避迴圈規則，則第三種失敗模式會是 native provider 與 tool-call bridge 同時啟用時產生自我委託循環。

## Risks / Trade-offs

- [OpenClaw API 持續演進，欄位語意可能漂移] → 以集中 request/response mapping 層隔離 OpenClaw 特例，避免把相容細節散落到 UI 與 store。
- [把 agent target 繼續當成普通模型，導致 UX 混亂] → 在 model list、文案與欄位命名中明確標示 agent / underlying model 的差異。
- [session continuity 不穩定，導致多輪對話漂移] → 以單一 session strategy 實作 header / user 映射，並在驗證與測試中涵蓋重複請求與串流場景。
- [Responses API 尚未完整接上，過早暴露會造成使用者期待落差] → 在首版將 `responses` 標記為 future-ready / experimental，並讓實際能力與文案一致。
- [OpenClaw native provider 缺少 tools 能力，導致 agent-first 價值打折] → 在首版至少保留 chat-completions tool semantics，並在 responses mode 保留可演進的 plumbing。
- [Operator-level token 暴露風險] → 將 token 欄位設為密碼型別，補充本機與私網部署提示，避免鼓勵公網直接暴露。
- [與既有 service-side OpenClaw bridge 文件漂移] → 直接沿用官方與 repo 既有 OpenClaw 術語，如 agent target、session key、chat completions、responses，並在文檔中明確說明兩條整合路徑的定位差異。
- [動態 header 注入點選錯，造成 provider 汙染或通用 pipeline 耦合] → 明確把固定 transport customization 留在 provider wrapper，把 session-dependent headers 留在 `stores/llm.ts` 等 call-site 注入層。
- [OpenClaw native provider 與既有 tool-call bridge 形成自我委託迴圈] → 在 active provider 為 `openclaw` 時停用或隔離 `delegate_openclaw_task`，並為共存情境補上回歸測試。

## Migration Plan

1. 新增 `openclaw` provider 定義、設定 schema、i18n 文案與 icon / 描述資訊。
2. 實作 OpenClaw 專屬 validator 與 model listing 邏輯，確認 `/v1/models`、最小聊天探測與常見錯誤原因可被正確呈現。
3. 將 request mapping、session strategy 與 streaming header 邏輯接入既有 chat provider pipeline。
4. 在設定 UI 中加入 OpenClaw provider 類型與欄位，確保既有 providers 不受影響。
5. 以 typecheck、lint、目標測試與實機 smoke test 驗證：validation、agent 切換、多輪 continuity、streaming。
6. 若上線後發生兼容問題，回滾方式為停用 `openclaw` provider 註冊，不動既有通用 OpenAI-compatible provider 與 service-side bridge。

## Confirmed First-Release Decisions

- **Session key source**：首版直接採用 `chatSession.activeSessionId` 作為 OpenClaw session continuity 的主要來源，並與既有 `conversationId` 慣例保持語意對齊。
- **Native provider 與 tool-call bridge 共存策略**：當 active chat provider 已經是 `openclaw` 時，首版預設停用或隱藏 `delegate_openclaw_task`，避免自我委託迴圈；非 OpenClaw provider 則維持既有 bridge 工具路徑。
- **Native provider tool calling rollout**：首版在 `chat_completions` 路徑下提供最小可用 tool calling；`responses` mode 保留 placeholder、normalization 與後續擴充入口，但不要求一次實作完整工具生命週期。

## Open Questions

- **Responses mode rollout depth** — owner: provider implementer；狀態：**non-blocking**。`apiMode=responses` 首版除了 placeholder 與 normalization 外，是否需要同步提供更完整的 Responses-specific tool/state 能力？傾向後續增量擴充，而非首版一次做完。
- **Agent wording in UI** — owner: UX / settings reviewer；狀態：**non-blocking**。OpenClaw provider 在 UI 中是否要立刻把「Model」文案改成「Agent」，還是先以描述文案過渡，等後續 agent-first UX 再全面調整？傾向首版先以描述文案與 field help 明確提示「這裡選的是 agent target」，後續再統一 UI 詞彙。
