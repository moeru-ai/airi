import { env } from 'node:process'

import { defineConfig } from 'vieval'

/** Each language is one task file. During development, `EVAL_LANGUAGES=zh,en` limits a run to some of them. */
const languages = [
  'zh',
  'en',
  'ja',
  'ko',
]

function selectedLanguages(): string[] {
  const selected = env.EVAL_LANGUAGES?.split(',').map(language => language.trim()).filter(Boolean)
  return selected?.length ? languages.filter(language => selected.includes(language)) : languages
}

/**
 * Builds the workspace config of one test object. A test object is one way to turn a reply into the text that TTS
 * reads. Its project runs the tasks under its own `tasks/`. The suite calls no model, so it has no matrix.
 */
export function defineEmoticonSpeechConfig(testObject: string) {
  return defineConfig({
    projects: [
      {
        name: `emoticon-speech-${testObject}`,
        root: '.',
        include: selectedLanguages().map(language => `tasks/speak/emoticon-speech/${language}.eval.ts`),
        // NOTICE:
        // vieval skips a discovered task when no model target is registered. This model is never called.
        // Source: the vieval getting started guide, "Automatic DSL execution currently requires a registered model target".
        // Remove when vieval runs a task without a model target.
        inferenceExecutors: [{ id: 'local' }],
        models: [{ aliases: [], id: 'local:deterministic', inferenceExecutor: 'local', inferenceExecutorId: 'local', model: 'deterministic' }],
      },
    ],
  })
}
