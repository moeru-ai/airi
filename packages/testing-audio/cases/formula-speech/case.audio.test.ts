import type { ScriptedLlm } from '../shared/providers'

import { afterAll } from 'vitest'

import { describe, expect, it } from '../../src'
import { configureModuleConsciousness, configureModuleHearing, configureModuleSpeech, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { enableChatMicrophone } from '../shared/interactions'
import { openaiAsr, openaiTts, startScriptedLlm } from '../shared/providers'

// The assistant reply. A scripted LLM streams it, so AIRI handles it as model output and the case does not depend on a model.
// It holds the Basel sum, two chemical equations, and the perpendicular and parallel relations, in Chinese and in English.
// The text after `<=>` checks that speech filtering keeps the rest of the reply after a `<` that is not a tag.
const reply = String.raw`巴塞尔问题的结论是 $\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}$。氢气燃烧是 $\ce{2H2 + O2 -> 2H2O}$，合成氨是可逆反应 $\ce{N2 + 3H2 <=> 2NH3}$，反应后仍有剩余。已知 $AB \perp CD$，且 $l_1 \parallel l_2$。

The Basel problem states that $\lim_{n \to \infty}\sum_{i=1}^{n}\frac{1}{i^2}=\frac{\pi^2}{6}$. Given $AB \perp CD$ and $l_1 \parallel l_2$, the angles are equal.`

// Each reading must reach TTS. The words come from @proj-airi/speech-transformer-math and @proj-airi/speech-transformer-chem.
// Chinese reads an equation by its substances without coefficients, as a textbook does, and English spells numbers.
const readings = [
  '当n趋于无穷大时 i从1到n对i的平方分之1求和的极限 等于 分子是派的平方 分母是6的分数',
  '氢气 和 氧气 反应生成 水',
  '氮气 和 氢气 可逆反应生成 氨气',
  '反应后仍有剩余',
  'A B 垂直于 C D',
  'l1 平行于 l2',
  'the limit as n approaches infinity of the sum from i equals one to n of the fraction with numerator one and denominator i squared equals pi squared over six',
  'A B is perpendicular to C D and l one is parallel to l two',
]

// TeX delimiters, commands, groups, and scripts must not reach TTS, because a voice reads them as symbols or letters.
const texSource = /[$\\{}^_]|\b(?:frac|lim|infty|perp|ce)\b/

let llm: ScriptedLlm | undefined
afterAll(async () => {
  await llm?.close()
})

describe('formula speech', () => {
  // The fixture of single-utterance-pipeline says "Please say hello." after 14 seconds of silence for VAD initialization.
  // The words of the request do not matter, because the scripted LLM always gives the same reply.
  it('sends formulas in an assistant reply to TTS as spoken words, not as TeX', {
    input: new URL('../single-utterance-pipeline/input.test.wav', import.meta.url),
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
          autoSend: true,
          // The rephrase would send the transcript to the scripted LLM and get the formula reply back as the user message.
          rephrase: false,
        }
      }),
      configureModuleConsciousness(async () => {
        llm = await startScriptedLlm({ reply })
        return { provider: llm.provider }
      }),
      configureModuleSpeech(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_TTS_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_TTS_API_KEY to run this TTS case.')
        if (!apiKey)
          return undefined

        return openaiTts({
          apiKey,
          baseUrl: environment.TESTING_AUDIO_TTS_API_BASE_URL ?? 'https://api.openai.com/v1/',
          model: environment.TESTING_AUDIO_TTS_MODEL ?? 'tts-1',
          provider: environment.TESTING_AUDIO_TTS_PROVIDER ?? 'openai-compatible-audio-speech',
          voice: environment.TESTING_AUDIO_TTS_VOICE ?? 'alloy',
        })
      }),
    ],
  }, async ({ audio }) => {
    await enableChatMicrophone(audio)

    const turn = await audio.waitForTurn({ timeout: 120_000 })
    expect(llm?.requests.length).toBeGreaterThan(0)
    expect(turn.llm.outputCharacters).toBeGreaterThan(0)

    // The chat shows the formula. Only the speech reads it as words.
    const assistant = turn.chat.messages.find(message => message.role === 'assistant')
    expect(assistant?.text).toContain('2H2')

    expect(turn.tts.audioSegments.length).toBeGreaterThan(0)
    for (const segment of turn.tts.audioSegments) {
      expect(segment.text, `TTS segment "${segment.text}"`).not.toMatch(texSource)
      expect(segment.durationMs, `TTS segment "${segment.text}"`).toBeGreaterThan(100)
    }

    // The chunker can split a reading between two segments and can trim spaces at the split, so the case compares the text without whitespace.
    const compact = (text: string) => text.replace(/\s+/g, '')
    const spoken = compact(turn.tts.audioSegments.map(segment => segment.text).join(''))
    for (const reading of readings)
      expect(spoken, `TTS text "${spoken}"`).toContain(compact(reading))
  })
})
