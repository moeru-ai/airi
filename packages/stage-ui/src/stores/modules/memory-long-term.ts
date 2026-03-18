import type { ChatHistoryItem, ContextMessage } from '../../types/chat'

import {
  buildSessionSummary,
  formatMemoriesBlock,
  Mem9Client,
  normalizeMessageContent,
  selectMessagesForIngest,
} from '@proj-airi/memory-mem9'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

const DEFAULT_API_URL = 'https://api.mem9.ai'
const MEMORY_CONTEXT_ID = 'mem9:recall'
const AUTO_CAPTURE_SOURCE = 'airi-auto'

function defaultAgentId() {
  if (isStageTamagotchi())
    return 'proj-airi:stage-tamagotchi'
  if (isStageWeb())
    return 'proj-airi:stage-web'
  return 'proj-airi:stage'
}

export const useMemoryLongTermStore = defineStore('memory-long-term', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/memory-long-term/enabled', true)
  const apiUrl = useLocalStorageManualReset<string>('settings/memory-long-term/api-url', DEFAULT_API_URL)
  const tenantId = useLocalStorageManualReset<string>('settings/memory-long-term/tenant-id', '')
  const agentId = useLocalStorageManualReset<string>('settings/memory-long-term/agent-id', defaultAgentId())
  const autoRecall = useLocalStorageManualReset<boolean>('settings/memory-long-term/auto-recall', true)
  const autoCapture = useLocalStorageManualReset<boolean>('settings/memory-long-term/auto-capture', true)
  const maxInject = useLocalStorageManualReset<number>('settings/memory-long-term/max-inject', 6)
  const maxIngestBytes = useLocalStorageManualReset<number>('settings/memory-long-term/max-ingest-bytes', 200000)

  const status = refManualReset<'idle' | 'provisioning' | 'ready' | 'error'>('idle')
  const lastError = refManualReset<string | null>(null)
  const provisionPromise = refManualReset<Promise<string> | null>(null)

  const configured = computed(() => enabled.value && !!tenantId.value)

  function createClient() {
    return new Mem9Client({
      apiUrl: apiUrl.value,
      tenantId: tenantId.value,
      agentId: agentId.value.trim() || defaultAgentId(),
    })
  }

  async function ensureProvisioned(force = false) {
    if (!enabled.value)
      return null

    if (force) {
      tenantId.value = ''
    }

    if (tenantId.value) {
      status.value = 'ready'
      return tenantId.value
    }

    if (provisionPromise.value) {
      return provisionPromise.value
    }

    status.value = 'provisioning'
    lastError.value = null

    provisionPromise.value = (async () => {
      try {
        const result = await createClient().provision()
        tenantId.value = result.id
        status.value = 'ready'
        return result.id
      }
      catch (error) {
        status.value = 'error'
        lastError.value = error instanceof Error ? error.message : String(error)
        throw error
      }
      finally {
        provisionPromise.value = null
      }
    })()

    return provisionPromise.value
  }

  async function initialize() {
    if (!enabled.value) {
      status.value = 'idle'
      return
    }

    await ensureProvisioned().catch(() => {})
  }

  async function reProvisionTenant() {
    return ensureProvisioned(true)
  }

  async function searchMemories(query: string, options?: { automatic?: boolean, limit?: number }) {
    if (!enabled.value)
      return []

    if (options?.automatic && !autoRecall.value)
      return []

    if (options?.automatic && query.trim().length < 5)
      return []

    const currentTenantId = await ensureProvisioned().catch(() => null)
    if (!currentTenantId)
      return []

    const result = await createClient().search({
      q: query,
      limit: options?.limit ?? maxInject.value,
    })

    status.value = 'ready'
    lastError.value = null
    return result.memories ?? []
  }

  async function storeMemory(content: string, tags?: string[], metadata?: Record<string, unknown>) {
    const currentTenantId = await ensureProvisioned()
    if (!currentTenantId)
      return null

    status.value = 'ready'
    lastError.value = null
    return createClient().store({
      content,
      source: AUTO_CAPTURE_SOURCE,
      tags,
      metadata,
    })
  }

  async function captureSessionMessages(messages: ChatHistoryItem[], sessionId: string) {
    if (!enabled.value || !autoCapture.value || messages.length === 0)
      return null

    const currentTenantId = await ensureProvisioned().catch(() => null)
    if (!currentTenantId)
      return null

    const normalized = messages
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({
        role: message.role,
        content: normalizeMessageContent(message.content),
      }))
      .filter(message => message.content.length > 0)

    const selected = selectMessagesForIngest(normalized, maxIngestBytes.value)
    if (selected.length === 0)
      return null

    return createClient().ingest({
      messages: selected,
      session_id: sessionId,
      agent_id: agentId.value.trim() || defaultAgentId(),
      mode: 'smart',
    })
  }

  async function captureSessionSummary(messages: ChatHistoryItem[], sessionId: string) {
    if (!enabled.value || !autoCapture.value || messages.length === 0)
      return null

    const userContents = messages
      .filter(message => message.role === 'user')
      .map(message => normalizeMessageContent(message.content))
      .filter(content => content.length > 10)

    if (userContents.length === 0)
      return null

    const summary = buildSessionSummary(userContents)
    if (!summary)
      return null

    return storeMemory(`[session-summary] ${summary}`, ['auto-capture', 'session-summary', 'pre-reset'], { sessionId })
  }

  function createRecallContext(memories: Awaited<ReturnType<typeof searchMemories>>): ContextMessage | null {
    if (memories.length === 0)
      return null

    return {
      id: nanoid(),
      contextId: MEMORY_CONTEXT_ID,
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: formatMemoriesBlock(memories),
      createdAt: Date.now(),
      metadata: {
        source: {
          kind: 'plugin',
          plugin: {
            id: 'memory-mem9',
          },
          id: tenantId.value || 'pending',
        },
      },
    }
  }

  async function getMemory(id: string) {
    const currentTenantId = await ensureProvisioned()
    if (!currentTenantId)
      return null
    return createClient().get(id)
  }

  async function updateMemory(id: string, content?: string, tags?: string[], metadata?: Record<string, unknown>) {
    const currentTenantId = await ensureProvisioned()
    if (!currentTenantId)
      return null
    return createClient().update(id, {
      content,
      tags,
      metadata,
    })
  }

  async function deleteMemory(id: string) {
    const currentTenantId = await ensureProvisioned()
    if (!currentTenantId)
      return false
    return createClient().remove(id)
  }

  async function saveSettings() {
    if (!enabled.value) {
      status.value = 'idle'
      lastError.value = null
      return
    }

    await initialize()
  }

  function resetState() {
    enabled.reset()
    apiUrl.reset()
    tenantId.reset()
    agentId.reset()
    autoRecall.reset()
    autoCapture.reset()
    maxInject.reset()
    maxIngestBytes.reset()
    status.reset()
    lastError.reset()
    provisionPromise.reset()
  }

  return {
    enabled,
    apiUrl,
    tenantId,
    agentId,
    autoRecall,
    autoCapture,
    maxInject,
    maxIngestBytes,
    status,
    lastError,
    configured,
    initialize,
    saveSettings,
    reProvisionTenant,
    searchMemories,
    storeMemory,
    getMemory,
    updateMemory,
    deleteMemory,
    captureSessionMessages,
    captureSessionSummary,
    createRecallContext,
    resetState,
  }
})
