import type { BlackboardEvent, ClientCommand, LLMTraceEvent, LogEvent, QueueEvent, ReflexStateEvent, SaliencyEvent, ServerEvent, TraceEvent } from './types'

import { DebugServer } from './server'

type CommandHandler = (command: ClientCommand) => void

/**
 * DebugService - Public API for application code to emit debug events
 *
 * This is a singleton that wraps the DebugServer and provides
 * a convenient API for emitting events and handling commands.
 */
export class DebugService {
  private static instance: DebugService
  private server: DebugServer

  private constructor() {
    this.server = new DebugServer()
  }

  public static getInstance(): DebugService {
    if (!DebugService.instance) {
      DebugService.instance = new DebugService()
    }
    return DebugService.instance
  }

  /**
   * Start the debug server
   */
  public start(port = 3000): void {
    this.server.start(port)
  }

  /**
   * Stop the debug server
   */
  public stop(): void {
    this.server.stop()
  }

  // ============================================================
  // Convenience methods for common event types
  // ============================================================

  /**
   * Emit a log event
   */
  public log(level: LogEvent['level'], message: string, fields?: Record<string, unknown>): void {
    const event: ServerEvent = {
      type: 'log',
      payload: {
        level,
        message,
        fields,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  /**
   * Emit an LLM trace event
   */
  public traceLLM(trace: Omit<LLMTraceEvent, 'timestamp'>): void {
    const event: ServerEvent = {
      type: 'llm',
      payload: {
        ...trace,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a blackboard state update
   */
  public updateBlackboard(state: BlackboardEvent['state'] | { goal?: string, thought?: string, strategy?: string }): void {
    const event: ServerEvent = {
      type: 'blackboard',
      payload: {
        state,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a queue state update
   */
  public updateQueue(queue: QueueEvent['queue'], processing?: QueueEvent['processing']): void {
    const event: ServerEvent = {
      type: 'queue',
      payload: {
        queue,
        processing,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a saliency snapshot
   */
  public emitSaliency(
    slot: number,
    counters: SaliencyEvent['counters'],
  ): void {
    const event: ServerEvent = {
      type: 'saliency',
      payload: {
        slot,
        counters,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a single trace event from the EventBus
   */
  public emitTrace(trace: TraceEvent): void {
    const event: ServerEvent = {
      type: 'trace',
      payload: trace,
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a batch of trace events (more efficient for high-frequency events)
   */
  public emitTraceBatch(traces: TraceEvent[]): void {
    if (traces.length === 0)
      return

    const event: ServerEvent = {
      type: 'trace_batch',
      payload: {
        events: traces,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a reflex state update
   */
  public emitReflexState(state: Omit<ReflexStateEvent, 'timestamp'>): void {
    const event: ServerEvent = {
      type: 'reflex',
      payload: {
        ...state,
        timestamp: Date.now(),
      },
    }
    this.server.broadcast(event)
  }

  // ============================================================
  // Generic emit for custom events
  // ============================================================

  /**
   * Emit a raw event (for backwards compatibility and custom events)
   */
  public emit(type: string, payload: unknown): void {
    // Map to strongly-typed events where possible
    switch (type) {
      case 'log':
        this.server.broadcast({ type: 'log', payload: payload as LogEvent })
        break
      case 'llm':
        this.server.broadcast({ type: 'llm', payload: payload as LLMTraceEvent })
        break
      case 'blackboard':
        this.server.broadcast({ type: 'blackboard', payload: payload as BlackboardEvent })
        break
      case 'queue':
        this.server.broadcast({ type: 'queue', payload: payload as QueueEvent })
        break
      case 'saliency': {
        // Transform the saliency data to match expected format
        const data = payload as { slot?: number, counters?: SaliencyEvent['counters'] }
        this.server.broadcast({
          type: 'saliency',
          payload: {
            slot: data.slot || 0,
            counters: data.counters || [],
            timestamp: Date.now(),
          },
        })
        break
      }
      case 'reflex':
        this.emitReflexState(payload as Omit<ReflexStateEvent, 'timestamp'>)
        break
      default:
        // For unknown types, emit as log
        this.log('DEBUG', `Unknown event type: ${type}`, { payload })
    }
  }

  // ============================================================
  // Command handling
  // ============================================================

  /**
   * Register a handler for client commands
   * Returns an unsubscribe function
   */
  public onCommand(type: string, handler: CommandHandler): () => void {
    return this.server.onCommand(type, handler)
  }
}
