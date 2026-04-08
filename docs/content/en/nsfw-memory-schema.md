# NSFW Memory Schema

This document defines the intended memory split for the AIRI + Hermes + ClawMem stack.

## Hermes Memory

Use Hermes persistent memory for stack and operator knowledge only.

### MEMORY.md

Store:

- repo ownership
- runtime topology
- runbooks
- service boundaries
- known tool quirks
- stable engineering conventions

Do not store:

- relationship milestones
- sexual preferences
- per-character callbacks
- long chat history

### USER.md

Store:

- user communication preferences
- workflow constraints
- style and response preferences
- project priorities

Do not store:

- character lore
- session transcripts
- intimate companion state

## ClawMem

Use ClawMem for long-term companion memory keyed by user and character.

### Suggested JSON shape

```json
{
  "user_id": "user_123",
  "character_id": "char_456",
  "display_name": "Alex",
  "preferred_tone": "gentle and playful",
  "liked_topics": ["late night chats", "travel", "teasing banter"],
  "disliked_topics": ["public embarrassment"],
  "hard_boundaries": ["violence", "humiliation"],
  "soft_boundaries": ["jealousy"],
  "relationship_stage": "romance",
  "relationship_milestones": [
    "first date roleplay established",
    "shared recurring coffee shop scenario"
  ],
  "important_callbacks": [
    "calls the user moonbeam",
    "remembers the red dress request"
  ],
  "intimate_preferences": [
    "slow pacing",
    "compliment-heavy tone"
  ],
  "scene_continuity_notes": [
    "current scene set in penthouse bedroom",
    "character is calm and affectionate"
  ],
  "last_emotional_state": "warm and attached",
  "memory_confidence": 0.86,
  "updated_at": "2026-03-30T18:00:00Z"
}
```

## AIRI Database

Use AIRI for structured product and entitlement data.

Store:

- `adultVerified`
- `allowSensitiveContent`
- `contentTier`
- `visibility`
- `nsfwEnabled`
- `nsfwLevel`
- `relationshipMode`
- `personaProfile`
- gallery records
- image jobs
- credits
- subscriptions

## Rule of Thumb

- Hermes memory: system knowledge
- ClawMem: relationship knowledge
- AIRI database: product data
