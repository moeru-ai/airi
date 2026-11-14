import { defineConfig } from 'vieval'

/**
 * Compares the test objects on the emoticon-speech dataset.
 *
 * Each directory under `eval/test-objects/` is one workspace: one way to turn a reply into the text that TTS reads.
 * `vieval run` runs every workspace in its own process, and `benchmark.case.id` aligns their cases.
 */
export default defineConfig({
  id: 'tts-speech-emoticon',
  workspaces: ['eval/test-objects/*'],
})
