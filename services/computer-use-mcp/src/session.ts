import type {
  ComputerUseConfig,
  LastScreenshotInfo,
  PendingActionRecord,
  ScreenshotArtifact,
  SessionTraceEntry,
  TerminalState,
} from './types'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'

export class ComputerUseSession {
  private initialized = false
  private pendingActions = new Map<string, PendingActionRecord>()
  private traceEntries: SessionTraceEntry[] = []
  private pointerPosition?: { x: number, y: number }
  private operationsExecuted = 0
  private operationUnitsConsumed = 0
  private lastScreenshot?: LastScreenshotInfo
  private terminalState: TerminalState

  constructor(private readonly config: ComputerUseConfig) {
    this.terminalState = {
      effectiveCwd: process.cwd(),
    }
  }

  async init() {
    if (this.initialized)
      return

    await mkdir(this.config.sessionRoot, { recursive: true })
    await mkdir(this.config.screenshotsDir, { recursive: true })
    this.initialized = true
  }

  getSnapshot() {
    return {
      operationsExecuted: this.operationsExecuted,
      operationUnitsConsumed: this.operationUnitsConsumed,
      pendingActions: this.pendingActions.size,
      pointerPosition: this.pointerPosition,
      lastScreenshot: this.lastScreenshot,
      auditLogPath: this.config.auditLogPath,
      screenshotsDir: this.config.screenshotsDir,
      terminalState: this.terminalState,
    }
  }

  getPointerPosition() {
    return this.pointerPosition
  }

  setPointerPosition(point: { x: number, y: number }) {
    this.pointerPosition = point
  }

  setLastScreenshot(screenshot: ScreenshotArtifact) {
    this.lastScreenshot = {
      path: screenshot.path,
      width: screenshot.width,
      height: screenshot.height,
      capturedAt: screenshot.capturedAt,
      placeholder: screenshot.placeholder ?? false,
      note: screenshot.note,
      executionTargetMode: screenshot.executionTargetMode,
      sourceHostName: screenshot.sourceHostName,
      sourceDisplayId: screenshot.sourceDisplayId,
      sourceSessionTag: screenshot.sourceSessionTag,
    }
  }

  getLastScreenshot() {
    return this.lastScreenshot
  }

  consumeOperation(units: number) {
    this.operationsExecuted += 1
    this.operationUnitsConsumed += units
  }

  getBudgetState() {
    return {
      operationsExecuted: this.operationsExecuted,
      operationUnitsConsumed: this.operationUnitsConsumed,
    }
  }

  createPendingAction(record: Omit<PendingActionRecord, 'id' | 'createdAt'>) {
    if (this.pendingActions.size >= this.config.maxPendingActions) {
      throw new Error(`too many pending actions: ${this.config.maxPendingActions}`)
    }

    const pending: PendingActionRecord = {
      ...record,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }
    this.pendingActions.set(pending.id, pending)
    return pending
  }

  getPendingAction(id: string) {
    return this.pendingActions.get(id)
  }

  listPendingActions() {
    return [...this.pendingActions.values()]
  }

  removePendingAction(id: string) {
    this.pendingActions.delete(id)
  }

  setTerminalState(nextState: TerminalState) {
    this.terminalState = { ...nextState }
  }

  getTerminalState() {
    return { ...this.terminalState }
  }

  async record(entry: Omit<SessionTraceEntry, 'id' | 'at'>) {
    const fullEntry: SessionTraceEntry = {
      ...entry,
      id: randomUUID(),
      at: new Date().toISOString(),
    }

    this.traceEntries.push(fullEntry)
    if (this.traceEntries.length > 500) {
      this.traceEntries.splice(0, this.traceEntries.length - 500)
    }

    await appendFile(this.config.auditLogPath, `${JSON.stringify(fullEntry)}\n`, 'utf-8')

    return fullEntry
  }

  getRecentTrace(limit = 50) {
    return this.traceEntries.slice(-Math.max(limit, 1))
  }
}
