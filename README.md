##### 🗽🦅 readme_locale_en_US 🇺🇸
╭─[animaios@github]─[~/anima] <br>
╰─➜ Welcome to AnimAIOS Project! Please choose your language:
<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1402" height="1122" alt="anima-banner-v6" src="https://github.com/user-attachments/assets/63d480fc-a66e-426f-9d77-057b31cad7a2" />  
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
- everyone who visited this page :з 
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

╭─[animaios@github]─[~/anima] <br>
╰─➜ AnimAIOS プロジェクトへようこそ！言語を選択してください:

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-ja-v5" src="https://github.com/user-attachments/assets/1772c996-6e75-4009-822d-df647e254ea4" />  
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
* このページをビジットしてくれた全員 :з 
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

##### 🎤👘 readme_locale_ko_KR 🇰🇷

╭─[animaios@github]─[~/anima] <br>
╰─➜ AnimAIOS 프로젝트에 오신 걸 환영합니다! 언어를 선택해 주세요:
<div align=center>
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-ko-v4" src="https://github.com/user-attachments/assets/b08a9aab-8c88-4531-980b-fe3c5ce0c3e6" />
  <sub>
  <p>
    <h2>
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>
        기반 AnimAIOS 디스트로.
        <br>
        이번 가을, 너의 Linux 데스크탑 / Termux / 사이버덱 / 웨어러블로 ㄱㄱ.
    </p>
    <p>
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>
        리포 기반 CPU 최적화 소프트웨어 기본 탑재.
    </h2>
  </p>
</sub>
</div>

## 🌙 비전

* **Always Present Stage:** 너의 캐릭터가 데스크탑에 상주함! 창 열기 / 닫기 / 전환 가능. 그리고 핵심 기능으로 접근성 API 통해 창 내부 텍스트까지 읽기 가능~
* **시스템 인테그레이션:** 알림 같은 기본 기능부터 에이전틱 모드에서 터미널 기반 Linux 전체 풀 컨트롤까지 완전 통합
* **컨텍스트 어웨어:** 컴패니언이 데스크탑 활동을 관찰하고 알아서 리액션 & 인터랙션. 에이전틱 모드에서는 데스크탑 자체를 직접 조작 가능
* **모듈러 스테이지 레이아웃:** GTK4 위젯, 아티스트리 모듈 기반 인터랙티브 생성 배경, 그리고 캐릭터가 직접 다이나믹하게 구성하는 윈도우 레이아웃

## 🖥️ 개발

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

### ☕ 필수 조건

* pnpm
* Node.js (Electron 앱)
* Rust (Tauri 앱)

### 🖱️ 빠른 시작

현재 추천 데스크탑 앱은 `apps/stage-tamagotchi/` 의 Electron 버전임.
Tauri 포트는 현재 `apps/stage-tauri/` 에서 열심히 개발 중.

🍎🐧🪟 Electron 데스크탑 앱:

```shell
pnpm i
pnpm dev:tamagotchi
```

🍎🐧 Tauri 데스크탑 앱:

