import { useTauriCore } from '../composables/tauri'

export async function startClickThrough() {
  const { invoke } = useTauriCore()
  await invoke('plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|start_pass_through')
}

export async function stopClickThrough() {
  const { invoke } = useTauriCore()
  await invoke('plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|stop_pass_through')
}
