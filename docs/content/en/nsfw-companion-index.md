# AIRI + Hermes NSFW Companion Index

This is the file and feature index for the current AIRI + Hermes companion stack.

## Repos

### AIRI

Root: `/home/faramix/airi`

Role:

- product UI
- route split
- account and character data
- chat session state
- Hermes request building
- NSFW gating surface

### Hermes Agent

Root: `/home/faramix/hermes-agent`

Role:

- runtime routing
- memory selection
- context assembly
- reply assembly
- HTTP bridge for AIRI

## AIRI File Index

### Contracts

- `packages/server-schema/src/hermes-contract.ts`
  - shared request and response schema for AIRI to Hermes
- `packages/server-schema/src/index.ts`
  - schema exports
- `packages/server-sdk-shared/src/index.ts`
  - shared invoke contract name `hermes:generate-reply`

### Chat and Hermes Transport

- `packages/stage-ui/src/libs/hermes.ts`
  - converts AIRI session data into Hermes request payloads
- `packages/stage-ui/src/libs/hermes-transport.ts`
  - HTTP transport helper and local stub fallback
- `packages/stage-ui/src/libs/server.ts`
  - `HERMES_URL`
  - `USE_HERMES_CHAT`
- `packages/stage-ui/src/stores/chat.ts`
  - builds Hermes payloads from active sessions
  - resolves `normal` vs `nsfw` Hermes routes from character and user gating
  - sends chat turns through Hermes when enabled
  - applies Hermes memory updates
- `packages/stage-ui/src/stores/chat/hermes-memory-store.ts`
  - per-session local persistence for summaries and facts
  - stores route, scene type, judge score, and judge flags

### Auth and User Gating

- `apps/server/src/schemas/accounts.ts`
  - adds:
    - `adultVerified`
    - `allowSensitiveContent`
    - `contentTier`
- `apps/server/drizzle/0009_nsfw_user_gating.sql`
  - migration for user gating fields
- `apps/server/src/routes/users/schema.ts`
  - user profile request validation
- `apps/server/src/routes/users/index.ts`
  - `GET /api/v1/users/me`
  - `PATCH /api/v1/users/me`
- `packages/stage-ui/src/stores/auth.ts`
  - profile fetch and update
  - computed access flags
- `packages/stage-ui/src/libs/auth.ts`
  - loads user profile after auth session
- `packages/stage-pages/src/pages/settings/account.vue`
  - UI for user-level gating flags

### Character Data and NSFW Metadata

- `apps/server/src/schemas/characters.ts`
  - adds:
    - `visibility`
    - `nsfwEnabled`
    - `nsfwLevel`
    - `relationshipMode`
    - `personaProfile`
- `apps/server/src/routes/characters/schema.ts`
  - validates new character metadata
- `apps/server/drizzle/0008_lazy_wallflower.sql`
  - character metadata migration
- `packages/stage-ui/src/types/character.ts`
  - frontend types for new character fields
- `packages/stage-ui/src/stores/characters.ts`
  - store support for metadata and activation

### Consumer and NSFW Surface

- `packages/stage-pages/src/pages/v2/index.vue`
  - upgraded explore page
- `packages/stage-pages/src/pages/v2/[id].vue`
  - character detail page
- `packages/stage-pages/src/pages/nsfw/index.vue`
  - separate NSFW surface
  - guarded by user access flags
  - includes character-level NSFW editor
- `packages/stage-pages/src/pages/nsfw/[id].vue`
  - separate NSFW detail page
- `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue`
  - general creator dialog without direct NSFW clutter
- `apps/stage-web/src/pages/settings/characters/components/CharacterItem.vue`
  - richer card metadata

## Hermes Agent File Index

### Types and Runtime

- `agent/airi_types.py`
  - shared dataclasses matching the AIRI contract
- `agent/airi_runtime.py`
  - orchestrates scene routing, memory selection, context assembly, reply building, and memory updates

### Runtime Services

- `agent/airi_scene_router.py`
  - detects:
    - `general`
    - `romance`
    - `roleplay`
    - `support`
    - `nsfw`
  - computes:
    - intensity
    - softening
    - NSFW blocking
    - matched signals
- `agent/airi_memory_service.py`
  - selects session facts
  - extracts user preferences from recent turns
  - creates memory updates after each reply
- `agent/airi_context_assembler.py`
  - combines route policy, persona notes, memory notes, recent dialogue, and latest input
  - keeps NSFW prompts grounded in boundaries and continuity
- `agent/airi_reply_service.py`
  - builds persona-aware deterministic replies
  - references scenario, speaking style, starter messages, boundaries, memory, and assembled context
  - returns judge flags for thin or mirrored responses

### HTTP Bridge

- `agent/airi_http_service.py`
  - `GET /health`
  - `POST /v1/airi/generate-reply`

## Current State

### Implemented

- shared AIRI to Hermes contract
- separate normal and NSFW surface
- user-level NSFW gating
- character-level NSFW metadata and editor
- Hermes HTTP bridge
- Hermes scene routing
- Hermes memory selection
- Hermes context assembly
- Hermes deterministic reply assembly
- Hermes memory delta return path into AIRI
- AIRI-side route resolution for normal vs NSFW Hermes turns

### Still Open

- server-side long-term memory
- quality judge beyond simple heuristic flags
- image prompt generation
- gallery and generate routes
- premium gating for NSFW media actions
- actual model wiring to `Hermes-4.3-36B`, `Grok 4.20`, and `GPT-5 mini`
- build, typecheck, and tests once dependencies are installed

## Canonical Docs

- `docs/content/en/nsfw-companion-stack.md`
  - stack decisions and model strategy
- `docs/content/en/nsfw-companion-todo.md`
  - implementation checklist
- `docs/content/en/nsfw-memory-schema.md`
  - memory ownership split for Hermes, ClawMem, and AIRI
- `docs/content/en/nsfw-companion-index.md`
  - this file index
