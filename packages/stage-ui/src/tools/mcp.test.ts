import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { mcp } from './mcp'

describe('tools mcp schema', () => {
  it('emits strict parameter objects', async () => {
    const tools = await mcp()
    for (const name of ['mcp_list_tools', 'mcp_call_tool']) {
      const t = tools.find(entry => entry.function.name === name)
      expect(t, `missing tool: ${name}`).toBeDefined()
      expect(t?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('mcp_call_tool uses flat name+arguments schema', async () => {
    const tools = await mcp()
    const callTool = tools.find(entry => entry.function.name === 'mcp_call_tool')
    expect(callTool).toBeDefined()

    const props = (callTool!.function.parameters as JsonSchema).properties!
    expect((props.name as JsonSchema).type).toBe('string')
    expect((props.arguments as JsonSchema).type).toBe('string')
  })
})
