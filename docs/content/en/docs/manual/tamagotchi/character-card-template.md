---
title: Character Card Template
description: Character Card V3 card.json template for an AIRI Card package
---

This is a minimal Character Card V3 template for the `card.json` file inside an AIRI Card package. Replace the example content with your own character details while keeping the field names and hierarchy unchanged.

::: warning The JSON file cannot be imported by itself
The current AIRI Card upload control accepts a `.zip` package containing both `manifest.json` and `card.json` at its root. Saving only the JSON shown below and uploading it directly will fail.
:::

::: tip Editing tips
- You can fill in `name`, `description`, `personality`, `scenario` and `first_mes` first.
- Leave unused optional fields blank.
- Before packaging or sharing, confirm that the final content is valid JSON.
:::

## Package structure

```text
my-airi-card.zip
├── manifest.json
└── card.json
```

Use this minimal `manifest.json`:

```json
{
  "format": "airi-character-card",
  "version": 1,
  "card": {
    "path": "card.json",
    "spec": "chara_card_v3"
  }
}
```

An AIRI-exported package may also contain a supported display model under `models/` and describe it in `manifest.json`. The two-file structure above is sufficient for a card without a bundled display model.

## `card.json` template

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
