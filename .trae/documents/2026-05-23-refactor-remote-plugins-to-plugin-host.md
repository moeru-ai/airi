# PluginHost 插件系统

> Date: 2026-05-23
> Status: **M1 ✅ / M2 ✅ / M3 ✅ / M4 ⏳ / M5 📝**

## 0. 摘要

| Milestone     | 状态       | 完成时间       | 备注                                |
| ------------- | -------- | ---------- | --------------------------------- |
| M1-M3 核心迁移与清理 | ✅ **完成** | 2026-05-23 | remote-plugins → PluginHost 迁移已完成 |
| M4 更新机制       | ⏳ 待实施    | —          | 最低优先级                             |
| M5 后续修复与增强    | 📝 已规划   | —          | 5 项待办，详见下方                        |

***

## 1. 目标

插件系统架构文档，记录 PluginHost 插件系统的当前设计、功能规划与后续待办。

## 2. 当前架构

```
plugins/
├── index.ts                    # setupPluginHost() — 主入口
├── types.ts                    # PluginHostService, SetupPluginHostOptions
├── host/                       # PluginHost bootstrap, registry, config, debug (含 getPluginConfig / setPluginConfig / queryContext)
├── features/                   # auto-reload, static-assets
├── kits/                       # gamelet, widget kits
├── examples/
│   └── openviking-memory/      # 已迁移的 openviking 记忆插件
│       ├── index.ts            # PluginHost SDK 工具注册 (memory_search / memory_save / memory_delete)
│       ├── openviking.ts       # OpenViking HTTP 客户端
│       ├── plugin.airi.json    # ManifestV1 格式 manifest
│       └── package.json
└── tests
```

PluginHost 当前能力（迁移后）：

* **工具注册/调用**：`PluginHost.registerTool()` → `listAvailableToolDescriptors()` / `invokeTool()`

* **Eventa IPC**：`electronPluginListAgentTools`, `electronPluginInvokeTool`, `electronPluginQueryContext`, `electronPluginGetConfig`, `electronPluginSetConfig` 等

* **生命周期管理**：loading → loaded → authenticated → ready → stopped

* **Kit 系统**：widget, gamelet 扩展点

* **插件发现**：文件系统扫描 `<userData>/plugins/v1/<name>/plugin.airi.json`，支持 symlink

* **插件配置**：ManifestV1 `config.schema` 声明 → Settings 页面结构化表单 → `plugins-v1.json` 持久化

* **上下文注入**：renderer Store (`plugin-tools.ts`) 通过 `electronPluginQueryContext` 查询插件上下文并注入到 chat context

* **对话后处理**：`chatOrchestratorStore.onChatTurnComplete` → `electronPluginInvokeTool('memory/save_conversation')` 保存对话

## 3. 插件配置系统设计（已实现 ✅）

当前 PluginHost 的 `ManifestV1` 和 `plugins-v1.json` 均不支持插件声明配置项或持久化用户配置。本设计补齐这一能力。

#### 3.3.1 架构

```
插件 manifest 声明配置 schema：
  plugin.airi.json
    └── config: { schema: { <key>: { type, label, description, default, required } } }

用户配置持久化：
  plugins-v1.json
    └── configs: { <pluginName>: { <key>: <value> } }

Settings 页面：
  pages/settings/plugins/index.vue
    └── 读取 manifest 的 config.schema → 渲染表单
    └── 读取 persisted configs[pluginName] → 填充用户值
    └── 保存 → 写入 configs[pluginName] → IPC → hostService.setConfig()
```

#### 3.3.2 Manifest 扩展 — `config` 字段

在 `ManifestV1` 中新增可选的 `config` 字段：

```typescript
// packages/plugin-sdk/src/plugin-host/shared/types.ts → ManifestV1 扩展

interface PluginConfigFieldDeclaration {
  /** 字段类型：string=明文, secret=掩码显示, number=数字, boolean=开关 */
  type: 'string' | 'secret' | 'number' | 'boolean'
  /** 字段显示标签（i18n key 或直文） */
  label: string
  /** 字段描述 */
  description?: string
  /** 默认值 */
  default?: string | number | boolean
  /** 是否必填 */
  required?: boolean
  /** 占位提示 */
  placeholder?: string
}

interface PluginConfigDeclaration {
  schema: Record<string, PluginConfigFieldDeclaration>
}
```

