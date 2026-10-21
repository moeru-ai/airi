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

## Script the LLM reply

When a case tests the output side of the pipeline, the reply must not depend on a model. Use `startScriptedLlm` from `cases/shared/providers`. It starts an OpenAI-compatible chat completion endpoint on `127.0.0.1` and streams a fixed reply in small chunks. AIRI receives the reply as model output, so the chat shows it and the speech output reads it. The case needs no LLM key.

Set `rephrase: false` in `configureModuleHearing` when the case uses the scripted LLM. Otherwise the transcript rephrase also sends its request to the scripted LLM. Call `close()` at the end of the case.

## Test wake word detection

CI skips cases with `pipelines: ['kws']` before runtime startup because wake word preparation times out.
The root cause is not confirmed. Local runs keep these cases enabled.

Use `configureWakeWord` to add AIRI Cards with wake words. Each configuration adds one card with one wake word and its pronunciations. The callback also turns on the microphone and selects the `wake-word` Hearing input mode. The case does not need an ASR Provider.

Set `pipelines: ['kws']`. Then the Web runner downloads and verifies the pinned KWS model before the file microphone starts. The Web page gets the model from the workspace cache, not from the network. Electron uses its bundled model.

```ts
import { describe, expect, it } from '../../src'
import { configureOnboarding, configureWakeWord } from '../shared/configurations'
import { readSessionCharacterId } from '../shared/interactions'

describe('wake word detection', () => {
  it('begins a voice input for the character', {
    input: new URL('./input.test.wav', import.meta.url),
    pipelines: ['kws'],
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureWakeWord(() => [{
        targetCardId: 'testing-audio-wake-word',
        text: 'Light up',
        pronunciations: [['L', 'AY1', 'T', 'AH1', 'P']],
      }]),
    ],
  }, async ({ audio }) => {
    const input = await audio.waitForVoiceInput({ timeout: 90_000 })
    await expect(readSessionCharacterId(audio, input.sessionId)).resolves.toBe('testing-audio-wake-word')
  })
})
```

A wake does not change the active card. It begins a voice input in the chat session of the matched character. `waitForVoiceInput` reads that input from the voice host snapshot on the speech bus. `readSessionCharacterId` reads the session owner from the stored chat session index.

In the `wake-word` mode, speech alone does not begin an input. Thus the first voice input of the case comes from a wake.

Each pronunciation is a token sequence of the pinned zh/en Zipformer model. The vocabulary is in `packages/stage-ui/src/libs/voice/kws-vocabulary.json`. English tokens are CMU phonemes with stress digits, for example `AY1`. Mandarin tokens are pinyin initials and finals with tone marks, for example `zh ī m a k āi m én` for 芝麻开门. A neutral tone has no mark.

The wake word cases:

| Case | What it proves | Recording | Wake words (pronunciations) |
| --- | --- | --- | --- |
| `wake-word` | A wake begins the input in the owner's session, not the active card's session. | "Light up" 3 times, macOS Samantha voice, 35 s leading silence | "Light up": `L AY1 T AH1 P` |
| `wake-word-routing` | One detector holds the words of two characters. The input goes to the character whose word was said. | "Hello computer" 3 times, OpenAI `tts-1` `alloy` voice, 15 s leading silence | "Light up": `L AY1 T AH1 P`. "Hello computer": `HH AH0 L OW1 K AH0 M P Y UW1 T ER0` |
| `wake-word-second-pronunciation` | A pronunciation after the first one wakes the character, and a Mandarin token sequence matches Mandarin speech. | "芝麻开门" 3 times, OpenAI `tts-1` `alloy` voice, 15 s leading silence | "Open sesame": `OW1 P AH0 N S EH1 S AH0 M IY0`, then `zh ī m a k āi m én` |

All fixtures are 16 kHz mono 16-bit PCM WAV files. The leading silence gives the detector time to start before speech begins. A pause of 1 second follows each phrase.

### Generate the fixtures

