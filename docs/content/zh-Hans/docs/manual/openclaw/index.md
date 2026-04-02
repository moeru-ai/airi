---
title: AIRI 与 OpenClaw 的整合架构
description: 从工程实现视角理解 AIRI 与 OpenClaw 的职责边界、调用链路与落地方式
---

# AIRI 与 OpenClaw 的整合架构

::: tip 先记这一句
**AIRI = 人格、记忆、表现层**

**OpenClaw = 工具、自动化、执行层**
:::

这份文档描述的是一种适合工程实现的整合方式：

- AIRI 负责“像一个角色”
- OpenClaw 负责“把事情做完”

它更适合作为架构设计和集成参考，而不是把两个系统强行理解成绝对固定、不可变的边界。

## 一、核心定位

从系统分层来看：

- AIRI 更接近角色系统、伴侣系统、交互系统
- OpenClaw 更接近 agent runtime、工具执行器、自动化引擎

如果只保留 AIRI 而没有 OpenClaw，系统通常会更像“会聊天的角色”。

如果只保留 OpenClaw 而没有 AIRI，系统通常会更像“会执行任务的机器人”。

把两者结合起来，才能得到一个既能表达人格、又具备行动能力的 AI companion。

## 二、职责划分

### AIRI：角色层

AIRI 主要负责这些能力：

- personality：人格设定
- emotion：情绪状态
- memory：关系和对话记忆
- voice、Live2D、UI：表现和反馈
- chat：自然语言对话

换句话说，AIRI 的重点不是“调用多少工具”，而是：

- 用户感受到的是谁在说话
- 角色如何理解关系
- 回答是否带有情绪、风格和陪伴感

### OpenClaw：能力层

OpenClaw 主要负责这些能力：

- tools：工具调用
- automation：自动化流程
- multi-step tasks：多步骤任务
- API、文件、系统资源操作
- execution：任务执行与结果回传

换句话说，OpenClaw 的重点不是“像谁”，而是：

- 如何把任务拆解
- 如何正确调用工具
- 如何把执行结果结构化返回

## 三、推荐架构

一个清晰、好维护的整合方式如下：

```text
[User]
   ↓
[AIRI UI / Voice]
   ↓
[AIRI Core]
  ├─ personality
  ├─ emotion
  ├─ memory
  └─ intent / policy
        ↓
   (判断：聊天 or 执行任务)
        ↓
[OpenClaw Bridge]
        ↓
[OpenClaw Runtime]
  ├─ planner
  ├─ tools
  ├─ automation
  └─ execution
        ↓
[Structured Result]
        ↓
[AIRI Response Layer]
        ↓
[User]
```

这里最重要的不是“谁直接调用谁”，而是中间要有一个明确的桥接层：

- AIRI 不要直接和所有工具耦合
- OpenClaw 也不要负责角色人格输出
- 两者通过稳定的输入输出契约协作

在这个仓库里，推荐把这层 bridge 放在后端 / 服务适配层，而不是前端聊天 store 或 renderer 侧工具桥里：

- `packages/stage-ui/src/stores/chat.ts` 继续负责对话编排
- `packages/stage-ui/src/stores/mods/api/context-bridge.ts` / `channel-server.ts` 继续负责把任务型请求送到服务侧
- 新的 OpenClaw bridge 更适合落在 `services/` 一侧，模式上接近 `services/minecraft/src/airi/airi-bridge.ts`

这样做的原因很直接：认证、超时、重试、审计和结果归一化都属于服务适配职责，不该塞进面向用户的运行时。

## 四、一次完整流程

假设用户说：

```text
帮我查今天台股
```

推荐流程如下：

1. 用户把请求发给 AIRI。
2. AIRI 先判断这是普通聊天，还是需要执行的任务。
3. 如果是任务，AIRI 把结构化请求发给 OpenClaw。
4. OpenClaw 调用行情 API、整理数据、返回结果。
5. AIRI 再把结果包装成人格化回应。

可以把它理解为：

