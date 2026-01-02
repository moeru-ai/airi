---
title: デスクトップ版のガイド
description: Project AIRI のたまごっちバージョンの使い方
---

## 今すぐチャットしたい！

問題ありません、私についてきてください：

- オンボーディングプロセスを完了する

1. 希望の LLM / AI プロバイダーを選択します（デモビデオでは OpenRouter を選択しました）
2. LLM / AI と対話するための API キーを入力します（これはキャラクターの脳/魂として機能します）
3. 希望のチャットモデルを選択します（デモビデオでは `DeepSeek V3 0324` を選択しました）
4. システムトレイから **Fade on Hover**（ホバー時にフェード）モードを無効にします
5. モデル UI にカーソルを合わせ、吹き出しアイコンをクリックすると、チャットウィンドウが表示されます
6. 入力してチャットしましょう！

::: tip ローカルで Ollama を使用していますか？
完了後、`OLLAMA_ORIGINS=*` システム環境変数を設定し、Ollama アプリケーションを再起動する必要があります。
:::

<br />

<video controls autoplay loop muted>
 <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

<br />

ええと、これは早すぎましたね。**Fade on Hover** とは何なのか、どうやってすべてをカスタマイズするのか、まだわかりませんよね？

::: warning 私たちはまだ開発の初期段階にあり、多くの機能はまだ完全には利用できません
いくつかの機能はまだ準備ができていませんが、現在それらを実現するために懸命に取り組んでいます：

- 文字起こし
- ローカル音声合成 (GPT-SoVITS, IndexTTS など)
- 歌唱
- UI からの Discord の設定（ただし、すでに機能しており、設定にはコーディングスキルが必要です）
- UI からの Minecraft エージェントの設定（ただし、すでに機能しており、設定にはコーディングスキルが必要です）
:::

しかし、その前に...

::: tip ありがとうございます！

ダウンロードして試していただきありがとうございます！
:::

ダウンロード後、どこからでも AIRI を起動できます。ユーザーインターフェースは2つの部分で構成されていることがわかります：

- オンボーディング / ウィザードセットアップガイド
- モデル (Live2D および VRM モデルを表示可能)

![](/en/docs/overview/guide/tamagotchi/assets/screenshot-ui.avif)

システムトレイには、次のような他のオプション/コマンドがあります：

- 表示 / 非表示
- 設定を開く
- ウィンドウの自動配置
- など

基本的な概念と機能を説明しながら、一つずつ始めていきましょう。

## ウィンドウ操作

以下について説明します：

- モデルウィンドウとの対話方法は？
- モデルウィンドウの移動方法は？
- サイズ変更の方法は？

### Fade on Hover（ホバー時にフェード）

::: info TL;DR | チートシート
この機能を切り替える（モデルと対話できるようにする）には、<kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd> ショートカットを使用します。

キーのマッピングは [設定] -> [一般] -> [ショートカット] でカスタマイズできます。
:::

モデルにカーソルを合わせると、Live2D モデルがフェードアウト/消え、カーソルで対話できないことに気付くでしょう。

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

これは、デフォルトで **Fade on Hover** 機能が有効になっているためです。つまり、カーソルがモデルウィンドウの上に重なると、ウィンドウがフェードアウトし、クリックがウィンドウを完全に通過します。

これは非常に強力な機能です。コンパニオンがあなたのそばに住んでいる間、それを使えば使うほど便利だと感じるでしょう。ここに私たちが考えた2つのシナリオがあります：

#### CrunchyRoll の閲覧

<video autoplay loop muted>
  <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-demo-browsing-crunchy-roll.mp4" type="video/mp4">
</video>

#### Steam の閲覧

<video autoplay loop muted>
  <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-demo-browsing-steam.mp4" type="video/mp4">
</video>

この機能を無効にするのは簡単です。

この機能を無効にするには2つの方法があります：

- システムトレイ
- ショートカット

以下からこの機能を切り替えることができます：

1. システムトレイアイコンを右クリック
2. **Window mode**（ウィンドウモード）をクリック
3. **Fade on hover**（ホバー時にフェード）をクリック

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-200 translate-x--35 translate-y--23 lg:scale-180 lg:translate-x--60 lg:translate-y--40">
    <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-disable-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

### ウィンドウを移動

::: info TL;DR | チートシート
この機能を切り替える（モデルと対話できるようにする）には、<kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="N" inline-block>N</kbd> ショートカットを使用します。

キーのマッピングは [設定] -> [一般] -> [ショートカット] でカスタマイズできます。
:::

<br />

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

### ウィンドウのサイズ変更

::: info TL;DR | チートシート
この機能を切り替える（モデルと対話できるようにする）には、<kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="A" inline-block>A</kbd> ショートカットを使用します。

キーのマッピングは [設定] -> [一般] -> [ショートカット] でカスタマイズできます。
:::

<br />

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## チャット

現在、システムトレイからチャットウィンドウを呼び出す直接のオプション/コマンドはありませんが、将来的に追加する可能性があります。現在、チャットウィンドウを開くには、**Fade on Hover** モードをオフに切り替える必要があります。

::: info TL;DR | チートシート
Fade on Hover のショートカットは：<kbd aria-label="Shift" data-keyboard-key="shift" inline-block>Shift</kbd> + <kbd aria-label="Alt" data-macos-keyboard-key="option" inline-block>Alt</kbd> + <kbd aria-label="I" inline-block>I</kbd> です。
:::

<br />

<video autoplay loop muted>
 <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-open-chat.mp4" type="video/mp4">
</video>

## 設定

システムトレイの設定を開いて、AIRI のテーマカラーを変更したり、Live2D (2D) または VRM (3D、Grok Companion など) の別のモデルに切り替えたりするなど、さらにカスタマイズすることができます。

<video autoplay loop muted>
 <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

設定には非常に多くのオプションがあります。試して、何ができるか発見してください。

### モデルの変更

デフォルトのモデルを他の Live2D (2D) や VRM (3D、繰り返しになりますが、持っていれば Grok Companion のような同様の 3D モデル) に交換することが可能です。

モデル設定は [設定] -> [モデル] にあります。

::: tip VTuber Studio からモデルをインポートしますか？
私たちが Live2D モデルのレンダリングに使用しているライブラリは、VTuber Studio モデルからバンドルされた ZIP ファイルを読み取るのに問題があります。これは、VTuber Studio が使用している不明なファイルが含まれており、Live2D エンジンが認識するファイルではないためです。

そのため、インポートするときは、VTuber Studio モデルを ZIP ファイルに圧縮する前に、次のファイルを除外するようにしてください：

- `items_pinned_to_model.json`
:::

<br />

::: warning バグあり
現在、モデルのシーンをリロードする機能は意図したとおりに機能していません。
モデルをロードした後、AIRI を再起動する必要があります。
:::

<br />

<video autoplay loop muted>
 <source src="/en/docs/overview/guide/tamagotchi/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
