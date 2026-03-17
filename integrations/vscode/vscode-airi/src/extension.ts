import type { ProvidedBy } from 'injeca'
import type * as vscode from 'vscode'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { noop } from 'es-toolkit'
import { injeca } from 'injeca'
import { commands, window, workspace } from 'vscode'

import { Client } from './airi'
import { ContextCollector } from './context-collector'

interface IntervalHandle {
  clearInterval: () => void
  setInterval: (fn: () => void) => NodeJS.Timeout
}

function createInstanceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function getOrCreateInstanceId(context: vscode.ExtensionContext) {
  const key = 'airi:instance-id'
  const existing = context.globalState.get<string>(key)
  if (existing)
    return existing

  const next = createInstanceId()
  await context.globalState.update(key, next)
  return next
}

/**
 * Activate the plugin
 */
export async function activate(context: vscode.ExtensionContext) {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  useLogger().log('AIRI is activating...')

  const config = workspace.getConfiguration('airi-vscode')
  const isEnabled = config.get<boolean>('enabled', true)
  const contextLines = config.get<number>('contextLines', 5)
  const sendInterval = config.get<number>('sendInterval', 3000)
  const instanceId = await getOrCreateInstanceId(context)
  const workspaceFolders = workspace.workspaceFolders?.map(folder => folder.uri.fsPath) ?? []

  const vscodeContext = injeca.provide('vscode:context', () => context)
  const client = injeca.provide('proj-airi:client', () => new Client({ instanceId, workspaceFolders }))
  const contextCollector = injeca.provide('self:context-collector', () => new ContextCollector(contextLines))
  const eventListeners = injeca.provide('self:event-listeners', () => [] as vscode.Disposable[])
  const controlLoopInterval = injeca.provide('self:control-loop:interval:send', () => {
    let intervalTimer: NodeJS.Timeout | null = null

    return {
      clearInterval: () => {
        if (intervalTimer) {
          clearInterval(intervalTimer)
        }
      },
      setInterval: (fn: () => void) => {
        intervalTimer = setInterval(fn, sendInterval)
        return intervalTimer
      },
    } satisfies IntervalHandle
  })

  const extension = injeca.provide('extension', {
    dependsOn: { client, vscodeContext, contextCollector, eventListeners, controlLoopInterval },
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
  eventListeners: vscode.Disposable[]
  controlLoopInterval: IntervalHandle
  isEnabled: boolean
  sendInterval: number
}) {
  if (params.isEnabled) {
    const connected = await params.client.connect()
    if (connected) {
      window.showInformationMessage('AIRI VSCode channel connected')
    }
    else {
      window.showWarningMessage('AIRI VSCode channel connection failed')
    }
  }

  params.vscodeContext.subscriptions.push(
    commands.registerCommand('airi-vscode.enable', async () => {
      params.isEnabled = true
      await params.client.connect()
      await registerListeners(params)
      window.showInformationMessage('AIRI enabled')
    }),

    commands.registerCommand('airi-vscode.disable', () => {
      params.isEnabled = false
      unregisterListeners({ eventListeners: params.eventListeners, controlLoopInterval: params.controlLoopInterval })
      params.client.disconnect()
      window.showInformationMessage('AIRI disabled')
    }),

    commands.registerCommand('airi-vscode.status', () => {
      const status = params.isEnabled && params.client.isConnected() ? 'Connected' : 'Disconnected'
      window.showInformationMessage(`AIRI VSCode channel status: ${status}.`)
    }),
  )

  if (params.isEnabled) {
    await registerListeners(params)
  }

  useLogger().log('AIRI activated successfully')
}

async function registerListeners(params: {
  contextCollector: ContextCollector
  eventListeners: vscode.Disposable[]
  client: Client
  controlLoopInterval: IntervalHandle
  isEnabled: boolean
  sendInterval: number
}) {
  unregisterListeners({ eventListeners: params.eventListeners, controlLoopInterval: params.controlLoopInterval })

  params.eventListeners.push(
    workspace.onDidSaveTextDocument(async (document) => {
      const editor = window.activeTextEditor
      if (!editor || editor.document !== document) {
        return
      }

      const ctx = await params.contextCollector.collect(editor)
      if (!ctx) {
        return
      }

      await params.client.replaceContext(
        ''
        + `User saved the file: ${ctx.file.fileName} (located at ${ctx.file.path}). Here is the context around the cursor after saving:\n`
        + '\n'
        + `${ctx.context.before.join('\n')}\n`
        + `${ctx.currentLine.text}\n`
        + `${ctx.context.after.join('\n')}`,
        'save',
        {
          workspaceFolder: ctx.file.workspaceFolder,
          filePath: ctx.file.path,
          languageId: ctx.file.languageId,
          cursor: ctx.cursor,
        },
      )
    }),
  )

  params.eventListeners.push(
    window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor)
        return

      const ctx = await params.contextCollector.collect(editor)
      if (!ctx)
        return

      await params.client.replaceContext(
        ''
        + `User switched to file: ${ctx.file.fileName} (located at ${ctx.file.path}). Here is the context around the cursor after switching:\n`
        + '\n'
        + `${ctx.context.before.join('\n')}\n`
        + `${ctx.currentLine.text}\n`
        + `${ctx.context.after.join('\n')}`,
        'switch-file',
        {
          workspaceFolder: ctx.file.workspaceFolder,
          filePath: ctx.file.path,
          languageId: ctx.file.languageId,
          cursor: ctx.cursor,
        },
      )
    }),
  )

  if (params.sendInterval > 0) {
    startMonitoring(params)
  }
}

