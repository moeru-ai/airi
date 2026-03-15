---
title: 開発ログ @ 2025.03.20
category: DevLog
date: 2025-03-20
---

<script setup>
import Gelbana from '../../../en/blog/DevLog-2025.03.20/assets/steins-gate-gelnana-from-elpsycongrooblog.avif'
import NewUIV3 from '../../../en/blog/DevLog-2025.03.10/assets/new-ui-v3.avif'
import NewUIV3Dark from '../../../en/blog/DevLog-2025.03.10/assets/new-ui-v3-dark.avif'
import HistoireColorSlider from '../../../en/blog/DevLog-2025.03.20/assets/histoire-color-slider.avif'
import HistoireColorSliderDark from '../../../en/blog/DevLog-2025.03.20/assets/histoire-color-slider-dark.avif'
import HistoireLogo from '../../../en/blog/DevLog-2025.03.20/assets/histoire-logo.avif'
import HistoireLogoDark from '../../../en/blog/DevLog-2025.03.20/assets/histoire-logo-dark.avif'
import NewUIV4Speech from '../../../en/blog/DevLog-2025.03.20/assets/new-ui-v4-speech.avif'
import NewUIV4SpeechDark from '../../../en/blog/DevLog-2025.03.20/assets/new-ui-v4-speech-dark.avif'
import SteinsGateMayori from '../../../en/blog/DevLog-2025.03.20/assets/steins-gate-mayori.avif'
</script>

またお会いしましたね！前回の開発ログから10日が経ちました。

ユーザーインターフェースに多くの改善を加え、より多くの LLM プロバイダーや音声プロバイダーを統合できるようにし、Discord、bilibili、その他多くのソーシャルメディアプラットフォームで初めて AIRI を公開しました。

お伝えしたいことがたくさんあります。

## 既視感

少し時間を巻き戻してみましょう！

<img :src="Gelbana" alt="Gelbana" />

