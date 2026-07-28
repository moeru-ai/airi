---
title: アリババクラウドバイリアン（TTS）
description: AIRI での Alibaba Cloud Bailian 音声合成の設定
---

Alibaba Cloud Bailian は、AIRI で CosyVoice 音声合成モデルを提供します。

::: info Alibaba Cloud Bailian を選ぶ理由?
すでに Alibaba Cloud Bailian を使用していて、CosyVoice のVoiceとモデルの中から選択したい場合は、これが直接アクセス方法です。
:::

## ステップ 1: API キーを取得する

1. [Alibaba Cloud Model Studio コンソール](https://bailian.console.aliyun.com/) で Model Studio を有効にし、使用する CosyVoice モデルへのアクセスを確認します。
2. API キー管理ページでキーを作成します。
3. キーをコピーし、安全な場所に保管します。

::: warning API キーのセキュリティ
Bailian API キーをリポジトリにコミットしたり、スクリーンショットを撮ったり、他の人に送信したりしないでください。
:::

## ステップ 2: AIRI で設定する

1. **設定 → プロバイダー → Speech → Alibaba Cloud Model Studio**を開きます。
2. Model Studio API キーを入力します。デフォルトのベース URL `https://unspeech.hyp3r.link/v1/` は Alibaba Cloud の直接 API ではなく、AIRI/UnSpeech ゲートウェイです。API キー、合成するテキスト、モデル/Voice の選択、返される音声がこのゲートウェイを経由します。許容できない場合は互換性のあるセルフホストゲートウェイを入力するか、直接接続するプロバイダーを選択します。

## ステップ 3: 構成を確認する

1. プロバイダー設定でモデルと利用可能な音声を選択します。
2. 同じページのプレイグラウンドで短いテキストを入力し、音声が再生されることを確認します。

## AIRI の返信で有効にする

**設定 → モジュール → 音声**を開き、**Alibaba Cloud Model Studio**、利用可能なモデル、Voice を選択します。プレイグラウンドは認証情報のテスト用であり、このモジュール選択によって通常の返信で音声が有効になります。

## トラブルシューティング

プレイグラウンドでリクエストが完了しない場合は、API キー、アカウント制限、ネットワーク接続を確認してください。モデルまたはVoiceが選択できない場合は、対応するモデルが Bailian アカウントで開かれていることを確認してください。
