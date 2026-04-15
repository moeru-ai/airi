// src/airi-client.ts
// ─────────────────────────────────────────────────────────────
// AIRI Server SDK 客户端封装
//
// 功能：创建并管理与 AIRI 主程序的 WebSocket 连接。
// 设计依据：
//   - 通过 @proj-airi/server-sdk 的 Client（内部称 ServerChannel）
//     连接 AIRI server，以 WebSocket 双向收发事件。
//   - 模块只负责连接管理，业务逻辑由 ProcessStage 处理。
// ─────────────────────────────────────────────────────────────

import { Client as AiriChannel, ContextUpdateStrategy } from '@proj-airi/server-sdk'

import { createLogger } from './utils/logger'

export { ContextUpdateStrategy }

export type AiriClient = ReturnType<typeof createAiriClient>

/**
 * 创建 AIRI server 连接实例。
 *
 * @param url   - AIRI server WebSocket 地址，如 ws://localhost:6121/ws
 * @param token - 连接令牌（与 AIRI server 配置一致，可选）
 */
export function createAiriClient(url: string, token?: string): AiriChannel {
  const logger = createLogger('airi-client')

  const client = new AiriChannel({
    name: 'qq',
    possibleEvents: [
      'input:text',
      'module:configure',
      'output:gen-ai:chat:message',
    ],
    token: token ?? '',
    url,
    heartbeat: {
      readTimeout: 60_000,
      pingInterval: 20_000,
    },
  })

  client.onConnectionStateChange(({ previousStatus, status }) => {
    logger.info(`AIRI connection: ${previousStatus} → ${status}`)
  })

  // 延迟一帧等 ws 建立
  setTimeout(() => {
    const ws = (client as any).websocket
    if (ws) {
      logger.debug('[airi-client] Found raw ws, attaching listener')
      ws.addEventListener('message', (event: MessageEvent) => {
        logger.debug('[AIRI raw ws ←]', typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
      })
    }
    else {
      logger.warn('[airi-client] websocket is null/undefined')
    }
  }, 500)

  // 连接状态日志（AiriChannel 内部会自动重连）
  client.onEvent('module:configure', (event) => {
    logger.info('Received module:configure from AIRI server', event.data)
  })

  client.onEvent('output:gen-ai:chat:message', (event) => {
    logger.debug('[AIRI ← output:gen-ai:chat:message]', JSON.stringify(event))
  })

  // 连接状态变化日志
  client.onConnectionStateChange(({ previousStatus, status }) => {
    logger.info(`AIRI connection: ${previousStatus} → ${status}`)
  })

  logger.info(`AIRI client created, target: ${url}`)
  return client
}
