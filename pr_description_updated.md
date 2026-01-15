## Description

Fixes issues with OpenAI and OpenAI Compatible transcription and speech providers, including model selection, UI consistency, voice loading, and proper synchronization between provider settings and module pages.

## Changes

### Core Functionality Fixes

#### OpenAI Speech Provider
- **Fixed voice loading**: Updated `listVoices` function signature to accept config parameter, matching the type definition and ensuring voices load correctly
- **Added model selection**: Added dropdown for TTS model selection (TTS-1, TTS-1-HD, GPT-4o Mini TTS, etc.)
- **Fixed shadowing bug**: Fixed `handleGenerateSpeech` function to use reactive `model` computed property instead of shadowing it with a local variable
- **Voice compatibility**: Updated voice compatibility based on OpenAI API documentation:
  - `tts-1` and `tts-1-hd` support 9 voices: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer
  - `gpt-4o-mini-tts` supports all 13 voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar
- **Voice filtering by model**: Added filtering logic to `availableVoices` computed property to only show voices compatible with the selected model (filters based on `compatibleModels` array)
- **Model change handler**: Added watch on model changes to reload voices, ensuring voice list stays in sync with selected model
- **Provider limitation note**: Added documentation noting that OpenAI does not provide an API endpoint to retrieve voices - voices are hardcoded in provider metadata (provider limitation, not application limitation)

#### OpenAI Compatible Speech Provider
- **Model input**: Changed model field from dropdown to manual text input (`FieldInput`) to match voice field behavior
- **Voice persistence**: Added watch functions to ensure model and voice values are persisted to provider config (localStorage)
- **Provider config initialization**: Added `onMounted` hook to initialize provider config with default values if not present

#### OpenAI Compatible Transcription Provider
- **Model validation**: Added `isValidTranscriptionModel` function to validate models and default to `whisper-1` if invalid (prevents using chat models that cause 404 errors)
- **Disabled model listing**: Overrode `listModels` capability to return empty array, forcing manual model input (prevents chat models from being selected)
- **Base URL visibility**: Added logic to expand Advanced section when base URL validation errors occur
- **Layout alignment**: Updated layout to match OpenAI transcription page (side-by-side: settings left, playground right)

#### Speech Module Page
- **OpenAI Compatible model field**: Changed to manual text input (not dropdown) for OpenAI Compatible provider
- **OpenAI Compatible voice field**: Always shows manual text input (not voice cards) for OpenAI Compatible provider
- **Provider config sync**: Updated watch function to always sync model and voice from provider config when selecting OpenAI Compatible (overrides any existing values from previous provider selections)
- **Default values**: Ensures model defaults to `tts-1` and voice defaults to `alloy` if not set in provider config

#### Hearing Module Page
- **OpenAI Compatible model sync**: Added logic to sync model from provider config when OpenAI Compatible transcription provider is selected
- **Unified Model section**: Consolidated duplicate Model sections into a single adaptive section that changes based on provider type
- **Dynamic description**: Model section description adapts based on provider:
  - "Select a model from the provider" for providers with model listing
  - "Enter the transcription model to use (e.g., 'whisper-1', 'gpt-4o-transcribe')" for manual entry providers
- **Conditional input type**: Shows `RadioCardManySelect` for providers with models, `FieldInput` for manual entry providers
- **Provider config sync**: Model from provider settings is automatically imported and displayed in the hearing module when OpenAI Compatible is selected
- **Default values**: Ensures model defaults to `whisper-1` if not set in provider config

#### Transcription Playground
- **Error display**: Added `ErrorContainer` component to display transcription errors prominently
- **Error clearing**: Clear error messages when transcription succeeds (errors were persisting after successful tests)
- **Audio replacement**: Clear previous recordings when starting a new monitoring session (replaces audio bars instead of accumulating them)

#### Permission Handling
- **Removed redundant permission requests**: Removed `askPermission()` calls from hearing module and Web Speech API transcription pages, as permissions are assumed to be granted during onboarding

#### Audio Playback Fix
- **Fixed audio playback not working**: Wrapped `postCaption()` and `postPresent()` calls in try-catch blocks to prevent `InvalidStateError` (BroadcastChannel closed) from breaking playback
- **Root cause**: When the BroadcastChannel was closed (e.g., after navigating away), errors in the `onStart` handler were preventing the playback manager from properly starting items, leaving them stuck in the `active` map and blocking subsequent items
- **Solution**: Errors from BroadcastChannel operations are now caught and ignored, allowing playback to continue even when the channel is unavailable

### UI/UX Improvements

- **Layout consistency**: OpenAI Compatible speech and transcription pages now match OpenAI provider layouts (side-by-side)
- **Model input consistency**: OpenAI Compatible providers use manual text inputs for models (matching voice inputs) instead of dropdowns
- **Provider-to-module sync**: Model and voice values configured in provider settings automatically populate in the speech module when the provider is selected

## Testing Instructions

### Test OpenAI Speech Provider

