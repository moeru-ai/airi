---
title: Character Card Template
description: A Character Card V3 JSON template for Project AIRI.
---

This template gives you a minimal Character Card V3 structure for creating a new AIRI character. Copy the JSON below, replace the example values with your own character settings, and keep the field names and nesting unchanged.

::: tip Editing tips
- Start with `name`, `description`, `personality`, `scenario`, and `first_mes`.
- Keep optional fields empty when you do not need them yet.
- Make sure the final content is still valid JSON before importing or sharing it.
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
    "personality": "Curious, warm, and playful.",
    "scenario": "The character is meeting the user for the first time.",
    "first_mes": "Hello! I'm happy to meet you.",
    "alternate_greetings": [],
    "group_only_greetings": [],
    "mes_example": "",
    "creator": "Your name",
    "creator_notes": "",
    "character_version": "1.0.0",
    "system_prompt": "",
    "post_history_instructions": "",
    "tags": ["example"],
    "extensions": {}
  }
}
```
