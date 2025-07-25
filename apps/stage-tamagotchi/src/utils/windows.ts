import { commands } from '../bindings/tauri-plugins/window-pass-through-on-hover'

export async function startClickThrough() {
  await commands.startPassThrough()
}

export async function stopClickThrough() {
  await commands.stopPassThrough()
}