```text
User:
  "帮我查今天台股"

AIRI:
  "这不是纯聊天，需要调用能力层"

OpenClaw:
  查询 -> 整理 -> 返回

OpenClaw result:
  "台股上涨 2%"

AIRI final reply:
  "欸，今天台股还不错耶，上涨了 2% 喔。"
```

## 四点五、AIRI 侧启动方式

在 OpenClaw 服务已经可用的前提下，AIRI 侧推荐直接使用仓库脚本启动：

```sh
bash scripts/start-airi-openclaw.sh web
```

如果需要桌面端开发环境，则使用：

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

这个脚本会统一拉起：

- `@proj-airi/server-runtime`
- `@proj-airi/openclaw-bridge`
- `@proj-airi/stage-web` 或 `@proj-airi/stage-tamagotchi`

腳本預設讀取 `services/openclaw-bridge/.env.local`，並把執行日誌寫到 `.logs/airi-openclaw/`，這樣就不需要分別手動啟動 AIRI server runtime、bridge 和前端。

補充說明：

- `pnpm -F @proj-airi/openclaw-bridge start` 目前也只讀取 `.env.local`。
- `bash scripts/start-airi-openclaw.sh web` 會先檢查 `http://localhost:5173` 是否真的可用；如果 `5173` 被無回應的舊 `stage-web` 程序占用，腳本會先清理再重啟。
- 常用日誌位置為 `.logs/airi-openclaw/airi-server-runtime.log`、`.logs/airi-openclaw/openclaw-bridge-runtime.log`、`.logs/airi-openclaw/airi-stage-web.log`。
- 若使用者明確要求把任務交給 OpenClaw，AIRI 會直接把任務送進既有委派流程，不再額外插入確認步驟。

## 四点六、对话里如何触发 OpenClaw

目前 AIRI 端採用的是**明確句型觸發**，不是看到任務就一律自動送 OpenClaw。

### 会触发的句型

以下句型会直接触发 OpenClaw：

- `請用 OpenClaw 執行這個任務：<任務>`
- `請用 OpenClaw 執行任務：<任務>`
- `請交給 OpenClaw 處理：<任務>`
- `這是一個要交給 OpenClaw 的任務：<任務>`

例如：

```text
請用 OpenClaw 執行這個任務：pwd
請交給 OpenClaw 處理：nvidia-smi
```

### 不会触发的情况

以下输入目前不会直接触发：

- 沒有提到 `OpenClaw`
- 只有一般任務意圖，但沒有命中明確句型
- 有提到 `OpenClaw`，但後面沒有 `：` / `:` 與任務正文

例如：

```text
幫我查一下目前目錄
你可以幫我執行一個任務嗎？
OpenClaw 好像可以做很多事
```

### 触发后实际发生什么

命中規則後，AIRI 會：

1. 抽出冒號後面的文字作為任務內容
2. 將任務整理成 `spark:command`
3. 送到 `openclaw-bridge`
4. 接收狀態更新與最終摘要
5. 把最終結果顯示回對話

也就是說，在這個版本裡，**觸發規則是句型驅動**，不是自由語意推斷。

## 五、谁负责什么

| 功能 | AIRI | OpenClaw |
| --- | --- | --- |
| 聊天 | ✅ | ❌ |
| 人格 | ✅ | ❌ |
| 情绪 | ✅ | ❌ |
| 关系记忆 | ✅ | ❌ |
| 工具调用 | ❌ | ✅ |
| 自动化 | ❌ | ✅ |
| 多步骤任务 | ⚠️ 负责决策和包装 | ✅ 负责执行 |
| 结构化任务状态 | ⚠️ 可读取摘要 | ✅ |
| 结果人格化表达 | ✅ | ❌ |

这里有一个容易混淆的点：

- AIRI 也可以知道“任务正在进行”
- 但真正的任务状态机、工具链和日志，最好由 OpenClaw 持有

## 六、最重要的三个整合点

### 1. 决策层

AIRI 需要先做一个判断：

```text
当前输入是：
- 聊天
- 任务
- 聊天 + 任务
```

这是整合里最关键的一层。

如果没有这一层，系统常常会出现两种问题：

