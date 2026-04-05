import type {
  GatewayBootstrap,
  GatewayDiagnostics,
  RoomCreateRequest,
  SessionAccess,
  SessionContext,
  SessionMessagesResponse,
  SessionRecord,
  SessionRecordsResponse,
} from '@proj-airi/visual-chat-protocol'

import {
  VISUAL_CHAT_GATEWAY_TOKEN_HEADER,
  VISUAL_CHAT_SESSION_TOKEN_HEADER,
} from '@proj-airi/visual-chat-protocol'

const TRAILING_SLASH_PATTERN = /\/$/

export interface GatewaySessionAccess {
  sessionId: string
  sessionToken: string
}

export interface GatewayClientOptions {
  baseUrl: string
  getGatewayToken?: () => string | null | undefined
  getSessionAccess?: () => GatewaySessionAccess | null | undefined
}

export class GatewayClient {
  private baseUrl: string
  private getGatewayToken: () => string | null | undefined
  private getSessionAccess: () => GatewaySessionAccess | null | undefined

  constructor(opts: GatewayClientOptions) {
    this.baseUrl = opts.baseUrl.replace(TRAILING_SLASH_PATTERN, '')
    this.getGatewayToken = opts.getGatewayToken ?? (() => undefined)
    this.getSessionAccess = opts.getSessionAccess ?? (() => undefined)
  }

  private buildHeaders(options: {
    includeJsonContentType?: boolean
    includeGatewayToken?: boolean
    includeSessionToken?: boolean
    sessionId?: string
  } = {}): Headers {
    const headers = new Headers()
    if (options.includeJsonContentType)
      headers.set('Content-Type', 'application/json')

    if (options.includeGatewayToken) {
      const gatewayToken = this.getGatewayToken()?.trim()
      if (gatewayToken)
        headers.set(VISUAL_CHAT_GATEWAY_TOKEN_HEADER, gatewayToken)
    }

    if (options.includeSessionToken) {
      const sessionAccess = this.getSessionAccess()
      if (sessionAccess?.sessionToken) {
        const matchesSession = !options.sessionId || sessionAccess.sessionId === options.sessionId
        if (matchesSession)
          headers.set(VISUAL_CHAT_SESSION_TOKEN_HEADER, sessionAccess.sessionToken)
      }
    }

    return headers
  }

  async bootstrap(): Promise<GatewayBootstrap> {
    const res = await fetch(`${this.baseUrl}/api/bootstrap`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
      }),
    })
    if (!res.ok)
      throw new Error(`bootstrap failed: ${res.status}`)
    return res.json() as Promise<GatewayBootstrap>
  }

  async createSession(req?: RoomCreateRequest): Promise<SessionAccess> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: this.buildHeaders({
        includeJsonContentType: true,
        includeGatewayToken: true,
      }),
      body: JSON.stringify(req ?? {}),
    })
    if (!res.ok)
      throw new Error(`createSession failed: ${res.status}`)
    return res.json() as Promise<SessionAccess>
  }

  async issueSessionAccess(sessionId: string): Promise<SessionAccess> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/access`, {
      method: 'POST',
      headers: this.buildHeaders({
        includeGatewayToken: true,
      }),
    })
    if (!res.ok)
      throw new Error(`issueSessionAccess failed: ${res.status}`)
    return res.json() as Promise<SessionAccess>
  }

  async listSessions(): Promise<SessionContext[]> {
    const res = await fetch(`${this.baseUrl}/api/sessions`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
      }),
    })
    if (!res.ok)
      throw new Error(`listSessions failed: ${res.status}`)
    return res.json() as Promise<SessionContext[]>
  }

  async getSession(sessionId: string): Promise<SessionContext> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
        includeSessionToken: true,
        sessionId,
      }),
    })
    if (!res.ok)
      throw new Error(`getSession failed: ${res.status}`)
    return res.json() as Promise<SessionContext>
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessagesResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/messages`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
        includeSessionToken: true,
        sessionId,
      }),
    })
    if (!res.ok)
      throw new Error(`getSessionMessages failed: ${res.status}`)
    return res.json() as Promise<SessionMessagesResponse>
  }

  async getSessionRecord(sessionId: string): Promise<SessionRecord> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/record`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
        includeSessionToken: true,
        sessionId,
      }),
    })
    if (!res.ok)
      throw new Error(`getSessionRecord failed: ${res.status}`)
    return res.json() as Promise<SessionRecord>
  }

  async listSessionRecords(): Promise<SessionRecord[]> {
    const res = await fetch(`${this.baseUrl}/api/session-records`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
      }),
    })
    if (!res.ok)
      throw new Error(`listSessionRecords failed: ${res.status}`)
    const payload = await res.json() as SessionRecordsResponse
    return payload.records
  }

  async restoreSessionRecord(sessionId: string): Promise<SessionAccess> {
    const res = await fetch(`${this.baseUrl}/api/session-records/${sessionId}/restore`, {
      method: 'POST',
      headers: this.buildHeaders({
        includeGatewayToken: true,
      }),
    })
    if (!res.ok)
      throw new Error(`restoreSessionRecord failed: ${res.status}`)
    return res.json() as Promise<SessionAccess>
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this.buildHeaders({
        includeGatewayToken: true,
        includeSessionToken: true,
        sessionId,
      }),
    })
    if (!res.ok)
      throw new Error(`deleteSession failed: ${res.status}`)
  }

  async deleteSessionRecord(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/record`, {
      method: 'DELETE',
      headers: this.buildHeaders({
        includeGatewayToken: true,
        includeSessionToken: true,
        sessionId,
      }),
    })
    if (!res.ok)
      throw new Error(`deleteSessionRecord failed: ${res.status}`)
  }

  async switchSource(sessionId: string, sourceId?: string, sourceType?: string): Promise<SessionContext> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/switch-source`, {
      method: 'POST',
      headers: this.buildHeaders({
        includeJsonContentType: true,
        includeGatewayToken: true,
        includeSessionToken: true,
        sessionId,
      }),
      body: JSON.stringify({ sourceId, sourceType }),
    })
    if (!res.ok)
      throw new Error(`switchSource failed: ${res.status}`)
    return res.json() as Promise<SessionContext>
  }

  async getRoomToken(roomName: string, name: string, identity: string): Promise<{ token: string, roomName: string }> {
    const res = await fetch(`${this.baseUrl}/api/rooms/${roomName}/token`, {
      method: 'POST',
      headers: this.buildHeaders({
        includeJsonContentType: true,
        includeGatewayToken: true,
        includeSessionToken: true,
      }),
      body: JSON.stringify({ name, identity }),
    })
    if (!res.ok)
      throw new Error(`getRoomToken failed: ${res.status}`)
    return res.json() as Promise<{ token: string, roomName: string }>
  }

  async getDiagnostics(): Promise<GatewayDiagnostics> {
    const res = await fetch(`${this.baseUrl}/api/diagnostics`, {
      headers: this.buildHeaders({
        includeGatewayToken: true,
      }),
    })
    if (!res.ok)
      throw new Error(`getDiagnostics failed: ${res.status}`)
    return res.json() as Promise<GatewayDiagnostics>
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`)
      return res.ok
    }
    catch {
      return false
    }
  }
}
