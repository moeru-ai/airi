import type { WebSocket } from 'ws'
import type { HistoryItem } from '@roo-code/types'

import { nanoid } from 'nanoid'

import { runTask } from './task-runner.js'

import {
  getState,
  setState,
  patchState,
  createInitialStateFrom,
  getTask,
  getTaskCount,
  upsertTask,
  deleteTask,
  tasks,
} from './state.js'

/**
 * WebSocket handler for the standalone backend.
 *
 * Replaces the vscode.postMessage / window.message event bridge with a
 * direct WebSocket between the React SPA and the Fastify backend.
 *
 * Protocol: JSON messages using the same ExtensionMessage / WebviewMessage
 * shapes the webview-ui already uses.
 */

// Track all connected clients (usually one, but support multiple tabs)
const clients = new Set<WebSocket>()

/** Broadcast a message to all connected clients (used for state sync). */
export function broadcast(message: Record<string, unknown>): void {
  const data = JSON.stringify(message)
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(data)
    }
  }
}

/** Send a message to a specific client. */
function send(ws: WebSocket, message: Record<string, unknown>): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message))
  }
}

export function websocketHandler(ws: WebSocket): void {
  clients.add(ws)
  console.log(`[roo-standalone] ws connected (${clients.size} clients)`)

  // Send initial state on connect — mirrors the VSCode extension host
  // sending the full state when the webview launches.
  send(ws, { type: 'state', state: getState(), seq: 0 })

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        console.warn('[roo-standalone] ws invalid message shape:', raw.toString().slice(0, 200))
        return
      }
      handleMessage(ws, message as Record<string, unknown>)
    } catch {
      console.warn('[roo-standalone] ws invalid JSON:', raw.toString().slice(0, 200))
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[roo-standalone] ws disconnected (${clients.size} clients)`)
  })

  ws.on('error', (err) => {
    console.error('[roo-standalone] ws error:', err.message)
    clients.delete(ws)
  })
}

function handleMessage(ws: WebSocket, message: Record<string, unknown>): void {
  const { type, requestId } = message

  switch (type) {
    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    case 'state': {
      // Client → server: patch state
      const { state: clientState, ...rest } = message
      if (clientState && typeof clientState === 'object') {
        patchState(clientState as Record<string, unknown>)
        // Sync taskHistory into the tasks Map (source of truth for /tasks)
        const hist = (clientState as Record<string, unknown>).taskHistory
        if (Array.isArray(hist)) {
          for (const item of hist as Array<{ id?: string }>) {
            if (item?.id) tasks.set(item.id, item as HistoryItem)
          }
        }
        // Acknowledge
        send(ws, { type: 'state', state: getState(), requestId })
        // Broadcast to other tabs
        broadcast({ type: 'state', state: getState() })
      }
      break
    }

    case 'resetState': {
      const fresh = setState(createInitialStateFrom(getState()))
      send(ws, { type: 'state', state: fresh, requestId })
      broadcast({ type: 'state', state: fresh })
      break
    }

    // ------------------------------------------------------------------
    // Tasks
    // ------------------------------------------------------------------
    case 'newTask': {
      const { text, mode } = message
      if (!text || typeof text !== 'string') return
      const id = nanoid()
      const item = {
        id,
        ts: Date.now(),
        task: text,
        mode: mode ?? 'vibe',
        tokensIn: 0,
        tokensOut: 0,
        cacheWrites: 0,
        cacheReads: 0,
        totalCost: 0,
        number: getTaskCount() + 1,
      }
      upsertTask(item as HistoryItem)
      send(ws, { type: 'taskCreated', task: item, requestId })

      // Standalone mode: run the LLM call directly. Fire-and-forget —
      // the runner pushes state updates via onUpdate -> broadcast.
      runTask(id, text, () => {
        broadcast({ type: 'state', state: getState() })
      }).catch((err) => {
        console.error('[roo-standalone] task run failed:', err)
      })
      break
    }

    case 'cancelTask': {
      const { taskId } = message
      if (taskId && typeof taskId === 'string') {
        const task = getTask(taskId)
        if (task) {
          ;(task as any).status = 'cancelled'
          upsertTask(task)
          send(ws, { type: 'taskUpdated', task, requestId })
        }
      }
      break
    }

    case 'showTaskWithId': {
      const { taskId } = message
      if (taskId && typeof taskId === 'string') {
        const task = getTask(taskId)
        send(ws, { type: 'taskLoaded', task: task ?? null, requestId })
      }
      break
    }

    case 'deleteTaskWithId': {
      const { taskId } = message
      if (taskId && typeof taskId === 'string') {
        deleteTask(taskId)
        send(ws, { type: 'taskDeleted', taskId, requestId })
      }
      break
    }

    // ------------------------------------------------------------------
    // Settings (shims for messages the webview-ui sends)
    // ------------------------------------------------------------------
    case 'saveApiConfiguration':
    case 'upsertApiConfiguration':
    case 'deleteApiConfiguration':
    case 'loadApiConfiguration':
    case 'loadApiConfigurationById':
    case 'renameApiConfiguration':
    case 'getListApiConfiguration':
    case 'mode':
    case 'customInstructions':
    case 'allowedCommands':
    case 'updateSettings': {
      const { type: _type, requestId: _requestId, seq: _seq, ...payload } = message
      patchState(payload as Partial<ExtensionState>)
      const updated = getState()
      send(ws, { type: 'state', state: updated, requestId })
      broadcast({ type: 'state', state: updated })
      break
    }

    // ------------------------------------------------------------------
    // Webview launch — client is ready
    // ------------------------------------------------------------------
    case 'webviewDidLaunch': {
      send(ws, { type: 'state', state: getState(), requestId, seq: 0 })
      break
    }

    // ------------------------------------------------------------------
    // Fallback — acknowledge unknown messages
    // ------------------------------------------------------------------
    default: {
      console.debug(`[roo-standalone] ws unhandled type: ${type}`)
      if (requestId) {
        send(ws, { type: 'ack', requestId, handled: false, originalType: type })
      }
    }
  }
}
