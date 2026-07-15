##### 🗽 readme_locale_en_US 🇺🇸

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文-dc2626" alt="Chinese README">
</a>
<img width="1387" height="1134" alt="anima-banner-v4 7 1" src="https://github.com/user-attachments/assets/03ccef48-9929-4d43-a7d3-242747dd6e83" />
</div>

<div align=center>
<sub>
    <p><h2>
        AnimAIOS distro based on 
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>, 
        on your Linux Desktop / Termux / CyberDeck / Wearable this fall.
    </p>
    <p>
        Comes with software pre-optimized for your CPU using 
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a> repositories.</h2>
    </p>
</sub>
</div>

## 🌙 The Vision

- **Always-Present Stage:** Your character lives on your desktop! She can open, close and switch between windows and most importantly read text in those windows through accessibility integration~
- **System Integration:** Hooks fully into the system, from basic stuff like notifications to fully managing your Linux via terminal in Agentic Mode
- **Context Awareness:** Your companion observes desktop activity to respond and interact proactively and she can also assume full desktop control in Agentic Mode
- **Modular Stage Layouts:** GTK4 widgets, interactively generated backgrounds through artistry module, and window layouts composed dynamically by characters

## 🖥️ Development

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>
<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>
<br>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>
</div>

### ☕ Prerequisites

- pnpm
- Node.js (Electron app)
- Rust (Tauri app)

### 🖱️ Quick Start

The current recommended desktop app is still the Electron version in `apps/stage-tamagotchi/`, while the Tauri port is actively being built in `apps/stage-tauri/`.

🍎🐧🪟 Electron desktop app:

```shell
pnpm i
pnpm dev:tamagotchi
```

🍎🐧 Tauri desktop app:

