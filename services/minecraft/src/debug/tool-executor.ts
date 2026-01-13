import type { ZodObject, ZodType } from 'zod'

import type { Mineflayer } from '../libs/mineflayer'
import type { ToolDefinition, ToolParameter } from './types'

import { actionsList } from '../agents/action/tools'
import { DebugService } from './debug-service'

export class ToolExecutor {
  private mineflayer: Mineflayer
  private debugService: DebugService

  constructor(mineflayer: Mineflayer) {
    this.mineflayer = mineflayer
    this.debugService = DebugService.getInstance()
    console.log('[ToolExecutor] Initializing ToolExecutor')
    this.setupHandlers()
  }

  private setupHandlers(): void {
    console.log('[ToolExecutor] Key registered for request_tools')

    // Handle tool list request
    this.debugService.onCommand('request_tools', () => {
      console.log('[ToolExecutor] Received request_tools command')
      this.sendToolsList()
    })

    // Handle tool execution
    this.debugService.onCommand('execute_tool', (cmd) => {
      if (cmd.type === 'execute_tool') {
        console.log(`[ToolExecutor] Executing tool: ${cmd.payload.toolName}`)
        this.executeTool(cmd.payload.toolName, cmd.payload.params)
      }
    })
  }

  private sendToolsList(): void {
    try {
      const tools = this.extractToolDefinitions()
      console.log(`[ToolExecutor] Sending ${tools.length} tools`)
      this.debugService.emit('debug:tools_list', { tools })
    }
    catch (err) {
      console.error('[ToolExecutor] Error sending tool list:', err)
    }
  }

  private async executeTool(toolName: string, params: Record<string, unknown>): Promise<void> {
    try {
      // Check if action is blocked
      // TODO: Add check for running agent if needed

      const action = actionsList.find(a => a.name === toolName)
      if (!action) {
        throw new Error(`Tool '${toolName}' not found`)
      }

      // Validate params
      const validated = action.schema.parse(params)

      // Execute
      // The perform function in existing tools often returns a function that returns a Promise (or value)
      // perform: (mineflayer) => async (args) => result
      const performer = action.perform(this.mineflayer)

      const args: any[] = []
      const shape = (action.schema as any).shape
      for (const key in shape) {
        if (Object.prototype.hasOwnProperty.call(validated, key)) {
          args.push((validated as any)[key])
        }
      }

      const result = await performer(...args)

      this.debugService.emit('debug:tool_result', {
        toolName,
        params,
        result: typeof result === 'string' ? result : JSON.stringify(result),
        timestamp: Date.now(),
      })
    }
    catch (err: unknown) {
      this.debugService.emit('debug:tool_result', {
        toolName,
        params,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      })
    }
  }

  private extractToolDefinitions(): ToolDefinition[] {
    return actionsList.map(action => ({
      name: action.name,
      description: action.description,
      params: this.extractParamsFromSchema(action.schema),
    }))
  }

  private extractParamsFromSchema(schema: ZodObject<any>): ToolParameter[] {
    if (!schema || !schema.shape)
      return []

    const shape = schema.shape
    const params: ToolParameter[] = []

    for (const [name, zodType] of Object.entries(shape)) {
      const def = this.getZodDef(zodType as ZodType<any>)

      params.push({
        name,
        type: def.typeName,
        description: def.description,
        min: def.min,
        max: def.max,
        default: def.defaultValue,
      })
    }

    return params
  }

  // Helper to extract metadata from Zod types
  private getZodDef(zodType: ZodType<any>): { typeName: 'string' | 'number' | 'boolean', description?: string, min?: number, max?: number, defaultValue?: any } {
    let typeName: 'string' | 'number' | 'boolean' = 'string'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let curr: any = zodType
    const description = curr.description

    let min: number | undefined
    let max: number | undefined
    let defaultValue: any

    // Helper to get type identifier
    const getTypeId = (t: any) => t.constructor.name || t._def?.typeName

    // Unwrap effects/optional/nullable/default to get inner type
    let infiniteLoopGuard = 0
    while (infiniteLoopGuard++ < 10) {
      const typeId = getTypeId(curr)
      if (typeId === 'ZodOptional' || typeId === 'ZodNullable') {
        curr = curr._def.innerType
      }
      else if (typeId === 'ZodEffects') {
        curr = curr._def.schema
      }
      else if (typeId === 'ZodDefault') {
        defaultValue = curr._def.defaultValue()
        curr = curr._def.innerType
      }
      else {
        break
      }
    }

    const typeId = getTypeId(curr)

    // Debug logging for type checking
    // console.log(`[ToolExecutor] Type check: ${description} -> ${typeId}`)

    if (typeId === 'ZodString') {
      typeName = 'string'
    }
    else if (typeId === 'ZodNumber') {
      typeName = 'number'
      // Try to extract min/max from checks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (curr._def.checks) {
        for (const check of (curr as any)._def.checks) {
          if (check.kind === 'min')
            min = check.value
          if (check.kind === 'max')
            max = check.value
        }
      }
    }
    else if (typeId === 'ZodBoolean') {
      typeName = 'boolean'
    }

    return { typeName, description, min, max, defaultValue }
  }
}

export function setupToolExecutor(mineflayer: Mineflayer): ToolExecutor {
  return new ToolExecutor(mineflayer)
}
