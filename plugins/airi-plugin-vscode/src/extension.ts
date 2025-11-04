import type * as vscode from 'vscode'

import { AiriClient } from './airi-client'
import { ContextCollector } from './context-collector'

let airiClient: AiriClient
let contextCollector: ContextCollector
let updateTimer: NodeJS.Timeout | null = null
let isEnabled = true

/**
 * Activate the plugin
 */
export async function activate(context: vscode.ExtensionContext) {
  const { window, workspace, commands } = await import('vscode')

  console.info('Airi Companion is activating...')

  // Get the configuration
  const config = workspace.getConfiguration('airi.companion')
  isEnabled = config.get<boolean>('enabled', true)
  const contextLines = config.get<number>('contextLines', 5)
  const sendInterval = config.get<number>('sendInterval', 3000)

  // Initialize
  airiClient = new AiriClient()
  contextCollector = new ContextCollector(contextLines)

  // Connect to Airi Channel Server
  if (isEnabled) {
    const connected = await airiClient.connect()
    if (connected) {
      window.showInformationMessage('Airi Companion connected!')
    }
    else {
      window.showWarningMessage('Airi Companion failed to connect to server')
    }
  }

  // Register commands
  context.subscriptions.push(
    commands.registerCommand('airi.companion.enable', async () => {
      isEnabled = true
      await airiClient.connect()
      startMonitoring(sendInterval)
      window.showInformationMessage('Airi Companion enabled')
    }),

    commands.registerCommand('airi.companion.disable', () => {
      isEnabled = false
      stopMonitoring()
      airiClient.disconnect()
      window.showInformationMessage('Airi Companion disabled')
    }),

    commands.registerCommand('airi.companion.status', () => {
      const status = isEnabled && airiClient ? 'Connected' : 'Disconnected'
      window.showInformationMessage(`Airi Companion Status: ${status}`)
    }),
  )

  // Listen to editor events
  if (isEnabled) {
    // File save event
    context.subscriptions.push(
      workspace.onDidSaveTextDocument(async (document) => {
        const editor = window.activeTextEditor
        if (editor && editor.document === document) {
          const ctx = await contextCollector.collect(editor)
          if (ctx) {
            airiClient.sendEvent({
              type: 'coding:save',
              data: ctx,
            })
          }
        }
      }),
    )

    // Switch file event
    context.subscriptions.push(
      window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
          const ctx = await contextCollector.collect(editor)
          if (ctx) {
            airiClient.sendEvent({
              type: 'coding:switch-file',
              data: ctx,
            })
          }
        }
      }),
    )

    // Send context update periodically
    if (sendInterval > 0) {
      startMonitoring(sendInterval)
    }
  }

  console.info('Airi Companion activated successfully')
}

/**
 * Start monitoring the coding context
 */
function startMonitoring(interval: number) {
  stopMonitoring()

  updateTimer = setInterval(async () => {
    if (!isEnabled)
      return

    const { window } = await import('vscode')
    const editor = window.activeTextEditor
    if (!editor)
      return

    const ctx = await contextCollector.collect(editor)
    if (ctx) {
      airiClient.sendEvent({
        type: 'coding:context',
        data: ctx,
      })
    }
  }, interval)
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
}

/**
 * Deactivate the plugin
 */
export function deactivate() {
  stopMonitoring()
  airiClient?.disconnect()
  console.info('Airi Companion deactivated')
}
