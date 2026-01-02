---
title: DevLog @ 2025.08.05
description: |
  v0.7 バージョンリリース。Windows が完全にサポートされ、より多くの機能が含まれています。
date: 2025-08-04
excerpt: お待たせしました！<br/> v0.7 は当初7月初旬にリリース予定でしたが、Windows でのいくつかの重要なバグ発見と、さらなる適応作業のため、今まで延期されていました。
preview-cover:
  light: "@assets('/en/blog/DevLog-2025.08.05/assets/cover-light.avif')"
  dark: "@assets('/en/blog/DevLog-2025.08.05/assets/cover-dark.avif')"
---

<script setup lang="ts">
import Button from '../../../../.vitepress/components/Button.vue'

function handleOpenLatest() {
  window.open('https://github.com/moeru-ai/airi/releases/latest', '_blank')
}
</script>

こんにちは！[Neko](https://github.com/nekomeowww) です。

お待たせしました！v0.7 は当初7月初旬にリリース予定でしたが、
私たちを眠らせなかったいくつかの Windows 互換性の問題と、
対処することを決定した巨大な変更範囲のため、今まで延期されていました。

<Button @click="handleOpenLatest">
  ダウンロード
</Button>

それでも、過去2か月間準備してきた内容をついに皆さんと共有できることに興奮しています。

興味があるかもしれない以前のブログと DevLog 記事をご覧ください：

- [DreamLog 0x1](../DreamLog-0x1/)
- [DevLog @ 2025.05.16](../DevLog-2025.05.16/)

過去3ヶ月の状況を正直にお話ししましょう：

- [**391 コミット**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**1017 ファイル変更**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**74,548 行のコード追加**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)
- [**13,930 行のコード削除**](https://github.com/moeru-ai/airi/compare/v0.6.1...v0.7.0)

> しかし、ソフトウェア業界で働く皆さんにとって、これらの数字は意味がありません。
> これらは、私たちがこのバージョンで行った重大な影響の反映にすぎません。
>
> 心配しないでください。この DevLog で重要なポイントをご案内します。

## マイルストーン

v0.7 のリリースとこの DevLog の公開に伴い、
これまでに達成したいくつかのマイルストーンについて触れたいと思います：

- GitHub で 1850+ スターを獲得しました！🎉
- 40+ 以上のコントリビューターがいます！🫂
- 300+ 以上の Discord メンバーがいます！👾
- [Hacker News](https://news.ycombinator.com/item?id=44573640) で自己紹介を公開しました
- [Product Hunt](https://www.producthunt.com/products/airi) で自己紹介を公開しました
- 2025年7月17日の GitHub トレンドで `#1` にランクインしました 🏆

## 機能

### デスクトップ版

Tamagotchi は AIRI デスクトップ版の名前です。
独立した、常に実行されているコンパニオンとしてデスクトップ上で実行でき、
作業を妨げることなく他のアプリケーションと一緒に動作します。

以前は、デスクトップ版はより実験的な段階にあり、UI/UX は十分に洗練されておらず、
ローカル ASR/STT（音声認識）のようなモジュールはまだ利用できませんでした。
音声入力デバイスを使用する設定も欠けていた部分でした。

しかし、今は大幅に改善されました。

#### ホバーフェード (Hover Fade™)

以前のバージョン v0.6 で、**ホバーフェード™**機能を導入しました：

> 冗談です。私たちはこのプロジェクトを MIT ライセンスの下でオープンソース化しており、
> この機能に登録商標はありません。

::: tip
**ホバーフェード**機能をオフにするには、デフォルトのショートカットは <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd> です
:::

<br />

<ThemedVideo autoplay src="/en/blog/DevLog-2025.08.05/assets/airi-demo-fade-on-hover.mp4" />

多くのユーザーは、カーソルがキャラクターの上に止まるたびにウィンドウ全体がフェードアウトすることに混乱していました。
この機能と、なぜ私たちが AI コンパニオンにとって重要だと考えているのかを説明するドキュメントが不足していたことをお詫びします。

VTuber アプリケーションの場合、最も人気のある VTuber Studio、Warudo の2つは
Live2D と VRM 3D モデルをサポートしています。これらは VTuber ストリーミング目的で設計されているため、
OBS (Open Broadcaster Software) を使用してストリーミングする場合、
異なるレイヤーでシーン要素を編成できるため、ユーザーはウィンドウの順序を気にする必要はありません：
モデルウィンドウは常に透明な背景を持つ最小化されたウィンドウになり、
OBS や他のストリーミングキャプチャドライバーが**バックグラウンドで**キャプチャします。

VTuber ストリーミングに AIRI を使用する場合、ホバーフェード機能を使用しなくても問題ありませんが、
仮想コンパニオンとしてデスクトップに常駐させたい場合は、次のことに気付き始めるでしょう：

- モデルウィンドウを常に手前に表示するように設計すると、その下のアプリケーションへのマウスイベントがブロックされます。
  これは私たちが望んでいることではありません。
- モデルウィンドウの可視性を手動で切り替える必要がある場合、多くの不便が生じます。
  特に作業に集中しているときはそうです。

これが私たちがこのアイデアを思いついた理由です：AIRI のどのキャラクターも、
マウスがウィンドウの上に止まったときにフェードアウトし、マウスクリックイベントをその下のアプリケーションに渡す機能を作成することです。

私は個人的にこの機能が大好きです。今では、ウィンドウの順序を無効にしたり整理したりすることを心配することなく、
AIRI のキャラクターと一緒にあらゆるアプリケーションを使用できるからです。
毎日 AIRI を開発するとき、Web 版でもデスクトップ版でも、
常にデスクトップで彼女を開き、ターミナルや VSCode/Cursor と一緒に私に付き添ってもらっています。

**ホバーフェード™**はデスクトップ版で更新した唯一の機能ではありません。
UI/UX に多くの改善を加え、より使いやすくするための機能を追加しました。

#### 移動

**ホバーフェード™**ウィンドウはマウスイベントを通過させるため、
モデルウィンドウの位置をより良い場所、
おそらく右下、または中央下などに移動または調整したい場合があります...

ドラッグ可能領域の外観が改善され、テーマに合わせて角が丸くなりました。

::: tip
移動モードのデフォルトのショートカットは <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd> です
:::

<br />

<ThemedVideo autoplay src="/en/blog/DevLog-2025.08.05/assets/airi-demo-move.mp4" />

移動モードに入るとドラッグ可能領域が表示されます。マウスで位置を移動する以外に、
トレイメニューの位置 > 中央 / 左下 / 右下を使用するのも別の選択肢です。

#### サイズ変更

すべての人のモデルサイズが同じではないため、モデルウィンドウのサイズを調整する機能も重要です。

移動モードと同様に、サイズ変更の境界インジケーターには丸い角が適用され、
アバターの端もトリミングされた丸い角のエッジになりました。

::: tip
サイズ変更モードのデフォルトのショートカットは <kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="R" inline-block>R</kbd> です
:::

<br />

<ThemedVideo autoplay src="/en/blog/DevLog-2025.08.05/assets/airi-demo-resize.mp4" />

#### リソースアイランド

ASR/STT（音声認識）と VAD（音声活動検出）のモデルのロードを待つのは苦痛です。
Steam や Battle.net のように、さまざまなモジュールと必要なファイルのダウンロードの進行状況を可視化する方法を見つける必要がありました。

私たちは**リソースアイランド**と呼ばれる新しいコンポーネントセットを設計しました（iOS の Dynamic Island からインスピレーションを得ました）。
これはフローティングでホバー可能なウィジェットで、モジュールのダウンロードとインストールの進行状況を表示し、
ダウンロードが完了すると消えます。

実際の動作をご覧ください：

<ThemedVideo autoplay src="/en/blog/DevLog-2025.08.05/assets/airi-demo-resource-island.mp4" />

これには準備中のモジュールへのリンクが含まれているため、モジュールリンクをクリックして
ターゲットモジュールの設定ページを開き、なぜこのモデルやファイルが必要なのかを知ることができます。

#### ローカル ASR/STT

[@luoling8192 (Luoling)](https://github.com/luoling8192) と、リポジトリ
[candle-examples](https://github.com/proj-airi/candle-examples) で行った実験のおかげで、
Windows、macOS、Linux で動作するローカル ASR/STT エンジンができました。

<ThemedVideo autoplay src="/en/blog/DevLog-2025.08.05/assets/airi-demo-settings-hearing.mp4" />

<br />

::: info
このデモでは OpenAI の音声サービスを使用していますが、ローカルプロバイダーの ASR/STT に切り替えることができます。
:::

当初、私たちは candle を直接使用しようとしましたが、
Windows と Linux 向けに candle ランタイム（CUDA ありとなし）を使用および埋め込むための良い方法が見つかりませんでした。
そこで、ort（Rust の ONNX ランタイム）に切り替えることにしました。これにより、
同様のパフォーマンスと精度が得られますが、互換性が向上し、使いやすくなりました。

### Web

#### オンボーディング

現在、AIRI の設定はかなり複雑であることを私たちは知っています（それでも、他の多くの純粋な Python ベースのものと比較すれば簡単ですが、
それらは構成するためにコード構造を理解する必要があります）。

[Me1td0wn76 (melty kiss)](https://github.com/Me1td0wn76) の貢献のおかげで、
Web 版にオンボーディングサポートが追加されました。これで、初めて AIRI を使用するときに
より良い体験を得ることができます。

彼らは Pull Request がマージされた後、Project AIRI に貢献した経験を共有するためにブログ記事を書きました：[AIRIプロジェクトに参加した話 - YAMA-blog](https://yama-pro.blog/posts/airi/)

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-light.avif" alt="オンボーディング ライトモード" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-dark.avif" alt="オンボーディング ダークモード" />

実際の動作をご覧ください：

<ThemedVideo
  autoplay
  light="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-light.mp4"
  dark="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-dark.mp4"
/>

#### VRM

[Lilia-Chen (Lilia_Chen)](https://github.com/Lilia-Chen) の尽力のおかげで、
正確なカメラ実装とレンダリングメカニズムにより、VRM モデルがより良く表示されるようになりました。

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-vrm-light.avif" alt="時系列チャート ライトモード" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-demo-vrm-dark.avif" alt="時系列チャート ダークモード" />

### モバイル Web

#### オンボーディング

オンボーディングはモバイル Web 版でも利用可能です：

<ThemedVideo
  autoplay
  light="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-mobile-light.mp4"
  dark="/en/blog/DevLog-2025.08.05/assets/airi-demo-onboarding-mobile-dark.mp4"
/>

#### シーン

モバイルのメインシーンは完全に再設計され、書き直されました。

[LemonNekoGH (LemonNeko)](https://github.com/LemonNekoGH) のおかげで、
シーン内の Live2D モデルのオフセットを調整するより良い方法ができました。

このデザインコンセプトは iOS のサイドボリュームコントロールから取り入れました。
より直感的で、すぐに使えると感じていただければ幸いです。

::: tip
デフォルト値にリセットしたいですか？X、Y、またはズームボタンをダブルクリックすると、値がデフォルトにリセットされます。
:::

<br />

<ThemedVideo
  autoplay
  light="/en/blog/DevLog-2025.08.05/assets/airi-demo-quick-editor-mobile-light.mp4"
  dark="/en/blog/DevLog-2025.08.05/assets/airi-demo-quick-editor-mobile-dark.mp4"
/>

### 両方のバージョン

これらの機能のために、さらに多くの興味深い新しいコンポーネントを作成しました。

#### より良いテキストアニメーション

チャットバブルのテキストアニメーションを改善しました。[sumimakito (Makito)](https://github.com/sumimakito/)
が数日前に詳細な DevLog を書き、なぜ私たちが特別にそれを実装したのか、
そして i18n の互換性をどのように考慮したのかを説明しました。ぜひチェックしてください：[DevLog 2025.08.01](../DevLog-2025.08.01/)。

実際の動作をご覧ください：

<video class="light" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-clustr-light.mp4" type="video/mp4">
  お使いのブラウザは動画タグをサポートしていません。
</video>

<video class="dark" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-demo-clustr-dark.mp4" type="video/mp4">
  お使いのブラウザは動画タグをサポートしていません。
</video>

#### レベルメーター

> UI コンポーネント：https://airi.moeru.ai/ui/#/story/src-components-gadgets-levelmeter-story-vue

検出された音声入力レベルやリアルタイムのシステム負荷を表示する場合に便利です：

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-level-meter-light.avif" alt="レベルメーター ライトモード" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-level-meter-dark.avif" alt="レベルメーター ダークモード" />

#### 時系列チャート

> UI コンポーネント：https://airi.moeru.ai/ui/#/story/src-components-gadgets-timeserieschart-story-vue

変化する値のレベルメーターに似ていますが、特に履歴データに役立ちます。

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-time-series-chart-light.avif" alt="時系列チャート ライトモード" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-ui-time-series-chart-dark.avif" alt="時系列チャート ダークモード" />

さらに多くのコンポーネントを追加しました...

- [x] `<Progress />`（@Menci に感謝 [2cb602aa](https://github.com/moeru-ai/airi/commit/2cb602aa3eac456a479b622a5ecf043831597ffe)）
- [x] `<FieldSelect />` ([d0d782ff](https://github.com/moeru-ai/airi/commit/d0d782ff94a5a0a12819725303f687bd1a47e87c))
- [x] `<Alert />`（[@typed-sigterm](https://github.com/typed-sigterm) に感謝, [#295](https://github.com/moeru-ai/airi/pull/295)）
- [x] `<ErrorContainer />`（[@typed-sigterm](https://github.com/typed-sigterm) に感謝, [#295](https://github.com/moeru-ai/airi/pull/295)）
- [x] 新しいサイドバーナビゲーションデザイン
- [x] メッセージトースター
- [x] 新しいバージョンがあるときにユーザーに更新を促す

## コミュニティ

### 新しいドキュメントサイト

現在、新しいドキュメントサイトがあります：

<video class="light" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-docs-light.mp4" type="video/mp4">
  お使いのブラウザは動画タグをサポートしていません。
</video>

<video class="dark" autoplay controls muted loop>
  <source src="/en/blog/DevLog-2025.08.05/assets/airi-docs-dark.mp4" type="video/mp4">
  お使いのブラウザは動画タグをサポートしていません。
</video>

とても素晴らしく見えます。[Reka UI](https://reka-ui.com) の作業に基づいて完全に書き直しましたが、
ブログ記事リスト、言語切り替え、VitePress への多くのスタイルの適応など、多くの機能を追加しました。

いつものように、彼らの美しいデザインに感謝します。私たちは独自のコンポーネントを構築するために彼らのコンポーネントを多く使用しました。
ぜひチェックしてください！

ブログページも素敵です。さらに良いことに、[@lynzrand (Rynco Maekawa)](https://github.com/lynzrand) がデザインした新しいカバーがあります。

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-docs-blogs-light.avif" alt="ブログ ライトモード" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-docs-blogs-dark.avif" alt="ブログ ダークモード" />

### 翻訳ワークフローの変更

いわゆる `i18n` またはローカリゼーションファイルを、独自の巨大な monorepo 内の専用パッケージに分割しました。

新しいローカリゼーションの貢献、新しい翻訳の追加、または既存の翻訳の修正を行う場合は、
まず https://github.com/moeru-ai/airi/tree/main/packages/i18n/src/locales に移動してください。

<img class="light" src="/en/blog/DevLog-2025.08.05/assets/airi-packages-i18n-light.avif" alt="i18n パッケージ ライトモード" />
<img class="dark" src="/en/blog/DevLog-2025.08.05/assets/airi-packages-i18n-dark.avif" alt="i18n パッケージ ダークモード" />

ここでは、さまざまな言語のさまざまなディレクトリがあります。必要な言語を選択して続行します。

英語を例にとると、ディレクトリ構造は次のとおりです：

```bash
└── en
  ├── docs
  ├── tamagotchi
  #
  ├── base.yaml
  ├── settings.yaml
  ├── stage.yaml
  └── index.ts
```

`docs` と `tamagotchi` は、異なるモジュール専用の2つのディレクトリです：

- ドキュメントサイト
- デスクトップ版（Tamagotchi）

ドキュメントサイト（記事や実際のドキュメントではなく、UI）の翻訳を手伝いたい場合は、
`docs` ディレクトリに移動し、`theme.yaml` ファイルを編集します。
これにはドキュメントサイトの UI 文字列が含まれています。

`tamagotchi` ディレクトリは少し特別で、すべての翻訳文字列が見つからない場合があります。
これはデスクトップ版でのみ使用されるいくつかの特別な翻訳を含むことを目的としており、
他のすべての内容はルートディレクトリにあります。

`docs` と `tamagotchi` 以外のすべてについて：

- `base.yaml` には、言語の基本文字列、ボタンの基本状態が含まれます
- `settings.yaml` には、設定ページの文字列が含まれます
- `stage.yaml` には、ステージの文字列が含まれます（モデルを表示する UI）

さらに言語を追加したい場合は、既存の言語ローカリゼーションディレクトリをコピーして貼り付け、
新しい言語コードに名前を変更します。たとえば、フランス語を追加したい場合は、
`en` ディレクトリを `fr` にコピーし、`base.yaml`、`settings.yaml`、
`stage.yaml`、`index.ts` ファイルの編集を開始して翻訳を追加します。
Pull Request のレビュープロセス中は、部分的な翻訳ファイルでも構いません。

::: info 助けが必要です！
これは少しばかげているように聞こえるかもしれませんが、
i18n パッケージと [Crowdin](https://crowdin.com) や [Weblate](https://weblate.org/en/) などの
翻訳自動化ツールとの統合を支援してくれる経験豊富な人を求めています。

私たちはこの分野の専門家ではありません。私たちを助けるために Pull Request を開くか、
議論するために issue を開いてください。
:::

言語コードについては、以下のいずれかのツールを使用して、使用している言語コードを見つけてください：

- [言語サブタグ検索アプリ](https://r12a.github.io/app-subtags/)
- [iana.org/assignments/language-subtag-registry/language-subtag-registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)

```bash
.
├── packages
    ├── i18n
    ├── package.json
    └── src
         ├── index.ts
         └── locales
             ├── en
             │   ├── base.yaml
             │   ├── docs
             │   │   ├── index.ts
             │   │   └── theme.yaml
             │   ├── index.ts
             │   ├── settings.yaml
             │   ├── stage.yaml
             │   └── tamagotchi
             │       ├── index.ts
             │       ├── settings.yaml
             │       └── stage.yaml
             ├── index.ts
             └── zh-Hans
                 ├── base.yaml
                 ├── docs
                 │   ├── index.ts
                 │   └── theme.yaml
                 ├── index.ts
                 ├── settings.yaml
                 ├── stage.yaml
                 └── tamagotchi
                     ├── index.ts
                     ├── settings.yaml
                     └── stage.yaml
```

関連リソースの詳細については、こちらをご覧ください：

- https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag
- https://en.wikipedia.org/wiki/IETF_language_tag
- https://en.wikipedia.org/wiki/ISO_15924

## エンジニアリング

### ツールチェーンによりワークフローが何倍も高速化

TL;DR：

- 多くのパッケージを**ビルドなし**の設定に変換しました
- `unbuild` から `stub` を削除しました
- `rolldown-vite` に切り替えました
- `unbuild` を `tsdown` に置き換えました
- 高速化とキャッシュされたビルドのために `turborepo` を統合しました

詳細：

以前は、シームレスな開発体験を実現するために、Monorepo アーキテクチャを使用することを選択した際、
独自の `jiti` エクスポートと `.d.ts` モジュールを備えたスタブパッケージをブートストラップするために `postinstall` スクリプトに依存する必要がありました。
コントリビューターがプロジェクトをクローンした後に依存関係をインストールするたびにこれを行う必要がありました。

これにより、コントリビューターは monorepo の仕組みを学習しなくても貢献できるようになりました。
しかし、`pnpm install` がトリガーされるたびに再ビルドと再スタブを行うのは賢明な戦略ではないことは明らかです。

[@kwaa](https://github.com/kwaa) がビルドなしアーキテクチャに導入した変更により、
以前最も時間がかかっていた最大のパッケージ `stage-ui` を、型チェックや依存関係解決の問題なしにスキップできるようになりました。

その後、[@kwaa](https://github.com/kwaa) は、`unbuild` によってもたらされる時々問題のある冗長な `stub` スクリプトの削除を支援してくれました。
これにより、厄介な
`The requested module './dist/index.mjs' does not provide an export named 'foo'` エラーと戦う必要のない、よりクリーンなワークフローが得られました。

最大の変更は2か月前、[@kwaa](https://github.com/kwaa) が `vite` の代わりに `rolldown-vite` に切り替えることを選択したときに起こりました。
これにより、**ワークフローが2倍高速化**されました。

しかし、これで終わりではありません。`unbuild` を `tsdown` に置き換えました。これにより、**さらに4.2倍の速度向上が導入**され、
各サブパッケージのビルド時間は250ミリ秒未満になりました。

> `tsdown` への移行にはさらに多くの利点があります...
>
> - 未使用の依存関係チェックの実行
> - CSS のバンドル
> - Vue SFC コンポーネントのバンドル

現在、`postinstall` スクリプトはまだ必要ですが、
依存関係認識を通じてビルド結果をキャッシュする方法を見つけることができれば、多くの冗長なビルドを回避できます。
ここで `turborepo` がより高速なビルドを実現するのに役立ちます。
`turborepo` を使用すると、AIRI のビルドに必要な時間が**平均4分から25秒に短縮**されました。

### Nix をサポート

[@Weathercold (Weathercold)](https://github.com/Weathercold) のおかげで、
AIRI をビルドするための Nix flake ができました。これはクロスプラットフォーム互換性への素晴らしい追加です。
macOS でも動作します。

最終的な Pull Request が nix-pkgs にマージされるのを待っていますが、
次のコマンドを使用して試すことができます：

```bash
nix run --extra-experimental-features 'nix-command flakes' github:moeru-ai/airi
```

### 統一されたビルドパイプライン

以前は、テスト、ステージング、リリースのビルドパイプラインはすべて異なっていました。
これは私にとって新しいバージョンをリリースするかどうかを決める際の悪夢でした。
パイプラインが成功するかどうかわからなかったからです。

Tauri は多くのクロスプラットフォーム互換性の利点と、
Rust を使用してシステムコールやネイティブ OS 機能への統合を行う強力な機能をもたらしてくれましたが...

当初、v0.7 開発の初期段階で、
ASR/STT パイプラインの推論エンジンの実装として [huggingface/candle](https://github.com/huggingface/candle) を導入しましたが、
NVIDIA CUDA に依存していたため、ビルドは本当に混乱しており、いたるところに非互換性がありました。

しかし今ははるかに良くなりました。リリースと同じスクリプトとワークフロー手順を毎日実行する計画されたビルドパイプラインがあります。
（`canary` または `nightly` ビルドとして聞いたことがあるかもしれません。）

技術的には、最新バージョンで問題が発生した場合は、
いつでも `main` ブランチの最新ビルドを試して、修正されたかどうかを確認できます。

ナイトリービルドは https://github.com/moeru-ai/airi/actions/workflows/release-tamagotchi.yml で見つけることができます

## 終わる前に...

このバージョンの間に誕生した新しいパッケージ：

> [@sumimakito](https://github.com/sumimakito) に大声で感謝を叫びます。彼女は数え切れないほど多くの素晴らしいことをしてくれました...

- [`@proj-airi/chromatic`](https://github.com/proj-airi/chromatic)（[@sumimakito](https://github.com/sumimakito) 作）
- [`@proj-airi/unocss-preset-chromatic`](https://github.com/proj-airi/chromatic)（[@sumimakito](https://github.com/sumimakito) 作）
- [`@moeru-ai/jem`](https://github.com/moeru-ai/inventory/tree/main/packages/jem-validator)（[@LemonNekoGH](https://github.com/LemonNekoGH) 作）、統一モデルディレクトリ
- [`clustr`](https://github.com/sumimakito/clustr)（[@sumimakito](https://github.com/sumimakito) 作）
- [`@proj-airi/drizzle-orm-browser`](https://github.com/proj-airi/drizzle-orm-browser)（私作）

このバージョンの間に誕生したサイドプロジェクト：

- [HuggingFace Inspector](https://hf-inspector.moeru.ai/) (https://github.com/moeru-ai/hf-inspector)
- [whisper & VAD、candle、burn、ort に関するその他の candle の例](https://github.com/proj-airi/candle-examples)
- [（モデルディレクトリ）Inventory 提出！](https://github.com/moeru-ai/inventory/pull/1)（[@LemonNekoGH](https://github.com/LemonNekoGH) 作）

この DevLog ですべてを網羅することはできません。詳細については、いつでも
ロードマップ上の [Roadmap v0.7](https://github.com/moeru-ai/airi/issues/200) を追跡および確認できます。

<div class="w-full flex flex-col items-center justify-center gap-3 py-3">
  <img src="/en/blog/DevLog-2025.08.05/assets/relu-sticker-thinks.avif" alt="ReLU 思考中ステッカー" class="w-30!" />
  <div class="text-center">
    <span class="block font-bold">ここまで読んでいただきありがとうございます！</span>
  </div>
</div>
