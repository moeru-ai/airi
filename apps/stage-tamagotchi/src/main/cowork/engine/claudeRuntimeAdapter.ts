import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'

import type { CoworkRunner } from '../coworkRunner'
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
} from './types'

import { EventEmitter } from 'node:events'

export class ClaudeRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  private readonly runner: CoworkRunner

  constructor(runner: CoworkRunner) {
    super()
    this.runner = runner
    this.bindRunnerEvents()
  }

  override on<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.on(event, listener)
  }

  override off<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.off(event, listener)
  }

  async startSession(sessionId: string, prompt: string, options: CoworkStartOptions = {}): Promise<void> {
    await this.runner.startSession(sessionId, prompt, options)
  }

  async continueSession(sessionId: string, prompt: string, options: CoworkContinueOptions = {}): Promise<void> {
    await this.runner.continueSession(sessionId, prompt, options)
  }

  stopSession(sessionId: string): void {
    this.runner.stopSession(sessionId)
  }

  stopAllSessions(): void {
    this.runner.stopAllSessions()
  }

  respondToPermission(requestId: string, result: PermissionResult): void {
    this.runner.respondToPermission(requestId, result)
  }

  isSessionActive(sessionId: string): boolean {
    return this.runner.isSessionActive(sessionId)
  }

  getSessionConfirmationMode(sessionId: string): 'modal' | 'text' | null {
    return this.runner.getSessionConfirmationMode(sessionId)
  }

  private bindRunnerEvents(): void {
    this.runner.on('message', (sessionId, message) => {
      this.emit('message', sessionId, message)
    })
    this.runner.on('messageUpdate', (sessionId, messageId, content) => {
      this.emit('messageUpdate', sessionId, messageId, content)
    })
    this.runner.on('permissionRequest', (sessionId, request) => {
      this.emit('permissionRequest', sessionId, request)
    })
    this.runner.on('complete', (sessionId, claudeSessionId) => {
      this.emit('complete', sessionId, claudeSessionId)
    })
    this.runner.on('error', (sessionId, error) => {
      this.emit('error', sessionId, error)
    })
  }
}
