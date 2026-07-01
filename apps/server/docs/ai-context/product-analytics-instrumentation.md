# Product Analytics Instrumentation Plan（产品埋点与数据播报方案）

这份文档把 AIRI 当前埋点现状、社区侧最关心的问题、缺口、事件 schema、看板和异常播报整理到一处。它补充 [`metrics-ownership.md`](./metrics-ownership.md)：后者定义指标归属和命名规则，本文定义“为了回答产品/社区问题，接下来要补什么”。

## TL;DR

- 现在已经能看 activation、Provider 配置次数、国家来源、付费漏斗、LLM 请求和服务端 TTS 请求健康。
- 现在还不能可靠回答“用户最常用哪个 TTS 音色 / Voice Pack”，因为前端和服务端事件都缺稳定的 `voice_id` / `voice_type` / `voice_pack_id`。
- 最优先补的不是更多点击，而是“能不能开始聊天”“卡在哪个配置步骤”“语音 / TTS 为什么失败”。
- 官方 Provider 要和自配置 Provider 分开看，核心判断是官方路径是否提高 activation、降低配置失败和缩短首次聊天时间。
- 自配置用户可能更高价值，不能只看失败率；需要同时看 retention、paid conversion 和 feedback rate。
- PostHog 负责用户路径、漏斗、留存和分群；Grafana 负责服务端健康和异常；Postgres / SQL 负责高基数字段聚合，例如 voice / voice pack。
- Prometheus 不要加 `voice_id`、`voice_pack_id`、用户自定义模型名等高基数字段。
- 日报先做“指标 + 异常提醒”，周报再加入社区侧解释和下周行动建议。
- Discord / QQ 反馈要有轻量标签，不能完全靠埋点替代社区观察。

## 背景

社区反馈里最常见的劝退点集中在：

- 性能问题
- 模型 / Provider 配置复杂
- 配置失败或模型列表加载失败
- Bug 多，用户不知道卡在哪
- 语音输入体验不稳定

产品方向是降低上手门槛，让 AIRI 更开箱即用；官方 Provider 已经上线，但仍有一部分用户喜欢自配置模型和音色。社区侧同时关心海外用户、付费用户、二次开发用户、角色聊天用户，以及愿意反馈问题的用户。

因此埋点目标不是单纯统计点击，而是回答：

1. 新用户有没有正常开始聊天？
2. 用户卡在 Provider / 模型配置的哪一步？
3. 官方 Provider 是否真的降低了上手门槛？
4. 自配置用户和官方 Provider 用户在留存、付费、反馈上有什么差异？
5. TTS 音色和提供商到底怎么被选择、试听和实际使用？
6. Bug、性能、语音输入失败分别造成了多少流失？

## 现状审计

### PostHog

线上 `Project AIRI (Web)` 已有核心 dashboard：`My App Dashboard`。

已覆盖：

- first message 趋势
- Provider 配置次数
- 国家来源
- Signup activation funnel
- 7-day activation retention
- Paywall conversion
- LLM request volume / error rate
- rage-click friction

近 7 天仍活跃的主要产品事件包括：

- `app_loaded`
- `first_message_sent`
- `first_model_selected`
- `model_switched`
- `message_send_started`
- `llm_request_started`
- `llm_first_token`
- `message_round`
- `chat_session_started`
- `chat_session_selected`
- `chat_message_deleted`
- `chat_messages_cleared`
- `pricing_page_viewed`
- `plan_selected`
- `checkout_started`
- `provider_card_clicked`
- `stt_started`
- `stt_succeeded`
- `stt_failed`
- `tts_stop_clicked`
- `character_switched`
- `character_deleted`

PostHog 当前缺口：

- 没有 `voice_id`、`voice_pack_id`、`voice_type` 等 TTS 音色维度。
- 近 30 天匹配 `tts` / `speech` / `voice` 的客户端事件里，`voice`、`voice_id`、`voiceId`、`voice_pack_id`、`voice_type` 均未出现有效值。
- `model` / `model_id` 仍有自由文本风险，需要收敛白名单和脱敏策略。
- PostHog 漏斗主要覆盖前端旅程，服务端 TTS 真实请求没有同步进入 PostHog。

### Grafana / Prometheus

线上 `AIRI Server Overview` 已覆盖：

- DAU / WAU / MAU
- Active sessions
- HTTP / WS health
- Product Analytics：event volume、failure rate、top product actions、event rate
- LLM Gateway：request rate by model、latency、provider failure
- TTS Characters/s by Model
- Stripe / revenue

Grafana 当前能回答：

- TTS 请求量、成功量、失败量、余额挡住量。
- TTS 字符消耗按 model 聚合，例如 `stepfun/stepaudio-2.5-tts`、`volcengine/seed-tts-2.0`、`alibaba/cosyvoice-v1`。
- 服务端 `product_events` 的 Prometheus label 当前包括 `feature`、`action`、`status`、`source`，再加部分 metric 的 `model` / `provider`。

