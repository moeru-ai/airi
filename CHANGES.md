# Bug Fixes & Enhancements — Progress Report

## Summary

14 confirmed bugs and incomplete features were identified and fixed across `apps/stage-web`, `packages/stage-ui`, `packages/stage-shared`, and `packages/stage-ui-live2d`. The work covered runtime crashes, silent data loss, broken UI interactions, and leftover debug logging.

## Completed Fixes

### 1. VAD buffer over-read in `processSpeechSegment`

**Files changed:**
- `apps/stage-web/src/workers/vad/vad.ts`
- `packages/stage-ui/src/workers/vad/vad.ts`
- `apps/stage-pocket/src/workers/vad/vad.ts` (same bug found here too)

**What was wrong:** `this.buffer.slice(0, bufferPointer + speechPadSamples)` could exceed `this.buffer.length` when the buffer was nearly full, silently zero-padding the tail of the emitted audio segment.

**Fix:** Introduced a `speechSegmentEnd` variable clamped to `Math.min(bufferPointer + speechPadSamples, this.buffer.length)`. Both the `finalBuffer` allocation and the `slice` call now use this clamped value.

**Tests added:** `packages/stage-ui/src/workers/vad/vad.test.ts` — two regression tests covering the near-full buffer case and the normal case.

---

### 2. `detectSpeech` crash when model is `undefined`

**Files changed:**
- `apps/stage-web/src/workers/vad/vad.ts`
- `packages/stage-ui/src/workers/vad/vad.ts`

**What was wrong:** `this.model?.()` returns `undefined` when the model hasn't initialized, and immediately destructuring `undefined` throws `TypeError: Cannot destructure property 'stateN' of undefined`.

**Fix:** Added an early guard at the top of `detectSpeech`:
```ts
if (!this.model) {
  throw new Error('VAD model is not initialized')
}
```

---

### 3. Characters page infinite spinner vs empty state

**File changed:** `apps/stage-web/src/pages/settings/characters/index.vue`

**What was wrong:** The template used `v-if="characters.size === 0"` to show a spinner, which couldn't distinguish between "loading" and "loaded but empty". An empty list showed the spinner forever.

**Fix:** Destructured `isLoading` from `storeToRefs(characterStore)` (already exposed by the store). Replaced the single condition with three distinct template branches:
- `v-if="isLoading"` → spinner
- `v-else-if="characters.size === 0"` → "No characters yet. Create one to get started."
- `v-else` → character grid

---

### 4. `filteredCharacters` crash on undefined description

**File changed:** `apps/stage-web/src/pages/settings/characters/index.vue`

**What was wrong:** `i18n?.description.toLowerCase()` — the optional chain stopped at `description` but `.toLowerCase()` was called unconditionally, throwing `TypeError` when `description` was `undefined`.

**Fix:** Changed to `i18n?.description?.toLowerCase()`.

---

### 5. Character "Activate" button was a stub

**Files changed:**
- `packages/stage-ui/src/stores/characters.ts`
- `apps/stage-web/src/pages/settings/characters/index.vue`

**What was wrong:** `handleActivate` only called `console.log('Activate', char.id)`. The `:is-active` prop was hardcoded to `false` so no card ever showed the active badge.

**Fix:**
- Added `activeCharacterId` (persisted via `useLocalStorage('airi:active-character-id', '')`) and `setActive(id)` to `createCharacterStoreController` and `useCharacterStore`.
- `handleActivate` now calls `characterStore.setActive(char.id)`.
- `:is-active` binding changed to `:is-active="activeCharacterId === char.id"`.

---

### 6. Character edit dialog silently discarded changes

**Files changed:**
- `packages/stage-ui/src/types/character.ts`
- `packages/stage-ui/src/stores/characters.ts`
- `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue`

**What was wrong:** The edit path in `CharacterDialog` only sent `{ characterId, version, coverUrl }`. All name, description, capability, and i18n changes were silently dropped. `UpdateCharacterSchema` only had those three fields.

**Fix:**
- Extended `UpdateCharacterSchema` to include optional `i18n` and `capabilities` arrays.
- Updated the `update` function in the store to apply `i18n` and `capabilities` optimistically to the local character.
- Replaced the large comment block in the edit path with a clean `characterStore.update(...)` call that sends all changed fields.