**示例 — openviking-memory 插件声明**：

```json
{
  "apiVersion": "v1",
  "kind": "manifest.plugin.airi.moeru.ai",
  "name": "openviking-memory",
  "config": {
    "schema": {
      "OPENVIKING_BASE_URL": {
        "type": "string",
        "label": "API 地址",
        "description": "OpenViking 服务的 HTTP 端点",
        "default": "https://api.openviking.com",
        "required": true
      },
      "OPENVIKING_API_KEY": {
        "type": "secret",
        "label": "API 密钥",
        "description": "OpenViking 认证密钥",
        "required": true
      },
      "MEMORY_MAX_TOKENS": {
        "type": "number",
        "label": "最大记忆 Token 数",
        "description": "每次上下文注入的记忆上限",
        "default": 2000
      }
    }
  }
}
```

## 4. 功能规划

### M4: 更新机制（最低优先级 ⚪）⏳ Pending

**目标**：将 `remote-plugins/updater/` 的更新逻辑迁移为 PluginHost 的 `features/updater/` 特性。

**依赖**：M3 完成（remote-plugins 已删除，PluginHost 体系稳定）

#### M4.1 迁移更新源

| 子任务           | 文件                                   | 说明                                                      |
| ------------- | ------------------------------------ | ------------------------------------------------------- |
| UpdateManager | `plugins/features/updater/index.ts`  | `checkUpdate()` + `applyUpdate()` + `checkAllUpdates()` |
| GitHub 更新源    | `plugins/features/updater/github.ts` | 从 `remote-plugins/updater/github.ts` 迁移，逻辑不变            |
| Local 更新源     | `plugins/features/updater/local.ts`  | 从 `remote-plugins/updater/local.ts` 迁移，逻辑不变             |
| 类型定义          | `plugins/features/updater/types.ts`  | `UpdateResult`、`UpdateInfo`、`UpdateSource` 等            |

#### M4.2 集成 PluginHost

| 子任务         | 文件                                                    | 说明                                                        |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Manifest 扩展 | `packages/plugin-sdk/src/plugin-host/shared/types.ts` | `ManifestV1` 新增可选 `update` 字段                             |
| Config 扩展   | `plugins/host/config.ts`                              | 新增 `versions` 字段                                          |
| 启动检查        | `plugins/host/index.ts`                               | 遍历 `checkOnStartup` 插件并调用 `checkUpdate()`                 |
| Eventa IPC  | `shared/eventa/plugin/updater.ts`                     | `electronPluginCheckUpdate` / `electronPluginApplyUpdate` |
| IPC handler | `plugins/index.ts`                                    | 注册 updater IPC handlers                                   |

#### M4.3 验证

```bash
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm exec vitest run apps/stage-tamagotchi/src/main/services/airi/plugins/features/updater/
```

***

### M5: 后续修复与增强（中优先级 🟡）📝 Planned

**目标**：解决当前插件系统的已知问题，增加功能完整度所需的关键能力。

**依赖**：M3 完成（PluginHost 体系稳定）

#### M5.1 修复 `injectMemoryContext` 未返回相关记忆

| 子任务                                         | 文件                                                     | 说明                                                 |
| ------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| 调查 `queryContext` 实现逻辑，确认记忆检索策略是否使用了正确的查询参数 | `apps/.../plugins/host/index.ts`                       | 当前 `injectMemoryContext` 可能未传递充分的查询上下文导致返回了空或无关的记忆 |
| 检查 `memory_search` 工具的 prompt 是否包含了足够的对话上下文 | `apps/.../plugins/examples/openviking-memory/index.ts` | 工具调用时的 prompt 构造可能缺少当前对话的关键信息，需要增加上下文              |
| 增加记忆检索相关性调试日志                               | 同上                                                     | 便于确认检索到的记忆内容及其相关性分数                                |
| 编写集成测试验证相关性                                 | `apps/.../stores/plugin-tools.test.ts`                 | 模拟真实对话场景，验证注入的记忆与当前上下文相关                           |

