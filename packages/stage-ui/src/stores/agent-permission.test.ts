import { describe, expect, it } from 'vitest'

import { classifyToolRisk, describeApproval, innerToolName, RISK } from './agent-permission'
import { decide, DECISION, DEFAULT_PERMISSION_CONFIG, normalizePermissionConfig } from './ai/chat-llm/agent-gate'

describe('classifyToolRisk', () => {
  it('names the risk of a known built-in tool', () => {
    expect(classifyToolRisk('builtIn_mcpListTools')).toBe(RISK.LOW)
    expect(classifyToolRisk('builtIn_emitSparkCommand')).toBe(RISK.MEDIUM)
    expect(classifyToolRisk('web_search')).toBe(RISK.LOW)
  })

  it('reads the inner name of an MCP proxy call', () => {
    expect(innerToolName('builtIn_mcpCallTool', { name: 'desktop_get_state' })).toBe('desktop_get_state')
    expect(innerToolName('builtIn_webSearch', { name: 'desktop_get_state' })).toBeUndefined()
  })

  it('classifies a read-only inner tool as low risk', () => {
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'desktop_get_state' })).toBe(RISK.LOW)
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'desktop_list_windows' })).toBe(RISK.LOW)
    // The qualified form states the server first.
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'computer_use::desktop_get_state' })).toBe(RISK.LOW)
  })

  it('classifies an inner tool that changes the machine as high risk', () => {
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'desktop_click' })).toBe(RISK.HIGH)
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'terminal_exec' })).toBe(RISK.HIGH)
  })

  it('keeps a high-risk segment ahead of a read segment', () => {
    // A compound name must not pass as a read.
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'read_and_write_file' })).toBe(RISK.HIGH)
  })

  it('matches whole segments, never a substring', () => {
    // `stage_widgets` contains "get" inside "widgets". It is not a read tool.
    expect(classifyToolRisk('stage_widgets')).toBe(RISK.HIGH)
  })

  it('treats an unknown tool as high risk', () => {
    expect(classifyToolRisk('some_plugin_tool')).toBe(RISK.HIGH)
    expect(classifyToolRisk('builtIn_mcpCallTool', { name: 'mystery' })).toBe(RISK.HIGH)
    expect(classifyToolRisk('builtIn_mcpCallTool', {})).toBe(RISK.HIGH)
  })

  it('reads the subcommand of the desktop tool', () => {
    expect(classifyToolRisk('computer_use', { argv: ['invoke', 'display.screenshot'] })).toBe(RISK.LOW)
    expect(classifyToolRisk('computer_use', { argv: ['invoke', 'window.list'] })).toBe(RISK.LOW)
    expect(classifyToolRisk('computer_use', { argv: ['invoke', 'app.probePermissions'] })).toBe(RISK.LOW)
    expect(classifyToolRisk('computer_use', { argv: ['invoke', 'input.click'] })).toBe(RISK.HIGH)
    expect(classifyToolRisk('computer_use', { argv: ['invoke', 'app.open'] })).toBe(RISK.HIGH)
  })

  it('treats a desktop call without a readable subcommand as high risk', () => {
    expect(classifyToolRisk('computer_use')).toBe(RISK.HIGH)
    expect(classifyToolRisk('computer_use', { argv: [] })).toBe(RISK.HIGH)
    expect(classifyToolRisk('computer_use', { argv: ['invoke', '--help'] })).toBe(RISK.HIGH)
  })

  it('classifies the home assistant tools', () => {
    expect(classifyToolRisk('home_assistant_list_entities')).toBe(RISK.LOW)
    expect(classifyToolRisk('home_assistant_get_state')).toBe(RISK.LOW)
    expect(classifyToolRisk('home_assistant_call_service')).toBe(RISK.HIGH)
  })
})

describe('decide', () => {
  it('always runs a low-risk call', () => {
    expect(decide(RISK.LOW, DEFAULT_PERMISSION_CONFIG)).toBe(DECISION.ALLOW)
  })

  it('asks for a medium-risk call by default', () => {
    expect(decide(RISK.MEDIUM, DEFAULT_PERMISSION_CONFIG)).toBe(DECISION.ASK)
  })

  it('runs a medium-risk call when the user skips write confirmations', () => {
    expect(decide(RISK.MEDIUM, { autoApproveMedium: true, fullAccess: false })).toBe(DECISION.ALLOW)
  })

  it('asks for a high-risk call even when the user skips write confirmations', () => {
    expect(decide(RISK.HIGH, { autoApproveMedium: true, fullAccess: false })).toBe(DECISION.ASK)
  })

  it('allows every level under full access', () => {
    const config = { autoApproveMedium: false, fullAccess: true }
    expect(decide(RISK.LOW, config)).toBe(DECISION.ALLOW)
    expect(decide(RISK.MEDIUM, config)).toBe(DECISION.ALLOW)
    expect(decide(RISK.HIGH, config)).toBe(DECISION.ALLOW)
  })
})

describe('normalizePermissionConfig', () => {
  it('reads only the two supported fields', () => {
    expect(normalizePermissionConfig({ fullAccess: true, allowHighRisk: true } as never)).toEqual({
      autoApproveMedium: false,
      fullAccess: true,
    })
  })

  it('defaults every field to off', () => {
    expect(normalizePermissionConfig(undefined)).toEqual(DEFAULT_PERMISSION_CONFIG)
  })
})

describe('describeApproval', () => {
  it('names the inner tool of an MCP proxy call', () => {
    expect(describeApproval('builtIn_mcpCallTool', { name: 'desktop_click', arguments: { x: 1 } }))
      .toContain('desktop_click')
  })

  it('writes a readable sentence for a spark command', () => {
    expect(describeApproval('builtIn_emitSparkCommand', { intent: 'action' })).toBe('spark:command action')
  })

  it('falls back to the outer tool name and its arguments', () => {
    expect(describeApproval('some_plugin_tool', { path: '/tmp/a' })).toContain('some_plugin_tool')
    expect(describeApproval('some_plugin_tool', { path: '/tmp/a' })).toContain('/tmp/a')
  })
})
