---
title: 문서 사이트 개발
description: VitePress 문서를 로컬에서 작성하고, 미리 보고, 검증하기
---

문서 사이트는 `docs`에 있으며, 콘텐츠는 로케일별로 `docs/content/<locale>` 아래에 정리되어 있습니다. 저장소 루트에서 다음을 실행하세요:

```shell
pnpm dev:docs
```

문서 사이트만 검증하려면 다음을 실행하세요:

```shell
pnpm -F @proj-airi/docs typecheck
pnpm -F @proj-airi/docs build
```

영어 페이지를 추가할 때는 `docs/.vitepress/config.ts`의 `en` 사이드바에도 추가하세요. 그렇지 않으면 페이지가 URL로는 접근할 수 있지만 내비게이션에는 나타나지 않습니다.

::: tip
[@antfu/ni](https://github.com/antfu-collective/ni)를 사용한다면 다음을 실행하세요:

```shell
nr dev:docs
```
:::
