import type { BrowserWindow } from 'electron'

import { useLogg } from '@guiiai/logg'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { createPeerContext } from '@moeru/eventa/adapters/websocket/h3'
import {
  ACP_BRIDGE_PORT,
  ACP_BRIDGE_URL,
  ACP_CLIENT_DISCONNECTED,
  acpBridgeCallTool,
  AcpBridgeCallToolSchema,
  acpBridgeCancel,
  acpBridgeCloseSession,
  acpBridgeLoadSession,
  AcpBridgeLoadSessionSchema,
  acpBridgeOpenSession,
  AcpBridgeOpenSessionSchema,
  acpBridgePrompt,
  AcpBridgePromptSchema,
  acpBridgePublish,
  AcpBridgePublishSchema,
  AcpBridgeSessionSchema,
  AIRI_DESKTOP_NOT_STARTED,
} from '@proj-airi/acp-server/bridge'
import { plugin as ws } from 'crossws/server'
import { BrowserWindow as ElectronBrowserWindow, ipcMain } from 'electron'
import { defineWebSocketHandler, H3, serve } from 'h3'

import * as v from 'valibot'

import {
  electronAcpCallTool,
  electronAcpCancel,
  electronAcpCloseSession,
  electronAcpDisconnected,
  electronAcpLeaderChannel,
  electronAcpListSessions,
  electronAcpLoadSession,
  electronAcpOpenSession,
  electronAcpPrompt,
  electronAcpPublish,
} from '../../../../shared/eventa'

type LeaderContext = ReturnType<typeof createContext>['context']
type PeerContext = ReturnType<typeof createPeerContext>['context']
type PeerHooks = ReturnType<typeof createPeerContext>['hooks']

interface AcpPeerLink {
  context: PeerContext
  hooks: PeerHooks
  sessionIds: Set<string>
}

const log = useLogg('acp-bridge').useGlobalConfig()

/**
 * Opens the localhost Eventa WebSocket that the ACP process calls.
 *
 * The Pinia leader renderer owns chat send. This process forwards each ACP
 * request to that window.
 */