- 该调用工具时没有调用
- 明明只是聊天，却误触发复杂执行

### 2. 工具触发层

这一层通常有两种做法：

- function calling
- rule-based routing

推荐思路是：

- 简单需求先用 rule-based
- 复杂需求再引入 function calling

这样可以先把系统跑通，再逐步提高自治程度。

如果放到 AIRI 现有代码里理解，可以再多补一句：

- `packages/stage-ui/src/stores/llm.ts` 已经负责 xsai tools 的装配
- `packages/stage-ui/src/stores/mcp-tool-bridge.ts` 已经是 MCP 工具调用的最小 bridge
- OpenClaw bridge 不该直接等同于这层 MCP bridge

更准确地说：MCP / xsai tool calling 解决的是“LLM 如何调用工具接口”，OpenClaw bridge 解决的是“任务如何被委托给外部执行网关并安全返回结构化结果”。两者有关联，但不是同一个层级的问题。

### 3. 结果人格化

OpenClaw 返回的最好是结构化结果，而不是最终对用户展示的文案。

例如：

```json
{
  "status": "ok",
  "summary": "CPU usage 90%",
  "data": {
    "cpu": 90
  }
}
```

然后再由 AIRI 把结果转换成角色化回应：

```text
欸，你的电脑有点烧喔，CPU 已经到 90% 了。
```

这个设计可以明显减少两类问题：

- OpenClaw 输出越来越像死板机器人
- AIRI 的人格一致性被工具执行细节污染

## 七、记忆怎么分

推荐把记忆拆成两类。

### AIRI memory

适合放在 AIRI 的内容：

- 用户关系
- 情绪变化
- 长期陪伴语境
- 对话中的偏好、称呼、习惯

### OpenClaw memory

适合放在 OpenClaw 的内容：

- 任务日志
- 执行状态
- 结构化结果
- 自动化历史
- 可检索的工具输出

可以简单理解为：

- AIRI memory 是“关系记忆”
- OpenClaw memory 是“执行记忆”

## 补充：OpenClaw 部署与连接的安全写法

这一节只保留通用做法，不写死任何私有地址、本机路径或真实密钥来源。

### 推荐部署形态

- OpenClaw Gateway 运行在你控制的主机或容器里
- AIRI 通过一个服务侧 bridge 去访问它
- 浏览器侧 UI 不直接持有 OpenClaw 凭据

如果你需要给团队留下部署说明，建议记录成下面这种占位格式：

```text
OpenClaw host: http://<openclaw-host>:<port>
OpenClaw API base: http://<openclaw-host>:<port>/v1
Auth mode: Bearer token
Service manager: systemd / docker / process manager
Config path: <server-local-config-path>
```

### 连接方式

如果你的 bridge 采用 OpenAI-compatible HTTP 接入，可以优先考虑这些端点：

```text
http://<openclaw-host>:<port>/v1/chat/completions
http://<openclaw-host>:<port>/v1/responses
```

如果 OpenClaw 另有 WebSocket 界面或控制通道，也建议把它看成运维或实时交互接口，而不是默认的首版 bridge transport。

### 认证方式

请求通常会带上 Bearer Token，例如：

```http
Authorization: Bearer ${OPENCLAW_TOKEN}
```

`OPENCLAW_TOKEN` 应来自环境变量、密钥管理系统，或 bridge 服务所在主机的安全配置，而不是硬编码在前端、文档截图或公开仓库里。

::: warning 安全注意
不要把真实私网 IP、真实主机路径、真实 token、或可直接复用的内网运维命令写进公开文档。公开文档应只保留模式、占位符和安全边界。
:::

### 一个最小连接示例

下面这个例子展示的是“桥接层调用 OpenClaw HTTP 接口”的最小形式：

```bash
curl "http://<openclaw-host>:<port>/v1/responses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OPENCLAW_TOKEN}" \
  -d '{
    "model": "openclaw",
    "input": "列出今天待处理的自动化任务"
  }'
```

如果你准备让 AIRI 去调 OpenClaw，推荐做法仍然是：