> ああ、心配しないでください。私たちが愛する [AIRI](https://github.com/moeru-ai/airi) はこのようなゲルバナにはなりません。でも、もし [_Steins;Gate_](https://myanimelist.net/anime/9253/Steins_Gate) アニメシリーズを見たことがないなら、ぜひ見てみることを強くお勧めします〜！

初期設定 UI デザインの開発を続けており、アニメーション効果が改善され、10日前にはカスタマイズ可能なテーマカラーが実装されました。私たち全員にとって本当に忙しい一週間でした（特に私たちは皆パートタイムでこのプロジェクトに参加していますから（笑）。もしよろしければ、ぜひ参加してください。🥺（懇願））。

当時の最終結果はこんな感じでした：

<img class="light" :src="NewUIV3" alt="new ui" />
<img class="dark" :src="NewUIV3Dark" alt="new ui" />

<h2 class="devlog-steins-gate-divergence-meter-heading">
  <span class="nixie-digit">0</span>
  <span class="nixie-digit">.</span>
  <span class="nixie-digit">5</span>
  <span class="nixie-digit">7</span>
  <span class="nixie-digit">1</span>
  <span class="nixie-digit">0</span>
  <span class="nixie-digit">2</span>
  <span class="nixie-digit">4</span>
</h2>

~~β世界線へようこそ。~~

モデルのラジオグループやナビゲーション項目のカラーカード、そしてカスタマイズ可能なテーマができたので、ビジネスワークフローで UI コンポーネントをデバッグする際に困難に直面することは明らかでした。これは明らかに開発速度を低下させます。

そこで、[`Histoire`](https://histoire.dev) という魔法のツールを導入することにしました。これは基本的に [Storybook](https://storybook.js.org/) のようなものですが、[Vite](https://vitejs.dev) と [Vue.js](https://vuejs.org) の組み合わせにより適しています。

これは [@sumimakito](https://github.com/sumimakito) が完成後に録画したファーストルックです：

<ThemedVideo muted autoplay src="/en/blog/DevLog-2025.03.20/assets/histoire-first-look.mp4" />

OKLCH パレット全体を一度にキャンバスに展開して参照することができます。しかし、色を試して Project AIRI のテーマと同じ感覚を得るには、少し不完全ですよね？

そこで、まずカラースライダーを再実装して、より適切な感じにしました：

<img class="light" :src="HistoireColorSlider" alt="color slider" />
<img class="dark" :src="HistoireColorSliderDark" alt="color slider" />

これでスライダーがよりプロフェッショナルになりました。

ロゴとデフォルトの緑色は、AIRI のテーマに合わせて置き換えることができます。そのため、UI ページ専用に別のロゴをデザインしました：

<img class="light" :src="HistoireLogo" alt="project airi logo for histoire" />
<img class="dark" :src="HistoireLogoDark" alt="project airi logo for histoire" />

ああ、そうそう、UI コンポーネント全体はいつものように Netlify の `/ui/` パスにデプロイされています。UI 要素がどのようなものか知りたい場合は、いつでもチェックしてください：
[https://airi.moeru.ai/ui/](https://airi.moeru.ai/ui/)

この開発ログでは完全にカバーしきれない機能がたくさんあります：

- [x] すべての LLM プロバイダーをサポート。
- [x] メニューナビゲーション UI のアニメーションとトランジションを改善。
- [x] フィールドの間隔を改善、新しいフォーム！
- [x] コンポーネント（[ロードマップ](https://github.com/moeru-ai/airi/issues/42)上のほぼすべての TODO コンポーネント）
  - [x] フォーム
    - [x] ラジオ
    - [x] ラジオグループ
    - [x] モデルカタログ
    - [x] 範囲
    - [x] 入力
    - [x] キーバリュー入力
  - [x] データ GUI
    - [x] 範囲
  - [x] メニュー
    - [x] メニュー項目
    - [x] メニュー状態項目
  - [x] グラフィック
    - [x] 3D
  - [x] 物理
    - [x] カーソルモーメンタム
  - [x] その他...

モーメンタムと 3D についてもいくつか実験を行いました。

これを見てください：

<img class="light" :src="NewUIV4Speech" alt="brand new speech design" />
<img class="dark" :src="NewUIV4SpeechDark" alt="brand new speech design" />

ついに音声モデル設定をサポートしました 🎉！（以前は ElevenLabs しか設定できませんでした）私たちが開発している別の魔法のプロジェクト `unspeech` の[新 `v0.1.2` バージョン](https://github.com/moeru-ai/unspeech/releases/tag/v0.1.2)以来、[`@xsai/generate-speech`](https://xsai.js.org/docs/packages/generate/speech) を介して Microsoft Speech サービス（つまり Azure AI Speech サービス、または Cognitive Speech Services）をリクエストできるようになりました。これはつまり、ついに Microsoft 用の OpenAI API 互換の TTS サービスを手に入れたことを意味します。

しかし、なぜこれをサポートすることがそれほど重要なのでしょうか？

それは、Neuro-sama の最初のバージョンでは、テキスト読み上げサービスが Microsoft によって提供されており、`Ashley` という声を使用し、`+20%` のピッチを加えることで、Neuro-sama の最初のバージョンと同じ声を得ることができるからです。自分で試してみてください：

<audio controls style="width: 100%;">
  <source src="/en/blog/DevLog-2025.03.20/assets/ashley-pitch-test.mp3" />
</audio>

完全に同じではありませんか、これは本当にクレイジーです！つまり、私たちはついに新しい**音声**機能を通じて、Neuro-sama ができることに近づくことができるのです！

<img :src="SteinsGateMayori" alt="character from anime Steins;Gate" />

<h2 class="devlog-steins-gate-divergence-meter-heading">
  <span class="nixie-digit">1</span>
  <span class="nixie-digit">.</span>
  <span class="nixie-digit">3</span>
  <span class="nixie-digit">8</span>
  <span class="nixie-digit">2</span>
  <span class="nixie-digit">7</span>
  <span class="nixie-digit">3</span>
  <span class="nixie-digit">3</span>
</h2>

これらすべてを組み合わせて、この結果を得ることができます：

<ThemedVideo controls muted autoplay src="/en/blog/DevLog-2025.03.20/assets/airi-demo.mp4" />

ほぼ同じです。しかし、私たちの物語はここでは終わりません。現時点では、記憶機能、より良い動作制御はまだ実装されておらず、文字起こし設定 UI も欠けています。月末までにこれらを完了できることを願っています。

私たちは以下を計画しています：

- [ ] 記憶 Postgres + Vector
- [ ] 埋め込み設定 UI
- [ ] 文字起こし設定 UI
- [ ] 記憶 DuckDB WASM + Vector
- [ ] 動作埋め込み
- [ ] 音声設定 UI

今日の DevLog はここまでです。DevStream に参加し、最後まで付き合ってくれた皆さんに感謝します。

また明日お会いしましょう。

> El Psy Congroo.
