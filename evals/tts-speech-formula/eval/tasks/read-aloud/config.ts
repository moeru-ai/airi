import type { MatrixDefinition } from 'vieval/config'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createGeminiTranscription } from '@proj-airi/evals-tts-speech-formula/gemini-transcription'
import { speechModelFrom, SpeechModels, speechProviderFrom, SpeechProviders, transcriptionModelFrom } from '@proj-airi/evals-tts-speech-formula/speech-models'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-native'
import { defineConfig, loadEnv } from 'vieval'
import { chatModelFrom, ChatModels, chatProviderFrom, ChatProviders } from 'vieval/plugins/chat-models'

/** Each language is one task file. During development, `EVAL_LANGUAGES=zh,en` limits a run to some of them. */
const languages = [
  'zh',
  'en',
  'ja',
  'ko',
]

/**
 * The listener answers three votes per case, so 4 cases send up to 12 requests at once.
 * `vieval run` runs each of the four test objects in its own process, and this pool is per process,
 * so the listener and ASR proxies get up to 48 requests at once. With 8, they answered 429 `model_cooldown`.
 */
const caseConcurrency = 4

/** The Apple Speech locale of each task language. Every one must be installed in the macOS speech settings. */
const appleSpeechLocales: Readonly<Record<string, string>> = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR' }

/**
 * Apple Speech on macOS. It is a native recognizer, not an endpoint, so it is a transcription executor.
 * Creating the provider loads nothing. The native addon loads on the first transcription.
 */
const appleSpeech = createAppleSpeechProvider()

/** The package root. Every test object reads `.env` and `.env.test` from here, so one file configures all of them. */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * The model plugins. They register every model below, whether the matrix selects it or not, as `ChatModels` does.
 *
 * Endpoints and keys come from `.env` and are optional at load time. Thus, a provider that the matrix does not select
 * needs no env. A selected model without its base URL fails when the task resolves it.
 */