1. Navigate to Settings → Providers → Speech → OpenAI
2. Verify voices appear in the dropdown (should show Alloy, Ash, Ballad, Coral, Echo, Fable, Onyx, Nova, Sage, Shimmer, Verse, Marin, Cedar)
3. Verify model dropdown shows TTS models (TTS-1, TTS-1-HD, GPT-4o Mini TTS, etc.)
4. **Test voice compatibility filtering:**
   - Select `tts-1` or `tts-1-hd` model
   - Verify only 9 voices are available: Alloy, Ash, Coral, Echo, Fable, Onyx, Nova, Sage, Shimmer
   - Select `gpt-4o-mini-tts` model
   - Verify all 13 voices are available: Alloy, Ash, Ballad, Coral, Echo, Fable, Onyx, Nova, Sage, Shimmer, Verse, Marin, Cedar
5. Test speech generation with different models and voices

### Test OpenAI Compatible Speech Provider

1. Navigate to Settings → Providers → Speech → OpenAI Compatible
2. **Verify model is text input** (not dropdown) - should be a `FieldInput` component
3. Enter API key, base URL, model (e.g., `tts-1`), and voice (e.g., `alloy`)
4. Verify values are saved to localStorage (check DevTools → Application → Local Storage → `settings/credentials/providers`)
5. Verify layout matches OpenAI provider (side-by-side: settings left, playground right)

### Test Speech Module with OpenAI Compatible

1. Configure OpenAI Compatible provider with model `tts-1` and voice `alloy` in provider settings
2. Navigate to Settings → Modules → Speech
3. Select "OpenAI Compatible" as the provider
4. **Verify model field shows `tts-1`** (from provider config, not `eleven_multilingual_v2`)
5. **Verify voice field shows `alloy`** (from provider config)
6. Both fields should be manual text inputs (not dropdowns)

### Test Hearing Module with OpenAI Compatible

1. Configure OpenAI Compatible transcription provider with model `gpt-4o-transcribe` (or `whisper-1`) in provider settings
2. Navigate to Settings → Modules → Hearing
3. Select "OpenAI Compatible" as the transcription provider
4. **Verify only one "Model" section appears** (no duplicate headers)
5. **Verify description shows "Enter the transcription model to use"** (not "Select a model from the provider")
6. **Verify model field shows `gpt-4o-transcribe`** (from provider config, not empty)
7. **Verify manual input field is displayed** (not "No models available" warning, and no duplicate label)
8. Model should be synced from provider config automatically
9. **Test with other providers:**
   - Switch to OpenAI provider (if configured)
   - Verify description changes to "Select a model from the provider"
   - Verify `RadioCardManySelect` component is displayed (not manual input)

### Test OpenAI Compatible Transcription Provider

1. Navigate to Settings → Providers → Transcription → OpenAI Compatible
2. Enter API key and base URL
3. **Verify model field is text input** (not dropdown) - should allow manual entry
4. Enter model `whisper-1` (or another valid transcription model)
5. Verify invalid models (like chat models) are rejected and default to `whisper-1`
6. Test transcription in playground
7. Verify layout is side-by-side (settings left, playground right)
8. **Test error message clearing:**
   - Enter an invalid model (e.g., `gpt-4o-transcribe` if not available)
   - Start monitoring, speak, then stop monitoring
   - Verify error message appears
   - Fix the model (e.g., change to `whisper-1`)
   - Start monitoring again, speak, then stop monitoring
   - Verify error message clears and transcription succeeds
9. **Test audio bar replacement:**
   - Start monitoring, speak, then stop monitoring (creates first audio bar)
   - Start monitoring again, speak, then stop monitoring
   - Verify only one audio bar is shown (previous one is replaced, not accumulated)
10. Verify error messages display if transcription fails

### Test Provider Config Persistence

1. Configure OpenAI Compatible speech provider with model `tts-1` and voice `alloy`
2. Open browser DevTools → Application → Local Storage
3. Check `settings/credentials/providers` key
4. Verify `openai-compatible-audio-speech` object contains:
   - `apiKey`
   - `baseUrl`
   - `model: "tts-1"`
   - `voice: "alloy"`
   - `speed: 1.0`
5. Navigate to speech module and select OpenAI Compatible
6. Verify model and voice fields are populated from provider config

### Test Audio Playback

1. Configure OpenAI for consciousness and OpenAI Compatible for hearing and speech
2. Send a message to AIRI
3. **Verify audio playback works**: AIRI should speak the response text
4. **Verify no console errors**: Check browser console for any BroadcastChannel errors (they should be caught and not break playback)
5. Test multiple consecutive messages to ensure playback continues working

### Edge Cases

- Test switching from ElevenLabs to OpenAI Compatible (should override `eleven_multilingual_v2` with provider config value)
- Test with empty provider config (should default to `tts-1` and `alloy`)
- Test with invalid model in provider config (should be validated and corrected)
- Test error display in transcription playground when API calls fail
- Test audio playback after navigating away and back (BroadcastChannel may be closed, but playback should still work)

Fixes #927