> [!IMPORTANT]
> 🚧 아직 공사 중임

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` 는 로컬 Tauri 스캐폴드, Rust 툴체인, `cargo-tauri` CLI 체크하고 `cargo check` 돌림.
필요하면 먼저 Tauri CLI 설치:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ 왜 Tauri?

Tauri 덕분에 Vue 3 렌더러랑 AIRI 컴패니언 경험은 그대로 유지하면서 Electron 메인 프로세스를 가벼운 Rust 백엔드로 교체 가능함.

결과:
낮은 아이들 메모리 사용량, 작은 네이티브 번들, 더 깊은 Linux 데스크탑 통합, 그리고 AIRI를 네이티브 모바일 앱으로 가져가기 위한 깔끔한 루트 확보.

같은 마이그레이션 방향은 앞으로 몇 달 안에 Android / iOS 네이티브 AIRI 빌드 로드맵에도 포함됨.

<!--
### ⌨️ Linux 빌드 (공사 중)

```shell
cd apps/stage-tamagotchi
./build.sh           # dist/ 에 .deb 패키지 빌드
```

_(Arch/Manjaro/CachyOS용 `.deb` → `.zst` 리패키징 옵션 PKGBUILD는 `apps/stage-tamagotchi` 안에 있음.)_
-->

## ✌🏻 감사의 말

* 오리지널 프로젝트 [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

  * 그리고 개쩌는 데스크탑 지향 포크 [`dasilva333/airi`](https://github.com/dasilva333/airi)
* 여기까지 와준 모든 사람 :з 
* 갓벽한 커뮤니티 <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>

> [!TIP]
> ⭐ 이 리포는 AI 기반 데스크탑 / 사이버덱 / 웨어러블 OS 컨셉을 밀고 있음!

## 🚙 로드맵

* [x] **브레인**

  * [x] *아티스트리:* 네이티브 이미지 생성 파이프라인 (Replicate, ComfyUI)
  * [ ] *프로액티비티:* 자율 컴패니언 인터랙션 트리거 정의 (하트비트)
  * [ ] *멀티 티어 메모리:* [AnimaVault](https://github.com/animaios/animavault)

    * [ ] 캐릭터별 메모리 스코프 + 위트니스 지원 (여러 캐릭터 화면 공유)

* [x] **이어즈**

  * [x] 클라이언트 사이드 음성 인식 & 토킹 감지

* [x] **마우스**

  * [x] OpenAI 호환 음성 프로바이더 & 보이스 디스커버리

* [x] **바디**

  * [x] VRM 지원

    * [ ] LLM 기반 표정 컨트롤, 오토 블링크, 오토 룩앳
    * [ ] LLM 기반 감정 & 아이돌 루프
  * [x] Live2D 지원

    * [ ] LLM 기반 표정 컨트롤

* [x] **데스크탑 스테이지**

  * [ ] 멀티 캐릭터 화면 공유 (KISS: 캐릭터 하나 = 윈도우 하나)
  * [ ] 캐릭터별 씬 / 배경 관리

* [ ] **AnimAIOS (WIP)**

  * [x] 시스템 트레이 & 스크린 캡처 인테그레이션
  * [ ] 웹 위젯 말고 네이티브 GTK4 윈도우 생성
  * [ ] [anima-use-desktop](https://github.com/animaios/anima-use-desktop) 딥 인테그레이션

    * [ ] AIRI 하트비트마다 최신 컨텍스트 스냅샷 전송
  * [ ] AIRI 채팅박스를 자연어 감지 가능한 시스템 터미널로 변환 (Warp 터미널 느낌)

* [ ] **기타**

  * [ ] DeepSource 0 issues 달성
  * [ ] LCov > 90% → TDD 전환
  * [ ] 자연어 프롬프트 기반 MCP/스킬 추가
  * [ ] Ozone 플랫폼 플래그 기반 네이티브 Wayland 지원

## 🤖 API 프로바이더

* [x] 지원 LLM 프로바이더: [xsai](https://github.com/moeru-ai/xsai)가 지원하는 모든 것
* [ ] 지원 TTS 프로바이더: TBD
* [ ] 지원 Embedding 프로바이더: TBD
* [ ] [AnimaRouter](https://github.com/animaios/animarouter) 기반 게이미파이드 에너지 시스템.
  공식 AIRI 프로바이더를 대체하고 모든 사이버 와이프 LLM / Embedding 니즈를 위한 무한 무료 야미 토큰 소스 제공~

  그리고 AnimaRouter 클론해서 BYOK 셀프호스트도 가능!

  UI에서 호스팅 / 로컬 AnimaRouter 프로바이더 바로 스위치 가능!

##### 🏮🐼 readme_locale_zh_CN 🇨🇳

╭─[animaios@github]─[~/anima] <br>
╰─➜ 欢迎来到 AnimAIOS 项目！先选个语言开冲：

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-zh-v7" src="https://github.com/user-attachments/assets/1051dcbc-c31a-45c3-bdae-29fd65ff91d5" />  
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
* 感谢每一个访问这里的人 :з 
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

╭─[animaios@github]─[~/anima] <br>
╰─➜ Bem-vindo ao projeto AnimAIOS! Escolha seu idioma:

<div align=center>
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="animaios-logo-pt-v4" src="https://github.com/user-attachments/assets/e97b7902-ce22-478c-bad2-ddd93c3aa91f" />  
  <sub>
    <p>
    <h2>
        A distro AnimAIOS baseada no
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>,
        <br>
        pro seu Desktop Linux / Termux / CyberDeck / Wearable, chegando neste outono.
    </p>
    <p>
        Já vem com os pacotes pré-otimizados pro seu CPU usando os repositórios do
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.
    </h2>
    </p>
</sub>
</div>

## 🌙 A Visão

* **Stage Sempre Online:** Sua personagem vive no seu desktop! Ela pode abrir, fechar e trocar janelas e, principalmente, ler o conteúdo delas através da integração com acessibilidade~
* **Integração Total com o Sistema:** Conecta-se diretamente ao sistema inteiro, desde notificações até o controle completo do Linux pelo terminal no Modo Agentic.
* **Consciência de Contexto:** Sua companion entende o que acontece no desktop para responder e interagir de forma proativa, podendo também assumir o controle completo do desktop no Modo Agentic.
* **Layouts Modulares de Stage:** Widgets GTK4, backgrounds gerados em tempo real pelo módulo de artistry e layouts de janelas criados dinamicamente por cada personagem.

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
* Node.js (aplicativo Electron)
* Rust (aplicativo Tauri)

### 🖱️ Começando Rapidamente

Atualmente, a versão recomendada ainda é o aplicativo Electron em `apps/stage-tamagotchi/`, enquanto a migração para Tauri está em desenvolvimento ativo em `apps/stage-tauri/`.

🍎🐧🪟 Aplicativo desktop Electron:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Aplicativo desktop Tauri:

> [!IMPORTANT]
> 🚧 Em desenvolvimento

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

O `./init.sh` verifica o ambiente local do Tauri, a toolchain Rust, a CLI `cargo-tauri` e executa o `cargo check`. Caso necessário, instala primeiro a CLI do Tauri:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Por que Tauri?

O Tauri permite manter o renderer em Vue 3 e toda a experiência da companion AIRI, substituindo o processo principal do Electron por um backend Rust muito mais leve.

Resultado: menor uso de RAM, binários menores, melhor integração com desktops Linux e um caminho mais simples para lançar a AIRI como aplicativo nativo em dispositivos móveis.

Essa migração também é o primeiro passo para builds nativos da AIRI no Android e iOS nos próximos meses.

<!--
### ⌨️ Build para Linux (em construção)

```shell
cd apps/stage-tamagotchi
./build.sh           # Gera o pacote .deb em dist/
```

_(Um PKGBUILD opcional fica em `apps/stage-tamagotchi` para reempacotar o `.deb` em `.zst` para Arch/Manjaro/CachyOS)._
-->

## ✌🏻 Agradecimentos

* o projeto original `moeru-ai/airi`

  * e seu fork focado em desktop simplesmente incrível! `dasilva333/airi`
* todos que visitaram esta página :з 
* comunidade incrível <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20membros&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>

> [!TIP]
> ⭐ Dar uma estrela ajuda a divulgar a ideia de um sistema operacional com IA para desktop/cyberdeck/wearables!

## 🚙 Roadmap

* [x] **Cérebro**

  * [x] *Artistry:* Pipelines nativos de geração de imagem (Replicate, ComfyUI)
  * [ ] *Proatividade:* Definir gatilhos para interações autônomas da companion (heartbeats)
  * [ ] *Memória em múltiplas camadas:* AnimaVault

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
  * [ ] Integração profunda com anima-use-desktop

    * [ ] Enviar um snapshot do contexto recente a cada heartbeat da AIRI
  * [ ] O chat da AIRI também funciona como terminal do sistema com detecção de linguagem natural (estilo Warp)
* [ ] **Extras**

  * [ ] DeepSource zerado (0 issues)
  * [ ] LCov > 90% → migrar para TDD
  * [ ] Adicionar MCP/skills usando prompts em linguagem natural
  * [ ] Suporte nativo a Wayland usando flags da plataforma Ozone

## 🤖 Provedores de API

* [x] Provedores LLM suportados: tudo que o xsai suporta
* [ ] Provedores TTS suportados: Em breve™
* [ ] Provedores de Embeddings: Em breve™
* [ ] Sistema gamificado de energia baseado no AnimaRouter que vai substituir o provider oficial da AIRI: uma fonte praticamente infinita de tokens grátis e deliciosos para suas cyber waifus, LLMs e embeddings~ Ou simplesmente faça um clone do AnimaRouter e hospede você mesmo com BYOK! A UI permitirá alternar facilmente entre provedores AnimaRouter locais ou hospedados.

##### 🥐🍷 readme_locale_fr_FR 🇫🇷

╭─[animaios@github]─[~/anima] <br>
╰─➜ Bienvenue sur le projet AnimAIOS ! Choisissez votre langue :

<div align=center>
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-fr-v5" src="https://github.com/user-attachments/assets/dbef3c79-5c7d-4773-ab70-8fddc914d687" />  
  <sub>
    <p>
    <h2>
        Distribution AnimAIOS basée sur
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>,
        <br>
        pour ton Desktop Linux / Termux / CyberDeck / Wearable, cet automne.
    </p>
    <p>
        Livrée avec des logiciels déjà optimisés pour ton CPU grâce aux dépôts
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.
    </h2>
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
- toutes les personnes qui sont passées par cette page :з
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

##### 🪆🐻‍❄️ readme_locale_ru_RU 🇷🇺

╭─[animaios@github]─[~/anima] <br>
╰─➜ Добро пожаловать в проект AnimAIOS! Выберите язык:

<div align=center>
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-ru-v5" src="https://github.com/user-attachments/assets/c19bcd3b-0a4a-4fac-9bb8-f88d98a8f555" />
  <sub>
    <p><h2>
        Дистрибутив AnimAIOS на базе 
        <a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>, 
        <br>
        залетает на твой Linux Desktop / Termux / CyberDeck / Wearable уже этой осенью.
    </p>
    <p>
        В комплекте софт, заранее затюненный под твой CPU через 
        <a href="https://packages.cachyos.org/" target="_blank">CachyOS</a> репозитории.</h2>
    </p>
</sub>
</div>

## 🌙 Видение

- **Всегда рядом:** Твой персонаж живёт прямо на рабочем столе! Она может открывать, закрывать и переключать окна, а самое главное — читать текст внутри них через accessibility-интеграцию~
- **Глубокая интеграция с системой:** Полностью цепляется за систему — от простых штук типа уведомлений до полного управления Linux через терминал в Agentic Mode
- **Контекстная осознанность:** Компаньонка наблюдает за активностью рабочего стола, чтобы отвечать и взаимодействовать проактивно, а в Agentic Mode может взять полный контроль над десктопом
- **Модульные сцены:** GTK4-виджеты, интерактивно генерируемые фоны через artistry-модуль и динамически собираемые раскладки окон самими персонажами

## 🖥️ Разработка

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

### ☕ Требования

- pnpm
- Node.js (Electron app)
- Rust (Tauri app)

### 🖱️ Быстрый старт

Сейчас рекомендуемое desktop-приложение всё ещё Electron-версия в `apps/stage-tamagotchi/`, а порт на Tauri активно пилится в `apps/stage-tauri/`.

🍎🐧🪟 Electron desktop app:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Tauri desktop app:

> [!IMPORTANT]
> 🚧 В разработке

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` проверяет локальный Tauri scaffold, Rust toolchain, `cargo-tauri` CLI и запускает `cargo check`. Если надо — сначала ставим Tauri CLI:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Почему Tauri