Grafana 当前不能回答：

- 哪个 TTS 音色使用最多。
- 哪个 Voice Pack 使用最多。
- 官方默认音色与用户自选音色的转化差异。
- 试听音色后是否真的绑定 / 使用。

## 用户分群

第一版不要求用户手动选 persona，先从行为推断。

| Segment | 初始推断规则 | 用途 |
|---|---|---|
| `new_user` | 账号创建后 7 天内或首次 `app_loaded` 后 7 天内 | 新手引导、激活漏斗 |
| `official_provider_user` | 关键事件里 `provider_mode = official` | 衡量开箱即用效果 |
| `custom_provider_user` | 关键事件里 `provider_mode = custom` | 衡量自配置门槛和失败率 |
| `role_chat_user` | 导入 / 切换角色、绑定音色、频繁角色聊天 | 角色陪伴体验 |
| `developer_user` | 使用插件、API、Devtools、二开相关入口 | 二次开发群体 |
| `paid_user` | Stripe / Postgres 付费状态为真 | 付费转化与保留 |
| `feedback_user` | 提交 bug report / feedback | 高价值社区用户 |

公共字段建议：

| Field | Values | Notes |
|---|---|---|
| `surface` | `web` / `desktop` / `mobile` | 所有关键前端事件必带 |
| `provider_mode` | `official` / `custom` / `unknown` | 官方开箱即用 vs 用户自配置 |
| `provider_id` | 白名单 ID | 不传 raw URL / raw key / 用户输入 |
| `model_id` | 白名单或归一化后的 ID | 自定义模型用 `is_custom_model = true` |
| `is_custom_model` | boolean | 避免把任意文本当 group-by |
| `is_paid_user` | boolean | 从服务端或 PostHog person profile 派生 |
| `setup_completed` | boolean | 是否完成基础配置 |
| `region` | PostHog geo | 不由客户端手动传 |

## P0 埋点

### Chat Activation

目标：社区侧判断“能正常开始聊天”。

| Event | Owner | Truth | When |
|---|---|---|---|
| `chat_activation_started` | frontend | PostHog | 用户进入首次聊天路径或点击发送第一条消息前 |
| `chat_activation_succeeded` | frontend | PostHog | 首次消息完成并看到 assistant response |
| `chat_activation_failed` | frontend | PostHog | 首次消息未完成，包含配置、网络、鉴权、余额、模型等失败 |
| `official_provider_selected` | frontend | PostHog | 官方 Provider 被默认落地或在设置页被手动选择，记录 provider id 与是否自动选择 |
| `second_turn_started` | frontend | PostHog | 同一会话开始第二轮对话 |

字段：

| Field | Required | Notes |
|---|---|---|
| `provider_mode` | yes | `official` / `custom` |
| `provider_id` | yes | 归一化 ID |
| `model_id` | yes | 归一化 ID |
| `surface` | yes | web / desktop / mobile |
| `time_to_first_message_ms` | success only | 从 app start 或 onboarding complete 到首次成功 |
| `error_code` | failed only | 稳定错误码 |
| `failure_stage` | failed only | `provider_config` / `model_list` / `message_send` / `llm_response` / `tts` |
| `turn_index` | second turn only | 固定为 `2`，用于首轮成功后的二轮启动 |
| `auto_selected` | official provider only | 官方默认 Provider 自动落地时为 `true` |

推荐看板：

- 新用户 `chat_activation_started -> chat_activation_succeeded` 漏斗。
- 按 `provider_mode` 拆分 activation conversion。
- `chat_activation_failed` 按 `failure_stage` / `provider_id` 排名。

异常提醒：

- 新用户 activation conversion 24h 环比下降超过 15%。
- `provider_mode = official` 的 activation failure 上升，优先排查官方 Provider。

### Provider And Model Configuration

目标：定位配置复杂和失败劝退。

| Event | Owner | Truth | When |
|---|---|---|---|
| `provider_config_started` | frontend | PostHog | 打开 Provider 配置表单 |
| `provider_config_succeeded` | frontend | PostHog | 配置保存并通过最小校验 |
| `provider_config_failed` | frontend | PostHog | 保存、校验、鉴权或连接测试失败 |
| `model_list_loaded` | frontend | PostHog | 模型列表加载成功 |
| `model_list_failed` | frontend | PostHog | 模型列表加载失败 |

字段：

| Field | Required | Notes |
|---|---|---|
| `provider_id` | yes | 归一化 ID |
| `provider_mode` | yes | 官方 Provider 也要记录 |
| `step` | yes | `open_form` / `save` / `validate` / `load_models` / `select_model` |
| `duration_ms` | no | 保存或加载耗时 |
| `error_code` | failed only | 不能写 raw error message |
| `http_status` | failed only | 有 HTTP 边界时记录 |

