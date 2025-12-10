import { dirname, join } from 'node:path'

import { exec } from 'tinyexec'

import { packageJSONForVSCode } from './shared'

async function run() {
  const { restore, name } = await packageJSONForVSCode('airi-vscode')

  const execGen = exec('pnpm', ['-F', name, 'exec', 'vscode-ext-gen', '--scope=unocss', '--output', join('src', 'generated', 'meta.ts')], { nodeOptions: { cwd: dirname(new URL('../', import.meta.url).pathname) } })
  for await (const line of execGen) {
    // eslint-disable-next-line no-console
    console.log(line)
  }

  await restore()
}

run()
