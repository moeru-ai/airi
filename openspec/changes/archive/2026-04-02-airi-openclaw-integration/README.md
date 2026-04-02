# AIRI OpenClaw 集成变更说明

本变更总结了 AIRI 与 OpenClaw 的既有集成方案。目标是在不破坏 AIRI 人设体验的前提下，把可执行任务委托给 OpenClaw，并把结构化结果重新整理为符合 AIRI 风格的回复。

## 架构边界

- 服务侧适配器负责 OpenClaw 的 transport、auth、任务 lifecycle，以及 execution history 的保存与关联。
- `stage-ui` 只保留薄的编排触点，负责意图路由、委托触发、状态摘要消费，与最终的人设化回复整理。
- OpenClaw 集成不是对现有 MCP 或 xsai 工具装配层的替换，而是一个位于后端 / 服务适配层的独立委托通道。

## 生命周期与状态契约

- 每个委托任务都由服务侧适配器分配或返回稳定的 task id。
- 面向 AIRI 的最小状态集合包含 `queued`、`running`、`completed`、`failed`、`cancelled`。
- 状态更新保持结构化，至少包含 task id、当前状态，以及可用于排序的时间信息或等价字段。
- AIRI 只消费必要的状态摘要与最终结果，不拥有执行状态机，也不保存完整执行记录。

## 历史归属

- 关系记忆继续留在 AIRI 一侧，保持以用户关系和陪伴上下文为中心。
- 执行历史由服务侧适配器拥有，至少覆盖 task id、状态流转、结果摘要与错误摘要，用于调试、审计和后续追踪。
- `stage-ui` 不持有 execution history store，只读取路由和回复塑形所需的摘要。

## 传输选择

- 首版桥接优先采用 OpenAI-compatible HTTP，用于连接 OpenClaw 的外部执行网关接口。
- WebSocket 与 Eventa 继续保留给 AIRI 内部 server channel、模块通知和其他更实时的运行时角色，不作为本变更首版的 OpenClaw 主 transport。

## 当前完成情况

- 已完成任务路由、结构化请求与结果处理。
- 已完成服务侧桥接、生命周期管理、取消处理，以及执行历史归属边界。
- 已完成 `stage-ui` 侧的委托入口与摘要消费，保持 UI 层职责精简。

## 如何使用

本变更的使用方式是由 `stage-ui` 发起委托，但不在 UI 层直接处理 OpenClaw 的 transport、认证或任务状态机。

### OpenClaw 触发规则

目前 `stage-ui` 只对**明确句型**做 OpenClaw 直送委托，不会把所有任务型对话都自动送进 OpenClaw。

#### 会直接触发的句型

以下输入会直接抽出冒号后的任务文本，并交给 OpenClaw：

- `請用 OpenClaw 執行這個任務：<任務>`
- `請用 OpenClaw 執行任務：<任務>`
- `請交給 OpenClaw 處理：<任務>`
- `這是一個要交給 OpenClaw 的任務：<任務>`

例如：

- `請用 OpenClaw 執行這個任務：pwd`
- `請交給 OpenClaw 處理：nvidia-smi`

#### 不會直接觸發的情況

以下情況不屬於目前的明確規則，會回到原本的 AIRI 對話流程，而不是直接委派：

- 沒有明確提到 `OpenClaw`
- 只有一般請求，例如 `幫我查一下目前目錄`
- 只有模糊意圖，例如 `你可以幫我執行一個任務嗎？`
- `OpenClaw` 不在句首規則位置，或沒有 `：` / `:` 後續任務文本

#### 任務抽取方式

- AIRI 只會抽取句型中冒號後面的文字作為任務內容
- 抽取結果會直接成為 `openclaw:task` lane 的 `text`
- 目前不做額外二次確認，也不在 UI 層改寫任務文本

#### 觸發後的行為

一旦命中規則，流程如下：

1. `stage-ui` 抽出任務文本。
2. `packages/stage-ui/src/tools/openclaw.ts` 組成 `spark:command`。
3. 任務送往 `openclaw-bridge`。
4. `openclaw-bridge` 執行後回傳 `queued / running / completed / failed / cancelled`。
5. 最終摘要透過 `context:update` 回到 AIRI 對話。

### AIRI 端启动脚本

