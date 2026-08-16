---
title: 기여하기
description: Project AIRI에 기여하기
---

안녕하세요! 이 프로젝트에 기여하는 데 관심을 가져 주셔서 감사합니다. 이 가이드가 첫걸음을 도와드릴 거예요.

## 사전 준비물

- [Git](https://git-scm.com/downloads)
- [Node.js 23+](https://nodejs.org/en/download/)
- [corepack](https://github.com/nodejs/corepack)
- [pnpm](https://pnpm.io/installation)

<details>
<summary>Windows 설정</summary>

0. [Visual Studio](https://visualstudio.microsoft.com/downloads/) 를 내려받고 다음 안내를 따르세요: https://rust-lang.github.io/rustup/installation/windows-msvc.html#walkthrough-installing-visual-studio-2022

   > Visual Studio를 설치할 때 Windows SDK와 C++ 빌드 도구를 반드시 함께 설치하세요.

1. PowerShell을 엽니다
2. [`scoop`](https://scoop.sh/) 을 설치합니다

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. `scoop`으로 `git`, Node.js, `rustup`, `msvc`를 설치합니다

   ```powershell
   scoop install git nodejs rustup

   # Rust 의존성용
   # crates나 apps/tamagotchi를 개발하지 않는다면 필요 없습니다
   scoop install main/rust-msvc
   # Rust & Windows 전용
   rustup toolchain install stable-x86_64-pc-windows-msvc
   rustup default stable-x86_64-pc-windows-msvc
   ```

4. `corepack`으로 `pnpm`을 설치합니다

   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>macOS 설정</summary>

0. 터미널(또는 iTerm2, Ghostty, Kitty 등)을 엽니다
1. `brew`로 `git`과 `node`를 설치합니다

   ```shell
   brew install git node
   ```

2. `corepack`으로 `pnpm`을 설치합니다

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>Linux 설정</summary>

0. 터미널을 엽니다
1. [nodesource/distributions: NodeSource Node.js Binary Distributions](https://github.com/nodesource/distributions?tab=readme-ov-file#table-of-contents)를 따라 `node`를 설치합니다
2. [Git](https://git-scm.com/downloads/linux) 안내를 따라 `git`을 설치합니다
3. `corepack`으로 `pnpm`을 설치합니다

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
4. 데스크톱 버전 개발을 돕고 싶다면 다음 의존성이 필요합니다:
   ```shell
   sudo apt install \
      libssl-dev \
      libglib2.0-dev \
      libgtk-3-dev \
      libjavascriptcoregtk-4.1-dev \
      libwebkit2gtk-4.1-dev
   ```

</details>

## 이전에 이미 이 프로젝트에 기여한 적이 있다면

::: warning

아직 이 저장소를 클론하지 않았다면 이 섹션은 건너뛰세요.

:::

로컬 저장소가 업스트림 저장소와 최신 상태인지 확인하세요:

```shell
git fetch --all
git checkout main
git pull upstream main --rebase
```

작업 브랜치가 있다면, 그 브랜치를 업스트림 저장소 기준으로 최신화하려면:

```shell
git checkout <your-branch-name>
git rebase main
```

## 이 프로젝트를 포크하기

[moeru-ai/airi](https://github.com/moeru-ai/airi) 페이지 오른쪽 위의 **Fork** 버튼을 클릭하세요.

## 클론하기

```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## 작업 브랜치 만들기

```shell
git checkout -b <your-branch-name>
```

## 의존성 설치

```shell
corepack enable
pnpm install

# Rust 의존성용
# crates 나 apps/tamagotchi 를 개발하지 않는다면 필요 없습니다
cargo fetch
```

::: tip

스크립트를 더 간단히 쓰기 위해 [@antfu/ni](https://github.com/antfu-collective/ni) 설치를 권장합니다.

```shell
corepack enable
npm i -g @antfu/ni
```

설치하고 나면

- `pnpm install`, `npm install`, `yarn install` 대신 `ni`를 쓸 수 있습니다.
- `pnpm run`, `npm run`, `yarn run` 대신 `nr`을 쓸 수 있습니다.

패키지 매니저가 무엇인지 신경 쓸 필요가 없습니다. `ni`가 알맞은 것을 골라 줍니다.
:::

## 개발하고 싶은 애플리케이션 고르기

## 커밋

### 커밋하기 전에

::: warning

lint(정적 검사기)와 TypeScript 컴파일러를 모두 통과했는지 확인해 주세요:

```shell
pnpm lint && pnpm typecheck
```

:::

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni)를 설치했다면 `nr`로 명령을 실행할 수 있습니다:

```shell
nr lint && nr typecheck
```

:::

### 커밋

```shell
git add .
git commit -m "<your-commit-message>"
```

### 포크한 저장소로 푸시

```shell
git push origin <your-branch-name> -u
```

포크한 저장소에서 해당 브랜치를 확인할 수 있습니다.

::: tip

이 프로젝트에 처음 기여하는 것이라면 업스트림 저장소도 추가해야 합니다:

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```

:::

## Pull Request 만들기

[moeru-ai/airi](https://github.com/moeru-ai/airi) 페이지로 이동해 **Pull requests** 탭을 클릭하고, **New pull request** 버튼을 누른 뒤 **Compare across forks** 링크를 클릭해 포크한 저장소를 선택하세요.

변경 사항을 검토한 뒤 **Create pull request** 버튼을 클릭합니다.

## 우와! 해내셨네요!

축하합니다! 이 프로젝트에 첫 기여를 하셨습니다. 이제 메인테이너가 여러분의 Pull Request를 리뷰할 때까지 기다리시면 됩니다.