export async function setupAcpBridge() {
  const peers = new Map<string, AcpPeerLink>()
  const sessions = new Map<string, AcpPeerLink>()
  let leaderContext: LeaderContext | undefined
  let leaderDispose: (() => void) | undefined
  let leaderWebContentsId: number | undefined

  function bindLeader(window: BrowserWindow) {
    if (leaderWebContentsId === window.webContents.id && leaderContext)
      return
    leaderDispose?.()
    const created = createContext(ipcMain, window, { onlySameWindow: true })
    leaderContext = created.context
    leaderDispose = created.dispose
    leaderWebContentsId = window.webContents.id

    defineInvokeHandler(created.context, electronAcpListSessions, () => ({
      chatSessionIds: [...sessions.keys()],
    }))
    defineInvokeHandler(created.context, electronAcpPublish, async (body) => {
      const parsed = v.parse(AcpBridgePublishSchema, body)
      const link = sessions.get(parsed.chatSessionId)
      if (!link)
        throw new Error(ACP_CLIENT_DISCONNECTED)
      return defineInvoke(link.context, acpBridgePublish)(parsed)
    })
    defineInvokeHandler(created.context, electronAcpCallTool, async (body) => {
      const parsed = v.parse(AcpBridgeCallToolSchema, body)
      const link = sessions.get(parsed.chatSessionId)
      if (!link)
        throw new Error(ACP_CLIENT_DISCONNECTED)
      return defineInvoke(link.context, acpBridgeCallTool)(parsed)
    })
  }

  ipcMain.handle(electronAcpLeaderChannel, (event) => {
    const window = ElectronBrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed())
      return
    bindLeader(window)
  })

  async function callLeader<Result>(invoke: (context: LeaderContext) => Promise<Result>) {
    const context = leaderContext
    if (!context)
      throw new Error(AIRI_DESKTOP_NOT_STARTED)
    return invoke(context)
  }

  function registerPeer(link: AcpPeerLink) {
    defineInvokeHandler(link.context, acpBridgeOpenSession, async (body) => {
      const parsed = v.parse(AcpBridgeOpenSessionSchema, body)
      const opened = await callLeader(context => defineInvoke(context, electronAcpOpenSession)(parsed))
      link.sessionIds.add(opened.chatSessionId)
      sessions.set(opened.chatSessionId, link)
      return opened
    })
    defineInvokeHandler(link.context, acpBridgeLoadSession, async (body) => {
      const parsed = v.parse(AcpBridgeLoadSessionSchema, body)
      if (sessions.has(parsed.chatSessionId))
        throw new Error('ACP session is already connected')
      const loaded = await callLeader(context => defineInvoke(context, electronAcpLoadSession)(parsed))
      link.sessionIds.add(parsed.chatSessionId)
      sessions.set(parsed.chatSessionId, link)
      return loaded
    })
    defineInvokeHandler(link.context, acpBridgePrompt, async (body) => {
      const parsed = v.parse(AcpBridgePromptSchema, body)
      return callLeader(context => defineInvoke(context, electronAcpPrompt)(parsed))
    })
    defineInvokeHandler(link.context, acpBridgeCloseSession, async (body) => {
      const parsed = v.parse(AcpBridgeSessionSchema, body)
      sessions.delete(parsed.chatSessionId)
      link.sessionIds.delete(parsed.chatSessionId)
      return callLeader(context => defineInvoke(context, electronAcpCloseSession)(parsed))
    })
    defineInvokeHandler(link.context, acpBridgeCancel, async (body) => {
      const parsed = v.parse(AcpBridgeSessionSchema, body)
      return callLeader(context => defineInvoke(context, electronAcpCancel)(parsed))
    })
  }

  async function disconnectPeer(link: AcpPeerLink) {
    for (const chatSessionId of link.sessionIds) {
      sessions.delete(chatSessionId)
      link.sessionIds.delete(chatSessionId)
      const context = leaderContext
      if (!context)
        continue
      await defineInvoke(context, electronAcpDisconnected)({ chatSessionId }).catch((error) => {
        log.withError(error).warn('failed to mark an ACP chat disconnected')
      })
    }
  }

  const appServer = new H3()
  appServer.get('/acp', defineWebSocketHandler({
    open: (peer) => {
      // NOTICE:
      // The h3 peer is not assignable to Eventa's peer argument.
      // Eventa bundles a second crossws Peer class, so the private fields differ.
      // @moeru/eventa adapters/websocket/h3 and the crossws copy in this app.
      // Remove the casts when Eventa uses the same crossws types as this app.
      const created = createPeerContext(peer as never)
      const link: AcpPeerLink = {
        context: created.context,
        hooks: created.hooks,
        sessionIds: new Set(),
      }
      peers.set(peer.id, link)
      registerPeer(link)
    },
    message: (peer, message) => {
      peers.get(peer.id)?.hooks.message(peer as never, message as never)
    },
    close: (peer, details) => {
      const link = peers.get(peer.id)
      if (!link)
        return
      link.hooks.close(peer as never, details)
      peers.delete(peer.id)
      void disconnectPeer(link)
    },
    error: (peer, error) => {
      peers.get(peer.id)?.hooks.error(peer as never, error)
    },
  }))

  const server = serve(appServer, {
    gracefulShutdown: {
      forceTimeout: 0.25,
      gracefulTimeout: 0.25,
    },
    hostname: '127.0.0.1',
    manual: true,
    // @ts-expect-error - h3 does not extend the crossws response type.
    plugins: [ws({ resolve: async req => (await appServer.fetch(req)).crossws })],
    port: ACP_BRIDGE_PORT,
    reusePort: false,
    silent: true,
  })

  try {
    await server.serve()
    log.withFields({ url: ACP_BRIDGE_URL }).log('ACP bridge listening')
  }
  catch (error) {
    log.withError(error).warn('ACP bridge did not start')
  }

  return {
    dispose: () => {
      leaderDispose?.()
      void server.close()
    },
  }
}
