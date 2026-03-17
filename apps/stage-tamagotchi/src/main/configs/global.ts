import { array, boolean, number, object, optional, picklist, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const globalAppConfigSchema = object({
  language: optional(string(), 'en'),
  windows: optional(array(object({
    title: optional(string()),
    tag: string(),
    x: optional(number()),
    y: optional(number()),
    width: optional(number()),
    height: optional(number()),
    locked: optional(boolean()),
    snapshot: optional(object({
      x: number(),
      y: number(),
      width: number(),
      height: number(),
    })),
  }))),
  microphoneToggleHotkey: optional(picklist(['Scroll', 'Caps', 'Num']), 'Scroll'),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'config.json', globalAppConfigSchema)
  config.setup()

  return config
}
