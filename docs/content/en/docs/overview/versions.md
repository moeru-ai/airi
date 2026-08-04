---
title: Versions and Downloads
description: The different versions of AIRI and how to get them
---


<script setup>
import ReleaseDownloads from '../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../.vitepress/components/ReleasesList.vue'
</script>


## Download Release


<ReleaseDownloads />


### Recent Releases


<ReleasesList type="releases" :limit="5" />


[View all releases on GitHub →](https://github.com/moeru-ai/airi/releases)


## Download Nightly


::: warning Experimental Features


Nightly builds may contain bugs or unstable features. Please keep a Release version as a backup.


:::


Nightly builds are generated from the latest `main` branch. Choose the most recent successful run from the links below and download the build for your platform from the **Artifacts** section.


### Recent Nightly Builds


<ReleasesList type="nightly-builds" :limit="5" />


[Download Nightly builds →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)