---

### 7. Hardcoded empty `apiKey` in CharacterDialog

**File changed:** `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue`

**What was wrong:** Both LLM and TTS capability blocks always sent `apiKey: ''` with a `// TODO: Handle secrets` comment. Capability blocks were always included even when the user hadn't configured them.

**Fix:**
- Added `llmApiKey` and `ttsApiKey` fields to the `form` reactive object, populated from existing character data on edit.
- Added password input fields for both API keys in the Capabilities tab.
- Capability blocks are now conditionally included: LLM only when `form.llmModel || form.llmApiKey`, TTS only when `form.ttsVoiceId || form.ttsApiKey`.

---

### 8. No user-visible error on CharacterDialog submit failure

**File changed:** `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue`

**What was wrong:** The `catch` block only called `console.error(err)`, leaving the user with no feedback when a save failed.

**Fix:** Added `import { toast } from 'vue-sonner'` and `import { errorMessageFrom } from '@moeru/std'`. The catch block now calls:
```ts
toast.error('Failed to save character', { description: errorMessageFrom(err) })
```

---

### 9. `getInputByteFrequencyData()` crash before `start()`

**File changed:** `packages/stage-shared/src/beat-sync/detector.ts`

**What was wrong:** `inputAnalyserBuffer` is `undefined` before `start()` is called. The function used a non-null assertion `!` unconditionally, causing a crash.

**Fix:** Added a guard that returns `new Uint8Array(0)` when `inputAnalyserBuffer` is undefined, removing both non-null assertions.

---

### 10. Web Speech API lifecycle `console.info` spam

**File changed:** `packages/stage-ui/src/stores/providers/web-speech-api/index.ts`

**What was wrong:** 8 debug-only lifecycle handlers (`onstart`, `onaudiostart`, `onsoundstart`, `onspeechstart`, `onspeechend`, `onsoundend`, `onaudioend`, `onnomatch`) each called `console.info`, producing 15+ log lines per recognition cycle in production.

**Fix:** Removed all 8 debug-only handlers and the preceding `// Add event listeners for debugging before starting` comment. Functional handlers (`onerror`, `onresult`, `onend`) were preserved.

---
### 11. Leftover `console.debug` in `tts.ts`

**File changed:** `packages/stage-ui/src/utils/tts.ts`

**What was wrong:** A `console.debug('while loop ends, chunk/buffer:', chunk, buffer)` line marked `// TODO: remove later` was never removed.

**Fix:** Removed the `// TODO: remove later` comment and the `console.debug` call from `chunkEmitter`.

---

### 12. Duplicate `WIP` export in `misc/index.ts`

**File:** `packages/stage-ui/src/components/misc/index.ts`

**Status:** Verified — the file already had exactly one `WIP` export. No change needed.

---

### 13. `haveStreamingCallbacksChanged` missed callback-removal case

**File changed:** `packages/stage-ui/src/stores/modules/hearing.ts`

**What was wrong:** The function required `next.onSentenceEnd !== undefined` before comparing, so removing a callback (setting it to `undefined` when it was previously defined) was not detected as a change, preventing session restart.

**Fix:** Simplified to direct reference equality:
```ts
return next.onSentenceEnd !== previous?.onSentenceEnd
  || next.onSpeechEnd !== previous?.onSpeechEnd
```

---

### 15. Secure API Key Storage

**Files changed:**
- `packages/stage-ui/src/composables/use-secure-storage.ts` (new)
- `packages/stage-ui/src/composables/use-secure-storage.test.ts` (new)
- `packages/stage-ui/src/stores/providers.ts`

**What was wrong:** API keys for providers were stored in `localStorage` in plain text, making them vulnerable to XSS attacks.

**Fix:** Introduced `useSecureStorage` which generates and persists an AES-GCM encryption key via `IndexedDB` and transparently encrypts data before persisting it to `localStorage`. `providerCredentials` was migrated to use this new composable. Implemented detection and migration logic for plaintext JSON configurations left behind by the older `useLocalStorage` to prevent API key loss on upgrade. Added full Vitest coverage in `use-secure-storage.test.ts` verifying normal operation and plaintext JSON migration.

---

### 16. Do Not Persist Character API Keys in Public Capabilities (Secure Character Credentials)

