/**
 * Debug tracker — captures the full pipeline of each conversation turn.
 * Use `/debug` in Telegram to view the last flow.
 */

export interface DebugStep {
  name: string
  timestamp: number
  durationMs?: number
  data: Record<string, unknown>
}

export interface DebugFlow {
  chatId: string
  startedAt: number
  steps: DebugStep[]
}

const MAX_FLOWS = 20
const flows: DebugFlow[] = []
let currentFlow: DebugFlow | null = null

export function startFlow(chatId: string): void {
  currentFlow = { chatId, startedAt: Date.now(), steps: [] }
}

export function addStep(name: string, data: Record<string, unknown>): void {
  if (!currentFlow)
    return
  currentFlow.steps.push({ name, timestamp: Date.now(), data })
}

export function endFlow(): void {
  if (!currentFlow)
    return
  // Calculate durations between steps
  for (let i = 0; i < currentFlow.steps.length; i++) {
    const next = currentFlow.steps[i + 1]
    if (next)
      currentFlow.steps[i].durationMs = next.timestamp - currentFlow.steps[i].timestamp
  }
  flows.unshift(currentFlow)
  if (flows.length > MAX_FLOWS)
    flows.pop()
  currentFlow = null
}

export function getFlow(chatId?: string, index = 0): DebugFlow | null {
  if (chatId) {
    const chatFlows = flows.filter(f => f.chatId === chatId)
    return chatFlows[index] ?? null
  }
  return flows[index] ?? null
}

export function getFlowCount(chatId?: string): number {
  if (chatId)
    return flows.filter(f => f.chatId === chatId).length
  return flows.length
}

export function formatFlowList(chatId?: string): string {
  const target = chatId ? flows.filter(f => f.chatId === chatId) : flows
  if (target.length === 0)
    return 'No debug flows recorded.'

  const lines: string[] = [`== Debug Flows (${target.length} total) ==`, '']
  for (let i = 0; i < target.length; i++) {
    const f = target[i]
    const totalMs = f.steps.length > 0
      ? f.steps[f.steps.length - 1].timestamp - f.startedAt
      : 0
    const actions = f.steps.filter(s => s.name === 'imagineAnAction:parsedAction').map(s => s.data.action).join(',')
    const time = new Date(f.startedAt).toLocaleTimeString()
    lines.push(`[${i}] ${time} | ${totalMs}ms | ${f.steps.length} steps | ${actions || 'no action'}`)
  }
  lines.push('')
  lines.push('Use /debug <number> to view details.')
  return lines.join('\n')
}

export function formatFlow(flow: DebugFlow): string {
  const totalMs = flow.steps.length > 0
    ? flow.steps[flow.steps.length - 1].timestamp - flow.startedAt
    : 0

  const lines: string[] = []
  lines.push(`== Debug Flow (chat: ${flow.chatId}) ==`)
  lines.push(`Total: ${totalMs}ms | Steps: ${flow.steps.length}`)
  lines.push('')

  for (const step of flow.steps) {
    const dur = step.durationMs != null ? ` (${step.durationMs}ms)` : ''
    lines.push(`[${step.name}]${dur}`)

    for (const [key, value] of Object.entries(step.data)) {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value)
      // Truncate long values
      const display = strValue.length > 200 ? `${strValue.slice(0, 200)}...` : strValue
      lines.push(`  ${key}: ${display}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
