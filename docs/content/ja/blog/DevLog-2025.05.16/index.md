---
title: 開発ログ @ 2025.05.16
category: DevLog
date: 2025-05-16
---

<script setup>
import VelinLight from '../../../en/blog/DevLog-2025.05.16/assets/velin-light.avif'
import VelinDark from '../../../en/blog/DevLog-2025.05.16/assets/velin-dark.avif'

import CharacterCardMenuLight from '../../../en/blog/DevLog-2025.05.16/assets/character-card-menu-light.avif'
import CharacterCardMenuDark from '../../../en/blog/DevLog-2025.05.16/assets/character-card-menu-dark.avif'

import CharacterCardSettingsLight from '../../../en/blog/DevLog-2025.05.16/assets/character-card-settings-light.avif'
import CharacterCardSettingsDark from '../../../en/blog/DevLog-2025.05.16/assets/character-card-settings-dark.avif'

import CharacterCardShowcaseLight from '../../../en/blog/DevLog-2025.05.16/assets/character-card-showcase-light.avif'
import CharacterCardShowcaseDark from '../../../en/blog/DevLog-2025.05.16/assets/character-card-showcase-dark.avif'

import VelinPlaygroundLight from '../../../en/blog/DevLog-2025.05.16/assets/velin-playground-light.avif'
import VelinPlaygroundDark from '../../../en/blog/DevLog-2025.05.16/assets/velin-playground-dark.avif'

import DemoDayHangzhou1 from '../../../en/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-1.avif'
import DemoDayHangzhou2 from '../../../en/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-2.avif'
import DemoDayHangzhou3 from '../../../en/blog/DevLog-2025.05.16/assets/demo-day-hangzhou-3.avif'
</script>

