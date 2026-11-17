export type McpToolExposureMode = 'direct' | 'router-only' | 'disabled'

/** A Host catalog entry. Exposure controls discovery, never execution authority. */
export interface McpToolDescriptor {
  serverName: string
  name: string
  toolName: string
  description?: string
  inputSchema: Record<string, unknown>
  /** Only the Host can promote its owned entry. Omission keeps external tools behind the Router. */
  exposure?: McpToolExposureMode
}
