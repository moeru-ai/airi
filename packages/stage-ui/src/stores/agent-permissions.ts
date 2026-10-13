import type { RiskLevel } from './agent-permission'
import type { PermissionConfig } from './ai/chat-llm/agent-gate'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { classifyToolRisk, describeApproval } from './agent-permission'
import { configureToolGate, DEFAULT_PERMISSION_CONFIG, resetToolGrants } from './ai/chat-llm/agent-gate'

/** One tool call that waits for the user. */
export interface ApprovalRequest {
  /** A stable id for this request. */
  id: string
  /** The provider-visible tool name. */
  toolName: string
  /** The tool name that the risk refers to. The MCP proxy reports its inner name here. */
  displayName: string
  /** The risk of this exact call. */
  riskLevel: RiskLevel
  /** The sentence that the dialog shows. */
  preview: string
  /** The call arguments, for the details section. */
  args?: Record<string, unknown>
}

export interface ApprovalOutcome {
  approved: boolean
  remember: boolean
}

/** The shipped default for the master switch. The agent feature arrives enabled. */
const AGENT_ENABLED_DEFAULT = true

/**
 * Owns the permission settings and the queue of calls that wait for the user.
 *
 * The settings also live in {@link configureToolGate}, so the gate decides
 * without a Pinia instance. This store keeps the reactive copy that the panel
 * renders and writes every change back to the gate.
 *
 * The confirmation dialog reads {@link activeRequest} and answers with
 * {@link resolve}.
 */
export const useAgentPermissionStore = defineStore('agent-permission', () => {
  /**
   * The master switch for the whole agent feature.
   *
   * `false` keeps every tool out of the request, so the model answers as a
   * plain chat partner. The three settings below have no effect while this is
   * off, which is why the panel disables them.
   */
  const agentEnabled = useLocalStorage<boolean>('settings/agent-permission/enabled', AGENT_ENABLED_DEFAULT)
  const fullAccess = useLocalStorage<boolean>('settings/agent-permission/full-access', DEFAULT_PERMISSION_CONFIG.fullAccess)
  const autoApproveMedium = useLocalStorage<boolean>('settings/agent-permission/auto-approve-medium', DEFAULT_PERMISSION_CONFIG.autoApproveMedium)

  const config = computed<PermissionConfig>(() => ({
    fullAccess: fullAccess.value,
    autoApproveMedium: autoApproveMedium.value,
  }))

  watch(config, (next) => {
    configureToolGate(next)
  }, { deep: true, immediate: true })

  const queue = shallowRef<ApprovalRequest[]>([])
  const activeRequest = computed<ApprovalRequest | undefined>(() => queue.value[0])

  const pending = new Map<string, (outcome: ApprovalOutcome) => void>()

  /** The most recent decisions, newest first. The panel shows this list. */
  const history = ref<ApprovalRequest[]>([])

  function enqueue(request: ApprovalRequest): Promise<ApprovalOutcome> {
    return new Promise<ApprovalOutcome>((resolve) => {
      pending.set(request.id, resolve)
      queue.value = [...queue.value, request]
    })
  }

  /** Answers the visible request. A dialog that closes without an answer denies it. */
  function resolveActive(approved: boolean, remember = false): boolean {
    const request = queue.value[0]
    if (request === undefined)
      return false
    return resolve(request.id, approved, remember)
  }

  /**
   * Answers the visible request and opens the next one.
   *
   * A remembered answer becomes a session grant in the gate, which is where the
   * decision reads it.
   */
  function resolve(id: string, approved: boolean, remember = false): boolean {
    const request = queue.value.find(entry => entry.id === id)
    const settle = pending.get(id)
    if (request === undefined || settle === undefined)
      return false

    pending.delete(id)
    queue.value = queue.value.filter(entry => entry.id !== id)
    history.value = [request, ...history.value].slice(0, 50)
    settle({ approved, remember })
    return true
  }

  /** Shows the dialog and waits for the user. The gate supplies the risk it read. */
  async function requestApproval(toolName: string, args?: Record<string, unknown>, riskLevel?: RiskLevel): Promise<ApprovalOutcome> {
    const inner = typeof args?.name === 'string' && toolName === 'builtIn_mcpCallTool' ? args.name : undefined
    return await enqueue({
      id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolName,
      displayName: inner ?? toolName,
      riskLevel: riskLevel ?? classifyToolRisk(toolName, args),
      preview: describeApproval(toolName, args),
      args,
    })
  }

  /** Turns full access on or off. The caller owns the risk confirmation. */
  function setFullAccess(next: boolean) {
    fullAccess.value = next
    if (!next)
      autoApproveMedium.value = false
  }

  /** Turns the medium-risk shortcut on or off. Full access keeps it on. */
  function setAutoApproveMedium(next: boolean) {
    autoApproveMedium.value = next
  }

  /** Turns the master switch on or off. Turning it off also drops full access. */
  function setAgentEnabled(next: boolean) {
    agentEnabled.value = next
    if (!next)
      setFullAccess(false)
  }

  function resetState() {
    agentEnabled.value = AGENT_ENABLED_DEFAULT
    fullAccess.value = DEFAULT_PERMISSION_CONFIG.fullAccess
    autoApproveMedium.value = DEFAULT_PERMISSION_CONFIG.autoApproveMedium
    resetToolGrants()
    queue.value = []
    history.value = []
    pending.clear()
  }

  return {
    activeRequest,
    agentEnabled,
    autoApproveMedium,
    config,
    fullAccess,
    history,
    queue,
    requestApproval,
    resetState,
    resolve,
    resolveActive,
    setAgentEnabled,
    setAutoApproveMedium,
    setFullAccess,
  }
})