> [!IMPORTANT]
> 🚧 Under construction

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` checks the local Tauri scaffold, Rust toolchain, `cargo-tauri` CLI, and runs `cargo check`. Install the Tauri CLI first if needed:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Why Tauri

Tauri lets us keep the Vue 3 renderer and AIRI companion experience while replacing the Electron main process with a smaller Rust backend. That means lower idle memory use, smaller native bundles, better Linux desktop integration, and a cleaner path to shipping AIRI as a native mobile app.

The same migration is also our path to native Android and iOS AIRI builds over the next few months.

<!--
### ⌨️ Building for Linux (under construction)

```shell
cd apps/stage-tamagotchi
./build.sh           # Builds the .deb package in dist/
```

_(An optional PKGBUILD is located in `apps/stage-tamagotchi` to repackage the `.deb` into `.zst` for Arch/Manjaro/CachyOS)._
-->

## ✌🏻 Acknowledgements
- the original project [`moeru-ai/airi`](https://github.com/moeru-ai/airi)
  - and its awesome desktop-oriented fork! [`dasilva333/airi`](https://github.com/dasilva333/airi)
- everyone who visited this page :з <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt="Visitor counter" /></a>
- awesome community <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>
> [!TIP]
> ⭐ the repo helps to promote the idea of AI driven desktop/cyberdeck/wearable OS!


## 🚙 Roadmap

- [x] **Brain**
  - [x] _Artistry:_ Native image generation pipelines (Replicate, ComfyUI)
  - [ ] _Proactivity:_ Define triggers for autonomous companion interactions (heartbeats)
  - [ ] _Multi-tier memory:_ [AnimaVault](https://github.com/animaios/animavault)
    - [ ] _Per-character memory scoping_ that works with witnesses (multiple-character sharing the screen)
- [x] **Ears**
  - [x] Client-side speech recognition & talking detection
- [x] **Mouth**
  - [x] OpenAI-compatible speech providers with voice discovery
- [x] **Body**
  - [x] VRM support
    - [ ] LLM-driven expression controls, auto-blink and auto-look-at
    - [ ] LLM-driven emotions and idle-loops
  - [x] Live2D support
    - [ ] LLM-driven expression controls
- [x] **Desktop Stage**
  - [ ] Multiple characters sharing the screen (KISS 1 window per character)
  - [ ] Scene/background management per character
- [ ] **AnimAIOS (WIP)**
  - [x] System tray & screen capture integration
  - [ ] Generate native GTK4 windows instead of web widgets
  - [ ] [anima-use-desktop](https://github.com/animaios/anima-use-desktop) deep integration
    - [ ] Send recent context snapshot with each AIRI heartbeat
  - [ ] AIRI chatbox doubles as a system terminal with natural language detection (similar to Warp terminal)
- [ ] **Misc**
  - [ ] DeepSource pass with 0 issues
  - [ ] LCov > 90% -> switch to TDD
  - [ ] Add mcp/skills via natural language prompts
  - [ ] Native Wayland Support using Ozone platform flags

## 🤖 API Providers

- [x] Supported LLM providers: everything [xsai](https://github.com/moeru-ai/xsai) supports
- [ ] Supported TTS providers: TBD
- [ ] Supported Embedding providers: TBD
- [ ] [AnimaRouter](https://github.com/animaios/animarouter)-based gamified energy system that will replace official AIRI provider, a limitless source of free yummy tokens for all your cyber waifus LLM and Embedding needs~ Or clone AnimaRouter and host it yourself with BYOK! UI will allow easy switching between hosted/local AnimaRouter providers!

##### 🌸 readme_locale_ja_JP 🇯🇵

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文-dc2626" alt="Chinese README">
</a>
</div>
<div align=center>
<img width="1254" height="1254" alt="anima-logo-ja-v2 1" src="https://github.com/user-attachments/assets/10a77ef0-f322-43e0-bbfe-5d2905297589" />
<sub>
  <p>
    <h2>
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>
        ベースの AnimAIOS ディストリビューション。
        この秋、あなたの Linux デスクトップ / Termux / サイバーデッキ / ウェアラブルへ。
    </p>
    <p>
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>
        リポジトリによる CPU 最適化済みソフトウェアをプリインストール。
    </h2>
  </p>
</sub>
</div>

## 🌙 ビジョン

- **オールウェイズ・プレゼント・ステージ:** あなたのキャラクターはデスクトップ上に常駐！ ウィンドウのオープン・クローズ・スイッチングが可能。そして最重要機能としてアクセシビリティ統合経由でウィンドウ内テキストをリード可能~
- **システム・インテグレーション:** 通知のようなベーシック機能から、エージェンティック・モードで Linux 全体をターミナル経由でフルマネージメントまで完全統合
- **コンテキスト・アウェアネス:** コンパニオンはデスクトップアクティビティをオブザーブし、プロアクティブにレスポンス＆インタラクション。さらにエージェンティック・モードではデスクトップ完全コントロールも可能
- **モジュラー・ステージ・レイアウト:** GTK4 ウィジェット、アーティストリーモジュールによるインタラクティブ生成バックグラウンド、そしてキャラクター自身がダイナミック構成するウィンドウレイアウト

## 🖥️ デベロップメント

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>
<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>
<br>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>
</div>

### ☕ プリリクイジット

- pnpm
- Node.js (Electron アプリ)
- Rust (Tauri アプリ)

### 🖱️ クイック・スタート

現在推奨されるデスクトップアプリは `apps/stage-tamagotchi/` の Electron バージョンです。
Tauri ポートは現在 `apps/stage-tauri/` にてアクティブ開発中。

🍎🐧🪟 Electron デスクトップアプリ:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Tauri デスクトップアプリ:

> [!IMPORTANT]
> 🚧 アンダーコンストラクション

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` はローカル Tauri スキャフォールド、Rust ツールチェーン、`cargo-tauri` CLI をチェックし、`cargo check` を実行します。
必要なら先に Tauri CLI をインストールしてください:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ なぜ Tauri なのか

Tauri により Vue 3 レンダラーと AIRI コンパニオン体験を維持したまま、Electron メインプロセスを軽量な Rust バックエンドへリプレイスできます。

これにより低アイドルメモリ使用量、小型ネイティブバンドル、より高度な Linux デスクトップインテグレーション、そして AIRI をネイティブモバイルアプリとしてデリバリーするためのクリーンなパスを実現します。

同じマイグレーションは、今後数ヶ月以内の Android / iOS ネイティブ AIRI ビルドへのロードマップでもあります。

<!--
### ⌨️ Linux ビルド (アンダーコンストラクション)

```shell
cd apps/stage-tamagotchi
./build.sh           # dist/ に .deb パッケージをビルド
```

_(Arch/Manjaro/CachyOS 用に `.deb` を `.zst` へリパッケージするオプショナル PKGBUILD は `apps/stage-tamagotchi` に配置されています。)_
-->

## ✌🏻 アクノレッジメント