const modelPlugins = [
  ChatProviders({
    providers: [chatProviderFrom({
      id: 'listener',
      inferenceExecutor: 'openai',
      optionalEnv: { baseURL: 'LISTENER_BASE_URL' },
      requiredEnv: { apiKey: 'LISTENER_API_KEY' },
    })],
  }),
  ChatModels({
    models: [chatModelFrom({
      model: 'gpt-6-luna',
      provider: 'listener',
    })],
  }),
  SpeechProviders({
    providers: [
      speechProviderFrom({
        id: 'official',
        inferenceExecutor: 'openai',
        optionalEnv: { apiKey: 'TTS_OFFICIAL_API_KEY', baseURL: 'TTS_OFFICIAL_BASE_URL' },
      }),
      speechProviderFrom({
        id: 'azure',
        inferenceExecutor: 'openai',
        optionalEnv: { apiKey: 'TTS_AZURE_API_KEY', baseURL: 'TTS_AZURE_BASE_URL' },
      }),
      speechProviderFrom({
        id: 'asr',
        inferenceExecutor: 'openai',
        optionalEnv: { apiKey: 'ASR_API_KEY', baseURL: 'ASR_BASE_URL' },
      }),
      speechProviderFrom({
        id: 'apple-speech',
        inferenceExecutor: {
          id: 'apple-speech',
          // One recognizer per locale. The `speech` transcriber is the model for long-form audio, not dictation.
          transcription: ({ language }) => appleSpeech.transcription({
            locale: appleSpeechLocales[language ?? 'en'] ?? 'en-US',
            transcriber: 'speech',
          }),
        },
      }),
      speechProviderFrom({
        id: 'gemini',
        // Gemini has no `/audio/transcriptions` endpoint, so the executor sends a `generateContent` request with the clip.
        inferenceExecutor: createGeminiTranscription(),
        optionalEnv: { apiKey: 'ASR_GEMINI_API_KEY', baseURL: 'ASR_GEMINI_BASE_URL' },
      }),
    ],
  }),
  SpeechModels({
    models: [
      // The official AIRI provider and its default voice.
      speechModelFrom({
        id: 'official',
        model: 'stepfun/stepaudio-2.5-tts',
        provider: 'official',
        // The AIRI speech API passes the language to StepFun. Without it, this Chinese voice read English digits in Chinese.
        sendsLanguage: true,
        voice: 'jilingshaonv',
        // NOTICE:
        // `jilingshaonv` still read short English digits in Chinese in 3 of 9 clips with `language: en`.
        // `lively-girl` read them in English in 18 of 18 clips. No voice read bare Japanese digits reliably, so Japanese keeps the default.
        // Source: the voice A/B check of 2026-10-19 (official API, Gemini transcripts).
        // Remove when `DEFAULT_TTS_VOICES` of the official API recommends an English voice for `en-US` and this suite reads it.
        voices: { en: 'lively-girl' },
      }),
      // Azure through unspeech.
      speechModelFrom({
        id: 'azure',
        model: 'microsoft/v1',
        provider: 'azure',
        voices: { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-AriaNeural', ja: 'ja-JP-NanamiNeural', ko: 'ko-KR-SunHiNeural' },
      }),
      transcriptionModelFrom({
        id: 'whisper-1',
        model: 'whisper-1',
        provider: 'asr',
      }),
      transcriptionModelFrom({
        id: 'apple-speech',
        model: 'apple-speech',
        provider: 'apple-speech',
      }),
      transcriptionModelFrom({
        id: 'gemini-3.8-flash',
        model: 'gemini-3.8-flash',
        provider: 'gemini',
      }),
    ],
  }),
]

/** Languages are tasks, not matrix values, so a development filter can drop some without changing what a task measures. */
function selectedLanguages(env: NodeJS.ProcessEnv): string[] {
  const selected = env.EVAL_LANGUAGES?.split(',').map(language => language.trim()).filter(Boolean)
  return selected?.length ? languages.filter(language => selected.includes(language)) : languages
}

/** A plugin that registers models: the chat or speech plugins of vieval. */
type ModelPlugin
  = | ReturnType<typeof ChatProviders>
    | ReturnType<typeof ChatModels>
    | ReturnType<typeof SpeechProviders>
    | ReturnType<typeof SpeechModels>

/** What a test object adds to the shared config, for example the model that it calls. */
export interface FormulaSpeechConfigOptions {
  /** Plugins that register the models of the test object. They run after the shared plugins. */
  plugins?: ModelPlugin[]
  /** Run-matrix axes of the test object, for example the model that the `llm` object rewrites with. */
  runMatrix?: MatrixDefinition
}

/**
 * Builds the workspace config of one test object.
 *
 * A test object is one way to turn a reply into spoken text. Its project runs the read-aloud tasks under its own `tasks/`
 * with the shared matrix, plus the axes of its own options.
 */
export function defineFormulaSpeechConfig(testObject: string, options: FormulaSpeechConfigOptions = {}) {
  const env = loadEnv('test', packageRoot, '')
  const selectedTts = env.EVAL_TTS?.split(',').map(id => id.trim()).filter(Boolean)
  const selectedAsr = env.EVAL_ASR?.split(',').map(id => id.trim()).filter(Boolean)

  const matrix = {
    /** `none` grades the spoken text without TTS: the best score that the text can reach through a provider. Every other value is a TTS model. `EVAL_TTS=none` skips TTS. */
    tts: selectedTts?.length ? selectedTts : ['none', 'official'],
    /**
     * Transcribes the clip of every TTS model. Unused when `tts` is only `none`. Add `whisper-1` or `gemini-3.8-flash` to compare.
     * `EVAL_ASR=gemini-3.8-flash` selects other ASR models for one run.
     */
    asr: selectedAsr?.length ? selectedAsr : ['apple-speech'],
    /** Writes down what it heard as LaTeX. */
    listener: ['gpt-6-luna'],
    /** Judges whether the spoken text says the meaning or spells markup. It uses the endpoint of the listener. */
    judge: ['gpt-6-luna'],
  }

  return defineConfig({
    env,
    plugins: [
      ...modelPlugins,
      ...(options.plugins ?? []),
    ],
    scheduler: { concurrency: { case: caseConcurrency } },
    projects: [
      {
        name: `formula-speech-${testObject}`,
        root: '.',
        include: selectedLanguages(env).map(language => `tasks/read-aloud/formula-speech/${language}.eval.ts`),
        runMatrix: {
          override: {
            tts: matrix.tts,
            ...options.runMatrix,
          },
        },
        evalMatrix: {
          override: {
            // The listener and the ASR model are part of the measurement, not of the test object.
            listener: matrix.listener,
            judge: matrix.judge,
            ...(matrix.tts.some(id => id !== 'none') ? { asr: matrix.asr } : {}),
          },
        },
      },
    ],
  })
}
