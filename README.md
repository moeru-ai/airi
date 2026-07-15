##### 🗽🦅 readme_locale_en_US 🇺🇸

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English%20(US)-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20(JP)-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20(CN)-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia--me-Português%20(BR)-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez--moi-Français%20(FR)-0055A4" alt="README en Français">
</a>
<img width="1387" height="1134" alt="anima-banner-v4 7 1" src="https://github.com/user-attachments/assets/03ccef48-9929-4d43-a7d3-242747dd6e83" />
<sub>
    <p><h2>
        AnimAIOS distro based on 
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>, 
        <br>
        on your Linux Desktop / Termux / CyberDeck / Wearable, this fall.
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

##### 🌸⛩️ readme_locale_ja_JP 🇯🇵

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English%20(US)-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20(JP)-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20(CN)-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia--me-Português%20(BR)-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez--moi-Français%20(FR)-0055A4" alt="README en Français">
</a>
<img width="1254" height="1254" alt="anima-logo-ja-v2 2" src="https://github.com/user-attachments/assets/cb958041-4f9c-4801-b8f5-f23a35e36fb6" />
<sub>
  <p>
    <h2>
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>
        ベースの AnimAIOS ディストリビューション。
        <br>
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

##### 🏮🐼 readme_locale_zh_CN 🇨🇳

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English%20(US)-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20(JP)-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20(CN)-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia--me-Português%20(BR)-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez--moi-Français%20(FR)-0055A4" alt="README en Français">
</a>
<img width="1254" height="1254" alt="anima-logo-zh-v2 1" src="https://github.com/user-attachments/assets/2a8e25c3-2c8d-45d8-a142-6f6c245da7f9" />  
  <sub>
    <p><h2>
        基于 <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a> 的 AnimAIOS 发行版，
        <br>
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

##### 🌴⚽ readme_locale_pt_BR 🇧🇷

<div align=center>
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English%20(US)-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20(JP)-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20(CN)-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia--me-Português%20(BR)-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez--moi-Français%20(FR)-0055A4" alt="README en Français">
</a>
<img width="1254" height="1254" alt="animaios-logo-pt-v1" src="https://github.com/user-attachments/assets/23676b56-3798-45f4-a3b7-d2fa013847cf" />
<sub>
    <p><h2>
        A distro AnimAIOS baseada no
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>,
        <br>
        pro seu Desktop Linux / Termux / CyberDeck / Wearable, chegando neste outono.
    </p>
    <p>
        Já vem com os pacotes pré-otimizados pro seu CPU usando os repositórios do
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.</h2>
    </p>
</sub>
</div>

## 🌙 A Visão

* **Stage Sempre Online:** Sua personagem vive no seu desktop! Ela consegue abrir, fechar e trocar janelas e, o mais importante, ler o texto delas via integração com acessibilidade~
* **Integração Total com o Sistema:** Hooka direto no sistema inteiro, desde notificações até controlar seu Linux completamente pelo terminal no Modo Agentic.
* **Consciência de Contexto:** Sua companion acompanha o que acontece no desktop pra responder e interagir de forma proativa, e também pode assumir controle total do desktop no Modo Agentic.
* **Layouts Modulares de Stage:** Widgets GTK4, backgrounds gerados em tempo real pelo módulo de artistry e layouts de janelas montados dinamicamente por cada personagem.

## 🖥️ Desenvolvimento

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

### ☕ Pré-requisitos

* pnpm
* Node.js (app Electron)
* Rust (app Tauri)

### 🖱️ Começando Rapidão

Atualmente a versão recomendada ainda é a app Electron em `apps/stage-tamagotchi/`, enquanto o port pra Tauri tá sendo desenvolvido ativamente em `apps/stage-tauri/`.

🍎🐧🪟 App desktop Electron:

```shell
pnpm i
pnpm dev:tamagotchi
```

🍎🐧 App desktop Tauri:

> [!IMPORTANT]
> 🚧 Em construção

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

O `./init.sh` verifica o scaffold local do Tauri, a toolchain Rust, a CLI `cargo-tauri` e executa `cargo check`. Se precisar, instala primeiro a CLI do Tauri:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Por que Tauri?

O Tauri permite manter o renderer em Vue 3 e toda a experiência da companion AIRI enquanto substitui o processo principal do Electron por um backend Rust muito mais leve. Resultado: menos RAM parada, binários menores, integração muito melhor com desktops Linux e um caminho bem mais limpo pra lançar a AIRI como app nativa no mobile.

Essa migração também é o primeiro passo pra builds nativas da AIRI no Android e iOS nos próximos meses.

<!--
### ⌨️ Build para Linux (em construção)

```shell
cd apps/stage-tamagotchi
./build.sh           # Gera o pacote .deb em dist/
```

_(Um PKGBUILD opcional fica em `apps/stage-tamagotchi` para reempacotar o `.deb` em `.zst` para Arch/Manjaro/CachyOS)._
-->

## ✌🏻 Agradecimentos

