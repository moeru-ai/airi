import { invoke } from '@tauri-apps/api/core';

async function connectServer(command, args) {
  await invoke("plugin:mcp|connect_server", { command, args });
}
async function disconnectServer() {
  await invoke("plugin:mcp|disconnect_server");
}
async function listTools() {
  return await invoke("plugin:mcp|list_tools");
}
async function callTool(name, args) {
  return await invoke("plugin:mcp|call_tool", { name, args });
}

export { callTool, connectServer, disconnectServer, listTools };
