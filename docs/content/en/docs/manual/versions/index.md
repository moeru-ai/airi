---
title: Versions
description: Different versions of AIRI and how to get them
---

<script setup>
import ReleaseDownloads from '../../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../../.vitepress/components/ReleasesList.vue'
</script>

AIRI offers multiple release channels to suit different needs. Whether you want the most stable experience or the latest features, we've got you covered.

## Stable Releases & Pre-releases

Official releases include both **stable** versions (thoroughly tested and recommended for most users) and **pre-releases** (beta and alpha versions with new features ready for testing).

Pre-releases are tagged with `-beta.X` or `-alpha.X` suffixes (e.g., `v0.7.2-beta.3`).

<ReleaseDownloads />

### Recent Stable & Pre-release Versions

<ReleasesList type="releases" :limit="5" />

[View all releases on GitHub →](https://github.com/moeru-ai/airi/releases)

## Nightly Builds

::: warning EXPERIMENTAL
Nightly builds are **experimental** and may contain bugs or unstable features. Use them at your own risk and always keep a stable version as backup.
:::

Nightly builds are automatically generated every day from the latest `main` branch code. They contain the absolute newest features and bug fixes.

**Best for:**
- Developers and contributors
- Testing the latest bug fixes
- Users who need a specific fix that hasn't been released yet

### How to Get Nightly Builds

1. Visit the [Nightly Build Workflow](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml) page
2. Click on the most recent successful run (indicated by a green checkmark ✓)
3. Scroll down to the **Artifacts** section
4. Download the build for your platform:
   - **Windows**: `AIRI_*_x64_en-US.exe`
   - **macOS (Intel)**: `AIRI_*_x64.dmg`
   - **macOS (Apple Silicon)**: `AIRI_*_arm64.dmg`
   - **Linux (x64)**: `airi_*_amd64.deb` or `airi-*.x86_64.rpm`
   - **Linux (ARM64)**: `airi_*_arm64.deb` or `airi-*.aarch64.rpm`

::: tip
Nightly builds run automatically at **00:00 UTC** every day. If you encounter an issue with the latest stable release, try the latest nightly build to see if it has been fixed.
:::

### Recent Nightly Builds

<ReleasesList type="nightly-builds" :limit="5" />

[View all nightly builds →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
