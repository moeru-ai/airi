---
title: Cloudflare Workers AI
description: AIRIでCloudflare Workers AIチャットモデルを構成する
---

Cloudflare Workers AI はアカウントレベルの認証情報を使用します。 API トークンに加えて、AIRI では Workers AI リソースを見つけるために Cloudflare アカウント ID が必要です。

::: info Cloudflare Workers AIを選ぶ理由?
モデルサービスがCloudflareアカウントにデプロイされている場合、Workers AIを使用してアカウントのトークンとアカウントIDを直接再利用できます。
:::

## ステップ 1: 資格情報を準備する

1. [Cloudflare API トークン](https://dash.cloudflare.com/profile/api-tokens) を開いてログインし、必要な API キーまたは認証情報を作成します。
2. トークンをコピーします。
3. [Cloudflare コンソール](https://dash.cloudflare.com/)でアカウント ID を確認してコピーします。

::: warning 安全リマインダー
API トークンはアカウントの権限にバインドされています。最小特権の原則に従い、AIRI が必要とする Workers AI 権限のみを付与してください。公開ログでトークンまたはアカウント ID を公開しないでください。
:::

## ステップ 2: AIRI で設定する

1. **「設定」→「プロバイダー」→「チャット」→「Cloudflare Workers AI」**を開きます。
2. **API トークン** と **アカウント ID** を入力します。

## ステップ 3: 構成を確認する

1. 基本的な資格情報の検証に合格したことを確認します。
2. **モデルの選択**: テストが成功したら、ここをクリックして使用する特定のモデルを選択します。

## トラブルシューティング

AIRI によって認証情報が無効であるというメッセージが表示された場合は、トークン権限とアカウント ID が同じ Cloudflare アカウントのものであるかどうかを確認してください。このプロバイダーは編集可能なベース URL を使用しないため、フィールドにワーカー URL または API パスを入力する必要はありません。