Tauri позволяет оставить Vue 3 renderer и AIRI companion experience, заменив Electron main process на более лёгкий Rust backend. Итог: меньше RAM в простое, меньше нативные бандлы, лучше интеграция с Linux desktop и более чистый путь к релизу AIRI как нативного мобильного приложения.

Эта же миграция — наш путь к нативным Android и iOS сборкам AIRI в ближайшие месяцы.

<!--
### ⌨️ Сборка под Linux (в разработке)

```shell
cd apps/stage-tamagotchi
./build.sh           # Собирает .deb пакет в dist/
```

_(Опциональный PKGBUILD лежит в `apps/stage-tamagotchi` и позволяет перепаковать `.deb` в `.zst` для Arch/Manjaro/CachyOS)._
-->

## ✌🏻 Благодарности

* оригинальному проекту [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

  * и его мощному desktop-форку! [`dasilva333/airi`](https://github.com/dasilva333/airi)
* всем, кто заглянул сюда :з
* топовому комьюнити <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>

> [!TIP]
> ⭐ репа двигает идею AI-powered desktop/cyberdeck/wearable OS!

## 🚙 Дорожная карта

* [x] **Мозг**

  * [x] *Artistry:* Нативные пайплайны генерации изображений (Replicate, ComfyUI)
  * [ ] *Проактивность:* Настройка триггеров для автономных взаимодействий компаньона (heartbeats)
  * [ ] *Многоуровневая память:* [AnimaVault](https://github.com/animaios/animavault)

    * [ ] *Память на уровне персонажа* с поддержкой witness-системы (несколько персонажей шарят один экран)
* [x] **Уши**

  * [x] Распознавание речи и детект разговора на стороне клиента
* [x] **Рот**

  * [x] Совместимые с OpenAI voice-провайдеры с поиском голосов
* [x] **Тело**

  * [x] Поддержка VRM

    * [ ] Управление выражениями через LLM, auto-blink и auto-look-at
    * [ ] LLM-эмоции и idle-loop анимации
  * [x] Поддержка Live2D

    * [ ] Управление выражениями через LLM
* [x] **Desktop Stage**

  * [ ] Несколько персонажей на одном экране (KISS: одно окно на персонажа)
  * [ ] Управление сценами/фонами для каждого персонажа
* [ ] **AnimAIOS (WIP)**

  * [x] System tray и интеграция screen capture
  * [ ] Генерация нативных GTK4 окон вместо web widgets
  * [ ] Глубокая интеграция с [anima-use-desktop](https://github.com/animaios/anima-use-desktop)

    * [ ] Отправка свежего snapshot контекста с каждым AIRI heartbeat
  * [ ] AIRI chatbox превращается в системный терминал с распознаванием естественного языка (как Warp terminal)
* [ ] **Разное**

  * [ ] DeepSource pass с 0 issues
  * [ ] LCov > 90% -> переход на TDD
  * [ ] Добавление mcp/skills через natural language prompts
  * [ ] Нативный Wayland Support через Ozone platform flags

## 🤖 API Провайдеры

* [x] Поддерживаемые LLM-провайдеры: всё, что поддерживает [xsai](https://github.com/moeru-ai/xsai)
* [ ] Поддерживаемые TTS-провайдеры: TBD
* [ ] Поддерживаемые Embedding-провайдеры: TBD
* [ ] Основанная на [AnimaRouter](https://github.com/animaios/animarouter) геймифицированная energy-система, которая заменит официальный AIRI provider — бесконечный источник бесплатных вкусных токенов для всех твоих cyber waifu LLM и Embedding нужд~ Или просто клонируй AnimaRouter и хости сам через BYOK! UI позволит легко переключаться между hosted/local AnimaRouter провайдерами!

##### 🌙🕌 readme_locale_ar_SA 🇸🇦

╭─[animaios@github]─[~/anima] <br>
╰─➜ أهلاً بك في مشروع AnimAIOS! اختر لغتك:

<div align="center">

<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="README em Português do Brasil">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="README en Français">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="README بالعربية">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-ar-v3" src="https://github.com/user-attachments/assets/a419de9c-ce8c-471d-9b06-8d4666ce161d" />
<sub>
<p><h2>

توزيعة <b>AnimAIOS</b> مبنية على 
<a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>،

<br>

لجهاز Linux المكتبي / Termux / CyberDeck / الأجهزة القابلة للارتداء، قريباً في عالمك.

</p>

<p>

تأتي مع برامج محسّنة مسبقاً لمعالجك باستخدام مستودعات 
<a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.

</h2></p>
</sub>

</div>


## 🌙 الرؤية

- **شخصيتك دائماً موجودة:** شخصيتك تعيش على سطح مكتبك! تفتح النوافذ، تغلقها، تبدّل بينها، والأهم أنها تقرأ النصوص داخلها عبر تكامل الوصول 🔥

- **اندماج كامل مع النظام:** تتصل بالنظام من الإشعارات البسيطة إلى التحكم الكامل بـ Linux عبر الطرفية في وضع الوكيل الذكي Agentic Mode.

- **فهم السياق:** رفيقتك تراقب نشاط سطح المكتب لتتفاعل معك بذكاء، ويمكنها تولّي التحكم الكامل عند تفعيل وضع Agentic Mode.

- **واجهات قابلة للتخصيص:** عناصر GTK4، خلفيات يتم توليدها بالذكاء الاصطناعي عبر وحدة Artistry، وترتيبات نوافذ تتغير ديناميكياً حسب الشخصية.


## 🖥️ التطوير

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>

<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>

<br>

<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>

<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>

<a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
  <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
</a>


### ☕ المتطلبات

- pnpm
- Node.js (تطبيق Electron)
- Rust (تطبيق Tauri)


### 🖱️ البداية السريعة

الإصدار المكتبي الموصى به حالياً هو نسخة Electron داخل:

`apps/stage-tamagotchi/`

بينما يتم تطوير نسخة Tauri الأصلية داخل:

`apps/stage-tauri/`

🍎🐧🪟 تطبيق Electron:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 تطبيق Tauri:

> [!IMPORTANT]
> 🚧 تحت البناء حالياً

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

يقوم `./init.sh` بفحص إعداد Tauri المحلي، أدوات Rust، وواجهة `cargo-tauri` ثم يشغل `cargo check`.

إذا لم تكن مثبتة:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ لماذا Tauri؟

Tauri يسمح لنا بالحفاظ على تجربة Vue 3 ورفيقة AIRI مع استبدال محرك Electron الرئيسي بخلفية Rust أخف.

النتيجة:

* استهلاك ذاكرة أقل 🚀
* حزم أصغر
* تكامل أفضل مع سطح مكتب Linux
* طريق أنظف لتحويل AIRI إلى تطبيق أصلي للجوال

وهذه الهجرة هي طريقنا لبناء نسخ Android و iOS الأصلية قريباً.

## ✌🏻 الشكر والتقدير

* المشروع الأصلي:
  [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

  * والنسخة المكتبية الرهيبة:
    [`dasilva333/airi`](https://github.com/dasilva333/airi)

* لكل شخص وصل لهذه الصفحة :3

* مجتمعنا الرهيب:

  <a href="https://discord.gg/TgQ3Cu2F7A">

<img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2">
</a>

> [!TIP]
> ⭐ هذا المشروع يساعد على نشر فكرة أنظمة التشغيل المدعومة بالذكاء الاصطناعي لأجهزة المكتب والـ CyberDeck والأجهزة القابلة للارتداء!

## 🚙 خارطة الطريق

* [x] **العقل 🧠**

  * [x] *الفن:* أنظمة توليد الصور الأصلية (Replicate, ComfyUI)
  * [ ] *الاستباقية:* تعريف محفزات تفاعل الرفيقة الذكية
  * [ ] *ذاكرة متعددة المستويات:* AnimaVault

    * [ ] ذاكرة خاصة لكل شخصية

* [x] **الأذن 👂**

  * [x] التعرف على الصوت وكشف الكلام من الجهاز

* [x] **الفم 🗣️**

  * [x] مزودات صوت متوافقة مع OpenAI

* [x] **الجسد 🤖**

  * [x] دعم VRM

    * [ ] تحكم تعابير مدعوم بالـ LLM
    * [ ] مشاعر وحركات تلقائية
  * [x] دعم Live2D

* [x] **مرحلة سطح المكتب 🖥️**

  * [ ] عدة شخصيات على نفس الشاشة
  * [ ] إدارة المشاهد والخلفيات

* [ ] **AnimAIOS (قيد التطوير ⚡)**

  * [x] تكامل شريط النظام والتقاط الشاشة
  * [ ] إنشاء نوافذ GTK4 أصلية
  * [ ] تكامل anima-use-desktop
  * [ ] صندوق دردشة AIRI يصبح طرفية ذكية بلغة طبيعية

## 🤖 مزودات API

* [x] مزودات LLM المدعومة: كل شيء يدعمه xsai

* [ ] مزودات TTS: قريباً

* [ ] مزودات Embedding: قريباً

* [ ] نظام الطاقة الممتع المبني على:
  [AnimaRouter](https://github.com/animaios/animarouter)

سيستبدل مزود AIRI الرسمي ويعطي مصدر توكنات لا نهائي لرفيقاتك السيبرانية 🤖✨

أو استضف AnimaRouter بنفسك مع BYOK!

واجهة المستخدم ستسمح بالتبديل بسهولة بين مزودات AnimaRouter المحلية والمستضافة.

##### 🌙🌃 readme_locale_fa_IR 🇮🇷

╭─[animaios@github]─[~/anima] <br>
╰─➜ به پروژه AnimAIOS خوش اومدی! زبانت رو انتخاب کن:

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="Português README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="Français README">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="Arabic README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-fa-v4" src="https://github.com/user-attachments/assets/8379c2e5-2475-4c34-a1ad-de79a82278fa" />
<sub>
<h2>

توزیعۀ <b>AnimAIOS</b> ساخته شده بر پایه‌ی 
<a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>

<br>

برای دسکتاپ لینوکس، Termux، CyberDeck و دستگاه‌های پوشیدنی آینده.

</h2>

<h3>

با نرم‌افزارهایی که برای CPU شما بهینه شده‌اند،
با استفاده از مخازن 
<a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.

</h3>

</sub>

</div>


## 🌙 چشم‌انداز

- **همراه همیشه روشن:**  
  کاراکتر هوش مصنوعی شما روی دسکتاپ زندگی می‌کند!  
  پنجره‌ها را باز می‌کند، می‌بندد، جابه‌جا می‌کند و حتی متن داخل آن‌ها را با Accessibility می‌خواند ✨

- **اتصال عمیق به سیستم:**  
  از نوتیفیکیشن‌های ساده تا کنترل کامل لینوکس با ترمینال در حالت Agentic Mode.

- **درک کانتکست:**  
  همراه شما فعالیت‌های دسکتاپ را می‌فهمد، واکنش نشان می‌دهد و وقتی لازم باشد کنترل کامل سیستم را می‌گیرد.

- **محیط‌های ماژولار:**  
  ویجت‌های GTK4، بک‌گراندهای ساخته‌شده با AI و چیدمان‌های داینامیک بر اساس شخصیت.


## 🖥️ توسعه

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>

<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>


### ☕ پیش‌نیازها

- pnpm
- Node.js (اپ Electron)
- Rust (اپ Tauri)


### 🖱️ شروع سریع

نسخه پیشنهادی فعلی دسکتاپ همچنان Electron است:

```

apps/stage-tamagotchi/

```

نسخه‌ی Tauri در حال ساخت است:

```

apps/stage-tauri/

````


🍎🐧🪟 اجرای Electron:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 اجرای Tauri:

> [!IMPORTANT]
> 🚧 در حال ساخت و توسعه

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

### ❔ چرا Tauri؟

Tauri اجازه می‌دهد تجربه Vue 3 و AIRI حفظ شود، اما به جای Electron از بک‌اند سبک Rust استفاده کنیم.

نتیجه:

* مصرف رم کمتر 🚀
* حجم کمتر برنامه
* هماهنگی بهتر با لینوکس
* مسیر بهتر برای انتشار نسخه موبایل

هدف نهایی:
ساخت نسخه Native برای Android و iOS.

## ✌🏻 تشکرها

* پروژه اصلی:
  [`moeru-ai/airi`](https://github.com/moeru-ai/airi)

* فورک فوق‌العاده دسکتاپ:
  [`dasilva333/airi`](https://github.com/dasilva333/airi)

* همه‌ی کسایی که این صفحه رو باز کردن :3

* کامیونیتی خفن ما:

<a href="https://discord.gg/TgQ3Cu2F7A">
<img src="https://img.shields.io/badge/Discord-Join%20Us-5865F2">
</a>

> [!TIP]
> ⭐ این پروژه می‌خواد آینده‌ی سیستم‌عامل‌های AI محور برای دسکتاپ، CyberDeck و Wearableها رو بسازه.

## 🚙 نقشه راه

* [x] **مغز 🧠**

  * [x] تولید تصویر با AI
  * [ ] تعامل خودکار و هوشمند
  * [ ] حافظه چندلایه با AnimaVault

* [x] **گوش 👂**

  * [x] تشخیص صدا روی دستگاه

* [x] **دهان 🗣️**

  * [x] پشتیبانی از سرویس‌های صوتی سازگار با OpenAI

* [x] **بدن 🤖**

  * [x] پشتیبانی VRM
  * [x] پشتیبانی Live2D

* [x] **صحنه دسکتاپ 🖥️**

  * [ ] چند شخصیت روی یک صفحه
  * [ ] مدیریت صحنه و بک‌گراند

* [ ] **AnimAIOS ⚡**

  * [x] System Tray و Screen Capture
  * [ ] پنجره‌های Native GTK4
  * [ ] کنترل سیستم با زبان طبیعی

## 🤖 ارائه‌دهنده‌های API

* [x] پشتیبانی از تمام LLMهایی که xsai پشتیبانی می‌کند

* [ ] سرویس‌های TTS

* [ ] سرویس‌های Embedding

* [ ] سیستم انرژی گیمیفای شده بر پایه:
  [AnimaRouter](https://github.com/animaios/animarouter)

یک منبع بی‌نهایت توکن برای همراه‌های سایبری شما 🤖💜

یا AnimaRouter را خودت هاست کن و BYOK استفاده کن.

آینده‌ی AI desktop همینجاست.
کد بزن، دیپلوی کن، دنیا رو هک کن ✨

##### 🌙🐺 readme_locale_tr_TR 🇹🇷

╭─[animaios@github]─[~/anima] <br>
╰─➜ AnimAIOS Projesine hoş geldin! Lütfen dilini seç:

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="Português README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="Français README">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="Arabic README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-tr-v3" src="https://github.com/user-attachments/assets/52026d6a-59e8-4e6c-a6f7-f82b14668b8b" />  
  <sub>
<h2>

<b>AnimAIOS</b>, 
<a href="https://endeavouros.com/" target="_blank">EndeavourOS</a> tabanlı

<br>

yapay zeka destekli yeni nesil masaüstü işletim sistemi.

</h2>

<h3>

Linux Desktop / Termux / CyberDeck / Wearable cihazlarında
geleceğin AI yol arkadaşını yanında taşı.

<br>

CPU'n için optimize edilmiş yazılımlar
<a href="https://packages.cachyos.org/" target="_blank">CachyOS</a> depoları ile geliyor.

</h3>
</sub>

</div>


## 🌙 Vizyon

- **Her zaman yanında olan sahne:**
  
  AI karakterin masaüstünde yaşar!
  Pencereleri açabilir, kapatabilir, değiştirebilir ve erişilebilirlik entegrasyonu sayesinde içindeki yazıları okuyabilir.

- **Sistem ile tam bağlantı:**

  Basit bildirimlerden terminal üzerinden tüm Linux sistemini yönetmeye kadar Agentic Mode ile tam kontrol.

- **Bağlam farkındalığı:**

  Asistanın masaüstündeki aktiviteleri anlar, sana proaktif şekilde yardım eder ve gerektiğinde kontrolü devralabilir.

- **Modüler sahneler:**

  GTK4 widget'ları, AI tarafından oluşturulan arka planlar ve karaktere göre dinamik pencere düzenleri.


## 🖥️ Geliştirme

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>

<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>


### ☕ Gereksinimler

- pnpm
- Node.js (Electron uygulaması)
- Rust (Tauri uygulaması)


### 🖱️ Hızlı Başlangıç

Şu anda önerilen masaüstü uygulaması:

```

apps/stage-tamagotchi/

```

içindeki Electron sürümüdür.

Tauri portu aktif olarak geliştiriliyor:

```

apps/stage-tauri/

````


🍎🐧🪟 Electron masaüstü uygulaması:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Tauri masaüstü uygulaması:

> [!IMPORTANT]
> 🚧 Yapım aşamasında

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` yerel Tauri kurulumunu, Rust araç zincirini, `cargo-tauri` CLI aracını kontrol eder ve `cargo check` çalıştırır.

Gerekirse:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Neden Tauri?

Tauri sayesinde Vue 3 arayüzünü ve AIRI deneyimini korurken Electron ana sürecini daha hafif Rust backend ile değiştirebiliyoruz.

Bunun sonucu:

* Daha düşük RAM kullanımı 🚀
* Daha küçük uygulama boyutu
* Daha iyi Linux entegrasyonu
* Native mobil uygulamalar için daha temiz yol

Bu geçiş aynı zamanda Android ve iOS için native AIRI sürümlerinin temelidir.

## ✌🏻 Teşekkürler

* Orijinal proje:

[`moeru-ai/airi`](https://github.com/moeru-ai/airi)

* Harika masaüstü odaklı fork:

[`dasilva333/airi`](https://github.com/dasilva333/airi)

* Bu sayfayı ziyaret eden herkese :3

* Muhteşem topluluğumuz:

<a href="https://discord.gg/TgQ3Cu2F7A">
<img src="https://img.shields.io/badge/Discord-Topluluğa%20Katıl-5865F2">
</a>

> [!TIP]
> ⭐ Bu proje, AI destekli masaüstü / cyberdeck / wearable işletim sistemleri fikrini büyütmeyi amaçlıyor!

## 🚙 Yol Haritası

* [x] **Beyin 🧠**

  * [x] *Artistry:* Yerel AI görsel üretim sistemleri
  * [ ] *Proaktiflik:* Otonom AI etkileşimleri
  * [ ] *Çok katmanlı hafıza:* AnimaVault

* [x] **Kulak 👂**

  * [x] Cihaz üzerinde konuşma algılama

* [x] **Ağız 🗣️**

  * [x] OpenAI uyumlu ses sağlayıcıları

* [x] **Beden 🤖**

  * [x] VRM desteği
  * [ ] LLM destekli mimikler
  * [ ] Duygu ve idle animasyonları
  * [x] Live2D desteği

* [x] **Masaüstü Sahnesi 🖥️**

  * [ ] Aynı ekranda birden fazla karakter
  * [ ] Karakter bazlı sahne yönetimi

* [ ] **AnimAIOS ⚡**

  * [x] Sistem tepsisi ve ekran yakalama
  * [ ] Native GTK4 pencereleri
  * [ ] anima-use-desktop entegrasyonu
  * [ ] AI sohbet kutusunu doğal dil terminaline dönüştürme

## 🤖 API Sağlayıcıları

* [x] Desteklenen LLM sağlayıcıları:
  xsai'nin desteklediği her şey

* [ ] TTS sağlayıcıları: Yakında

* [ ] Embedding sağlayıcıları: Yakında

* [ ] [AnimaRouter](https://github.com/animaios/animarouter)

tabanlı oyunlaştırılmış enerji sistemi.

Cyber waifu AI ihtiyaçların için sınırsız token dünyası 🤖✨

Ya da AnimaRouter'ı kendi sunucunda çalıştır ve BYOK kullan.

Gelecek senin elinde.

Kodla.
Otomatikleştir.
Geleceği sen yaz. >_<

##### ⚙️🎩 readme_locale_de_DE 🇩🇪

╭─[animaios@github]─[~/anima] <br>
╰─➜ Willkommen beim AnimAIOS Projekt! Wähle deine Sprache:

<div align="center">

<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="Português README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="Français README">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="Arabic README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-de-v2" src="https://github.com/user-attachments/assets/68bd49d1-49a2-457c-b94c-e4ea0abf52ad" />
<sub>
<h2>

<b>AnimAIOS</b> ist eine KI-native Distribution auf Basis von
<a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>.

<br>

Dein persönlicher KI-Begleiter für Linux Desktop, Termux, CyberDecks und Wearables.

</h2>

<h3>

Mit voroptimierter Software für deine CPU durch
<a href="https://packages.cachyos.org/" target="_blank">CachyOS</a> Repositories.

<br>

Code. Automatisiere. Erschaffe die Zukunft. ⚡

</h3>
</sub>

</div>


## 🌙 Die Vision

- **Deine KI ist immer da:**

  Dein Charakter lebt direkt auf deinem Desktop.
  Sie kann Fenster öffnen, schließen, wechseln und Inhalte über Accessibility-Integration lesen.

- **Tiefe Systemintegration:**

  Von einfachen Benachrichtigungen bis zur vollständigen Linux-Steuerung über Terminal im Agentic Mode.

- **Kontextbewusstsein:**

  Deine Begleiterin versteht deine Desktop-Aktivität, reagiert proaktiv und kann bei Bedarf komplette Kontrolle übernehmen.

- **Modulare Welten:**

  GTK4 Widgets, KI-generierte Hintergründe und dynamische Layouts, die sich an deine Charaktere anpassen.


## 🖥️ Entwicklung

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>

<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>


### ☕ Voraussetzungen

- pnpm
- Node.js (Electron App)
- Rust (Tauri App)


### 🖱️ Schnellstart

Die aktuell empfohlene Desktop-App ist weiterhin die Electron-Version:

```

apps/stage-tamagotchi/

```

Die Tauri-Version wird aktiv entwickelt:

```

apps/stage-tauri/

````


🍎🐧🪟 Electron Desktop App:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Tauri Desktop App:

> [!IMPORTANT]
> 🚧 Noch im Aufbau

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` prüft dein lokales Tauri Setup, Rust Toolchain, `cargo-tauri` CLI und führt anschließend `cargo check` aus.

Falls nötig:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Warum Tauri?

Tauri ermöglicht es uns, die Vue 3 Oberfläche und AIRI Companion Experience zu behalten und gleichzeitig Electron durch ein schlankeres Rust Backend zu ersetzen.

Das bedeutet:

* Weniger RAM-Verbrauch 🚀
* Kleinere native Builds
* Bessere Linux-Integration
* Sauberer Weg zu mobilen Native Apps

Der gleiche Weg bringt AIRI langfristig auf Android und iOS.

## ✌🏻 Danksagungen

* Das originale Projekt:

[`moeru-ai/airi`](https://github.com/moeru-ai/airi)

* Der fantastische Desktop-Fork:

[`dasilva333/airi`](https://github.com/dasilva333/airi)

* Jeder, der diese Seite besucht :3

* Unsere unglaubliche Community:

<a href="https://discord.gg/TgQ3Cu2F7A">
<img src="https://img.shields.io/badge/Discord-Community%20beitreten-5865F2">
</a>

> [!TIP]
> ⭐ Dieses Repository bringt die Idee von KI-basierten Desktop-, CyberDeck- und Wearable-Betriebssystemen näher.

## 🚙 Roadmap

* [x] **Gehirn 🧠**

  * [x] *Artistry:* Native KI-Bildgenerierung
  * [ ] *Proaktivität:* Autonome Companion-Interaktionen
  * [ ] *Mehrstufiges Gedächtnis:* AnimaVault

* [x] **Ohren 👂**

  * [x] Lokale Spracherkennung und Sprecherkennung

* [x] **Mund 🗣️**

  * [x] OpenAI-kompatible Sprachprovider

* [x] **Körper 🤖**

  * [x] VRM Support
  * [ ] LLM-gesteuerte Ausdrücke
  * [ ] Emotionen und Idle-Loops
  * [x] Live2D Support

* [x] **Desktop Bühne 🖥️**

  * [ ] Mehrere Charaktere auf einem Bildschirm
  * [ ] Szenen- und Hintergrundverwaltung

* [ ] **AnimAIOS ⚡**

  * [x] System Tray & Screen Capture Integration
  * [ ] Native GTK4 Fenster
  * [ ] anima-use-desktop Integration
  * [ ] AIRI Chatbox als natürlicher KI-Terminal

## 🤖 API Provider

* [x] Unterstützte LLM Provider:
  Alles, was xsai unterstützt

* [ ] TTS Provider: TBD

* [ ] Embedding Provider: TBD

* [ ] [AnimaRouter](https://github.com/animaios/animarouter)

Ein gamifiziertes Energie-System für die nächste Generation von KI-Begleitern.

Unendliche Möglichkeiten für deine Cyber Companions 🤖✨

Oder hoste AnimaRouter selbst mit BYOK.

Die Zukunft deines Desktops schreibt sich nicht von allein.

**Code rein.**
**KI an.**
**Zukunft bauen.** 🚀

##### ⚡🐺 readme_locale_pl_PL 🇵🇱

╭─[animaios@github]─[~/anima] <br>
╰─➜ Witaj w projekcie AnimAIOS! Wybierz swój język:

<div align="center">
<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="Português README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="Français README">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="Arabic README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-pl-v2" src="https://github.com/user-attachments/assets/7348e8cb-1dfe-485d-80ad-804a4136c3cd" />  
<sub>
<h2>

<b>AnimAIOS</b> — dystrybucja nowej generacji oparta na
<a href="https://endeavouros.com/" target="_blank">EndeavourOS</a>.

<br>

Twój osobisty towarzysz AI dla Linux Desktop, Termux, CyberDecków i urządzeń przyszłości.

</h2>

<h3>

Oprogramowanie zoptymalizowane pod Twój CPU dzięki repozytoriom
<a href="https://packages.cachyos.org/" target="_blank">CachyOS</a>.

<br>

Koduj. Automatyzuj. Twórz przyszłość. ⚡

</h3>
</sub>

</div>


## 🌙 Wizja

- **Twój AI companion zawsze obok:**

  Twoja postać żyje na pulpicie.
  Może otwierać, zamykać i przełączać okna oraz czytać ich zawartość dzięki integracji Accessibility.

- **Pełna integracja z systemem:**

  Od zwykłych powiadomień aż po pełną kontrolę Linuxa przez terminal w trybie Agentic Mode.

- **Świadomość kontekstu:**

  Twój towarzysz rozumie aktywność na pulpicie, reaguje proaktywnie i może przejąć kontrolę, gdy tego potrzebujesz.

- **Modularne światy:**

  Widgety GTK4, generowane przez AI tła oraz dynamiczne układy dopasowane do charakteru postaci.


## 🖥️ Rozwój

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>

<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>


### ☕ Wymagania

- pnpm
- Node.js (aplikacja Electron)
- Rust (aplikacja Tauri)


### 🖱️ Szybki start

Aktualnie zalecana aplikacja desktopowa:

```

apps/stage-tamagotchi/

```

bazuje na Electron.

Wersja Tauri jest aktywnie rozwijana:

```

apps/stage-tauri/

````


🍎🐧🪟 Aplikacja Electron:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Aplikacja Tauri:

> [!IMPORTANT]
> 🚧 W trakcie budowy

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` sprawdza lokalny setup Tauri, toolchain Rust, CLI `cargo-tauri` oraz wykonuje `cargo check`.

Jeśli potrzeba:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Dlaczego Tauri?

Tauri pozwala zachować doświadczenie Vue 3 oraz AIRI Companion, jednocześnie zastępując ciężki proces Electron lekkim backendem Rust.

Efekt:

* Mniejsze zużycie RAM 🚀
* Lżejsze paczki aplikacji
* Lepsza integracja z Linuxem
* Prostsza droga do aplikacji mobilnych Native

Ta migracja otwiera drogę do przyszłych wersji AIRI dla Androida i iOS.

## ✌🏻 Podziękowania

* Oryginalny projekt:

[`moeru-ai/airi`](https://github.com/moeru-ai/airi)

* Niesamowity fork desktopowy:

[`dasilva333/airi`](https://github.com/dasilva333/airi)

* Każdemu, kto odwiedził tę stronę :3

* Naszej świetnej społeczności:

<a href="https://discord.gg/TgQ3Cu2F7A">
<img src="https://img.shields.io/badge/Discord-Dołącz%20do%20nas-5865F2">
</a>

> [!TIP]
> ⭐ Ten projekt rozwija ideę systemów operacyjnych napędzanych AI dla desktopów, CyberDecków i urządzeń wearable.

## 🚙 Roadmap

* [x] **Mózg 🧠**

  * [x] *Artistry:* natywne pipeline'y generowania obrazów AI
  * [ ] *Proaktywność:* autonomiczne interakcje companionów
  * [ ] *Pamięć wielopoziomowa:* AnimaVault

* [x] **Uszy 👂**

  * [x] Rozpoznawanie mowy po stronie klienta

* [x] **Usta 🗣️**

  * [x] Dostawcy głosu kompatybilni z OpenAI

* [x] **Ciało 🤖**

  * [x] Obsługa VRM
  * [ ] Sterowanie ekspresją przez LLM
  * [ ] Emocje i animacje idle
  * [x] Obsługa Live2D

* [x] **Scena Desktop 🖥️**

  * [ ] Wiele postaci na jednym ekranie
  * [ ] Zarządzanie scenami i tłami

* [ ] **AnimAIOS ⚡**

  * [x] Integracja System Tray i przechwytywania ekranu
  * [ ] Natywne okna GTK4
  * [ ] Integracja anima-use-desktop
  * [ ] AIRI Chat jako terminal sterowany naturalnym językiem

## 🤖 Dostawcy API

* [x] Obsługiwani dostawcy LLM:
  wszystko, co wspiera xsai

* [ ] Dostawcy TTS: TBD

* [ ] Dostawcy Embedding: TBD

* [ ] [AnimaRouter](https://github.com/animaios/animarouter)

system energii oparty na gamifikacji dla kolejnej generacji AI companionów.

Nieskończone możliwości dla Twoich cyber-towarzyszy 🤖✨

Możesz też hostować AnimaRouter samodzielnie z BYOK.

Przyszłość pulpitu nie napisze się sama.

**Pisz kod.**
**Automatyzuj świat.**
**Twórz jutro.** 🚀

##### 🌌🐆 readme_locale_kk_KZ 🇰🇿

╭─[animaios@github]─[~/anima] <br>
╰─➜ AnimAIOS жобасына қош келдің! Тіліңді таңда:

<div align="center">

<a href="https://github.com/animaios/anima#-readme_locale_en_us-">
  <img src="https://img.shields.io/badge/read%20me-English%20-1e3a8a" alt="English README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_ja_jp-">
  <img src="https://img.shields.io/badge/リードミー-日本語%20-db2777" alt="Japanese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ko_kr-">
  <img src="https://img.shields.io/badge/리드미-한국어%20-a020f0" alt="한국어 README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_zh_cn-">
  <img src="https://img.shields.io/badge/读我-中文%20-dc2626" alt="Chinese README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pt_br-">
  <img src="https://img.shields.io/badge/leia%20me-Português%20-16a34a" alt="Português README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fr_fr-">
  <img src="https://img.shields.io/badge/lisez%20moi-Français%20-B59410" alt="Français README">
</a>
<a href="https://github.com/animaios/anima#%E2%80%8D%EF%B8%8F-readme_locale_ru_ru-">
  <img src="https://img.shields.io/badge/прочитай%20меня-Русский%20-71706E" alt="Русский README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_ar_sa-">
  <img src="https://img.shields.io/badge/اقرأني-العربية%20-8B5CF6" alt="Arabic README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_fa_ir-">
  <img src="https://img.shields.io/badge/بخونش-فارسی%20-10B981" alt="README فارسی">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_tr_tr-">
  <img src="https://img.shields.io/badge/oku%20beni-Türkçe%20-DC2626" alt="Türkçe README">
</a>
<a href="https://github.com/animaios/anima#%EF%B8%8F-readme_locale_de_de-">
  <img src="https://img.shields.io/badge/lesen%20-%20Deutsch%20-FACC15" alt="Deutsches README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_pl_pl-">
  <img src="https://img.shields.io/badge/czytaj%20mnie-Polski%20-DC143C" alt="Polski README">
</a>
<a href="https://github.com/animaios/anima#-readme_locale_kk_kz-">
  <img src="https://img.shields.io/badge/оқы-Қазақша%20-00A86B" alt="Қазақша README">
</a>
<img width="1254" height="1254" alt="anima-logo-kz-v2" src="https://github.com/user-attachments/assets/eed65c65-b2ed-45c7-b78c-d133fe552b3a" />
<sub>
<h2>

<b>AnimAIOS</b> — 
<a href="https://endeavouros.com/" target="_blank">EndeavourOS</a> негізіндегі

<br>

жаңа буын AI операциялық ортасы.

</h2>

<h3>

Linux Desktop / Termux / CyberDeck / Wearable құрылғыларында
өзіңнің AI серігіңді іске қос.

<br>

CPU-ға арнайы оңтайландырылған бағдарламалар
<a href="https://packages.cachyos.org/" target="_blank">CachyOS</a> репозиторийлерімен келеді.

<br>

Код жаз. Автоматтандыр. Болашақты құр. ⚡

</h3>
</sub>

</div>


## 🌙 Идея

- **AI серігің әрқашан қасыңда:**

  Сенің кейіпкерің жұмыс үстелінде өмір сүреді.
  Терезелерді ашады, жабады, ауыстырады және Accessibility интеграциясы арқылы мәтіндерді оқи алады.

- **Жүйемен толық байланыс:**

  Қарапайым хабарламалардан бастап Linux жүйесін терминал арқылы толық басқаруға дейін Agentic Mode мүмкіндігі.

- **Контексті түсіну:**

  AI серігі жұмыс барысыңды байқайды, жағдайды түсінеді және қажет кезде әрекетті өзі бастайды.

- **Модульдік әлем:**

  GTK4 виджеттері, AI арқылы жасалған фондар және кейіпкерге бейімделетін динамикалық интерфейстер.


## 🖥️ Даму

<a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
  <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
</a>

<a href="https://animaios.github.io/anima">
  <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
</a>


### ☕ Қажетті құралдар

- pnpm
- Node.js (Electron қолданбасы)
- Rust (Tauri қолданбасы)


### 🖱️ Жылдам бастау

Қазіргі ұсынылатын desktop нұсқасы:

```

apps/stage-tamagotchi/

```

ішіндегі Electron версиясы.

Tauri нұсқасы белсенді түрде жасалуда:

```

apps/stage-tauri/

````


🍎🐧🪟 Electron Desktop:

```shell
pnpm i
pnpm dev:tamagotchi
````

🍎🐧 Tauri Desktop:

> [!IMPORTANT]
> 🚧 Құрылу үстінде

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` жергілікті Tauri ортасын, Rust toolchain және `cargo-tauri` CLI тексереді.

Қажет болса:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Неге Tauri?

Tauri бізге Vue 3 интерфейсін және AIRI тәжірибесін сақтап, Electron орнына жеңіл Rust backend қолдануға мүмкіндік береді.

Нәтижесі:

* Аз RAM қолдану 🚀
* Кішірек native жинақтар
* Linux-пен жақсы интеграция
* Mobile native нұсқаларға таза жол

Бұл бағыт AIRI-дің Android және iOS нұсқаларына апарады.

## ✌🏻 Алғыс

* Бастапқы жоба:

[`moeru-ai/airi`](https://github.com/moeru-ai/airi)

* Керемет desktop fork:

[`dasilva333/airi`](https://github.com/dasilva333/airi)

* Осы параққа келген әр адамға :3

* Біздің мықты қауымдастық:

<a href="https://discord.gg/TgQ3Cu2F7A">
<img src="https://img.shields.io/badge/Discord-Қауымдастыққа%20қосыл-5865F2">
</a>

> [!TIP]
> ⭐ Бұл жоба AI негізіндегі desktop, CyberDeck және wearable жүйелерінің болашағын дамытуға бағытталған.

## 🚙 Жол картасы

* [x] **Ми 🧠**

  * [x] *Artistry:* AI сурет генерациясы
  * [ ] *Проактивтілік:* автономды AI әрекеттері
  * [ ] *Көп деңгейлі жады:* AnimaVault

* [x] **Құлақ 👂**

  * [x] Құрылғы ішіндегі дауыс тану

* [x] **Ауыз 🗣️**

  * [x] OpenAI үйлесімді дауыс жүйелері

* [x] **Дене 🤖**

  * [x] VRM қолдауы
  * [ ] LLM арқылы эмоция және қозғалыс басқару
  * [x] Live2D қолдауы

* [x] **Desktop сахна 🖥️**

  * [ ] Бір экрандағы бірнеше кейіпкер
  * [ ] Сахна және фон басқару

* [ ] **AnimAIOS ⚡**

  * [x] System Tray және Screen Capture
  * [ ] Native GTK4 терезелері
  * [ ] anima-use-desktop интеграциясы
  * [ ] AIRI Chat-ті AI терминалға айналдыру

## 🤖 API провайдерлері

* [x] Қолдайтын LLM провайдерлері:
  xsai қолдайтын барлық жүйелер

* [ ] TTS провайдерлері: кейін

* [ ] Embedding провайдерлері: кейін

* [ ] [AnimaRouter](https://github.com/animaios/animarouter)

AI серіктерге арналған геймификацияланған энергия жүйесі.

Cyber companion әлеміңе шексіз мүмкіндіктер 🤖✨

Немесе AnimaRouter-ды өзің орналастырып, BYOK қолдан.

Болашақ өздігінен келмейді.

**Код жаз.**
**Жүйені автоматтандыр.**
**Болашақты жаса.** 🚀

---

<a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/">
  <img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt=":3" />
</a>
<br>
</a>
<a href="https://github.com/orgs/animaios/repositories">
  <img src="https://raw.githubusercontent.com/animaios/anima/refs/heads/main/docs/content/public/assets/org-heatmap.svg" alt="Organization Heatmap">
</a>
<img width="1383" height="1137" alt="anima-banner-v5" src="https://github.com/user-attachments/assets/77a915c5-646c-4628-997a-3b4a1d7c11db" />
<img width="1387" height="1134" alt="she never asked for this" src="https://github.com/user-attachments/assets/9e33a8ed-9999-418b-b15c-bf47767dff4e" />
<img width="1445" height="1088" alt="anima-banner-lightingfix" src="https://github.com/user-attachments/assets/dd289588-6e88-48b5-af86-6f1035bdde95" /> 
