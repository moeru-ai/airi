---
title: 개발 환경 설정과 첫 기여
description: Project AIRI를 로컬에서 실행하고 첫 Pull Request 제출하기
---

안녕하세요! Project AIRI에 기여하는 데 관심을 가져 주셔서 감사합니다. 이 가이드는 로컬 개발 환경을 설정하고, 브랜치를 만들고, 첫 Pull Request를 제출하는 방법을 설명합니다.

::: info 적용 범위
이 섹션은 소스 코드, 문서, 디자인 리소스를 변경하려는 컨트리뷰터를 위한 내용입니다. AIRI를 사용하기만 하려면 사용자 매뉴얼부터 시작하세요. 앱에 내장된 디버깅 도구는 [개발자 도구](./desktop-developer-tools)를 참고하세요.
:::

## 사전 준비물

- [Git](https://git-scm.com/downloads)
- [mise](https://mise.jdx.dev/installing-mise.html) 또는 `.tool-versions`를 읽는 다른 버전 관리자
- [Corepack](https://github.com/nodejs/corepack) — 최신 Node.js 릴리스에 포함되어 있습니다

이 저장소는 [`.tool-versions`](https://github.com/moeru-ai/airi/blob/main/.tool-versions)에 Node.js 버전을 고정해 둡니다(현재 24.13.0). 시스템 패키지 매니저가 제공하는 버전에 의존하지 말고, 클론한 뒤 고정된 버전을 설치하세요.

<details>
<summary>Windows 설정</summary>

1. PowerShell을 여세요.
2. [`scoop`](https://scoop.sh/)을 설치하세요.

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. Scoop으로 Git과 mise를 설치하세요.

   ```powershell
   scoop install git mise
   ```

</details>

<details>
<summary>macOS 설정</summary>

1. 터미널, iTerm2, Ghostty, Kitty 등 원하는 터미널을 여세요.
2. Homebrew로 Git과 mise를 설치하세요.

   ```shell
   brew install git mise
   ```

</details>

<details>
<summary>Linux 설정</summary>

1. 터미널을 여세요.
2. [Linux용 Git 설치 안내](https://git-scm.com/downloads/linux)를 따르세요.
3. [배포판에 맞는 패키지 또는 설치 방법](https://mise.jdx.dev/installing-mise.html)으로 mise를 설치하세요.

</details>

## 이전에 기여한 적이 있다면

::: tip
아직 저장소를 클론하지 않았다면 이 섹션은 건너뛰세요.
:::

업스트림 변경 사항을 가져와 로컬 `main` 브랜치를 리베이스하세요:

```shell
git fetch --all
git switch main
git pull upstream main --rebase
```

이미 작업 브랜치가 있다면 `main` 기준으로 최신화하세요:

```shell
git switch <your-branch-name>
git rebase main
```

## 이 프로젝트를 포크하기

[moeru-ai/airi](https://github.com/moeru-ai/airi) 저장소 페이지 오른쪽 위의 **Fork**를 클릭해 자신의 계정 아래에 복사본을 만드세요.

## 포크한 저장소 클론하기

```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## 작업 브랜치 만들기

```shell
git switch -c <your-branch-name>
```

## 의존성 설치

저장소 루트에서 `.tool-versions`에 기록된 Node.js 버전을 설치하고, 버전을 확인하고, Corepack을 활성화한 뒤 의존성을 설치하세요:

```shell
mise install
mise exec -- node --version
mise exec -- corepack enable
mise exec -- pnpm install
```

출력된 Node.js 버전이 `.tool-versions`와 일치해야 합니다. 이후 예시는 [셸에서 mise가 활성화되어 있다고](https://mise.jdx.dev/dev-tools/shims.html) 가정합니다. 그렇지 않다면 패키지 매니저 명령을 `mise exec --`를 통해 실행하세요(예: `mise exec -- pnpm typecheck`).

::: tip
패키지 매니저 명령을 간단하게 쓰고 싶다면 [@antfu/ni](https://github.com/antfu-collective/ni)를 선택적으로 설치할 수 있습니다:

```shell
mise exec -- npm install --global @antfu/ni
```

설치하고 나면:

- `pnpm install`, `npm install`, `yarn install` 대신 `ni`를 사용하세요.
- `pnpm run`, `npm run`, `yarn run` 대신 `nr`을 사용하세요.

`ni`는 저장소가 사용하는 패키지 매니저를 감지합니다.
:::

## 변경 사항 커밋하기

### 커밋하기 전에 검증하기

코드가 lint와 타입 검사를 통과하는지 확인하세요:

```shell
pnpm lint
pnpm typecheck
```

::: tip
[@antfu/ni](https://github.com/antfu-collective/ni)를 설치했다면 다음을 실행하세요:

```shell
nr lint && nr typecheck
```
:::

### 커밋 만들기

```shell
git add <changed-files>
git commit -m "<your-commit-message>"
```

### 브랜치 푸시하기

```shell
git push -u origin <your-branch-name>
```

이제 GitHub에서 해당 브랜치를 확인할 수 있습니다.

::: tip
처음 기여하는 것이라면 Project AIRI 저장소를 `upstream` 원격으로 추가하세요:

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```
:::

## Pull Request 만들기

[moeru-ai/airi](https://github.com/moeru-ai/airi) 저장소 페이지를 여세요:

1. **Pull requests**를 클릭하세요.
2. **New pull request**를 클릭하세요.
3. **Compare across forks**를 클릭하세요.
4. 포크한 저장소와 작업 브랜치를 선택하세요.
5. 변경 사항을 검토한 뒤 **Create pull request**를 클릭하세요.

## 해내셨습니다!

첫 기여를 제출하신 것을 축하합니다. 이제 프로젝트 메인테이너가 여러분의 Pull Request를 리뷰할 수 있습니다.
