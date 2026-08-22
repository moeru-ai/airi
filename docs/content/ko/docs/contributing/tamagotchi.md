---
title: 데스크톱 개발
description: Electron 데스크톱 앱 실행, 검사, 빌드
---

데스크톱 앱은 `apps/stage-tamagotchi`에 있습니다. 저장소 루트에서 다음을 실행하세요:

```shell
pnpm dev:tamagotchi
```

이 명령은 Electron 개발 환경을 시작합니다. 데스크톱 페이지를 변경하기 전에, 관련 공유 컴포넌트나 상태가 이미 `packages/stage-ui`에 있는지 확인하세요. 웹 앱과 데스크톱 앱이 함께 사용하는 로직은 보통 공유 패키지에 두어야 합니다.

## 검증

```shell
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/stage-tamagotchi build
```

**System → Developer** 메뉴와 각 디버깅 도구의 용도는 [개발자 도구](./desktop-developer-tools)를 참고하세요.

::: tip
[@antfu/ni](https://github.com/antfu-collective/ni)를 사용한다면 다음을 실행하세요:

```shell
nr dev:tamagotchi
```
:::
