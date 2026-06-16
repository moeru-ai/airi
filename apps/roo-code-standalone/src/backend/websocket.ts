import type { WebSocket } from 'ws'

import { nanoid } from 'nanoid'

import { getState, setState, patchState, listTasks, getTask, upsertTask, deleteTask } from './state.js'

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
      const message = JSON.parse(raw.toString()) as Record<string, unknown>
      handleMessage(ws, message)
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
      const { state, ...rest } = message
      if (state && typeof state === 'object') {
        patchState(state as any)
        // Acknowledge
        send(ws, { type: 'state', state: getState(), requestId })
        // Broadcast to other tabs
        broadcast({ type: 'state', state: getState() })
      }
      break
    }

    case 'resetState': {
      const fresh = {
        version: '0.1.0',
        clineMessages: [],
        apiConfiguration: getState().apiConfiguration,
        shouldShowAnnouncement: false,
        taskHistory: [],
        writeDelayMs: 0,
        enableCheckpoints: false,
        checkpointTimeout: 15,
        maxOpenTabsContext: 20,
        maxWorkspaceFiles: 200,
        showRooIgnoredFiles: false,
        enableSubfolderRules: false,
        maxImageFileSize: 5,
        maxTotalImageSize: 20,
        experiments: {},
        mcpEnabled: true,
        mode: 'vibe',
        customModes: [],
        toolRequirements: {},
        renderContext: 'sidebar' as const,
        organizationAllowList: { allowAll: true, providers: {} },
        autoCondenseContext: false,
        autoCondenseContextPercent: 80,
        autoCondenseOnModelSwitch: false,
        autoCondenseModelSwitchLookback: 3,
        profileThresholds: {},
        hasOpenedModeSelector: false,
        currentApiConfigName: 'default',
        listApiConfigMeta: [],
        pinnedApiConfigs: {},
        customInstructions: '',
        dismissedUpsells: [],
        autoApprovalEnabled: false,
        alwaysAllowReadOnly: false,
        alwaysAllowReadOnlyOutsideWorkspace: false,
        alwaysAllowWrite: false,
        alwaysAllowWriteOutsideWorkspace: false,
        alwaysAllowWriteProtected: false,
        alwaysAllowMcp: true,
        alwaysAllowModeSwitch: true,
        modeSwitchingEnabled: true,
        alwaysAllowSubtasks: false,
        alwaysAllowFollowupQuestions: false,
        alwaysAllowExecute: false,
        allowedCommands: [],
        ttsEnabled: false,
        ttsSpeed: 1,
        soundEnabled: false,
        soundVolume: 0.5,
        cwd: process.cwd(),
      }
      setState(fresh)
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
        number: listTasks().length + 1,
      }
      upsertTask(item as any)
      send(ws, { type: 'taskCreated', task: item, requestId })
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
      patchState(message as any)
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
