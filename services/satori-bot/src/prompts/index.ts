import { env } from 'node:process'

import { velin } from '../utils/velin'

export async function personality() {
  return await (velin('personality-v1.velin.md', import.meta.url))()
}

export async function systemPrompt() {
  return await (velin<{ responseLanguage: string }>('system-action-gen-v1.velin.md', import.meta.url))({
    responseLanguage: env.LLM_RESPONSE_LANGUAGE || 'the same language as the user',
  })
}
