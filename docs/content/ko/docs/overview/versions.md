---
title: 버전
description: AIRI의 여러 버전과 받는 방법
---

<script setup>
import ReleaseDownloads from '../../../../.vitepress/components/ReleaseDownloads.vue'
import ReleasesList from '../../../../.vitepress/components/ReleasesList.vue'
</script>

## 릴리스 다운로드

<ReleaseDownloads />

### 최근 릴리스

<ReleasesList type="releases" :limit="5" />

[GitHub에서 모든 릴리스 보기 →](https://github.com/moeru-ai/airi/releases)

## 나이틀리 빌드 다운로드

::: warning 실험적
나이틀리 빌드에는 버그나 불안정한 기능이 포함될 수 있습니다. 정식 릴리스 빌드를 백업으로 남겨 두세요.
:::

나이틀리 빌드는 최신 `main` 브랜치에서 생성됩니다. 내려받으려면 아래 링크에서 가장 최근에 성공한 실행을 선택하고 **Artifacts** 섹션을 확인하세요.

### 최근 나이틀리 빌드

<ReleasesList type="nightly-builds" :limit="5" />

[나이틀리 빌드 내려받기 →](https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml)
