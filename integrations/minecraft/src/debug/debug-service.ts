import type {
  BlackboardEvent,
  BrainStateEvent,
  ClientCommand,
  ConversationUpdateEvent,
  LLMTraceEvent,
  LogEvent,
  QueueEvent,
  ReflexStateEvent,
  ReplExecutionResultEvent,
  ReplStateEvent,
  ServerEvent,
  TraceEvent,
} from './types'

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
   * Emit a raw event (for backwards compatibility and custom events)
   */
  public emit(type: string, payload: unknown): void {
    // Map to strongly-typed events where possible
    switch (type) {
      case 'blackboard':
        this.server.broadcast({ payload: payload as BlackboardEvent, type: 'blackboard' })
        break
      case 'conversation_update':
        this.emitConversationUpdate(payload as Omit<ConversationUpdateEvent, 'timestamp'>)
        break
      case 'debug:repl_result':
        this.server.broadcast({
          payload: payload as ReplExecutionResultEvent,
          type: 'debug:repl_result',
        })
        break
      case 'debug:repl_state':
        this.server.broadcast({
          payload: payload as ReplStateEvent,
          type: 'debug:repl_state',
        })
        break
      case 'debug:tool_result':
        this.server.broadcast({
          payload: payload as any,
          type: 'debug:tool_result',
        })
        break
      case 'debug:tools_list':
        this.server.broadcast({
          payload: payload as { tools: any[] },
          type: 'debug:tools_list',
        })
        break
      case 'llm':
        this.server.broadcast({ payload: payload as LLMTraceEvent, type: 'llm' })
        break
      case 'log':
        this.server.broadcast({ payload: payload as LogEvent, type: 'log' })
        break
      case 'queue':
        this.server.broadcast({ payload: payload as QueueEvent, type: 'queue' })
        break
      case 'reflex':
        this.emitReflexState(payload as Omit<ReflexStateEvent, 'timestamp'>)
        break
      default:
        // For unknown types, emit as log
        this.log('DEBUG', `Unknown event type: ${type}`, { payload })
    }
  }

  /**
   * Emit a brain state update
   */
  public emitBrainState(state: Omit<BrainStateEvent, 'timestamp'>): void {
    const event: ServerEvent = {
      payload: {
        ...state,
        timestamp: Date.now(),
      },
      type: 'brain_state',
    }
    this.server.broadcast(event)
  }

  // ============================================================
  // Convenience methods for common event types
  // ============================================================

  /**
   * Emit a conversation state update
   */
  public emitConversationUpdate(state: Omit<ConversationUpdateEvent, 'timestamp'>): void {
    const event: ServerEvent = {
      payload: {
        ...state,
        timestamp: Date.now(),
      },
      type: 'conversation_update',
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a reflex state update
   */
  public emitReflexState(state: Omit<ReflexStateEvent, 'timestamp'>): void {
    const event: ServerEvent = {
      payload: {
        ...state,
        timestamp: Date.now(),
      },
      type: 'reflex',
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a single trace event from the EventBus
   */
  public emitTrace(trace: TraceEvent): void {
    const event: ServerEvent = {
      payload: trace,
      type: 'trace',
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
      payload: {
        events: traces,
        timestamp: Date.now(),
      },
      type: 'trace_batch',
    }
    this.server.broadcast(event)
  }

  /**
   * Emit a log event
   */
  public log(level: LogEvent['level'], message: string, fields?: Record<string, unknown>): void {
    const event: ServerEvent = {
      payload: {
        fields,
        level,
        message,
        timestamp: Date.now(),
      },
      type: 'log',
    }
    this.server.broadcast(event)
  }

  /**
   * Register a handler for client commands
   * Returns an unsubscribe function
   */
  public onCommand(type: string, handler: CommandHandler): () => void {
    return this.server.onCommand(type, handler)
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
  // Generic emit for custom events
  // ============================================================

  /**
   * Emit an LLM trace event
   */
  public traceLLM(trace: Omit<LLMTraceEvent, 'timestamp'>): void {
    const event: ServerEvent = {
      payload: {
        ...trace,
        timestamp: Date.now(),
      },
      type: 'llm',
    }
    this.server.broadcast(event)
  }

  // ============================================================
  // Command handling
  // ============================================================

  /**
   * Emit a queue state update
   */
  public updateQueue(queue: QueueEvent['queue'], processing?: QueueEvent['processing']): void {
    const event: ServerEvent = {
      payload: {
        processing,
        queue,
        timestamp: Date.now(),
      },
      type: 'queue',
    }
    this.server.broadcast(event)
  }
}
