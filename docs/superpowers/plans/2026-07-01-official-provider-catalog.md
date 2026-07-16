# Official Provider Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an official catalog layer that controls AIRI's official LLM aliases, TTS models, TTS voices, and ASR aliases for both public listing and gateway request authorization.

**Architecture:** Add database-backed catalog tables and a focused `official-catalog` domain service. Public routes and gateway operations read the same service so UI visibility and handwritten request authorization cannot drift. Admin UI writes catalog state; `LLM_ROUTER_CONFIG` remains the source for real provider/key routing.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Valibot, Vue 3 `<script setup>`, Pinia-light admin API module, Vitest, pnpm workspace filters.

## Global Constraints

- Do not create commits during implementation.
- Preserve existing dirty user changes.
- Use `@moeru/std` / existing error helpers for structured errors.
- Public listing and request execution must both enforce catalog `enabled` state.
- Existing router config and encrypted keys remain separate from catalog.
- Existing configured LLM/TTS/ASR models synced from runtime config default to enabled.
- TTS voices synced from providers default to disabled.
- Voice preview generation is out of scope for v1; store only provider/manual preview URLs.

---

### Task 1: Catalog Schema and Service

**Files:**
- Create: `apps/server/src/schemas/official-catalog.ts`
- Modify: `apps/server/src/schemas/index.ts`
- Create: `apps/server/src/services/domain/official-catalog/index.ts`
- Test: `apps/server/src/services/domain/official-catalog/index.test.ts`
- Create: `apps/server/drizzle/0016_official_provider_catalog.sql`

**Interfaces:**
- Produces: `createOfficialCatalogService(db, deps)` with methods:
  - `syncAliasesFromRouterConfig(input: { surface: 'llm' | 'asr', modelIds: string[] }): Promise<OfficialProviderAlias[]>`
  - `syncTtsModelsFromRouterConfig(input: { models: Record<string, { provider: string }> }): Promise<OfficialTtsModel[]>`
  - `syncTtsVoices(input: { routerModelId: string, voices: OfficialTtsVoiceSyncInput[] }): Promise<OfficialTtsVoice[]>`
  - `listEnabledTtsModels(): Promise<OfficialTtsModel[]>`
  - `listEnabledTtsVoices(routerModelId: string): Promise<OfficialTtsVoice[]>`
  - `resolveEnabledAlias(surface, aliasId): Promise<OfficialProviderAliasWithRoutes>`
  - `assertTtsModelEnabled(routerModelId): Promise<OfficialTtsModel>`
  - `assertTtsVoiceEnabled(routerModelId, providerVoiceId): Promise<OfficialTtsVoice>`

- [ ] Write service tests first for sync defaults, repeated sync preservation, enabled listing, alias lookup, and TTS voice gate errors.
- [ ] Add schema tables for aliases, alias routes, TTS models, and TTS voices.
- [ ] Implement service with explicit methods instead of leaking Drizzle query details into routes.
- [ ] Add manual migration SQL matching the schema.
- [ ] Run `pnpm exec vitest run apps/server/src/services/domain/official-catalog/index.test.ts`.

### Task 2: Public TTS Listing and Request Gate

**Files:**
- Modify: `apps/server/src/routes/openai/v1/types.ts`
- Modify: `apps/server/src/routes/openai/v1/operations/speech-catalog/index.ts`
- Modify: `apps/server/src/routes/openai/v1/operations/speech-generation/index.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/routes/openai/v1/route.test.ts`

**Interfaces:**
- Consumes: `OfficialCatalogService`
- Produces: public TTS model and voice lists filtered by enabled catalog rows.

- [ ] Add failing route tests: disabled model hidden, disabled voice hidden, disabled model rejected in speech generation, disabled voice rejected in speech generation.
- [ ] Inject `officialCatalogService` into `V1RouteDeps`.
- [ ] In `listSpeechModels`, sync runtime TTS models then return enabled catalog rows in display order.
- [ ] In `listVoices`, fetch provider voices for sync, sync them as disabled-by-default, then return only enabled catalog voices while preserving `recommended`.
- [ ] In `speechGeneration`, validate model and voice against catalog after resolving `auto`.
- [ ] Run focused server route tests.

### Task 3: LLM Alias Gate

**Files:**
- Modify: `apps/server/src/routes/openai/v1/operations/chat-completions/index.ts`
- Test: `apps/server/src/routes/openai/v1/route.test.ts`

**Interfaces:**
- Consumes: `officialCatalogService.resolveEnabledAlias('llm', aliasId)`
- Produces: chat requests use client-visible alias and route to enabled alias primary target.

