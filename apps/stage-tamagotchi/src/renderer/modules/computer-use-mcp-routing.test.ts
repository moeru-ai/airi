import { describe, expect, it } from 'vitest'

import { isComputerUseMcpCall, resolveMcpCallServerName, resolveMcpCallToolName } from './computer-use-mcp-routing'

describe('computer-use mcp routing', () => {
  it('recognizes direct computer_use calls', () => {
    expect(isComputerUseMcpCall({
      name: 'computer_use::terminal_exec',
    })).toBe(true)
  })

  it('recognizes dot-qualified computer_use calls after normalization', () => {
    expect(isComputerUseMcpCall({
      name: 'computer_use.terminal_exec',
    })).toBe(true)
  })

  it('recognizes fallback-routed computer_use calls from resolved metadata', () => {
    expect(isComputerUseMcpCall({
      name: 'functions::terminal_exec',
    }, {
      resolvedServerName: 'computer_use',
      resolvedToolName: 'terminal_exec',
    })).toBe(true)
  })

  it('recognizes legacy fallback metadata carried on structuredContent', () => {
    expect(resolveMcpCallServerName({
      name: 'functions::terminal_exec',
    }, {
      structuredContent: {
        resolvedServerName: 'computer_use',
      },
    })).toBe('computer_use')
  })

  it('prefers resolved tool metadata for fallback-routed calls', () => {
    expect(resolveMcpCallToolName({
      name: 'functions::terminal_reset_state',
    }, {
      resolvedServerName: 'computer_use',
      resolvedToolName: 'terminal_reset_state',
    })).toBe('terminal_reset_state')
  })

  it('falls back to the requested tool segment when no resolved tool metadata exists', () => {
    expect(resolveMcpCallToolName({
      name: 'computer_use::pty_destroy',
    })).toBe('pty_destroy')
  })

  it('does not treat unrelated MCP servers as computer_use', () => {
    expect(isComputerUseMcpCall({
      name: 'airi_self_devtools::navigate',
    }, {
      resolvedServerName: 'airi_self_devtools',
      resolvedToolName: 'navigate',
    })).toBe(false)
  })
})
