# OpenViking 长期记忆插件

基于 [OpenViking](https://openviking.ai) 的长期记忆系统插件，为 AIRI 提供记忆搜索、保存和删除功能。

## 功能

### 工具列表

- **搜索记忆**（`memory_search`）：根据查询关键词搜索长期记忆。返回结果格式如下：

  ```json
  [
    {
      "context_type": "memory",
      "uri": "viking://user/default/memories/manual/1779530859829-dly184hl.md",
      "level": 2,
      "score": 0.6159865260124207,
      "category": "",
      "match_reason": "",
      "relations": [],
      "abstract": "1. 该文档是一份个人日程计划笔记...",
      "overview": null
    },
    {
      "context_type": "memory",
      "uri": "viking://user/default/memories/manual/1779384773203-r0jq33bf.md",
      "level": 2,
      "score": 0.6076329350471497,
      "category": "",
      "match_reason": "",
      "relations": [],
      "abstract": "This document is a concise personal travel plan...",
      "overview": null
    }
  ]
  ```

  每个结果字段说明：

  | 字段 | 类型 | 说明 |
  |------|------|------|
  | `context_type` | `string` | 上下文类型，固定为 `memory` |
  | `uri` | `string` | 记忆文件的 URI，可用于 `memory_read` 工具读取完整内容 |
  | `level` | `number` | 层级（0-3），数字越大表示越相关 |
  | `score` | `number` | 相关性评分（0-1），越高越匹配 |
  | `category` | `string` | 分类标签 |
  | `match_reason` | `string` | 匹配原因说明 |
  | `relations` | `array` | 关联的其它记忆 URI 列表 |
  | `abstract` | `string` | 记忆内容的摘要/概述 |
  | `overview` | `string \| null` | 概览信息 |

- **读取记忆**（`memory_read`）：根据 URI 读取一条记忆的完整内容
- **保存记忆**（`memory_save`）：将重要信息保存到长期记忆
- **保存对话记录**（`memory_save_conversation`）：将一轮对话（用户消息 + 助手回复 + 工具调用）保存到长期记忆
- **删除记忆**（`memory_delete`）：删除指定的记忆条目

## 安装

### 前提条件

- AIRI Stage Tamagotchi（Electron 桌面应用）
- OpenViking 服务（默认地址：`http://localhost:1933`）

### 安装步骤

1. **构建插件**

   在插件目录下执行：

   ```bash
   cd apps/stage-tamagotchi/src/main/services/airi/plugins/examples/openviking-memory
   pnpm install
   pnpm run pack
   ```

   构建完成后会在当前目录生成 `openviking-memory.tar.gz` 打包文件。

2. **将插件复制到插件目录**

   根据运行环境，将打包文件解压后的 `openviking-memory/` 目录复制到对应的插件目录。

   **生产环境**（打包后的应用）：

   | 操作系统 | 插件目录 |
   |----------|----------|
   | **macOS** | `~/Library/Application Support/${appId}/plugins/v1/` |
   | **Windows** | `%APPDATA%\\${appId}\\plugins\\v1\\` |
   | **Linux** | `$XDG_CONFIG_HOME/${appId}/plugins/v1/` 或 `~/.config/${appId}/plugins/v1/` |

   > `${appId}` 为 AIRI 应用的标识符（默认 `ai.moeru.airi`），具体值请参考应用配置。

   **开发环境**（`pnpm dev`）：

   当使用 `electron-vite dev` 运行时，Electron 使用包名作为用户数据目录，插件目录为：

   | 操作系统 | 插件目录 |
   |----------|----------|
   | **macOS** | `~/Library/Application Support/@proj-airi/stage-tamagotchi/plugins/v1/` |
   | **Windows** | `%APPDATA%\\@proj-airi\\stage-tamagotchi\\plugins\\v1\\` |
   | **Linux** | `~/.config/@proj-airi/stage-tamagotchi/plugins/v1/` |

3. **在插件管理器中启用**

   - 打开 Stage Tamagotchi 的开发者工具页面（DevTools）
   - 进入 **Plugin Host Inspector** 页面
   - 点击 **Refresh** 刷新插件列表
   - 找到 `openviking-memory` 插件
   - 点击 **Enable** 启用
   - 点击 **Load**（或 **Load Enabled**）加载插件

4. **配置插件**

   插件加载后，在插件配置页面设置以下参数：

   - **服务器地址**（`baseUrl`）：OpenViking 服务的 base URL，默认为 `http://localhost:1933`
   - **API 密钥**（`apiKey`）：OpenViking 服务的 API 密钥（可选）

### 验证安装

加载成功后，AIRI 将获得以下工具能力：

- `memory_search` — 搜索长期记忆
- `memory_read` — 根据 URI 读取记忆完整内容
- `memory_save` — 保存记忆
- `memory_save_conversation` — 保存对话记录
- `memory_delete` — 删除记忆

## 开发

### 目录结构

```
openviking-memory/
├── src/
│   ├── index.ts          # 插件入口，注册工具
│   └── openviking.ts     # OpenViking 客户端实现
├── scripts/
│   └── pack.mjs          # 打包脚本
├── dist/
│   └── index.mjs         # 编译后的插件入口（仅构建产物）
├── docs/
│   ├── Readme.zh-CN.md   # 本文件
│   └── openclaw-plugin-implementation-analysis.md
├── plugin.airi.json      # 插件清单（entrypoint: ./index.mjs）
├── tsdown.config.ts      # 构建配置
└── package.json          # 依赖与构建脚本
```

### 构建

```bash
pnpm run build    # 使用 tsdown 编译 TypeScript
pnpm run pack     # 构建并打包为 tar.gz
```

## 配置说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `baseUrl` | `string` | 是 | `http://localhost:1933` | OpenViking 服务器地址 |
| `apiKey` | `secret` | 否 | `""` | API 密钥 |

## 许可

此插件为 AIRI 示例插件，仅供学习和参考使用。
