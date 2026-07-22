---
title: Google Gemini
description: AIRI での Google Gemini チャット モデルの設定
---

Google Gemini プロバイダーは、Google Generative Language API の OpenAI 互換エンドポイントを使用します。設定が完了したら、「認識」ページで Gemini モデルを選択します。

::: info Google Gemini を選ぶ理由
すでに Gemini API キーを持っている場合、または AIRI で Gemini モデルを使用したい場合は、このサービス プロバイダーを選択できます。
:::

## ステップ 1: API キーを作成する

1. [Google AI Studio API キー](https://aistudio.google.com/app/apikey)，创建 Gemini API キー)を開いてログインします。
2. キーが属するプロジェクトが Gemini API を有効にし、ターゲット モデルを使用できることを確認します。
3. API キーをコピーします。

::: warning API キーのセキュリティ
キーが漏洩した後は、すぐにキーを取り消して、Google AI 開発者コンソールで再作成してください。コード、スクリーンショット、または公開設定ファイルにキーを含めないでください。
:::

## ステップ 2: AIRI で設定する

1. **[設定] → [サービス プロバイダー] → [チャット] → [Google Gemini]** を開きます。
2. API キーを入力します。
3. デフォルトのベース URL `https://generativelanguage.googleapis.com/v1beta/openai/` をそのまま使用します。

## ステップ 3: 構成を確認する

1. **Ping API**: このボタンをクリックして、ネットワークが接続されているかどうか、また API キーが正しく入力されているかどうかをテストします。
2. **モデルの選択**: テストが成功したら、ここをクリックして使用する特定のモデルを選択します。

## トラブルシューティング

Ping API は、ネットワーク、モデル リスト、チャット リクエストをチェックします。権限またはモデルが利用できないエラーが発生した場合は、まず API キーに対応するプロジェクトの API アクティベーション ステータスとリージョンでの利用可能性を確認してください。 Google AI Studio に表示されるモデル名を他の形式に書き換えないでください。 AIRIでは、まずモデルリストから選択します。