* o projeto original [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

  * e seu fork focado em desktop simplesmente brabo! [`dasilva333/airi`](https://github.com/dasilva333/airi)
* todo mundo que passou por essa página :з <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt="Visitor counter" /></a>
* comunidade incrível <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20membros&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>

> [!TIP]
> ⭐ Dar uma estrela ajuda a espalhar a ideia de um sistema operacional com IA pra desktop/cyberdeck/wearables!

## 🚙 Roadmap

* [x] **Cérebro**

  * [x] *Artistry:* Pipelines nativos de geração de imagem (Replicate, ComfyUI)
  * [ ] *Proatividade:* Definir gatilhos para interações autônomas da companion (heartbeats)
  * [ ] *Memória em múltiplas camadas:* [AnimaVault](https://github.com/animaios/animavault)

    * [ ] *Escopo de memória por personagem* funcionando com witnesses (várias personagens compartilhando a tela)
* [x] **Ouvidos**

  * [x] Reconhecimento de fala local e detecção de quando alguém está falando
* [x] **Boca**

  * [x] Provedores de voz compatíveis com OpenAI com descoberta automática de vozes
* [x] **Corpo**

  * [x] Suporte a VRM

    * [ ] Controle de expressões via LLM, auto-blink e auto-look-at
    * [ ] Emoções e idle-loops gerados por LLM
  * [x] Suporte a Live2D

    * [ ] Controle de expressões via LLM
* [x] **Desktop Stage**

  * [ ] Várias personagens compartilhando a tela (KISS: 1 janela por personagem)
  * [ ] Gerenciamento de cena/background por personagem
* [ ] **AnimAIOS (WIP)**

  * [x] Integração com bandeja do sistema e captura de tela
  * [ ] Gerar janelas GTK4 nativas em vez de widgets web
  * [ ] Integração profunda com [anima-use-desktop](https://github.com/animaios/anima-use-desktop)

    * [ ] Enviar um snapshot do contexto recente a cada heartbeat da AIRI
  * [ ] O chat da AIRI também funciona como terminal do sistema com detecção de linguagem natural (estilo Warp)
* [ ] **Extras**

  * [ ] DeepSource zerado (0 issues)
  * [ ] LCov > 90% → migrar pra TDD
  * [ ] Adicionar MCP/skills usando prompts em linguagem natural
  * [ ] Suporte nativo a Wayland usando flags da plataforma Ozone

## 🤖 Provedores de API

* [x] Provedores LLM suportados: tudo que o [xsai](https://github.com/moeru-ai/xsai) suporta
* [ ] Provedores TTS suportados: Em breve™
* [ ] Provedores de Embeddings: Em breve™
* [ ] Sistema gamificado de energia baseado no [AnimaRouter](https://github.com/animaios/animarouter) que vai substituir o provider oficial da AIRI: uma fonte praticamente infinita de tokens grátis e deliciosos pras suas cyber waifus, LLMs e embeddings~ Ou simplesmente faz um clone do AnimaRouter e hospeda você mesmo com BYOK! A UI vai permitir alternar facilmente entre provedores AnimaRouter locais ou hospedados.

##### 🥐🍷 readme_locale_fr_FR 🇫🇷

<div align=center>
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/readme-English%20(US)-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20(JP)-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20(CN)-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia--me-Português%20(BR)-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez--moi-Français%20(FR)-0055A4" alt="README en Français">
</a>
<img width="1254" height="1254" alt="anima-logo-fr-v1" src="https://github.com/user-attachments/assets/f5f0ae86-59bc-4645-a87c-4e317c48c64c" />
<sub>
    <p><h2>
        Distribution AnimAIOS basée sur
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>,
        <br>
        pour ton Desktop Linux / Termux / CyberDeck / Wearable, cet automne.
    </p>
    <p>
        Livrée avec des logiciels déjà optimisés pour ton CPU grâce aux dépôts
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.</h2>
    </p>
</sub>
</div>

## 🌙 La Vision

- **Scène Toujours Active :** Ton perso vit directement sur ton bureau ! Elle peut ouvrir, fermer et changer de fenêtre, et surtout lire le texte affiché dedans via l'intégration d'accessibilité~
- **Intégration Système :** Branchée à fond sur ton système, des notifications jusqu'au contrôle complet de Linux via le terminal en mode Agentic
- **Conscience du Contexte :** Ta compagne observe ce qui se passe sur ton bureau pour réagir et interagir de façon proactive, et peut même prendre le contrôle total du desktop en mode Agentic
- **Layouts Modulaires :** Widgets GTK4, arrière-plans générés à la volée via le module artistique, et compositions de fenêtres créées dynamiquement par les personnages

## 🖥️ Développement

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

### ☕ Prérequis

- pnpm
- Node.js (appli Electron)
- Rust (appli Tauri)

### 🖱️ Démarrage Express

L'appli desktop recommandée reste actuellement la version Electron dans `apps/stage-tamagotchi/`, pendant que le portage Tauri avance activement dans `apps/stage-tauri/`.

🍎🐧🪟 Application desktop Electron :

```shell
pnpm i
pnpm dev:tamagotchi
```

🍎🐧 Application desktop Tauri :

> [!IMPORTANT]
> 🚧 En cours de dev

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` vérifie le scaffold Tauri local, la toolchain Rust, le CLI `cargo-tauri`, puis lance `cargo check`. Installe d'abord le CLI Tauri si nécessaire :

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Pourquoi Tauri

Tauri nous permet de garder le renderer Vue 3 et toute l'expérience AIRI, tout en remplaçant le process principal Electron par un backend Rust beaucoup plus léger. Résultat : moins de RAM au repos, des binaires natifs plus petits, une meilleure intégration avec Linux et une voie beaucoup plus clean pour sortir AIRI en appli mobile native.

Cette migration ouvre aussi la voie aux builds AIRI natifs sur Android et iOS dans les prochains mois.

<!--
### ⌨️ Build Linux (en cours)

```shell
cd apps/stage-tamagotchi
./build.sh           # Génère le paquet .deb dans dist/
```

_(Un PKGBUILD optionnel est disponible dans `apps/stage-tamagotchi` pour reconditionner le `.deb` en `.zst` pour Arch/Manjaro/CachyOS)._
-->

## ✌🏻 Remerciements

- le projet original [`moeru-ai/airi`](https://github.com/moeru-ai/airi)
  - et son incroyable fork orienté desktop ! [`dasilva333/airi`](https://github.com/dasilva333/airi)
- toutes les personnes qui sont passées par cette page :з <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt="Compteur de visiteurs" /></a>
- la commu est incroyable <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20membres&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Nombre de membres Discord"></a>

> [!TIP]
> ⭐ Un petit star sur le repo aide à faire connaître l'idée d'un OS desktop/cyberdeck/wearable piloté par l'IA !

## 🚙 Roadmap

- [x] **Cerveau**
  - [x] _Artistry :_ Pipelines natifs de génération d'images (Replicate, ComfyUI)
  - [ ] _Proactivité :_ Définir les déclencheurs des interactions autonomes du compagnon (heartbeats)
  - [ ] _Mémoire multi-niveaux :_ [AnimaVault](https://github.com/animaios/animavault)
    - [ ] _Mémoire isolée par personnage_ compatible avec les témoins (plusieurs personnages sur le même écran)
- [x] **Oreilles**
  - [x] Reconnaissance vocale côté client & détection de parole
- [x] **Bouche**
  - [x] Fournisseurs vocaux compatibles OpenAI avec découverte automatique des voix
- [x] **Corps**
  - [x] Support VRM
    - [ ] Contrôle des expressions par LLM, clignement automatique et suivi du regard
    - [ ] Émotions et animations idle pilotées par LLM
  - [x] Support Live2D
    - [ ] Contrôle des expressions par LLM
- [x] **Scène Desktop**
  - [ ] Plusieurs personnages partageant le même écran (KISS : 1 fenêtre par personnage)
  - [ ] Gestion des scènes/arrière-plans par personnage
- [ ] **AnimAIOS (WIP)**
  - [x] Intégration de la zone de notification et capture d'écran
  - [ ] Générer des fenêtres GTK4 natives au lieu de widgets web
  - [ ] Intégration poussée de [anima-use-desktop](https://github.com/animaios/anima-use-desktop)
    - [ ] Envoyer un snapshot récent du contexte à chaque heartbeat d'AIRI
  - [ ] La chatbox AIRI devient aussi un terminal système avec détection du langage naturel (dans l'esprit de Warp)
- [ ] **Divers**
  - [ ] DeepSource avec 0 issue
  - [ ] LCov > 90% → passage au TDD
  - [ ] Ajouter des MCP/skills via des prompts en langage naturel
  - [ ] Support Wayland natif via les flags Ozone

## 🤖 Fournisseurs d'API

- [x] Fournisseurs LLM supportés : tout ce que [xsai](https://github.com/moeru-ai/xsai) prend en charge
- [ ] Fournisseurs TTS supportés : TBD
- [ ] Fournisseurs d'Embeddings supportés : TBD
- [ ] Système d'énergie gamifié basé sur [AnimaRouter](https://github.com/animaios/animarouter) qui remplacera le fournisseur officiel AIRI : une source quasi illimitée de délicieux tokens gratuits pour toutes tes cyber waifus, LLM et embeddings~ Ou clone AnimaRouter et héberge-le toi-même avec ton BYOK ! L'UI permettra de switch facilement entre des fournisseurs AnimaRouter hébergés ou locaux.

# 🌸 Project Activity プロジェクト活動 项目活动 Atividade do projeto Activité du projet

<a href="https://github.com/orgs/animaios/repositories">
  <img src="https://raw.githubusercontent.com/animaios/anima/refs/heads/main/docs/content/public/assets/org-heatmap.svg" alt="Organization Heatmap">
</a>
<img width="1445" height="1088" alt="anima-banner-lightingfix" src="https://github.com/user-attachments/assets/dd289588-6e88-48b5-af86-6f1035bdde95" /> 