#### M5.2 增加角色记忆隔离

| 子任务                               | 文件                                                          | 说明                                                   |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| 在 memory 工具中增加 `characterId` 过滤参数 | `apps/.../plugins/examples/openviking-memory/index.ts`      | `memory_search`、`memory_save`、`memory_delete` 增加角色筛选 |
| 在 `queryContext` 中注入当前角色 ID       | `apps/.../plugins/host/index.ts`                            | 从 `chatOrchestratorStore` 获取当前角色 ID 并作为上下文传递给插件      |
| 更新 OpenViking API 请求参数            | `apps/.../plugins/examples/openviking-memory/openviking.ts` | 在 API 请求中携带 `character_id` 参数                        |
| 编写集成测试验证隔离性                       | `apps/.../stores/plugin-tools.test.ts`                      | 切换角色后验证返回的记忆不包含其他角色的数据                               |

#### M5.3 增加用户记忆隔离

| 子任务                          | 文件                                                          | 说明                                                   |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| 在 memory 工具中增加 `userId` 过滤参数 | `apps/.../plugins/examples/openviking-memory/index.ts`      | `memory_search`、`memory_save`、`memory_delete` 增加用户筛选 |
| 在 `queryContext` 中注入当前用户 ID  | `apps/.../plugins/host/index.ts`                            | 从 `chatOrchestratorStore` 获取当前用户 ID 并作为上下文传递给插件      |
| 更新 OpenViking API 请求参数       | `apps/.../plugins/examples/openviking-memory/openviking.ts` | 在 API 请求中携带 `user_id` 参数                             |
| 编写集成测试验证隔离性                  | `apps/.../stores/plugin-tools.test.ts`                      | 切换用户后验证返回的记忆不包含其他用户的数据                               |

#### M5.4 增加插件 tar 包安装功能

| 子任务                                   | 文件                                   | 说明                                                               |
| ------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| 实现 tar.gz 下载 + 验证 + 解压逻辑              | `apps/.../plugins/host/installer.ts` | 新增文件：从 URL 或本地路径下载 tar.gz，验证完整性，解压到 plugins/v1/ 目标目录             |
| 实现插件注册：解压后扫描 manifest 并加载到 PluginHost | 同上                                   | 安装完成后自动注册插件到 PluginHost                                          |
| Eventa IPC 合约                         | `shared/eventa/plugin/installer.ts`  | `electronPluginInstallFromUrl` / `electronPluginInstallFromFile` |
| IPC handler                           | `plugins/index.ts`                   | 注册 installer IPC handlers                                        |
| Settings 页面安装入口                       | `pages/settings/plugins/index.vue`   | 添加"安装插件"按钮（URL 输入或文件选择）                                          |
| 编写集成测试                                | 同上                                   | mock tar.gz fixture 测试完整的安装流程                                    |

#### M5.5 修复插件配置功能（依赖 plugin-sdk）

| 子任务                                         | 文件                                    | 说明                                                     |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| 调查 plugin-sdk 中配置更新下发到插件 session 的链路是否存在限制  | `packages/plugin-sdk/`                | 当前 `setPluginConfig` 后插件侧无法感知配置变更，需确认 SDK 是否提供配置变更通知回调 |
| 在 plugin-sdk 中增加配置变更回调或事件机制                 | `packages/plugin-sdk/src/plugin/`     | 插件可通过 `apis.config.onChange(callback)` 监听配置变更          |
| 或使用 session reload 代替 applyConfiguration    | `apps/.../plugins/host/index.ts`      | 如果 SDK 限制无法绕过，保持当前 reload 方案作为 workaround              |
| 更新配置流程：host 侧 `setPluginConfig` 后通知插件侧配置已更新 | 同上                                    | 写入持久化后通过 session API 或事件机制通知插件重新读取配置                   |
| 编写集成测试验证配置更新流程                              | `apps/.../plugins/host/index.test.ts` | 修改配置后验证插件侧读取到的值已更新，无需 reload 整个 session                |

