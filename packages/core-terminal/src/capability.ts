/**
 * AIRI Core Terminal — Capability Registration
 *
 * Connects the MCP bridge, discovers the PTY server's tool surface, and
 * registers a `terminal` capability (with one `ToolId` per advertised MCP
 * tool) into AIRI's core `CapabilityRegistry`. Binding of handlers to
 * `LocalToolRuntime` also happens here so that the registry and runtime
 * stay in sync.
 */

import type { CapabilityDescriptor, LocalToolRuntime, ToolDescriptor, ToolId } from '@proj-airi/core'
import { createCapabilityId, createToolId } from '@proj-airi/core'

import { TerminalMcpBridge } from './bridge.js'
import { createTerminalToolHandler } from './handler.js'

export const TERMINAL_CAPABILITY_ID = 'terminal'

export interface RegisterTerminalCapabilityOptions {
  /**
   * Override the default MCP bridge options (useful for tests or for
   * pointing the bridge at a local anima-use-terminal source path).
   */
  bridgeOptions?: ConstructorParameters<typeof TerminalMcpBridge>[0]
}

export interface RegisteredTerminalCapability {
  capabilityId: import('@proj-airi/core').CapabilityId
  descriptor: CapabilityDescriptor
  bridge: TerminalMcpBridge
  toolIds: ToolId[]
}

/**
 * Register a `terminal` capability into AIRI's CapabilityRegistry.
 *
 * This function:
 * 1. Constructs a `TerminalMcpBridge` with the given options
 * 2. Connects to the MCP server and enumerates its tools
 * 3. Constructs a `CapabilityDescriptor` with one `ToolDescriptor` per tool
 * 4. Registers the capability into the registry
 * 5. Binds a handler for each tool to the `LocalToolRuntime`
 *
 * The bridge must be closed by the caller (via `bridge.close()`) when the
 * capability is no longer needed.
 *
 * @throws If the capability is already registered
 * @throws If tool ID collisions are detected with existing capabilities
 * @throws If the bridge fails to connect or list tools
 */
export async function registerTerminalCapability(
  registry: InstanceType<typeof import('@proj-airi/core').CapabilityRegistry>,
  runtime: LocalToolRuntime,
  options: RegisterTerminalCapabilityOptions = {},
): Promise<RegisteredTerminalCapability> {
  const capabilityId = createCapabilityId(TERMINAL_CAPABILITY_ID)

  // Fail fast if the capability is already registered.
  if (registry.get(capabilityId)) {
    throw new Error(`Terminal capability "${capabilityId}" is already registered`)
  }

  const bridge = new TerminalMcpBridge(options.bridgeOptions)
  const tools = await bridge.connect()

  const toolIds: ToolId[] = []
  const descriptors: ToolDescriptor[] = []

  for (const tool of tools) {
    const toolId = createToolId(tool.name) as ToolId
    toolIds.push(toolId)

    const descriptor: ToolDescriptor = {
      id: toolId,
      name: tool.name,
      description: tool.description ?? `Terminal tool: ${tool.name}`,
      capabilityId,
      inputSchema: tool.inputSchema ?? { type: 'object' },
      outputSchema: { type: 'object' },
    }
    descriptors.push(descriptor)

    // Register a handler on the runtime that proxies to the MCP bridge.
    runtime.registerHandler(toolId, createTerminalToolHandler(bridge, descriptor))
  }

  const capabilityDescriptor: CapabilityDescriptor = {
    id: capabilityId,
    name: 'Terminal',
    description: 'PTY-backed terminal capability powered by anima-use-terminal MCP server',
    moduleId: '@proj-airi/core-terminal',
    tools: descriptors,
  }

  registry.register(capabilityDescriptor)

  return {
    capabilityId,
    descriptor: capabilityDescriptor,
    bridge,
    toolIds,
  }
}
