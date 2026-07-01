# TTS Voice Pack Model Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local `Voice Pack` model option under the official TTS provider; when selected, the voice picker shows server-enabled Voice Packs instead of raw provider voices.

**Architecture:** Keep provider selection unchanged. Treat `Voice Pack` as a local UI-only model id in the Speech settings page, and resolve it to the selected pack snapshot only when binding and building speech requests. Existing real TTS model + raw voice behavior stays unchanged.

**Tech Stack:** Vue 3 Composition API, Pinia stores, Stage UI components, TypeScript, Vitest, UnoCSS.

## Global Constraints

- Do not create implementation commits.
- Do not add aliases to raw TTS voices.
- Do not filter raw provider catalogs through a new allowlist.
- Do not make Voice Pack the only official TTS path.
- Do not hardcode default male or female voices in the client.
- Do not change Voice Pack billing semantics.
- Do not change server-side `LLM_ROUTER_CONFIG` model aliases.
- Keep Voice Pack provider/model/voice ids hidden from the user-facing UI.

---

## File Structure

- Modify `packages/stage-pages/src/pages/settings/modules/speech.vue`
  - Owns the user-facing Speech settings flow.
  - Adds a local synthetic `Voice Pack` model option.
  - Projects enabled Voice Packs into voice-card options when the synthetic option is selected.
  - Removes the old separate Voice Pack section from the left column.
- Modify `packages/stage-ui/src/stores/modules/speech.ts`
  - Exports the synthetic `VOICE_PACK_MODEL_ID`.
  - Prevents the official raw-voice loader from requesting `/audio/voices?model=voice-pack`.
  - Keeps the synthetic model selected when the official provider validates model state.
- Modify `packages/stage-ui/src/stores/modules/speech.test.ts`
  - Adds regression coverage for existing Voice Pack request resolution.
  - Confirms pack metadata stays attached to speech requests.

### Task 1: Integrate Voice Pack Into Model And Voice Selection

**Files:**
- Modify: `packages/stage-pages/src/pages/settings/modules/speech.vue`
- Modify: `packages/stage-ui/src/stores/modules/speech.ts`

**Interfaces:**
- Consumes: `useVoicePacksStore().packs`, `useAiriCardStore().bindVoicePackToActiveCard(pack)`, `activeSpeechModel`, `activeSpeechVoiceId`, `availableVoices`.
- Produces: exported `VOICE_PACK_MODEL_ID`, local `displayedProviderModels`, `isVoicePackModelSelected`, and `displayedVoiceOptions` values used by the template.

- [ ] **Step 1: Add the synthetic model id and display helpers**

Add to `packages/stage-ui/src/stores/modules/speech.ts` near the Voice Pack parameter constants:

```ts
export const VOICE_PACK_MODEL_ID = 'voice-pack'
```

Import it in `packages/stage-pages/src/pages/settings/modules/speech.vue`.

Add near the other page-level constants:

```ts
const VOICE_PACK_MODEL_OPTION = {
  id: VOICE_PACK_MODEL_ID,
  name: 'Voice Pack',
  description: 'Server-curated voices',
}
```

Add computed helpers:

```ts
const isOfficialSpeechProvider = computed(() => activeSpeechProvider.value === OFFICIAL_SPEECH_PROVIDER_ID)
const isVoicePackModelSelected = computed(() => isOfficialSpeechProvider.value && activeSpeechModel.value === VOICE_PACK_MODEL_ID)
const displayedProviderModels = computed(() => {
  if (!isOfficialSpeechProvider.value)
    return providerModels.value
  return [VOICE_PACK_MODEL_OPTION, ...providerModels.value]
})
```

- [ ] **Step 2: Replace the old separate Voice Pack section**

Delete the `<template v-if="shouldShowVoicePackSection">...</template>` block. Keep `voicePacksStore.load()` on mount.

- [ ] **Step 3: Project Voice Packs into voice-card options**

Add helpers:

```ts
function voicePackVoiceId(packId: string) {
  return `voice-pack:${packId}`
}

function packIdFromVoicePackVoiceId(voiceId: string) {
  return voiceId.startsWith('voice-pack:') ? voiceId.slice('voice-pack:'.length) : null
}

const selectedVoicePack = computed(() => {
  const packId = packIdFromVoicePackVoiceId(activeSpeechVoiceId.value)
  if (packId)
    return voicePacks.value.find(pack => pack.id === packId) ?? null
  const snapshot = activeCard.value?.extensions.airi.modules.speech.voicePack
  return snapshot ? voicePacks.value.find(pack => pack.id === snapshot.packId) ?? null : null
})

const displayedVoiceOptions = computed(() => {
  if (isVoicePackModelSelected.value) {
    return voicePacks.value.map(pack => ({
      id: voicePackVoiceId(pack.id),
      name: pack.name,
      description: pack.description ?? undefined,
      previewURL: '',
      customizable: false,
    }))
  }

  return (availableVoices.value[activeSpeechProvider.value] ?? [])
    .filter((voice) => {
      if (!activeSpeechModel.value)
        return true
      return !voice.compatibleModels || voice.compatibleModels.includes(activeSpeechModel.value)
    })
    .map(voice => ({
      id: voice.id,
      name: voice.name,
      description: voice.description,
      previewURL: voice.previewURL,
      customizable: false,
    }))
})
```

