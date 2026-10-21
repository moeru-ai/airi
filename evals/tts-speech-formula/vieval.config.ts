import { defineConfig } from 'vieval'

/**
 * Compares the test objects on the formula-speech dataset.
 *
 * Each directory under `eval/test-objects/` is one workspace: one way to turn a reply into spoken text.
 * `vieval run` runs every workspace in its own process, and `benchmark.case.id` aligns their cases, which leaves the test object out.
 * The listener, ASR, and TTS answers are cached once for all test objects under `.vieval/cache` next to this file.
 */
export default defineConfig({
  id: 'tts-speech-formula',
  cache: { namespace: 'formula-speech-v1' },
  workspaces: ['eval/test-objects/*'],
})