推荐看板：

- Provider 配置成功率。
- 模型列表加载成功率。
- Top failing providers。
- 官方 Provider vs 自配置 Provider 配置耗时和失败率。

异常提醒：

- `model_list_failed` 任一 Provider 1h 内增长超过 2 倍。
- 官方 Provider `provider_config_failed` 非零连续 15 分钟。

### TTS Voice And Provider

目标：回答“用户选择了哪种音色和提供商”。

| Event | Owner | Truth | When |
|---|---|---|---|
| `tts_provider_selected` | frontend | PostHog | 用户选择或切换 TTS Provider |
| `voice_selected` | frontend | PostHog | 用户选择音色，包括官方默认落地时的 baseline |
| `voice_preview_played` | frontend | PostHog | 用户试听音色 |
| `voice_pack_bound` | frontend | PostHog | 用户把 Voice Pack 绑定到角色 |
| `official_tts_exposed` | frontend | PostHog | 官方 TTS 设置入口或激活入口被展示 |
| `official_tts_preview_started` / `official_tts_preview_succeeded` | frontend | PostHog | 官方 TTS 试听开始 / 成功 |
| `official_tts_auto_enabled` | frontend | PostHog | 聊天自动语音实际触发官方 TTS |
| `speech_requested` | server | Postgres/Grafana | REST / WS TTS 请求开始；沿用现有 `feature = tts` action |
| `speech_succeeded` | server | Postgres/Grafana | REST / WS TTS 交付成功；沿用现有 `feature = tts` action |
| `speech_failed` | server | Postgres/Grafana | TTS 上游、配置、路由失败；沿用现有 `feature = tts` action |
| `speech_blocked` | server | Postgres/Grafana | Flux 不足等业务阻断；沿用现有 `feature = tts` action |

字段：

| Field | Required | Notes |
|---|---|---|
| `tts_provider_id` | yes | 归一化 ID |
| `tts_model_id` | yes | 归一化 ID |
| `voice_id` | yes | 官方 catalog ID；自定义音色见数据卫生 |
| `voice_type` | yes | `official_default` / `official_selected` / `custom_configured` / `voice_pack` |
| `voice_pack_id` | no | Voice Pack 绑定和服务端使用时记录 |
| `source` | yes | `settings` / `onboarding` / `chat_auto_tts` / `manual_preview` |
| `trigger` | server TTS | `auto` / `manual` |
| `input_chars` | server TTS | 字数 |
| `duration_ms` | server TTS | 端到端耗时 |
| `error_code` | failed only | 稳定错误码 |

推荐看板：

- Top voices by `voice_selected`。
- Top voices by server `feature = tts` + `action = speech_succeeded`。
- Voice preview to selection conversion。
- Official default vs official selected vs custom configured。
- TTS failure / blocked rate by provider, model, voice type。

异常提醒：

- 某个官方音色的 server `speech_failed` 持续上升。
- `voice_preview_played -> voice_selected` 转化下降。
- server `speech_blocked` 突增，提示 Flux 或默认策略可能影响体验。

### Voice Input

目标：语音输入是明确社区痛点，需要把权限、设备和 Provider 失败拆开。

当前已有：

- `stt_started`
- `stt_succeeded`
- `stt_failed`

补充：

| Event | Owner | Truth | When |
|---|---|---|---|
| `voice_input_started` | frontend | PostHog | 用户开始语音输入 |
| `microphone_permission_requested` | frontend | PostHog | 首次或重新请求麦克风权限 |
| `microphone_permission_denied` | frontend | PostHog | 权限被拒绝 |
| `audio_device_unavailable` | frontend | PostHog | 无设备、设备被占用、采样失败 |
| `voice_input_cancelled` | frontend | PostHog | 用户主动取消或超时 |

字段：

| Field | Required | Notes |
|---|---|---|
| `stt_provider_id` | yes | 归一化 ID |
| `surface` | yes | web / desktop / mobile |
| `duration_ms` | no | 用户按住或录音时长 |
| `error_code` | failed only | `permission_denied` / `device_unavailable` / `provider_error` / `timeout` |

推荐看板：

- Voice input start -> STT success funnel。
- Permission denied rate by browser / surface。
- STT failure rate by Provider。

### Feedback And Bug Reports

目标：社区侧认为“愿意反馈问题”是高价值行为，应进入核心指标。

| Event | Owner | Truth | When |
|---|---|---|---|
| `bug_report_opened` | frontend | PostHog | 打开 bug report dialog |
| `bug_report_submitted` | frontend/server | PostHog + Postgres optional | 成功提交 |
| `feedback_submitted` | frontend/server | PostHog + Postgres optional | 非 bug 的反馈 |
| `community_feedback_tagged` | manual/job | Postgres optional | Discord / QQ 反馈被人工归类 |

