---
title: キャラクターカードテンプレート
description: Project AIRI 用の Character Card V3 JSON テンプレートです。
---

このテンプレートは、AIRI のキャラクターカードを作成するための最小構成の Character Card V3 JSON です。下の JSON をコピーし、サンプルの値を自分のキャラクター設定に置き換えてください。フィールド名と階層構造はそのまま残します。

::: tip 編集のヒント
- まずは `name`、`description`、`personality`、`scenario`、`first_mes` から入力します。
- まだ使わない任意項目は空のままで問題ありません。
- インポートまたは共有する前に、最終的な内容が正しい JSON であることを確認してください。
:::

## テンプレート

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "name": "サンプルキャラクター",
    "nickname": "サンプル",
    "description": "このキャラクターがどのような存在かを短く説明します。",
    "personality": "好奇心が強く、温かく、少し遊び心があります。",
    "scenario": "このキャラクターはユーザーとはじめて出会います。",
    "first_mes": "こんにちは！お会いできてうれしいです。",
    "alternate_greetings": [],
    "group_only_greetings": [],
    "mes_example": "",
    "creator": "あなたの名前",
    "creator_notes": "",
    "character_version": "1.0.0",
    "system_prompt": "",
    "post_history_instructions": "",
    "tags": ["サンプル"],
    "extensions": {}
  }
}
```