`scripts/generate-wake-word-fixtures.ts` writes the `wake-word-routing` and `wake-word-second-pronunciation` fixtures. It sends each phrase to the OpenAI-compatible `/audio/speech` endpoint and asks for 24 kHz `pcm` audio. Then it converts the audio to 16 kHz, removes silence around each phrase, and adds the fixture pauses. It does not need `ffmpeg`.

The script reads the `TESTING_AUDIO_TTS_*` variables in the same way as the cases. Set them in `packages/testing-audio/.env.local` or `.env.test.local`. Then run:

```bash
pnpm -F @proj-airi/testing-audio exec tsx scripts/generate-wake-word-fixtures.ts
```

The speech changes a little on each request. After you generate the fixtures, run the cases on both hosts. If a phrase does not wake the character, change the phrase or its pronunciation. Do not change the assertions.

Run the cases on both hosts:

```bash
pnpm -F @proj-airi/testing-audio test:run cases/wake-word
```

For one host, build its app and select `--project audio-web` or `--project audio-electron`.

## Test voice end latency

`voice-end-latency` measures how fast a finished message reaches submission. It reads the IO spans of the input:

- The end judgement starts after the 1.2 s pause and is not cancelled while the provider keeps the same text.
- When the model judges the message complete, the input ends before the 4.2 s silence limit.
- The rewrite starts during the pause, before speech recognition ends, so submission reuses it.

The case needs streaming ASR, because the judge and the rewrite read text during the pause. It uses the
`TESTING_AUDIO_ASR_ALIYUN_NLS_*` and `TESTING_AUDIO_LLM_*` variables. Its fixture is the `single-utterance-pipeline`
recording with 8 s of trailing silence. On failure, the assertion message contains the measured timeline.

```bash
pnpm -F @proj-airi/stage-web build
pnpm -F @proj-airi/testing-audio exec vitest run --project audio-web cases/voice-end-latency
```

## Test formula speech

`formula-speech` checks that TeX formulas in an assistant reply reach the TTS Provider as words. The case tests the output side of the pipeline, so the reply must not depend on a model:

```text
scripted LLM reply -> marker parser -> speech filter -> markdown segmenter -> speech text -> TTS chunker -> TTS
```

`startScriptedLlm` in `cases/shared/providers` starts an OpenAI-compatible chat completion endpoint on `127.0.0.1`. It streams a fixed reply in small chunks, as a model does. AIRI receives the reply as the output of the consciousness Provider, so the chat shows it and the speech output reads it. The case needs no LLM key. It turns off the transcript rephrase, because the rephrase would also send its request to the scripted LLM.

The reply holds the Basel sum, `\ce{2H2 + O2 -> 2H2O}`, `\ce{N2 + 3H2 <=> 2NH3}`, `AB \perp CD`, and `l_1 \parallel l_2`, in Chinese and in English. The case asserts these rules:

- No TTS segment contains TeX delimiters, backslashes, braces, scripts, or command names such as `frac` and `perp`.
- The segments, without whitespace, contain each expected reading, for example `当n趋于无穷大时`, `氢气 和 氧气 反应生成 水`, `A B 垂直于 C D`, and `the limit as n approaches infinity`.
- The text after `<=>` reaches TTS. A `<` that is not a tag once removed the rest of the reply.
- Each segment has more than 100 ms of audio. The chat message still shows the formula.

The case uses the `single-utterance-pipeline` recording to start the turn, so it needs the `TESTING_AUDIO_ASR_*` and `TESTING_AUDIO_TTS_*` variables.

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/testing-audio exec vitest run --project audio-electron cases/formula-speech
```

The Electron app imports `@proj-airi/core-agent` and `@proj-airi/pipelines-audio` from their `dist` directories. After a change in these packages, build them before you build the app. The unit tests next to the locale packs of `packages/speech-transformer-math` and `packages/speech-transformer-chem` cover the readings in Chinese, English, Japanese, and Korean.

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