字段：

| Field | Required | Notes |
|---|---|---|
| `source` | yes | `app` / `discord` / `qq` / `github` / `email` / `other` |
| `category` | no | 见下方社区反馈标签 |
| `severity` | yes | `blocker` / `major` / `minor` / `suggestion` |
| `user_type` | yes | `new_user` / `paid_user` / `overseas_user` / `developer_user` / `role_chat_user` / `unknown` |
| `entrypoint` | yes | `about_update_error` / `community_manual_tag` 等低基数入口 |
| `surface` | in-app | web / desktop / mobile |
| `provider_mode` | no | 可从最近一次配置状态补齐 |
| `description_length_bucket` | bug report | `empty` / `short` / `medium` / `long`，不要上传正文 |
| `include_triage_context` | bug report | 是否附带页面上下文 |
| `screenshot_attached` | bug report | 是否附带截图或录屏 |

推荐看板：

- Feedback users count。
- Bug report trend by category。
- 配置失败后 24h 内是否反馈。

社区反馈标签建议：

| Category | 适用反馈 |
|---|---|
| `performance` | 卡顿、慢、首 token 慢、内存 / CPU 异常 |
| `provider_config` | Provider 配置复杂、保存失败、Key / Endpoint 不知道怎么填 |
| `model_list` | 模型列表加载失败、模型不可选、模型名不符合预期 |
| `crash` | 崩溃、白屏、不可恢复异常 |
| `ui_ux` | UI 操作不顺、按钮找不到、信息表达不清 |
| `voice_input` | 麦克风权限、录音、STT、语音输入失败 |
| `tts` | TTS 音色、试听、Voice Pack、音色绑定问题 |
| `payment` | Flux、余额不足、付费、checkout、扣费疑问 |
| `chat_activation` | 新手无法开始聊天、首次发送失败、开箱即用失败 |
| `live2d` | Live2D / 模型显示 / 角色舞台问题 |
| `desktop_window` | 桌宠窗口、置顶、显示器、多屏问题 |
| `mobile` | iOS / Android / 移动端体验 |
| `unknown` | 信息不足，待社区负责人二次归类 |

社区侧现在可以这样做：

1. Discord / QQ 反馈先人工记录，不等 App 内入口完善。
2. 每条反馈只需要填：日期、来源、用户类型、分类、严重程度、原文链接、简短摘要、是否已转 issue。
3. 原文和截图留在 Discord / QQ / issue，不进 PostHog；PostHog 只放标签和计数。
4. 每周把 `category` + `severity` 聚合进周报，用来解释为什么某个指标变差。

## P1 埋点

### Onboarding

当前 `onboarding_step_completed` 不足以定位用户卡点。

补充：

- `onboarding_started`
- `onboarding_step_viewed`
- `onboarding_step_completed`
- `onboarding_skipped`
- `onboarding_failed`

字段：

- `step`
- `time_spent_ms`
- `provider_mode`
- `provider_id`
- `error_code`

看板：

- Onboarding step drop-off。
- 官方 Provider onboarding conversion。
- Skip 后是否仍完成 `chat_activation_succeeded`。

### Chat Reliability

补充：

- `message_send_failed`
- `assistant_response_failed`
- `generation_cancelled`
- `generation_retried`
- `response_regenerated`

字段：

- `model_id`
- `provider_id`
- `provider_mode`
- `has_voice`
- `latency_ms`
- `error_code`
- `surface`

看板：

- Message send success rate。
- Retry / cancel rate。
- Failure by provider and model。

### Character And Role Usage

补充：

- `character_created`
- `character_imported`
- `character_edited`
- `character_switched`
- `character_deleted`
- `display_model_changed`
- `voice_pack_bound`

字段：

- `character_type`: `built_in` / `imported` / `custom`
- `has_voice`
- `voice_type`
- `surface`

看板：

- Character adoption。
- 角色用户与普通聊天用户 retention / payment 差异。

### Payment And Flux Friction

当前已有 `pricing_page_viewed`、`plan_selected`、`checkout_started`，服务端有 payment truth。补充：

- `flux_low_warning_shown`
- `flux_topup_clicked`
- `checkout_failed`
- `payment_completed_imported`

字段：

- `surface`
- `balance_state`
- `plan_id`
- `currency`
- `error_code`

注意：

- `payment_completed` 真相仍在 Postgres / Stripe webhook。
- PostHog 只用于漏斗展示，优先用 Stripe connector 或离线导入。

## 事件复用关系

新增埋点时先复用现有事件，不要把相同事实拆成多个名字。

