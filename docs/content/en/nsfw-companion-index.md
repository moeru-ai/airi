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
  - shared invoke contract names `hermes:generate-reply` and `hermes:generate-image-prompt`

### Chat and Hermes Transport

- `packages/stage-ui/src/libs/hermes.ts`
  - converts AIRI session data into Hermes request payloads
  - builds NSFW image prompt requests
- `packages/stage-ui/src/libs/hermes-transport.ts`
  - HTTP transport helper and local stub fallback
  - includes NSFW image prompt transport
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
- `packages/stage-ui/src/stores/nsfw-media.ts`
  - calls `/api/v1/nsfw/jobs` and `/api/v1/nsfw/gallery`
  - stores server-backed NSFW image job and gallery records

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
- `packages/stage-pages/src/pages/nsfw/generate.vue`
  - plans NSFW image prompts through Hermes and writes server-backed jobs/gallery items
  - accepts an optional real ComfyUI API workflow JSON payload for actual execution
- `packages/stage-pages/src/pages/nsfw/gallery.vue`
  - displays server-backed NSFW gallery records
- `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue`
  - general creator dialog without direct NSFW clutter
- `apps/stage-web/src/pages/settings/characters/components/CharacterItem.vue`
  - richer card metadata

### Server-backed NSFW Media

- `apps/server/src/schemas/nsfw-media.ts`
  - `image_jobs`
  - `gallery_items`
- `apps/server/src/services/nsfw-media.ts`
  - create/list image jobs
  - create/list gallery items
  - update image jobs and gallery items during execution lifecycle
- `apps/server/src/routes/nsfw-media/schema.ts`
  - request validation for NSFW jobs and gallery items
- `apps/server/src/routes/nsfw-media/index.ts`
- `apps/server/src/services/nsfw-image-events.ts`
  - Redis Stream envelope for durable NSFW image execution requests
- `apps/server/src/services/nsfw-image-consumer-handler.ts`
  - ComfyUI submission and `/history/{prompt_id}` reconciliation logic
  - discards invalid stale custom workflow overrides and falls back to the server-built default workflow
  - treats ComfyUI `history.status=error` as `failed` instead of `done`
  - only sets `resultMediaId` and gallery `mediaId` when actual image output exists
  - now records explicit `executionStatus`, `errorType`, `errorNodeType`, `historySeenAt`, and `outputMediaId` metadata under `params.comfy`
  - can automatically requeue known GPU kernel failures to `COMFYUI_FALLBACK_BASE_URL` when configured
- `apps/server/src/services/nsfw-image-workflow.ts`
  - builds a default API-format ComfyUI workflow from prompt, negative prompt, aspect ratio, and checkpoint config
  - currently targets the locally present `ponyDiffusionV6.safetensors` checkpoint by default
  - applies the locally present `pony_realism.safetensors` and skin-texture LoRA chain by default
- `apps/server/src/bin/run-nsfw-image-consumer.ts`
  - standalone worker entrypoint for NSFW image execution
- `apps/server/docker-compose.yml`
  - now includes `nsfw-image-consumer` alongside `api` and `billing-consumer`
- `GET/POST /api/v1/nsfw/jobs`
- `GET/POST /api/v1/nsfw/gallery`
- `apps/server/drizzle/0010_nsfw_media.sql`
  - migration for server-backed NSFW media records

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
- `agent/airi_image_prompt_service.py`
  - plans NSFW image prompts, negative prompts, and tags
  - enforces user and character gating for image planning

### HTTP Bridge

- `agent/airi_http_service.py`
  - `GET /health`
  - `POST /v1/airi/generate-reply`
- `POST /v1/airi/generate-image-prompt`
- AIRI server now also owns a Redis-backed `nsfw-image-consumer` path for durable ComfyUI execution.

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
- Hermes-backed NSFW image prompt planning
- server-backed NSFW image job and gallery records
- Redis-backed NSFW image execution queue
- fallback from stale custom ComfyUI workflow overrides to the server default workflow
- validated Windows GPU ComfyUI host on port `8189` using `torch 2.10.0+cu130`
- validated `sm_120` arch support in the active Windows ComfyUI venv
- hardened ComfyUI history reconciliation so errored executions no longer get marked as successful image jobs
- validated live: a ComfyUI GPU `execution_error` now lands as `image_jobs.status=failed` with the upstream error text, while `resultMediaId` and gallery `mediaId` stay empty
- ComfyUI submit/reconcile worker path
- default API-format ComfyUI workflow generation for NSFW jobs
- validated Docker CPU fallback against the local Linux ComfyUI model set
- validated end-to-end fallback reconciliation using `sd_turbo.safetensors` on `http://localhost:8189`

### Live Runtime Status

- Local ComfyUI now starts and serves `http://127.0.0.1:8188`
- Local Postgres and Redis now run through `apps/server/docker-compose.yml`
- `nsfw-image-consumer` now connects to local Postgres and Redis and applies migrations successfully
- The Docker CPU fallback now mounts the local Linux ComfyUI models instead of the incompatible Windows fallback set
- The Docker CPU fallback now runs with `--cpu --disable-all-custom-nodes`
- A real CPU fallback smoke render completed with:
  - `sd_turbo.safetensors`
  - `2` steps
  - `384x384`
  - no LoRA chain
- Current end-to-end fallback runtime path is proven through:
  - AIRI job record
  - Redis event
  - worker pickup
  - ComfyUI prompt submission on `http://localhost:8189`
  - ComfyUI `history.status=success`
  - `image_jobs.status=done`
  - `image_jobs.result_media_id`
  - `gallery_items.media_id`
- The validated output filename from the fallback path is `airi-nsfw-runtime-character-soft_00001_.png`
- The default workflow now supports env-level smoke-test tuning through:
  - `COMFYUI_DEFAULT_STEPS`
  - `COMFYUI_DEFAULT_CFG`
  - `COMFYUI_MAX_DIMENSION`
- The CPU fallback now also supports env-level tuning through:
  - `COMFYUI_FALLBACK_CHECKPOINT`
  - `COMFYUI_FALLBACK_STEPS`
  - `COMFYUI_FALLBACK_CFG`
  - `COMFYUI_FALLBACK_MAX_DIMENSION`
- Stuck ComfyUI jobs can now fail cleanly through:
  - `COMFYUI_SUBMIT_TIMEOUT_MS`
  - `COMFYUI_RUNNING_TIMEOUT_MS`

### Still Open

- server-side long-term memory
- quality judge beyond simple heuristic flags
- premium gating for NSFW media actions
- GPU-backed ComfyUI runtime validation
- faster non-CPU render validation on the Windows GPU path
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
