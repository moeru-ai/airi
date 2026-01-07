import { velin } from '../utils/velin'

export async function personality() {
  return await (velin('personality-v1.velin.md', import.meta.url))()
}

export async function systemPrompt() {
  return await (velin('system-action-gen-v1.velin.md', import.meta.url))()
}