| Existing / New | Relationship | Notes |
|---|---|---|
| `first_message_sent` | 保留历史指标 | 继续用于老 dashboard；新激活口径用 `chat_activation_succeeded` |
| `chat_activation_started` / `chat_activation_succeeded` / `chat_activation_failed` | 新核心 activation 口径 | 用来回答“用户能不能正常开始聊天” |
| `provider_card_clicked` | 保留入口点击 | 不等于配置成功；成功 / 失败看 `provider_config_succeeded` / `provider_config_failed` |
| `first_model_selected` / `model_switched` | 保留模型选择行为 | 配置链路和模型列表健康看 `model_list_loaded` / `model_list_failed` |
| `stt_started` / `stt_succeeded` / `stt_failed` | 保留 STT Provider 结果 | 权限和设备问题用新增 `microphone_*` / `audio_device_unavailable` 拆开 |
| `tts_stop_clicked` | 保留用户停止行为 | 不代表音色选择；音色选择用 `voice_selected` |
| `speech_requested` / `speech_succeeded` / `speech_failed` / `speech_blocked` | 服务端 TTS truth | 继续沿用 `feature = tts`，只补 metadata 字段 |
| `pricing_page_viewed` / `plan_selected` / `checkout_started` | 保留付费漏斗前段 | 真正 payment completed 仍以 Stripe / Postgres 为准 |
| `paywall_seen` | 付费漏斗入口 | 用 `flux_balance_bucket` 分层，不上报精确余额 |

## 数据卫生

### 不要把自由文本直接作为分析维度

PostHog 线上已经能看到 `model` / `model_id` 存在自由文本风险。后续新增字段必须遵循：

- Provider、model、voice 使用稳定 ID。
- 自定义值不要直接 group-by。
- 自定义模型传：
  - `provider_id = custom`
  - `model_family = custom`
  - `is_custom_model = true`
  - `custom_model_hash` 可选，必须单向 hash，不能还原原文。
- 自定义 voice 传：
  - `voice_type = custom_configured`
  - `voice_id = custom`
  - `custom_voice_hash` 可选，必须单向 hash。
- 错误字段传稳定 `error_code`，不要传 raw error message。

### 字段基数约束

| Field | Cardinality | Rule |
|---|---|---|
| `provider_id` | low | 白名单 |
| `provider_mode` | low | enum |
| `model_id` | medium | 官方 catalog 或归一化 ID |
| `voice_id` | medium | 官方 catalog 或 `custom` |
| `voice_pack_id` | medium | 只进 PostHog / Postgres，不进 Prometheus label |
| `error_code` | low | enum |
| `source` | low | enum |
| `surface` | low | enum |

Prometheus label 不放 `user_id`、`session_id`、`voice_pack_id`、自定义模型名、自定义音色名。

### 不要做什么

- 不要把用户输入、聊天正文、角色 prompt、raw API key、raw Endpoint、raw model name、raw voice name 发到 PostHog / Grafana。
- 不要把 raw error message 作为分析字段；统一映射成稳定 `error_code`。
- 不要在 Prometheus label 里加入 `voice_id`、`voice_pack_id`、`session_id`、`user_id`、自定义模型名、自定义音色名。
- 不要为了看一个 funnel 同时新增两个语义相同的事件；优先查上面的事件复用关系。
- 不要在请求主链路里同步等待 PostHog 发送完成；失败不能影响用户聊天 / TTS。
- 不要只看点击量判断用户意图；至少结合 success / failed / blocked 和社区反馈标签。

## 看板建议

### PostHog

新建或扩展 dashboard：`Onboarding and Activation`

- 新用户 activation funnel：
  - `app_loaded`
  - `chat_activation_started`
  - `provider_config_succeeded`
  - `model_list_loaded`
  - `chat_activation_succeeded`
- Official vs custom Provider activation split。
- Provider configuration failure ranking。
- Onboarding step drop-off。

新建 dashboard：`Voice and TTS Adoption`

- Top voices by selected users。
- Top voices by successful TTS requests。
- Voice preview -> selection conversion。
- Official default vs selected vs custom configured。
- Voice input start -> STT success funnel。

扩展 `My App Dashboard`

- 保留现有 activation、paywall、LLM、rage-click。
- 增加 `chat_activation_succeeded`、`provider_config_failed`、`stt_failed`、`voice_selected` 摘要卡。

### Grafana

扩展 `AIRI Server Overview`

- TTS request / success / failed / blocked by source。
- TTS character total by model over range。
- Product action failure rate by feature/action。

不要在 Prometheus 增加 `voice_id` label。若要看音色排行：

- Postgres `product_events.metadata.voice_id` 做 SQL / admin API 聚合。
- 或离线导入 PostHog，用 PostHog group-by 展示。

## 播报、分析和可视化方案

### 分层原则

播报要分三层，不要把所有指标塞进一个 dashboard。

