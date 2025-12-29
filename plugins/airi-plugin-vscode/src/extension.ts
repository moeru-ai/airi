import type { DependencyMap, ProvidedKey } from 'injeca'
import type * as vscode from 'vscode'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { noop } from 'es-toolkit'
import { injeca } from 'injeca'
import { commands, window, workspace } from 'vscode'

import { Client } from './airi'
import { ContextCollector } from './context-collector'

let updateTimer: NodeJS.Timeout | null = null
let eventListeners: vscode.Disposable[] = []

/**
 * Activate the plugin
 */
export async function activate(context: vscode.ExtensionContext) {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  useLogger().log('AIRI is activating...')

  // Get the configuration
  const config = workspace.getConfiguration('airi-vscode')
  const isEnabled = config.get<boolean>('enabled', true)
  const contextLines = config.get<number>('contextLines', 5)
  const sendInterval = config.get<number>('sendInterval', 3000)

  // Initialize
  const vscodeContext = injeca.provide('vscode:context', () => context)
  const client = injeca.provide('proj-airi:client', () => new Client())
  const contextCollector = injeca.provide('self:context-collector', () => new ContextCollector(contextLines))

  const extension = injeca.provide('extension', {
    dependsOn: { client, vscodeContext, contextCollector },
    build: ({ dependsOn }) => setup({ ...dependsOn, isEnabled, sendInterval }),
  })

  injeca.invoke({
    dependsOn: { extension },
    callback: noop,
  })

  await injeca.start()
}

async function setup(params: {
  client: Client
  vscodeContext: vscode.ExtensionContext
  contextCollector: ContextCollector
  isEnabled: boolean
  sendInterval: number
}) {
  // Connect to Airi Channel Server
  if (params.isEnabled) {
    const connected = await params.client.connect()
    if (connected) {
      window.showInformationMessage('AIRI Server Channel connected!')
    }
    else {
      window.showWarningMessage('AIRI Server Channel connection failed!')
    }
  }

  // Register commands
  params.vscodeContext.subscriptions.push(
    commands.registerCommand('airi-vscode.enable', async () => {
      params.isEnabled = true
      await params.client.connect()
      await registerListeners({ sendInterval: params.sendInterval, contextCollector: params.contextCollector, client: params.client, isEnabled: params.isEnabled })
      window.showInformationMessage('AIRI enabled!')
    }),

    commands.registerCommand('airi-vscode.disable', () => {
      params.isEnabled = false
      unregisterListeners()
      params.client.disconnect()
      window.showInformationMessage('AIRI disabled!')
    }),

    commands.registerCommand('airi-vscode.status', () => {
      const status = params.isEnabled && params.client ? 'Connected' : 'Disconnected'
      window.showInformationMessage(`AIRI Server Channel status: ${status}.`)
    }),
  )

  // Register event listeners if enabled
  if (params.isEnabled) {
    await registerListeners({ sendInterval: params.sendInterval, contextCollector: params.contextCollector, client: params.client, isEnabled: params.isEnabled })
  }

  useLogger().log('AIRI activated successfully')
}

/**
 * Register event listeners for file save and editor switch
 */
async function registerListeners(params: { contextCollector: ContextCollector, client: Client, isEnabled: boolean, sendInterval: number }) {
  unregisterListeners()

  // File save event
  eventListeners.push(
    workspace.onDidSaveTextDocument(async (document) => {
      const editor = window.activeTextEditor
      if (editor && editor.document === document) {
        const ctx = await params.contextCollector.collect(editor)
        if (!ctx)
          return

        params.client.replaceContext(JSON.stringify({ type: 'coding:save', data: ctx }))
      }
    }),
  )

  // Switch file event
  eventListeners.push(
    window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) {
        return
      }

      const ctx = await params.contextCollector.collect(editor)
      if (!ctx) {
        return
      }

      params.client.replaceContext(JSON.stringify({ type: 'coding:switch-file', data: ctx }))
    }),
  )

  // Start periodic monitoring if interval is set
  if (params.sendInterval > 0) {
    startMonitoring({ contextCollector: params.contextCollector, client: params.client, isEnabled: params.isEnabled, interval: params.sendInterval })
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
function startMonitoring(params: { contextCollector: ContextCollector, client: Client, isEnabled: boolean, interval: number }) {
  stopMonitoring()

  updateTimer = setInterval(async () => {
    if (!params.isEnabled)
      return

    const editor = window.activeTextEditor
    if (!editor)
      return

    const ctx = await params.contextCollector.collect(editor)
    if (!ctx)
      return

    params.client.replaceContext(JSON.stringify({ type: 'coding:context', data: ctx }))
  }, params.interval)
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
export async function deactivate() {
  const { client } = await injeca.resolve({ client: { key: 'proj-airi:client' } as ProvidedKey<'proj-airi:client', Client, DependencyMap | undefined> })

  unregisterListeners()
  client?.disconnect()
  useLogger().log('AIRI deactivated!')
}
