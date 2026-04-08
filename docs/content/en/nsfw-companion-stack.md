# AIRI + Hermes NSFW Companion Stack

This document defines the recommended production stack for running AIRI as the consumer app and Hermes Agent as the runtime/orchestration layer for both normal and NSFW companion flows.

## Goals

- Keep the normal AIRI product surface clean.
- Keep NSFW routes and policy separate.
- Use a strong self-hosted reply model for companion quality.
- Use stronger API models only where they create clear leverage.
- Avoid a single-model architecture.

## Repo Ownership

### AIRI

`/home/faramix/airi`

Owns:

- web and app UI
- explore pages
- character profile pages
- chat UI
- billing and credits UX
- gallery UX
- image generation UX
- user and character records
- chat records
- subscriptions and entitlements
- normal routes
- NSFW routes under `/nsfw`

### Hermes Agent

`/home/faramix/hermes-agent`

Owns:

- routing and orchestration
- tool execution
- memory summarization
- retrieval planning
- cross-channel messaging
- creator copilot
- support and moderation ops
- scheduled jobs
- image prompt planning
- quality judging

## Route Split

### Normal

Use AIRI routes like:

- `/v2`
- `/v2/:id`
- `/chat/:id`

Characteristics:

- general companion discovery
- non-explicit profiles
- safer routing policy
- no explicit media surface

### NSFW

Use AIRI routes like:

- `/nsfw`
- `/nsfw/:id`
- future `/nsfw/gallery`
- future `/nsfw/generate`

Characteristics:

- explicit character discovery
- explicit persona metadata
- separate routing and escalation logic
- separate image/gallery policy
- separate analytics and feature gating

## Model Matrix

### Recommended Production Setup

- `main reply model`: `NousResearch/Hermes-4.3-36B`
- `router / planner / evaluator`: `Grok 4.20`
- `memory summarizer / fact extractor`: `GPT-5 mini`
- `creator/admin copilot`: `GPT-5.4` or `Claude Sonnet 4`
- `image prompt writer`: `GPT-5.4` or `Grok 4.20`

### Why

#### Hermes-4.3-36B

Use for final character replies.

Why:

- open and self-hostable
- explicitly strong at roleplay and conversational output
- structured output support
- lower refusal profile than closed safety-heavy models
- easier to steer with character-specific prompts

Official sources:

- https://huggingface.co/NousResearch/Hermes-4.3-36B
- https://huggingface.co/NousResearch/Hermes-4.3-36B-GGUF

#### Grok 4.20

Use for routing, scene classification, judging, and planning.

Why:

- strong reasoning/tool use
- large context
- good fit for classification and orchestration
- not the best default choice for every romantic or NSFW final reply

Official sources:

- https://docs.x.ai/docs/introduction
- https://docs.x.ai/developers/models?cluster=us-east-1
- https://docs.x.ai/docs/guides/reasoning

#### GPT-5 mini

Use for:

- memory summaries
- fact extraction
- compact rewrites
- cheap background jobs

Official source:

- https://developers.openai.com/api/docs/models

#### GPT-5.4 or Claude Sonnet 4

Use for:

- creator workflows
- rewriting persona cards
- prompt cleanup
- admin copilot workflows
- evaluation and repair jobs

Official sources:

- https://developers.openai.com/api/docs/models
- https://docs.anthropic.com/en/docs/about-claude/models/all-models

## What Not To Do

- Do not use Grok alone for every reply turn.
- Do not use Claude as the main uncensored companion reply model.
- Do not mix normal and NSFW routes in one generic explore page.
- Do not keep all memory in the browser only.
- Do not build the system around one huge system prompt.

## Serving Layer

### Preferred

- `vLLM` for production OpenAI-compatible serving
- `SGLang` as a strong alternative

Why:

- OpenAI-compatible APIs
- tool calling support
- structured outputs
- prefix caching
- better throughput than ad hoc local scripts

Official sources:

- https://docs.vllm.ai/en/latest/features/tool_calling/
- https://docs.vllm.ai/en/stable/design/prefix_caching/
- https://docs.sglang.ai/index.html
- https://docs.sglang.ai/backend/function_calling.html

### Example Topology

- `AIRI app server`
- `Hermes Agent service`
- `vLLM` or `SGLang` serving `Hermes-4.3-36B`
- `OpenAI API` for `GPT-5 mini` and optional `GPT-5.4`
- `xAI API` for `Grok 4.20`
- `Postgres + pgvector`
- `Redis` for jobs/queues
- object storage for gallery/media

## Runtime Services In Hermes

Implement these service boundaries inside Hermes Agent:

- `scene_router`
- `memory_service`
- `context_assembler`
- `reply_service`
- `quality_judge`
- `image_prompt_service`
- `creator_copilot`
- `ops_service`

### scene_router

Inputs:

- current user message
- route type
- character metadata
- recent turns

Outputs:

