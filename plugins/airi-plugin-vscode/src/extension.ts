import type * as vscode from 'vscode'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { commands, window, workspace } from 'vscode'

import { Client } from './airi'
import { ContextCollector } from './context-collector'

let client: Client
let contextCollector: ContextCollector
let updateTimer: NodeJS.Timeout | null = null
let isEnabled = true
let eventListeners: vscode.Disposable[] = []

/**
 * Activate the plugin
 */
export async function activate(context: vscode.ExtensionContext) {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  useLogger().log('AIRI is activating...')

  // Get the configuration
  const config = workspace.getConfiguration('airi-vscode')
  isEnabled = config.get<boolean>('enabled', true)
  const contextLines = config.get<number>('contextLines', 5)
  const sendInterval = config.get<number>('sendInterval', 3000)

  // Initialize
  client = new Client()
  contextCollector = new ContextCollector(contextLines)

  // Connect to Airi Channel Server
  if (isEnabled) {
    const connected = await client.connect()
    if (connected) {
      window.showInformationMessage('AIRI Server Channel connected!')
    }
    else {
      window.showWarningMessage('AIRI Server Channel connection failed!')
    }
  }

  // Register commands
  context.subscriptions.push(
    commands.registerCommand('airi-vscode.enable', async () => {
      isEnabled = true
      await client.connect()
      await registerListeners(sendInterval)
      window.showInformationMessage('AIRI enabled!')
    }),

    commands.registerCommand('airi-vscode.disable', () => {
      isEnabled = false
      unregisterListeners()
      client.disconnect()
      window.showInformationMessage('AIRI disabled!')
    }),

    commands.registerCommand('airi-vscode.status', () => {
      const status = isEnabled && client ? 'Connected' : 'Disconnected'
      window.showInformationMessage(`AIRI Server Channel status: ${status}.`)
    }),
  )

  // Register event listeners if enabled
  if (isEnabled) {
    await registerListeners(sendInterval)
  }

  useLogger().log('AIRI activated successfully')
}

/**
 * Register event listeners for file save and editor switch
 */
async function registerListeners(sendInterval: number) {
  unregisterListeners()

  // File save event
  eventListeners.push(
    workspace.onDidSaveTextDocument(async (document) => {
      const editor = window.activeTextEditor
      if (editor && editor.document === document) {
        const ctx = await contextCollector.collect(editor)
        if (ctx) {
          client.sendEvent({
            type: 'coding:save',
            data: ctx,
          })
        }
      }
    }),
  )

  // Switch file event
  eventListeners.push(
    window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        const ctx = await contextCollector.collect(editor)
        if (ctx) {
          client.sendEvent({
            type: 'coding:switch-file',
            data: ctx,
          })
        }
      }
    }),
  )

  // Start periodic monitoring if interval is set
  if (sendInterval > 0) {
    startMonitoring(sendInterval)
  }
}

/**
 * Unregister all event listeners
 */
function unregisterListeners() {
  eventListeners.forEach(listener => listener.dispose())
  eventListeners = []
  stopMonitoring()
}

/**
 * Start monitoring the coding context
 */
function startMonitoring(interval: number) {
  stopMonitoring()

  updateTimer = setInterval(async () => {
    if (!isEnabled)
      return

    const editor = window.activeTextEditor
    if (!editor)
      return

    const ctx = await contextCollector.collect(editor)
    if (ctx) {
      client.sendEvent({
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
  unregisterListeners()
  client?.disconnect()
  useLogger().log('AIRI deactivated!')
}