- [ ] **Step 4: Handle Voice Pack voice selection**

Update `selectSpeechVoice` so selecting a projected Voice Pack binds the server pack and tracks the underlying pack:

```ts
async function selectSpeechVoice(voiceId: string | undefined) {
  if (!voiceId)
    return

  const packId = packIdFromVoicePackVoiceId(voiceId)
  if (isVoicePackModelSelected.value && packId) {
    const pack = voicePacks.value.find(item => item.id === packId)
    if (!pack)
      return
    await bindVoicePack(pack)
    activeSpeechVoiceId.value = voiceId
    activeSpeechVoice.value = {
      id: voiceId,
      name: pack.name,
      description: pack.description ?? pack.name,
      previewURL: '',
      languages: [{ code: 'en', title: 'English' }],
      provider: activeSpeechProvider.value,
      gender: 'neutral',
    }
    return
  }

  trackVoiceSelected({
    tts_provider_id: activeSpeechProvider.value || 'unknown',
    tts_model_id: currentTtsModelId(),
    ...voiceAnalyticsPayload(voiceId),
    source: 'settings',
  })
}
```

- [ ] **Step 5: Keep model switching from sending `voice-pack` to `/audio/voices`**

Update the active model watcher:

```ts
watch(activeSpeechModel, async (model) => {
  if (!activeSpeechProvider.value)
    return

  activeSpeechVoiceId.value = ''
  activeSpeechVoice.value = undefined

  if (model === VOICE_PACK_MODEL_ID)
    return

  await speechStore.loadVoicesForProvider(activeSpeechProvider.value, model || undefined)
})
```

- [ ] **Step 6: Use displayed model and voice lists in the template**

Change `providerModels` usages in the model picker to `displayedProviderModels`.

Change the voice picker condition to:

```vue
v-else-if="activeSpeechProvider !== 'openai-compatible-audio-speech' && displayedVoiceOptions.length > 0"
```

Change the voice picker `:voices` binding to:

```vue
:voices="displayedVoiceOptions"
```

Change the manual voice input condition so it does not show for the Voice Pack model:

```vue
v-if="!isVoicePackModelSelected && (activeSpeechProvider === 'openai-compatible-audio-speech' || !availableVoices[activeSpeechProvider] || availableVoices[activeSpeechProvider].length === 0)"
```

- [ ] **Step 7: Verify the page compiles**

Run:

```bash
pnpm -F @proj-airi/stage-pages typecheck
```

Expected: PASS, or unrelated pre-existing package errors documented with exact output.

### Task 2: Preserve Voice Pack Speech Request Semantics

**Files:**
- Modify: `packages/stage-pages/src/pages/settings/modules/speech.vue`
- Modify: `packages/stage-ui/src/stores/modules/speech.test.ts`

**Interfaces:**
- Consumes: `bindVoicePackToActiveCard`, `voicePackForSpeechProvider`, `resolveVoicePackSpeechInput`.
- Produces: regression proof that the UI display change does not break server validation metadata.

- [ ] **Step 1: Keep preview generation resolving snapshots**

Ensure `generateTestSpeech()` keeps this behavior:

```ts
const voicePack = boundVoicePack.value
if (voicePack) {
  model = voicePack.ttsModelId
  if (!voice || voice.id !== voicePack.voiceId)
    voice = createVoicePackVoice(voicePack)
}
```

- [ ] **Step 2: Keep request metadata test coverage**

Confirm or add a test in `packages/stage-ui/src/stores/modules/speech.test.ts`:

```ts
it('passes Voice Pack snapshot billing metadata through adapter options', () => {
  const speechStore = useSpeechStore()
  const result = speechStore.resolveVoicePackSpeechInput({
    text: 'hello',
    voice: {
      id: 'voice-a',
      name: 'Voice A',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    },
    voicePack: {
      packId: 'vp-1',
      costMultiplier: 1.5,
    },
  })

  expect(result.providerConfig.extraBody).toEqual({
    voice_pack: {
      pack_id: 'vp-1',
      cost_multiplier: 1.5,
    },
  })
})
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pnpm exec vitest run packages/stage-ui/src/stores/modules/speech.test.ts
```

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Check: `packages/stage-pages/src/pages/settings/modules/speech.vue`
- Check: `packages/stage-ui/src/stores/modules/speech.test.ts`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified implementation ready for user review.

- [ ] **Step 1: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS, or unrelated pre-existing errors documented with exact output.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm type-check
```

Expected: PASS, or unrelated pre-existing errors documented with exact output.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff -- packages/stage-pages/src/pages/settings/modules/speech.vue packages/stage-ui/src/stores/modules/speech.test.ts
```

Expected: diff only contains the Voice Pack model-option integration and related tests.
