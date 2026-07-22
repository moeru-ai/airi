---
title: アリババクラウドNLS
description: AIRI での Alibaba Cloud インテリジェント音声インタラクション サービス (ASR) の設定
---

Alibaba Cloud NLS は、AIRI にリアルタイム音声テキスト変換 (ASR) 機能を提供します。設定が完了したら、「ヒアリング」でAlibaba Cloud NLSを選択し、マイク入力をテストします。

::: info Alibaba Cloud NLS を選ぶ理由?
すでに Alibaba Cloud アカウントを使用していて、リアルタイム音声認識機能が必要な場合は、Alibaba Cloud NLS を選択できます。
:::

## ステップ 1: 資格情報を準備する

1. [Alibaba Cloud Intelligent Voice Interaction Console] (https://nls-portal.console.aliyun.com/overview)开通服务并创建项目，复制该项目的 **AppKey**) で。
2. **AccessKey Management** で必要な権限を持つ RAM ユーザー AccessKey を作成します。
3. **AccessKey ID** と **AccessKey Secret** をコピーします。通常、シークレットは完全に 1 回だけ表示されます。

::: 警告 AccessKey セキュリティ
AccessKey ID、AccessKey Secret、または AppKey をリポジトリに送信したり、スクリーンショットを撮ったり、他の人に送信したりしないでください。最小特権の原則に従ってください。認証情報が漏洩した後は、すぐに無効にして、Alibaba Cloud コンソールで新しい認証情報を作成してください。
:::

## ステップ 2: AIRI で設定する

1. **[設定] → [サービス プロバイダー] → [音声認識] → [Alibaba Cloud NLS]** を開きます。
2. **AccessKey ID**、**AccessKey Secret**、**AppKey** を入力します。
3. 中国東部 `cn-shanghai`、中国北部 `cn-beijing`、中国南部 `cn-shenzhen` など、最も近いエリアを選択します。

## ステップ 3: 構成を確認する

1. 確認ページでは、基本的な資格情報の検証が成功したことを確認するメッセージが表示されます。
2. 「ヒアリング」で Alibaba Cloud NLS とオーディオ入力デバイスを選択します。
3. [モニタリングの開始] をクリックし、マイクに向かって話すか、オーディオ クリップを再生します。
4. 文字起こしエリアにテキストがリアルタイムに出力できることを確認します。認識結果が不正確な場合は、感度を調整して再度テストできます。

## トラブルシューティング

資格情報の検証が失敗した場合は、3 つの資格情報が同じ Alibaba Cloud アカウントおよびプロジェクトからのものであることを確認し、RAM ユーザー権限を確認してください。テキスト結果がない場合は、システムが AIRI マイクの許可を与えているかどうかを確認してください。