在 OpenClaw 服务已可用的前提下，可以直接使用仓库脚本启动 AIRI 侧所需组件：

```sh
bash scripts/start-airi-openclaw.sh web
```

如果要启动桌面端开发环境，则改用：

```sh
bash scripts/start-airi-openclaw.sh tamagotchi
```

停止对应环境时可使用：

```sh
bash scripts/stop-airi-openclaw.sh web
```

或：

```sh
bash scripts/stop-airi-openclaw.sh tamagotchi
```

该脚本会负责启动：

- `@proj-airi/server-runtime`
- `@proj-airi/openclaw-bridge`
- `@proj-airi/stage-web` 或 `@proj-airi/stage-tamagotchi`

腳本預設讀取 `services/openclaw-bridge/.env.local`，並把執行日誌寫到 `.logs/airi-openclaw/`。

- OpenClaw bridge 的 `pnpm -F @proj-airi/openclaw-bridge start` 目前也只依賴 `.env.local`。
- `start-airi-openclaw.sh` 會對 `stage-web` 做 HTTP 健康檢查；若 `5173` 已被無回應的舊程序占用，腳本會先清理再重啟。
- 常用日誌位置：`.logs/airi-openclaw/airi-server-runtime.log`、`.logs/airi-openclaw/openclaw-bridge-runtime.log`、`.logs/airi-openclaw/airi-stage-web.log`。

### 开发者操作流程

1. `stage-ui` 在识别到適合委託的任務後，透過 `packages/stage-ui/src/tools/openclaw.ts` 組裝委託內容。
2. 該工具會直接發出 `spark:command`，把任務文本、對話標識、使用者標識和補充上下文放入 `openclaw:task` lane，並把目標指向 `openclaw-bridge`。
3. `services/openclaw-bridge/src/openclaw-bridge-adapter.ts` 接收該 `spark:command` 後，讀取上下文中的 OpenClaw metadata，再把任務交給 service-side adapter。
4. `services/openclaw-bridge/src/openclaw-bridge.ts` 負責 task lifecycle，包括 `queued`、`running`、`completed`、`failed`、`cancelled`，並協調取消與結果歸一化。
5. `services/openclaw-bridge/src/openclaw-gateway-client.ts` 透過 OpenAI-compatible HTTP 呼叫 OpenClaw 外部執行網關。
6. 執行中的狀態更新透過 `spark:emit` 回傳給 AIRI 端摘要消費，`stage-ui` 不持有完整狀態機。
7. 當任務結束時，service-side adapter 會把最終摘要透過 `context:update` 回傳，同時把 execution history 留在服務端；`stage-ui` 只接受來自 `openclaw-bridge` 的匹配結果事件。
8. AIRI 最後只消費必要摘要，並在 `stage-ui` 端繼續完成符合角色風格的最終回覆整理。

### 给开发者的最短操作步骤

- 先执行 `bash scripts/start-airi-openclaw.sh web`，确认 AIRI 侧运行时已经就绪。
- 从 `stage-ui` 触发一次 OpenClaw 委托，确认任务是以 `spark:command` 送到 `openclaw-bridge`。
- 观察任务是否按 `queued -> running -> completed/failed/cancelled` 推进，并确认中途进度以 `spark:emit` 形式返回。
- 确认最终结果以 `context:update` 摘要回到 AIRI 编排流程，而不是把完整执行历史放进 `stage-ui`。

### 涉及文件

- `packages/stage-ui/src/tools/openclaw.ts`：`stage-ui` 侧的薄委托入口，负责把任务整理成 `spark:command`。
- `services/openclaw-bridge/src/openclaw-bridge-adapter.ts`：服务侧适配入口，负责接收 `spark:command`、发布 `spark:emit` 与最终 `context:update`。
- `services/openclaw-bridge/src/openclaw-bridge.ts`：任务生命周期、取消处理与结果更新协调。
- `services/openclaw-bridge/src/openclaw-gateway-client.ts`：连接 OpenClaw 外部执行网关的 OpenAI-compatible HTTP 客户端。

## 验证

以下命令已作为本变更文档更新后的回归验证项执行，且当前均通过：

```sh
pnpm -F @proj-airi/openclaw-bridge test
pnpm -F @proj-airi/stage-ui exec vitest run src/tools/openclaw.test.ts
```
