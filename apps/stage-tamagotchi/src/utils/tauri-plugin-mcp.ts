// TODO: move to plugin package when it's ready

import { invoke } from '@tauri-apps/api/core'

export interface Tool {
  name: string
  description: string

}

export async function connectServer(command: string, args: string[]) {
  await invoke('plugin:mcp|connect_server', { command, args })
}

export async function listTools() {
  await invoke('plugin:mcp|list_tools')
}