#### M5.6 验证

```bash
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/plugin-sdk typecheck
pnpm -F @proj-airi/stage-tamagotchi exec vitest run
pnpm exec vitest run apps/stage-tamagotchi/src/renderer/stores/plugin-tools.test.ts
pnpm lint
```

***

### Milestone 依赖关系图

```
M4（更新机制）⏳
  └── M5（后续修复与增强）📝
```

***

## 5. 验收结果

### 5.1 M4 验收标准：更新机制 ⏳

| #     | 验收项                                         | 验证方式                                                   | 预期结果                                               |
| ----- | ------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| A4.1  | `ManifestV1` 支持 `update` 字段                 | 单元测试：`safeParse(manifestV1Schema, manifestWithUpdate)` | 解析成功                                               |
| A4.2  | `checkUpdate()` 从 GitHub Release 源获取最新版本    | 单元测试（mock GitHub API）                                  | 返回 `{ status: 'pending', fromVersion, toVersion }` |
| A4.3  | `checkUpdate()` 在版本相同时返回 `up-to-date`       | 单元测试                                                   | `{ status: 'up-to-date' }`                         |
| A4.4  | `checkUpdate()` 在无更新配置时返回 `up-to-date`      | 单元测试                                                   | `{ status: 'up-to-date' }`                         |
| A4.5  | `applyUpdate()` 完成 下载→验证→unload→替换→load 全流程 | 集成测试（mock 下载 + 本地 fixture）                             | 新版本插件加载成功，版本号已更新                                   |
| A4.6  | `applyUpdate()` 在验证失败时自动回滚                  | 集成测试：`verifyPluginArtifacts` 失败                        | 旧目录恢复，插件状态不变                                       |
| A4.7  | `applyUpdate()` 在替换失败时自动回滚                  | 集成测试：重命名失败                                             | 旧版本插件继续运行                                          |
| A4.8  | 启动时 `checkOnStartup: true` 的插件自动检查更新        | 集成测试：启动时 mock checkUpdate                              | `checkUpdate()` 被调用                                |
| A4.9  | `plugins-v1.json` 的 `versions` 字段正确读写       | 单元测试                                                   | 写入后读取一致                                            |
| A4.10 | Local 更新源可正常获取版本和下载                         | 单元测试（本地 tar.gz fixture）                                | 返回正确的 `UpdateInfo`，解压成功                            |

### 5.2 M5 验收标准：后续修复与增强 📝

| #    | 验收项                                                       | 验证方式                             | 预期结果                                 |
| ---- | --------------------------------------------------------- | -------------------------------- | ------------------------------------ |
| A5.1 | `injectMemoryContext` 返回与当前对话相关的记忆内容                      | 集成测试：发送真实消息后验证注入的记忆上下文中的记忆条目的相关性 | 注入的记忆应与当前对话上下文高度相关                   |
| A5.2 | 角色记忆隔离：不同角色（character）的记忆互不干扰                             | 集成测试：切换角色后查询记忆不返回其他角色的记忆         | 记忆查询结果仅包含当前角色的记忆                     |
| A5.3 | 用户记忆隔离：不同用户的记忆互不干扰                                        | 集成测试：切换用户后查询记忆不返回其他用户的记忆         | 记忆查询结果仅包含当前用户的记忆                     |
| A5.4 | 插件 tar 包安装：支持从 tar.gz 文件或 URL 安装插件，自动解压到 plugins/v1/ 目录   | 集成测试：mock tar.gz 下载或通过本地文件安装     | 插件安装成功，manifest 可被发现且插件可正常加载         |
| A5.5 | 插件配置功能正常生效：通过 plugin-sdk 修复 `setPluginConfig` → 插件侧配置更新流程 | 集成测试：修改配置后验证插件侧读取到的值已更新          | 配置修改后插件侧能正确读取新值，无需 reload 整个 session |

