import type { Language, ReadAloud } from '@proj-airi/evals-tts-speech-formula'

import { cacheKey, generateTextWithTelemetry, languageName, renderVelinPrompt } from '@proj-airi/evals-tts-speech-formula'
import { modelFromRun, openaiFromRunContext } from 'vieval/plugins/chat-models'

export function rewritePrompt(language: Language): Promise<string> {
  return renderVelinPrompt(new URL('./rewrite.velin.md', import.meta.url), { language: languageName[language] })
}

/**
 * A model rewrites the reply for speech. It is the upper reference, but too slow for the live path.
 * The answer is cached by model, prompt, and input, so a rerun makes no new call.
 */
export const readAloud: ReadAloud = async (markdown, language, context) => {
  const { cache, signal } = context
  // The `rewrite` run axis selects the model. `vieval.config.ts` of this test object registers it.
  const rewrite = openaiFromRunContext(modelFromRun(context, { axis: 'rewrite' }))
  // An OpenAI-compatible provider without a base URL is OpenAI itself.
  const endpoint = { apiKey: rewrite.apiKey, baseURL: rewrite.baseURL || 'https://api.openai.com/v1/', model: rewrite.model }
  const system = await rewritePrompt(language)
  const file = cache.namespace('rewrite').file({ ext: 'json', key: [endpoint.model, cacheKey(system, markdown)] })
  if (await file.exists())
    return (await file.readJson<{ text: string }>()).text

  const { text } = await generateTextWithTelemetry(context, 'rewrite', {
    ...endpoint,
    abortSignal: signal,
    // WORKAROUND:
    // A rewrite model can write without end, and the case never finishes.
    // xsai sends no output limit unless the caller sets one, and a spoken reply needs far fewer tokens.
    // Source: the same failure of the listener model, see eval/evaluators/listener.
    // Remove when the rewrite model always stops on its own.
    maxCompletionTokens: 2000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: markdown }],
    temperature: 0,
  })
  const spoken = text?.trim() ?? ''
  await file.writeJson({ text: spoken })
  return spoken
}
