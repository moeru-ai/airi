/** Downloads the pinned GenAI registry files and writes `src/generated.ts`. */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'valibot'
import { parse as parseYaml } from 'yaml'

import { registryFileSchema, renderModule } from './render'

// To upgrade, change this commit, run `generate`, and read the diff of `src/generated.ts` for renamed names.
const COMMIT = 'e6658f14c9d9ea0760825f029cb82e7673f48fab'
const FILES = ['model/gen-ai/registry.yaml', 'model/gen-ai/metrics.yaml', 'model/gen-ai/token-metrics.yaml']

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../src/generated.ts')

const files = await Promise.all(FILES.map(async (path) => {
  const url = `https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/${COMMIT}/${path}`
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  return parse(registryFileSchema, parseYaml(await response.text()))
}))

await writeFile(output, renderModule({ commit: COMMIT, files: FILES }, files))
console.info(`Wrote ${output}`)
