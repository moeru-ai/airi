import type { AudioTestTask } from '@proj-airi/vitest-plugin-fakemic'

import type { AudioInputPreflightContext, AudioInputSession, AudioInputTestCase } from './types'

import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom } from '@moeru/std'
import { createAudioTestAPI, createAudioTestTask, runAudioTestSession, startFakemicRuntime } from '@proj-airi/vitest-plugin-fakemic'
import { inject } from 'vitest'

import { expect, installAudioInputMatchers } from './expect-extend'

type RunnableAudioInputTest = AudioTestTask

installAudioInputMatchers()

const audioTestAPI = createAudioTestAPI<
  AudioInputTestCase,
  RunnableAudioInputTest,
  { audio: AudioInputSession },
  AudioInputPreflightContext
>({
  createPlans(name, testCase) {
    const task = createAudioTestTask(name, testCase)
    return [{
      definition: task,
      metadata: {
        input: fileURLToPath(task.input),
        runtime: inject('fakemicRuntime').name,
      },
      name: task.name,
    }]
  },
  async execute({ invokeHandler, plan, runPreflight, task }) {
    await runAudioTestSession({
      async execute(session) {
        await runPreflight({
          env,
          runtime: session,
          skip: (condition, note) => task.context.skip(Boolean(condition), note),
        })
        await session.runtimePage.reload({ waitUntil: 'domcontentloaded' })
        await session.runtimePage.locator('[i-solar\\:alt-arrow-up-line-duotone]').first().waitFor({ state: 'visible', timeout: 30_000 })
        await session.runtimePage.bringToFront()
        await session.runtimePage.waitForTimeout(750)
        Object.assign(task.context, { audio: session })
        await invokeHandler()
      },
      async recordArtifacts(session) {
        const snapshot = await session.snapshot().catch(error => ({
          snapshotError: errorMessageFrom(error) ?? 'Unknown snapshot error',
        }))
        await task.context.annotate('pipeline.json', {
          body: `${JSON.stringify(snapshot, null, 2)}\n`,
          bodyEncoding: 'utf-8',
          contentType: 'application/json',
        })
      },
      start() {
        const microphoneInput = fileURLToPath(plan.definition.input)
        return startFakemicRuntime<AudioInputSession>(microphoneInput)
      },
    })
  },
  preflight: definition => definition.preflight,
})

/** Groups AIRI audio-input tests in the Vitest task tree. */
export const describe = audioTestAPI.describe

/** Defines an AIRI audio-input test for each selected target. */
export const it = audioTestAPI.it

/** Vitest expect with AIRI audio-input matchers installed. */
export { expect }
