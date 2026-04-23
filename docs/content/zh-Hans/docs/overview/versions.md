---
title: 版本与下载
description: AIRI 的不同版本以及如何获取它们
---

<script setup>
import ReleaseDownloads from '../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../.vitepress/components/ReleasesList.vue'
</script>

## 下载 Release

<ReleaseDownloads />

### 最近的 Release

<ReleasesList type="releases" :limit="5" />

[在 GitHub 上查看所有版本 →](https://github.com/moeru-ai/airi/releases)

## 下载 Nightly

::: warning 实验性功能
Nightly 构建可能包含错误或不稳定功能。请保留 Release 版本作为备份。
:::

Nightly 构建从最新的 `main` 分支生成。

<ReleasesList type="nightly-builds" :limit="5" />

[下载 Nightly 构建 →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
