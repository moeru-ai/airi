import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./tool-call-block.vue', import.meta.url)), 'utf8')

describe('chat tool call block rerun action', () => {
  it('wires the rerun button click to the expected toolCallRerun payload', () => {
    expect(source).toContain('toolCallId: string')
    expect(source).toContain('(e: \'toolCallRerun\', payload: { toolCallId: string, toolName: string, args: string })')
    expect(source).toContain('aria-label="Re-run tool call"')
    expect(source).toContain('@click.stop="emitToolCallRerun"')
    expect(source).toContain('i-solar:refresh-bold')
    expect(source).toContain('emit(\'toolCallRerun\', {')
    expect(source).toContain('toolCallId: props.toolCallId')
    expect(source).toContain('toolName: props.toolName')
    expect(source).toContain('args: props.args')
  })
})
