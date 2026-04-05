import type { SessionOrchestrator } from '../orchestrator'

export class SessionStore {
  private sessions = new Map<string, SessionOrchestrator>()
  private roomToSession = new Map<string, string>()

  add(orchestrator: SessionOrchestrator): void {
    this.sessions.set(orchestrator.sessionId, orchestrator)
    this.roomToSession.set(orchestrator.roomName, orchestrator.sessionId)
  }

  getBySessionId(sessionId: string): SessionOrchestrator | undefined {
    return this.sessions.get(sessionId)
  }

  getByRoom(roomName: string): SessionOrchestrator | undefined {
    const sessionId = this.roomToSession.get(roomName)
    if (sessionId)
      return this.sessions.get(sessionId)
    return undefined
  }

  remove(sessionId: string): void {
    const orchestrator = this.sessions.get(sessionId)
    if (orchestrator) {
      this.roomToSession.delete(orchestrator.roomName)
      orchestrator.dispose()
    }
    this.sessions.delete(sessionId)
  }

  getAll(): SessionOrchestrator[] {
    return [...this.sessions.values()]
  }

  listSessionIds(): string[] {
    return [...this.sessions.keys()]
  }

  get size(): number {
    return this.sessions.size
  }
}
