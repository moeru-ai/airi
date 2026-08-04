---
title: Character Card Template
description: The Character Card V3 JSON template for Project AIRI.
---


This template provides a minimal, usable Character Card V3 structure that can serve as a starting point for creating AIRI character cards. You can copy the JSON below, replace the example content with your own character settings, and keep the field names and hierarchy unchanged.


::: tip Editing Tips


- You can start by filling in `name`, `description`, `personality`, `scenario`, and `first_mes`.
- Optional fields you do not need yet can be left empty.
- Before importing or sharing, confirm the final content is still valid JSON.


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