| Layer | Frequency | Audience | Goal | Tool |
|---|---|---|---|---|
| 实时异常 | 5m - 1h | 工程 / on-call / 社区负责人 | 发现“今天是不是坏了” | Grafana alert + PostHog insight alert |
| 日报 | daily | 社区 / 产品 / 工程 | 看上手、聊天、语音、付费是否正常 | PostHog + Grafana + 少量 SQL |
| 周报 | weekly | 产品 / 战略讨论 | 看趋势、用户意图、投入方向 | PostHog cohort/funnel + SQL 聚合 |

工具分工：

| Tool | 用途 | 不适合做什么 |
|---|---|---|
| PostHog | 用户路径、漏斗、留存、分群、前端行为 | 服务端真实扣费、低延迟 on-call |
| Grafana | 服务端健康、TTS/LLM 请求、错误、余额阻断、告警 | 高基数用户行为和音色排行 |
| Postgres / SQL | 付费事实、`product_events.metadata`、voice / voice pack 聚合 | 实时看板和复杂前端路径 |
| Community tags | Discord / QQ 反馈归类 | 自动替代埋点 |

### 日报模板

日报回答“今天是否健康，有没有需要马上处理的问题”。

```md
# AIRI 数据日报 YYYY-MM-DD

## 核心状态

- DAU: <value> (<day-over-day>)
- New users: <value>
- Chat activation: <chat_activation_succeeded / chat_activation_started>
- Official provider activation: <value>
- Custom provider activation: <value>
- Paid conversion proxy: pricing -> plan -> checkout = <value>

## 上手和配置

- Top provider config failures:
  1. <provider_id> / <error_code> / <count>
  2. <provider_id> / <error_code> / <count>
- Model list failure rate: <value>
- New-user first-message median time: <value>

## 聊天与性能

- Message round success: <value>
- LLM first-token p95: <value>
- LLM / chat failures by provider:
  1. <provider_id> / <error_code> / <count>

## 语音与 TTS

- STT success rate: <value>
- Microphone permission denied: <value>
- TTS success / failed / blocked: <succeeded>/<failed>/<blocked>
- Top voices selected:
  1. <voice_id> / <users>
  2. <voice_id> / <users>
- Top voices used:
  1. <voice_id> / <successful_requests>
  2. <voice_id> / <successful_requests>

## 反馈与异常

- Bug reports: <value>
- Feedback submitted: <value>
- Discord / QQ 高关键词:
  - <category>: <count>
- 异常提醒:
  - <alert_name>: <current> vs <baseline>, 建议动作 <action>
```

第一版日报可以先不追求自动生成完整解释，只要自动填指标，并把异常规则命中的项放到“异常提醒”即可。

### 周报模板

周报回答“用户意图有什么变化，战略上要改什么”。

```md
# AIRI 数据周报 YYYY-WW

## 本周结论

1. <最重要趋势，例如 official provider 激活率上升>
2. <最大风险，例如 custom provider 配置失败仍高>
3. <建议动作，例如下周优先修 model list failed>

## 新手上手

- New users: <value>
- Activation funnel:
  - app_loaded -> chat_activation_started: <value>
  - chat_activation_started -> provider_config_succeeded: <value>
  - provider_config_succeeded -> chat_activation_succeeded: <value>
- Official vs custom:
  - official activation: <value>
  - custom activation: <value>
  - conclusion: <which path is healthier>

## 用户意图

- Role chat users: <value>
- Developer users: <value>
- Voice users: <value>
- Paid users: <value>
- Feedback users: <value>
- 海外用户占比: <value>

## 语音和音色

- Top selected voices: <voice_id list>
- Top used voices: <voice_id list>
- Default voice adoption: <value>
- Custom configured voice adoption: <value>
- Voice preview -> selected conversion: <value>
- TTS blocked / failed trend: <value>

## 配置和 Bug

- Top failing providers: <list>
- Top failing error codes: <list>
- Rage-click pages / surfaces: <list>
- Discord / QQ feedback categories:
  - performance: <count>
  - config: <count>
  - bug: <count>
  - voice_input: <count>

## 下周建议

- Product: <one action>
- Engineering: <one action>
- Community: <one action>
```

周报需要人工写“结论”和“建议动作”。指标只负责提示方向，社区反馈负责解释为什么。

### 可视化布局

#### Executive Overview

给产品 / 社区快速看：

- Activation conversion
- Official vs custom activation
- Provider config failures
- STT success rate
- TTS success / blocked
- Top voices selected / used
- Bug reports / feedback
- Paywall funnel

#### Onboarding And Activation

给负责上手体验的人看：

- Funnel：`app_loaded -> chat_activation_started -> provider_config_succeeded -> model_list_loaded -> chat_activation_succeeded`
- Breakdown：`provider_mode`、`surface`、`region`
- Table：Top `provider_config_failed` by `provider_id` / `error_code`
- Timeseries：`time_to_first_message_ms` p50 / p95

#### Voice And TTS Adoption

给语音和角色体验看：

