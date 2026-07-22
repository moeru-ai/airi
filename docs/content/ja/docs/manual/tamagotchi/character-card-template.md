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

＃＃ テンプレート

```json
{
  "spec": "chara_card_v3",
  "spec_version": "3.0",
  "data": {
    "name": "示例角色",
    "nickname": "示例",
    "description": "关于这个角色是谁的简短描述。",
    "personality": "好奇、温暖，也有一点俏皮。",
    "scenario": "这个角色正在第一次见到用户。",
    "first_mes": "你好！很高兴见到你。",
    "alternate_greetings": [],
    "group_only_greetings": [],
    "mes_example": "",
    "creator": "你的名字",
    "creator_notes": "",
    "character_version": "1.0.0",
    "system_prompt": "",
    "post_history_instructions": "",
    "tags": ["示例"],
    "extensions": {}
  }
}
```
