import { invoke } from '@tauri-apps/api/core'

export async function startClickThrough() {
  await invoke('start_click_through')
}

export async function stopClickThrough() {
  await invoke('stop_click_through')
}
