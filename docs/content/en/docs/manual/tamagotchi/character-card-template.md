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
    "name": "Example Character",
    "nickname": "Example",
    "description": "A short description of who this character is.",
    "personality": "Curious, warm, and a little playful.",
    "scenario": "This character is meeting the user for the first time.",
    "first_mes": "Hello! Nice to meet you.",
    "alternate_greetings": [],
    "group_only_greetings": [],
    "mes_example": "",
    "creator": "Your Name",
    "creator_notes": "",
    "character_version": "1.0.0",
    "system_prompt": "",
    "post_history_instructions": "",
    "tags": ["example"],
    "extensions": {}
  }
}
```
