import type { Plugin } from 'vite'

import type { CalibrationFile, ReadingLabel } from './types'

import { readFile, rename, writeFile } from 'node:fs/promises'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

/** `CALIBRATION_FILE` points the tool at another file, for example a copy to test the tool without touching labels. */
const calibrationFile = env.CALIBRATION_FILE ?? fileURLToPath(new URL('./calibration.json', import.meta.url))
const labels = new Set<ReadingLabel>(['natural', 'mixed', 'spelled'])

/**
 * Runs the updates of the file one at a time.
 *
 * Leaving a note box and clicking a label sends two saves at once. Two read-modify-write updates that overlap wrote
 * over each other and left two JSON documents in one file, so every update waits for the one before it. The new
 * file is written next to the old one and renamed over it, so a failed write never leaves half a file.
 */
let updates: Promise<unknown> = Promise.resolve()
function update(change: (file: CalibrationFile) => boolean): Promise<boolean> {
  const run = updates.then(async () => {
    const file = JSON.parse(await readFile(calibrationFile, 'utf8')) as CalibrationFile
    if (!change(file))
      return false
    const partial = `${calibrationFile}.partial`
    await writeFile(partial, `${JSON.stringify(file, null, 2)}\n`)
    await rename(partial, calibrationFile)
    return true
  })
  updates = run.catch(() => undefined)
  return run
}

/**
 * Serves `calibration.json` to the page and writes each label back to it.
 *
 * - `GET /api/items` returns the file.
 * - `POST /api/items` with `{ id, label, note }` sets the label of one item. `label: null` clears it.
 *
 * The file is the only state, so a label is saved as soon as the person chooses it.
 */
function calibrationApi(): Plugin {
  return {
    name: 'calibration-api',
    configureServer(server) {
      server.middlewares.use('/api/items', async (request, response) => {
        if (request.method === 'GET') {
          response.setHeader('content-type', 'application/json')
          response.end(await readFile(calibrationFile, 'utf8'))
          return
        }
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.end()
          return
        }

        let body = ''
        for await (const chunk of request)
          body += chunk
        const { id, label, note } = JSON.parse(body) as { id: string, label: ReadingLabel | null, note: string }
        if (label !== null && !labels.has(label)) {
          response.statusCode = 400
          response.end('unknown label')
          return
        }
        const found = await update((file) => {
          const item = file.items.find(candidate => candidate.id === id)
          if (!item)
            return false
          item.label = label
          item.note = note
          return true
        })
        response.statusCode = found ? 200 : 404
        response.end(found ? 'ok' : 'unknown item')
      })
    },
  }
}

/** The labeling tool of the judge calibration set. Run: pnpm -F @proj-airi/evals-tts-speech-formula run judge:label */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [calibrationApi()],
  server: { port: Number(env.CALIBRATION_PORT ?? 5299), open: !env.CALIBRATION_FILE },
})