function unregisterListeners(params: { eventListeners: vscode.Disposable[], controlLoopInterval: IntervalHandle }) {
  params.eventListeners.forEach(listener => listener.dispose())
  params.eventListeners = []
  stopMonitoring({ controlLoopInterval: params.controlLoopInterval })
}

function startMonitoring(params: {
  contextCollector: ContextCollector
  client: Client
  controlLoopInterval: IntervalHandle
  isEnabled: boolean
}) {
  stopMonitoring({ controlLoopInterval: params.controlLoopInterval })

  params.controlLoopInterval.setInterval(async () => {
    if (!params.isEnabled)
      return

    const editor = window.activeTextEditor
    if (!editor)
      return

    const ctx = await params.contextCollector.collect(editor)
    if (!ctx)
      return

    await params.client.replaceContext(
      ''
      + `User opened file is: ${ctx.file.fileName} (located at ${ctx.file.path}), and current cursor is at line ${ctx.cursor.line + 1}, character ${ctx.cursor.character + 1}.\n`
      + '\n'
      + 'Here is the context around the cursor:\n'
      + '\n'
      + `${ctx.context.before.join('\n')}\n`
      + `${ctx.currentLine.text}\n`
      + `${ctx.context.after.join('\n')}`,
      'heartbeat',
      {
        workspaceFolder: ctx.file.workspaceFolder,
        filePath: ctx.file.path,
        languageId: ctx.file.languageId,
        cursor: ctx.cursor,
      },
    )
  })
}

function stopMonitoring(params: { controlLoopInterval: IntervalHandle }) {
  params.controlLoopInterval.clearInterval()
}

/**
 * Deactivate the plugin
 */
export async function deactivate() {
  const { client } = await injeca.resolve({ client: { key: 'proj-airi:client' } as unknown as ProvidedBy<Client> })
  const { eventListeners } = await injeca.resolve({ eventListeners: { key: 'self:event-listeners' } as unknown as ProvidedBy<vscode.Disposable[]> })
  const { controlLoopInterval } = await injeca.resolve({ controlLoopInterval: { key: 'self:control-loop:interval:send' } as unknown as ProvidedBy<IntervalHandle> })

  unregisterListeners({ eventListeners, controlLoopInterval })
  client?.disconnect()
  useLogger().log('AIRI deactivated')
}
