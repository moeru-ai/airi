# NSFW Companion Todo

This is the implementation checklist for the AIRI + Hermes companion stack.

## Immediate

- [x] Split normal and NSFW surface routes in AIRI.
- [x] Add shared Hermes request/response contracts.
- [x] Add AIRI request builders for Hermes payloads.
- [x] Add a real transport bridge from AIRI to Hermes.
- [x] Add a Hermes `generate-reply` handler using the shared contract shape.
- [x] Add a Redis-backed NSFW image queue and worker entrypoint in the AIRI server.
- [x] Publish NSFW image jobs into the queue from `POST /api/v1/nsfw/jobs`.
- [x] Add a ComfyUI submit/reconcile consumer path that treats AIRI as the source of truth.
- [x] Add a default ComfyUI API workflow builder for NSFW image jobs.
- [x] Tune the default ComfyUI workflow against the exact locally installed Pony checkpoint and LoRA stack.
- [ ] Persist ComfyUI execution metadata more explicitly than the current `params.comfy` blob if recovery needs become more complex.

## AIRI

### Product Surface

- [x] Finish `/nsfw` as a real management surface, not only discovery.
- [ ] Add NSFW profile actions and access states.
- [x] Add `/nsfw/gallery`.
- [x] Add `/nsfw/generate`.
- [ ] Add premium gating for NSFW actions.

### Chat

- [x] Route `normal` and `nsfw` chat turns separately.
- [x] Send Hermes request payloads from the active session.
- [x] Persist Hermes memory deltas after each turn.
- [ ] Add judge feedback handling for low-quality replies.

### User and Character Data

- [x] Add user-level flags:
  - `adultVerified`
  - `allowSensitiveContent`
  - `contentTier`
- [x] Add account settings UI and API route for user-level gating.
- [x] Add UI for character-level NSFW controls.
- [ ] Add stronger persona editing for:
  - `personality`
  - `scenario`
  - `speakingStyle`
  - `boundaries`
  - `starterMessages`
  - `memoryProfile`

## Hermes Agent

- [x] Add `scene_router`.
- [x] Add `memory_service`.
- [x] Add `context_assembler`.
- [x] Add `reply_service`.
- [ ] Add `quality_judge`.
- [x] Add `image_prompt_service`.
- [ ] Add creator/admin copilot flows for AIRI characters.

## Models

- [ ] Deploy `Hermes-4.3-36B` behind `vLLM` or `SGLang`.
- [ ] Configure `Grok 4.20` for routing and judging.
- [ ] Configure `GPT-5 mini` for memory summaries.
- [ ] Configure `GPT-5.4` or `Claude Sonnet 4` for creator/admin flows.

## Memory

- [ ] Keep recent turns server-side.
- [ ] Add rolling session summaries.
- [ ] Add long-term fact storage.
- [ ] Add selective retrieval by scene and relationship state.

## Media

- [x] Add image prompt generation.
- [x] Add image job queue.
- [x] Add gallery record storage.
- [ ] Separate normal and NSFW media policy.

## Verification

- [ ] Add schema tests for Hermes contracts.
- [ ] Add unit tests for Hermes request builders.
- [ ] Add route tests for normal vs NSFW splits.
- [ ] Run typecheck/build once dependencies are installed.