- Bar：Top voices by selected users
- Bar：Top voices by successful TTS requests
- Funnel：`voice_preview_played -> voice_selected -> speech_succeeded`
- Timeseries：`speech_succeeded` / `speech_failed` / `speech_blocked`
- Breakdown：`voice_type` = official default / official selected / custom configured / voice pack

#### Reliability And Friction

给工程和社区排障看：

- Grafana：5xx、LLM latency、provider failure、TTS blocked
- PostHog：rage-click trend、failed frontend events
- Table：Top error_code by surface / provider
- Community tags：Discord / QQ 反馈分类趋势

### 分析方法

#### Official provider 是否降低门槛

看：

- `chat_activation_succeeded / chat_activation_started` by `provider_mode`
- `time_to_first_message_ms` by `provider_mode`
- `provider_config_failed` by `provider_mode`
- D7 retention by `provider_mode`

如果 official 激活率高、耗时短、失败率低，说明开箱即用策略有效。若 official 使用率高但失败率也高，优先修官方 Provider 稳定性。

#### 自配置用户是不是更高价值

看：

- `custom_provider_user` 的 D7 / D30 retention
- `custom_provider_user` 的 feedback rate
- `custom_provider_user` 的 paid conversion
- `custom_provider_user` 的 config failure rate

如果自配置用户付费和反馈更高，但失败率也高，可以把高级配置保留，但需要更好的错误提示和导入模板。

#### 哪些 Bug 最劝退

看：

- `chat_activation_failed` by `failure_stage`
- `provider_config_failed` by `error_code`
- `model_list_failed` by `provider_id`
- `$rageclick` by page / surface
- Discord / QQ `category = bug` 的高频词

日报只报异常；周报把异常和社区反馈合并成“优先修复建议”。

#### TTS 音色策略

看：

- `voice_selected` users by `voice_id`
- `speech_succeeded` count by `voice_id`
- `voice_preview_played -> voice_selected` conversion by `voice_id`
- `speech_failed / speech_requested` by `voice_id`
- retention / paid conversion by `voice_type`

用法：

- 选择多但使用少：可能试听不错，实际聊天不合适。
- 使用多但失败高：优先修该音色或 Provider。
- 默认音色使用高但切换少：默认可能足够好，也可能用户没发现入口，需要结合 `voice_preview_played` 看。
- 自定义音色用户留存高：说明高阶用户重视声音个性化。

### 自动化路线

第一阶段：半自动日报。

- Grafana 提供服务端健康和 TTS/LLM 指标。
- PostHog 提供 activation、provider、voice、STT、feedback 指标。
- SQL 提供 voice / voice pack 聚合。
- 由脚本生成 Markdown，发到 Discord / QQ / 飞书其中一个固定频道。

第二阶段：异常驱动播报。

- 每小时检查 activation、provider config、model list、STT、TTS blocked、bug report。
- 只有超过阈值才发提醒。
- 提醒里必须带“建议查看哪个 dashboard / query”。

第三阶段：周报带人工结论。

- 自动填指标和 Top lists。
- 社区负责人补充 Discord / QQ 反馈解释。
- 产品 / 工程共同确认下周行动。

## 异常播报

第一版日报 / 周报走“指标 + 异常提醒”。日报不要做复杂归因；周报允许加入人工结论。

### 每日必看指标

建议内容：

- DAU / WAU / MAU。
- New users。
- `chat_activation_succeeded` 转化率。
- Official vs custom Provider activation conversion。
- Top Provider config failures。
- STT success rate / failure rate。
- TTS success / failed / blocked。
- Top voices selected / used。
- Bug reports / feedback count。
- Paywall funnel：pricing -> plan -> checkout。

### 异常规则

| Alert | Trigger | Action |
|---|---|---|
| Activation drop | 24h `chat_activation_succeeded / chat_activation_started` 环比下降 15% | 查 Provider config / model_list / LLM failures |
| Official Provider regression | 官方 Provider `provider_config_failed` 连续 15 分钟非零或 24h 明显上升 | 优先排官方配置 |
| Model list failure spike | 任一 Provider `model_list_failed` 1h 翻倍 | 查 Provider API / auth / CORS |
| STT failure spike | `stt_failed / stt_started` 超过阈值 | 查权限、设备、Provider |
| TTS blocked spike | `feature = tts` + `action = speech_blocked` 1h 翻倍 | 查 Flux、默认音色成本、余额提示 |
| Bug report spike | `bug_report_submitted` 24h 翻倍 | 社区同步归类 |
| Rage-click spike | `$rageclick` 7d trend 异常 | 结合页面和 session replay |

## 实施顺序

### 分阶段落地

