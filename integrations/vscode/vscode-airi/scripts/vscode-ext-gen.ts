import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { generate } from 'vscode-ext-gen'

import { packageJSONForVSCode } from './shared'

async function run() {
  const { restore, json } = await packageJSONForVSCode('airi-vscode')
  const generated = await generate(json, { extensionScope: 'airi-vscode' })
  const url = fileURLToPath(new URL('.', import.meta.url))
  const dir = dirname(url)

  try {
    await rm(join(dir, 'src', 'generated'), { force: true })
  }
  catch {
  }

  await mkdir(join(dir, 'src', 'generated'), { recursive: true })
  await writeFile(join(dir, 'src', 'generated', 'meta.ts'), generated.dts, 'utf-8')
  await restore()
}

run()