- AIRI 先做意图判断
- 由中间 bridge 负责认证、超时、重试和结构化结果转换
- 不要把 Gateway token 直接暴露给浏览器侧 UI

## 八、接口契约建议

如果要真正落地，建议 AIRI 和 OpenClaw 之间不要只传一句自然语言，而是传一个小型结构体。

例如：

```json
{
  "task": "查今天台股",
  "source": "airi",
  "user_id": "user-123",
  "conversation_id": "conv-456",
  "context": {
    "timezone": "Asia/Taipei",
    "language": "zh-TW"
  },
  "return_mode": "structured"
}
```

返回结果也建议结构化：

```json
{
  "status": "ok",
  "summary": "台股上涨 2%",
  "data": {
    "index_name": "TAIEX",
    "change_pct": 2.0
  },
  "logs": [
    "quote_api_called",
    "result_normalized"
  ]
}
```

这样做的好处是：

- AIRI 更容易做角色化包装
- OpenClaw 更容易调试和复用
- 两边边界更稳定

## 九、最小可行实现

如果目标是做一个 MVP，建议按这个顺序实现：

1. AIRI 能正常聊天。
2. AIRI 能识别“是否需要执行任务”。
3. AIRI 能通过服务侧 bridge 用 HTTP 调 OpenClaw。
4. OpenClaw 能返回结构化结果。
5. AIRI 能把结果转成角色化回复。
6. 最后再接入语音、Live2D 和自动化。

一个最简单的桥接示例（注意：这里的 `localhost:3000` 是 bridge service 的地址，不是 OpenClaw Gateway 本身）：

```typescript
const response = await fetch('http://localhost:3000/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task: userInput,
    source: 'airi',
    return_mode: 'structured',
  }),
})

const result = await response.json()
```

如果后续你希望把 OpenClaw 暴露成 xsai / function calling 可触发的能力，也可以让 LLM 输出类似这样的调用：

```json
{
  "name": "openclaw_run",
  "arguments": {
    "task": "查今天台股"
  }
}
```

## 十、模型搭配建议

这部分最容易过时，所以更推荐按“角色”选型，而不是把模型名写死。

比较稳妥的思路是：

- AIRI 使用更擅长聊天、风格稳定、成本适中的模型
- OpenClaw 使用更擅长推理、工具调用、多步骤执行的模型

也就是典型的双模型架构：

```text
AIRI:
  负责聊天、人格、表达

OpenClaw:
  负责推理、规划、工具执行
```

如果只用一个模型也不是不行，但通常会在这两方面二选一：

- 聊天自然，但执行一般
- 执行很强，但陪伴感差

## 十一、常见错误

### 1. 把 OpenClaw 当聊天主脑

后果通常是：

- 回答变得像机器人
- 缺少人格一致性
- 情绪表达不自然

### 2. AIRI 完全不接工具

后果通常是：

- 只能聊天
- 缺乏实际行动能力

### 3. 把人格 prompt 塞进 OpenClaw

后果通常是：

- 工具执行层越来越重
- 输出风格不稳定
- 后续调试困难

### 4. 不定义输入输出契约

后果通常是：

- AIRI 和 OpenClaw 互相污染
- 后期很难替换模型和执行引擎

## 十二、最终理解

可以把这套整合浓缩成一句话：

```text
AIRI 负责“我是谁”
OpenClaw 负责“我能做什么”
```

进一步说：

- AIRI 是人格、情绪、记忆和表现
- OpenClaw 是工具、自动化和执行

两者结合之后，系统才会更接近真正的 AI companion：

- 能聊天
- 有情绪
- 会记得你
- 也能替你做事

## 十三、建议的下一步

如果你准备开始实现，可以优先做这三件事：

1. 定义 AIRI → OpenClaw 的请求和返回 schema。
2. 做一个最小 bridge service，把聊天与任务分流。
3. 先打通一个真实任务，例如查行情、查天气或读系统状态。

当这三步打通以后，再接：

- 语音输入输出
- 角色动作和 UI 动画
- 自动化任务和计划执行

到这一步，AIRI + OpenClaw 才会真正变成“会聊天，也会行动”的系统。
