import { defineInvokeEventa } from '@moeru/eventa'

const isMacOS = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-macos')
const isWindows = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-windows')
const isLinux = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-linux')
const quit = defineInvokeEventa<void>('eventa:invoke:electron:app:quit')

export const app = {
  isMacOS,
  isWindows,
  isLinux,
  quit,
}
