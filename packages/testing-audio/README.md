# Testing audio

This package runs recorded microphone tests through the real AIRI audio pipeline.

```text
input.wav -> virtual microphone -> VAD -> ASR -> LLM -> TTS -> playback -> UI
```

The package exports audio-aware `describe`, `it`, and `expect` APIs. Vitest owns the task tree and result protocol. Each project starts its configured Playwright runtime.

`src` only owns test scheduling, runtime startup, browser probes, and matchers. Case-specific environment, storage, Provider, route, and UI operations live under `cases/shared`:

```text
cases/shared/
  configurations/  # preflight callbacks that configure one concern
  interactions/    # reusable UI operations selected by a case
```

## Configure a case

The optional `preflight` field is an ordered callback array. The fake-microphone Vitest integration starts the runtime before it invokes these callbacks. Each callback receives:

- `env`: the process environment for this case
- `runtime`: the clean Playwright runtime
- `skip`: Vitest's case-level skip control

Every case explicitly selects the configuration it needs. Do not create one shared “complete pipeline” preflight that hides the Provider combination.

```ts
import { describe, expect, it } from '../../src'
import { configureModuleHearing, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { enableChatMicrophone } from '../shared/interactions'
import { openaiAsr } from '../shared/providers'

describe('audio input pipeline', () => {
  it('transcribes a greeting', {
    input: new URL('./input.test.wav', import.meta.url),
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureModuleHearing(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_ASR_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_ASR_API_KEY to run this ASR case.')
        if (!apiKey)
          return undefined

        return {
          provider: openaiAsr({
            apiKey,
            baseUrl: environment.TESTING_AUDIO_ASR_API_BASE_URL ?? 'https://api.openai.com/v1/',
            model: environment.TESTING_AUDIO_ASR_MODEL ?? 'whisper-1',
            provider: environment.TESTING_AUDIO_ASR_PROVIDER ?? 'openai-compatible-audio-transcription',
          }),
          captureFormat: 'wav',
        }
      }),
    ],
  }, async ({ audio }) => {
    await enableChatMicrophone(audio)
    await expect(audio).toHaveTranscriptions([
      ['Please say hello.'],
    ])
  })
})
```

A case can independently choose its VAD behavior, ASR, LLM, and TTS configuration. A configuration callback can read its own environment, write local storage, use another persistence mechanism, or deliberately leave onboarding incomplete.

## Provider environment

Each case selects its environment variables. `loadCaseEnvironment` uses Vite test mode to read repository, `packages/stage-ui`, and package environment files. Process variables have the highest priority.

Put local test credentials in `packages/testing-audio/.env.test.local`. Git ignores this file.

The OpenAI-compatible Provider helpers do not read the environment. Pass the endpoint, API key, model, and voice from the case callback.

The included cases use these explicit variables:

```dotenv
TESTING_AUDIO_ASR_PROVIDER=openai-compatible-audio-transcription
TESTING_AUDIO_ASR_MODEL=whisper-1
TESTING_AUDIO_ASR_API_BASE_URL=https://api.openai.com/v1/
TESTING_AUDIO_ASR_API_KEY=...

TESTING_AUDIO_ASR_ALIYUN_NLS_PROVIDER=aliyun-nls-transcription
TESTING_AUDIO_ASR_ALIYUN_NLS_ALIYUN_AK_ID=...
TESTING_AUDIO_ASR_ALIYUN_NLS_ALIYUN_AK_SECRET=...
TESTING_AUDIO_ASR_ALIYUN_NLS_APPKEY=...

TESTING_AUDIO_LLM_PROVIDER=openai-compatible
TESTING_AUDIO_LLM_MODEL=gpt-4o-mini
TESTING_AUDIO_LLM_API_BASE_URL=https://api.openai.com/v1/
TESTING_AUDIO_LLM_API_KEY=...

TESTING_AUDIO_TTS_PROVIDER=openai-compatible-audio-speech
TESTING_AUDIO_TTS_MODEL=tts-1
TESTING_AUDIO_TTS_VOICE=alloy
TESTING_AUDIO_TTS_API_BASE_URL=https://api.openai.com/v1/
TESTING_AUDIO_TTS_API_KEY=...
```

These tests send audio and text to external Providers. Each run can incur Provider charges.

## Run the tests

Build both targets and run all runtime projects:

```bash
pnpm -F @proj-airi/testing-audio test:run
```

Use existing builds:

```bash
pnpm -F @proj-airi/testing-audio test:existing-builds
```

Run one runtime project:

```bash
pnpm -F @proj-airi/testing-audio exec vitest run --project audio-web
pnpm -F @proj-airi/testing-audio exec vitest run --project audio-electron
```

Use `*.audio.web.test.ts` for Web-only cases. Use `*.audio.electron.test.ts` for Electron-only cases. The `*.audio.test.ts` pattern runs in both projects.

Do not use Vitest Browser Mode for these cases. Each task needs a case-specific Chromium fake-microphone process argument.
