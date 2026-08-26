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
  private lastScreenshot?: LastScreenshotInfo
  private operationsExecuted = 0
  private operationUnitsConsumed = 0
  private pendingActions = new Map<string, PendingActionRecord>()
  private pointerPosition?: { x: number, y: number }
  private terminalState: TerminalState
  private traceEntries: SessionTraceEntry[] = []

  constructor(private readonly config: ComputerUseConfig) {
    this.terminalState = {
      effectiveCwd: process.cwd(),
    }
  }

  consumeOperation(units: number) {
    this.operationsExecuted += 1
    this.operationUnitsConsumed += units
  }

  createPendingAction(record: Omit<PendingActionRecord, 'createdAt' | 'id'>) {
    if (this.pendingActions.size >= this.config.maxPendingActions) {
      throw new Error(`too many pending actions: ${this.config.maxPendingActions}`)
    }

    const pending: PendingActionRecord = {
      ...record,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
    }
    this.pendingActions.set(pending.id, pending)
    return pending
  }

  getBudgetState() {
    return {
      operationsExecuted: this.operationsExecuted,
      operationUnitsConsumed: this.operationUnitsConsumed,
    }
  }

  getLastScreenshot() {
    return this.lastScreenshot
  }

  getPendingAction(id: string) {
    return this.pendingActions.get(id)
  }

  getPointerPosition() {
    return this.pointerPosition
  }

  getRecentTrace(limit = 50) {
    return this.traceEntries.slice(-Math.max(limit, 1))
  }

  getSnapshot() {
    return {
      auditLogPath: this.config.auditLogPath,
      lastScreenshot: this.lastScreenshot,
      operationsExecuted: this.operationsExecuted,
      operationUnitsConsumed: this.operationUnitsConsumed,
      pendingActions: this.pendingActions.size,
      pointerPosition: this.pointerPosition,
      screenshotsDir: this.config.screenshotsDir,
      terminalState: this.terminalState,
    }
  }

  getTerminalState() {
    return { ...this.terminalState }
  }

  async init() {
    if (this.initialized)
      return

    await mkdir(this.config.sessionRoot, { recursive: true })
    await mkdir(this.config.screenshotsDir, { recursive: true })
    this.initialized = true
  }

  listPendingActions() {
    return [...this.pendingActions.values()]
  }

  async record(entry: Omit<SessionTraceEntry, 'at' | 'id'>) {
    const fullEntry: SessionTraceEntry = {
      ...entry,
      at: new Date().toISOString(),
      id: randomUUID(),
    }

    this.traceEntries.push(fullEntry)
    if (this.traceEntries.length > 500) {
      this.traceEntries.splice(0, this.traceEntries.length - 500)
    }

    await appendFile(this.config.auditLogPath, `${JSON.stringify(fullEntry)}\n`, 'utf-8')

    return fullEntry
  }

  removePendingAction(id: string) {
    this.pendingActions.delete(id)
  }

  setLastScreenshot(screenshot: ScreenshotArtifact) {
    this.lastScreenshot = {
      capturedAt: screenshot.capturedAt,
      executionTargetMode: screenshot.executionTargetMode,
      height: screenshot.height,
      note: screenshot.note,
      path: screenshot.path,
      placeholder: screenshot.placeholder ?? false,
      sourceDisplayId: screenshot.sourceDisplayId,
      sourceHostName: screenshot.sourceHostName,
      sourceSessionTag: screenshot.sourceSessionTag,
      width: screenshot.width,
    }
  }

  setPointerPosition(point: { x: number, y: number }) {
    this.pointerPosition = point
  }

  setTerminalState(nextState: TerminalState) {
    this.terminalState = { ...nextState }
  }
}
