# Crowdin 本地化平台配置详解

本文档详细介绍项目中 Crowdin 本地化平台的配置和使用方式。

---

## 目录

- [一、Crowdin 平台简介](#一crowdin-平台简介)
- [二、配置文件解析](#二配置文件解析)
- [三、工作流程](#三工作流程)
- [四、路径模板变量](#四路径模板变量)
- [五、与项目集成方式](#五与项目集成方式)
- [六、实际应用场景](#六实际应用场景)

---

## 一、Crowdin 平台简介

**Crowdin** 是一个云端本地化管理平台，用于协作翻译软件项目。

### 核心功能

| 功能 | 说明 |
|------|------|
| **自动化翻译流程** | 自动同步源文件和翻译文件 |
| **协作翻译** | 多人协作翻译，支持专业译者和社区贡献者 |
| **翻译记忆** | 复用历史翻译，提高效率 |
| **机器翻译集成** | 支持 Google Translate、DeepL 等 |
| **GitHub 集成** | 自动同步代码仓库，翻译完成后自动提交 |

---

## 二、配置文件解析

**文件路径**: `/crowdin.yml`

```yaml
files:
  - source: packages/i18n/src/locales/en/**/*
    ignore:
      - '**/*.ts'
    translation: /packages/i18n/src/locales/%locale%/**/%original_file_name%
```

### 配置项说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `source` | `packages/i18n/src/locales/en/**/*` | 源语言文件路径（英语） |
| `ignore` | `'**/*.ts'` | 忽略 TypeScript 文件 |
| `translation` | `/packages/i18n/src/locales/%locale%/**/%original_file_name%` | 翻译文件输出路径模板 |

### 为什么忽略 `.ts` 文件？

- 项目使用 JSON 文件存储翻译文本
- `.ts` 文件可能是类型定义或工具代码，不需要翻译
- 避免上传无用文件，减少平台负担

---

## 三、工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub 仓库                              │
│  packages/i18n/src/locales/en/                              │
│  └── common.json      ← 源语言文件（英语）                    │
│  └── settings.json                                          │
└────────────────────────┬────────────────────────────────────┘
                         │ 上传源文件
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Crowdin 平台                               │
│  - 翻译人员协作翻译                                          │
│  - 机器翻译辅助                                              │
│  - 翻译记忆复用                                              │
└────────────────────────┬────────────────────────────────────┘
                         │ 下载翻译文件
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     GitHub 仓库                              │
│  packages/i18n/src/locales/                                 │
│  ├── en/           ← 英语（源）                              │
│  ├── zh-CN/        ← 简体中文                                │
│  ├── ja-JP/        ← 日语                                   │
│  └── %locale%/     ← 其他语言                                │
└─────────────────────────────────────────────────────────────┘
```

### 流程步骤

1. **上传源文件**：将 `en/` 目录下的 JSON 文件上传到 Crowdin
2. **协作翻译**：译者在 Crowdin 平台上翻译文本
3. **审核翻译**：项目维护者审核翻译质量
4. **下载翻译**：Crowdin 自动生成各语言版本文件
5. **同步仓库**：通过 GitHub 集成自动提交翻译文件

---

## 四、路径模板变量

Crowdin 支持在 `translation` 配置中使用变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `%locale%` | 语言代码 | `zh-CN`、`ja-JP`、`ko-KR` |
| `%original_file_name%` | 原文件名 | `common.json`、`settings.json` |
| `%two_letters_code%` | 两位语言代码 | `zh`、`ja`、`ko` |
| `%three_letters_code%` | 三位语言代码 | `zho`、`jpn`、`kor` |
| `%language%` | 完整语言名称 | `Chinese Simplified`、`Japanese` |

### 本项目使用的模板

```yaml
translation: /packages/i18n/src/locales/%locale%/**/%original_file_name%
```

**示例转换**：

| 源文件 | 翻译后文件（zh-CN） |
|--------|---------------------|
| `en/common.json` | `zh-CN/common.json` |
| `en/settings.json` | `zh-CN/settings.json` |
| `en/modules/chat.json` | `zh-CN/modules/chat.json` |

---

## 五、与项目集成方式

本项目通过 **Crowdin GitHub 集成** 实现自动化：

| 触发条件 | 动作 |
|----------|------|
| 推送到主分支 | 自动上传新的源文本到 Crowdin |
| 翻译完成 | Crowdin 自动创建 PR 更新翻译文件 |
| 合并 PR | 翻译文件合并到主分支 |

### 配置方式

1. 在 Crowdin 项目设置中连接 GitHub 仓库
2. 配置同步分支（通常为 `main` 或 `master`）
3. 设置翻译分支（用于创建翻译 PR）

---

## 六、实际应用场景

### 项目目录结构

```
packages/i18n/src/locales/
├── en/                    # 源语言（英语）
│   ├── common.json        # 通用翻译
│   ├── settings.json      # 设置页面翻译
│   └── modules/
│       ├── chat.json      # 聊天模块翻译
│       └── voice.json     # 语音模块翻译
├── zh-CN/                 # Crowdin 自动生成（简体中文）
│   ├── common.json
│   ├── settings.json
│   └── modules/
│       ├── chat.json
│       └── voice.json
├── ja-JP/                 # Crowdin 自动生成（日语）
│   └── ...
├── ko-KR/                 # Crowdin 自动生成（韩语）
│   └── ...
└── ...                    # 其他语言
```

### 翻译文件格式示例

**源文件** (`en/common.json`)：
```json
{
  "app": {
    "name": "AIRI",
    "description": "AI Virtual Companion"
  },
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm"
  }
}
```

**翻译文件** (`zh-CN/common.json`)：
```json
{
  "app": {
    "name": "AIRI",
    "description": "AI 虚拟伴侣"
  },
  "actions": {
    "save": "保存",
    "cancel": "取消",
    "confirm": "确认"
  }
}
```

---

## 总结

| 功能 | 说明 |
|------|------|
| **源文件管理** | 指定英语作为源语言 |
| **翻译输出** | 自动按语言代码生成目录结构 |
| **文件过滤** | 仅处理 JSON 文件，忽略 TypeScript |
| **自动化** | 与 GitHub 集成，自动同步翻译 |
| **协作翻译** | 支持多人协作，翻译记忆复用 |

Crowdin 配置让项目的国际化工作变得自动化和协作化，大大降低了多语言维护的成本。
