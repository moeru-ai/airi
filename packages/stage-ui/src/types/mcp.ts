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
  /**
   * The Host's own exposure policy for this tool, before any user override.
   * `disabled` here is final: the settings page must not offer to promote it.
   * A `disabled` {@link exposure} with another default is a user choice, and is reversible.
   */
  defaultExposure?: McpToolExposureMode
}
