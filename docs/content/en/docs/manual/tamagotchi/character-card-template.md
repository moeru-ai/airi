---
title: Character card template
description: Character Card V3 JSON template from Project AIRI.
---

This template provides a minimal usable Character Card V3 structure that can be used as a starting point when creating AIRI character cards. You can copy the JSON below, replace the example content with your own role settings, and keep the field names and hierarchy unchanged.

::: tip editing tip
- You can fill in `name`, `description`, `personality`, `scenario` and `first_mes` first.
- Optional fields that are not used temporarily can be left blank.
- Before importing or sharing, please confirm that the final content is still legal JSON.
:::

## Template

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
