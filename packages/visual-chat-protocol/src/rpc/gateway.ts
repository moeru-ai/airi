import type { GatewayDiagnostics } from '../schemas/diagnostics'
import type { RoomCreateRequest } from '../schemas/room'
import type { SessionContext } from '../schemas/session'
import type { GatewayBootstrap, SessionAccess } from '../schemas/session-access'
import type { SourceSwitchRequest } from '../schemas/source'

export interface GatewayRpc {
  bootstrap: () => Promise<GatewayBootstrap>
  createSession: (req?: RoomCreateRequest) => Promise<SessionAccess>
  issueSessionAccess: (sessionId: string) => Promise<SessionAccess>
  listSessions: () => Promise<SessionContext[]>
  getSession: (sessionId: string) => Promise<SessionContext>
  getSessionRecord: (sessionId: string) => Promise<import('../schemas/session-record').SessionRecord>
  deleteSession: (sessionId: string) => Promise<{ ok: boolean }>
  switchSource: (sessionId: string, req: SourceSwitchRequest) => Promise<SessionContext>
  getRoomToken: (
    roomName: string,
    body: { name?: string, identity?: string },
  ) => Promise<{ token: string, roomName: string, sessionId?: string }>
  getDiagnostics: () => Promise<GatewayDiagnostics>
  health: () => Promise<boolean>
}
