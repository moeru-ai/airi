---
title: 角色卡模板
description: Project AIRI 的 Character Card V3 JSON 模板。
---

这个模板提供了一份最小可用的 Character Card V3 结构，可以作为创建 AIRI 角色卡时的起点。你可以复制下面的 JSON，把示例内容替换成自己的角色设定，并保持字段名和层级结构不变。

::: tip 编辑提示
- 可以先填写 `name`、`description`、`personality`、`scenario` 和 `first_mes`。
- 暂时用不到的可选字段可以先留空。
- 导入或分享之前，请确认最终内容仍然是合法的 JSON。
:::

## 模板

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
