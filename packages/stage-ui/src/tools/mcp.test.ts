import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { mcp } from './mcp'

describe('tools mcp schema', () => {
  it('emits strict parameter objects', async () => {
    const tools = await mcp()
    const toolNames = [
      'mcp_list_tools',
      'mcp_connect_server',
      'mcp_disconnect_server',
      'mcp_call_tool',
    ]

    for (const name of toolNames) {
      const tool = tools.find(entry => entry.function.name === name)
      expect(tool, `missing tool: ${name}`).toBeDefined()
      expect(tool?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('keeps mcp_call_tool parameters items strict', async () => {
    const tools = await mcp()
    const callTool = tools.find(entry => entry.function.name === 'mcp_call_tool')

    expect(callTool).toBeDefined()
    const items = ((callTool?.function.parameters as JsonSchema).properties?.parameters as any)?.items
    expect(items).toBeDefined()
    expect(items?.additionalProperties).toBe(false)
  })
})