**Files changed:**
- `packages/stage-ui/src/types/character.ts`
- `apps/server/src/routes/characters/schema.ts`
- `packages/stage-ui/src/services/characters.ts`
- `packages/stage-ui/src/stores/characters.ts`

**What was wrong:** The `apiKey` field in `CharacterCapabilityConfigSchema` was required and persisted to the community remote database, leaking user API keys if characters were published. When modified to sanitize the server payload, character capability API keys were completely discarded, causing password inputs to be silently discarded after save/reload.

**Fix:** Made `apiKey` optional in both client and server schemas. Modified `createRemote` and `updateRemote` in `characters.ts` service to strip `apiKey` from all capability configurations before sending the payload. Added client-side secure persistence: `useCharacterStore` stores and retrieves character-specific API keys securely using `useSecureStorage` under `settings/credentials/characters`, preserving the keys locally on the device across saves and reloads while keeping server payloads sanitized.

---

### 17. Unnecessary `STORAGE_PREFIX` iteration

**File changed:** `packages/stage-layouts/src/stores/background.ts`

**What was wrong:** The background store iterated through the entire default `localforage` instance looking for `background-` prefixed keys, which was unmaintainable and added complexity.

**Fix:** Created a dedicated `localforage` instance named `backgrounds` for isolated storage, including an automatic migration path for legacy data.

---

### 18. Extraneous type casting in `background-picker.vue`

**File changed:** `packages/stage-ui/src/components/scenarios/dialogs/background-picker/background-picker.vue`

**What was wrong:** `emit` was being awkwardly cast to `any` `(emit as any)('import', payload)`.

**Fix:** Removed the cast and let TypeScript natively resolve the `defineEmits` typings.

---

## Remaining / In Progress

### 19. Replace `window.confirm()` delete dialog with in-app confirmation

**File:** `apps/stage-web/src/pages/settings/characters/index.vue`

**Status:** Not yet applied. The `handleDelete` function still uses `window.confirm()` (marked `// TODO: Remove this`). Needs an `AlertDialog` from `reka-ui` with confirm/cancel buttons consistent with the rest of the UI.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/stage-web/src/workers/vad/vad.ts` | Buffer clamp + model guard |
| `packages/stage-ui/src/workers/vad/vad.ts` | Buffer clamp + model guard |
| `apps/stage-pocket/src/workers/vad/vad.ts` | Buffer clamp |
| `packages/stage-ui/src/workers/vad/vad.test.ts` | New regression tests |
| `apps/stage-web/src/pages/settings/characters/index.vue` | isLoading, empty state, optional chaining, activate wiring |
| `packages/stage-ui/src/stores/characters.ts` | `activeCharacterId`, `setActive`, `useLocalStorage`, i18n/capabilities in update |
| `packages/stage-ui/src/types/character.ts` | Extended `UpdateCharacterSchema`, made `apiKey` optional |
| `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue` | Full edit path, API key fields, toast error feedback |
| `packages/stage-shared/src/beat-sync/detector.ts` | Safe `getInputByteFrequencyData` |
| `packages/stage-ui/src/stores/providers/web-speech-api/index.ts` | Removed debug lifecycle handlers |
| `packages/stage-ui/src/utils/tts.ts` | Removed leftover `console.debug` |
| `packages/stage-ui/src/stores/modules/hearing.ts` | Fixed `haveStreamingCallbacksChanged` |
| `packages/stage-ui/src/composables/use-secure-storage.ts` | New AES-GCM composable with plaintext migration |
| `packages/stage-ui/src/composables/use-secure-storage.test.ts` | Unit tests for AES-GCM and migration |
| `packages/stage-ui/src/stores/providers.ts` | Replaced `useLocalStorage` with `useSecureStorage` |
| `apps/server/src/routes/characters/schema.ts` | Made `apiKey` optional |
| `packages/stage-ui/src/services/characters.ts` | Payload sanitization |
| `packages/stage-ui/src/stores/characters.ts` | Local secure character API key storage & restoration |
| `packages/stage-layouts/src/stores/background.ts` | Refactored `localforage` |
| `packages/stage-ui/src/components/scenarios/dialogs/background-picker/background-picker.vue` | Fixed `emit` typing |