## 6. 风险与注意事项

| 风险                                             | 缓解措施                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ManifestV1` 同时扩展 `update` 和 `config` 字段       | 两者均为 optional，不影响未声明这些字段的现有插件                                                                                     |
| PluginHost 内置插件无 `displayName` / `description` | Settings 页面需要处理这些字段缺失的情况，回退显示 `name`                                                                              |
| 配置 schema 校验失败影响插件加载                           | `setPluginConfig` 在写入前校验，不合法的值被拒绝写入，不影响已有持久化值                                                                     |
| 插件分发：PluginHost 无插件市场/npm registry 集成          | 初期通过 M4 更新机制（GitHub Release tar.gz 下载）分发；开发者通过 symlink 方式独立开发测试；长期可考虑 `plugins/v1/` 初始化脚本从 GitHub Release 拉取初始安装包 |
| 更新机制依赖 `node:fs` 原子替换目录                        | `applyUpdate()` 使用 rename + backup 策略，失败时自动回滚                                                                     |
| plugin-sdk 限制导致配置无法正确下发到插件 session             | 当前 workaround：通过 session reload 替代 applyConfiguration；M5.5 目标是通过 plugin-sdk 增加配置变更回调机制，移除 reload workaround       |

## 7. 文件变更清单

### M4 待创建文件

* ⏳ `apps/stage-tamagotchi/src/main/services/airi/plugins/features/updater/index.ts`

* ⏳ `apps/stage-tamagotchi/src/main/services/airi/plugins/features/updater/github.ts`

* ⏳ `apps/stage-tamagotchi/src/main/services/airi/plugins/features/updater/local.ts`

* ⏳ `apps/stage-tamagotchi/src/main/services/airi/plugins/features/updater/types.ts`

* ⏳ `apps/stage-tamagotchi/src/shared/eventa/plugin/updater.ts`

### M5 待创建文件

* 📝 `apps/stage-tamagotchi/src/main/services/airi/plugins/host/installer.ts`

* 📝 `apps/stage-tamagotchi/src/shared/eventa/plugin/installer.ts`

### M5 待修改文件

* 📝 `apps/stage-tamagotchi/src/main/services/airi/plugins/host/index.ts` — 修复 `setPluginConfig` 配置通知 / `queryContext` 记忆检索

* 📝 `apps/stage-tamagotchi/src/main/services/airi/plugins/index.ts` — 注册 installer IPC handlers

* 📝 `apps/stage-tamagotchi/src/main/services/airi/plugins/examples/openviking-memory/index.ts` — 增加 `characterId`/`userId` 过滤 + 改善记忆检索 prompt

* 📝 `apps/stage-tamagotchi/src/main/services/airi/plugins/examples/openviking-memory/openviking.ts` — API 请求增加 `character_id`/`user_id` 参数

* 📝 `apps/stage-tamagotchi/src/renderer/pages/settings/plugins/index.vue` — 增加"安装插件"按钮

* 📝 `apps/stage-tamagotchi/src/renderer/stores/plugin-tools.test.ts` — 集成测试：相关性、角色隔离、用户隔离

* 📝 `apps/stage-tamagotchi/src/main/services/airi/plugins/host/index.test.ts` — 集成测试：配置更新流程

* 📝 `packages/plugin-sdk/src/plugin/` — 增加配置变更回调机制

## 8. 验证命令

```bash
# TypeScript 类型检查
pnpm -F @proj-airi/stage-tamagotchi typecheck

# SDK 类型检查（如有变更）
pnpm -F @proj-airi/plugin-sdk typecheck

# 单元测试
pnpm -F @proj-airi/stage-tamagotchi exec vitest run

# 特定测试
pnpm exec vitest run apps/stage-tamagotchi/src/main/services/airi/plugins/index.test.ts
pnpm exec vitest run apps/stage-tamagotchi/src/renderer/stores/plugin-tools.test.ts

# Lint
pnpm lint
```