- scene type
- intent
- emotional intensity
- whether NSFW policy applies
- required memory slices
- whether to call tools

### memory_service

Owns three layers:

- recent turns
- session summaries
- long-term facts

Long-term facts should include:

- preferences
- names
- callbacks
- relationship milestones
- boundaries
- content permissions

### context_assembler

Build the final inference input from:

- system core
- route policy
- character persona
- relationship state
- scene state
- selected memory
- latest user message

### reply_service

Uses `Hermes-4.3-36B` to produce the final in-character reply.

### quality_judge

Uses `Grok 4.20` to score:

- repetition
- persona drift
- scene drift
- incoherence
- escalation mistakes

### image_prompt_service

Uses `GPT-5.4` or `Grok 4.20` to turn user image requests into:

- safe job parameters
- character-aware prompts
- pose/style tags
- gallery metadata

## AIRI To Hermes Contract

### Request

```json
{
  "request_id": "uuid",
  "route": "normal",
  "user": {
    "id": "user_123",
    "adult_verified": false,
    "allow_sensitive_content": false,
    "subscription_tier": "free"
  },
  "character": {
    "id": "char_123",
    "visibility": "public",
    "relationship_mode": "companion",
    "nsfw_enabled": false,
    "nsfw_level": "none",
    "persona_profile": {
      "personality": "warm and direct",
      "scenario": "long-term digital companion",
      "speaking_style": "gentle",
      "starter_messages": [],
      "boundaries": []
    }
  },
  "conversation": {
    "id": "chat_123",
    "recent_messages": [
      {
        "role": "user",
        "content": "hey"
      }
    ]
  },
  "message": {
    "role": "user",
    "content": "hey"
  }
}
```

### Response

```json
{
  "request_id": "uuid",
  "route": "normal",
  "reply": {
    "role": "assistant",
    "content": "Hi. I am here."
  },
  "runtime": {
    "reply_model": "Hermes-4.3-36B",
    "router_model": "grok-4.20",
    "memory_model": "gpt-5-mini"
  },
  "memory_updates": {
    "summary_append": "The user greeted the character.",
    "facts_add": [],
    "facts_remove": []
  },
  "judge": {
    "score": 0.91,
    "flags": []
  }
}
```

## NSFW Policy Split

NSFW requests should be rejected before reply generation when:

- user is not entitled
- user is not age-gated
- character is not flagged as NSFW
- requested mode exceeds the character's configured level

Suggested user-level flags:

- `adult_verified`
- `allow_sensitive_content`
- `content_tier`

Suggested character-level flags:

- `nsfw_enabled`
- `nsfw_level`
- `relationship_mode`
- `persona_profile.boundaries`

## Memory Design

### Short-Term

- last 20 to 40 turns
- kept in chat storage

### Session Summary

- one rolling summary per conversation
- updated every few turns or after scene changes

### Long-Term Facts

Store small durable facts, not entire scenes.

Examples:

- user likes late-night chats
- user prefers direct flirting
- anniversary callback happened
- user dislikes jealousy dynamics

## Inference Flow

1. AIRI sends a message event to Hermes.
2. Hermes `scene_router` classifies intent and route.
3. Hermes `memory_service` selects relevant memory.
4. Hermes `context_assembler` builds the prompt package.
5. Hermes `reply_service` calls `Hermes-4.3-36B`.
6. Hermes `quality_judge` optionally scores the result.
7. Hermes returns reply plus memory deltas to AIRI.
8. AIRI stores the message and any memory updates.

## Deployment Options

### Best Quality

- `Hermes-4.3-36B` on dedicated GPU serving
- `Grok 4.20` for router/judge
- `GPT-5 mini` for memory jobs
- `GPT-5.4` for creator tooling

### Lower Cost

- `Hermes-4.3-36B` local/self-hosted
- rules-based router for simple paths
- `GPT-5 mini` only for memory
- `Grok 4.20` only for premium judging or difficult cases

### Closed-Model Heavy

Possible, but not recommended for the uncensored core. It will usually produce higher refusal rates and weaker controllability for this product category.

## Implementation Phases

### Phase 1

- finish AIRI normal vs NSFW route split
- add user and character gating fields
- define Hermes request/response schema

### Phase 2

- deploy `Hermes-4.3-36B`
- add `scene_router`
- add `memory_service`
- wire AIRI chat requests into Hermes

### Phase 3

- add `quality_judge`
- add gallery/image prompt service
- add NSFW-specific generation flow

### Phase 4

- add creator copilot
- add messaging gateways
- add scheduled ops/reporting

## Current Recommendation

Use this stack unless a stronger self-hosted roleplay model clearly displaces Hermes 4.3:

- replies: `Hermes-4.3-36B`
- routing/judging: `Grok 4.20`
- memory summaries: `GPT-5 mini`
- creator tooling: `GPT-5.4`
- orchestration runtime: Hermes Agent
- consumer app: AIRI