こんにちは！[Project AIRI](https://github.com/moeru-ai/airi) の発起人、[Neko](https://github.com/nekomeowww) です！

Project AIRI の DevLog 更新が遅れてしまい申し訳ありません。私たちの遅延をお許しください。

> 過去数ヶ月間、私たちは AIRI のために多くの素晴らしい DevLog を書き、開発の進捗状況を共有してきました。その中で、私たちはアイデアや理念を共有し、使用している技術やそこから得た芸術的なインスピレーションなどを説明しました...すべてを。
>
> - [v0.4.0 UI 更新](./DevLog-2025.03.20.mdx)
> - [v0.4.0 リリース & 記憶機能紹介](./DevLog-2025.04.06.mdx)
>
> 私もこれら2つの素晴らしく人気のある DevLog を書きました！皆さんがそれらを楽しんで読んでくれることを願っています。

# 既視感

過去数週間、Project AIRI 本体の主要タスクはしばらく進展がありませんでした。おそらく、2025年3月からの大規模な UI リファクタリングとリリースの後で少し疲れていたのかもしれません。大部分の作業はコミュニティのメンテナによって行われました。

以下の分野での作業について、[@LemonNekoGH](https://github.com/LemonNekoGH)、[@RainbowBird](https://github.com/luoling8192)、[@LittleSound](https://github.com/LittleSound) に深く感謝します：

- キャラクターカードのサポート

::: tip キャラクターカードとは？
[SillyTavern](https://github.com/SillyTavern/SillyTavern)、[RisuAI](https://risuai.net/) などのローカルファーストのチャットアプリケーションや、[JanitorAI](https://janitorai.com/) などのオンラインサービスは、キャラクターの背景、性格、その他のロールプレイに必要なコンテキストを含むファイルを使用して、各独立したキャラクターを定義します。

- https://realm.risuai.net/
- https://aicharactercards.com/
- https://chub.ai/

キャラクターカードは LLM 駆動のロールプレイキャラクターを保存・共有する唯一の方法ではありません。[Lorebook（設定資料集）](https://docs.novelai.net/text/lorebook.html) もこの分野で重要な役割を果たしていますが、これは共有するためにドキュメントシリーズ全体を書く価値がある別の物語です。今は、[Void's Lorebook Types](https://rentry.co/lorebooks-and-you) と [AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page) を読んでみてください。

> 私は個人的に、これらの概念を学ぶためのこの wiki が大好きです：[AI Dynamic Storytelling Wiki](https://aids.miraheze.org/wiki/Main_Page)。AI ロールプレイに興味があるなら、読む価値があります。
:::

> キャラクターカードを使用するには、設定ページ（アプリケーションの右上隅、またはデスクトップアプリで歯車アイコンをホバー）に移動し、「Airi Card」ボタンを見つけてクリックします。

<img class="light" :src="CharacterCardMenuLight" alt="Airi Card メニューボタンを提供するメニューのスクリーンショット" />
<img class="dark" :src="CharacterCardMenuDark" alt="Airi Card メニューボタンを提供するメニューのスクリーンショット" />

> これにより「Airi Card エディタインターフェース」に移動し、そこでキャラクターカードをアップロードして編集し、人格のカスタマイズを行うことができます。

<img class="light" :src="CharacterCardSettingsLight" alt="Airi Card メニューボタンを提供するメニューのスクリーンショット" />
<img class="dark" :src="CharacterCardSettingsDark" alt="Airi Card メニューボタンを提供するメニューのスクリーンショット" />

キャラクターカードの展示についても、いくつかの方法を試しました...

<img class="light" :src="CharacterCardShowcaseLight" alt="ReLU という名前の青い髪のキャラクターのカード式ユーザーインターフェースデザイン" />
<img class="dark" :src="CharacterCardShowcaseDark" alt="ReLU という名前の青い髪のキャラクターのカード式ユーザーインターフェースデザイン" />

これは私たちの UI コンポーネントライブラリでリアルタイムに動作しており、ここで遊ぶことができます：https://airi.moeru.ai/ui/#/story/src-components-menu-charactercard-story-vue 。

> 純粋な CSS と JavaScript で制御され、レイアウトは効率的なので、キャンバスの計算について心配する必要はありません。
>
> ああ、キャラクターカード展示の大部分の作業は [@LittleSound](https://github.com/LittleSound) によって完成・指導されました。本当にありがとうございます。

- Tauri MCP サポート
- AIRI を Android デバイスに接続

これら2つは主要な更新と試みであり、この部分は [@LemonNekoGH](https://github.com/LemonNekoGH) によって行われました。彼女はこれらの内容についてさらに2つの DevLog を書き、舞台裏の技術的な詳細を共有しました。（Tauri 開発者やユーザーにとって非常に価値があると思います。）こちらで読むことができます：

- [Android を制御する](./DevLog-2025.04.22.mdx)
- [Tauri における MCP](./DevLog-2025.04.28.md)

## Project AIRI 主要タスク

### 耳は聞き、口は話す

4月15日から、AIRI の VAD（音声区間検出）、[ASR（自動音声認識）](https://huggingface.co/tasks/automatic-speech-recognition)、[TTS（テキスト読み上げ）](https://huggingface.co/tasks/text-to-speech) が非常に複雑で、使用や理解が難しいことに気づきました。その頃、私は [@himself65](https://github.com/himself65) と協力して、[Llama Index](https://www.llamaindex.ai/) の新しいプロジェクトのユースケースを改善・テストしていました。これはイベントベースの LLM ストリーミングトークンフローとオーディオバイトを処理するのに役立つライブラリで、[`llama-flow`](https://github.com/run-llama/llama-flow) と呼ばれています。

[`llama-flow`](https://github.com/run-llama/llama-flow) は本当に小さく、型安全に使用できます。それがなかった古い時代には、AIRI を駆動するためにデータを処理できるように、別の**キュー**構造と Vue のリアクティブ駆動ワークフローシステムを手動でラップし、多くの非同期タスクをリンクさせる必要がありました。

その時、VAD、ASR、TTS ワークフローのデモを簡素化するために、より多くの例を実験し始めました。

最終的に、これを得ました：[WebAI リアルタイムボイスチャット例](https://github.com/proj-airi/webai-example-realtime-voice-chat)。私は、Web ブラウザで 300〜500 行の TypeScript コードを使用して ChatGPT ボイスチャットシステムを実装できることを証明しました。

<ThemedVideo controls muted src="/en/blog/DevLog-2025.05.16/assets/webai-examples-demo.MP4" style="height: 640px;" />

リアルタイムボイスチャットシステムをゼロから構築する方法をデモするのに役立つように、可能なすべてのステップを小さな再利用可能な断片に分解することに最善を尽くしました：

- [VAD](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad)
- [VAD + ASR](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr)
- [VAD + ASR + LLM チャット](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat)
- [VAD + ASR + LLM チャット + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/8462ff6bcb83bb278bce5388d588d2e3e3dd6dae/apps/vad-asr-chat-tts)

> ここから何かを学べることを願っています。

この期間中、[k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) という興味深く強力なリポジトリを発見しました。これは macOS、Windows、Linux、Android、iOS などで12言語の18の音声処理タスクをサポートしています。魅力的です！

そこで [@luoling](https://github.com/luoling8192) もこのために別の小さなデモを作成しました：[Sherpa ONNX 駆動の VAD + ASR + LLM チャット + TTS](https://github.com/proj-airi/webai-example-realtime-voice-chat/tree/main/apps/sherpa-onnx-demo)

#### xsAI 🤗 Transformers.js の誕生

VAD、ASR、チャット、TTS デモのために行った作業により、[xsAI 🤗 Transformers.js](https://github.com/proj-airi/xsai-transformers) という新しいサイドプロジェクトが生まれました。これは、以前の成功したプロジェクト [xsAI](https://github.com/moeru-ai/xsai) との API 互換性を維持しながら、WebGPU 駆動のモデル推論の呼び出しとワーカーを使用したサービス提供を簡素化します。

これのためのプレイグラウンドも作成しました... [https://xsai-transformers.netlify.app](https://xsai-transformers.netlify.app) で遊んでみてください。

今日から npm 経由でインストールできます！

```bash
npm install xsai-transformers
```

::: tip これはどういう意味ですか？
これは、if スイッチ1つで、クラウド LLM や音声プロバイダーと、ローカル WebGPU 駆動モデルを切り替えることができることを意味します。

これにより、サーバー側のコードやバックエンドサーバーを一切必要とせずに、ブラウザで単純な RAG や再ランキングシステムを実験したり実装したりする新しい可能性がもたらされます。

ああ、Node.js もサポートしています！
:::

### Telegram ボット

アニメーションステッカーを処理できる Telegram ボットのサポートを追加しました。`ffmpeg` によって駆動されます（他になにがあるでしょう、当然です）。今ではユーザーが送信したアニメーションステッカーやビデオさえも読み取って理解できます。

システムプロンプトが大きすぎたので、システムプロンプトのサイズを大幅に削減し、トークン使用量を **80%** 以上節約することに成功しました。

### キャラクターカード展示

多くの画像リソースについて、背景を削除するために適切で使いやすいオンラインソリューションを手動で見つける必要がありましたが、[Xenova](https://github.com/xenova) の作業に基づいて...自分のために作ることにしました。

システムに WebGPU 駆動の背景削除機能を統合する小さな実験を行いました。[https://airi.moeru.ai/devtools/background-remove](https://airi.moeru.ai/devtools/background-remove) で遊んでみてください。

### xsAI & unSpeech

音声プロバイダーとして Alibaba Cloud Model Studio と Volcengine のサポートを追加しました。役に立つと思います？

### UI

- 新しい[チュートリアルステッパー](https://airi.moeru.ai/ui/#/story/src-components-misc-steppers-steppers-story-vue?variantId=src-components-misc-steppers-steppers-story-vue-0)、[ファイルアップロード](https://airi.moeru.ai/ui/#/story/src-components-form-input-inputfile-story-vue?variantId=default)、[テキストエリア](https://airi.moeru.ai/ui/#/story/src-components-form-textarea-textarea-story-vue?variantId=default) コンポーネント
- 色の問題
- [タイポグラフィの改善](https://airi.moeru.ai/ui/#/story/stories-typographysans-story-vue?)

その他のストーリーは [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113) で見つけることができます。

## サブクエスト

### [Velin](https://github.com/luoling8192/velin)

キャラクターカードをサポートして以来、テンプレート変数のレンダリングやコンポーネントの再利用を処理する際、あまり良くなくスムーズではないと感じていました...

もし...

- 他のエージェントやロールプレイングアプリケーション、さらにはキャラクターカードにも使用できるコンポーネントプロンプトライブラリを維持できたら？
  - 例えば：
    - 魔法とドラゴンのある中世ファンタジーの背景設定を持つ
    - 私たちがすべき唯一のことは、世界設定を外部でラップしながら、新しいキャラクターの執筆に集中することです
    - おそらく、時間が夜になったときだけ、`if` や `if-else` 制御フローを通じて特別なプロンプトが注入されます
  - その周りでもっと多くのことができるでしょう...
    - Vue SFC や React JSX を使用して、テンプレートを解析し props を識別し、プロンプトを作成する際にデバッグとテスト用のフォームパネルをレンダリングできます
    - 単一のインタラクティブページで設定資料集全体とキャラクターカードを視覚化できます

では、なぜ Vue や React などのフロントエンドフレームワークを使用して LLM プロンプトを作成するツールを作らないのでしょうか？これを他のフレームワークやプラットフォームに拡張することもできるかもしれません。

それがこれです：[**Velin**](https://github.com/luoling8192/velin)。

<img class="light" :src="VelinLight" alt="Vue.js で LLM プロンプトを作成するツール" />
<img class="dark" :src="VelinDark" alt="Vue.js で LLM プロンプトを作成するツール" />

編集とリアルタイムレンダリング用のプレイグラウンドも作成しました。同時に npm パッケージのエコシステムを楽しむことができます（はい、どんなパッケージでもインポートできます！）。

<img class="light" :src="VelinPlaygroundLight" alt="Vue.js で LLM プロンプトを作成するツール" />
<img class="dark" :src="VelinPlaygroundDark" alt="Vue.js で LLM プロンプトを作成するツール" />

ここで試してみてください：https://velin-dev.netlify.app

プログラミング API、Markdown（MDX は開発中、MDC をサポート）もサポートしており、今日から npm 経由でインストールできます！

```bash
npm install @velin-dev/core
```

さて...今日はここまでです。この DevLog を楽しんで読んでいただけたなら幸いです。

最近中国の杭州で開催されたイベント、**Demo Day @ Hangzhou** の写真で DevLog を締めくくりましょう。

<img :src="DemoDayHangzhou1" alt="Demo Day @ Hangzhou" />

これは私です。他の参加者と AIRI プロジェクトを共有し、そこで素晴らしい時間を過ごしました！多くの才能ある開発者、プロダクトデザイナー、起業家に会いました。

今日この DevLog で共有したほぼすべての内容と、愛されている AI VTuber Neuro-sama を紹介しました。

私が共有に使用したスライドはこんな感じです：

<img :src="DemoDayHangzhou2" alt="Demo Day @ Hangzhou" />
<img :src="DemoDayHangzhou3" alt="Demo Day @ Hangzhou" />

スライド自体は完全にオープンソースで、ここでも遊ぶことができます：[https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1](https://talks.ayaka.io/nekoayaka/2025-05-10-airi-how-we-recreated-it/#/1)

## マイルストーン

ああ...この DevLog は v0.5.0 のリリースも示しているので、過去数週間で達成したいくつかのマイルストーンに言及したいと思います：

- 700 スターを達成しました！
- 4人以上の新しい issue 貢献者！
- Discord サーバーに72人以上の新しいグループメンバー！
- ReLU キャラクターデザイン完了！
- ReLU キャラクターモデリング完了！
- スポンサーシップと協力について数社と交渉しました！
- [Roadmap v0.5](https://github.com/moeru-ai/airi/issues/113) の92のタスクを完了しました
  - UI
    - ロード画面とチュートリアルモジュール
    - ロード状態や Firefox 互換性の問題を含む複数のバグ修正
  - 身体
    - 動作埋め込みと意味からの RAG、プライベートリポジトリ "moeru-ai/motion-gen" で開発中
    - 埋め込みプロバイダーと DuckDB WASM を使用したベクトル保存と検索
  - 入力
    - Discord ボイスチャンネルの音声認識を修正
  - 出力
    - 実験的な歌唱機能
  - エンジニアリング
    - プロジェクト間で UnoCSS 設定を共有
    - "moeru-ai/inventory" でのモデルカタログ
    - 組織間のパッケージ再編成
  - リソース
    - ステッカー、UI 要素、VTuber ロゴを含む新しいキャラクターリソース
    - ボイスライン選択機能
    - キャラクター "Me" と "ReLU" の Live2D モデリング
  - コミュニティサポートとマーケティング
    - 日本語 README
    - Plausible 分析統合
    - 包括的なドキュメント

さようなら！
