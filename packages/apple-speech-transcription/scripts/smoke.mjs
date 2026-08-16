import process from 'node:process'

import { resolve } from 'node:path'

import { getCapabilities, transcribeFile } from '@proj-airi/apple-speech-transcription'

const argumentsWithoutSeparator = process.argv.slice(2).filter(argument => argument !== '--')
const inputPath = argumentsWithoutSeparator[0]
const locale = argumentsWithoutSeparator[1] ?? 'en-US'

const capabilities = await getCapabilities()
console.info(JSON.stringify({ capabilities }, null, 2))

if (inputPath) {
  const result = await transcribeFile(resolve(process.env.INIT_CWD ?? process.cwd(), inputPath), locale)
  console.info(JSON.stringify({ result }, null, 2))
}
