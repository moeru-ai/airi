---
title: Versions
description: Different versions of AIRI and how to get them
---

<script setup>
import ReleaseDownloads from '../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../.vitepress/components/ReleasesList.vue'
</script>

## Download Releases

<ReleaseDownloads />

### Recent Releases

<ReleasesList type="releases" :limit="5" />

[View all releases on GitHub →](https://github.com/moeru-ai/airi/releases)

## Download Nightly

::: warning EXPERIMENTAL
Nightly builds may contain bugs or unstable features. Keep a release build as backup.
:::

Nightly builds are generated from the latest `main` branch.

<ReleasesList type="nightly-builds" :limit="5" />

[Download nightly builds →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