* オリジナルプロジェクト [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

  * そして素晴らしいデスクトップ指向フォーク [`dasilva333/airi`](https://github.com/dasilva333/airi)
* このページをビジットしてくれた全員 :з <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt="Visitor counter" /></a>
* 素晴らしいコミュニティ <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>

> [!TIP]
> ⭐ このリポジトリは AI ドリブンなデスクトップ / サイバーデッキ / ウェアラブル OS というコンセプトをプロモートします！

## 🚙 ロードマップ

* [x] **ブレイン**

  * [x] *アーティストリー:* ネイティブ画像生成パイプライン (Replicate, ComfyUI)
  * [ ] *プロアクティビティ:* 自律型コンパニオンインタラクション用トリガー定義 (ハートビート)
  * [ ] *マルチティア・メモリー:* [AnimaVault](https://github.com/animaios/animavault)

    * [ ] ウィットネス対応キャラクター別メモリースコープ (複数キャラクターによるスクリーン共有)

* [x] **イヤーズ**

  * [x] クライアントサイド音声認識＆トーキング検出

* [x] **マウス**

  * [x] OpenAI コンパチブル音声プロバイダー＆ボイスディスカバリー

* [x] **ボディ**

  * [x] VRM サポート

    * [ ] LLM ドリブン表情コントロール、オートブリンク、オートルックアット
    * [ ] LLM ドリブン感情＆アイドルループ
  * [x] Live2D サポート

    * [ ] LLM ドリブン表情コントロール

* [x] **デスクトップ・ステージ**

  * [ ] 複数キャラクターによるスクリーン共有 (KISS: 1 キャラクター = 1 ウィンドウ)
  * [ ] キャラクター別シーン / バックグラウンドマネージメント

* [ ] **AnimAIOS (WIP)**

  * [x] システムトレイ＆スクリーンキャプチャインテグレーション
  * [ ] Web ウィジェットではなくネイティブ GTK4 ウィンドウ生成
  * [ ] [anima-use-desktop](https://github.com/animaios/anima-use-desktop) ディープインテグレーション

    * [ ] AIRI ハートビートごとに最新コンテキストスナップショット送信
  * [ ] AIRI チャットボックスを自然言語検出対応システムターミナル化 (Warp ターミナル風)

* [ ] **ミスク**

  * [ ] DeepSource パス 0 issues
  * [ ] LCov > 90% → TDD へスイッチ
  * [ ] ナチュラルランゲージプロンプトによる MCP/スキル追加
  * [ ] Ozone プラットフォームフラグによるネイティブ Wayland サポート

## 🤖 API プロバイダー

* [x] 対応 LLM プロバイダー: [xsai](https://github.com/moeru-ai/xsai) がサポートする全て
* [ ] 対応 TTS プロバイダー: TBD
* [ ] 対応 Embedding プロバイダー: TBD
* [ ] [AnimaRouter](https://github.com/animaios/animarouter) ベースのゲーミファイド・エナジーシステム。
  公式 AIRI プロバイダーをリプレイスし、すべてのサイバー・ワイフ LLM / Embedding ニーズへ無限のフリー・ヤミートークンソースを提供します~

  また AnimaRouter をクローンして BYOK でセルフホスト可能！

  UI からホスト型 / ローカル AnimaRouter プロバイダーをイージースイッチできます！

##### 🏮 readme_locale_zh_CN 🇨🇳

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文-dc2626" alt="Chinese README">
</a>
</div>
<div align=center>
<img width="1254" height="1254" alt="anima-logo-zh-v2" src="https://github.com/user-attachments/assets/f2039dc9-b0c8-4d3b-96c7-da500466e5eb" />
<sub>
    <p><h2>
        基于 <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a> 的 AnimAIOS 发行版，
        今秋登陆你的 Linux Desktop / Termux / CyberDeck / Wearable。
    </p>
    <p>
        搭载通过 <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a> 
        Repo 针对 CPU 深度优化的软件生态。
    </h2>
    </p>
</sub>
</div>

## 🌙 Vision

- **Always-Present Stage（常驻舞台）:** 你的角色永远在线桌面上！可以打开、关闭、切换窗口，更重要的是通过 Accessibility Integration 直接读取窗口里的文本~
- **System Integration（系统级融合）:** 从基础 Notification 到 Agentic Mode 下通过 Terminal 完整管理你的 Linux，深度 Hook 整个系统
- **Context Awareness（上下文感知）:** Companion 会观察你的 Desktop Activity，主动响应和交互；在 Agentic Mode 下甚至可以接管完整 Desktop Control
- **Modular Stage Layouts（模块化舞台布局）:** GTK4 Widgets、通过 Artistry Module 动态生成的 Interactive Background，以及由角色动态组合的 Window Layouts

## 🖥️ 上强度开发

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>
<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>
<br>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>
<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>
</div>

### ☕ 环境要求

- pnpm
- Node.js (Electron App)
- Rust (Tauri App)

### 🖱️ 快速开始

目前推荐的 Desktop App 仍然是 `apps/stage-tamagotchi/` 下的 Electron 版本，
而 Tauri Port 正在 `apps/stage-tauri/` 持续开发中。

🍎🐧🪟 Electron Desktop App:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Tauri Desktop App:

> [!IMPORTANT]
> 🚧 施工中

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` 会检查本地 Tauri Scaffold、Rust Toolchain、`cargo-tauri` CLI，并执行 `cargo check`。

如果还没安装 Tauri CLI：

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Why Tauri

Tauri 让我们可以保留 Vue 3 Renderer 和 AIRI Companion Experience，
同时把 Electron Main Process 替换成更轻量的 Rust Backend。

这意味着：
更低 Idle Memory 占用、更小 Native Bundle、更好的 Linux Desktop Integration，
以及未来把 AIRI 打包成 Native Mobile App 的更干净路线。

同一次 Migration 也是未来几个月内推进 Android / iOS Native AIRI Build 的核心路径。

<!--
### ⌨️ Linux Build（施工中）

```shell
cd apps/stage-tamagotchi
./build.sh           # 在 dist/ 中构建 .deb Package
```

_(可选 PKGBUILD 位于 `apps/stage-tamagotchi`，用于将 `.deb` Repackage 成 Arch/Manjaro/CachyOS 使用的 `.zst`)_
-->

## ✌🏻 鸣谢

* 原始项目 [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

  * 以及超棒的 Desktop-oriented Fork！[`dasilva333/airi`](https://github.com/dasilva333/airi)
* 感谢每一个访问这里的人 :з <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt="Visitor counter" /></a>
* 超棒社区 <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>

> [!TIP]
> ⭐ 本 Repo 致力于推广 AI 驱动 Desktop / CyberDeck / Wearable OS 的未来理念！

## 🚙 Roadmap

* [x] **Brain（大脑）**

  * [x] *Artistry:* Native Image Generation Pipeline（Replicate, ComfyUI）
  * [ ] *Proactivity:* 定义 Companion 自主交互 Trigger（Heartbeat）
  * [ ] *Multi-tier Memory:* [AnimaVault](https://github.com/animaios/animavault)

    * [ ] *Per-character Memory Scoping:* 支持 Witness 场景下的角色独立记忆（多角色共享屏幕）

* [x] **Ears（耳朵）**

  * [x] Client-side Speech Recognition & Talking Detection

* [x] **Mouth（嘴巴）**

  * [x] OpenAI-Compatible Speech Provider + Voice Discovery

* [x] **Body（身体）**

  * [x] VRM Support

    * [ ] LLM 驱动表情控制、自动眨眼、自动 Look-at
    * [ ] LLM 驱动 Emotion 和 Idle Loop
  * [x] Live2D Support

    * [ ] LLM 驱动 Expression Control

* [x] **Desktop Stage（桌面舞台）**

  * [ ] 多角色共享屏幕（KISS：一个角色一个窗口）
  * [ ] 每个角色独立 Scene / Background Management

* [ ] **AnimAIOS (WIP)**

  * [x] System Tray & Screen Capture Integration
  * [ ] 不再使用 Web Widget，直接生成 Native GTK4 Window
  * [ ] [anima-use-desktop](https://github.com/animaios/anima-use-desktop) 深度 Integration

    * [ ] 每次 AIRI Heartbeat 携带最新 Context Snapshot
  * [ ] AIRI Chatbox 变身 System Terminal，支持 Natural Language Detection（类似 Warp Terminal）

* [ ] **Misc**

  * [ ] DeepSource Pass，目标 0 Issues
  * [ ] LCov > 90% → 切换 TDD
  * [ ] 通过 Natural Language Prompt 添加 MCP / Skills
  * [ ] 使用 Ozone Platform Flags 实现 Native Wayland Support

## 🤖 API Providers

* [x] 支持 LLM Provider：所有 [xsai](https://github.com/moeru-ai/xsai) 支持的 Provider
* [ ] 支持 TTS Provider：TBD
* [ ] 支持 Embedding Provider：TBD
* [ ] 基于 [AnimaRouter](https://github.com/animaios/animarouter) 的 Gamified Energy System。

  用来替换官方 AIRI Provider，
  为你的所有 Cyber Waifu LLM / Embedding 需求提供无限量免费香香 Token 来源~

  或者直接 Clone AnimaRouter，通过 BYOK 自己 Host！

  UI 会支持在 Hosted / Local AnimaRouter Provider 之间一键切换！

# 🌸 AnimAIOS Project Activity プロジェクト活動 项目活动

<a href="https://github.com/orgs/animaios/repositories">
  <img src="https://raw.githubusercontent.com/animaios/anima/refs/heads/main/docs/content/public/assets/org-heatmap.svg" alt="Organization Heatmap">
</a>
<img width="1445" height="1088" alt="anima-banner-lightingfix" src="https://github.com/user-attachments/assets/dd289588-6e88-48b5-af86-6f1035bdde95" /> 