- [ ] Add failing tests: `auto` alias disabled rejects; missing alias rejects; enabled `auto` resolves to a real router model.
- [ ] Keep v1 client-visible model as alias (`auto` by default).
- [ ] Resolve alias before billing telemetry uses the real router model, while product analytics may retain alias in metadata.
- [ ] Run focused route tests.

### Task 4: Admin API

**Files:**
- Create: `apps/server/src/routes/admin/official-catalog/index.ts`
- Create: `apps/server/src/routes/admin/official-catalog/route.test.ts`
- Modify: `apps/server/src/app.ts`

**Interfaces:**
- Consumes: `OfficialCatalogService`, `LlmRouterService`, `ConfigKVService`
- Produces:
  - `GET /api/admin/official-catalog/aliases`
  - `POST /api/admin/official-catalog/aliases/sync`
  - `PATCH /api/admin/official-catalog/aliases/:id`
  - `PATCH /api/admin/official-catalog/aliases/:id/routes`
  - `GET /api/admin/official-catalog/tts/models`
  - `POST /api/admin/official-catalog/tts/models/sync`
  - `PATCH /api/admin/official-catalog/tts/models/:id`
  - `GET /api/admin/official-catalog/tts/models/:id/voices`
  - `POST /api/admin/official-catalog/tts/models/:id/voices/sync`
  - `PATCH /api/admin/official-catalog/tts/voices/:id`

- [ ] Add auth/admin guard tests following existing voice-pack route tests.
- [ ] Implement Valibot schemas for patch bodies.
- [ ] Implement sync endpoints from runtime config and provider voice catalog.
- [ ] Mount route under `/api/admin/official-catalog`.
- [ ] Run admin route tests.

### Task 5: Admin API Client and Forms

**Files:**
- Modify: `apps/ui-admin/src/modules/api.ts`
- Create: `apps/ui-admin/src/pages/ProvidersPage.vue`
- Create: `apps/ui-admin/src/pages/TtsCatalogPage.vue`
- Modify: `apps/ui-admin/src/main.ts`
- Modify: `apps/ui-admin/src/App.vue`
- Test: `apps/ui-admin/src/pages/ProvidersPage.test.ts`
- Test: `apps/ui-admin/src/pages/TtsCatalogPage.test.ts`

**Interfaces:**
- Consumes: admin official catalog endpoints.
- Produces: operator can sync aliases/models/voices, toggle enabled state, edit names/order/preview URLs.

- [ ] Add TypeScript interfaces and admin API methods.
- [ ] Add Providers page for v1 `auto` alias and route pool visibility.
- [ ] Add TTS page for model list and selected model voices.
- [ ] Add sidebar nav entries: Providers and TTS; keep Voice Packs separate.
- [ ] Add focused Vue tests around sync and toggle calls.
- [ ] Run `pnpm exec vitest run apps/ui-admin/src/pages/ProvidersPage.test.ts apps/ui-admin/src/pages/TtsCatalogPage.test.ts`.

### Task 6: Voice Pack Candidate Filtering

**Files:**
- Modify: `apps/ui-admin/src/pages/VoicePackFormPage.vue`
- Test: `apps/ui-admin/src/pages/VoicePackFormPage.test.ts`

**Interfaces:**
- Consumes: enabled official TTS models and voices from public/admin catalog.
- Produces: Voice Pack admin cannot create new packs from disabled catalog rows.

- [ ] Add tests showing disabled voices are not offered as candidates.
- [ ] Update catalog loading to use filtered public endpoints or admin enabled list.
- [ ] Keep editing existing packs resilient if a historical voice was later disabled.
- [ ] Run focused Voice Pack tests.

### Task 7: Verification Sweep

**Files:**
- All touched files.

- [ ] Run server focused tests:
  `pnpm exec vitest run apps/server/src/services/domain/official-catalog/index.test.ts apps/server/src/routes/admin/official-catalog/route.test.ts apps/server/src/routes/openai/v1/route.test.ts`
- [ ] Run admin focused tests:
  `pnpm exec vitest run apps/ui-admin/src/pages/ProvidersPage.test.ts apps/ui-admin/src/pages/TtsCatalogPage.test.ts apps/ui-admin/src/pages/VoicePackFormPage.test.ts`
- [ ] Run typechecks:
  `pnpm -F @proj-airi/server typecheck`
  `pnpm -F @proj-airi/ui-admin typecheck`
- [ ] Run targeted eslint on changed files.
- [ ] Report any unrelated pre-existing failures separately.

## Self-Review

- Spec coverage: LLM alias, TTS catalog, ASR-compatible alias structure, admin pages, strict request gate, sync defaults, and v2 preview generation deferral are represented.
- Placeholder scan: no TBD/TODO implementation placeholders are required by this plan; task details use exact paths and behavior.
- Type consistency: service names and route dependencies are consistent across tasks.
