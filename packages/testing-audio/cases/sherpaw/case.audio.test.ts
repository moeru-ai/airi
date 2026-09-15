import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { describe, expect, it } from '../../src'
import { configureModuleHearing, configureOnboarding } from '../shared/configurations'
import { enableHearingPlaygroundMicrophone, readHearingPlaygroundTranscriptions } from '../shared/interactions'

describe('Sherpaw bundled speech recognition', () => {
  for (const languageGroup of ['zh-en', 'multilingual']) {
    it(`transcribes two utterances with ${languageGroup}`, {
      input: new URL('../two-utterance-streaming/input.test.wav', import.meta.url),
      preflight: [
        configureOnboarding(() => ({ completed: true })),
        configureModuleHearing(() => ({
          provider: {
            id: 'sherpaw-transcription',
            definitionId: 'sherpaw-transcription',
            model: 'sherpaw',
            config: { languageGroup },
          },
        })),
        async ({ runtime, env }) => {
          // Serve the real VAD model before the fake microphone starts. A slow
          // remote download must not consume the finite recording during setup.
          const vadURL = 'https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx'
          const modelPath = env.TESTING_AUDIO_VAD_MODEL_PATH
          const model = modelPath
            ? await readFile(modelPath)
            : await (await runtime.page.request.get(vadURL, { timeout: 120_000 })).body()
          expect(createHash('sha256').update(model).digest('hex')).toBe('a4a068cd6cf1ea8355b84327595838ca748ec29a25bc91fc82e6c299ccdc5808')
          const runtimeFiles = ['mjs', 'wasm'].map((extension) => {
            const filename = `ort-wasm-simd-threaded.jsep.${extension}`
            return {
              url: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/${filename}`,
              fileURL: new URL(`../../../stage-ui/node_modules/@huggingface/transformers/dist/${filename}`, import.meta.url).href,
              contentType: extension === 'wasm' ? 'application/wasm' : 'text/javascript',
            }
          })
          if (runtime.electronApp) {
            // ROOT CAUSE:
            //
            // Playwright 1.62.1 enables CDP Fetch interception for every URL when a route exists.
            // Electron 43 can omit Network.requestWillBeSent for a local AudioWorklet request.
            // CRNetworkManager._onRequestPaused then waits forever, so addModule never resolves.
            // Electron's protocol handler serves HTTPS fixtures without intercepting file URLs.
            // The isolated Electron process owns this handler until the test closes the app.
            await runtime.electronApp.evaluate(({ session, net }, fixtures) => {
              session.defaultSession.protocol.handle('https', async (request) => {
                if (request.url === fixtures.vadURL) {
                  return new Response(Uint8Array.fromBase64(fixtures.model), {
                    headers: { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' },
                  })
                }
                const file = fixtures.runtimeFiles.find(file => file.url === request.url)
                if (file) {
                  const response = await net.fetch(file.fileURL)
                  return new Response(response.body, {
                    headers: { 'Content-Type': file.contentType, 'Access-Control-Allow-Origin': '*' },
                  })
                }
                // Bundled ASR must work offline. Provider settings use local persistence.
                if (/https:\/\/huggingface\.co\/(?:moeru-ai|csukuangfj)\/sherpa-/.test(request.url)
                  || request.url.startsWith('https://api.airi.build/')) {
                  return Response.error()
                }
                return net.fetch(request, { bypassCustomProtocolHandlers: true })
              })
            }, { vadURL, model: model.toString('base64'), runtimeFiles })
          }
          else {
            await runtime.page.context().route(vadURL, route => route.fulfill({
              body: model,
              contentType: 'application/octet-stream',
              headers: { 'Access-Control-Allow-Origin': '*' },
            }))
            await runtime.page.context().route(/https:\/\/huggingface\.co\/(?:moeru-ai|csukuangfj)\/sherpa-/, route => route.abort())
            for (const file of runtimeFiles) {
              const body = await readFile(new URL(file.fileURL))
              await runtime.page.context().route(file.url, route => route.fulfill({
                body,
                contentType: file.contentType,
                headers: { 'Access-Control-Allow-Origin': '*' },
              }))
            }
            await runtime.page.context().route('https://api.airi.build/**', route => route.abort())
          }
          runtime.page.on('pageerror', error => console.error('Sherpaw page error:', error.message))
          runtime.page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning' || message.text().includes('[Hearing'))
              console.error('Sherpaw console:', message.text())
          })
        },
      ],
    }, async ({ audio }) => {
      const page = audio.runtimePage
      page.setDefaultTimeout(30_000)
      audio.activatePage(page)
      if (audio.target === 'electron')
        await page.evaluate(() => { location.hash = '/settings/modules/hearing' })
      else
        await page.goto(new URL('/settings/modules/hearing', page.url()).href, { waitUntil: 'domcontentloaded' })
      const language = page.getByTestId('sherpaw-language-group').getByRole('combobox')
      await language.waitFor({ state: 'visible', timeout: 30_000 })
      await language.click()
      const choices = page.getByRole('option')
      expect(await choices.count()).toBe(2)
      await choices.filter({ hasText: languageGroup === 'zh-en' ? /Japanese/ : /^Chinese \/ English$/ }).click()
      await language.click()
      await choices.filter({ hasText: languageGroup === 'zh-en' ? /^Chinese \/ English$/ : /Japanese/ }).click()
      await enableHearingPlaygroundMicrophone(page)
      let transcripts: string[]
      try {
        await page.getByRole('button', { name: 'Stop monitoring', exact: true }).waitFor({ timeout: 30_000 })
        transcripts = await readHearingPlaygroundTranscriptions(page, 2)
      }
      catch (cause) {
        console.info('Sherpaw diagnostics', {
          target: audio.target,
          languageGroup,
          text: await page.locator('body').textContent(),
          state: await page.evaluate(() => ({
            input: localStorage.getItem('settings/audio/input'),
            vadReady: window.__airiAudioInputE2E?.vadReady,
          })),
        })
        throw cause
      }
      console.info('Sherpaw transcripts', { target: audio.target, languageGroup, transcripts })
      expect(transcripts).toHaveLength(2)
      for (const transcript of transcripts) {
        // Both models should preserve the instruction; names and function words
        // vary in this English recording, so exact text is reported separately.
        expect(transcript.toLowerCase()).toContain('microphone warm up')
        expect(transcript.toLowerCase()).toContain('hello')
        expect(transcript.toLowerCase()).toContain('say')
      }
      const updates = await audio.streamingTranscriptionUpdates()
      expect(updates.some(update => !transcripts.includes(update))).toBe(true)
      await page.getByTestId('hearing-playground-monitor-toggle').click()
      const result = { target: audio.target, languageGroup, transcripts, updates }
      await mkdir(new URL('../../../../.cache/sherpaw-checks/', import.meta.url), { recursive: true })
      await writeFile(new URL(`../../../../.cache/sherpaw-checks/recognition-${audio.target}-${languageGroup}.json`, import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
      console.info('Sherpaw recognition', result)
    })
  }
})
