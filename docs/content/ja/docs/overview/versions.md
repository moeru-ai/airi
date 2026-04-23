---
title: バージョン一覧
description: AIRI の異なるバージョンと入手方法
---

<script setup>
import ReleaseDownloads from '../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../.vitepress/components/ReleasesList.vue'
</script>

## Release をダウンロード

<ReleaseDownloads />

### 最近の Release

<ReleasesList type="releases" :limit="5" />

[GitHub で以前のすべてのリリースを見る →](https://github.com/moeru-ai/airi/releases)

## Nightly をダウンロード

::: warning 実験的
Nightly ビルドにはバグや不安定な機能が含まれる可能性があります。Release ビルドをバックアップとして残してください。
:::

Nightly ビルドは最新の `main` ブランチから生成されます。

<ReleasesList type="nightly-builds" :limit="5" />

[Nightly ビルドをダウンロード →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
