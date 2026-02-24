# bumpp 版本发布工具配置详解

## 什么是 bumpp？

bumpp 是一个智能的版本发布工具，用于自动化项目的版本号更新流程。它能够：

- 自动更新 `package.json` 中的版本号
- 创建 Git commit 和 tag
- 支持多包项目（Monorepo）递归更新
- 执行自定义钩子函数

## 配置文件核心代码注释

以下是项目中 `bump.config.ts` 的核心代码，带有详细注释：

```typescript
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { defineConfig } from 'bumpp'      // bumpp 配置定义函数
import { parse, stringify } from 'smol-toml'  // TOML 文件解析库
import { x } from 'tinyexec'              // 轻量级命令执行工具

export default defineConfig({
  // 递归更新：在 Monorepo 中递归更新所有子包的版本号
  recursive: true,

  // 提交信息模板：%s 会被替换为新版本号
  // 例如：release: v1.2.3
  commit: 'release: v%s',

  // 使用 GPG 签名提交，确保提交的完整性和可信度
  sign: true,

  // 是否自动推送到远程仓库
  // 设为 false，允许开发者手动推送，增加发布前的检查机会
  push: false,

  // 是否暂存所有更改文件
  // true 表示将所有未提交的更改都包含在发布提交中
  all: true,

  // 执行钩子：在版本更新后、提交创建前执行
  // 这是实现 JavaScript 与 Rust 版本同步的核心逻辑
  execute: async () => {
    // 步骤1: 执行发布预检（dry-run 模式）
    // -r: 递归发布所有包
    // --access public: 公开包的访问权限
    // --no-git-checks: 跳过 git 检查
    // --dry-run: 仅模拟，不实际发布
    await x('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', '--dry-run'])

    // 步骤2: 读取 Cargo.toml（Rust 工作空间配置）
    const cargoTomlFile = await readFile(join(cwd(), 'Cargo.toml'))
    const cargoToml = parse(cargoTomlFile.toString('utf-8')) as {
      workspace?: {
        package?: {
          version?: string
        }
      }
    }

    // 步骤3: 验证 Cargo.toml 结构
    if (typeof cargoToml !== 'object' || cargoToml === null) {
      throw new TypeError('Cargo.toml does not contain a valid object')
    }
    if (typeof cargoToml.workspace?.package?.version !== 'string') {
      throw new TypeError('Cargo.toml does not contain a valid version in workspace.package.version')
    }

    // 步骤4: 读取 package.json 获取新版本号
    const packageJSONFile = join(cwd(), 'package.json')
    const packageJSON = JSON.parse(await readFile(packageJSONFile, 'utf-8'))
    if (typeof packageJSON?.version !== 'string' || packageJSON?.version === null) {
      throw new TypeError('package.json does not contain a valid version')
    }

    // 步骤5: 将 package.json 的版本号同步到 Cargo.toml
    cargoToml.workspace.package.version = packageJSON.version
    console.info(`Bumping Cargo.toml version to ${cargoToml.workspace.package.version} (from package.json, ${packageJSON.version})`)

    // 步骤6: 写入更新后的 Cargo.toml
    await writeFile(join(cwd(), 'Cargo.toml'), stringify(cargoToml))

    // 步骤7: 重新生成 Cargo.lock 确保依赖锁定文件同步
    await x('cargo', ['generate-lockfile'])
  },
})
```

## 配置项说明

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `recursive` | boolean | 是否递归更新 Monorepo 中所有包的版本 |
| `commit` | string | Git 提交信息模板，`%s` 替换为版本号 |
| `sign` | boolean | 是否使用 GPG 签名提交 |
| `push` | boolean | 是否自动推送到远程仓库 |
| `all` | boolean | 是否包含所有未暂存的更改 |
| `execute` | function | 版本更新后执行的自定义钩子函数 |

## 版本同步流程

```
┌─────────────────────────────────────────────────────────────┐
│                    执行 bump 命令                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. bumpp 更新 package.json 版本号                           │
│     "version": "1.0.0" → "1.0.1"                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. execute 钩子触发                                         │
│     ├── pnpm publish --dry-run (发布预检)                    │
│     ├── 读取 Cargo.toml                                      │
│     ├── 读取 package.json 获取新版本                         │
│     └── 将版本同步到 Cargo.toml                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 创建 Git commit 和 tag                                   │
│     commit: "release: v1.0.1"                               │
│     tag: "v1.0.1"                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 手动推送（push: false）                                   │
│     git push && git push --tags                             │
└─────────────────────────────────────────────────────────────┘
```

## 为什么需要版本同步？

本项目是一个混合技术栈的 Monorepo：

- **JavaScript/TypeScript 生态**：使用 `package.json` 管理版本
- **Rust 生态**：使用 `Cargo.toml` 管理版本

bumpp 默认只更新 `package.json`，但项目的 Rust crates 需要保持版本一致。通过 `execute` 钩子，我们实现了：

1. 从已更新的 `package.json` 读取新版本
2. 同步写入 `Cargo.toml` 的 `workspace.package.version`
3. 重新生成 `Cargo.lock` 确保依赖锁定

## 使用方式

```bash
# 交互式选择版本号
pnpm run release

# 或直接指定版本类型
pnpm run release patch  # 1.0.0 → 1.0.1
pnpm run release minor  # 1.0.0 → 1.1.0
pnpm run release major  # 1.0.0 → 2.0.0
```

## 相关依赖

- **bumpp**: 版本发布工具，`bumpp` 的后续版本
- **smol-toml**: 轻量级 TOML 解析库，用于读写 Cargo.toml
- **tinyexec**: 轻量级命令执行工具，用于运行 shell 命令
