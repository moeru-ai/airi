import { describe, expect, it } from 'vitest'

import { matchesMcpToolId } from './mcp-tool-id'

describe('matchesMcpToolId', () => {
  it.each([
    ['mcp:terminal_exec', 'terminal_exec'],
    ['mcp:airi-terminal__terminal_exec', 'terminal_exec'],
    ['mcp:owned::computer_act', 'computer_act'],
  ])('matches %s to %s', (toolId, toolName) => {
    expect(matchesMcpToolId(toolId, toolName)).toBe(true)
  })

  it('rejects unrelated tools', () => {
    expect(matchesMcpToolId('mcp:weather', 'terminal_exec')).toBe(false)
  })
})
