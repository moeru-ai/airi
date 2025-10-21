---
title: 不同的版本
description: AIRI 的不同版本以及如何获取它们
---

<script setup>
import ReleaseDownloads from '../../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../../.vitepress/components/ReleasesList.vue'
</script>

AIRI 提供多个发布渠道以满足不同需求。无论你想要最稳定的体验还是最新的功能,我们都能满足你的需求。

## 稳定版本 & 预发布版本

正式发布版本包括**稳定版本**(经过充分测试,推荐大多数用户使用)和**预发布版本**(包含已准备好测试的新功能的 beta 和 alpha 版本)。

预发布版本会带有 `-beta.X` 或 `-alpha.X` 后缀标识(例如 `v0.7.2-beta.3`)。

<ReleaseDownloads />

### 最近的稳定版本和预发布版本

<ReleasesList type="releases" :limit="5" />

[在 GitHub 上查看所有版本 →](https://github.com/moeru-ai/airi/releases)

## 每夜构建版本 (Nightly Builds)

每夜构建版本每天自动从最新的 \`main\` 分支代码生成。它们包含最新的功能和错误修复。

::: warning 实验性功能
每夜构建版本是**实验性的**,可能包含错误或不稳定的功能。使用时请自行承担风险,并始终保留一个稳定版本作为备份。
:::

**适合以下用户:**
- 开发者和贡献者
- 测试最新的错误修复
- 需要特定修复但尚未发布的用户

### 如何获取每夜构建版本

1. 访问 [每夜构建工作流](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml) 页面
2. 点击最近一次成功的运行(以绿色对勾 ✓ 标识)
3. 向下滚动到 **Artifacts** (构建产物) 部分
4. 下载适合你平台的构建版本:
   - **Windows**: \`AIRI_*_x64_en-US.exe\`
   - **macOS (Intel)**: \`AIRI_*_x64.dmg\`
   - **macOS (Apple Silicon)**: \`AIRI_*_arm64.dmg\`
   - **Linux (x64)**: \`airi_*_amd64.deb\` 或 \`airi-*.x86_64.rpm\`
   - **Linux (ARM64)**: \`airi_*_arm64.deb\` 或 \`airi-*.aarch64.rpm\`

::: tip 提示
每夜构建版本在每天 **UTC 时间 00:00** 自动运行。如果你在最新稳定版本中遇到问题,可以尝试最新的每夜构建版本,看看问题是否已经被修复。
:::

### 最近的每夜构建版本

<ReleasesList type="nightly-builds" :limit="5" />

[查看所有每夜构建版本 →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
