import { useTauriCore } from '../composables/tauri'

export async function startClickThrough() {
  const { invoke } = useTauriCore()
  await invoke('start_click_through')
}

export async function stopClickThrough() {
  const { invoke } = useTauriCore()
  await invoke('stop_click_through')
}