| Phase | Scope | Owner | 产出 |
|---|---|---|---|
| Phase 0 | 字段归一化、事件复用确认、敏感字段拦截 | frontend / server | 公共 helper、事件字典、测试用例 |
| Phase 1 | Chat activation、Provider / model 配置、TTS voice 字段 | frontend / server | 能回答“能不能开始聊天”和“哪个音色常用” |
| Phase 2 | Voice input、feedback、community tags | frontend / community | 能定位语音输入和社区反馈高频问题 |
| Phase 3 | PostHog / Grafana dashboard、半自动日报、异常提醒 | data / server / community | 每日播报和异常告警可用 |
| Phase 4 | 周报、cohort、retention、付费 / 反馈关联分析 | product / community / data | 支持战略复盘和下周优先级 |

### 任务顺序

1. 先补字段归一化 helpers，尤其是 Provider / model / voice。
2. 补 Chat Activation 三个事件。
3. 补 Provider / model 配置成功失败事件。
4. 补 TTS voice 选择、试听、Voice Pack 绑定事件。
5. 服务端 `product_events.metadata` 补 TTS `voice_id`、`voice_type`、`voice_pack_id`。
6. 补语音输入权限 / 设备事件。
7. 扩 PostHog dashboard。
8. 扩 Grafana dashboard，但不把 voice 放进 Prometheus label。
9. 建半自动日报 Markdown：PostHog + Grafana + SQL 聚合，先发固定频道。
10. 建异常检查：activation、provider config、model list、STT、TTS blocked、bug report。
11. 建周报模板：自动填指标，社区负责人补充 Discord / QQ 反馈解释和下周建议。

### 当前接入状态（2026-06-30）

已接入代码：

- Chat activation：`chat_activation_started`、`chat_activation_succeeded`、`chat_activation_failed`、`second_turn_started`；官方 Provider 选择事件为 `official_provider_selected`，实际聊天使用口径看 activation events 的 `provider_mode = official`。
- Model list：`model_list_loaded`、`model_list_failed`。
- Provider config：`provider_config_started`、`provider_config_succeeded`、`provider_config_failed`。
- TTS voice：`tts_provider_selected`、`voice_selected`、`voice_preview_played`、`voice_pack_bound`、`official_tts_exposed`、`official_tts_preview_started`、`official_tts_preview_succeeded`、`official_tts_auto_enabled`。
- TTS 服务端 metadata：REST / WS TTS `product_events.metadata` 已补 `voice_id`、`voice_type`、`voice_pack_id`、`block_reason`、`failure_reason`、`flux_balance_bucket`。
- Voice input：`voice_input_started`、`microphone_permission_requested`、`microphone_permission_denied`、`audio_device_unavailable`、`voice_input_cancelled`。
- STT：保留 `stt_started`、`stt_succeeded`、`stt_failed`，并将失败码收敛到稳定枚举，避免上报 raw error。
- Feedback：`feedback_submitted` / `bug_report_submitted` 的低基数字段与 analytics API 已定义；产品内反馈提交入口与服务端收件流程拆到单独 PR。
- Grafana Dashboard：`Product Analytics` 行已补 TTS success、TTS failed / blocked、TTS event rate by source、TTS blocked by reason、TTS blocked by Flux bucket 面板，并保留 voice drilldown 在 Postgres metadata / PostHog，不进入 Prometheus labels。
- Dashboard setup 文档：`product-analytics-dashboard-setup.md` 已补 PostHog insights、Grafana panels、PostHog / Grafana alert 配置建议。
- 上线冒烟文档：`verifications/product-analytics-smoke.md` 已补 PostHog、Postgres、Grafana 三层验证步骤。

待接入或待产品确认：

- Discord / QQ 社区标签的数据入口，例如人工表格、bot 或 issue 同步。
- PostHog Dashboard 需要在 PostHog 账号里按 setup 文档创建 insights / alerts。
- Grafana Dashboard JSON 已更新，仍需部署 / import 到线上 Grafana。
- 日报 / 周报自动拉取脚本与提醒频道。

## 验证清单

- 新用户完成一次官方 Provider 聊天后，PostHog 能看到 `chat_activation_succeeded`。
- 自配置 Provider 失败时，PostHog 能按 `provider_id` + `error_code` 聚合。
- 选择官方默认音色后，PostHog 能看到 `voice_selected` 且 `voice_type = official_default`。
- 试听音色后，PostHog 能看到 `voice_preview_played`。
- REST 和 WS TTS 成功后，Postgres `product_events.metadata` 能看到 `voice_id`。
- Grafana 继续只按低基数字段聚合，不新增高基数 voice label。
- 日报能输出：activation conversion、Top failing providers、STT success rate、TTS success/blocked、Top voices、feedback count。
- 异常提醒命中时能带上：当前值、基线值、影响范围、建议查看的 dashboard / query。
- 周报能输出：本周结论、用户意图变化、Discord / QQ 反馈分类、下周 Product / Engineering / Community 行动建议。
