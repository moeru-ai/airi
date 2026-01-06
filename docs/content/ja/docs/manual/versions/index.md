---
title: バージョン一覧
description: AIRI の異なるバージョンと入手方法
---

<script setup>
import ReleaseDownloads from '../../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../../.vitepress/components/ReleasesList.vue'
</script>

AIRI は、さまざまなニーズに合わせて複数のリリースチャンネルを提供しています。最も安定した体験を求めている場合でも、最新の機能を求めている場合でも、あなたにぴったりのものが見つかります。

## 安定版とプレリリース

公式リリースには、**安定版**（徹底的にテストされており、ほとんどのユーザーに推奨されます）と**プレリリース**（テストの準備が整った新機能を備えたベータ版およびアルファ版）の両方が含まれています。

プレリリースには `-beta.X` または `-alpha.X` のサフィックスが付いています（例：`v0.7.2-beta.3`）。

<ReleaseDownloads />

### 最近の安定版とプレリリース

<ReleasesList type="releases" :limit="5" />

[GitHub で以前のすべてのリリースを見る →](https://github.com/moeru-ai/airi/releases)

## ナイトリービルド

::: warning 実験的
ナイトリービルドは**実験的**であり、バグや不安定な機能が含まれている可能性があります。自己責任で使用し、バックアップとして常に安定版を保持してください。
:::

ナイトリービルドは、最新の `main` ブランチのコードから毎日自動的に生成されます。これらには、絶対的に最新の機能とバグ修正が含まれています。

**以下のような場合に最適です：**
- 開発者および貢献者
- 最新のバグ修正のテスト
- まだリリースされていない特定の修正が必要なユーザー

### ナイトリービルドの入手方法

1. [Nightly Build Workflow](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml) ページにアクセスします
2. 最新の成功した実行（緑色のチェックマーク ✓ で示されています）をクリックします
3. **Artifacts** セクションまでスクロールダウンします
4. プラットフォーム用のビルドをダウンロードします：
   - **Windows**: `AIRI_*_x64_en-US.exe`
   - **macOS (Intel)**: `AIRI_*_x64.dmg`
   - **macOS (Apple Silicon)**: `AIRI_*_arm64.dmg`
   - **Linux (x64)**: `airi_*_amd64.deb` または `airi-*.x86_64.rpm`
   - **Linux (ARM64)**: `airi_*_arm64.deb` または `airi-*.aarch64.rpm`

::: tip
ナイトリービルドは、毎日 **00:00 UTC** に自動的に実行されます。最新の安定版で問題が発生した場合は、最新のナイトリービルドを試して、修正されているかどうかを確認してください。
:::

### 最近のナイトリービルド

<ReleasesList type="nightly-builds" :limit="5" />

[すべてのナイトリービルドを見る →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
