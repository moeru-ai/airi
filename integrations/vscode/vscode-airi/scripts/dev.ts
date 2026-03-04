// https://github.com/unocss/unocss/blob/dba521e377887ed2b3b38dc86f36d4f292230ac8/packages-integrations/vscode/scripts/dev.ts

import { packageJSONForVSCode } from './shared'

async function run() {
  await packageJSONForVSCode('airi-vscode')
}

run()
