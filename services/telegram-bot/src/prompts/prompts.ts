import { env } from 'node:process'

import { message } from '@xsai/utils-chat'

import { velin } from '../utils/velin'

export async function personality() {
  return message.system(await (velin('personality-v1.velin.md', import.meta.url))())
}

export async function systemTicking() {
  return await (velin<{ responseLanguage: string }>('system-ticking-v1.velin.md', import.meta.url))({ responseLanguage: env.LLM_RESPONSE_LANGUAGE })
}

export async function messageSplit() {
  return await (velin<{ responseLanguage: string }>('message-split-v1.velin.md', import.meta.url))({ responseLanguage: env.LLM_RESPONSE_LANGUAGE })
}
