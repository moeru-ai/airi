---
title: 設定ガイド
description: Project AIRI デスクトップ版の使い方
---

## 設定

システムトレイの設定を開いて、AIRI のテーマカラーを変更したり、Live2D (2D) または VRM (3D、Grok Companion など) の別のモデルに切り替えたりするなど、さらにカスタマイズすることができます。

<video autoplay loop muted>
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
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
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
