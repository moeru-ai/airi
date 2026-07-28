---
title: キャラクターカードテンプレート
description: Project AIRI の Character Card V3 JSON テンプレート。
---

このテンプレートは、AIRI キャラクター カードを作成する際の開始点として使用できる、最小限の使用可能な Character Card V3 構造を提供します。以下の JSON をコピーし、サンプルコンテンツを独自のロール設定に置き換えて、フィールド名と階層を変更しないでください。

::: tip 編集のヒント
- `name`、`description`、`personality`、`scenario`、`first_mes`を最初に入力することもできます。
- 一時的に使用しないオプションフィールドは空白のままにすることができます。
- インポートまたは共有する前に、最終的なコンテンツがまだ正当な JSON であることを確認してください。
:::

## テンプレート

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "name": "サンプルキャラクター",
    "nickname": "サンプル",
    "description": "このキャラクターについての短い説明。",
    "personality": "好奇心が強く、温かく、少しお茶目。",
    "scenario": "このキャラクターはユーザーと初めて出会ったところです。",
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
