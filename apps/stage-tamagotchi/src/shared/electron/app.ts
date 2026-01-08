import { defineInvokeEventa } from '@moeru/eventa'

const isMacOS = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-mac-os')
const isWindows = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-windows')
const isLinux = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-linux')

export const app = {
  isMacOS,
  isWindows,
  isLinux,
}
